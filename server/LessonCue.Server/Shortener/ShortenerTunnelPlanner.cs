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
    public static IReadOnlyList<TunnelRoute> RoutesFor(
        ShortenerSettings settings, int shortenerPort, int consolePort, string? serverHost = null)
    {
        if (!settings.Configured) return [];
        // The connector normally runs on this machine, so localhost is what it
        // needs. The server's own address is offered alongside it, because that
        // is what an operator can actually curl to check the route by hand.
        var host = string.IsNullOrWhiteSpace(serverHost) ? "localhost" : serverHost.Trim();
        var routes = new List<TunnelRoute>
        {
            new(settings.Domain, $"http://{host}:{shortenerPort}", "Short links, and the game codes on them"),
        };
        if (settings.AdminHost.Length > 0)
            routes.Add(new(settings.AdminHost, $"http://{host}:{consolePort}", "The shortener's management console"));
        return routes;
    }

    /// <summary>
    /// Instructions precise enough to follow without guessing, using the
    /// hostnames this installation actually configured.
    /// </summary>
    public static TunnelPlan ForManagedTunnel(
        ShortenerSettings settings, int shortenerPort, int consolePort, string? serverHost = null)
    {
        var routes = RoutesFor(settings, shortenerPort, consolePort, serverHost);
        if (routes.Count == 0)
            // Still worth explaining. Somebody reading this before they have
            // chosen a domain is exactly who most needs to know what the tunnel
            // will have to do, and that a hostname-wide redirect rule is a trap.
            return new TunnelPlan([], false,
                "Once a short domain is set, LessonCue will show the exact routes to add here. "
                + "The shape is the same for every installation.",
                [
                    "Reuse the Cloudflare Tunnel already serving LessonCue rather than creating a second one.",
                    "Open Cloudflare Zero Trust, then Networks → Tunnels, and choose that tunnel.",
                    $"On its Public Hostnames tab, the short domain points at the shortener on port {shortenerPort}, and the management address at the console on port {consolePort}.",
                    "Both are served over the tunnel, so neither port needs opening on the firewall.",
                    "Cloudflare creates the DNS records for you, provided the domain is in the same account.",
                    "Do not add a Redirect Rule for the short domain. A rule on the whole hostname would also catch the short links and the game codes underneath it.",
                ]);

        var steps = new List<string>
        {
            "Open Cloudflare Zero Trust, then Networks → Tunnels, and choose the tunnel already serving LessonCue.",
            "On its Public Hostnames tab, keep the entry pointing at LessonCue itself. It has to go on working.",
        };
        steps.AddRange(routes.Select(route =>
            $"Point {route.Hostname} at {route.Service}  ({route.Purpose})"));
        // A tunnel cannot hold two entries for one hostname, so an installation
        // upgrading from the version where LessonCue fronted the short domain
        // has to change that entry rather than add beside it.
        steps.Add($"If {settings.Domain} already has an entry from an earlier version sending it to LessonCue, "
            + "change that entry's service to the one above rather than adding a second. A hostname can only appear once.");
        steps.Add("Leave every unrelated entry exactly as it is.");
        steps.Add("Nothing needs opening on the firewall — the tunnel is the way in.");
        steps.Add($"Consider putting Cloudflare Access in front of {settings.AdminHost}. It is the console for every short link on the domain, and it is protected by an API key alone.");
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

        // Present with the wrong target is not the same as present. An earlier
        // version sent the short domain to LessonCue, and treating that entry
        // as satisfied would leave every short link broken.
        var stale = routes.Where(route => Mentions(existing, route.Hostname) && !PointsAt(existing, route.Hostname, route.Service)).ToList();
        if (stale.Count > 0)
            return (false, existing, "The cloudflared configuration already routes "
                + string.Join(" and ", stale.Select(route => route.Hostname))
                + " somewhere else. Change that entry to the service shown above; LessonCue will not rewrite an existing route.");

        var missing = routes.Where(route => !Mentions(existing, route.Hostname)).ToList();
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

    private static bool Mentions(string config, string hostname) =>
        config.Contains($"hostname: {hostname}", StringComparison.OrdinalIgnoreCase);

    /// <summary>Does this hostname's entry already point at the service we want?</summary>
    private static bool PointsAt(string config, string hostname, string service)
    {
        var lines = config.Replace("\r\n", "\n").Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (!lines[index].Contains($"hostname: {hostname}", StringComparison.OrdinalIgnoreCase)) continue;
            // The service belongs to the entry, so look at the lines that follow
            // until the next one begins.
            for (var next = index + 1; next < lines.Length && !lines[next].TrimStart().StartsWith("- ", StringComparison.Ordinal); next++)
                if (lines[next].Contains($"service: {service}", StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static IEnumerable<string> Hostnames(string config) => config
        .Replace("\r\n", "\n").Split('\n')
        .Select(line => line.Trim())
        .Where(line => line.StartsWith("- hostname:", StringComparison.Ordinal) || line.StartsWith("hostname:", StringComparison.Ordinal));

    private static string LastRule(string config) => config
        .Replace("\r\n", "\n").Split('\n')
        .LastOrDefault(line => line.Trim().StartsWith("- service:", StringComparison.Ordinal)) ?? "";
}
