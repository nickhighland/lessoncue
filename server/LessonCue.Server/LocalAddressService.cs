namespace LessonCue.Server;

public sealed record LocalAddressStatus(
    string Hostname,
    string Address,
    bool Supported,
    bool Pending,
    DateTimeOffset? AppliedAt,
    string? Error);

public sealed class LocalAddressService : BackgroundService
{
    private const string DefaultHostname = "lessoncue";
    private const string ProtectedRequestPath = "/var/lib/lessoncue/config/update-request";
    private readonly string _hostnamePath;
    private readonly string _resultPath;
    private readonly ILogger<LocalAddressService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private LocalAddressStatus _status;

    public LocalAddressService(string dataPath, ILogger<LocalAddressService> logger)
    {
        _logger = logger;
        var configPath = Path.Combine(dataPath, "config");
        Directory.CreateDirectory(configPath);
        _hostnamePath = Path.Combine(configPath, "local-hostname");
        _resultPath = Path.Combine(configPath, "hostname-result");

        var hostname = ReadHostname(_hostnamePath) ?? DefaultHostname;
        if (!File.Exists(_hostnamePath)) File.WriteAllText(_hostnamePath, hostname + Environment.NewLine);
        _status = BuildStatus(hostname);
    }

    public LocalAddressStatus Status
    {
        get
        {
            RefreshStatus();
            return _status;
        }
    }

    public async Task<LocalAddressStatus> SetAsync(string value, CancellationToken ct = default)
    {
        var hostname = NormalizeHostname(value);
        await _gate.WaitAsync(ct);
        try
        {
            var temporaryPath = _hostnamePath + ".tmp";
            await File.WriteAllTextAsync(temporaryPath, hostname + Environment.NewLine, ct);
            File.Move(temporaryPath, _hostnamePath, true);
            _status = BuildStatus(hostname);
            await RequestApplyAsync(hostname, ct);
            return _status;
        }
        finally { _gate.Release(); }
    }

    public static string NormalizeHostname(string? value)
    {
        var hostname = (value ?? "").Trim().ToLowerInvariant();
        if (hostname.EndsWith(".local", StringComparison.Ordinal)) hostname = hostname[..^6];
        if (hostname.Length is < 1 or > 63 || hostname[0] == '-' || hostname[^1] == '-' ||
            hostname.Any(character => !(character is >= 'a' and <= 'z' or >= '0' and <= '9' or '-')))
            throw new ArgumentException("Use 1–63 lowercase letters, numbers, or hyphens. Do not include spaces or start or end with a hyphen.");
        return hostname;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            RefreshStatus();
            if (_status.Supported && _status.Pending)
            {
                try { await RequestApplyAsync(_status.Hostname, stoppingToken); }
                catch (Exception ex) when (ex is not OperationCanceledException)
                { _logger.LogWarning(ex, "Could not request the LessonCue local hostname"); }
            }
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }

    private async Task RequestApplyAsync(string hostname, CancellationToken ct)
    {
        if (!IsSupported())
        {
            _status = _status with { Pending = false, Error = "Custom .local addresses require a native Linux installation with the protected server service." };
            return;
        }

        await File.WriteAllTextAsync(ProtectedRequestPath, $"hostname:{hostname}{Environment.NewLine}", ct);
        _status = _status with { Pending = true, Error = null };
    }

    private void RefreshStatus()
    {
        var hostname = ReadHostname(_hostnamePath) ?? DefaultHostname;
        _status = BuildStatus(hostname);
    }

    private LocalAddressStatus BuildStatus(string hostname)
    {
        var applied = ReadHostname(_resultPath);
        var supported = IsSupported();
        DateTimeOffset? appliedAt = applied == hostname && File.Exists(_resultPath)
            ? new DateTimeOffset(File.GetLastWriteTimeUtc(_resultPath), TimeSpan.Zero)
            : null;
        return new LocalAddressStatus(
            hostname,
            $"http://{hostname}.local:8080",
            supported,
            supported && applied != hostname,
            appliedAt,
            supported ? null : "Custom .local addresses require a native Linux installation with the protected server service.");
    }

    private static string? ReadHostname(string path)
    {
        try
        {
            return File.Exists(path) ? NormalizeHostname(File.ReadAllText(path)) : null;
        }
        catch { return null; }
    }

    private static bool IsSupported() =>
        OperatingSystem.IsLinux() &&
        Directory.Exists(Path.GetDirectoryName(ProtectedRequestPath)) &&
        File.Exists("/etc/systemd/system/lessoncue-update.service") &&
        File.Exists("/etc/systemd/system/lessoncue-update.path") &&
        File.Exists("/etc/avahi/avahi-daemon.conf");
}
