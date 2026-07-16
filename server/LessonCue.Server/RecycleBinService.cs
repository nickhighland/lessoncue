using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class RecycleBinService
{
    public const int RetentionDays = 30;

    public static async Task<int> PurgeAsync(LessonCueDb db, MediaStoragePaths paths, DateTimeOffset deletedBefore,
        string actor = "system", CancellationToken ct = default)
    {
        var media = (await db.MediaAssets.IgnoreQueryFilters().Where(x => x.DeletedAt != null).ToListAsync(ct))
            .Where(x => x.DeletedAt <= deletedBefore).ToList();
        foreach (var item in media)
            await MediaRetentionService.DeleteAsync(db, paths, item, actor, "recycle.media.purge", item.FileName, ct);

        var lessons = (await db.Lessons.IgnoreQueryFilters().Where(x => x.DeletedAt != null).ToListAsync(ct))
            .Where(x => x.DeletedAt <= deletedBefore).ToList();
        db.Lessons.RemoveRange(lessons);
        var classes = (await db.Classes.IgnoreQueryFilters().Where(x => x.DeletedAt != null).ToListAsync(ct))
            .Where(x => x.DeletedAt <= deletedBefore).ToList();
        db.Classes.RemoveRange(classes);
        if (media.Count + lessons.Count + classes.Count > 0)
        {
            db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "recycle.purge", Object = "recycle-bin",
                Summary = $"{classes.Count} classes, {lessons.Count} lessons, {media.Count} media" });
            await db.SaveChangesAsync(ct);
        }
        return media.Count + lessons.Count + classes.Count;
    }
}
