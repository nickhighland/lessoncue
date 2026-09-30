using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

/// <summary>
/// Looks up one-time account links without asking SQLite to compare a
/// DateTimeOffset column with a parameter. SQLite's DateTimeOffset converter
/// stores the value as text, and the comparison can otherwise fail at runtime
/// on setup, verification, and password-reset requests.
/// </summary>
internal static class AccountTokenLookup
{
    public static async Task<AccountToken?> FindAsync(
        LessonCueDb db, string raw, string purpose, CancellationToken ct)
    {
        var hash = AccountEmailService.Hash(raw);
        var token = await db.AccountTokens
            .Include(x => x.Account)
            .SingleOrDefaultAsync(x =>
                x.TokenHash == hash && x.Purpose == purpose && x.UsedAt == null, ct);

        return token is not null && token.ExpiresAt > DateTimeOffset.UtcNow ? token : null;
    }
}
