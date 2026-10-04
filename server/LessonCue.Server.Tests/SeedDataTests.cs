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

    [Fact]
    public async Task ExistingSampleLessonIsRepairedWhenSeedAuditWasRemoved()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        var dataDirectory = Directory.CreateTempSubdirectory("lessoncue-seed-repair-");
        try
        {
            var lessonClass = new LessonClass
            {
                Name = "Learning Lab",
                Description = "A ready-to-use example class for any learning environment."
            };
            var lesson = new Lesson
            {
                ClassId = lessonClass.Id,
                Date = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)),
                Title = "Sample Lesson",
                DesignatedStartAt = DateTimeOffset.UtcNow.AddDays(7),
                PreRollEnabled = false
            };
            var main = new PlaylistItem
            {
                LessonId = lesson.Id,
                Title = "Main Presentation",
                Type = "video",
                Role = "lesson",
                Position = 3000,
                DurationMs = 12_000,
                EndBehavior = "pause"
            };
            // Deliberately omit the system.seed audit row. This models a
            // retained database whose audit history was pruned before upgrade.
            db.AddRange(new Organization { Name = "LessonCue Demo", SignageModelVersion = 1 },
                lessonClass, lesson, main);
            await db.SaveChangesAsync(cancellationToken);

            await SeedData.RunAsync(db, dataDirectory.FullName);

            var repaired = await db.Lessons
                .Include(x => x.Items)
                .SingleAsync(x => x.Id == lesson.Id, cancellationToken);
            Assert.Equal(["preRoll", "countdown", "lesson", "postLesson"],
                repaired.Items.OrderBy(x => x.Position).Select(x => x.Role).ToArray());
            Assert.True(repaired.PreRollEnabled);
            Assert.Contains(repaired.Items, item => item.Id == repaired.CountdownItemId);
        }
        finally
        {
            dataDirectory.Delete(recursive: true);
        }
    }
}
