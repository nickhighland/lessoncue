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
    CloudflareTunnelService tunnel)
{
    public const string ModeAuto = "auto";
    public const string ModeCloudflare = "cloudflare";
    public const string ModeLocal = "local";

    private static readonly string[] Modes = [ModeAuto, ModeCloudflare, ModeLocal];
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
            foreach (var candidate in new[] { ModeCloudflare, ModeLocal })
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

        return
        [
            new JoinAddressOption(ModeAuto, "Automatic", null, true,
                "Use the internet address when a tunnel is published, otherwise the local name."),
            new JoinAddressOption(ModeCloudflare, "Internet address", cloudflareUrl, cloudflareUrl is not null,
                cloudflareUrl is not null
                    ? "Works on any network, including phones on mobile data."
                    : "Publish a Cloudflare tunnel to use this address."),
            new JoinAddressOption(ModeLocal, "Local name", localUrl, localUrl is not null,
                local.Supported
                    ? "Works for phones on the same Wi-Fi. Easiest to read aloud."
                    : "This machine cannot publish a .local name."),
        ];
    }

    private sealed record StoredMode(string Mode);
}
