using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaRetentionTests
{
    [Fact]
    public async Task UpgradeAddsVisualTimelineDerivativesToExistingDatabases()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"FilmstripPath\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"WaveformPath\"", cancellationToken);

        await DatabaseUpgrade.ApplyAsync(db, cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA table_info(\"MediaAssets\")";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(1));
        Assert.Contains("FilmstripPath", columns);
        Assert.Contains("WaveformPath", columns);
    }

    [Fact]
    public async Task UpgradeAddsTheManualRetentionMarkerToExistingDatabases()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"RetentionDateIsManual\"", cancellationToken);

        await DatabaseUpgrade.ApplyAsync(db, cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA table_info(\"MediaAssets\")";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(1));
        Assert.Contains("RetentionDateIsManual", columns);
    }

    [Fact]
    public void TemporaryMediaExpiresAtEndOfDayFourWeeksAfterLesson()
    {
        var actual = MediaRetention.DeleteAfterFor(new DateOnly(2026, 7, 19));
        Assert.Equal(new DateTimeOffset(2026, 8, 16, 23, 59, 59, 999, TimeSpan.Zero).AddTicks(9999), actual);
    }

    [Fact]
    public void SelectedExpirationDateRemainsExplicitUntilMadePermanent()
    {
        var media = new MediaAsset { FileName = "sample.mp4", RelativePath = "sample.mp4" };

        MediaRetention.ExpireOn(media, new DateOnly(2026, 10, 4));

        Assert.Equal(MediaRetention.LessonScoped, media.StoragePolicy);
        Assert.Equal(new DateTimeOffset(2026, 10, 4, 23, 59, 59, 999, TimeSpan.Zero).AddTicks(9999), media.DeleteAfter);
        Assert.True(media.RetentionDateIsManual);

        MediaRetention.KeepPermanently(media);

        Assert.Equal(MediaRetention.Persistent, media.StoragePolicy);
        Assert.Null(media.DeleteAfter);
        Assert.False(media.RetentionDateIsManual);
    }

    [Fact]
    public async Task CleanupDoesNotReplaceASelectedExpirationWithTheLessonDefault()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        var lessonClass = new LessonClass { Name = "Learning Lab" };
        var lesson = new Lesson { ClassId = lessonClass.Id, Date = new DateOnly(2026, 1, 1), Title = "Sample Lesson" };
        var media = new MediaAsset { FileName = "sample.mp4", RelativePath = "sample.mp4" };
        MediaRetention.ExpireOn(media, new DateOnly(2026, 3, 1));
        db.AddRange(lessonClass, lesson, media, new PlaylistItem { LessonId = lesson.Id, Title = "Presentation", MediaAssetId = media.Id });
        await db.SaveChangesAsync(cancellationToken);
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-retention-{Guid.NewGuid():N}");
        var paths = new MediaStoragePaths(root);
        Directory.CreateDirectory(paths.Originals);
        try
        {
            var deleted = await MediaRetentionService.CleanupAsync(db, paths,
                new DateTimeOffset(2026, 2, 1, 0, 0, 0, TimeSpan.Zero), cancellationToken);

            Assert.Equal(0, deleted);
            Assert.Equal(MediaRetention.DeleteOn(new DateOnly(2026, 3, 1)), (await db.MediaAssets.SingleAsync(cancellationToken)).DeleteAfter);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
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
            var signage = new SignagePlaylist { Name = "Welcome", MediaAssetId = media.Id };
            await File.WriteAllTextAsync(Path.Combine(paths.Originals, media.RelativePath), "media", cancellationToken);
            db.AddRange(lessonClass, lesson, media, item, signage);
            await db.SaveChangesAsync(cancellationToken);

            var deleted = await MediaRetentionService.CleanupAsync(db, paths,
                new DateTimeOffset(2026, 1, 30, 0, 0, 0, TimeSpan.Zero), cancellationToken);

            Assert.Equal(1, deleted);
            Assert.False(await db.MediaAssets.AnyAsync(cancellationToken));
            Assert.Null((await db.PlaylistItems.SingleAsync(cancellationToken)).MediaAssetId);
            Assert.Null((await db.SignagePlaylists.SingleAsync(cancellationToken)).MediaAssetId);
            Assert.False(File.Exists(Path.Combine(paths.Originals, media.RelativePath)));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
