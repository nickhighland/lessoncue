using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class SignageLayoutTests
{
    [Fact]
    public void RequiresOnlineWidgetOriginsToBeExplicitlyApproved()
    {
        var zone = new SignageZoneInput("news", "rss", "News", SourceUrl: "https://feeds.example.org/news",
            X: 0, Y: 0, Width: 100, Height: 100);
        Assert.Contains("Approve https://feeds.example.org", SignageLayout.Validate([zone], []));
        Assert.Null(SignageLayout.Validate([zone], ["https://feeds.example.org"]));
    }

    [Fact]
    public void AcceptsApprovedIcalendarSourcesAndParsesEventSummaries()
    {
        var zone = new SignageZoneInput("events", "calendar", "Upcoming",
            SourceUrl: "https://calendar.example.org/public/events.ics");
        Assert.Contains("Approve https://calendar.example.org", SignageLayout.Validate([zone], []));
        Assert.Null(SignageLayout.Validate([zone], ["https://calendar.example.org"]));

        const string payload = """
            BEGIN:VCALENDAR
            VERSION:2.0
            BEGIN:VEVENT
            SUMMARY:Community breakfast
            END:VEVENT
            BEGIN:VEVENT
            SUMMARY;LANGUAGE=en-US:Volunteer orientation
            END:VEVENT
            END:VCALENDAR
            """;
        var parsed = SignageWidgetService.Parse(zone, payload, DateTimeOffset.Parse("2026-07-26T12:00:00Z"));
        Assert.Equal(["Community breakfast", "Volunteer orientation"], parsed.Items);
        Assert.Equal(zone.SourceUrl, parsed.Source);
    }

    [Fact]
    public void RejectsZonesOutsideTheCanvas()
    {
        var zone = new SignageZoneInput("clock", "clock", X: 80, Y: 0, Width: 30, Height: 100);
        Assert.Contains("100 × 100", SignageLayout.Validate([zone], []));
    }

    [Fact]
    public void IgnoresBlankSourcesWhenAZoneTypeChanges()
    {
        var zone = new SignageZoneInput("clock", "clock", SourceUrl: "");
        Assert.Null(SignageLayout.Validate([zone], []));
        Assert.Null(SignageLayout.Normalize(zone).SourceUrl);
    }

    [Theory]
    [InlineData("rtmp://camera.example.org/live/stream-key")]
    [InlineData("rtmps://camera.example.org/live/stream-key")]
    [InlineData("rtsp://camera.example.org/channel")]
    [InlineData("https://camera.example.org/live/index.m3u8")]
    public void AcceptsSupportedLiveStreamProtocols(string address)
    {
        var zone = new SignageZoneInput("live", "stream", "Live", SourceUrl: address);
        Assert.Null(SignageLayout.Validate([zone], []));
    }

    [Fact]
    public void NormalizesAdvancedCanvasProperties()
    {
        var zone = SignageLayout.Normalize(new SignageZoneInput("hero", "media", MediaAssetId: Guid.NewGuid(),
            Rotation: 245, ZIndex: 400, Opacity: -4, Fit: "invalid", Locked: true, Hidden: true, FlipX: true,
            ContentPadding: 80, ContentScale: 4, VerticalAlign: "invalid"));
        Assert.Equal(180, zone.Rotation);
        Assert.Equal(100, zone.ZIndex);
        Assert.Equal(0, zone.Opacity);
        Assert.Equal("cover", zone.Fit);
        Assert.Equal(30, zone.ContentPadding);
        Assert.Equal(25, zone.ContentScale);
        Assert.Equal("middle", zone.VerticalAlign);
        Assert.True(zone.Locked);
        Assert.True(zone.Hidden);
        Assert.True(zone.FlipX);
    }

    [Fact]
    public void ParsesRssAndWeatherIntoDisplaySafeCacheEntries()
    {
        var now = DateTimeOffset.Parse("2026-07-22T12:00:00Z");
        var rss = SignageWidgetService.Parse(new SignageZoneInput("news", "rss"),
            "<rss><channel><title>Campus News</title><item><title>Science fair today</title></item></channel></rss>", now);
        var weather = SignageWidgetService.Parse(new SignageZoneInput("weather", "weather", "Outside"),
            "{\"current_weather\":{\"temperature\":72}}", now);
        Assert.Equal("Campus News", rss.Title);
        Assert.Equal("Science fair today", Assert.Single(rss.Items));
        Assert.Equal("72°", weather.Text);
    }

    [Fact]
    public void BuildsAndParsesKeylessOpenMeteoWeather()
    {
        var zone = SignageLayout.Normalize(new SignageZoneInput("weather", "weather", "Weather",
            WeatherProvider: "open-meteo", WeatherLocation: "Bellingham, WA", WeatherLatitude: 48.7519,
            WeatherLongitude: -122.4787, WeatherUnits: "fahrenheit",
            WeatherFields: "icon,conditions,temperature,high,low,precipitation,humidity,wind"));
        var source = SignageWidgetService.WeatherSource(zone);
        Assert.StartsWith("https://api.open-meteo.com/v1/forecast?", source);
        Assert.Contains("latitude=48.7519", source);
        Assert.Null(SignageLayout.Validate([zone], []));

        const string payload = """
            {
              "current": {
                "temperature_2m": 72,
                "apparent_temperature": 70,
                "relative_humidity_2m": 54,
                "weather_code": 2,
                "wind_speed_10m": 8
              },
              "current_units": { "temperature_2m": "°F", "wind_speed_10m": "mph" },
              "daily": {
                "temperature_2m_max": [75],
                "temperature_2m_min": [59],
                "precipitation_probability_max": [20],
                "weather_code": [2]
              }
            }
            """;
        var weather = SignageWidgetService.Parse(zone, payload, DateTimeOffset.Parse("2026-07-25T12:00:00Z"));
        Assert.Equal("Bellingham, WA", weather.Title);
        Assert.Contains("🌤️", weather.Text);
        Assert.Contains("72°F", weather.Text);
        Assert.Contains("High 75°F", weather.Items);
        Assert.Contains("Low 59°F", weather.Items);
        Assert.Contains("Precipitation 20%", weather.Items);
    }

    [Fact]
    public void WeatherPresetsAllowPlaceholdersButValidateStartedLocationsAndCustomSources()
    {
        var preset = new SignageZoneInput("weather", "weather", WeatherProvider: "open-meteo");
        Assert.Null(SignageLayout.Validate([preset], []));
        var incomplete = preset with { WeatherLatitude = 48.7 };
        Assert.Contains("latitude and longitude", SignageLayout.Validate([incomplete], []));
        var custom = new SignageZoneInput("weather", "weather", SourceUrl: "https://weather.example/data",
            WeatherProvider: "custom");
        Assert.Contains("Approve https://weather.example", SignageLayout.Validate([custom], []));
        Assert.Null(SignageLayout.Validate([custom], ["https://weather.example"]));
    }

    [Fact]
    public void NormalizesInteractiveQrClockAndWeeklyCountdownControls()
    {
        var zone = SignageLayout.Normalize(new SignageZoneInput("details", "qr", Content: "https://lessoncue.local",
            QrLabelTop: "Scan to begin", QrLabelBottom: "Open LessonCue", QrLabelLeft: "Left",
            QrLabelRight: "Right", CounterRepeatWeekly: true, ClockDisplay: "both",
            ClockTimeFormat: "24h", ClockDateFormat: "medium", ClockOrder: "date-time",
            ClockTimeFontSize: 72, ClockDateFontSize: 30));
        Assert.Equal("Scan to begin", zone.QrLabelTop);
        Assert.Equal("Open LessonCue", zone.QrLabelBottom);
        Assert.Equal("24h", zone.ClockTimeFormat);
        Assert.Equal("date-time", zone.ClockOrder);
        Assert.Equal(72, zone.ClockTimeFontSize);
    }

    [Fact]
    public void AcceptsPostalWeatherAndRejectsRemovedElementTypes()
    {
        var weather = new SignageZoneInput("weather", "weather", WeatherProvider: "open-meteo",
            WeatherPostalCode: "98225");
        Assert.Null(SignageLayout.Validate([weather], []));
        Assert.Contains("Unsupported signage zone type", SignageLayout.Validate(
            [new SignageZoneInput("old-dashboard", "dashboard")], []));
    }

    [Fact]
    public void PresentationAllowsAPlaceholderAndValidatesAnyLiveStream()
    {
        Assert.Null(SignageLayout.Validate([new SignageZoneInput("main", "presentation")], []));
        Assert.Null(SignageLayout.Validate([new SignageZoneInput("main", "presentation",
            ContentPlaylistId: Guid.NewGuid())], []));
        Assert.Null(SignageLayout.Validate([new SignageZoneInput("main", "presentation",
            SourceUrl: "rtmp://camera.example.org/live")], []));
        Assert.Contains("live overrides require",
            SignageLayout.Validate([new SignageZoneInput("main", "presentation",
                SourceUrl: "not-a-stream")], []));
    }

    [Fact]
    public async Task ApplianceUpgradeAddsLayoutAllowlistAndPersistentCacheColumnsIdempotently()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        await using var db = new LessonCueDb(new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(ct);
        foreach (var sql in new[]
        {
            "ALTER TABLE \"Organizations\" DROP COLUMN \"SignageSourceAllowlistJson\"",
            "ALTER TABLE \"SignagePlaylists\" DROP COLUMN \"LayoutPreset\"",
            "ALTER TABLE \"SignagePlaylists\" DROP COLUMN \"ZonesJson\"",
            "ALTER TABLE \"SignagePlaylists\" DROP COLUMN \"WidgetCacheJson\"",
            "ALTER TABLE \"SignagePlaylists\" DROP COLUMN \"WidgetCacheUpdatedAt\"",
            "ALTER TABLE \"SignagePlaylists\" DROP COLUMN \"WidgetCacheError\""
        }) await db.Database.ExecuteSqlRawAsync(sql, ct);

        await DatabaseUpgrade.ApplyAsync(db, ct);
        await DatabaseUpgrade.ApplyAsync(db, ct);

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT (SELECT COUNT(*) FROM pragma_table_info('Organizations') WHERE name='SignageSourceAllowlistJson') + " +
            "(SELECT COUNT(*) FROM pragma_table_info('SignagePlaylists') WHERE name IN ('LayoutPreset','ZonesJson','WidgetCacheJson','WidgetCacheUpdatedAt','WidgetCacheError'))";
        Assert.Equal(6L, (long)(await command.ExecuteScalarAsync(ct))!);
    }
}
