using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record AdaptiveTranscodeProfile(string Id, string Label, int Width, int Height,
    int VideoBitrateKbps, int AudioBitrateKbps, int Crf);

public static class AdaptiveTranscodeProfiles
{
    public const string Universal1080 = "h264-1080";
    public const string Balanced720 = "h264-720";
    public const string DataSaver480 = "h264-480";

    public static readonly IReadOnlyDictionary<string, AdaptiveTranscodeProfile> All =
        new[]
        {
            new AdaptiveTranscodeProfile(Balanced720, "Balanced 720p", 1280, 720, 4_000, 160, 22),
            new AdaptiveTranscodeProfile(DataSaver480, "Data saver 480p", 854, 480, 1_500, 128, 25)
        }.ToDictionary(x => x.Id, StringComparer.Ordinal);

    public static string SelectForScreen(Screen screen, MediaAsset media)
    {
        var h264 = Capability(screen.CodecCapabilitiesJson, "H.264", "AVC");
        var hevc = Capability(screen.CodecCapabilitiesJson, "H.265", "HEVC");
        if (h264 == false && hevc == true && media.VideoCodec is "hevc" or "h265") return "native";
        if (screen.NetworkQuality is "poor" or "offline" || screen.FreeBytes is > 0 and < 1_000_000_000)
            return DataSaver480;
        if (screen.NetworkQuality == "fair" || screen.FreeBytes is >= 1_000_000_000 and < 3_000_000_000)
            return Balanced720;
        return Universal1080;
    }

    private static bool? Capability(string json, params string[] names)
    {
        try
        {
            foreach (var item in JsonDocument.Parse(json).RootElement.EnumerateArray())
            {
                var codec = item.TryGetProperty("codec", out var value) ? value.GetString() ?? "" : "";
                if (names.Any(name => codec.Contains(name, StringComparison.OrdinalIgnoreCase)) &&
                    item.TryGetProperty("supported", out var supported)) return supported.GetBoolean();
            }
        }
        catch (JsonException) { }
        return null;
    }
}

public sealed class AdaptiveTranscodeService(IServiceScopeFactory scopes, MediaStoragePaths paths,
    StorageService storage, HardwareAccelerationService hardware, IHubContext<SyncHub> hub,
    ILogger<AdaptiveTranscodeService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                await EnqueueScheduledAsync(db, stoppingToken);
                var pending = await db.MediaTranscodeVariants.Include(x => x.MediaAsset)
                    .Where(x => x.Status == "pending").ToListAsync(stoppingToken);
                var variant = pending.OrderBy(x => x.QueuedAt).FirstOrDefault();
                if (variant is null) { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); continue; }
                await ProcessAsync(db, variant, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception ex)
            {
                logger.LogError(ex, "Adaptive transcode loop failed");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    public static async Task<MediaTranscodeVariant> QueueAsync(LessonCueDb db, MediaAsset media, string profile,
        CancellationToken ct = default)
    {
        if (!AdaptiveTranscodeProfiles.All.TryGetValue(profile, out var specification))
            throw new ArgumentException("Unknown adaptive transcode profile.", nameof(profile));
        var variant = await db.MediaTranscodeVariants.SingleOrDefaultAsync(x => x.MediaAssetId == media.Id && x.Profile == profile, ct);
        if (variant is null)
        {
            variant = new MediaTranscodeVariant { MediaAssetId = media.Id, Profile = profile,
                Width = specification.Width, Height = specification.Height, VideoBitrateKbps = specification.VideoBitrateKbps,
                SourceVersion = media.Version, Status = "pending", QueuedAt = DateTimeOffset.UtcNow };
            db.MediaTranscodeVariants.Add(variant);
        }
        else if (variant.SourceVersion != media.Version || variant.Status == "failed")
        {
            variant.SourceVersion = media.Version; variant.Status = "pending"; variant.Error = null;
            variant.TranscodeEngine = null;
            variant.QueuedAt = DateTimeOffset.UtcNow; variant.StartedAt = null; variant.CompletedAt = null;
        }
        return variant;
    }

    private async Task EnqueueScheduledAsync(LessonCueDb db, CancellationToken ct)
    {
        var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
        if (!organization.AdaptiveTranscodingEnabled) return;
        var screens = await db.Screens.AsNoTracking().Where(x => !x.Revoked && x.AssignedClassId != null).ToListAsync(ct);
        if (screens.Count == 0) return;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var cutoff = today.AddDays(Math.Clamp(organization.TranscodeLeadDays, 1, 30));
        var lessons = await db.Lessons.AsNoTracking().Include(x => x.Items).ThenInclude(x => x.MediaAsset)
            .Where(x => !x.Archived && x.Date >= today && x.Date <= cutoff).ToListAsync(ct);
        var changed = false;
        foreach (var screen in screens)
        foreach (var media in lessons.Where(x => x.ClassId == screen.AssignedClassId).SelectMany(x => x.Items)
            .Select(x => x.MediaAsset).Where(x => x is { ProcessingStatus: "ready", SourceKind: not "link" } &&
                x.VideoCodec != null).DistinctBy(x => x!.Id).Cast<MediaAsset>())
        {
            var profile = AdaptiveTranscodeProfiles.SelectForScreen(screen, media);
            if (!AdaptiveTranscodeProfiles.All.ContainsKey(profile)) continue;
            var existing = await db.MediaTranscodeVariants.AsNoTracking()
                .SingleOrDefaultAsync(x => x.MediaAssetId == media.Id && x.Profile == profile, ct);
            if (existing is not null && existing.SourceVersion == media.Version &&
                existing.Status is "ready" or "pending" or "converting" or "failed") continue;
            await QueueAsync(db, media, profile, ct); changed = true;
        }
        if (changed) await db.SaveChangesAsync(ct);
    }

    private async Task ProcessAsync(LessonCueDb db, MediaTranscodeVariant variant, CancellationToken ct)
    {
        var media = variant.MediaAsset;
        if (media is null || !AdaptiveTranscodeProfiles.All.TryGetValue(variant.Profile, out var profile))
        { variant.Status = "failed"; variant.Error = "Media or profile is unavailable."; await db.SaveChangesAsync(ct); return; }
        if (variant.SourceVersion != media.Version)
        { variant.SourceVersion = media.Version; variant.Status = "pending"; variant.QueuedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct); return; }
        var useCompatibility = media.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath);
        if (!useCompatibility && media.CompatibilityStatus is not "native")
        { variant.Status = "failed"; variant.Error = "The universal playback source is not ready."; await db.SaveChangesAsync(ct); return; }
        var sourceRoot = useCompatibility ? paths.Compatibility : paths.Originals;
        var source = Path.GetFullPath(Path.Combine(sourceRoot, useCompatibility ? media.CompatibilityPath! : media.RelativePath));
        var work = Path.Combine(Path.GetTempPath(), $"lessoncue-transcode-{Guid.NewGuid():N}.mp4");
        variant.Status = "converting"; variant.StartedAt = DateTimeOffset.UtcNow; variant.Error = null;
        variant.TranscodeEngine = null;
        await db.SaveChangesAsync(ct);
        try
        {
            var filter = $"scale=w='min({profile.Width},iw)':h='min({profile.Height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
            var output = $" -c:a aac -b:a {profile.AudioBitrateKbps}k -ar 48000 -ac 2 -sn -dn -movflags +faststart \"{Escape(work)}\"";
            var hardwareArgs = "-nostdin -hide_banner -loglevel error -nostats -y " +
                "-init_hw_device qsv=lessoncue -filter_hw_device lessoncue " +
                $"-i \"{Escape(source)}\" -map 0:v:0 -map 0:a:0? " +
                $"-vf \"{filter},format=nv12,hwupload=extra_hw_frames=64\" " +
                $"-c:v h264_qsv -preset medium -global_quality {profile.Crf} -maxrate {profile.VideoBitrateKbps}k " +
                $"-bufsize {profile.VideoBitrateKbps * 2}k -profile:v high -level:v 4.1{output}";
            var softwareArgs = $"-nostdin -hide_banner -loglevel error -nostats -y -i \"{Escape(source)}\" " +
                $"-map 0:v:0 -map 0:a:0? -vf \"{filter}\" -c:v libx264 -preset medium -crf {profile.Crf} " +
                $"-maxrate {profile.VideoBitrateKbps}k -bufsize {profile.VideoBitrateKbps * 2}k " +
                $"-profile:v high -level:v 4.1 -pix_fmt yuv420p -tag:v avc1{output}";
            var accelerationEnabled = await db.Organizations.AsNoTracking()
                .Select(x => x.HardwareAccelerationEnabled).FirstAsync(ct);
            var result = await hardware.RunTranscodeAsync(accelerationEnabled, hardwareArgs, softwareArgs, work, ct);
            var size = new FileInfo(work).Length;
            if (size <= 0) throw new InvalidOperationException("FFmpeg created an empty adaptive transcode.");
            if (await storage.EnsureAvailableAsync(db, size, ct) is null)
                throw new InvalidOperationException($"The {profile.Label} copy needs {size} bytes, but the LessonCue storage allocation is full.");
            Directory.CreateDirectory(paths.Transcodes);
            var relative = $"{media.Id:N}-{variant.Profile}-v{media.Version}.mp4";
            var destination = Path.Combine(paths.Transcodes, relative);
            if (variant.RelativePath is not null && variant.RelativePath != relative) TryDelete(Path.Combine(paths.Transcodes, variant.RelativePath));
            File.Move(work, destination, true);
            await using var input = File.OpenRead(destination);
            variant.RelativePath = relative; variant.Sha256 = Convert.ToHexString(await SHA256.HashDataAsync(input, ct)).ToLowerInvariant();
            variant.SizeBytes = size; variant.Status = "ready"; variant.Error = null; variant.CompletedAt = DateTimeOffset.UtcNow;
            variant.TranscodeEngine = result.Engine;
            await db.SaveChangesAsync(ct);
            await hub.Clients.All.SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED" }, ct);
        }
        catch (Exception ex)
        {
            variant.Status = "failed"; variant.Error = Concise(ex.Message); variant.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct); logger.LogWarning(ex, "Could not create {Profile} for {Media}", variant.Profile, media.FileName);
        }
        finally { TryDelete(work); }
    }

    private static string Escape(string value) => value.Replace("\"", "\\\"");
    private static string Concise(string value) => value.Length > 900 ? value[..900] : value;
    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }
}
