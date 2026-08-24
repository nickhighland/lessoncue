namespace LessonCue.Server.Shortener;

/// <summary>One public hostname and the local service behind it.</summary>
public sealed record TunnelRoute(string Hostname, string Service, string Purpose);

/// <summary>How the routes can be added, and what still needs a person.</summary>
public sealed record TunnelPlan(
    IReadOnlyList<TunnelRoute> Routes,
    bool CanApplyAutomatically,
    string Explanation,
    IReadOnlyList<string> Instructions);

/// <summary>
/// What the tunnel needs so the short domain and its management console reach
/// the right local service.
///
/// LessonCue holds a tunnel token, not a Cloudflare API token, so for a
/// dashboard-managed tunnel it cannot add routes itself. It says exactly what
/// to add instead. Never a reason to fail an installation: the shortener runs
/// perfectly well on the local network while the routes are pending.
/// </summary>
public static class ShortenerTunnelPlanner
{
    /// <summary>
    /// The two routes to add, alongside whatever already points at LessonCue.
    ///
    /// The short domain goes to the shortener itself, and the management host
    /// to the web client. They are never the same service: one serves links to
    /// the public, the other serves a console to an administrator.
    /// </summary>
    public static IReadOnlyList<TunnelRoute> RoutesFor(ShortenerSettings settings, int shortenerPort, int consolePort)
    {
        if (!settings.Configured) return [];
        var routes = new List<TunnelRoute>
        {
            new(settings.Domain, $"http://localhost:{shortenerPort}", "Short links, and the game codes on them"),
        };
        if (settings.AdminHost.Length > 0)
            routes.Add(new(settings.AdminHost, $"http://localhost:{consolePort}", "The shortener's management console"));
        return routes;
    }

    /// <summary>
    /// Instructions precise enough to follow without guessing, using the
    /// hostnames this installation actually configured.
    /// </summary>
    public static TunnelPlan ForManagedTunnel(ShortenerSettings settings, int shortenerPort, int consolePort)
    {
        var routes = RoutesFor(settings, shortenerPort, consolePort);
        if (routes.Count == 0)
            return new TunnelPlan([], false, "Configure the short domain first.", []);

        var steps = new List<string>
        {
            "Open Cloudflare Zero Trust, then Networks → Tunnels, and choose the tunnel already serving LessonCue.",
            "On its Public Hostnames tab, add the entries below. Leave every existing entry alone — the one pointing at LessonCue has to keep working.",
        };
        steps.AddRange(routes.Select(route => $"Add {route.Hostname} → {route.Service}  ({route.Purpose})"));
        steps.Add("Cloudflare creates the DNS records for you, provided the domain is in the same account.");
        steps.Add("Do not add a Redirect Rule for the short domain. A rule on the whole hostname would also catch the short links and the game codes underneath it.");

        return new TunnelPlan(routes, false,
            "This tunnel is managed from the Cloudflare dashboard, and LessonCue holds only a connector token for it, "
            + "which cannot change routing. Add these two hostnames there.",
            steps);
    }

    /// <summary>
    /// Add the routes to a locally managed cloudflared configuration.
    ///
    /// Strictly additive. Existing entries keep their order and their exact
    /// text, the catch-all stays last, and anything already pointing at one of
    /// our hostnames is left alone rather than rewritten. If the file does not
    /// look like an ingress list this refuses instead of guessing -- a mangled
    /// tunnel config takes LessonCue itself off the internet.
    /// </summary>
    public static (bool Changed, string Config, string? Refusal) MergeIngress(string existing, IReadOnlyList<TunnelRoute> routes)
    {
        if (routes.Count == 0) return (false, existing, "There are no routes to add.");

        var lines = existing.Replace("\r\n", "\n").Split('\n').ToList();
        var ingressAt = lines.FindIndex(line => line.TrimEnd() == "ingress:" || line.TrimStart().StartsWith("ingress:", StringComparison.Ordinal));
        if (ingressAt < 0) return (false, existing, "That cloudflared configuration has no ingress list, so LessonCue will not edit it.");

        // The catch-all is the entry with a service and no hostname. cloudflared
        // requires it last, and a config without one is already broken.
        var catchAllAt = -1;
        for (var index = ingressAt + 1; index < lines.Count; index++)
        {
            var trimmed = lines[index].Trim();
            if (trimmed.StartsWith("- service:", StringComparison.Ordinal)) catchAllAt = index;
        }
        if (catchAllAt < 0) return (false, existing, "That cloudflared configuration has no catch-all rule, so LessonCue will not edit it.");

        var already = existing;
        var missing = routes.Where(route => !already.Contains($"hostname: {route.Hostname}", StringComparison.OrdinalIgnoreCase)).ToList();
        if (missing.Count == 0) return (false, existing, null);

        var indent = new string(' ', lines[catchAllAt].Length - lines[catchAllAt].TrimStart().Length);
        var addition = missing.SelectMany(route => new[]
        {
            $"{indent}# {route.Purpose}",
            $"{indent}- hostname: {route.Hostname}",
            $"{indent}  service: {route.Service}",
        }).ToList();

        lines.InsertRange(catchAllAt, addition);
        return (true, string.Join("\n", lines), null);
    }

    /// <summary>
    /// Does the merged configuration still do what it did before?
    ///
    /// Checked rather than assumed: this file is what keeps LessonCue itself
    /// reachable, so a merge that dropped an existing hostname would be far
    /// worse than one that never ran.
    /// </summary>
    public static bool PreservesExisting(string before, string after)
    {
        var hostnames = Hostnames(before);
        return hostnames.All(after.Contains) && after.TrimEnd().EndsWith(LastRule(before).TrimEnd(), StringComparison.Ordinal);
    }

    private static IEnumerable<string> Hostnames(string config) => config
        .Replace("\r\n", "\n").Split('\n')
        .Select(line => line.Trim())
        .Where(line => line.StartsWith("- hostname:", StringComparison.Ordinal) || line.StartsWith("hostname:", StringComparison.Ordinal));

    private static string LastRule(string config) => config
        .Replace("\r\n", "\n").Split('\n')
        .LastOrDefault(line => line.Trim().StartsWith("- service:", StringComparison.Ordinal)) ?? "";
}
