using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class ScreenDiagnosticCleanupService(IServiceScopeFactory scopes, string dataPath,
    ILogger<ScreenDiagnosticCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = DateTimeOffset.UtcNow;
                await CleanupInactiveBrowserScreensAsync(scopes, dataPath, now, stoppingToken);
                await CleanupAsync(scopes, dataPath, now, stoppingToken);
            }
            catch (Exception exception) { logger.LogWarning(exception, "Unable to clean expired browser pairs or screen diagnostics"); }
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    public static async Task<int> CleanupInactiveBrowserScreensAsync(IServiceScopeFactory scopes, string dataPath,
        DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
        var browserScreens = await db.Screens.Where(x => x.Platform == "web-player").ToListAsync(cancellationToken);
        if (browserScreens.Count == 0) return 0;
        var browserIds = browserScreens.Select(x => x.Id).ToArray();
        var browserCredentials = await db.DeviceCredentials.Where(x => browserIds.Contains(x.ScreenId))
            .Select(x => new { x.ScreenId, x.CreatedAt }).ToListAsync(cancellationToken);
        var credentialTimes = browserCredentials.GroupBy(x => x.ScreenId)
            .ToDictionary(group => group.Key, group => group.Min(x => x.CreatedAt));
        var expired = browserScreens.Where(screen =>
        {
            var createdAt = credentialTimes.TryGetValue(screen.Id, out var value) ? value : DateTimeOffset.MinValue;
            return IsBrowserPairExpired(screen.Platform, screen.LastSeenAt, createdAt, now);
        }).ToList();
        if (expired.Count == 0) return 0;
        var expiredIds = expired.Select(x => x.Id).ToArray();
        var credentials = await db.DeviceCredentials.Where(x => expiredIds.Contains(x.ScreenId)).ToListAsync(cancellationToken);
        var commands = await db.PlaybackCommands.Where(x => expiredIds.Contains(x.ScreenId)).ToListAsync(cancellationToken);
        foreach (var screen in expired)
        {
            DeleteScreenshot(dataPath, screen.ScreenshotRelativePath);
            db.AuditEvents.Add(new AuditEvent
            {
                Actor = "system", Action = "screen.browser.expire", Object = screen.Id.ToString(),
                Summary = $"{screen.Name} removed after two hours without a browser heartbeat"
            });
        }
        db.PlaybackCommands.RemoveRange(commands);
        db.DeviceCredentials.RemoveRange(credentials);
        db.Screens.RemoveRange(expired);
        await db.SaveChangesAsync(cancellationToken);
        return expired.Count;
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

    private static void DeleteScreenshot(string dataPath, string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return;
        var root = Path.GetFullPath(dataPath) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(dataPath, relativePath));
        if (path.StartsWith(root, StringComparison.Ordinal)) try { File.Delete(path); } catch { }
    }

    public static bool IsBrowserPairExpired(string platform, DateTimeOffset? lastSeenAt,
        DateTimeOffset credentialCreatedAt, DateTimeOffset now) =>
        platform == "web-player" && (lastSeenAt ?? credentialCreatedAt) <= now.AddHours(-2);
}
