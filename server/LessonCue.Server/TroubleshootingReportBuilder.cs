using System.IO.Compression;
using System.Text.Json;
using LessonCue.Server.Shortener;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

/// <summary>
/// Builds the same failures-only evidence used by the daily AI troubleshooting
/// review. Keeping this outside the HTTP endpoint means scheduled email and
/// manual downloads cannot drift apart.
/// </summary>
public sealed class TroubleshootingReportBuilder(
    TroubleshootingLog log,
    MediaStoragePaths paths,
    ShortenerService shortener)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public async Task<TroubleshootingReport> BuildAsync(
        LessonCueDb db, int requestedLimit = 2_000, bool failuresOnly = true,
        CancellationToken ct = default)
    {
        var limit = Math.Clamp(requestedLimit, 1, failuresOnly ? 10_000 : 2_000);
        var diagnosticErrors = new List<string>();
        IReadOnlyList<AuditEvent> audit;
        try
        {
            var auditQuery = db.AuditEvents.AsNoTracking();
            if (failuresOnly)
            {
                auditQuery = auditQuery.Where(item =>
                    EF.Functions.Like(item.Result, "%fail%") ||
                    EF.Functions.Like(item.Result, "%error%") ||
                    EF.Functions.Like(item.Action, "%fail%") ||
                    EF.Functions.Like(item.Action, "%error%") ||
                    item.Summary != null &&
                    (EF.Functions.Like(item.Summary, "%fail%") || EF.Functions.Like(item.Summary, "%error%")));
            }

            audit = (await auditQuery.OrderByDescending(x => x.Id).Take(limit).ToListAsync(ct))
                .OrderByDescending(x => x.Timestamp)
                .ToArray();
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            RecordIssue("audit", error, diagnosticErrors);
            audit = [];
        }

        IReadOnlyList<MediaDiagnosticSnapshot> media;
        try { media = await MediaDiagnostics.BuildAsync(db, paths, Math.Min(limit, 100), ct); }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            RecordIssue("media", error, diagnosticErrors);
            media = [];
        }

        IReadOnlyList<TroubleshootingScreenDiagnostic> screens;
        try
        {
            screens = (await db.Screens.AsNoTracking().Select(x => new
            {
                x.Id, x.Name, x.Platform, x.AppVersion, x.DeviceModel, x.OsVersion, x.LastSeenAt,
                x.LastIpAddress, x.FailedDownloads, x.CachedItems, x.TotalItems, x.PlaybackState,
                x.PlaybackError, x.CacheInventoryJson, x.DownloadQueueJson, x.RecentErrorsJson,
                x.ConnectionDiagnosticsJson, x.DiagnosticsUpdatedAt
            }).ToListAsync(ct))
                .OrderByDescending(x => x.LastSeenAt)
                .Take(100)
                .Select(x => new TroubleshootingScreenDiagnostic(
                    x.Id, x.Name, x.Platform, x.AppVersion, x.DeviceModel, x.OsVersion, x.LastSeenAt,
                    x.LastIpAddress, x.FailedDownloads, x.CachedItems, x.TotalItems, x.PlaybackState,
                    x.PlaybackError, x.CacheInventoryJson, x.DownloadQueueJson, x.RecentErrorsJson,
                    x.ConnectionDiagnosticsJson, x.DiagnosticsUpdatedAt))
                .ToArray();
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            RecordIssue("screens", error, diagnosticErrors);
            screens = [];
        }

        object mediaDependencies;
        try { mediaDependencies = MediaDependencyDiagnostics.Build(paths); }
        catch (Exception error)
        {
            RecordIssue("media dependencies", error, diagnosticErrors);
            mediaDependencies = new { error = "dependency diagnostics unavailable" };
        }

        object shortenerDiagnostics;
        try
        {
            var status = await shortener.StatusAsync(ct);
            var checks = await shortener.ProbeAsync(ct);
            shortenerDiagnostics = new
            {
                state = status.State.ToString(),
                status.Enabled,
                status.Domain,
                status.PublicUrl,
                status.AdminUrl,
                status.PoolTotal,
                status.PoolPresent,
                status.PoolActive,
                status.Detail,
                missing = status.Missing,
                conflicts = status.Conflicts,
                failures = status.Failures,
                checks,
            };
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            RecordIssue("shortener", error, diagnosticErrors);
            shortenerDiagnostics = new { state = "unavailable", error = error.GetType().Name };
        }

        return new TroubleshootingReport(
            DateTimeOffset.UtcNow,
            log.GetRecent(limit, failuresOnly),
            audit,
            media,
            mediaDependencies,
            shortenerDiagnostics,
            screens,
            new TroubleshootingRetentionDiagnostic(
                2_000, 7,
                "routine events: last 4 MB plus the prior rotated file; failures: separate seven-day store"),
            diagnosticErrors);
    }

    private static void RecordIssue(string component, Exception error, List<string> issues)
    {
        issues.Add($"{component}: unavailable ({error.GetType().Name})");
    }

    public static byte[] ToJson(TroubleshootingReport report) =>
        JsonSerializer.SerializeToUtf8Bytes(report, JsonOptions);

    public static byte[] ToGzip(TroubleshootingReport report)
    {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.Fastest, leaveOpen: true))
            JsonSerializer.Serialize(gzip, report, JsonOptions);
        return output.ToArray();
    }
}

public sealed record TroubleshootingReport(
    DateTimeOffset GeneratedAt,
    IReadOnlyList<TroubleshootingLogEntry> Runtime,
    IReadOnlyList<AuditEvent> Audit,
    IReadOnlyList<MediaDiagnosticSnapshot> Media,
    object MediaDependencies,
    object Shortener,
    IReadOnlyList<TroubleshootingScreenDiagnostic> Screens,
    TroubleshootingRetentionDiagnostic Retention,
    IReadOnlyList<string> DiagnosticErrors)
{
    public int MediaAttentionCount => Media.Count(item =>
        !string.Equals(item.ProcessingStatus, "ready", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(item.CompatibilityStatus, "failed", StringComparison.OrdinalIgnoreCase) ||
        item.OriginalFile?.SizeAndSha256Match == false ||
        item.CompatibilityFile?.SizeAndSha256Match == false ||
        item.Transcodes.Any(variant => string.Equals(variant.Status, "failed", StringComparison.OrdinalIgnoreCase)));

    public int ScreenAttentionCount => Screens.Count(item =>
        item.FailedDownloads > 0 || !string.IsNullOrWhiteSpace(item.PlaybackError) ||
        !string.Equals(item.RecentErrorsJson, "[]", StringComparison.Ordinal));
}

public sealed record TroubleshootingScreenDiagnostic(
    Guid Id,
    string Name,
    string Platform,
    string AppVersion,
    string? DeviceModel,
    string? OsVersion,
    DateTimeOffset? LastSeenAt,
    string? LastIpAddress,
    int FailedDownloads,
    int CachedItems,
    int TotalItems,
    string PlaybackState,
    string? PlaybackError,
    string CacheInventoryJson,
    string DownloadQueueJson,
    string RecentErrorsJson,
    string ConnectionDiagnosticsJson,
    DateTimeOffset? DiagnosticsUpdatedAt);

public sealed record TroubleshootingRetentionDiagnostic(
    int RuntimeEntries,
    int FailureRetentionDays,
    string File);
