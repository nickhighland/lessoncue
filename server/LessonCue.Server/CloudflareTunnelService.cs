using System.Text.Json;
using System.Text.RegularExpressions;

namespace LessonCue.Server;

public sealed record CloudflareTunnelStatus(
    bool Enabled,
    string? PublicHostname,
    string? PublicUrl,
    string OriginUrl,
    bool Supported,
    bool Pending,
    bool CredentialConfigured,
    bool ServiceInstalled,
    bool Connected,
    int ActiveConnections,
    string? CloudflaredVersion,
    DateTimeOffset? AppliedAt,
    string? Error);

public sealed class CloudflareTunnelService : BackgroundService
{
    private const string ProtectedRequestPath = "/var/lib/lessoncue/config/update-request";
    private const string ServicePath = "/etc/systemd/system/lessoncue-cloudflared.service";
    private const string MetricsUrl = "http://127.0.0.1:60123/metrics";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex TokenPattern = new("^[A-Za-z0-9._=+/-]{50,4096}$", RegexOptions.CultureInvariant);
    private readonly string _configPath;
    private readonly string _pendingTokenPath;
    private readonly string _resultPath;
    private readonly HttpPortService _httpPort;
    private readonly IHttpClientFactory _clients;
    private readonly ILogger<CloudflareTunnelService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private CloudflareTunnelStatus _status;
    private TunnelMetrics? _metrics;
    private DateTimeOffset _lastRequestAt = DateTimeOffset.MinValue;

    public CloudflareTunnelService(string dataPath, HttpPortService httpPort, IHttpClientFactory clients,
        ILogger<CloudflareTunnelService> logger)
    {
        var configDirectory = Path.Combine(dataPath, "config");
        Directory.CreateDirectory(configDirectory);
        _configPath = Path.Combine(configDirectory, "cloudflare-tunnel.json");
        _pendingTokenPath = Path.Combine(configDirectory, "cloudflare-token.pending");
        _resultPath = Path.Combine(configDirectory, "cloudflare-result.json");
        _httpPort = httpPort;
        _clients = clients;
        _logger = logger;
        _status = BuildStatus(ReadConfig(), ReadResult(), null);
    }

    public CloudflareTunnelStatus Status
    {
        get
        {
            _status = BuildStatus(ReadConfig(), ReadResult(), _metrics);
            return _status;
        }
    }

    public async Task<CloudflareTunnelStatus> SetAsync(bool enabled, string? publicHostname, string? token,
        bool acknowledgedRemoteExposure, CancellationToken ct = default)
    {
        if (enabled && !IsSupported())
            throw new ArgumentException("Automatic Cloudflare Tunnel setup requires a native Linux installation updated with the latest LessonCue installer.");
        var hostname = enabled ? NormalizePublicHostname(publicHostname) : ReadConfig().PublicHostname;
        if (enabled && !acknowledgedRemoteExposure)
            throw new ArgumentException("Confirm that you configured Cloudflare Access or accept that this address exposes the LessonCue sign-in page to the internet.");

        var normalizedToken = string.IsNullOrWhiteSpace(token) ? null : NormalizeToken(token);
        var existingResult = ReadResult();
        if (enabled && normalizedToken is null && !existingResult.CredentialConfigured)
            throw new ArgumentException("Paste the tunnel token or the Cloudflare service-install command the first time you enable remote access.");

        await _gate.WaitAsync(ct);
        try
        {
            var config = new TunnelConfig(enabled, hostname);
            await WritePrivateJsonAsync(_configPath, config, ct);
            if (normalizedToken is not null)
                await WritePrivateTextAsync(_pendingTokenPath, normalizedToken + Environment.NewLine, ct);
            await File.WriteAllTextAsync(ProtectedRequestPath, enabled ? "tunnel:enable\n" : "tunnel:disable\n", ct);
            _lastRequestAt = DateTimeOffset.UtcNow;
            _status = BuildStatus(config, existingResult, null) with { Pending = true, Error = null };
            return _status;
        }
        finally { _gate.Release(); }
    }

    public static string NormalizePublicHostname(string? value)
    {
        var candidate = (value ?? "").Trim().ToLowerInvariant();
        if (!candidate.Contains("://", StringComparison.Ordinal)) candidate = "https://" + candidate;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(uri.UserInfo) || !uri.IsDefaultPort || uri.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException("Enter one HTTPS hostname without a path, such as lesson.example.org.");
        var hostname = uri.IdnHost.ToLowerInvariant();
        if (hostname.Length is < 4 or > 253 || !hostname.Contains('.') || hostname.EndsWith(".local", StringComparison.Ordinal) ||
            System.Net.IPAddress.TryParse(hostname, out _) || hostname.Split('.').Any(label =>
                label.Length is < 1 or > 63 || label[0] == '-' || label[^1] == '-' ||
                label.Any(character => !(character is >= 'a' and <= 'z' or >= '0' and <= '9' or '-'))))
            throw new ArgumentException("Enter a public DNS hostname, such as lesson.example.org.");
        return hostname;
    }

    public static string NormalizeToken(string value)
    {
        var trimmed = value.Trim();
        var commandMatch = Regex.Match(trimmed,
            "(?:service\\s+install|--token)\\s+['\\\"]?([A-Za-z0-9._=+/-]{50,4096})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        var token = commandMatch.Success ? commandMatch.Groups[1].Value : trimmed.Trim('\'', '"');
        if (!TokenPattern.IsMatch(token))
            throw new ArgumentException("The Cloudflare tunnel token is not valid. Paste only the token or the complete service-install command.");
        return token;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshAsync(stoppingToken);
                var config = ReadConfig();
                if (_status.Pending && DateTimeOffset.UtcNow - _lastRequestAt > TimeSpan.FromSeconds(30))
                {
                    await File.WriteAllTextAsync(ProtectedRequestPath, config.Enabled ? "tunnel:enable\n" : "tunnel:disable\n", stoppingToken);
                    _lastRequestAt = DateTimeOffset.UtcNow;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            { _logger.LogDebug(ex, "Could not refresh Cloudflare Tunnel metrics"); }
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }

    private async Task RefreshAsync(CancellationToken ct)
    {
        var config = ReadConfig();
        var result = ReadResult();
        TunnelMetrics? metrics = null;
        if (config.Enabled && result.Enabled)
        {
            try
            {
                var text = await _clients.CreateClient("cloudflare-tunnel").GetStringAsync(MetricsUrl, ct);
                var connectionMatch = Regex.Match(text, @"(?m)^cloudflared_tunnel_ha_connections\s+([0-9.]+)$");
                var versionMatch = Regex.Match(text, "(?m)^build_info\\{[^}]*version=\\\"([^\\\"]+)\\\"[^}]*}\\s+1$");
                metrics = new TunnelMetrics(connectionMatch.Success ? (int)double.Parse(connectionMatch.Groups[1].Value,
                    System.Globalization.CultureInfo.InvariantCulture) : 0, versionMatch.Success ? versionMatch.Groups[1].Value : null);
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested) { }
        }
        _metrics = metrics;
        _status = BuildStatus(config, result, metrics);
    }

    private CloudflareTunnelStatus BuildStatus(TunnelConfig config, TunnelResult result, TunnelMetrics? metrics)
    {
        var supported = IsSupported();
        var configExists = File.Exists(_configPath);
        var configWrittenAt = configExists ? File.GetLastWriteTimeUtc(_configPath) : DateTime.MinValue;
        var pending = supported && configExists && result.Error is null && (config.Enabled != result.Enabled ||
            result.AppliedAt is null || configWrittenAt > result.AppliedAt.Value.UtcDateTime.AddSeconds(1));
        var origin = $"http://127.0.0.1:{_httpPort.Status.Port}";
        return new CloudflareTunnelStatus(config.Enabled, config.PublicHostname,
            config.PublicHostname is null ? null : $"https://{config.PublicHostname}", origin, supported, pending,
            result.CredentialConfigured, result.ServiceInstalled, result.Enabled && metrics is { ActiveConnections: > 0 },
            result.Enabled ? metrics?.ActiveConnections ?? 0 : 0, metrics?.Version, result.AppliedAt,
            supported ? result.Error : "Automatic Cloudflare Tunnel setup requires a native Linux installation updated with the latest LessonCue installer.");
    }

    private TunnelConfig ReadConfig()
    {
        try { return JsonSerializer.Deserialize<TunnelConfig>(File.ReadAllText(_configPath), JsonOptions) ?? new(false, null); }
        catch { return new(false, null); }
    }

    private TunnelResult ReadResult()
    {
        try { return JsonSerializer.Deserialize<TunnelResult>(File.ReadAllText(_resultPath), JsonOptions) ?? new(false, false, false, null, null); }
        catch { return new(false, false, File.Exists(ServicePath), null, null); }
    }

    private static async Task WritePrivateJsonAsync<T>(string path, T value, CancellationToken ct) =>
        await WritePrivateTextAsync(path, JsonSerializer.Serialize(value, JsonOptions) + Environment.NewLine, ct);

    private static async Task WritePrivateTextAsync(string path, string value, CancellationToken ct)
    {
        var temporary = path + ".tmp";
        await File.WriteAllTextAsync(temporary, value, ct);
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        File.Move(temporary, path, true);
    }

    private static bool IsSupported() => OperatingSystem.IsLinux() &&
        Directory.Exists(Path.GetDirectoryName(ProtectedRequestPath)) &&
        File.Exists("/etc/systemd/system/lessoncue-update.service") && File.Exists("/etc/systemd/system/lessoncue-update.path");

    private sealed record TunnelConfig(bool Enabled, string? PublicHostname);
    private sealed record TunnelResult(bool Enabled, bool CredentialConfigured, bool ServiceInstalled,
        DateTimeOffset? AppliedAt, string? Error);
    private sealed record TunnelMetrics(int ActiveConnections, string? Version);
}
