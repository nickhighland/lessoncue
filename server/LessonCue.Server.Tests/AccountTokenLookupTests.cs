using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AccountTokenLookupTests
{
    [Fact]
    public async Task Looks_up_live_token_and_checks_expiry_in_memory_for_sqlite()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);

        var account = new AdminAccount
        {
            Username = "pending-account",
            PasswordHash = "hash",
            PendingSetup = true
        };
        db.AdminAccounts.Add(account);
        db.AccountTokens.AddRange(
            new AccountToken
            {
                AccountId = account.Id,
                Purpose = "setup",
                TokenHash = AccountEmailService.Hash("live-token"),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(5)
            },
            new AccountToken
            {
                AccountId = account.Id,
                Purpose = "setup",
                TokenHash = AccountEmailService.Hash("expired-token"),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-5)
            });
        await db.SaveChangesAsync(cancellationToken);

        var live = await AccountTokenLookup.FindAsync(db, " live-token ", "setup", cancellationToken);
        var expired = await AccountTokenLookup.FindAsync(db, "expired-token", "setup", cancellationToken);

        Assert.NotNull(live);
        Assert.NotNull(live!.Account);
        Assert.Equal(account.Id, live.AccountId);
        Assert.Null(expired);
    }
}
