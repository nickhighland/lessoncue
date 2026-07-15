using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class ManifestService(LessonCueDb db)
{
    public async Task<object?> BuildAsync(Guid screenId, CancellationToken cancellationToken)
    {
        var screen = await db.Screens.AsNoTracking().SingleOrDefaultAsync(x => x.Id == screenId, cancellationToken);
        if (screen is null || screen.Revoked) return null;

        var lessonsQuery = db.Lessons.AsNoTracking().Include(x => x.Class).Include(x => x.Items)
            .ThenInclude(x => x.MediaAsset).AsQueryable();
        if (screen.AssignedClassId is { } classId)
            lessonsQuery = lessonsQuery.Where(x => x.ClassId == classId);

        var lessons = await lessonsQuery.OrderBy(x => x.Date).ToListAsync(cancellationToken);
        var version = Math.Max(1, lessons.Sum(x => x.Version));
        return new
        {
            apiVersion = 1,
            manifestVersion = version,
            generatedAt = DateTimeOffset.UtcNow,
            screen = new { id = screen.Id, screen.Name, screen.VolunteerMode },
            playlists = lessons.Select(lesson => BuildPlaylist(lesson)).ToArray()
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

    private static object MapItem(PlaylistItem item) => new
    {
        itemId = item.Id,
        mediaId = item.MediaAssetId,
        item.Type,
        item.Title,
        downloadUrl = item.MediaAssetId is { } mediaId ? $"/api/v1/media/{mediaId}/file" : null,
        sha256 = item.MediaAsset?.Sha256,
        sizeBytes = item.MediaAsset?.SizeBytes,
        durationMs = item.DurationMs ?? item.MediaAsset?.DurationMs,
        item.StartMs,
        item.EndMs,
        item.VolumePercent,
        item.ImageDurationSeconds,
        item.EndBehavior,
        item.AllowSkip,
        offlineEligible = item.MediaAsset?.OfflineEligible ?? false
    };
}
