using System.Text.Json;
using System.Text.Json.Nodes;
using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ProtocolContractTests
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    [Fact]
    public async Task CurrentManifestFixtureIsProducedByTheRealManifestService()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(ct);

        var now = new DateTimeOffset(2026, 7, 29, 16, 0, 0, TimeSpan.Zero);
        var classId = Guid.Parse("10000000-0000-0000-0000-000000000001");
        var lessonId = Guid.Parse("10000000-0000-0000-0000-000000000002");
        var itemId = Guid.Parse("10000000-0000-0000-0000-000000000003");
        var mediaId = Guid.Parse("10000000-0000-0000-0000-000000000004");
        var layoutId = Guid.Parse("10000000-0000-0000-0000-000000000005");
        var contentPlaylistId = Guid.Parse("10000000-0000-0000-0000-000000000006");
        var signId = Guid.Parse("10000000-0000-0000-0000-000000000007");
        var screenId = Guid.Parse("10000000-0000-0000-0000-000000000008");
        var audienceId = Guid.Parse("10000000-0000-0000-0000-000000000009");

        var lessonClass = new LessonClass { Id = classId, Name = "Schools Project" };
        var media = new MediaAsset
        {
            Id = mediaId,
            FileName = "Welcome image.png",
            RelativePath = "10000000000000000000000000000004.png",
            ContentType = "image/png",
            Sha256 = new string('a', 64),
            SizeBytes = 4096,
            ProcessingStatus = "ready",
            CompatibilityStatus = "not-needed",
            OfflineEligible = true,
            SourceKind = "presentation-slide"
        };
        var lesson = new Lesson
        {
            Id = lessonId,
            ClassId = classId,
            Class = lessonClass,
            Date = new DateOnly(2026, 7, 29),
            Title = "Display contract lesson",
            Version = 4,
            AvailableFrom = now.AddDays(-1),
            ExpiresAt = now.AddDays(1),
            DesignatedStartAt = now.AddMinutes(30),
            PreRollEnabled = false
        };
        lesson.Items.Add(new PlaylistItem
        {
            Id = itemId,
            LessonId = lessonId,
            MediaAssetId = mediaId,
            MediaAsset = media,
            Title = "Generated presentation slide",
            Type = "image",
            Role = "lesson",
            Position = 1,
            ImageDurationSeconds = 12,
            FadeInMs = 500,
            FadeOutMs = 750,
            Notes = "Presenter-only prompt",
            FlexibleTime = true,
            CuePointsJson = "[{\"name\":\"Discuss\",\"positionMs\":3000}]"
        });

        var zones = new[]
        {
            new SignageZoneInput(
                "presentation", "presentation", "Main rotation", SourceUrl: "rtmp://stream.example/live",
                X: 0, Y: 0, Width: 75, Height: 75, ContentPlaylistId: contentPlaylistId,
                StreamOverrideWhenLive: true, StreamOverrideStartsAt: now.AddHours(-1),
                StreamOverrideEndsAt: now.AddHours(1)),
            new SignageZoneInput(
                "weather", "weather", "Rochester", X: 75, Y: 0, Width: 25, Height: 50,
                WeatherProvider: "open-meteo", WeatherPostalCode: "14604",
                WeatherFields: "icon,temperature,high,low,humidity,sunrise,sunset"),
            new SignageZoneInput(
                "poll", "audience", "Audience poll", "Vote now", X: 75, Y: 50, Width: 25, Height: 25,
                AudienceSessionId: audienceId, AudienceCode: "ABC123", AudienceShowResults: true,
                AudienceResultDelaySeconds: 30),
            new SignageZoneInput(
                "message", "text", "Welcome", "Learn, grow, and thrive.", X: 0, Y: 75, Width: 75, Height: 25,
                RichTextJson: "[{\"text\":\"Learn, grow, and thrive.\",\"bold\":true}]",
                TextAlign: "center")
        };
        var layout = new SignageLayoutResource
        {
            Id = layoutId,
            Name = "Information frame",
            BackgroundColor = "#17201e",
            CanvasWidth = 1920,
            CanvasHeight = 1080,
            SafeAreaPercent = 5,
            DraftZonesJson = SignageLayout.StoreZones(zones),
            PublishedZonesJson = SignageLayout.StoreZones(zones),
            Version = 3,
            PublishedVersion = 3,
            PublishState = "published",
            PublishedAt = now.AddDays(-1)
        };
        var contentPlaylist = new SignageContentPlaylist
        {
            Id = contentPlaylistId,
            Name = "Welcome rotation",
            PlaybackMode = "ordered",
            Synchronization = "screen",
            DraftItemsJson = SignageStudio.StoreItems([
                new SignageContentPlaylistItemInput(
                    "welcome-slide", "media", "Welcome image", MediaAssetId: mediaId,
                    DurationSeconds: 15, Transition: "fade", VolumePercent: 80,
                    FadeInMs: 500, FadeOutMs: 500, Fit: "contain")
            ]),
            Version = 2,
            PublishedVersion = 2,
            PublishState = "published",
            PublishedAt = now.AddDays(-1)
        };
        contentPlaylist.PublishedItemsJson = contentPlaylist.DraftItemsJson;
        var sign = new SignagePlaylist
        {
            Id = signId,
            Name = "Main lobby sign",
            Mode = "sign",
            LayoutId = layoutId,
            ContentPlaylistId = contentPlaylistId,
            ZonePlaylistAssignmentsJson = SignageStudio.StorePlaylistAssignments(
                new Dictionary<string, Guid> { ["presentation"] = contentPlaylistId }),
            Enabled = true,
            Version = 5,
            PublishedVersion = 5,
            PublishState = "published",
            CreatedAt = now.AddDays(-2),
            UpdatedAt = now.AddMinutes(-10)
        };
        var screen = new Screen
        {
            Id = screenId,
            Name = "Lobby Android TV",
            Platform = "android-tv",
            AssignedClassId = classId,
            AssignedSignageId = signId,
            Site = "Main Campus",
            TagsCsv = "lobby,public",
            SignageWidth = 1920,
            SignageHeight = 1080
        };
        var audience = new AudienceSession
        {
            Id = audienceId,
            Title = "Welcome poll",
            Code = "ABC123",
            Status = "open",
            ShowLiveResults = true,
            CreatedAt = now.AddHours(-1),
            UpdatedAt = now.AddMinutes(-5),
            PurgeAt = now.AddDays(7)
        };
        var weatherCache = new SignageWidgetCacheEntry(
            "weather", "Rochester", "72°F", ["Sunny", "High 78°F", "Low 61°F"], now.AddMinutes(-5),
            Icon: "clear-day",
            Weather: new SignageWeatherSnapshot(72, 71, 78, 61, 5, 40, 8, "°F", "mph",
                "Sunny", "Clear through this evening", "5:58 AM", "8:34 PM", "NW 8 mph"));
        sign.WidgetCacheJson = SignageLayout.StoreCache([weatherCache]);
        sign.WidgetCacheUpdatedAt = now.AddMinutes(-5);

        db.AddRange(
            new Organization { Name = "Protocol Contract", TimeZone = "UTC", SignageEnabled = true },
            lessonClass, media, lesson, layout, contentPlaylist, sign, screen, audience);
        await db.SaveChangesAsync(ct);

        var manifest = await new ManifestService(db).BuildAsync(screenId, ct, now);
        var actual = JsonNode.Parse(JsonSerializer.Serialize(manifest, WebJson))!.AsObject();
        // The version is an opaque cache-busting value and is deliberately not a
        // cross-process contract field. Normalize only that volatile value.
        actual["manifestVersion"] = 1;

        var root = FindRepositoryRoot();
        var fixture = Path.Combine(root, "protocol", "fixtures", "manifest-v1-current.json");
        if (Environment.GetEnvironmentVariable("LESSONCUE_WRITE_PROTOCOL_FIXTURES") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(fixture)!);
            await File.WriteAllTextAsync(fixture, actual.ToJsonString(WebJson) + Environment.NewLine, ct);
        }

        Assert.True(File.Exists(fixture), $"Missing generated protocol fixture: {fixture}");
        var expected = JsonNode.Parse(await File.ReadAllTextAsync(fixture, ct));
        Assert.True(JsonNode.DeepEquals(expected, actual),
            "The committed manifest fixture drifted from ManifestService. Regenerate it intentionally with LESSONCUE_WRITE_PROTOCOL_FIXTURES=1.");
    }

    private static string FindRepositoryRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (Directory.Exists(Path.Combine(current.FullName, "protocol")) &&
                File.Exists(Path.Combine(current.FullName, "package.json")))
                return current.FullName;
            current = current.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate the LessonCue repository root.");
    }
}
