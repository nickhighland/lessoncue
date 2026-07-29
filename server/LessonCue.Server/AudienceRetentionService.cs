using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class AudienceRetentionService(IServiceScopeFactory scopes, ILogger<AudienceRetentionService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                await CleanupAsync(db, DateTimeOffset.UtcNow, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception error)
            {
                logger.LogError(error, "Audience response retention cleanup failed.");
            }
            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    public static async Task<int> CleanupAsync(LessonCueDb db, DateTimeOffset now, CancellationToken ct = default)
    {
        // SQLite cannot compare DateTimeOffset values server-side. Audience
        // sessions are deliberately small in number, so filter the lightweight
        // session rows after loading them.
        var sessions = await db.AudienceSessions.ToListAsync(ct);
        var expired = sessions.Where(x => x.PurgeAt <= now).ToList();
        if (expired.Count == 0) return 0;
        db.AudienceSessions.RemoveRange(expired);
        db.AuditEvents.Add(new AuditEvent
        {
            Actor = "system",
            Action = "audience.retention.purge",
            Object = "audience-sessions",
            Summary = $"{expired.Count} expired audience interaction session(s) deleted"
        });
        await db.SaveChangesAsync(ct);
        return expired.Count;
    }
}
