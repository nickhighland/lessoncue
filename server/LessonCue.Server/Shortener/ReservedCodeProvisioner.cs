using LessonCue.Server.Activities;

namespace LessonCue.Server.Shortener;

/// <summary>What one pass over the reserved codes did.</summary>
public sealed record ReservationReport(
    int Total,
    int AlreadyCorrect,
    int Created,
    int Repaired,
    IReadOnlyList<string> Conflicts,
    IReadOnlyList<string> Failures)
{
    /// <summary>A conflict needs a person: somebody else owns one of our slugs.</summary>
    public bool Degraded => Conflicts.Count > 0 || Failures.Count > 0;
    public int Present => AlreadyCorrect + Created + Repaired;
}

/// <summary>
/// Keeps the hundred reserved codes present, tagged, and pointing at the join
/// page -- and puts them back when they drift.
///
/// The links are permanent by design. A game starting or ending never comes
/// here; this only runs at install, on a schedule, and when an administrator
/// asks for a repair.
/// </summary>
public sealed class ReservedCodeProvisioner(ShlinkClient shlink)
{
    /// <summary>
    /// Where one reserved code should point.
    ///
    /// This reuses LessonCue's existing join route rather than inventing a
    /// second way in, so a phone arriving from a short link lands exactly where
    /// one arriving from the lobby QR does.
    /// </summary>
    public static string DestinationFor(string lessonCuePublicUrl, string code) =>
        $"{lessonCuePublicUrl.TrimEnd('/')}/play/{code}";

    private static readonly string[] Tags = [ReservedGameCodes.ReservedTag, ReservedGameCodes.SystemTag];

    /// <summary>
    /// Bring every reserved code into line, and report what needed doing.
    ///
    /// Safe to run as often as you like: a code that is already right is left
    /// alone, so this is the same call at install time and on the hundredth
    /// reconciliation afterwards.
    /// </summary>
    public async Task<ReservationReport> ReconcileAsync(
        string upstream, string apiKey, string domain, string lessonCuePublicUrl, CancellationToken ct = default)
    {
        var correct = 0;
        var created = 0;
        var repaired = 0;
        var conflicts = new List<string>();
        var failures = new List<string>();

        foreach (var code in ReservedGameCodes.All)
        {
            ct.ThrowIfCancellationRequested();
            var destination = DestinationFor(lessonCuePublicUrl, code);
            try
            {
                var existing = await shlink.FindAsync(upstream, apiKey, code, domain, ct);
                if (existing is null)
                {
                    await shlink.CreateAsync(upstream, apiKey, code, destination, domain, Tags, ct);
                    created++;
                    continue;
                }

                // Ours, but pointing somewhere stale -- most likely because
                // LessonCue's public address changed. Repair rather than
                // recreate, so its visit history survives.
                if (IsOurs(existing))
                {
                    if (string.Equals(existing.LongUrl, destination, StringComparison.OrdinalIgnoreCase)) correct++;
                    else
                    {
                        await shlink.UpdateAsync(upstream, apiKey, code, destination, domain, Tags, ct);
                        repaired++;
                    }
                    continue;
                }

                // Present but not ours: somebody created this slug by hand. We
                // will not take it from them, and we will not pretend the pool
                // is intact.
                conflicts.Add(code);
            }
            catch (ShlinkException error) when (error.IsConflict)
            {
                conflicts.Add(code);
            }
            catch (ShlinkException error)
            {
                failures.Add($"{code}: {error.Message}");
            }
        }

        return new ReservationReport(ReservedGameCodes.All.Count, correct, created, repaired, conflicts, failures);
    }

    /// <summary>
    /// A cheap check for the status card: are they all there and tagged?
    /// Does not repair anything.
    /// </summary>
    public async Task<(int Present, IReadOnlyList<string> Missing)> AuditAsync(
        string upstream, string apiKey, string domain, CancellationToken ct = default)
    {
        var missing = new List<string>();
        foreach (var code in ReservedGameCodes.All)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var existing = await shlink.FindAsync(upstream, apiKey, code, domain, ct);
                if (existing is null || !IsOurs(existing)) missing.Add(code);
            }
            catch (ShlinkException)
            {
                missing.Add(code);
            }
        }
        return (ReservedGameCodes.All.Count - missing.Count, missing);
    }

    /// <summary>Authored by us, as far as the shortener's tags are concerned.</summary>
    private static bool IsOurs(ShlinkShortUrl url) =>
        url.Tags.Contains(ReservedGameCodes.ReservedTag, StringComparer.OrdinalIgnoreCase);
}
