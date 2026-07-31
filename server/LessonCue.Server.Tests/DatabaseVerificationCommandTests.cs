using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class DatabaseVerificationCommandTests
{
    [Fact]
    public void FindsExplicitDatabasePath()
    {
        var expected = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "lessoncue.db"));

        Assert.True(DatabaseVerificationCommand.TryGetPath(
            new[] { "--verify-database", expected }, out var actual));
        Assert.Equal(expected, actual);
        Assert.False(DatabaseVerificationCommand.TryGetPath(
            new[] { "--verify-database" }, out _));
    }

    [Fact]
    public async Task AcceptsHealthyDatabaseAndRejectsCorruptFile()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-db-verify-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var healthy = Path.Combine(root, "healthy.db");
        var corrupt = Path.Combine(root, "corrupt.db");
        try
        {
            await using (var connection = new SqliteConnection($"Data Source={healthy}"))
            {
                await connection.OpenAsync(ct);
                await using var command = connection.CreateCommand();
                command.CommandText = "CREATE TABLE Example (Id INTEGER PRIMARY KEY, Value TEXT NOT NULL);";
                await command.ExecuteNonQueryAsync(ct);
            }
            await File.WriteAllTextAsync(corrupt, "not a SQLite database", ct);

            Assert.Equal(0, await DatabaseVerificationCommand.RunAsync(healthy, ct));
            Assert.Equal(3, await DatabaseVerificationCommand.RunAsync(corrupt, ct));
            Assert.Equal(2, await DatabaseVerificationCommand.RunAsync(Path.Combine(root, "missing.db"), ct));
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }
}
