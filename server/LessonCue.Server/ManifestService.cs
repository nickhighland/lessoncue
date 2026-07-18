using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace LessonCue.Server;

public sealed class ManifestService(LessonCueDb db)
{
    public async Task<object?> BuildAsync(Guid screenId, CancellationToken cancellationToken, DateTimeOffset? generatedAt = null)
    {
        var screen = await db.Screens.AsNoTracking().SingleOrDefaultAsync(x => x.Id == screenId, cancellationToken);
        if (screen is null || screen.Revoked) return null;

        var now = generatedAt ?? DateTimeOffset.UtcNow;
        var timeZone = await db.Organizations.AsNoTracking().Select(x => x.TimeZone).FirstOrDefaultAsync(cancellationToken)
            ?? "UTC";
        var lessonsQuery = db.Lessons.AsNoTracking().Include(x => x.Class).Include(x => x.Items)
            .ThenInclude(x => x.MediaAsset).ThenInclude(x => x!.TranscodeVariants).AsSplitQuery().AsQueryable();
        if (screen.AssignedClassId is { } classId)
            lessonsQuery = lessonsQuery.Where(x => x.ClassId == classId);

        var lessons = (await lessonsQuery.Where(x => !x.Archived).OrderBy(x => x.Date).ToListAsync(cancellationToken))
            .Where(x => (x.AvailableFrom is null || x.AvailableFrom <= now) && (x.ExpiresAt is null || x.ExpiresAt >= now)).ToList();
        var signage = await db.SignagePlaylists.AsNoTracking().Include(x => x.MediaAsset).ThenInclude(x => x!.TranscodeVariants)
            .Where(x => x.Enabled).ToListAsync(cancellationToken);
        var targetedSignage = signage
            .Select(item => new { Item = item, State = SignageSchedule.Evaluate(item, now, timeZone) })
            .Where(entry => (entry.State.Active || SignageSchedule.CanOccurAgain(entry.Item, now, timeZone))
                && SignageSchedule.TargetsScreen(entry.Item, screen))
            .OrderBy(entry => ModeRank(entry.Item.Mode))
            .ThenByDescending(entry => entry.Item.Priority)
            .ThenByDescending(entry => entry.Item.UpdatedAt)
            .ToArray();
        var matchingSignage = targetedSignage.Where(entry => entry.State.Active).ToArray();
        var version = ManifestVersion(lessons, targetedSignage.Select(entry => entry.Item),
            matchingSignage.Select(entry => entry.Item.Id));
        return new
        {
            apiVersion = 1,
            manifestVersion = version,
            generatedAt = DateTimeOffset.UtcNow,
            screen = new { id = screen.Id, screen.Name, screen.VolunteerMode, screen.Site, tags = SplitTags(screen.TagsCsv) },
            signage = matchingSignage.Select(entry => MapSignage(entry.Item, entry.State, screen)).ToArray(),
            signageSchedule = targetedSignage.Select(entry => MapSignage(entry.Item, entry.State, screen)).ToArray(),
            playlists = lessons.Select(x => BuildPlaylist(x, screen)).ToArray()
        };
    }

    private static object BuildPlaylist(Lesson lesson, Screen screen)
    {
        var ordered = lesson.Items.OrderBy(x => x.Position).ToList();
        var countdownItem = ordered.FirstOrDefault(x => x.Id == lesson.CountdownItemId || x.Role == "countdown");
        var countdownDuration = EffectiveDuration(countdownItem);
        var countdownStart = lesson.DesignatedStartAt is { } start && countdownDuration is { } duration
            ? start.AddMilliseconds(-duration)
            : (DateTimeOffset?)null;
        var preRollItems = ordered.Where(x => x.Role == "preRoll").Select(x => MapItem(x, screen)).ToArray();

        return new
        {
            playlistId = lesson.Id,
            title = string.IsNullOrWhiteSpace(lesson.Title) ? lesson.Class?.Name ?? "Lesson" : lesson.Title,
            version = lesson.Version,
            lessonDate = lesson.Date,
            lesson.DesignatedStartAt,
            lesson.PreRollStartsAt,
            lesson.AvailableFrom,
            lesson.ExpiresAt,
            countdown = countdownItem is null || countdownDuration is null ? null : new
            {
                enabled = true,
                itemId = countdownItem.Id,
                durationMs = countdownDuration.Value,
                startAt = countdownStart,
                item = MapItem(countdownItem, screen)
            },
            preRoll = !lesson.PreRollEnabled || preRollItems.Length == 0 ? null : new
            {
                enabled = true,
                loop = true,
                items = preRollItems
            },
            items = ordered.Where(x => x.Role == "lesson").Select(x => MapItem(x, screen)).ToArray()
        };
    }

    public static DateTimeOffset? CountdownStart(DateTimeOffset? designatedStartAt, long? durationMs) =>
        designatedStartAt is { } start && durationMs is > 0 ? start.AddMilliseconds(-durationMs.Value) : null;

    private static long? EffectiveDuration(PlaylistItem? item) => item is null
        ? null
        : item.EndMs is { } end ? Math.Max(0, end - item.StartMs) : item.DurationMs ?? item.MediaAsset?.DurationMs;

    private static object MapItem(PlaylistItem item, Screen screen)
    {
        var media = item.MediaAsset;
        var compatible = media?.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath);
        var requestedProfile = media?.VideoCodec is not null ? AdaptiveTranscodeProfiles.SelectForScreen(screen, media) : null;
        var variant = requestedProfile is null ? null : media?.TranscodeVariants.FirstOrDefault(x =>
            x.Profile == requestedProfile && x.Status == "ready" && x.SourceVersion == media.Version && !string.IsNullOrWhiteSpace(x.RelativePath));
        var useVariant = variant is not null;
        var useNative = requestedProfile == "native";
        var selectedProfile = useVariant ? variant!.Profile : useNative ? "native" : compatible ? AdaptiveTranscodeProfiles.Universal1080 : media?.CompatibilityStatus == "native" ? "native" : "original";
        return new
        {
            itemId = item.Id,
            mediaId = item.MediaAssetId,
            item.Type,
            item.Title,
            downloadUrl = media is { SourceKind: "link", LinkKind: "direct" } linked ? linked.SourceUrl :
                useVariant ? $"/api/v1/media/{media!.Id}/transcodes/{variant!.Profile}" :
                useNative ? $"/api/v1/media/{media!.Id}/file" :
                item.MediaAssetId is { } mediaId && media?.SourceKind != "link" && !string.IsNullOrWhiteSpace(media?.RelativePath)
                    ? $"/api/v1/media/{mediaId}/playback" : null,
            playbackUrl = media is { SourceKind: "link" } online
                ? YouTubeMedia.EmbedUrl(online.SourceUrl) ?? online.SourceUrl : null,
            sha256 = useVariant ? variant!.Sha256 : compatible && !useNative ? media?.CompatibilitySha256 : media?.Sha256,
            sizeBytes = useVariant ? variant!.SizeBytes : compatible && !useNative ? media?.CompatibilitySizeBytes : media?.SizeBytes,
            contentType = useVariant || compatible && !useNative ? "video/mp4" : media?.ContentType,
            fileExtension = useVariant || compatible && !useNative ? "mp4" : Path.GetExtension(media?.RelativePath ?? "").TrimStart('.').ToLowerInvariant(),
            compatibilityStatus = media?.CompatibilityStatus,
            requestedProfile,
            selectedProfile,
            transcodeStatus = requestedProfile is not null && AdaptiveTranscodeProfiles.All.ContainsKey(requestedProfile)
                ? media?.TranscodeVariants.FirstOrDefault(x => x.Profile == requestedProfile)?.Status ?? "not-generated" : "not-needed",
            durationMs = item.DurationMs ?? media?.DurationMs,
            item.StartMs,
            item.EndMs,
            item.VolumePercent,
            item.ImageDurationSeconds,
            item.EndBehavior,
            item.AllowSkip,
            offlineEligible = media?.OfflineEligible ?? false,
            sourceKind = media?.SourceKind,
            sourceUrl = media?.SourceUrl,
            linkKind = media?.LinkKind,
            item.Notes,
            item.FadeInMs,
            item.FadeOutMs,
            item.NormalizeAudio,
            cuePoints = ParseCuePoints(item.CuePointsJson)
        };
    }

    private static (object? Manifest, string? Url) MapSignageMedia(SignagePlaylist signage, Screen screen)
    {
        var media = signage.MediaAsset;
        if (media is null) return (null, null);
        var compatible = media.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath);
        var requestedProfile = media.VideoCodec is not null ? AdaptiveTranscodeProfiles.SelectForScreen(screen, media) : null;
        var variant = requestedProfile is null ? null : media.TranscodeVariants.FirstOrDefault(x =>
            x.Profile == requestedProfile && x.Status == "ready" && x.SourceVersion == media.Version && !string.IsNullOrWhiteSpace(x.RelativePath));
        var useVariant = variant is not null;
        var useNative = requestedProfile == "native";
        var url = useVariant ? $"/api/v1/media/{media.Id}/transcodes/{variant!.Profile}" :
            useNative ? $"/api/v1/media/{media.Id}/file" :
            compatible ? $"/api/v1/media/{media.Id}/playback" :
            !string.IsNullOrWhiteSpace(media.RelativePath) ? $"/api/v1/media/{media.Id}/file" : null;
        var contentType = useVariant || compatible && !useNative ? "video/mp4" : media.ContentType;
        var extension = useVariant || compatible && !useNative
            ? "mp4" : Path.GetExtension(media.RelativePath ?? media.FileName).TrimStart('.').ToLowerInvariant();
        var type = contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase) ? "video"
            : contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ? "audio" : "image";
        var sha256 = useVariant ? variant!.Sha256 : compatible && !useNative ? media.CompatibilitySha256 : media.Sha256;
        var sizeBytes = useVariant ? variant!.SizeBytes : compatible && !useNative ? media.CompatibilitySizeBytes : media.SizeBytes;
        var cacheVersion = string.IsNullOrWhiteSpace(sha256) ? media.Version.ToString() : sha256[..Math.Min(12, sha256.Length)];
        var versionedUrl = url is null ? null : $"{url}?v={Uri.EscapeDataString(cacheVersion)}";
        var manifest = new
        {
            itemId = $"signage-{signage.Id}",
            mediaId = media.Id,
            title = signage.Name,
            type,
            downloadUrl = versionedUrl,
            contentType,
            fileExtension = extension,
            sha256,
            sizeBytes,
            durationMs = media.DurationMs,
            startMs = 0,
            endMs = (long?)null,
            volumePercent = 100,
            imageDurationSeconds = (int?)null,
            endBehavior = "loop",
            allowSkip = false,
            offlineEligible = media.OfflineEligible
        };
        return (manifest, versionedUrl);
    }

    private static object MapSignage(SignagePlaylist item, SignageScheduleState state, Screen screen)
    {
        var signageMedia = MapSignageMedia(item, screen);
        return new
        {
            item.Id,
            item.Name,
            item.Mode,
            item.Priority,
            item.Message,
            item.BackgroundColor,
            item.TextColor,
            item.MediaAssetId,
            mediaUrl = signageMedia.Url,
            media = signageMedia.Manifest,
            item.StartsAt,
            item.EndsAt,
            recurrence = SignageSchedule.NormalizeRecurrence(item.Recurrence),
            item.ScheduleStartDate,
            item.ScheduleEndDate,
            item.StartMinutes,
            item.EndMinutes,
            daysOfWeek = SignageSchedule.ParseDays(item.DaysOfWeekCsv),
            excludedDates = SignageSchedule.ParseDates(item.ExcludedDatesJson),
            activeNow = state.Active,
            state.NextChangeAt,
            ready = SignageReady(item.MediaAsset),
            readiness = SignageReadiness(item.MediaAsset)
        };
    }

    private static List<CuePointInput> ParseCuePoints(string json)
    {
        try { return JsonSerializer.Deserialize<List<CuePointInput>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static string[] SplitTags(string tags) =>
        tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static int ModeRank(string mode) => mode switch
    {
        "emergency" => 0,
        "scheduled" => 1,
        _ => 2
    };

    private static bool SignageReady(MediaAsset? media) => media is null || SignageReadiness(media) == "ready";

    private static string SignageReadiness(MediaAsset? media)
    {
        if (media is null) return "ready";
        if (media.ProcessingStatus is "pending" or "processing" || media.CompatibilityStatus is "pending" or "processing")
            return "preparing";
        if (media.ProcessingStatus == "failed" || media.CompatibilityStatus == "failed") return "failed";
        if (media.SourceKind != "link" && string.IsNullOrWhiteSpace(media.RelativePath)) return "missing";
        return "ready";
    }

    private static int ManifestVersion(IEnumerable<Lesson> lessons, IEnumerable<SignagePlaylist> signage,
        IEnumerable<Guid> activeSignageIds)
    {
        var hash = 17;
        foreach (var lesson in lessons.OrderBy(x => x.Id))
            hash = unchecked(hash * 31 + HashCode.Combine(lesson.Id, lesson.Version));
        foreach (var item in signage.OrderBy(x => x.Id))
            hash = unchecked(hash * 31 + HashCode.Combine(item.Id, item.Priority, item.UpdatedAt.UtcTicks));
        foreach (var id in activeSignageIds.Order())
            hash = unchecked(hash * 31 + id.GetHashCode());
        return Math.Max(1, hash & int.MaxValue);
    }
}
