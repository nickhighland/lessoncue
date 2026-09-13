using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server.Activities;

/// <summary>
/// Drives running games forward so the host only has to press Start.
///
/// Progression lives on the server on purpose. A timer in the browser stalls
/// the moment a TV sleeps, a tab is backgrounded, or the host's phone locks —
/// and the server is already the authority for phase, scoring and timing.
///
/// Every move goes through the ordinary host command path, so autonomy can
/// never do something a host could not have done by hand, and the per-run lock
/// keeps it from racing a host who presses a button at the same moment.
/// </summary>
public sealed class ActivityAutoPilotService(
    IServiceScopeFactory scopeFactory,
    ILogger<ActivityAutoPilotService> logger) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromSeconds(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Tick);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await AdvanceDueRunsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                // One bad run must not stop every other classroom's game.
                logger.LogError(error, "Activity auto-pilot tick failed.");
            }
        }
    }

    private async Task AdvanceDueRunsAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();

        var now = DateTimeOffset.UtcNow;
        var due = await db.ActivityRuns
            .AsNoTracking()
            .Include(x => x.ActivityDefinition)
            .Where(x => x.AutoAdvanceAt != null
                && x.Status != ActivityRunStatuses.Ended
                && x.Status != ActivityRunStatuses.Paused)
            .ToListAsync(ct);

        foreach (var run in due.Where(x => x.AutoAdvanceAt <= now))
        {
            if (!ActivityAutoPilot.Supports(run.ActivityDefinition?.Type)) continue;
            try
            {
                // Read fresh state only after taking the run gate. The discovery
                // query must not seed a tracked, already-outdated snapshot.
                using var runScope = scopeFactory.CreateScope();
                var sessions = runScope.ServiceProvider.GetRequiredService<ActivitySessionService>();
                await sessions.AdvanceAutomaticallyAsync(run.Id, ct);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                logger.LogError(error, "Activity auto-pilot failed for run {RunId}.", run.Id);
            }
        }
    }
}
