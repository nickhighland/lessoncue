using System.Globalization;

namespace LessonCue.Server;

public sealed record HttpPortStatus(
    int Port,
    string Address,
    bool Configurable,
    bool Supported,
    bool Pending,
    DateTimeOffset? AppliedAt,
    string? Error);

public static class HttpPortConfiguration
{
    public const int DefaultPort = 80;

    public static int Resolve(string dataPath)
    {
        var saved = Read(Path.Combine(dataPath, "config", "http-port"));
        if (saved is not null) return saved.Value;
        return int.TryParse(Environment.GetEnvironmentVariable("LESSONCUE_HTTP_PORT"), NumberStyles.None,
            CultureInfo.InvariantCulture, out var environmentPort) && IsValid(environmentPort)
            ? environmentPort
            : DefaultPort;
    }

    public static int Normalize(int value)
    {
        if (!IsValid(value)) throw new ArgumentException("The HTTP port must be a whole number from 1 through 65535.");
        return value;
    }

    public static string FormatAddress(string hostname, int port) =>
        port == 80 ? $"http://{hostname}.local" : $"http://{hostname}.local:{port}";

    public static int? Read(string path)
    {
        try
        {
            return File.Exists(path) && int.TryParse(File.ReadAllText(path).Trim(), NumberStyles.None,
                CultureInfo.InvariantCulture, out var port) && IsValid(port) ? port : null;
        }
        catch { return null; }
    }

    private static bool IsValid(int value) => value is >= 1 and <= 65535;
}

public sealed class HttpPortService : BackgroundService
{
    private const string ProtectedRequestPath = "/var/lib/lessoncue/config/update-request";
    private readonly string _portPath;
    private readonly string _previousPortPath;
    private readonly string _resultPath;
    private readonly string _errorPath;
    private readonly string _hostnamePath;
    private readonly int _activePort;
    private readonly ILogger<HttpPortService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public HttpPortService(string dataPath, int activePort, ILogger<HttpPortService> logger)
    {
        var configPath = Path.Combine(dataPath, "config");
        Directory.CreateDirectory(configPath);
        _portPath = Path.Combine(configPath, "http-port");
        _previousPortPath = Path.Combine(configPath, "http-port.previous");
        _resultPath = Path.Combine(configPath, "port-result");
        _errorPath = Path.Combine(configPath, "port-error");
        _hostnamePath = Path.Combine(configPath, "local-hostname");
        _activePort = activePort;
        _logger = logger;
    }

    public HttpPortStatus Status => BuildStatus();

    public async Task<HttpPortStatus> SetAsync(int value, CancellationToken ct = default)
    {
        if (!IsConfigurable())
            throw new ArgumentException("Docker publishes its HTTP port outside the app. Change LESSONCUE_HTTP_PORT in .env and recreate the container.");
        var port = HttpPortConfiguration.Normalize(value);
        await _gate.WaitAsync(ct);
        try
        {
            var existing = HttpPortConfiguration.Read(_portPath) ?? _activePort;
            await WriteAtomicAsync(_previousPortPath, existing.ToString(CultureInfo.InvariantCulture), ct);
            await WriteAtomicAsync(_portPath, port.ToString(CultureInfo.InvariantCulture), ct);
            if (File.Exists(_errorPath)) File.Delete(_errorPath);
            if (IsSupported())
                await File.WriteAllTextAsync(ProtectedRequestPath, $"port:{port}{Environment.NewLine}", ct);
            return BuildStatus();
        }
        finally { _gate.Release(); }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            if (IsSupported() && Status.Pending)
            {
                try
                {
                    var port = HttpPortConfiguration.Read(_portPath) ?? _activePort;
                    await File.WriteAllTextAsync(ProtectedRequestPath, $"port:{port}{Environment.NewLine}", stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                { _logger.LogWarning(ex, "Could not request the LessonCue HTTP port change"); }
            }
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }

    private HttpPortStatus BuildStatus()
    {
        var configured = HttpPortConfiguration.Read(_portPath) ?? _activePort;
        var applied = HttpPortConfiguration.Read(_resultPath);
        var supported = IsSupported();
        var configurable = IsConfigurable();
        var pending = configured != _activePort || applied is not null && applied != configured;
        DateTimeOffset? appliedAt = applied == configured && File.Exists(_resultPath)
            ? new DateTimeOffset(File.GetLastWriteTimeUtc(_resultPath), TimeSpan.Zero)
            : null;
        var hostname = ReadHostname() ?? "lessoncue";
        var error = ReadError();
        if (!supported && pending)
            error ??= "The port is saved. Restart this server to apply it; automatic port changes require the native Linux installer.";
        if (!configurable)
            error = "Docker controls this port through LESSONCUE_HTTP_PORT in .env. Recreate the container after changing it.";
        return new HttpPortStatus(configured, HttpPortConfiguration.FormatAddress(hostname, configured), configurable, supported,
            pending, appliedAt, error);
    }

    private string? ReadHostname()
    {
        try { return File.Exists(_hostnamePath) ? LocalAddressService.NormalizeHostname(File.ReadAllText(_hostnamePath)) : null; }
        catch { return null; }
    }

    private string? ReadError()
    {
        try { return File.Exists(_errorPath) ? File.ReadAllText(_errorPath).Trim() : null; }
        catch { return null; }
    }

    private static async Task WriteAtomicAsync(string path, string value, CancellationToken ct)
    {
        var temporaryPath = path + ".tmp";
        await File.WriteAllTextAsync(temporaryPath, value + Environment.NewLine, ct);
        File.Move(temporaryPath, path, true);
    }

    private static bool IsSupported() =>
        OperatingSystem.IsLinux() &&
        Directory.Exists(Path.GetDirectoryName(ProtectedRequestPath)) &&
        File.Exists("/etc/systemd/system/lessoncue-update.service") &&
        File.Exists("/etc/systemd/system/lessoncue-update.path");

    private static bool IsConfigurable() =>
        !string.Equals(Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase);
}
