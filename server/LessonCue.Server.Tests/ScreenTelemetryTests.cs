using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
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
    }
}
