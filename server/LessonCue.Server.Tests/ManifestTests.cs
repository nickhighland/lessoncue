using System.Text.Json;
using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ManifestTests
{
    [Fact]
    public async Task BuildsScheduledManifestOnSqlite()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);

        var lessonClass = new LessonClass { Name = "Elementary" };
        var screen = new Screen { Name = "Room 1", AssignedClassId = lessonClass.Id, TagsCsv = "elementary" };
        var lesson = new Lesson
        {
            ClassId = lessonClass.Id,
            Date = DateOnly.FromDateTime(DateTime.UtcNow),
            Title = "Current lesson",
            AvailableFrom = DateTimeOffset.UtcNow.AddHours(-1),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1)
        };
        db.AddRange(lessonClass, screen, lesson, new SignagePlaylist
        {
            Name = "Lobby notice", Enabled = true, TargetTagsCsv = "elementary",
            StartsAt = DateTimeOffset.UtcNow.AddHours(-1), EndsAt = DateTimeOffset.UtcNow.AddHours(1)
        });
        await db.SaveChangesAsync(cancellationToken);

        var manifest = await new ManifestService(db).BuildAsync(screen.Id, cancellationToken);
        var json = JsonSerializer.Serialize(manifest);
        Assert.Contains("Current lesson", json);
        Assert.Contains("Lobby notice", json);
    }
}
