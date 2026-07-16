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
    bool Installing);

public sealed class UpdateService(
    IHttpClientFactory clients,
    ILogger<UpdateService> logger) : BackgroundService
{
    private readonly SemaphoreSlim _checkGate = new(1, 1);
    private LessonCueUpdateStatus _status = new(
        CurrentVersion(), null, false, null, null, null, AutomaticInstallSupported(), false);

    public LessonCueUpdateStatus Status => _status;

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
                    AutomaticInstallSupported = AutomaticInstallSupported()
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
        if (!AutomaticInstallSupported() || _status.Installing) return false;
        try
        {
            await File.WriteAllTextAsync(UpdateRequestPath, $"update:{DateTimeOffset.UtcNow:O}", ct);
            _status = _status with { Installing = true, Error = null };
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Could not signal the protected LessonCue update service");
            return false;
        }
    }

    public static bool IsNewer(string? candidate, string current) =>
        Version.TryParse(candidate, out var latest) && Version.TryParse(current, out var installed) && latest > installed;

    private static string CurrentVersion() =>
        typeof(UpdateService).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
        ?? typeof(UpdateService).Assembly.GetName().Version?.ToString(3)
        ?? "0.0.0";

    private const string UpdateRequestPath = "/var/lib/lessoncue/config/update-request";

    private static bool AutomaticInstallSupported() =>
        OperatingSystem.IsLinux() && Directory.Exists(Path.GetDirectoryName(UpdateRequestPath)) &&
        File.Exists("/etc/systemd/system/lessoncue-update.service") &&
        File.Exists("/etc/systemd/system/lessoncue-update.path");
}
