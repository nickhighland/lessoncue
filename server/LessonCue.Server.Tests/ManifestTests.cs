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
        var media = new MediaAsset
        {
            FileName = "guided.mov", ContentType = "video/quicktime", RelativePath = "guided.mov",
            Sha256 = "original", SizeBytes = 100, CompatibilityStatus = "ready",
            CompatibilityPath = "guided-compatible.mp4", CompatibilitySha256 = "compatible", CompatibilitySizeBytes = 80,
            OfflineEligible = true
        };
        lesson.Items.Add(new PlaylistItem
        {
            Title = "Guided example",
            Type = "video",
            MediaAssetId = media.Id,
            CuePointsJson = "[{\"Name\":\"Discussion\",\"PositionMs\":42000}]"
        });
        db.AddRange(lessonClass, screen, lesson, media, new SignagePlaylist
        {
            Name = "Lobby notice", Enabled = true, TargetTagsCsv = "elementary",
            StartsAt = DateTimeOffset.UtcNow.AddHours(-1), EndsAt = DateTimeOffset.UtcNow.AddHours(1)
        });
        await db.SaveChangesAsync(cancellationToken);

        var manifest = await new ManifestService(db).BuildAsync(screen.Id, cancellationToken);
        var json = JsonSerializer.Serialize(manifest);
        Assert.Contains("Current lesson", json);
        Assert.Contains("Lobby notice", json);
        Assert.Contains("Discussion", json);
        Assert.Contains("42000", json);
        Assert.Contains($"/api/v1/media/{media.Id}/playback", json);
        Assert.Contains("\"contentType\":\"video/mp4\"", json);
        Assert.Contains("\"fileExtension\":\"mp4\"", json);
        Assert.Contains("\"sha256\":\"compatible\"", json);
    }
}
