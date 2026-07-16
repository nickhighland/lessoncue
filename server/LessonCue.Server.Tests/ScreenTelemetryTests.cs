using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ScreenTelemetryTests
{
    [Fact]
    public void StatusAcknowledgesOnlyIssuedCommandsAndNormalizesPlaybackData()
    {
        var screen = new Screen { Name = "Room 101", ControlVersion = 8, AcknowledgedControlVersion = 3 };
        var lessonId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var now = new DateTimeOffset(2026, 7, 16, 12, 0, 0, TimeSpan.Zero);
        var input = new TvStatusInput(screen.Id, " 0.10.0 ", true, -1, 4, -2, 99,
            "PLAYING", lessonId, itemId, -50, 90_000, 175, null, 4, 3,
            " Classroom display ", " Android 14 ");

        ScreenTelemetry.Apply(screen, input, now, "192.168.1.20");

        Assert.Equal(8, screen.AcknowledgedControlVersion);
        Assert.Equal("playing", screen.PlaybackState);
        Assert.Equal(lessonId, screen.PlaybackLessonId);
        Assert.Equal(itemId, screen.PlaybackItemId);
        Assert.Equal(0, screen.PlaybackPositionMs);
        Assert.Equal(90_000, screen.PlaybackDurationMs);
        Assert.Equal(150, screen.PlaybackVolumePercent);
        Assert.Equal(4, screen.CachedItems);
        Assert.Equal(4, screen.TotalItems);
        Assert.Equal(now, screen.PlaybackUpdatedAt);
        Assert.Equal("0.10.0", screen.AppVersion);
        Assert.Equal("Classroom display", screen.DeviceModel);
        Assert.Equal(0, screen.FreeBytes);
        Assert.Equal(0, screen.FailedDownloads);
    }

    [Fact]
    public void InvalidStateBecomesAUsefulBoundedError()
    {
        var screen = new Screen { Name = "Room 102" };
        ScreenTelemetry.Apply(screen,
            new TvStatusInput(screen.Id, "1", true, 1, 1, 0, PlaybackState: "mystery", PlaybackError: new string('x', 1200)),
            DateTimeOffset.UtcNow);

        Assert.Equal("error", screen.PlaybackState);
        Assert.Equal(1000, screen.PlaybackError?.Length);
    }

    [Fact]
    public void DetailedDiagnosticsAreBoundedNormalizedAndClockAware()
    {
        var screen = new Screen { Name = "Room 103" };
        var now = new DateTimeOffset(2026, 7, 16, 12, 0, 0, TimeSpan.Zero);
        var input = new TvStatusInput(screen.Id, "0.18.0", true, 500, 9, 1,
            ClientTimeUnixMs: now.ToUnixTimeMilliseconds() + 7_500, NetworkLatencyMs: 84,
            CacheInventory: [new("item-1", "Welcome video", "cached", 1_024, 2_048)],
            DownloadQueue: [new("item-2", "Lesson video", "downloading", 512, 4_096)],
            CodecCapabilities: [new("video", "H.264 / AVC", true, "video/avc")],
            RecentErrors: [new(now.AddMinutes(-1), "download", new string('x', 700), "item-2")]);

        ScreenTelemetry.Apply(screen, input, now);

        Assert.Equal(7_500, screen.ClockOffsetMs);
        Assert.Equal(84, screen.NetworkLatencyMs);
        Assert.Equal("good", screen.NetworkQuality);
        Assert.Equal(now, screen.DiagnosticsUpdatedAt);
        Assert.Equal("Welcome video", JsonDocument.Parse(screen.CacheInventoryJson).RootElement[0].GetProperty("title").GetString());
        Assert.Equal("downloading", JsonDocument.Parse(screen.DownloadQueueJson).RootElement[0].GetProperty("state").GetString());
        Assert.True(JsonDocument.Parse(screen.CodecCapabilitiesJson).RootElement[0].GetProperty("supported").GetBoolean());
        Assert.Equal(500, JsonDocument.Parse(screen.RecentErrorsJson).RootElement[0].GetProperty("message").GetString()?.Length);
    }

    [Fact]
    public async Task UpgradeAddsPlaybackTelemetryToExistingDatabases()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Screens\" DROP COLUMN \"AcknowledgedControlVersion\"", cancellationToken);

        await DatabaseUpgrade.ApplyAsync(db, cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA table_info(\"Screens\")";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(1));
        Assert.Contains("AcknowledgedControlVersion", columns);
        Assert.Contains("PlaybackUpdatedAt", columns);
        Assert.Contains("DeviceModel", columns);
        Assert.Contains("CacheInventoryJson", columns);
        Assert.Contains("NetworkLatencyMs", columns);
        Assert.Contains("AllowDiagnosticScreenshots", columns);
        Assert.Contains("ScreenshotRelativePath", columns);
    }

    [Fact]
    public async Task DiagnosticCleanupDeletesExpiredImageAndDatabaseReference()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-screen-diagnostics-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "diagnostics", "screens"));
        var image = Path.Combine(root, "diagnostics", "screens", "expired.jpg");
        await File.WriteAllBytesAsync(image, [0xff, 0xd8, 0xff, 0xd9], cancellationToken);
        var services = new ServiceCollection();
        services.AddDbContext<LessonCueDb>(options => options.UseSqlite($"Data Source={Path.Combine(root, "test.db")}"));
        await using var provider = services.BuildServiceProvider();
        await using (var scope = provider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
            await db.Database.EnsureCreatedAsync(cancellationToken);
            db.Screens.Add(new Screen { Name = "Expired screen", ScreenshotStatus = "ready",
                ScreenshotCapturedAt = DateTimeOffset.UtcNow.AddHours(-25), ScreenshotRelativePath = Path.GetRelativePath(root, image) });
            await db.SaveChangesAsync(cancellationToken);
        }

        Assert.Equal(1, await ScreenDiagnosticCleanupService.CleanupAsync(
            provider.GetRequiredService<IServiceScopeFactory>(), root, DateTimeOffset.UtcNow, cancellationToken));
        Assert.False(File.Exists(image));
        await using (var scope = provider.CreateAsyncScope())
        {
            var screen = await scope.ServiceProvider.GetRequiredService<LessonCueDb>().Screens.SingleAsync(cancellationToken);
            Assert.Equal("none", screen.ScreenshotStatus);
            Assert.Null(screen.ScreenshotRelativePath);
        }
        Directory.Delete(root, true);
    }
}
