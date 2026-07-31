using System.Reflection;
using System.Text.Json;

namespace LessonCue.Server;

public sealed record LessonCueUpdateStatus(
    string CurrentVersion,
    string? LatestVersion,
    bool UpdateAvailable,
    DateTimeOffset? LastCheckedAt,
    string? ReleaseUrl,
    string? Error,
    bool AutomaticInstallSupported,
    bool Installing,
    bool? LastInstallSucceeded,
    DateTimeOffset? LastInstallAt,
    string? LastInstallVersion,
    string? LastInstallMessage,
    bool RollbackSnapshotAvailable,
    string? RollbackTargetVersion);

public sealed record LessonCueUpdateResult(
    bool Success,
    string? Version,
    string? Message,
    DateTimeOffset? CompletedAt);

public sealed class UpdateService(
    IHttpClientFactory clients,
    ILogger<UpdateService> logger) : BackgroundService
{
    private readonly SemaphoreSlim _checkGate = new(1, 1);
    private LessonCueUpdateStatus _status = InitialStatus();

    public LessonCueUpdateStatus Status
    {
        get
        {
            RefreshInstallResult();
            return _status;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            await CheckAsync(false, stoppingToken);
            await Task.Delay(TimeSpan.FromDays(1), stoppingToken);
        }
    }

    public async Task<LessonCueUpdateStatus> CheckAsync(bool force, CancellationToken ct = default)
    {
        await _checkGate.WaitAsync(ct);
        try
        {
            if (!force && _status.LastCheckedAt is not null && DateTimeOffset.UtcNow - _status.LastCheckedAt < TimeSpan.FromHours(23))
                return _status;
            try
            {
                var client = clients.CreateClient("updates");
                using var response = await client.GetAsync("https://api.github.com/repos/nickhighland/lessoncue/releases/latest", ct);
                response.EnsureSuccessStatusCode();
                await using var stream = await response.Content.ReadAsStreamAsync(ct);
                using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
                var root = document.RootElement;
                var tag = root.GetProperty("tag_name").GetString();
                var latest = tag?.TrimStart('v', 'V');
                var releaseUrl = root.TryGetProperty("html_url", out var url) ? url.GetString() : null;
                _status = _status with
                {
                    LatestVersion = latest,
                    UpdateAvailable = IsNewer(latest, _status.CurrentVersion),
                    LastCheckedAt = DateTimeOffset.UtcNow,
                    ReleaseUrl = releaseUrl,
                    Error = null,
                    AutomaticInstallSupported = AutomaticInstallSupported(),
                    RollbackSnapshotAvailable = RollbackSnapshotAvailable()
                };
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Could not check for a LessonCue update");
                _status = _status with { LastCheckedAt = DateTimeOffset.UtcNow, Error = "The update service could not be reached." };
            }
            return _status;
        }
        finally { _checkGate.Release(); }
    }

    public async Task<bool> StartInstallAsync(CancellationToken ct = default)
    {
        return await SignalProtectedOperationAsync(
            $"update:{DateTimeOffset.UtcNow:O}",
            "Could not signal the protected LessonCue update service",
            ct);
    }

    public async Task<bool> StartRollbackAsync(CancellationToken ct = default)
    {
        if (!RollbackSnapshotAvailable()) return false;
        return await SignalProtectedOperationAsync(
            $"rollback:{DateTimeOffset.UtcNow:O}",
            "Could not signal the protected LessonCue rollback service",
            ct);
    }

    public static bool IsNewer(string? candidate, string current) =>
        Version.TryParse(candidate, out var latest) && Version.TryParse(current, out var installed) && latest > installed;

    public static string InstalledVersion() =>
        typeof(UpdateService).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
        ?? typeof(UpdateService).Assembly.GetName().Version?.ToString(3)
        ?? "0.0.0";

    private const string UpdateRequestPath = "/var/lib/lessoncue/config/update-request";
    private const string UpdateResultPath = "/var/lib/lessoncue/config/update-result.json";
    private const string RollbackSnapshotPath = "/var/lib/lessoncue/update-rollback";

    private static bool AutomaticInstallSupported() =>
        OperatingSystem.IsLinux() && Directory.Exists(Path.GetDirectoryName(UpdateRequestPath)) &&
        File.Exists("/etc/systemd/system/lessoncue-update.service") &&
        File.Exists("/etc/systemd/system/lessoncue-update.path");

    private static bool RollbackSnapshotAvailable() =>
        OperatingSystem.IsLinux() &&
        Directory.Exists(RollbackSnapshotPath) &&
        Directory.Exists("/opt/lessoncue.previous") &&
        File.Exists(Path.Combine(RollbackSnapshotPath, "data", "database", "lessoncue.db"));

    private static LessonCueUpdateStatus InitialStatus()
    {
        var result = ReadInstallResult();
        return new LessonCueUpdateStatus(
            InstalledVersion(), null, false, null, null,
            result is { Success: false } ? result.Message : null,
            AutomaticInstallSupported(), false,
            result?.Success, result?.CompletedAt, result?.Version, result?.Message,
            RollbackSnapshotAvailable(), RollbackTargetVersion());
    }

    private void RefreshInstallResult()
    {
        var result = ReadInstallResult();
        if (result is null)
        {
            _status = _status with
            {
                RollbackSnapshotAvailable = RollbackSnapshotAvailable(),
                RollbackTargetVersion = RollbackTargetVersion()
            };
            return;
        }

        _status = _status with
        {
            Installing = false,
            LastInstallSucceeded = result.Success,
            LastInstallAt = result.CompletedAt,
            LastInstallVersion = result.Version,
            LastInstallMessage = result.Message,
            Error = result.Success ? _status.Error : result.Message,
            RollbackSnapshotAvailable = RollbackSnapshotAvailable(),
            RollbackTargetVersion = RollbackTargetVersion()
        };
    }

    private async Task<bool> SignalProtectedOperationAsync(
        string request,
        string errorMessage,
        CancellationToken ct)
    {
        if (!AutomaticInstallSupported() || _status.Installing) return false;
        try
        {
            if (File.Exists(UpdateResultPath))
            {
                File.Delete(UpdateResultPath);
            }

            await File.WriteAllTextAsync(UpdateRequestPath, request, ct);
            _status = _status with { Installing = true, Error = null };
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, errorMessage);
            return false;
        }
    }

    private static string? RollbackTargetVersion()
    {
        var path = Path.Combine(RollbackSnapshotPath, "from-version");
        if (!File.Exists(path)) return null;
        try
        {
            var value = File.ReadAllText(path).Trim().TrimStart('v', 'V');
            return string.IsNullOrWhiteSpace(value) || value == "unknown" ? null : value;
        }
        catch
        {
            return null;
        }
    }

    private static LessonCueUpdateResult? ReadInstallResult()
    {
        if (!File.Exists(UpdateResultPath)) return null;
        try
        {
            return JsonSerializer.Deserialize<LessonCueUpdateResult>(
                File.ReadAllText(UpdateResultPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return null;
        }
    }
}
