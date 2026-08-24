namespace LessonCue.Server.Shortener;

/// <summary>
/// Keeps the shortener's status fresh in the background.
///
/// Games decide whether to hand out a short link from a cached "this is
/// working" finding, and that finding has to be re-established by something
/// other than an administrator happening to open Settings. Without this, a
/// server left running overnight would quietly stop using short links until
/// somebody looked at the page.
///
/// Costs nothing on an installation without the shortener: it checks the
/// setting first and goes back to sleep.
/// </summary>
public sealed class ShortenerHealthService(ShortenerService shortener, ILogger<ShortenerHealthService> log)
    : BackgroundService
{
    /// <summary>Comfortably inside the ten minutes a finding stays good for.</summary>
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(3);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the application finish starting before reaching for the network.
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken).ConfigureAwait(false);

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                if (!shortener.Current.Configured) continue;
                var status = await shortener.StatusAsync(stoppingToken);

                // Provision the reserved codes as soon as the shortener can take
                // them, rather than waiting for somebody to press a button they
                // should not have to know about.
                if (status.State is ShortenerState.Degraded && shortener.IntegrationKey is not null)
                {
                    var report = await shortener.ReconcileAsync(stoppingToken);
                    if (report.Created > 0 || report.Repaired > 0)
                        log.LogInformation(
                            "Reserved game codes brought up to date: {Created} created, {Repaired} repaired.",
                            report.Created, report.Repaired);
                }
            }
            catch (OperationCanceledException) { return; }
            catch (Exception error)
            {
                // Never fatal. A shortener that cannot be reached is a state the
                // rest of the application already knows how to carry on without.
                log.LogDebug(error, "Could not refresh the URL shortener status.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
