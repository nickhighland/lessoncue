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
    // A separate client that does not follow redirects: seeing the redirect is
    // the whole point of probing a game code.
    HttpClient probes,
    string dataPath)
{
    private readonly string _integrationKeyPath = Path.Combine(dataPath, "config", "shortener-integration-key");
    /// <summary>The secret the installer shares with the shortener container.</summary>
    private readonly string _sharedKeyPath = Path.Combine(dataPath, "config", "shortener", "integration-key");

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

    /// <summary>
    /// Drop the cache so an administrator sees their own edit at once. Also
    /// forgets that short links were working, because the change may be exactly
    /// what stopped them.
    /// </summary>
    public void Invalidate()
    {
        lock (_cacheLock) _cachedAt = DateTimeOffset.MinValue;
        MarkUsable(false);
    }

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
        // Never point a room at a short domain that has not been shown to
        // resolve. A dead QR on a wall is worse than a longer address.
        if (!ShortLinksUsable) return null;
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
    /// repair, so routine work is never done with a person's credential.
    ///
    /// This is the key the shortener was *started with*, not one LessonCue
    /// invents: the shortener has no API for creating keys, so a locally
    /// generated one would simply be rejected. The installer writes the same
    /// value to the shortener's secret and to the path below.
    /// </summary>
    public string? IntegrationKey => ReadSecret(_integrationKeyPath) ?? ReadSecret(_sharedKeyPath);

    /// <summary>Where a key came from, so the console can explain itself.</summary>
    public string IntegrationKeySource =>
        ReadSecret(_integrationKeyPath) is not null ? "entered" :
        ReadSecret(_sharedKeyPath) is not null ? "installer" : "none";

    /// <summary>
    /// Record the key the shortener was started with.
    ///
    /// Accepts rather than generates. An administrator can paste the value from
    /// the installer, or from `shlink api-key:generate`, for deployments where
    /// LessonCue cannot read the shared secret file directly.
    /// </summary>
    public async Task SetIntegrationKeyAsync(string key, CancellationToken ct = default)
    {
        var trimmed = (key ?? "").Trim();
        if (trimmed.Length < 8) throw new ArgumentException("That does not look like an API key.");
        await WriteSecretAsync(_integrationKeyPath, trimmed, ct);
    }

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
        try
        {
            await File.WriteAllTextAsync(temporary, value.Trim() + Environment.NewLine, ct);
            // Readable only by the account that runs the server.
            if (!OperatingSystem.IsWindows())
                File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            File.Move(temporary, path, true);
        }
        finally
        {
            // A cancelled or failed write would otherwise leave a whole API key
            // in a file nothing knows to clean up or exclude from a backup.
            try { if (File.Exists(temporary)) File.Delete(temporary); }
            catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    /// <summary>
    /// Forget the copy LessonCue holds. Never the shared secret, which belongs
    /// to the shortener and is what it is still running with.
    /// </summary>
    public void ForgetSecrets()
    {
        foreach (var path in new[] { _integrationKeyPath, _integrationKeyPath + ".tmp" })
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

        // Switched off deliberately. Whether the shortener happens to be
        // answering is beside the point -- reporting Running here would
        // contradict the button the administrator just pressed.
        if (!settings.Enabled)
            return Remember(new ShortenerStatus(ShortenerState.Configured, false, settings.Domain, settings.AdminHost,
                settings.PublicUrl, settings.AdminUrl, ReservedGameCodes.All.Count, 0, pool.Active,
                "Short links are switched off. Games use LessonCue's own address.", []));

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
        // Recorded so the hot path can decide whether a short link would
        // actually resolve, without asking the network on every projection.
        MarkUsable(missing.Count == 0);
        var detail = missing.Count == 0
            ? null
            : $"{missing.Count} reserved {(missing.Count == 1 ? "code is" : "codes are")} missing or owned by someone else.";

        return Remember(new ShortenerStatus(state, settings.Enabled, settings.Domain, settings.AdminHost,
            settings.PublicUrl, settings.AdminUrl, ReservedGameCodes.All.Count, present, pool.Active, detail, missing));
    }

    private volatile bool _usable;
    private DateTimeOffset _usableAt = DateTimeOffset.MinValue;

    private void MarkUsable(bool usable)
    {
        _usable = usable;
        _usableAt = usable ? DateTimeOffset.UtcNow : DateTimeOffset.MinValue;
    }

    /// <summary>
    /// Are short links actually working right now?
    ///
    /// True only after a status check found the shortener answering with the
    /// whole reserved set present, and only for as long as that finding is
    /// fresh. Anything else and games fall back to LessonCue's own address --
    /// far better than handing a room a link that 404s.
    /// </summary>
    public bool ShortLinksUsable => _usable && DateTimeOffset.UtcNow - _usableAt < TimeSpan.FromMinutes(10);

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

    // -------------------------------------------------------------- probing

    /// <summary>One thing that was checked from the public side, and the result.</summary>
    public sealed record Check(string Name, bool Passed, string Detail);

    /// <summary>
    /// Check the two public hostnames the way a phone would.
    ///
    /// Each of these can be true on its own while the domain as a whole is
    /// wrong, so they are asked separately: the shortener answering locally
    /// tells you nothing about whether the tunnel route reaches it.
    /// </summary>
    public async Task<IReadOnlyList<Check>> ProbeAsync(CancellationToken ct = default)
    {
        var settings = await SettingsAsync(ct);
        if (!settings.Configured)
            return [new Check("Configured", false, "Set the short domain and where the shortener is reachable first.")];

        var checks = new List<Check>
        {
            await ProbeOneAsync("The shortener answers locally", $"{settings.Upstream.TrimEnd('/')}/{ShlinkClient.HealthPath}",
                "LessonCue can reach it inside the deployment.", ct),
        };

        // Through the tunnel now, on the hostnames the room will actually use.
        checks.Add(await ProbeOneAsync($"{settings.Domain} reaches the shortener",
            $"{settings.PublicUrl}/{ShlinkClient.HealthPath}",
            "The short domain is routed to the shortener.", ct));

        if (settings.AdminHost.Length > 0)
            checks.Add(await ProbeOneAsync($"{settings.AdminHost} serves the console",
                settings.AdminUrl, "The management address is routed to the web client.", ct));

        // And a reserved code, because that is the path a phone takes.
        var sample = ReservedGameCodes.All.FirstOrDefault();
        if (sample is not null)
            checks.Add(await ProbeOneAsync($"A game code resolves on {settings.Domain}",
                settings.ShortLinkFor(sample), "A reserved code redirects rather than 404s.", ct, expectRedirect: true));

        return checks;
    }

    private async Task<Check> ProbeOneAsync(string name, string url, string good, CancellationToken ct, bool expectRedirect = false)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            using var response = await probes.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            var status = (int)response.StatusCode;
            var redirected = status is >= 300 and < 400;
            var passed = expectRedirect ? redirected : status is >= 200 and < 400;
            return new Check(name, passed, passed
                ? good
                : expectRedirect && status == 404
                    ? "The shortener answered, but does not know that code. Repair the reserved codes."
                    : $"Answered {status}.");
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            return new Check(name, false, error is TaskCanceledException
                ? "Timed out. If the tunnel route was only just added, give it a moment."
                : "No answer. Check the tunnel route for this hostname.");
        }
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
