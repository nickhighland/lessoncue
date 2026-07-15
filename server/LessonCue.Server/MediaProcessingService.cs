using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class MediaProcessingService(IServiceScopeFactory scopes, ILogger<MediaProcessingService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                var item = await db.MediaAssets.FirstOrDefaultAsync(x => x.ProcessingStatus == "pending", stoppingToken);
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
        var dataPath = Environment.GetEnvironmentVariable("LESSONCUE_DATA_PATH")
            ?? Path.Combine(AppContext.BaseDirectory, "data");
        var mediaRoot = Path.Combine(dataPath, "media", "originals");
        var fullPath = Path.GetFullPath(Path.Combine(mediaRoot, item.RelativePath));
        item.ProcessingStatus = "processing";
        await db.SaveChangesAsync(ct);
        try
        {
            if (item.SourceKind == "link") { item.ProcessingStatus = "ready"; await db.SaveChangesAsync(ct); return; }
            var extension = Path.GetExtension(fullPath).ToLowerInvariant();
            if (extension is ".pdf" or ".pptx")
            {
                item.OfflineEligible = false;
                item.ProcessingStatus = "ready";
                item.ProcessingError = "Slide decks remain in the media library for planning; export slides to images for TV playback.";
                await db.SaveChangesAsync(ct);
                return;
            }
            var json = await RunAsync("ffprobe", $"-v error -show_streams -show_format -of json \"{fullPath.Replace("\"", "\\\"")}\"", ct);
            using var document = JsonDocument.Parse(json);
            foreach (var stream in document.RootElement.GetProperty("streams").EnumerateArray())
            {
                var type = stream.TryGetProperty("codec_type", out var typeValue) ? typeValue.GetString() : null;
                var codec = stream.TryGetProperty("codec_name", out var codecValue) ? codecValue.GetString() : null;
                if (type == "video")
                {
                    item.VideoCodec = codec;
                    item.Width = stream.TryGetProperty("width", out var width) ? width.GetInt32() : null;
                    item.Height = stream.TryGetProperty("height", out var height) ? height.GetInt32() : null;
                }
                if (type == "audio") item.AudioCodec = codec;
            }
            if (document.RootElement.TryGetProperty("format", out var format) &&
                format.TryGetProperty("duration", out var duration) && double.TryParse(duration.GetString(),
                    System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var seconds))
                item.DurationMs = (long)(seconds * 1000);

            if (item.VideoCodec is not null)
            {
                var thumbnails = Path.Combine(dataPath, "media", "thumbnails");
                Directory.CreateDirectory(thumbnails);
                var relative = item.Id + ".jpg";
                var output = Path.Combine(thumbnails, relative);
                var seek = item.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ? "" : "-ss 0.1 ";
                await RunAsync("ffmpeg", $"-y {seek}-i \"{fullPath.Replace("\"", "\\\"")}\" -frames:v 1 -vf scale=640:-2:out_range=full -pix_fmt yuvj420p \"{output.Replace("\"", "\\\"")}\"", ct);
                item.ThumbnailPath = relative;
            }
            if (item.AudioCodec is not null)
            {
                var loudness = await RunAsync("ffmpeg", $"-hide_banner -nostats -i \"{fullPath.Replace("\"", "\\\"")}\" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -", ct);
                var match = Regex.Match(loudness, "\\\"input_i\\\"\\s*:\\s*\\\"(?<value>-?[0-9.]+)\\\"");
                if (match.Success && double.TryParse(match.Groups["value"].Value,
                    System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var lufs))
                    item.LoudnessLufs = lufs;
            }
            item.ProcessingStatus = "ready";
            item.ProcessingError = null;
            item.OfflineEligible = item.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ||
                item.VideoCodec is null || item.VideoCodec is "h264" or "hevc" or "vp9" or "av1";
        }
        catch (Exception ex)
        {
            item.ProcessingStatus = "failed";
            item.ProcessingError = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
            logger.LogWarning(ex, "Could not process {MediaFile}", item.FileName);
        }
        await db.SaveChangesAsync(ct);
    }

    private static async Task<string> RunAsync(string fileName, string arguments, CancellationToken ct)
    {
        using var process = new Process { StartInfo = new ProcessStartInfo(fileName, arguments)
        {
            RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true
        }};
        process.Start();
        var stdout = process.StandardOutput.ReadToEndAsync(ct);
        var stderr = process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        var output = await stdout;
        var errors = await stderr;
        if (process.ExitCode != 0) throw new InvalidOperationException(errors.Trim());
        return string.IsNullOrWhiteSpace(output) ? errors : output;
    }
}
