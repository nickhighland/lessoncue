using System.Security.Cryptography;
using LessonCue.Server.Activities;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server.Shortener;

/// <summary>Everything the console needs to describe the integration.</summary>
public sealed record ShortenerStatus(
    ShortenerState State,
    bool Enabled,
    string Domain,
    string AdminHost,
    string PublicUrl,
    string AdminUrl,
    int PoolTotal,
    int PoolPresent,
    int PoolActive,
    string? Detail,
    IReadOnlyList<string> Conflicts);

/// <summary>
/// The optional self-hosted URL shortener.
///
/// Optional in the strong sense: an installation that never turns it on pays
/// nothing for it, and one that turns it on and later loses it keeps working.
/// Short links and short-domain game codes stop; nothing else does.
/// </summary>
public sealed class ShortenerService(
    IServiceScopeFactory scopes,
    ShlinkClient shlink,
    ReservedCodeProvisioner provisioner,
    string dataPath)
{
    private readonly string _integrationKeyPath = Path.Combine(dataPath, "config", "shortener-integration-key");
    private readonly string _adminKeyPath = Path.Combine(dataPath, "config", "shortener-admin-key");

    private ShortenerStatus? _lastStatus;
    private readonly Lock _statusLock = new();

    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(5);
    private readonly Lock _cacheLock = new();
    private ShortenerSettings _cached = ShortenerSettings.Empty;
    private DateTimeOffset _cachedAt = DateTimeOffset.MinValue;

    /// <summary>
    /// Settings without waiting, for the paths that build a join link on every
    /// projection. A few seconds of staleness after an edit is a fair trade for
    /// keeping the database out of that loop.
    /// </summary>
    public ShortenerSettings Current
    {
        get
        {
            if (DateTimeOffset.UtcNow - _cachedAt < CacheFor) return _cached;
            lock (_cacheLock)
            {
                // Checked again inside the lock: several callers can pass the
                // first test together, and only one should go and ask.
                if (DateTimeOffset.UtcNow - _cachedAt < CacheFor) return _cached;
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                var organization = db.Organizations.AsNoTracking().OrderBy(item => item.Id).FirstOrDefault();
                _cached = organization is null ? ShortenerSettings.Empty : ShortenerConfiguration.Read(organization);
                _cachedAt = DateTimeOffset.UtcNow;
                return _cached;
            }
        }
    }

    /// <summary>Drop the cache so an administrator sees their own edit at once.</summary>
    public void Invalidate() { lock (_cacheLock) _cachedAt = DateTimeOffset.MinValue; }

    /// <summary>
    /// The address a phone should be given for this game.
    ///
    /// Only reserved codes get the short domain: an ordinary six-character code
    /// has no short link behind it, so sending a room there would be a dead
    /// end. Null means "use LessonCue's own address", which is what happens
    /// whenever the integration is off, unconfigured, or unreachable.
    /// </summary>
    public string? ShortJoinUrlFor(string? joinCode)
    {
        if (string.IsNullOrWhiteSpace(joinCode)) return null;
        var settings = Current;
        if (!settings.Enabled || settings.Domain.Length == 0) return null;
        var code = ReservedGameCodes.Normalize(joinCode);
        return ReservedGameCodes.IsReserved(code) ? settings.ShortLinkFor(code) : null;
    }

    // ------------------------------------------------------------- settings

    public async Task<ShortenerSettings> SettingsAsync(CancellationToken ct = default)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
        var organization = await db.Organizations.AsNoTracking().OrderBy(item => item.Id).FirstOrDefaultAsync(ct);
        return organization is null ? ShortenerSettings.Empty : ShortenerConfiguration.Read(organization);
    }

    /// <summary>LessonCue's own public address, which reserved codes point back to.</summary>
    public async Task<string> PublicBaseUrlAsync(CancellationToken ct = default)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
        var organization = await db.Organizations.AsNoTracking().OrderBy(item => item.Id).FirstOrDefaultAsync(ct);
        return (organization?.PublicBaseUrl ?? "").Trim().TrimEnd('/');
    }

    // -------------------------------------------------------------- secrets

    /// <summary>
    /// LessonCue's own API key, used only for provisioning, reconciliation and
    /// repair. Separate from the administrator's so routine work is never done
    /// with a human's credential, and so the shortener attributes our links to
    /// us.
    /// </summary>
    public string? IntegrationKey => ReadSecret(_integrationKeyPath);

    /// <summary>
    /// The administrator's key. Shown once at install and never again, and
    /// never sent to the browser afterwards.
    /// </summary>
    public string? AdminKey => ReadSecret(_adminKeyPath);

    public async Task SetIntegrationKeyAsync(string key, CancellationToken ct = default) =>
        await WriteSecretAsync(_integrationKeyPath, key, ct);

    public async Task SetAdminKeyAsync(string key, CancellationToken ct = default) =>
        await WriteSecretAsync(_adminKeyPath, key, ct);

    /// <summary>A key the shortener will accept, generated locally.</summary>
    public static string NewApiKey() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));

    private static string? ReadSecret(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var value = File.ReadAllText(path).Trim();
            return value.Length == 0 ? null : value;
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }

    private static async Task WriteSecretAsync(string path, string value, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + ".tmp";
        await File.WriteAllTextAsync(temporary, value.Trim() + Environment.NewLine, ct);
        // Readable only by the account that runs the server.
        if (!OperatingSystem.IsWindows())
            File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        File.Move(temporary, path, true);
    }

    public void ForgetSecrets()
    {
        foreach (var path in new[] { _integrationKeyPath, _adminKeyPath })
            try { if (File.Exists(path)) File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }

    // --------------------------------------------------------------- status

    /// <summary>
    /// What state the integration is in, checked live.
    ///
    /// Never throws: the console asking how the shortener is doing must not be
    /// able to take LessonCue down with it.
    /// </summary>
    public async Task<ShortenerStatus> StatusAsync(CancellationToken ct = default)
    {
        var settings = await SettingsAsync(ct);
        var pool = await PoolStatusAsync(ct);

        if (!settings.Enabled && !settings.Configured)
            return Remember(new ShortenerStatus(ShortenerState.NotInstalled, false, settings.Domain, settings.AdminHost,
                settings.PublicUrl, settings.AdminUrl, ReservedGameCodes.All.Count, 0, pool.Active, null, []));

        if (!settings.Configured)
            return Remember(new ShortenerStatus(ShortenerState.ConfigurationError, settings.Enabled, settings.Domain, settings.AdminHost,
                settings.PublicUrl, settings.AdminUrl, ReservedGameCodes.All.Count, 0, pool.Active,
                "Set the short domain and where the shortener is reachable.", []));

        var key = IntegrationKey;
        if (key is null)
            return Remember(new ShortenerStatus(ShortenerState.ConfigurationError, settings.Enabled, settings.Domain, settings.AdminHost,
                settings.PublicUrl, settings.AdminUrl, ReservedGameCodes.All.Count, 0, pool.Active,
                "LessonCue has no API key for the shortener. Run the installer again to issue one.", []));

        if (!await shlink.HealthyAsync(settings.Upstream, ct))
            return Remember(new ShortenerStatus(settings.Enabled ? ShortenerState.Stopped : ShortenerState.Configured,
                settings.Enabled, settings.Domain, settings.AdminHost, settings.PublicUrl, settings.AdminUrl,
                ReservedGameCodes.All.Count, 0, pool.Active, "The shortener is not answering.", []));

        var (present, missing) = await provisioner.AuditAsync(settings.Upstream, key, settings.Domain, ct);
        var state = missing.Count == 0 ? ShortenerState.Running : ShortenerState.Degraded;
        var detail = missing.Count == 0
            ? null
            : $"{missing.Count} reserved {(missing.Count == 1 ? "code is" : "codes are")} missing or owned by someone else.";

        return Remember(new ShortenerStatus(state, settings.Enabled, settings.Domain, settings.AdminHost,
            settings.PublicUrl, settings.AdminUrl, ReservedGameCodes.All.Count, present, pool.Active, detail, missing));
    }

    /// <summary>The last status we saw, for callers that must not wait on the network.</summary>
    public ShortenerStatus? LastStatus { get { lock (_statusLock) return _lastStatus; } }

    private ShortenerStatus Remember(ShortenerStatus status)
    {
        lock (_statusLock) _lastStatus = status;
        return status;
    }

    private async Task<(int Total, int Available, int Active)> PoolStatusAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var pool = scope.ServiceProvider.GetRequiredService<ReservedGameCodePool>();
        return await pool.StatusAsync(ct);
    }

    // ---------------------------------------------------------- provisioning

    /// <summary>Create or repair the hundred reserved codes.</summary>
    public async Task<ReservationReport> ReconcileAsync(CancellationToken ct = default)
    {
        var settings = await SettingsAsync(ct);
        var key = IntegrationKey;
        if (!settings.Configured || key is null)
            throw new InvalidOperationException("Configure the shortener before provisioning its reserved codes.");
        var publicUrl = await PublicBaseUrlAsync(ct);
        if (publicUrl.Length == 0)
            throw new InvalidOperationException("Set LessonCue's public address first: reserved codes have to point back to it.");
        return await provisioner.ReconcileAsync(settings.Upstream, key, settings.Domain, publicUrl, ct);
    }
}
