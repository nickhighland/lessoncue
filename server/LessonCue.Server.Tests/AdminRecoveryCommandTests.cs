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
                var account = new AdminAccount { Username = "owner", DisplayName = "Owner", PasswordHash = "pending" };
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
}
