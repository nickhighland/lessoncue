using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class SeedDataTests
{
    [Fact]
    public async Task FreshSampleLessonIsImmediatelyAvailable()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        var startedAt = DateTimeOffset.UtcNow;

        await SeedData.RunAsync(db);

        var lesson = await db.Lessons.SingleAsync(cancellationToken);
        Assert.NotNull(lesson.AvailableFrom);
        Assert.True(lesson.AvailableFrom <= startedAt);
        Assert.True(lesson.ExpiresAt > startedAt);
    }

    [Fact]
    public async Task DemoSeedIncludesPlayablePreRollCountdownLessonAndPostRoll()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        var dataDirectory = Directory.CreateTempSubdirectory("lessoncue-seed-");
        try
        {
            await SeedData.RunAsync(db, dataDirectory.FullName);

            var lesson = await db.Lessons
                .Include(x => x.Items)
                .ThenInclude(x => x.MediaAsset)
                .SingleAsync(cancellationToken);
            Assert.Equal(["preRoll", "countdown", "lesson", "postLesson"],
                lesson.Items.OrderBy(x => x.Position).Select(x => x.Role).ToArray());
            Assert.All(lesson.Items, item =>
            {
                Assert.NotNull(item.MediaAsset);
                Assert.Equal("ready", item.MediaAsset!.ProcessingStatus);
                Assert.Equal("native", item.MediaAsset.CompatibilityStatus);
                Assert.True(File.Exists(Path.Combine(dataDirectory.FullName, "media", "originals",
                    item.MediaAsset.RelativePath.Replace('/', Path.DirectorySeparatorChar))));
            });

            await SeedData.RunAsync(db, dataDirectory.FullName);
            Assert.Equal(4, await db.PlaylistItems.CountAsync(cancellationToken));
            Assert.Equal(4, await db.MediaAssets.CountAsync(cancellationToken));
        }
        finally
        {
            dataDirectory.Delete(recursive: true);
        }
    }
}
