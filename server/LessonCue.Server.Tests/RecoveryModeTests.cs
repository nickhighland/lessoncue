using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class RecoveryModeTests
{
    [Fact]
    public async Task RecoveryStatusFindsBackupsWithoutExposingDatabaseErrorDetails()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(
            Path.GetTempPath(), $"lessoncue-recovery-mode-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "backups"));
        try
        {
            await File.WriteAllTextAsync(
                Path.Combine(root, "backups", "older.zip"), "old", ct);
            await Task.Delay(20, ct);
            await File.WriteAllTextAsync(
                Path.Combine(root, "backups", "newest.lcbak"), "new", ct);
            var failure = new SqliteException(
                "secret filesystem detail that must not leave the server", 11);

            var status = RecoveryModeApp.BuildStatus(
                root, "server-123", failure);

            Assert.True(status.SafeMode);
            Assert.False(status.Ready);
            Assert.Equal("database", status.FailureArea);
            Assert.Equal(2, status.LocalBackupCount);
            Assert.Equal("newest.lcbak", status.LatestBackupFileName);
            Assert.DoesNotContain("secret filesystem", status.Message);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}
