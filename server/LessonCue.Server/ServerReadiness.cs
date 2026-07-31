using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record ServerReadinessChecks(bool Database, bool Storage);

public sealed record ServerReadinessReport(
    string Status,
    Guid ServerId,
    ServerReadinessChecks Checks);

public static class ServerReadiness
{
    public static async Task<ServerReadinessReport> CheckAsync(
        LessonCueDb db,
        string dataPath,
        Guid serverId,
        CancellationToken ct)
    {
        var databaseReady = false;
        try
        {
            databaseReady = await db.Database.CanConnectAsync(ct);
        }
        catch when (!ct.IsCancellationRequested)
        {
            databaseReady = false;
        }

        var storageReady = await CanWritePersistentStorageAsync(dataPath, ct);
        return new ServerReadinessReport(
            databaseReady && storageReady ? "healthy" : "unhealthy",
            serverId,
            new ServerReadinessChecks(databaseReady, storageReady));
    }

    private static async Task<bool> CanWritePersistentStorageAsync(string dataPath, CancellationToken ct)
    {
        var configPath = Path.Combine(dataPath, "config");
        var probePath = Path.Combine(configPath, $".readiness-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(configPath);
            await using var probe = new FileStream(
                probePath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 1,
                FileOptions.Asynchronous | FileOptions.WriteThrough);
            await probe.WriteAsync(new byte[] { 1 }, ct);
            await probe.FlushAsync(ct);
            return true;
        }
        catch when (!ct.IsCancellationRequested)
        {
            return false;
        }
        finally
        {
            try { File.Delete(probePath); }
            catch { /* A failed cleanup is reported by the next storage probe. */ }
        }
    }
}
