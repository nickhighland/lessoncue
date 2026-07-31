using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ServerReadinessTests
{
    [Fact]
    public async Task ReportsHealthyWhenDatabaseAndPersistentStorageAreAvailable()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-readiness-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(ct);

        try
        {
            var serverId = Guid.NewGuid();
            var report = await ServerReadiness.CheckAsync(db, root, serverId, ct);

            Assert.Equal("healthy", report.Status);
            Assert.True(report.Checks.Database);
            Assert.True(report.Checks.Storage);
            Assert.Equal(serverId, report.ServerId);
            Assert.Empty(Directory.EnumerateFiles(Path.Combine(root, "config"), ".readiness-*"));
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    [Fact]
    public async Task ReportsUnhealthyWhenPersistentStorageCannotBeWritten()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-readiness-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(Path.Combine(root, "config"), "blocks the required directory", ct);
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(ct);

        try
        {
            var report = await ServerReadiness.CheckAsync(db, root, Guid.NewGuid(), ct);

            Assert.Equal("unhealthy", report.Status);
            Assert.True(report.Checks.Database);
            Assert.False(report.Checks.Storage);
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }
}
