using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

/// <summary>
/// Builds the redacted support snapshot without allowing one optional
/// diagnostic source to turn the whole endpoint into a gateway error. A
/// database, storage, or backup problem should be visible in the bundle as a
/// named partial failure so the operator can still download the evidence.
/// </summary>
public sealed class SupportBundleBuilder(
    StorageService storage,
    BackupPolicyService backupPolicy,
    UpdateService updates,
    ILogger<SupportBundleBuilder> logger)
{
    public async Task<SupportBundleSnapshot> BuildAsync(
        LessonCueDb db,
        Guid serverId,
        string serverName,
        CancellationToken ct = default)
    {
        var organizationTimeZone = await db.Organizations.AsNoTracking()
            .OrderBy(item => item.Id)
            .Select(item => item.TimeZone)
            .FirstAsync(ct);
        var issues = new List<string>();

        var storageStatus = await ReadAsync(
            "storage",
            () => storage.GetSnapshotAsync(db, ct),
            new StorageSnapshot(0, 0, 0, 0, 0, 0, false),
            issues);

        var converter = Read(
            "converters",
            MediaConverterCapabilities.Snapshot,
            new MediaConverterStatus(false, false, false, false, false, false,
                ["converter capability detection unavailable"], DateTimeOffset.UtcNow),
            issues);

        var media = await ReadAsync(
            "media",
            async () => await db.MediaAssets.AsNoTracking()
                .Where(x => x.DeletedAt == null)
                .Select(x => new SupportMediaRow
                {
                    ProcessingStatus = x.ProcessingStatus,
                    CompatibilityStatus = x.CompatibilityStatus,
                    ConversionStatus = x.ConversionStatus,
                    SizeBytes = x.SizeBytes
                })
                .ToListAsync(ct),
            [],
            issues);

        var activeUploadStates = new[]
        {
            UploadSessionStates.Active,
            UploadSessionStates.Paused,
            UploadSessionStates.Failed,
            UploadSessionStates.Completing
        };
        var uploadSnapshotTime = DateTimeOffset.UtcNow;
        var uploads = await ReadAsync(
            "upload queue",
            async () => (await db.UploadSessions.AsNoTracking()
                    .Select(x => new SupportUploadRow
                    {
                        State = x.State,
                        ExpectedLength = x.ExpectedLength,
                        ReceivedBytes = x.ReceivedBytes,
                        ExpiresAt = x.ExpiresAt
                    })
                    .ToListAsync(ct))
                .Where(x => x.ExpiresAt > uploadSnapshotTime && activeUploadStates.Contains(x.State))
                .ToList(),
            [],
            issues);

        var screenSnapshotTime = DateTimeOffset.UtcNow.AddMinutes(-2);
        var screens = await ReadAsync(
            "screens",
            () => db.Screens.AsNoTracking()
                .Where(x => !x.Revoked)
                .Select(x => new SupportScreenRow
                {
                    Online = x.LastSeenAt != null && x.LastSeenAt >= screenSnapshotTime,
                    FailedDownloads = x.FailedDownloads,
                    PlaybackError = x.PlaybackError,
                    NetworkQuality = x.NetworkQuality,
                    AcknowledgedControlVersion = x.AcknowledgedControlVersion,
                    ControlVersion = x.ControlVersion
                })
                .ToListAsync(ct),
            [],
            issues);

        var backup = Read(
            "backups",
            () => backupPolicy.GetStatus(organizationTimeZone),
            new BackupPolicyStatus(
                false, "daily", 2, null, true, 7, 30, "exclude", false,
                null, "none", null, false, null, null, null, null, "backup diagnostics unavailable",
                null, false, false, []),
            issues);

        var update = Read(
            "updates",
            () => updates.Status,
            new LessonCueUpdateStatus(
                UpdateService.InstalledVersion(), null, false, null, null, null,
                "update diagnostics unavailable", false, false, null, null, null, null,
                false, null),
            issues);

        return new SupportBundleSnapshot(
            1,
            DateTimeOffset.UtcNow,
            new { serverId, serverName, version = update.CurrentVersion, timeZone = organizationTimeZone },
            new
            {
                storageStatus.UsedBytes,
                storageStatus.AllocationBytes,
                storageStatus.RemainingBytes,
                storageStatus.ReservedBytes,
                storageStatus.DiskAvailableBytes
            },
            new
            {
                converter.Ffmpeg,
                converter.Ffprobe,
                converter.LibreOffice,
                converter.Poppler,
                converter.WebpEncoder,
                converter.TheoraEncoder,
                converter.Missing,
                converter.CheckedAt
            },
            new
            {
                activeUploads = uploads.Count,
                reservedBytes = uploads.Sum(x => Math.Max(0, x.ExpectedLength - x.ReceivedBytes)),
                states = uploads.GroupBy(x => x.State).ToDictionary(g => g.Key, g => g.Count())
            },
            new
            {
                count = media.Count,
                bytes = media.Sum(x => x.SizeBytes),
                processing = media.GroupBy(x => x.ProcessingStatus).ToDictionary(g => g.Key, g => g.Count()),
                compatibility = media.GroupBy(x => x.CompatibilityStatus).ToDictionary(g => g.Key, g => g.Count()),
                conversion = media.GroupBy(x => x.ConversionStatus).ToDictionary(g => g.Key, g => g.Count())
            },
            new
            {
                count = screens.Count,
                online = screens.Count(x => x.Online),
                failedDownloads = screens.Sum(x => x.FailedDownloads),
                playbackErrors = screens.Count(x => !string.IsNullOrWhiteSpace(x.PlaybackError)),
                commandsAwaitingReceipt = screens.Count(x => x.ControlVersion > x.AcknowledgedControlVersion),
                networkQuality = screens.GroupBy(x => x.NetworkQuality).ToDictionary(g => g.Key, g => g.Count())
            },
            backup,
            update,
            issues);
    }

    private async Task<T> ReadAsync<T>(
        string component,
        Func<Task<T>> read,
        T fallback,
        List<string> issues)
    {
        try { return await read(); }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            RecordIssue(component, error, issues);
            return fallback;
        }
    }

    private T Read<T>(string component, Func<T> read, T fallback, List<string> issues)
    {
        try { return read(); }
        catch (Exception error)
        {
            RecordIssue(component, error, issues);
            return fallback;
        }
    }

    private void RecordIssue(string component, Exception error, List<string> issues)
    {
        logger.LogWarning(error, "Support diagnostics component {Component} failed", component);
        issues.Add($"{component}: unavailable ({error.GetType().Name})");
    }

    private sealed class SupportMediaRow
    {
        public string ProcessingStatus { get; init; } = "unknown";
        public string CompatibilityStatus { get; init; } = "unknown";
        public string ConversionStatus { get; init; } = "unknown";
        public long SizeBytes { get; init; }
    }

    private sealed class SupportUploadRow
    {
        public string State { get; init; } = "unknown";
        public long ExpectedLength { get; init; }
        public long ReceivedBytes { get; init; }
        public DateTimeOffset ExpiresAt { get; init; }
    }

    private sealed class SupportScreenRow
    {
        public bool Online { get; init; }
        public int FailedDownloads { get; init; }
        public string? PlaybackError { get; init; }
        public string NetworkQuality { get; init; } = "unknown";
        public int AcknowledgedControlVersion { get; init; }
        public int ControlVersion { get; init; }
    }
}

public sealed record SupportBundleSnapshot(
    int SchemaVersion,
    DateTimeOffset GeneratedAt,
    object Server,
    object Storage,
    object Converters,
    object Queue,
    object Media,
    object Screens,
    BackupPolicyStatus Backup,
    LessonCueUpdateStatus Update,
    IReadOnlyList<string> DiagnosticErrors);
