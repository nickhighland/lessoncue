using System.Text.RegularExpressions;

namespace LessonCue.Server.Shortener;

/// <summary>
/// Reading and checking what an administrator typed.
///
/// Deliberately free of any particular domain: the same code has to serve an
/// installation on one domain and an installation on another, so everything
/// specific arrives as configuration and is validated on the way in.
/// </summary>
public static partial class ShortenerConfiguration
{
    [GeneratedRegex(@"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")]
    private static partial Regex HostShape();

    private static readonly string[] WebSchemes = [Uri.UriSchemeHttp, Uri.UriSchemeHttps];

    public static ShortenerSettings Read(Organization organization) => new(
        organization.ShortenerEnabled,
        organization.ShortDomain,
        organization.ShortenerAdminHost,
        organization.ShortDomainUpstream,
        ParseRootRedirect(organization.ShortenerRootRedirectMode),
        organization.ShortDomainRootRedirectUrl,
        organization.ShortenerPoolVersion);

    public static ShortenerRootRedirect ParseRootRedirect(string? value) => (value ?? "").Trim().ToLowerInvariant() switch
    {
        "lessoncue" => ShortenerRootRedirect.LessonCue,
        "organization" => ShortenerRootRedirect.Organization,
        "custom" => ShortenerRootRedirect.Custom,
        _ => ShortenerRootRedirect.NotFound,
    };

    public static string RootRedirectName(ShortenerRootRedirect value) => value switch
    {
        ShortenerRootRedirect.LessonCue => "lessoncue",
        ShortenerRootRedirect.Organization => "organization",
        ShortenerRootRedirect.Custom => "custom",
        _ => "notfound",
    };

    /// <summary>
    /// A bare hostname, stored without a scheme.
    ///
    /// Accepts what people actually paste -- a full URL, a trailing slash, a
    /// trailing dot, stray case -- and stores one canonical form.
    /// </summary>
    public static string NormalizeHost(string? value, string what = "short domain")
    {
        var candidate = (value ?? "").Trim();
        if (candidate.Length == 0) return "";
        if (candidate.Contains("://", StringComparison.Ordinal))
        {
            if (!Uri.TryCreate(candidate, UriKind.Absolute, out var parsed) || !WebSchemes.Contains(parsed.Scheme))
                throw new ArgumentException($"Enter the {what} on its own, such as go.example.org.");
            if (parsed.AbsolutePath.Length > 1 || parsed.Query.Length > 0 || parsed.Fragment.Length > 0)
                throw new ArgumentException($"Enter the {what} without a path, such as go.example.org.");
            candidate = parsed.IdnHost;
        }

        candidate = candidate.TrimEnd('/').Trim('.').ToLowerInvariant();
        if (candidate.Contains('/') || candidate.Contains(' '))
            throw new ArgumentException($"Enter the {what} on its own, such as go.example.org.");
        if (System.Net.IPAddress.TryParse(candidate, out _))
            throw new ArgumentException($"Enter a domain name for the {what}, not an IP address.");
        if (!HostShape().IsMatch(candidate))
            throw new ArgumentException($"Enter a public domain name for the {what}, such as go.example.org.");
        return candidate;
    }

    /// <summary>
    /// The management host, which defaults to a subdomain of the short domain
    /// but is the administrator's to override -- some installations will not
    /// have DNS control over that name.
    /// </summary>
    public static string DefaultAdminHost(string shortDomain) =>
        shortDomain.Length == 0 ? "" : $"short.{shortDomain}";

    /// <summary>
    /// The management host must not be the short domain itself: one serves
    /// short links, the other serves the console, and a single hostname cannot
    /// do both.
    /// </summary>
    public static string NormalizeAdminHost(string? value, string shortDomain)
    {
        var candidate = NormalizeHost(value, "management address");
        if (candidate.Length == 0) return DefaultAdminHost(shortDomain);
        if (shortDomain.Length > 0 && string.Equals(candidate, shortDomain, StringComparison.Ordinal))
            throw new ArgumentException("The management address has to differ from the short domain, which serves the links themselves.");
        return candidate;
    }

    /// <summary>Where LessonCue reaches the shortener from inside the deployment.</summary>
    public static string NormalizeUpstream(string? value)
    {
        var candidate = (value ?? "").Trim();
        if (candidate.Length == 0) return "";
        if (!candidate.Contains("://", StringComparison.Ordinal)) candidate = "http://" + candidate;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri) || !WebSchemes.Contains(uri.Scheme))
            throw new ArgumentException("Enter where the shortener is reachable, such as http://shlink:8080.");
        return uri.GetLeftPart(UriPartial.Authority);
    }

    /// <summary>
    /// A destination for the bare short domain.
    ///
    /// Only http and https, which excludes javascript:, data: and file: by
    /// construction rather than by blocklist. A destination on the short domain
    /// itself is a loop and is refused.
    /// </summary>
    public static string NormalizeRedirect(string? value, string shortDomain)
    {
        var candidate = (value ?? "").Trim();
        if (candidate.Length == 0) return "";
        if (!candidate.Contains("://", StringComparison.Ordinal)) candidate = "https://" + candidate;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri))
            throw new ArgumentException("Enter a full web address, such as https://www.example.org.");
        if (!WebSchemes.Contains(uri.Scheme))
            throw new ArgumentException("The destination must start with https:// or http://.");
        if (uri.IdnHost.Length == 0)
            throw new ArgumentException("Enter a full web address, such as https://www.example.org.");
        if (shortDomain.Length > 0 && string.Equals(uri.IdnHost, shortDomain, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"That sends {shortDomain} back to itself. Choose a destination on another domain.");
        return uri.ToString();
    }

    /// <summary>
    /// Where the bare short domain actually ends up, given the chosen mode.
    /// Empty means the shortener answers it with its own not-found page.
    /// </summary>
    public static string ResolveRootRedirect(ShortenerSettings settings, string lessonCuePublicUrl) => settings.RootRedirect switch
    {
        ShortenerRootRedirect.LessonCue => lessonCuePublicUrl,
        ShortenerRootRedirect.Organization or ShortenerRootRedirect.Custom => settings.RootRedirectUrl,
        _ => "",
    };
}
