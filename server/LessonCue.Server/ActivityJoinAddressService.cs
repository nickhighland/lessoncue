using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;

namespace LessonCue.Server;

/// <summary>A base URL a phone can actually reach to join a game.</summary>
public sealed record JoinAddressOption(
    string Id,
    string Label,
    string? Url,
    bool Available,
    string? Detail);

public sealed record JoinAddressStatus(
    string Mode,
    string? Url,
    string ResolvedFrom,
    IReadOnlyList<JoinAddressOption> Options);

public sealed record JoinAddressInput(string Mode);

/// <summary>
/// Chooses which address the join banner and QR code advertise.
///
/// A relative "/play/CODE" is useless on a phone, and the display's own origin
/// is whatever the TV happened to connect to — often a bare LAN IP that changes.
/// The teacher picks the address the room should see; "auto" prefers the
/// Cloudflare tunnel when one is published, then the .local name, then the LAN
/// address.
/// </summary>
public sealed class ActivityJoinAddressService(
    string dataPath,
    LocalAddressService localAddress,
    CloudflareTunnelService tunnel,
    HttpPortService httpPort)
{
    public const string ModeAuto = "auto";
    public const string ModeCloudflare = "cloudflare";
    public const string ModeLocal = "local";
    public const string ModeLan = "lan";

    private static readonly string[] Modes = [ModeAuto, ModeCloudflare, ModeLocal, ModeLan];
    private readonly string configPath = Path.Combine(dataPath, "activity-join-address.json");
    private readonly SemaphoreSlim gate = new(1, 1);

    public static string NormalizeMode(string? value)
    {
        var mode = value?.Trim().ToLowerInvariant();
        return Modes.Contains(mode) ? mode! : ModeAuto;
    }

    public JoinAddressStatus Status => Build(ReadMode());

    public async Task<JoinAddressStatus> SetAsync(string? mode, CancellationToken ct = default)
    {
        var normalized = NormalizeMode(mode);
        await gate.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataPath);
            await File.WriteAllTextAsync(configPath, JsonSerializer.Serialize(new StoredMode(normalized)), ct);
        }
        finally { gate.Release(); }
        return Build(normalized);
    }

    /// <summary>Base URL for join links, or null when nothing is reachable yet.</summary>
    public string? ResolveBaseUrl() => Build(ReadMode()).Url;

    /// <summary>Full URL a phone can open for this join code.</summary>
    public string? ResolveJoinUrl(string? joinCode)
    {
        if (string.IsNullOrWhiteSpace(joinCode)) return null;
        var baseUrl = ResolveBaseUrl();
        return string.IsNullOrWhiteSpace(baseUrl) ? null : $"{baseUrl.TrimEnd('/')}/play/{joinCode.Trim().ToUpperInvariant()}";
    }

    private string ReadMode()
    {
        try
        {
            if (!File.Exists(configPath)) return ModeAuto;
            return NormalizeMode(JsonSerializer.Deserialize<StoredMode>(File.ReadAllText(configPath))?.Mode);
        }
        catch { return ModeAuto; }
    }

    private JoinAddressStatus Build(string mode)
    {
        var options = BuildOptions();
        var byId = options.ToDictionary(option => option.Id, StringComparer.OrdinalIgnoreCase);

        // An explicit choice that is not currently reachable falls back rather
        // than showing the room an address that cannot load.
        string resolvedFrom = mode;
        string? url = mode == ModeAuto ? null : byId.GetValueOrDefault(mode)?.Url;
        if (string.IsNullOrWhiteSpace(url))
        {
            // .local before the numeric address: it is easier to read aloud, and
            // the IP is the fallback for networks where mDNS does not work.
            foreach (var candidate in new[] { ModeCloudflare, ModeLocal, ModeLan })
            {
                var option = byId.GetValueOrDefault(candidate);
                if (string.IsNullOrWhiteSpace(option?.Url)) continue;
                url = option!.Url;
                resolvedFrom = candidate;
                break;
            }
            if (string.IsNullOrWhiteSpace(url)) resolvedFrom = "none";
        }

        return new JoinAddressStatus(mode, url, resolvedFrom, options);
    }

    private List<JoinAddressOption> BuildOptions()
    {
        var tunnelStatus = tunnel.Status;
        var local = localAddress.Status;

        var cloudflareUrl = tunnelStatus is { Enabled: true, PublicUrl: not null and not "" } ? tunnelStatus.PublicUrl : null;
        // LocalAddressStatus.Address is already an absolute URL including the
        // scheme and any non-default port.
        var localUrl = string.IsNullOrWhiteSpace(local.Address) ? null : local.Address;
        var lanUrl = BuildLanUrl(httpPort.Status.Port);

        return
        [
            new JoinAddressOption(ModeAuto, "Automatic", null, true,
                "Use the internet address when a tunnel is published, then the local name, then the network address."),
            new JoinAddressOption(ModeCloudflare, "Internet address", cloudflareUrl, cloudflareUrl is not null,
                cloudflareUrl is not null
                    ? "Works on any network, including phones on mobile data."
                    : "Publish a Cloudflare tunnel to use this address."),
            new JoinAddressOption(ModeLocal, "Local name", localUrl, localUrl is not null,
                local.Supported
                    ? "Works for phones on the same Wi-Fi. Easiest to read aloud."
                    : "This machine cannot publish a .local name."),
            new JoinAddressOption(ModeLan, "Network address", lanUrl, lanUrl is not null,
                lanUrl is not null
                    ? "Numbers rather than a name. Use this when the local name does not resolve on your Wi-Fi."
                    : "No network address was detected on this machine."),
        ];
    }

    /// <summary>
    /// Primary non-loopback IPv4 for this machine.
    ///
    /// The .local name depends on mDNS, which plenty of school networks block
    /// or filter between client isolation groups. A numeric address is the
    /// fallback a teacher can read out when the name does not resolve.
    /// </summary>
    private static string? BuildLanUrl(int port)
    {
        try
        {
            var candidates = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic => nic.OperationalStatus == OperationalStatus.Up
                    && nic.NetworkInterfaceType != NetworkInterfaceType.Loopback
                    && nic.NetworkInterfaceType != NetworkInterfaceType.Tunnel)
                .SelectMany(nic => nic.GetIPProperties().UnicastAddresses
                    .Where(address => address.Address.AddressFamily == AddressFamily.InterNetwork)
                    .Select(address => (Nic: nic, address.Address)))
                .Where(entry => !IPAddress.IsLoopback(entry.Address))
                // Link-local 169.254.x.x means no DHCP lease; nothing will reach it.
                .Where(entry => !entry.Address.ToString().StartsWith("169.254.", StringComparison.Ordinal))
                .ToArray();

            // Prefer wired, then wireless, so a machine with a virtual adapter
            // does not advertise an address the room cannot reach.
            var chosen = candidates.FirstOrDefault(entry => entry.Nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet)
                .Address
                ?? candidates.FirstOrDefault(entry => entry.Nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211).Address
                ?? candidates.FirstOrDefault().Address;

            if (chosen is null) return null;
            return port == 80 ? $"http://{chosen}" : $"http://{chosen}:{port}";
        }
        catch
        {
            return null;
        }
    }

    private sealed record StoredMode(string Mode);
}
