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
        var lobbySign = new SignagePlaylist
        {
            Name = "Lobby notice", Mode = "sign", Enabled = true, TargetTagsCsv = "elementary",
            LayoutPreset = "sidebar"
        };
        var screen = new Screen
        {
            Name = "Room 1", AssignedClassId = lessonClass.Id, TagsCsv = "elementary",
            AssignedSignageId = lobbySign.Id
        };
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
        lobbySign.MediaAssetId = media.Id;
        lobbySign.ZonesJson = SignageLayout.StoreZones([
                new SignageZoneInput("welcome", "text", "Welcome", "Today at LessonCue", X: 0, Y: 0, Width: 68, Height: 100),
                new SignageZoneInput("weather", "weather", "Conditions", "Weather unavailable", SourceUrl: "https://weather.example/current", X: 69, Y: 0, Width: 31, Height: 50),
                new SignageZoneInput("media", "media", "Highlights", MediaAssetId: media.Id, X: 69, Y: 51, Width: 31, Height: 49,
                    Rotation: 17, ZIndex: 4, Opacity: 72, Fit: "contain", FlipX: true),
                new SignageZoneInput("connect", "qr", "Connect", QrValue: "https://lessoncue.local",
                    QrLabelRight: "Scan for details", QrPlacement: "left", X: 0, Y: 0, Width: 20, Height: 20),
                new SignageZoneInput("live", "stream", "Live event", SourceUrl: "rtmp://stream.example/live/private-key",
                    X: 10, Y: 10, Width: 40, Height: 40)
            ]);
        lobbySign.WidgetCacheJson = SignageLayout.StoreCache([
            new SignageWidgetCacheEntry("weather", "Conditions", "72°", ["Clear"], DateTimeOffset.UtcNow)
        ]);
        lobbySign.WidgetCacheUpdatedAt = DateTimeOffset.UtcNow;
        db.AddRange(new Organization { Name = "Test", SignageEnabled = true }, lessonClass, screen, lesson, media, lobbySign);
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
        Assert.Contains("\"LayoutPreset\":\"sidebar\"", json);
        Assert.Contains("Today at LessonCue", json);
        Assert.Contains($"signage-{lobbySign.Id}-zone-media", json);
        Assert.Contains($"signage-{lobbySign.Id}", json);
        using var document = JsonDocument.Parse(json);
        var manifestScreen = document.RootElement.GetProperty("screen");
        Assert.False(manifestScreen.GetProperty("SignageOnly").GetBoolean());
        Assert.False(manifestScreen.GetProperty("PermanentPairing").GetBoolean());
        var lobby = document.RootElement.GetProperty("signage").EnumerateArray().Single(item => item.GetProperty("Name").GetString() == "Lobby notice");
        var weather = lobby.GetProperty("zones").EnumerateArray().Single(zone => zone.GetProperty("Type").GetString() == "weather");
        Assert.Equal("72°", weather.GetProperty("cached").GetProperty("Text").GetString());
        var mediaZone = lobby.GetProperty("zones").EnumerateArray().Single(zone => zone.GetProperty("Type").GetString() == "media");
        Assert.Equal(17, mediaZone.GetProperty("Rotation").GetInt32());
        Assert.Equal(4, mediaZone.GetProperty("ZIndex").GetInt32());
        Assert.Equal(72, mediaZone.GetProperty("Opacity").GetInt32());
        Assert.Equal("contain", mediaZone.GetProperty("Fit").GetString());
        Assert.True(mediaZone.GetProperty("FlipX").GetBoolean());
        var qr = lobby.GetProperty("zones").EnumerateArray().Single(zone => zone.GetProperty("Type").GetString() == "qr");
        Assert.Equal("left", qr.GetProperty("QrPlacement").GetString());
        Assert.Equal("Scan for details", qr.GetProperty("QrLabelRight").GetString());
        var stream = lobby.GetProperty("zones").EnumerateArray().Single(zone => zone.GetProperty("Type").GetString() == "stream");
        Assert.Equal($"/api/v1/signage/{lobbySign.Id}/zones/live/stream/index.m3u8", stream.GetProperty("streamUrl").GetString());
        Assert.Equal(JsonValueKind.Null, stream.GetProperty("sourceUrl").ValueKind);
        Assert.DoesNotContain("private-key", json);
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
        Assert.Single(document.RootElement.GetProperty("signage").EnumerateArray());
        Assert.Single(document.RootElement.GetProperty("signageSchedule").EnumerateArray());
    }
}
