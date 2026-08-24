using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server.Activities;

/// <summary>
/// Hands out reserved game codes, and takes them back.
///
/// The short links behind these codes are permanent -- the shortener always
/// sends /Q7Z6 to the join page for Q7Z6 -- so a game starting or ending never
/// touches the shortener. All that changes is which session, if any, currently
/// owns the code. When none does, the join page says so in its usual way.
/// </summary>
public sealed class ReservedGameCodePool(LessonCueDb db, IActivityRandomSource random)
{
    /// <summary>Nothing is available, and the caller has to cope.</summary>
    public sealed class ExhaustedException() : InvalidOperationException(
        $"All {ReservedGameCodes.All.Count} reserved game codes are in use.");

    /// <summary>
    /// Codes spoken for by a session that has not finished.
    ///
    /// Ownership is read from live sessions rather than a separate ledger, so
    /// there is no second copy of the truth to drift out of step with the one
    /// the rest of the app already keeps.
    /// </summary>
    public async Task<IReadOnlyCollection<string>> InUseAsync(CancellationToken ct = default)
    {
        var groups = await db.ActivitySessionGroups
            .Where(group => group.Runs.Any(run => run.Status != ActivityRunStatuses.Ended))
            .Select(group => group.JoinCode)
            .ToListAsync(ct);
        var runs = await db.ActivityRuns
            .Where(run => run.Status != ActivityRunStatuses.Ended && run.JoinCode != null)
            .Select(run => run.JoinCode!)
            .ToListAsync(ct);

        return groups.Concat(runs)
            .Select(ReservedGameCodes.Normalize)
            .Where(ReservedGameCodes.IsReserved)
            .ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>Reserved codes nobody is using right now.</summary>
    public async Task<IReadOnlyList<string>> AvailableAsync(CancellationToken ct = default)
    {
        var taken = await InUseAsync(ct);
        return ReservedGameCodes.All.Where(code => !taken.Contains(code)).ToList();
    }

    /// <summary>
    /// Take one, at random.
    ///
    /// Random rather than in order: a room that meets every week should not be
    /// able to guess this week's code from last week's, and sequential
    /// allocation would hand out the same few codes over and over.
    ///
    /// The database's unique index on the join code is what actually settles a
    /// race between two games starting at once -- the loser retries and takes
    /// a different one -- so this only has to avoid the obvious collisions.
    /// </summary>
    public async Task<string> TakeAsync(CancellationToken ct = default)
    {
        var available = await AvailableAsync(ct);
        if (available.Count == 0) throw new ExhaustedException();
        return available[random.NextInt(0, available.Count)];
    }

    /// <summary>
    /// A code, if one is free. Null rather than throwing, for the callers that
    /// would rather fall back than fail.
    /// </summary>
    public async Task<string?> TryTakeAsync(CancellationToken ct = default)
    {
        var available = await AvailableAsync(ct);
        return available.Count == 0 ? null : available[random.NextInt(0, available.Count)];
    }

    /// <summary>
    /// How full the pool is, for the console.
    /// </summary>
    public async Task<(int Total, int Available, int Active)> StatusAsync(CancellationToken ct = default)
    {
        var taken = await InUseAsync(ct);
        return (ReservedGameCodes.All.Count, ReservedGameCodes.All.Count - taken.Count, taken.Count);
    }
}
