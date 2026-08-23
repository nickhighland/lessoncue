using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

/// <summary>
/// What the bare root of the public short domain should do.
/// </summary>
public enum ShortDomainRootAction
{
    /// <summary>Send the visitor to the configured destination.</summary>
    Redirect,
    /// <summary>Serve LessonCue itself on the short domain. Not a redirect.</summary>
    LessonCue,
    /// <summary>Hand the request to the shortener like any other path.</summary>
    Shortener,
    /// <summary>Answer 404 and nothing else.</summary>
    NotFound,
}

public sealed record ShortDomainSettings(
    string Domain,
    string RootRedirectUrl,
    bool RootRedirectEnabled,
    string RootFallback,
    bool Permanent,
    bool PreserveQuery,
    string Upstream)
{
    public static readonly ShortDomainSettings Empty = new("", "", true, "shortener", false, true, "");

    /// <summary>The short domain only does anything once it and the shortener are both set.</summary>
    public bool Configured => Domain.Length > 0 && Upstream.Length > 0;

    /// <summary>The redirect is live only when it is switched on and has somewhere to go.</summary>
    public bool RootRedirectConfigured => RootRedirectEnabled && RootRedirectUrl.Length > 0;

    public ShortDomainRootAction RootAction => RootRedirectConfigured
        ? ShortDomainRootAction.Redirect
        : RootFallback switch
        {
            "lessoncue" => ShortDomainRootAction.LessonCue,
            "notfound" => ShortDomainRootAction.NotFound,
            _ => ShortDomainRootAction.Shortener,
        };

    public int RedirectStatusCode => Permanent ? StatusCodes.Status301MovedPermanently : StatusCodes.Status302Found;
}

/// <summary>
/// The public short domain: where it points, and what its bare root does.
///
/// The root is handled as an exact-path special case rather than as a short
/// code with an empty slug, so it can never shadow a real short URL or a
/// reserved game code. Everything that is not exactly "/" is the shortener's.
/// </summary>
public sealed class ShortDomainService(IServiceScopeFactory scopes, IHttpClientFactory clients)
{
    /// <summary>Anything outside this set is a way to smuggle script or local files into a redirect.</summary>
    private static readonly string[] AllowedSchemes = [Uri.UriSchemeHttp, Uri.UriSchemeHttps];

    private static readonly string[] Fallbacks = ["lessoncue", "shortener", "notfound"];

    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(5);

    private readonly Lock _cacheLock = new();
    private ShortDomainSettings _cached = ShortDomainSettings.Empty;
    private DateTimeOffset _cachedAt = DateTimeOffset.MinValue;

    /// <summary>
    /// Current settings, cached briefly.
    ///
    /// Every request to the short domain asks, so this cannot be a database
    /// round trip each time; a few seconds of staleness after an edit is a fair
    /// trade for not putting the shortener's traffic through EF.
    /// </summary>
    public ShortDomainSettings Current
    {
        get
        {
            lock (_cacheLock)
            {
                // Checked again inside the lock: several requests can pass the
                // first test together, and only one of them should go and ask.
                if (DateTimeOffset.UtcNow - _cachedAt < CacheFor) return _cached;
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                var organization = db.Organizations.AsNoTracking().OrderBy(item => item.Id).FirstOrDefault();
                _cached = organization is null ? ShortDomainSettings.Empty : Read(organization);
                _cachedAt = DateTimeOffset.UtcNow;
                return _cached;
            }
        }
    }

    public static ShortDomainSettings Read(Organization organization) => new(
        organization.ShortDomain,
        organization.ShortDomainRootRedirectUrl,
        organization.ShortDomainRootRedirectEnabled,
        organization.ShortDomainRootFallback,
        organization.ShortDomainRootRedirectPermanent,
        organization.ShortDomainRootPreserveQuery,
        organization.ShortDomainUpstream);

    /// <summary>Drop the cache so an administrator sees their own edit immediately.</summary>
    public void Invalidate() => _cachedAt = DateTimeOffset.MinValue;

    /// <summary>
    /// Does this request belong to the short domain?
    /// </summary>
    public static bool Matches(ShortDomainSettings settings, string? host)
    {
        if (!settings.Configured || string.IsNullOrWhiteSpace(host)) return false;
        var candidate = host.Trim();
        // Host headers carry the port; the domain never does.
        var colon = candidate.LastIndexOf(':');
        if (colon > 0 && !candidate.Contains(']', StringComparison.Ordinal)) candidate = candidate[..colon];
        return string.Equals(candidate.TrimEnd('.'), settings.Domain, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Only the exact root is ours. "/kids" and "/Q7Z6" are the shortener's,
    /// which is the whole point: a redirect that swallowed them would break
    /// every short link and every reserved game code on the domain.
    /// </summary>
    public static bool IsRoot(PathString path) => !path.HasValue || path.Value is "/";

    /// <summary>What should happen to one request on its way in.</summary>
    public enum Disposition
    {
        /// <summary>Not ours. Hand it to LessonCue untouched.</summary>
        PassThrough,
        /// <summary>Answer with the configured root redirect.</summary>
        Redirect,
        /// <summary>Answer 404 and nothing else.</summary>
        NotFound,
        /// <summary>Give it to the shortener.</summary>
        Forward,
    }

    /// <summary>
    /// The whole routing rule, in one place and with no I/O, so the promise it
    /// makes can actually be tested: nothing but the exact root is ever
    /// answered by LessonCue, whatever the root is configured to do.
    /// </summary>
    public static Disposition Decide(ShortDomainSettings settings, string? host, PathString path)
    {
        if (!Matches(settings, host)) return Disposition.PassThrough;
        if (!IsRoot(path)) return Disposition.Forward;
        return settings.RootAction switch
        {
            ShortDomainRootAction.Redirect => Disposition.Redirect,
            ShortDomainRootAction.LessonCue => Disposition.PassThrough,
            ShortDomainRootAction.NotFound => Disposition.NotFound,
            _ => Disposition.Forward,
        };
    }

    /// <summary>Where the root should send someone, query string included when asked for.</summary>
    public static string RootDestination(ShortDomainSettings settings, QueryString query) =>
        settings.PreserveQuery && query.HasValue
            ? AppendQuery(settings.RootRedirectUrl, query.Value!)
            : settings.RootRedirectUrl;

    private static string AppendQuery(string destination, string query)
    {
        var incoming = query.StartsWith('?') ? query[1..] : query;
        if (incoming.Length == 0) return destination;
        var fragment = destination.IndexOf('#', StringComparison.Ordinal);
        var head = fragment < 0 ? destination : destination[..fragment];
        var tail = fragment < 0 ? "" : destination[fragment..];
        var separator = head.Contains('?', StringComparison.Ordinal) ? '&' : '?';
        return $"{head}{separator}{incoming}{tail}";
    }

    // ---------------------------------------------------------------- saving

    public static string NormalizeDomain(string? value)
    {
        var candidate = (value ?? "").Trim().Trim('.').ToLowerInvariant();
        if (candidate.Length == 0) return "";
        if (!candidate.Contains("://", StringComparison.Ordinal)) candidate = "https://" + candidate;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri) || uri.IdnHost.Length == 0)
            throw new ArgumentException("Enter the short domain on its own, such as go.example.org.");
        if (uri.AbsolutePath.Length > 1 || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new ArgumentException("Enter the short domain without a path, such as go.example.org.");
        var host = uri.IdnHost.ToLowerInvariant();
        if (!host.Contains('.') || System.Net.IPAddress.TryParse(host, out _))
            throw new ArgumentException("Enter a public DNS name, such as go.example.org.");
        return host;
    }

    public static string NormalizeUpstream(string? value)
    {
        var candidate = (value ?? "").Trim();
        if (candidate.Length == 0) return "";
        if (!candidate.Contains("://", StringComparison.Ordinal)) candidate = "http://" + candidate;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri) || !AllowedSchemes.Contains(uri.Scheme))
            throw new ArgumentException("Enter where the shortener is reachable, such as http://shlink:8080.");
        return uri.GetLeftPart(UriPartial.Authority);
    }

    public static string NormalizeFallback(string? value)
    {
        var candidate = (value ?? "").Trim().ToLowerInvariant();
        return Fallbacks.Contains(candidate) ? candidate : "shortener";
    }

    /// <summary>
    /// Validate a root destination.
    ///
    /// Only http and https are allowed, which rules out javascript:, data: and
    /// file: by construction rather than by blocklist. A destination on the
    /// short domain itself is refused outright: the root would redirect to the
    /// root, and the browser would spin until it gave up.
    /// </summary>
    public static string NormalizeRootRedirect(string? value, string shortDomain)
    {
        var candidate = (value ?? "").Trim();
        if (candidate.Length == 0) return "";
        if (!candidate.Contains("://", StringComparison.Ordinal)) candidate = "https://" + candidate;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri))
            throw new ArgumentException("Enter a full web address, such as https://www.example.org.");
        if (!AllowedSchemes.Contains(uri.Scheme))
            throw new ArgumentException("The destination must start with https:// or http://.");
        if (uri.IdnHost.Length == 0)
            throw new ArgumentException("Enter a full web address, such as https://www.example.org.");
        if (shortDomain.Length > 0 && string.Equals(uri.IdnHost, shortDomain, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"That sends {shortDomain} back to itself. Choose a destination on another domain.");
        return uri.ToString();
    }

    // ---------------------------------------------------------------- testing

    /// <summary>One thing that was checked, and what came back.</summary>
    public sealed record Check(string Name, bool Passed, string Detail);

    /// <summary>
    /// Prove the whole path, not just the setting.
    ///
    /// Four things can each be true on their own and still add up to a broken
    /// domain, so each is asked separately: the domain answers, the root does
    /// what was configured, an ordinary short link still reaches the shortener,
    /// and a reserved game code still resolves.
    /// </summary>
    public async Task<IReadOnlyList<Check>> TestAsync(string? sampleSlug, string? gameCode, CancellationToken ct = default)
    {
        var settings = Current;
        if (!settings.Configured)
            return [new Check("Configured", false, "Set the short domain and where the shortener is reachable first.")];

        var checks = new List<Check>();
        var client = clients.CreateClient(ProbeClient);
        var root = $"https://{settings.Domain}/";

        // 1. The public short domain resolves.
        var (reached, rootResponse, rootError) = await ProbeAsync(client, root, ct);
        checks.Add(new Check("Short domain resolves", reached,
            reached ? $"{settings.Domain} answered." : rootError ?? "No answer from the short domain."));

        // 2. The root does what it was told to.
        if (reached && rootResponse is not null)
        {
            var location = rootResponse.Headers.Location?.ToString() ?? "";
            var status = (int)rootResponse.StatusCode;
            checks.Add(settings.RootAction switch
            {
                ShortDomainRootAction.Redirect => new Check("Root redirect",
                    status == settings.RedirectStatusCode && location.StartsWith(TrimSlash(settings.RootRedirectUrl), StringComparison.OrdinalIgnoreCase),
                    status is >= 300 and < 400 ? $"{status} to {location}" : $"Expected a redirect, got {status}."),
                ShortDomainRootAction.NotFound => new Check("Root returns 404", status == 404, $"Answered {status}."),
                ShortDomainRootAction.LessonCue => new Check("Root shows LessonCue", status is >= 200 and < 400, $"Answered {status}."),
                _ => new Check("Root goes to the shortener", status is >= 200 and < 500, $"Answered {status}."),
            });
        }

        // 3. An ordinary short link still reaches the shortener. A miss is a
        //    pass: what matters is that the shortener answered, not that this
        //    particular slug exists.
        var slug = string.IsNullOrWhiteSpace(sampleSlug) ? "lessoncue-probe" : sampleSlug.Trim().TrimStart('/');
        var (slugReached, slugResponse, slugError) = await ProbeAsync(client, $"https://{settings.Domain}/{slug}", ct);
        checks.Add(new Check("Short links reach the shortener", slugReached,
            slugReached ? $"/{slug} answered {(int)slugResponse!.StatusCode} from the shortener." : slugError ?? "No answer."));

        // 4. And a reserved game code still resolves, which is the path that
        //    breaks first if the root ever starts swallowing everything.
        if (!string.IsNullOrWhiteSpace(gameCode))
        {
            var code = gameCode.Trim().TrimStart('/');
            var (codeReached, codeResponse, codeError) = await ProbeAsync(client, $"https://{settings.Domain}/{code}", ct);
            var resolved = codeReached && (int)codeResponse!.StatusCode is >= 300 and < 400;
            checks.Add(new Check("Reserved game code resolves", resolved,
                codeReached ? $"/{code} answered {(int)codeResponse!.StatusCode}{Destination(codeResponse)}" : codeError ?? "No answer."));
        }

        return checks;
    }

    public const string ProbeClient = "short-domain-probe";

    private static string Destination(HttpResponseMessage response) =>
        response.Headers.Location is { } location ? $" to {location}" : "";

    private static string TrimSlash(string value) => value.TrimEnd('/');

    private static async Task<(bool Reached, HttpResponseMessage? Response, string? Error)> ProbeAsync(
        HttpClient client, string url, CancellationToken ct)
    {
        try
        {
            var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            return (true, response, null);
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            return (false, null, error is TaskCanceledException ? "Timed out." : error.Message);
        }
    }

    /// <summary>
    /// Worth saying out loud but not worth refusing: a plain-http destination,
    /// or a permanent redirect that intermediaries will cache long after the
    /// administrator wants it back.
    /// </summary>
    public static IReadOnlyList<string> Warnings(ShortDomainSettings settings)
    {
        var warnings = new List<string>();
        if (settings.RootRedirectConfigured && settings.RootRedirectUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            warnings.Add("This destination is not encrypted. Prefer an https:// address where the site offers one.");
        if (settings.RootRedirectConfigured && settings.Permanent)
            warnings.Add("A permanent redirect is cached hard by browsers and proxies. Visitors who have seen it may keep being sent there for a long time after you change it.");
        return warnings;
    }
}
