using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class ScreenDiagnosticCleanupService(IServiceScopeFactory scopes, string dataPath,
    ILogger<ScreenDiagnosticCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await CleanupAsync(scopes, dataPath, DateTimeOffset.UtcNow, stoppingToken); }
            catch (Exception exception) { logger.LogWarning(exception, "Unable to clean expired screen diagnostics"); }
            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    public static async Task<int> CleanupAsync(IServiceScopeFactory scopes, string dataPath, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
        var candidates = await db.Screens.Where(x => x.ScreenshotStatus == "pending" || x.ScreenshotCapturedAt != null)
            .ToListAsync(cancellationToken);
        var screens = candidates.Where(x =>
            (x.ScreenshotStatus == "pending" && x.ScreenshotExpiresAt < now) ||
            (x.ScreenshotCapturedAt != null && x.ScreenshotCapturedAt < now.AddHours(-24))).ToList();
        var root = Path.GetFullPath(dataPath) + Path.DirectorySeparatorChar;
        foreach (var screen in screens)
        {
            if (!string.IsNullOrWhiteSpace(screen.ScreenshotRelativePath))
            {
                var path = Path.GetFullPath(Path.Combine(dataPath, screen.ScreenshotRelativePath));
                if (path.StartsWith(root, StringComparison.Ordinal)) try { File.Delete(path); } catch { }
            }
            screen.ScreenshotRequestId = null;
            screen.ScreenshotRequestedAt = null;
            screen.ScreenshotExpiresAt = null;
            screen.ScreenshotCapturedAt = null;
            screen.ScreenshotRelativePath = null;
            screen.ScreenshotStatus = "none";
        }
        if (screens.Count > 0) await db.SaveChangesAsync(cancellationToken);
        return screens.Count;
    }
}
