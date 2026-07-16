using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace LessonCue.Server;

public sealed class ManifestService(LessonCueDb db)
{
    public async Task<object?> BuildAsync(Guid screenId, CancellationToken cancellationToken)
    {
        var screen = await db.Screens.AsNoTracking().SingleOrDefaultAsync(x => x.Id == screenId, cancellationToken);
        if (screen is null || screen.Revoked) return null;

        var now = DateTimeOffset.UtcNow;
        var lessonsQuery = db.Lessons.AsNoTracking().Include(x => x.Class).Include(x => x.Items)
            .ThenInclude(x => x.MediaAsset).AsQueryable();
        if (screen.AssignedClassId is { } classId)
            lessonsQuery = lessonsQuery.Where(x => x.ClassId == classId);

        var lessons = (await lessonsQuery.Where(x => !x.Archived).OrderBy(x => x.Date).ToListAsync(cancellationToken))
            .Where(x => (x.AvailableFrom is null || x.AvailableFrom <= now) && (x.ExpiresAt is null || x.ExpiresAt >= now)).ToList();
        var signage = (await db.SignagePlaylists.AsNoTracking().Where(x => x.Enabled)
            .OrderByDescending(x => x.Priority).ToListAsync(cancellationToken))
            .Where(x => (x.StartsAt is null || x.StartsAt <= now) && (x.EndsAt is null || x.EndsAt >= now)).ToList();
        var matchingSignage = signage.Where(x => TagsMatch(screen.TagsCsv, x.TargetTagsCsv)).ToArray();
        var version = Math.Max(1, lessons.Sum(x => x.Version) + matchingSignage.Sum(x => x.Priority + 1));
        return new
        {
            apiVersion = 1,
            manifestVersion = version,
            generatedAt = DateTimeOffset.UtcNow,
            screen = new { id = screen.Id, screen.Name, screen.VolunteerMode, screen.Site, tags = SplitTags(screen.TagsCsv) },
            signage = matchingSignage.Select(x => new { x.Id, x.Name, x.Mode, x.Priority, x.Message, x.BackgroundColor, x.TextColor,
                x.MediaAssetId, mediaUrl = x.MediaAssetId is { } mediaId ? $"/api/v1/media/{mediaId}/file" : null, x.StartsAt, x.EndsAt }).ToArray(),
            playlists = lessons.Select(BuildPlaylist).ToArray()
        };
    }

    private static object BuildPlaylist(Lesson lesson)
    {
        var ordered = lesson.Items.OrderBy(x => x.Position).ToList();
        var countdownItem = ordered.FirstOrDefault(x => x.Id == lesson.CountdownItemId || x.Role == "countdown");
        var countdownDuration = EffectiveDuration(countdownItem);
        var countdownStart = lesson.DesignatedStartAt is { } start && countdownDuration is { } duration
            ? start.AddMilliseconds(-duration)
            : (DateTimeOffset?)null;
        var preRollItems = ordered.Where(x => x.Role == "preRoll").Select(MapItem).ToArray();

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
                item = MapItem(countdownItem)
            },
            preRoll = !lesson.PreRollEnabled || preRollItems.Length == 0 ? null : new
            {
                enabled = true,
                loop = true,
                items = preRollItems
            },
            items = ordered.Where(x => x.Role == "lesson").Select(MapItem).ToArray()
        };
    }

    public static DateTimeOffset? CountdownStart(DateTimeOffset? designatedStartAt, long? durationMs) =>
        designatedStartAt is { } start && durationMs is > 0 ? start.AddMilliseconds(-durationMs.Value) : null;

    private static long? EffectiveDuration(PlaylistItem? item) => item is null
        ? null
        : item.EndMs is { } end ? Math.Max(0, end - item.StartMs) : item.DurationMs ?? item.MediaAsset?.DurationMs;

    private static object MapItem(PlaylistItem item)
    {
        var media = item.MediaAsset;
        var compatible = media?.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath);
        return new
        {
            itemId = item.Id,
            mediaId = item.MediaAssetId,
            item.Type,
            item.Title,
            downloadUrl = media is { SourceKind: "link", LinkKind: "direct" } linked ? linked.SourceUrl :
                item.MediaAssetId is { } mediaId && media?.SourceKind != "link" && !string.IsNullOrWhiteSpace(media?.RelativePath)
                    ? $"/api/v1/media/{mediaId}/playback" : null,
            playbackUrl = media is { SourceKind: "link" } online
                ? YouTubeMedia.EmbedUrl(online.SourceUrl) ?? online.SourceUrl : null,
            sha256 = compatible ? media?.CompatibilitySha256 : media?.Sha256,
            sizeBytes = compatible ? media?.CompatibilitySizeBytes : media?.SizeBytes,
            contentType = compatible ? "video/mp4" : media?.ContentType,
            fileExtension = compatible ? "mp4" : Path.GetExtension(media?.RelativePath ?? "").TrimStart('.').ToLowerInvariant(),
            compatibilityStatus = media?.CompatibilityStatus,
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

    private static List<CuePointInput> ParseCuePoints(string json)
    {
        try { return JsonSerializer.Deserialize<List<CuePointInput>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static string[] SplitTags(string tags) => tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    private static bool TagsMatch(string screenTags, string targetTags)
    {
        var targets = SplitTags(targetTags); if (targets.Length == 0) return true;
        var screen = SplitTags(screenTags).ToHashSet(StringComparer.OrdinalIgnoreCase); return targets.Any(screen.Contains);
    }
}
