using System.Text.Json;
using LessonCue.Server;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class SignageStudioTests
{
    [Fact]
    public void LayoutDraftAndPublishedVersionsRemainIndependent()
    {
        var layout = new SignageLayoutResource { Name = "Campus board", Version = 0 };
        SignageStudio.ApplyLayout(layout, new("Campus board", "Campus", "Reusable",
            true, "#123456", 1080, 1920, 5, [new("title", "text", Content: "Draft")]));
        Assert.Equal("draft", layout.PublishState);
        Assert.Empty(SignageLayout.ParseZones(layout.PublishedZonesJson));

        SignageStudio.Publish(layout);
        Assert.Equal(layout.Version, layout.PublishedVersion);
        Assert.Equal("Draft", Assert.Single(SignageLayout.ParseZones(layout.PublishedZonesJson)).Content);

        SignageStudio.ApplyLayout(layout, new("Campus board", "Campus", "Reusable",
            true, "#123456", 1080, 1920, 5, [new("title", "text", Content: "Next draft")]));
        Assert.Equal("changes", layout.PublishState);
        Assert.Equal("Draft", Assert.Single(SignageLayout.ParseZones(layout.PublishedZonesJson)).Content);
        Assert.Equal("Next draft", Assert.Single(SignageLayout.ParseZones(layout.DraftZonesJson)).Content);
    }

    [Fact]
    public void ValidatesNestedAndOnlinePlaylistEntries()
    {
        Assert.Contains("absolute HTTP", SignageStudio.ValidatePlaylist(new("News", "", "ordered", "region",
            [new("feed", "cloud", SourceUrl: "/relative")])));
        Assert.Null(SignageStudio.ValidatePlaylist(new("News", "", "random", "region",
            [new("feed", "cloud", SourceUrl: "https://content.example.edu/signage.csv", DurationSeconds: 30)])));
    }

    [Fact]
    public void CustomWebAppsRequireAnApprovedOrigin()
    {
        var zone = new SignageZoneInput("custom", "customHtml", SourceUrl: "https://apps.example.edu/board");
        Assert.Contains("Approve https://apps.example.edu",
            SignageLayout.Validate([zone], []) ?? "");
        Assert.Null(SignageLayout.Validate([zone], ["https://apps.example.edu"]));
    }

    [Fact]
    public async Task ManifestUsesPublishedReusableLayoutAndPlaylist()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        await using var db = new LessonCueDb(new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(ct);
        db.Organizations.Add(new Organization { Name = "Test" });
        var screen = new Screen { Name = "Lobby" };
        var layout = new SignageLayoutResource
        {
            Name = "Published layout", PublishedVersion = 3, Version = 4, PublishState = "changes",
            PublishedZonesJson = SignageLayout.StoreZones([
                new("published", "text", Content: "Published content",
                    RichTextJson: """[{"text":"Published","bold":true,"color":"#d89028"}]""",
                    FontFamily: "Georgia", FontSize: 64, FontWeight: 700, LineHeightPercent: 135,
                    TextAlign: "center"),
                new("wifi", "wifi", Title: "Guest network", QrValue: "WIFI:T:WPA;S:Guest;P:example;;"),
                new("counter", "counter", Content: "Doors open", CounterTargetAt: DateTimeOffset.Parse("2026-08-01T12:00:00Z"))
            ]),
            DraftZonesJson = SignageLayout.StoreZones([new("draft", "text", Content: "Unpublished content")])
        };
        var playlist = new SignageContentPlaylist
        {
            Name = "Rotation", PublishedVersion = 2, Version = 3, PublishState = "changes",
            PublishedItemsJson = SignageStudio.StoreItems([new("layout-entry", "layout", "Board", LayoutId: layout.Id, DurationSeconds: 12)]),
            DraftItemsJson = SignageStudio.StoreItems([new("draft-entry", "web", "Draft", SourceUrl: "https://example.org")])
        };
        var schedule = new SignagePlaylist
        {
            Name = "Lobby signage", LayoutId = layout.Id, ContentPlaylistId = playlist.Id,
            PublishState = "changes",
            StartsAt = DateTimeOffset.UtcNow.AddMinutes(-5), EndsAt = DateTimeOffset.UtcNow.AddMinutes(5)
        };
        db.AddRange(screen, layout, playlist, schedule);
        await db.SaveChangesAsync(ct);

        var json = JsonSerializer.Serialize(await new ManifestService(db).BuildAsync(screen.Id, ct));
        Assert.Contains("Published content", json);
        Assert.Contains("layout-entry", json);
        Assert.DoesNotContain("Unpublished content", json);
        Assert.DoesNotContain("draft-entry", json);
        Assert.Contains("\"PublishState\":\"changes\"", json);
        Assert.Contains("\"RichTextJson\":\"[{\\u0022text\\u0022:\\u0022Published\\u0022", json);
        Assert.Contains("\"FontFamily\":\"Georgia\"", json);
        Assert.Contains("\"LineHeightPercent\":135", json);
        Assert.Contains("\"QrValue\":\"WIFI:T:WPA;S:Guest;P:example;;\"", json);
        Assert.Contains("\"CounterTargetAt\":\"2026-08-01T12:00:00+00:00\"", json);
    }

    [Fact]
    public async Task ApplianceUpgradeCreatesSignageStudioStorageIdempotently()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        await using var db = new LessonCueDb(new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(ct);
        foreach (var table in new[] { "SignageLayouts", "SignageContentPlaylists", "SignageEmergencyTemplates", "SignageProofRecords" })
        {
            await using var drop = connection.CreateCommand();
            drop.CommandText = $"DROP TABLE \"{table}\"";
            await drop.ExecuteNonQueryAsync(ct);
        }
        foreach (var column in new[] { "LayoutId", "ContentPlaylistId", "PublishState", "KioskEnabled" })
        {
            await using var drop = connection.CreateCommand();
            drop.CommandText = $"ALTER TABLE \"SignagePlaylists\" DROP COLUMN \"{column}\"";
            await drop.ExecuteNonQueryAsync(ct);
        }

        await DatabaseUpgrade.ApplyAsync(db, ct);
        await DatabaseUpgrade.ApplyAsync(db, ct);

        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('SignageLayouts','SignageContentPlaylists','SignageEmergencyTemplates','SignageProofRecords')) +" +
            "(SELECT COUNT(*) FROM pragma_table_info('SignagePlaylists') WHERE name IN ('LayoutId','ContentPlaylistId','PublishState','KioskEnabled'))";
        Assert.Equal(8L, (long)(await command.ExecuteScalarAsync(ct))!);
    }

    [Fact]
    public async Task SourceCredentialsAreEncryptedInTheLocalFile()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-signage-credentials-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var keys = Path.Combine(root, "keys");
            var store = new SignageCredentialStore(root, DataProtectionProvider.Create(new DirectoryInfo(keys)));
            await store.PutAsync("weather_api", "bearer", null, null, "never-write-this-plain", ct);
            var file = await File.ReadAllTextAsync(Path.Combine(root, "config", "signage-credentials.json"), ct);
            Assert.DoesNotContain("never-write-this-plain", file);
            Assert.Contains("weather_api", file);
        }
        finally { Directory.Delete(root, true); }
    }
}
