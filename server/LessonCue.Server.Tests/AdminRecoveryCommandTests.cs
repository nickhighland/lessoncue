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
                    MustChangePassword = true, TotpSecretProtected = "protected-secret", TotpEnabled = true,
                    TotpLastCounter = 42, TotpEnabledAt = DateTimeOffset.UtcNow };
                account.PasswordHash = new PasswordHasher<AdminAccount>().HashPassword(account, "OldPassword1");
                db.AdminAccounts.Add(account);
                db.Organizations.Add(new Organization { Name = "Recovery Test", RequireMfaForAllUsers = true });
                await db.SaveChangesAsync(ct);
            }

            await using (var db = new LessonCueDb(options))
                Assert.True(await AdminRecoveryCommand.ResetAsync(db, "OWNER", "NewPassword2", ct));

            await using (var db = new LessonCueDb(options))
            {
                var account = await db.AdminAccounts.SingleAsync(ct);
                Assert.Equal(2, account.SessionVersion);
                Assert.False(account.MustChangePassword);
                Assert.False(account.TotpEnabled);
                Assert.Null(account.TotpSecretProtected);
                Assert.Equal(0, account.TotpLastCounter);
                Assert.Null(account.TotpEnabledAt);
                Assert.False(await db.Organizations.Select(item => item.RequireMfaForAllUsers).SingleAsync(ct));
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
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Organizations\" DROP COLUMN \"RequireMfaForAllUsers\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"PendingApproval\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"PendingSetup\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"MustChangePassword\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"TotpSecretProtected\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"TotpEnabled\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"TotpLastCounter\"", ct);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"TotpEnabledAt\"", ct);

            await DatabaseUpgrade.ApplyAsync(db, ct);

            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "PRAGMA table_info(\"AdminAccounts\")";
            await using var reader = await command.ExecuteReaderAsync(ct);
            var columns = new List<string>();
            while (await reader.ReadAsync(ct)) columns.Add(reader.GetString(1));
            Assert.Contains("PendingApproval", columns);
            Assert.Contains("PendingSetup", columns);
            Assert.Contains("MustChangePassword", columns);
            Assert.Contains("TotpSecretProtected", columns);
            Assert.Contains("TotpEnabled", columns);
            Assert.Contains("TotpLastCounter", columns);
            Assert.Contains("TotpEnabledAt", columns);

            await using var organizationCommand = db.Database.GetDbConnection().CreateCommand();
            organizationCommand.CommandText = "PRAGMA table_info(\"Organizations\")";
            await using var organizationReader = await organizationCommand.ExecuteReaderAsync(ct);
            var organizationColumns = new List<string>();
            while (await organizationReader.ReadAsync(ct)) organizationColumns.Add(organizationReader.GetString(1));
            Assert.Contains("RequireMfaForAllUsers", organizationColumns);
        }
        finally { File.Delete(databasePath); }
    }
}
