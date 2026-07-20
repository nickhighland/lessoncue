using LessonCue.Server;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AdminRecoveryCommandTests
{
    [Fact]
    public async Task ResetRehashesPasswordAuditsAndInvalidatesSessions()
    {
        var ct = TestContext.Current.CancellationToken;
        var databasePath = Path.Combine(Path.GetTempPath(), $"lessoncue-recovery-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite($"Data Source={databasePath}").Options;
            await using (var db = new LessonCueDb(options))
            {
                await db.Database.EnsureCreatedAsync(ct);
                var account = new AdminAccount { Username = "owner", DisplayName = "Owner", PasswordHash = "pending",
                    MustChangePassword = true };
                account.PasswordHash = new PasswordHasher<AdminAccount>().HashPassword(account, "OldPassword1");
                db.AdminAccounts.Add(account);
                await db.SaveChangesAsync(ct);
            }

            await using (var db = new LessonCueDb(options))
                Assert.True(await AdminRecoveryCommand.ResetAsync(db, "OWNER", "NewPassword2", ct));

            await using (var db = new LessonCueDb(options))
            {
                var account = await db.AdminAccounts.SingleAsync(ct);
                Assert.Equal(2, account.SessionVersion);
                Assert.False(account.MustChangePassword);
                Assert.NotEqual(PasswordVerificationResult.Failed,
                    new PasswordHasher<AdminAccount>().VerifyHashedPassword(account, account.PasswordHash, "NewPassword2"));
                Assert.True(await db.AuditEvents.AnyAsync(x => x.Action == "user.password.reset" && x.Actor == "ssh-recovery", ct));
            }
        }
        finally { File.Delete(databasePath); }
    }

    [Theory]
    [InlineData("short")]
    [InlineData("alllowercase1")]
    [InlineData("ALLUPPERCASE1")]
    [InlineData("NoNumbersHere")]
    public void RecoveryUsesTheNormalPasswordPolicy(string password) =>
        Assert.Throws<ArgumentException>(() => AdminRecoveryCommand.ResetAsync(
            null!, "owner", password, TestContext.Current.CancellationToken).GetAwaiter().GetResult());

    [Fact]
    public async Task UpgradeAddsAccountLifecycleStateToExistingDatabases()
    {
        var ct = TestContext.Current.CancellationToken;
        var databasePath = Path.Combine(Path.GetTempPath(), $"lessoncue-account-upgrade-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite($"Data Source={databasePath}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"PendingApproval\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"PendingSetup\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"MustChangePassword\"", ct);

            await DatabaseUpgrade.ApplyAsync(db, ct);

            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "PRAGMA table_info(\"AdminAccounts\")";
            await using var reader = await command.ExecuteReaderAsync(ct);
            var columns = new List<string>();
            while (await reader.ReadAsync(ct)) columns.Add(reader.GetString(1));
            Assert.Contains("PendingApproval", columns);
            Assert.Contains("PendingSetup", columns);
            Assert.Contains("MustChangePassword", columns);
        }
        finally { File.Delete(databasePath); }
    }
}
