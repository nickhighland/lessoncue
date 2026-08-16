using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class MediaProcessingService(IServiceScopeFactory scopes, MediaStoragePaths paths,
    StorageService storage, HardwareAccelerationService hardware,
    ILogger<MediaProcessingService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                var item = await db.MediaAssets.FirstOrDefaultAsync(x => x.ProcessingStatus == "pending" ||
                    (x.ProcessingStatus == "ready" && x.CompatibilityStatus == "pending" && x.SourceKind != "link"),
                    stoppingToken);
                if (item is null) { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); continue; }
                await ProcessAsync(item, db, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception ex)
            {
                logger.LogError(ex, "Media processing loop failed");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task ProcessAsync(MediaAsset item, LessonCueDb db, CancellationToken ct)
    {
        var fullPath = Path.GetFullPath(Path.Combine(paths.Originals, item.RelativePath));
        item.ProcessingStatus = "processing";
        await db.SaveChangesAsync(ct);
        try
        {
            if (item.SourceKind == "link")
            {
                item.CompatibilityStatus = "not-needed";
                item.ProcessingStatus = "ready";
                await db.SaveChangesAsync(ct);
                return;
            }
            var extension = Path.GetExtension(fullPath).ToLowerInvariant();
            // FileName is the user-facing title and may intentionally omit or change
            // an extension (for example, generated presentation slides). RelativePath
            // is the immutable, server-controlled storage name and therefore the
            // authoritative type declaration for files that have already been admitted.
            MediaContentInspector.RequireValid(fullPath, item.RelativePath);
            if (MediaFormatCatalog.IsConvertibleDocument(extension))
            {
                item.OfflineEligible = false;
                item.CompatibilityStatus = "not-needed";
                item.ProcessingStatus = "ready";
                item.ProcessingError = "Use Convert to slides in the Media Library to make this document screen-ready.";
                await db.SaveChangesAsync(ct);
                return;
            }

            var json = await RunAsync("ffprobe", $"-v error -show_streams -show_format -of json \"{Escape(fullPath)}\"", ct);
            using var document = JsonDocument.Parse(json);
            string? pixelFormat = null;
            string? formatName = null;
            int? h264Level = null;
            foreach (var stream in document.RootElement.GetProperty("streams").EnumerateArray())
            {
                var type = stream.TryGetProperty("codec_type", out var typeValue) ? typeValue.GetString() : null;
                var codec = stream.TryGetProperty("codec_name", out var codecValue) ? codecValue.GetString() : null;
                if (type == "video")
                {
                    item.VideoCodec = codec;
                    item.Width = stream.TryGetProperty("width", out var width) ? width.GetInt32() : null;
                    item.Height = stream.TryGetProperty("height", out var height) ? height.GetInt32() : null;
                    pixelFormat = stream.TryGetProperty("pix_fmt", out var pixel) ? pixel.GetString() : null;
                    h264Level = stream.TryGetProperty("level", out var level) && level.TryGetInt32(out var parsedLevel) ? parsedLevel : null;
                }
                if (type == "audio" && item.AudioCodec is null) item.AudioCodec = codec;
            }
            if (document.RootElement.TryGetProperty("format", out var format))
            {
                formatName = format.TryGetProperty("format_name", out var formatValue) ? formatValue.GetString() : null;
                if (format.TryGetProperty("duration", out var duration) && double.TryParse(duration.GetString(),
                    NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds)) item.DurationMs = (long)(seconds * 1000);
            }
            var organization = await db.Organizations.AsNoTracking().OrderBy(item => item.Id).FirstAsync(ct);
            var uploadPolicy = UploadQuotaPolicy.Read(organization);
            if (!uploadPolicy.Allows(item.VideoCodec, item.AudioCodec))
            {
                var rejected = new List<string>();
                if (item.VideoCodec is not null && uploadPolicy.AllowedVideoCodecs.Count > 0 &&
                    !uploadPolicy.AllowedVideoCodecs.Contains(item.VideoCodec))
                    rejected.Add($"video codec {item.VideoCodec}");
                if (item.AudioCodec is not null && uploadPolicy.AllowedAudioCodecs.Count > 0 &&
                    !uploadPolicy.AllowedAudioCodecs.Contains(item.AudioCodec))
                    rejected.Add($"audio codec {item.AudioCodec}");
                throw new InvalidDataException(
                    $"The server upload policy does not allow {string.Join(" and ", rejected)}. Ask a Service Admin to change the codec policy or upload a converted file.");
            }

            var isVideo = IsVideo(extension, item.ContentType);
            var playbackPath = fullPath;
            if (isVideo)
            {
                var nativeEncoding = PlaybackCompatibility.HasUniversalEncoding(item.VideoCodec, item.AudioCodec,
                    pixelFormat, h264Level, item.Width, item.Height);
                var nativeContainer = PlaybackCompatibility.HasMp4Container(formatName);
                if (!nativeEncoding || !nativeContainer)
                {
                    item.CompatibilityStatus = "converting";
                    item.CompatibilityError = null;
                    await db.SaveChangesAsync(ct);
                    playbackPath = await CreateCompatibilityCopyAsync(item, db, fullPath, nativeEncoding, ct);
                }
                else
                {
                    item.CompatibilityStatus = "native";
                    item.CompatibilityError = null;
                    item.CompatibilityTranscodedAt = null;
                    item.CompatibilityTranscodeEngine = null;
                }
            }
            else item.CompatibilityStatus = "not-needed";

            if (item.VideoCodec is not null)
            {
                Directory.CreateDirectory(paths.Thumbnails);
                var relative = item.Id + ".jpg";
                var output = Path.Combine(paths.Thumbnails, relative);
                var seek = item.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ? "" : "-ss 0.1 ";
                await RunDerivativeAsync("ffmpeg", $"-nostdin -y {seek}-i \"{Escape(playbackPath)}\" -frames:v 1 -vf scale=640:-2:out_range=full -pix_fmt yuvj420p \"{Escape(output)}\"", item.FileName, ct);
                if (File.Exists(output)) item.ThumbnailPath = relative;
                if (item.DurationMs is > 0)
                {
                    var filmstripRelative = item.Id + "-filmstrip.jpg";
                    var filmstripOutput = Path.Combine(paths.Thumbnails, filmstripRelative);
                    var interval = Math.Max(.1, item.DurationMs.Value / 6000d).ToString("0.###", CultureInfo.InvariantCulture);
                    await RunDerivativeAsync("ffmpeg", $"-nostdin -y -i \"{Escape(playbackPath)}\" -vf \"fps=1/{interval},scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=6x1\" -frames:v 1 -q:v 3 \"{Escape(filmstripOutput)}\"", item.FileName, ct);
                    if (File.Exists(filmstripOutput)) item.FilmstripPath = filmstripRelative;
                }
            }
            if (item.AudioCodec is not null)
            {
                try
                {
                    var loudness = await RunAsync("ffmpeg", $"-nostdin -hide_banner -nostats -i \"{Escape(playbackPath)}\" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -", ct);
                    var match = Regex.Match(loudness, "\\\"input_i\\\"\\s*:\\s*\\\"(?<value>-?[0-9.]+)\\\"");
                    if (match.Success && double.TryParse(match.Groups["value"].Value,
                        NumberStyles.Float, CultureInfo.InvariantCulture, out var lufs)) item.LoudnessLufs = lufs;
                    Directory.CreateDirectory(paths.Thumbnails);
                    var waveformRelative = item.Id + "-waveform.png";
                    var waveformOutput = Path.Combine(paths.Thumbnails, waveformRelative);
                    await RunDerivativeAsync("ffmpeg", $"-nostdin -y -i \"{Escape(playbackPath)}\" -filter_complex \"aformat=channel_layouts=mono,showwavespic=s=1200x140:colors=#d89127\" -frames:v 1 \"{Escape(waveformOutput)}\"", item.FileName, ct);
                    if (File.Exists(waveformOutput)) item.WaveformPath = waveformRelative;
                }
                catch (Exception ex) { logger.LogWarning(ex, "Could not analyze audio for {MediaFile}", item.FileName); }
            }
            item.ProcessingStatus = "ready";
            item.ProcessingError = null;
            item.OfflineEligible = !isVideo || item.CompatibilityStatus is "native" or "ready";
        }
        catch (Exception ex)
        {
            item.ProcessingStatus = "failed";
            item.ProcessingError = Concise(ex.Message);
            if (item.CompatibilityStatus == "converting")
            {
                item.CompatibilityStatus = "failed";
                item.CompatibilityError = "LessonCue could not create a TV-compatible H.264/AAC copy. " + Concise(ex.Message, 700);
            }
            item.OfflineEligible = false;
            logger.LogWarning(ex, "Could not process {MediaFile}", item.FileName);
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task<string> CreateCompatibilityCopyAsync(MediaAsset item, LessonCueDb db, string source,
        bool remuxOnly, CancellationToken ct)
    {
        var workRoot = Path.Combine(paths.Temporary, $"compat-{Guid.NewGuid():N}");
        Directory.CreateDirectory(workRoot);
        var work = Path.Combine(workRoot, "output.mp4");
        try
        {
            if (remuxOnly)
            {
                await RunAsync("ffmpeg", $"-nostdin -hide_banner -loglevel error -nostats -y -i \"{Escape(source)}\" " +
                    $"-map 0:v:0 -map 0:a:0? -c copy -sn -dn -movflags +faststart \"{Escape(work)}\"", ct);
                await HardwareAccelerationService.ValidateMp4Async(work, ct);
                item.CompatibilityTranscodeEngine = "Remux";
            }
            else
            {
                const string filter = "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
                var ending = $"-c:a aac -b:a 192k -ar 48000 -ac 2 -sn -dn -movflags +faststart \"{Escape(work)}\"";
                var hardwareArgs = "-nostdin -hide_banner -loglevel error -nostats -y " +
                    $"{hardware.DeviceArguments} " +
                    $"-i \"{Escape(source)}\" -map 0:v:0 -map 0:a:0? " +
                    $"{hardware.BuildHardwareVideoArguments(filter, 20)} " +
                    $"-profile:v high -level:v 4.1 {ending}";
                var softwareArgs = $"-nostdin -hide_banner -loglevel error -nostats -y -i \"{Escape(source)}\" " +
                    $"-map 0:v:0 -map 0:a:0? -vf \"{filter}\" -c:v libx264 -preset medium -crf 20 " +
                    $"-profile:v high -level:v 4.1 -pix_fmt yuv420p -tag:v avc1 {ending}";
                var accelerationEnabled = await db.Organizations.AsNoTracking()
                    .OrderBy(item => item.Id).Select(x => x.HardwareAccelerationEnabled).FirstAsync(ct);
                var result = await hardware.RunTranscodeAsync(accelerationEnabled, hardwareArgs, softwareArgs, work, ct);
                item.CompatibilityTranscodeEngine = result.Engine;
            }
            var size = new FileInfo(work).Length;
            if (size == 0) throw new InvalidOperationException("FFmpeg created an empty compatibility copy.");
            if (await storage.EnsureAvailableAsync(db, size, ct) is null)
                throw new InvalidOperationException($"The TV-compatible copy needs {size} additional bytes, but the LessonCue storage allocation is full.");

            Directory.CreateDirectory(paths.Compatibility);
            var relative = $"{item.Id:N}-{Guid.NewGuid().ToString("N")[..8]}.mp4";
            var destination = Path.Combine(paths.Compatibility, relative);
            try { File.Move(work, destination); }
            catch (IOException) { File.Copy(work, destination); File.Delete(work); }
            await using var input = File.OpenRead(destination);
            item.CompatibilityPath = relative;
            item.CompatibilitySha256 = Convert.ToHexString(await SHA256.HashDataAsync(input, ct)).ToLowerInvariant();
            item.CompatibilitySizeBytes = size;
            item.CompatibilityStatus = "ready";
            item.CompatibilityError = null;
            item.CompatibilityTranscodedAt = DateTimeOffset.UtcNow;
            return destination;
        }
        finally
        {
            TryDelete(work);
            try { if (Directory.Exists(workRoot)) Directory.Delete(workRoot, true); } catch { }
        }
    }

    private static bool IsVideo(string extension, string contentType) =>
        MediaFormatCatalog.IsVideo(extension, contentType);

    private Task<string> RunAsync(string fileName, string arguments, CancellationToken ct)
    {
        Directory.CreateDirectory(paths.Thumbnails);
        Directory.CreateDirectory(paths.Compatibility);
        Directory.CreateDirectory(paths.Temporary);
        return ConstrainedProcessRunner.RunAsync(fileName,
            ConstrainedProcessRunner.SplitArguments(arguments),
            ConstrainedProcessOptions.Media([paths.Thumbnails, paths.Compatibility, paths.Temporary]),
            ct);
    }

    private async Task RunDerivativeAsync(string fileName, string arguments, string mediaName, CancellationToken ct)
    {
        try { await RunAsync(fileName, arguments, ct); }
        catch (Exception ex) { logger.LogWarning(ex, "Could not create timeline derivative for {MediaFile}", mediaName); }
    }

    private static string Escape(string value) => value.Replace("\"", "\\\"");
    private static string Concise(string value, int length = 900) => value.Length > length ? value[..length] : value;
    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }
}

public static class PlaybackCompatibility
{
    public static bool HasUniversalEncoding(string? videoCodec, string? audioCodec, string? pixelFormat,
        int? h264Level, int? width, int? height) =>
        videoCodec == "h264" && pixelFormat is "yuv420p" or "yuvj420p" &&
        audioCodec is null or "aac" && h264Level is null or <= 42 && width is null or <= 1920 && height is null or <= 1080;

    public static bool HasMp4Container(string? formatName) =>
        formatName?.Split(',').Contains("mp4", StringComparer.OrdinalIgnoreCase) == true;
}
