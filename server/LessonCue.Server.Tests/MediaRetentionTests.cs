using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaRetentionTests
{
    [Fact]
    public async Task UpgradeAddsCuePointsToExistingDatabases()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"PlaylistItems\" DROP COLUMN \"CuePointsJson\"", cancellationToken);

        await DatabaseUpgrade.ApplyAsync(db, cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA table_info(\"PlaylistItems\")";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(1));
        Assert.Contains("CuePointsJson", columns);
    }

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
    public async Task UpgradeAddsMediaOrganizationAndVersionHistory()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("DROP TABLE \"MediaAssetVersions\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"Folder\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"TagsCsv\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"Version\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"ReplacedAt\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"ConversionStatus\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"ConversionError\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"ConvertedSlidesJson\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"ConvertedAt\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"CompatibilityPath\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"CompatibilitySha256\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"CompatibilitySizeBytes\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"CompatibilityStatus\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"CompatibilityError\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"MediaAssets\" DROP COLUMN \"CompatibilityTranscodedAt\"", cancellationToken);

        await DatabaseUpgrade.ApplyAsync(db, cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='MediaAssetVersions'";
        Assert.Equal(1L, (long)(await command.ExecuteScalarAsync(cancellationToken))!);
        command.CommandText = "PRAGMA table_info(\"MediaAssets\")";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(1));
        Assert.Contains("Folder", columns);
        Assert.Contains("TagsCsv", columns);
        Assert.Contains("Version", columns);
        Assert.Contains("ReplacedAt", columns);
        Assert.Contains("ConversionStatus", columns);
        Assert.Contains("ConversionError", columns);
        Assert.Contains("ConvertedSlidesJson", columns);
        Assert.Contains("ConvertedAt", columns);
        Assert.Contains("CompatibilityPath", columns);
        Assert.Contains("CompatibilitySha256", columns);
        Assert.Contains("CompatibilitySizeBytes", columns);
        Assert.Contains("CompatibilityStatus", columns);
        Assert.Contains("CompatibilityError", columns);
        Assert.Contains("CompatibilityTranscodedAt", columns);
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
    public async Task CleanupMovesExpiredFileToRecycleBinAndPreservesReferences()
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
        Directory.CreateDirectory(Path.Combine(paths.Versions, "archive"));
        Directory.CreateDirectory(paths.Compatibility);
        try
        {
            var lessonClass = new LessonClass { Name = "Learning Lab" };
            var lesson = new Lesson { ClassId = lessonClass.Id, Date = new DateOnly(2026, 1, 1), Title = "Sample Lesson" };
            var media = new MediaAsset
            {
                FileName = "sample.mp4", ContentType = "video/mp4", RelativePath = "sample.mp4",
                CompatibilityPath = "sample-compatible.mp4", CompatibilityStatus = "ready",
                StoragePolicy = MediaRetention.LessonScoped, OriginLessonId = lesson.Id,
                DeleteAfter = MediaRetention.DeleteAfterFor(lesson.Date)
            };
            var item = new PlaylistItem { LessonId = lesson.Id, Title = "Presentation", MediaAssetId = media.Id };
            var signage = new SignagePlaylist { Name = "Welcome", MediaAssetId = media.Id };
            var version = new MediaAssetVersion { MediaAssetId = media.Id, VersionNumber = 1, FileName = "older.mp4",
                RelativePath = "archive/older.mp4", SizeBytes = 7 };
            await File.WriteAllTextAsync(Path.Combine(paths.Originals, media.RelativePath), "media", cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(paths.Versions, version.RelativePath), "version", cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(paths.Compatibility, media.CompatibilityPath!), "compatible", cancellationToken);
            db.AddRange(lessonClass, lesson, media, item, signage, version);
            await db.SaveChangesAsync(cancellationToken);

            var deleted = await MediaRetentionService.CleanupAsync(db, paths,
                new DateTimeOffset(2026, 1, 30, 0, 0, 0, TimeSpan.Zero), cancellationToken);

            Assert.Equal(1, deleted);
            Assert.False(await db.MediaAssets.AnyAsync(cancellationToken));
            Assert.NotNull((await db.MediaAssets.IgnoreQueryFilters().SingleAsync(cancellationToken)).DeletedAt);
            Assert.Equal(media.Id, (await db.PlaylistItems.SingleAsync(cancellationToken)).MediaAssetId);
            Assert.Equal(media.Id, (await db.SignagePlaylists.SingleAsync(cancellationToken)).MediaAssetId);
            Assert.True(File.Exists(Path.Combine(paths.Originals, media.RelativePath)));
            Assert.True(File.Exists(Path.Combine(paths.Versions, version.RelativePath)));
            Assert.True(File.Exists(Path.Combine(paths.Compatibility, media.CompatibilityPath!)));

            var purged = await RecycleBinService.PurgeAsync(db, paths,
                new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero), ct: cancellationToken);
            Assert.Equal(1, purged);
            Assert.False(await db.MediaAssets.IgnoreQueryFilters().AnyAsync(cancellationToken));
            Assert.Null((await db.PlaylistItems.SingleAsync(cancellationToken)).MediaAssetId);
            Assert.False(File.Exists(Path.Combine(paths.Originals, media.RelativePath)));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
