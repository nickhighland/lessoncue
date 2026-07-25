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
            Rotation: 245, ZIndex: 400, Opacity: -4, Fit: "invalid", Locked: true, Hidden: true, FlipX: true));
        Assert.Equal(180, zone.Rotation);
        Assert.Equal(100, zone.ZIndex);
        Assert.Equal(0, zone.Opacity);
        Assert.Equal("cover", zone.Fit);
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
