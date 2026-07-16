using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace LessonCue.Server;

public sealed record MediaStoragePaths(string DataPath)
{
    public string Originals => Path.Combine(DataPath, "media", "originals");
    public string Thumbnails => Path.Combine(DataPath, "media", "thumbnails");
    public string Versions => Path.Combine(DataPath, "media", "versions");
    public string Compatibility => Path.Combine(DataPath, "media", "compatibility");
}

public static class MediaRetention
{
    public const string Persistent = "persistent";
    public const string LessonScoped = "lesson";
    public const int DaysAfterLesson = 28;

    public static DateTimeOffset DeleteAfterFor(DateOnly lessonDate) =>
        new(lessonDate.AddDays(DaysAfterLesson).ToDateTime(TimeOnly.MaxValue), TimeSpan.Zero);

    public static DateTimeOffset DeleteOn(DateOnly date) =>
        new(date.ToDateTime(TimeOnly.MaxValue), TimeSpan.Zero);

    public static void KeepPermanently(MediaAsset media)
    {
        media.StoragePolicy = Persistent;
        media.OriginLessonId = null;
        media.DeleteAfter = null;
        media.RetentionDateIsManual = false;
    }

    public static void KeepForLesson(MediaAsset media, Lesson lesson)
    {
        if (media.StoragePolicy == Persistent) return;
        if (media.RetentionDateIsManual) return;
        media.StoragePolicy = LessonScoped;
        media.OriginLessonId ??= lesson.Id;
        var deleteAfter = DeleteAfterFor(lesson.Date);
        if (media.DeleteAfter is null || deleteAfter > media.DeleteAfter) media.DeleteAfter = deleteAfter;
    }

    public static void SetNewUploadPolicy(MediaAsset media, Lesson lesson)
    {
        media.StoragePolicy = LessonScoped;
        media.OriginLessonId = lesson.Id;
        media.DeleteAfter = DeleteAfterFor(lesson.Date);
        media.RetentionDateIsManual = false;
    }

    public static void ExpireOn(MediaAsset media, DateOnly date)
    {
        media.StoragePolicy = LessonScoped;
        media.DeleteAfter = DeleteOn(date);
        media.RetentionDateIsManual = true;
    }
}

public sealed class MediaRetentionService(
    IServiceScopeFactory scopes,
    MediaStoragePaths paths,
    IHubContext<SyncHub> hub,
    ILogger<MediaRetentionService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                var deleted = await CleanupAsync(db, paths, DateTimeOffset.UtcNow, stoppingToken);
                if (deleted > 0)
                    await hub.Clients.All.SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED" }, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception ex) { logger.LogError(ex, "Automatic media retention cleanup failed"); }

            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    public static async Task<int> CleanupAsync(LessonCueDb db, MediaStoragePaths paths, DateTimeOffset now,
        CancellationToken ct = default)
    {
        var temporary = await db.MediaAssets.Where(x => x.StoragePolicy == MediaRetention.LessonScoped).ToListAsync(ct);
        var deleted = 0;
        foreach (var media in temporary)
        {
            var lessonDates = await db.PlaylistItems.AsNoTracking()
                .Where(x => x.MediaAssetId == media.Id)
                .Select(x => x.Lesson!.Date)
                .ToListAsync(ct);
            if (media.OriginLessonId is Guid originId)
            {
                var originDate = await db.Lessons.AsNoTracking().Where(x => x.Id == originId)
                    .Select(x => (DateOnly?)x.Date).SingleOrDefaultAsync(ct);
                if (originDate is not null) lessonDates.Add(originDate.Value);
            }

            if (!media.RetentionDateIsManual && lessonDates.Count > 0)
                media.DeleteAfter = MediaRetention.DeleteAfterFor(lessonDates.Max());
            if (media.DeleteAfter is null || media.DeleteAfter >= now) continue;

            media.DeletedAt = now; media.DeletedBy = "system";
            db.AuditEvents.Add(new AuditEvent { Actor = "system", Action = "media.retention.recycle", Object = media.Id.ToString(),
                Summary = media.RetentionDateIsManual ? $"Moved {media.FileName} to the recycling bin on its selected expiration date." : $"Moved {media.FileName} to the recycling bin four weeks after its last lesson date." });
            deleted++;
        }

        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync(ct);
        await RecycleBinService.PurgeAsync(db, paths, now.AddDays(-RecycleBinService.RetentionDays), "system", ct);
        return deleted;
    }

    public static async Task DeleteAsync(LessonCueDb db, MediaStoragePaths paths, MediaAsset media,
        string actor, string action, string summary, CancellationToken ct = default)
    {
        var playlistItems = await db.PlaylistItems.IgnoreQueryFilters().Where(x => x.MediaAssetId == media.Id).Include(x => x.Lesson).ToListAsync(ct);
        foreach (var item in playlistItems)
        {
            item.MediaAssetId = null;
            if (item.Lesson is not null) item.Lesson.Version++;
        }
        var signageItems = await db.SignagePlaylists.Where(x => x.MediaAssetId == media.Id).ToListAsync(ct);
        foreach (var signage in signageItems) signage.MediaAssetId = null;

        var versions = await db.MediaAssetVersions.IgnoreQueryFilters().Where(x => x.MediaAssetId == media.Id).ToListAsync(ct);
        foreach (var version in versions) DeleteStoredFile(paths.Versions, version.RelativePath);

        DeleteStoredFile(paths.Originals, media.RelativePath);
        if (!string.IsNullOrWhiteSpace(media.ThumbnailPath)) DeleteStoredFile(paths.Thumbnails, media.ThumbnailPath);
        if (!string.IsNullOrWhiteSpace(media.FilmstripPath)) DeleteStoredFile(paths.Thumbnails, media.FilmstripPath);
        if (!string.IsNullOrWhiteSpace(media.WaveformPath)) DeleteStoredFile(paths.Thumbnails, media.WaveformPath);
        if (!string.IsNullOrWhiteSpace(media.CompatibilityPath)) DeleteStoredFile(paths.Compatibility, media.CompatibilityPath);
        db.MediaAssets.Remove(media);
        db.AuditEvents.Add(new AuditEvent
        {
            Actor = actor,
            Action = action,
            Object = media.Id.ToString(),
            Summary = summary
        });
    }

    private static void DeleteStoredFile(string root, string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return;
        var normalizedRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        var fullPath = Path.GetFullPath(Path.Combine(root, relativePath));
        if (fullPath.StartsWith(normalizedRoot, StringComparison.Ordinal) && File.Exists(fullPath)) File.Delete(fullPath);
    }
}
