using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record StorageSnapshot(
    long UsedBytes,
    long DiskAvailableBytes,
    long MaximumAllocationBytes,
    long AllocationBytes,
    long RemainingBytes,
    long ReservedBytes,
    bool AutomaticAllocation);

public sealed record UploadStorageReservation(
    bool Allowed,
    StorageSnapshot Snapshot,
    string? Error = null);

public sealed class StorageService(string dataPath)
{
    public const long SafetyReserveBytes = 512L * 1024 * 1024;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task<StorageSnapshot> GetSnapshotAsync(LessonCueDb db, CancellationToken ct = default)
    {
        var configured = await db.Organizations.AsNoTracking().OrderBy(item => item.Id).Select(x => x.StorageLimitBytes).FirstAsync(ct);
        var reserved = await ReservedRemainingAsync(db, DateTimeOffset.UtcNow, ct);
        return await GetSnapshotAsync(configured, reserved, ct);
    }

    public async Task<StorageSnapshot> GetSnapshotAsync(long configuredLimit, CancellationToken ct = default)
        => await GetSnapshotAsync(configuredLimit, 0, ct);

    public async Task<UploadStorageReservation> ReserveUploadAsync(
        LessonCueDb db,
        UploadSession session,
        CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var configured = await db.Organizations.AsNoTracking()
                .OrderBy(item => item.Id).Select(x => x.StorageLimitBytes).FirstAsync(ct);
            var reserved = await ReservedRemainingAsync(db, DateTimeOffset.UtcNow, ct);
            var snapshot = ComputeSnapshot(configured, reserved);
            if (session.ExpectedLength > snapshot.RemainingBytes)
                return new UploadStorageReservation(false, snapshot,
                    $"The upload needs {session.ExpectedLength} bytes, but only {snapshot.RemainingBytes} bytes remain available.");
            db.UploadSessions.Add(session);
            await db.SaveChangesAsync(ct);
            var remaining = Math.Max(0, snapshot.RemainingBytes - session.ExpectedLength);
            return new UploadStorageReservation(true, snapshot with { RemainingBytes = remaining });
        }
        finally { _gate.Release(); }
    }

    public async Task<StorageSnapshot?> EnsureAvailableAsync(LessonCueDb db, long additionalBytes, CancellationToken ct = default)
    {
        var snapshot = await GetSnapshotAsync(db, ct);
        return additionalBytes >= 0 && additionalBytes <= snapshot.RemainingBytes ? snapshot : null;
    }

    private async Task<StorageSnapshot> GetSnapshotAsync(long configuredLimit, long reservedBytes, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try { return ComputeSnapshot(configuredLimit, reservedBytes); }
        finally { _gate.Release(); }
    }

    private StorageSnapshot ComputeSnapshot(long configuredLimit, long reservedBytes)
    {
        var used = DirectorySize(dataPath);
        var root = Path.GetPathRoot(Path.GetFullPath(dataPath)) ?? dataPath;
        var diskAvailable = new DriveInfo(root).AvailableFreeSpace;
        var allocatableDisk = Math.Max(0, diskAvailable - SafetyReserveBytes);
        var maximum = SaturatingAdd(used, allocatableDisk);
        var allocation = configuredLimit > 0 ? Math.Min(configuredLimit, maximum) : maximum;
        var unreserved = Math.Max(0, Math.Min(allocation - used, allocatableDisk));
        var remaining = Math.Max(0, unreserved - Math.Max(0, reservedBytes));
        return new StorageSnapshot(used, diskAvailable, maximum, allocation, remaining,
            Math.Max(0, reservedBytes), configuredLimit <= 0);
    }

    private static async Task<long> ReservedRemainingAsync(
        LessonCueDb db,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var sessions = await db.UploadSessions.AsNoTracking()
            .Where(value => (value.State == UploadSessionStates.Active ||
                             value.State == UploadSessionStates.Paused ||
                             value.State == UploadSessionStates.Failed ||
                             value.State == UploadSessionStates.Completing))
            .Select(value => new { value.ReservedBytes, value.ReceivedBytes, value.ExpiresAt })
            .ToListAsync(ct);
        return sessions.Where(value => value.ExpiresAt > now)
            .Sum(value => Math.Max(0, value.ReservedBytes - value.ReceivedBytes));
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
