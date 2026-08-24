namespace LessonCue.Server.Shortener;

/// <summary>What the bare short domain should do.</summary>
public enum ShortenerRootRedirect
{
    /// <summary>The shortener's own not-found page.</summary>
    NotFound,
    /// <summary>LessonCue's public address.</summary>
    LessonCue,
    /// <summary>The organization's website, given below.</summary>
    Organization,
    /// <summary>Somewhere else entirely, given below.</summary>
    Custom,
}

/// <summary>Where the integration has got to, for the console to report.</summary>
public enum ShortenerState
{
    NotInstalled,
    Installing,
    Configured,
    Running,
    Degraded,
    Stopped,
    ConfigurationError,
}

/// <summary>
/// The shortener's configuration, as an administrator set it.
///
/// Every value is theirs. Nothing here knows the name of any particular
/// domain, and an installation that leaves the integration off never reads it.
/// </summary>
public sealed record ShortenerSettings(
    bool Enabled,
    string Domain,
    string AdminHost,
    string Upstream,
    ShortenerRootRedirect RootRedirect,
    string RootRedirectUrl,
    int PoolVersion)
{
    public static readonly ShortenerSettings Empty =
        new(false, "", "", "", ShortenerRootRedirect.NotFound, "", 0);

    /// <summary>Usable once it has a domain and somewhere to reach the shortener.</summary>
    public bool Configured => Domain.Length > 0 && Upstream.Length > 0;

    /// <summary>The public short domain, as a browser would be given it.</summary>
    public string PublicUrl => Domain.Length == 0 ? "" : $"https://{Domain}";

    /// <summary>The management interface, which is never where short links live.</summary>
    public string AdminUrl => AdminHost.Length == 0 ? "" : $"https://{AdminHost}";

    /// <summary>Where a phone goes for one code, on the short domain.</summary>
    public string ShortLinkFor(string code) => Domain.Length == 0 ? "" : $"https://{Domain}/{code}";
}
