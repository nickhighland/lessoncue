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
}
