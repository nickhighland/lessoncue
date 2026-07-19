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
            DesignatedStartAt = new DateTimeOffset(2026, 7, 25, 9, 0, 0, TimeSpan.FromHours(-4)),
            PreRollStartsAt = new DateTimeOffset(2026, 7, 25, 8, 30, 0, TimeSpan.FromHours(-4)),
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
            MediaAssetId = media.Id,
            StartsAt = DateTimeOffset.UtcNow.AddHours(-1), EndsAt = DateTimeOffset.UtcNow.AddHours(1)
        }, new SignagePlaylist
        {
            Name = "Idle fallback", Mode = "idle", Enabled = true, Priority = 100
        }, new SignagePlaylist
        {
            Name = "Urgent notice", Mode = "emergency", Enabled = true, Priority = 1
        }, new SignagePlaylist
        {
            Name = "Future notice", Mode = "scheduled", Enabled = true,
            StartsAt = DateTimeOffset.UtcNow.AddDays(1), EndsAt = DateTimeOffset.UtcNow.AddDays(2)
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
        Assert.Contains("\"designatedStartAt\":\"2026-07-25T13:00:00Z\"", json);
        Assert.Contains("\"preRollStartsAt\":\"2026-07-25T12:30:00Z\"", json);
        Assert.Contains("\"signageSchedule\"", json);
        var lobbySign = await db.SignagePlaylists.SingleAsync(item => item.Name == "Lobby notice", cancellationToken);
        Assert.Contains($"signage-{lobbySign.Id}", json);
        Assert.True(json.IndexOf("Urgent notice", StringComparison.Ordinal) < json.IndexOf("Lobby notice", StringComparison.Ordinal));
        Assert.True(json.IndexOf("Lobby notice", StringComparison.Ordinal) < json.IndexOf("Idle fallback", StringComparison.Ordinal));
        using var document = JsonDocument.Parse(json);
        Assert.DoesNotContain(document.RootElement.GetProperty("signage").EnumerateArray(),
            item => item.GetProperty("Name").GetString() == "Future notice");
        Assert.Contains(document.RootElement.GetProperty("signageSchedule").EnumerateArray(),
            item => item.GetProperty("Name").GetString() == "Future notice");
    }
}
