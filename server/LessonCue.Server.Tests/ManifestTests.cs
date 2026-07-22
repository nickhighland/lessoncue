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
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1),
            VolumePercent = 80
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
            CuePointsJson = "[{\"Name\":\"Discussion\",\"PositionMs\":42000}]",
            VolumePercent = 75,
            FitMode = "fill",
            RotationDegrees = 90,
            CropLeftPercent = 4,
            CropTopPercent = 5,
            CropRightPercent = 6,
            CropBottomPercent = 7,
            PlaybackRatePercent = 125,
            RepeatCount = 3,
            FlexibleTime = true,
            BackgroundColor = "#123456",
            TransitionStyle = "fade-black",
            TransitionDurationMs = 900
        });
        db.AddRange(lessonClass, screen, lesson, media, new SignagePlaylist
        {
            Name = "Lobby notice", Enabled = true, TargetTagsCsv = "elementary",
            MediaAssetId = media.Id,
            LayoutPreset = "sidebar",
            ZonesJson = SignageLayout.StoreZones([
                new SignageZoneInput("welcome", "text", "Welcome", "Today at LessonCue", X: 0, Y: 0, Width: 68, Height: 100),
                new SignageZoneInput("weather", "weather", "Conditions", "Weather unavailable", SourceUrl: "https://weather.example/current", X: 69, Y: 0, Width: 31, Height: 50),
                new SignageZoneInput("media", "media", "Highlights", MediaAssetId: media.Id, X: 69, Y: 51, Width: 31, Height: 49)
            ]),
            WidgetCacheJson = SignageLayout.StoreCache([new SignageWidgetCacheEntry("weather", "Conditions", "72°", ["Clear"], DateTimeOffset.UtcNow)]),
            WidgetCacheUpdatedAt = DateTimeOffset.UtcNow,
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
        Assert.Contains("\"LayoutPreset\":\"sidebar\"", json);
        Assert.Contains("Today at LessonCue", json);
        Assert.Contains($"signage-{lobbySign.Id}-zone-media", json);
        Assert.Contains($"signage-{lobbySign.Id}", json);
        Assert.True(json.IndexOf("Urgent notice", StringComparison.Ordinal) < json.IndexOf("Lobby notice", StringComparison.Ordinal));
        Assert.True(json.IndexOf("Lobby notice", StringComparison.Ordinal) < json.IndexOf("Idle fallback", StringComparison.Ordinal));
        using var document = JsonDocument.Parse(json);
        var lobby = document.RootElement.GetProperty("signage").EnumerateArray().Single(item => item.GetProperty("Name").GetString() == "Lobby notice");
        var weather = lobby.GetProperty("zones").EnumerateArray().Single(zone => zone.GetProperty("Type").GetString() == "weather");
        Assert.Equal("72°", weather.GetProperty("cached").GetProperty("Text").GetString());
        var cue = document.RootElement.GetProperty("playlists")[0].GetProperty("items")[0];
        Assert.Equal(60, cue.GetProperty("volumePercent").GetInt32());
        Assert.Equal("fill", cue.GetProperty("FitMode").GetString());
        Assert.Equal(90, cue.GetProperty("RotationDegrees").GetInt32());
        Assert.Equal(4, cue.GetProperty("CropLeftPercent").GetInt32());
        Assert.Equal(125, cue.GetProperty("PlaybackRatePercent").GetInt32());
        Assert.Equal(3, cue.GetProperty("RepeatCount").GetInt32());
        Assert.True(cue.GetProperty("FlexibleTime").GetBoolean());
        Assert.Equal("#123456", cue.GetProperty("BackgroundColor").GetString());
        Assert.Equal("fade-black", cue.GetProperty("TransitionStyle").GetString());
        Assert.Equal(900, cue.GetProperty("TransitionDurationMs").GetInt32());
        Assert.DoesNotContain(document.RootElement.GetProperty("signage").EnumerateArray(),
            item => item.GetProperty("Name").GetString() == "Future notice");
        Assert.Contains(document.RootElement.GetProperty("signageSchedule").EnumerateArray(),
            item => item.GetProperty("Name").GetString() == "Future notice");
    }
}
