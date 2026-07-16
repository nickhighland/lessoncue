using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record StorageSnapshot(
    long UsedBytes,
    long DiskAvailableBytes,
    long MaximumAllocationBytes,
    long AllocationBytes,
    long RemainingBytes,
    bool AutomaticAllocation);

public sealed class StorageService(string dataPath)
{
    public const long SafetyReserveBytes = 512L * 1024 * 1024;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task<StorageSnapshot> GetSnapshotAsync(LessonCueDb db, CancellationToken ct = default)
    {
        var configured = await db.Organizations.AsNoTracking().Select(x => x.StorageLimitBytes).FirstAsync(ct);
        return await GetSnapshotAsync(configured, ct);
    }

    public async Task<StorageSnapshot> GetSnapshotAsync(long configuredLimit, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var used = DirectorySize(dataPath);
            var root = Path.GetPathRoot(Path.GetFullPath(dataPath)) ?? dataPath;
            var diskAvailable = new DriveInfo(root).AvailableFreeSpace;
            var allocatableDisk = Math.Max(0, diskAvailable - SafetyReserveBytes);
            var maximum = SaturatingAdd(used, allocatableDisk);
            var allocation = configuredLimit > 0 ? Math.Min(configuredLimit, maximum) : maximum;
            var remaining = Math.Max(0, Math.Min(allocation - used, diskAvailable));
            return new StorageSnapshot(used, diskAvailable, maximum, allocation, remaining, configuredLimit <= 0);
        }
        finally { _gate.Release(); }
    }

    public async Task<StorageSnapshot?> EnsureAvailableAsync(LessonCueDb db, long additionalBytes, CancellationToken ct = default)
    {
        var snapshot = await GetSnapshotAsync(db, ct);
        return additionalBytes >= 0 && additionalBytes <= snapshot.RemainingBytes ? snapshot : null;
    }

    private static long DirectorySize(string path)
    {
        if (!Directory.Exists(path)) return 0;
        long total = 0;
        try
        {
            foreach (var file in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
            {
                try { total = SaturatingAdd(total, new FileInfo(file).Length); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        return total;
    }

    private static long SaturatingAdd(long left, long right) =>
        left > long.MaxValue - right ? long.MaxValue : left + right;
}
