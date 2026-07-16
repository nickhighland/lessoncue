using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaRetentionTests
{
    [Fact]
    public void TemporaryMediaExpiresAtEndOfDayFourWeeksAfterLesson()
    {
        var actual = MediaRetention.DeleteAfterFor(new DateOnly(2026, 7, 19));
        Assert.Equal(new DateTimeOffset(2026, 8, 16, 23, 59, 59, 999, TimeSpan.Zero).AddTicks(9999), actual);
    }

    [Fact]
    public async Task CleanupDeletesExpiredFileAndPreservesPlaylistItem()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);

        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-retention-{Guid.NewGuid():N}");
        var paths = new MediaStoragePaths(root);
        Directory.CreateDirectory(paths.Originals);
        try
        {
            var lessonClass = new LessonClass { Name = "Learning Lab" };
            var lesson = new Lesson { ClassId = lessonClass.Id, Date = new DateOnly(2026, 1, 1), Title = "Sample Lesson" };
            var media = new MediaAsset
            {
                FileName = "sample.mp4", ContentType = "video/mp4", RelativePath = "sample.mp4",
                StoragePolicy = MediaRetention.LessonScoped, OriginLessonId = lesson.Id,
                DeleteAfter = MediaRetention.DeleteAfterFor(lesson.Date)
            };
            var item = new PlaylistItem { LessonId = lesson.Id, Title = "Presentation", MediaAssetId = media.Id };
            await File.WriteAllTextAsync(Path.Combine(paths.Originals, media.RelativePath), "media", cancellationToken);
            db.AddRange(lessonClass, lesson, media, item);
            await db.SaveChangesAsync(cancellationToken);

            var deleted = await MediaRetentionService.CleanupAsync(db, paths,
                new DateTimeOffset(2026, 1, 30, 0, 0, 0, TimeSpan.Zero), cancellationToken);

            Assert.Equal(1, deleted);
            Assert.False(await db.MediaAssets.AnyAsync(cancellationToken));
            Assert.Null((await db.PlaylistItems.SingleAsync(cancellationToken)).MediaAssetId);
            Assert.False(File.Exists(Path.Combine(paths.Originals, media.RelativePath)));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
