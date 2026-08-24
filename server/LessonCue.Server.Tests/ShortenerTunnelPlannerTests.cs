using LessonCue.Server.Shortener;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// Tunnel routing. The overriding requirement is that LessonCue's own route
/// survives whatever we do here.
/// </summary>
public class ShortenerTunnelPlannerTests
{
    private static ShortenerSettings Settings(string domain = "go.example.org", string admin = "short.go.example.org") =>
        new(true, domain, admin, "http://shlink:8080", ShortenerRootRedirect.NotFound, "", 1);

    private const string ExistingConfig = """
        tunnel: 7f0e0c1a-lessoncue
        credentials-file: /etc/cloudflared/creds.json

        ingress:
          - hostname: lessoncue.example.org
            service: http://localhost:80
          - service: http_status:404
        """;

    [Fact]
    public void TheShortDomainAndTheConsoleGetSeparateRoutes()
    {
        var routes = ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082);
        Assert.Equal(2, routes.Count);
        Assert.Equal("go.example.org", routes[0].Hostname);
        Assert.Equal("http://localhost:8081", routes[0].Service);
        Assert.Equal("short.go.example.org", routes[1].Hostname);
        Assert.Equal("http://localhost:8082", routes[1].Service);
    }

    [Theory]
    [InlineData("chroc.cc", "short.chroc.cc")]
    [InlineData("go.example.org", "short.go.example.org")]
    [InlineData("links.school.edu", "admin.school.edu")]
    public void RoutesAreBuiltFromWhicheverHostnamesWereConfigured(string domain, string admin)
    {
        var routes = ShortenerTunnelPlanner.RoutesFor(Settings(domain, admin), 8081, 8082);
        Assert.Equal(domain, routes[0].Hostname);
        Assert.Equal(admin, routes[1].Hostname);
    }

    [Fact]
    public void AnUnconfiguredShortenerNeedsNoRoutes() =>
        Assert.Empty(ShortenerTunnelPlanner.RoutesFor(ShortenerSettings.Empty, 8081, 8082));

    [Fact]
    public void AManagedTunnelGetsInstructionsRatherThanASilentFailure()
    {
        var plan = ShortenerTunnelPlanner.ForManagedTunnel(Settings(), 8081, 8082);
        Assert.False(plan.CanApplyAutomatically);
        Assert.Contains(plan.Instructions, step => step.Contains("go.example.org at http://localhost:8081"));
        Assert.Contains(plan.Instructions, step => step.Contains("short.go.example.org at http://localhost:8082"));
        // The warning that matters: a hostname-wide rule eats the short links.
        Assert.Contains(plan.Instructions, step => step.Contains("Redirect Rule"));
        Assert.Contains(plan.Instructions, step => step.Contains("unrelated entry exactly as it is"));
        // And the upgrade case: a hostname can only appear once in a tunnel.
        Assert.Contains(plan.Instructions, step => step.Contains("earlier version") && step.Contains("only appear once"));
    }

    [Fact]
    public void MergingAddsTheRoutesAndKeepsLessonCuesOwn()
    {
        var (changed, merged, refusal) = ShortenerTunnelPlanner.MergeIngress(
            ExistingConfig, ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082));

        Assert.True(changed);
        Assert.Null(refusal);
        Assert.Contains("hostname: lessoncue.example.org", merged);
        Assert.Contains("hostname: go.example.org", merged);
        Assert.Contains("hostname: short.go.example.org", merged);
        Assert.True(ShortenerTunnelPlanner.PreservesExisting(ExistingConfig, merged));
    }

    [Fact]
    public void TheCatchAllStaysLast()
    {
        var (_, merged, _) = ShortenerTunnelPlanner.MergeIngress(
            ExistingConfig, ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082));

        var lines = merged.Split('\n').Select(line => line.Trim()).Where(line => line.Length > 0).ToList();
        Assert.StartsWith("- service:", lines.Last());
        Assert.DoesNotContain("hostname:", lines.Last());
    }

    [Fact]
    public void UnrelatedRoutesAreLeftExactlyWhereTheyWere()
    {
        var busy = """
            ingress:
              - hostname: lessoncue.example.org
                service: http://localhost:80
              - hostname: files.example.org
                service: http://localhost:9000
              - hostname: camera.example.org
                service: rtsp://localhost:8554
              - service: http_status:404
            """;

        var (_, merged, _) = ShortenerTunnelPlanner.MergeIngress(busy, ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082));
        foreach (var host in new[] { "lessoncue.example.org", "files.example.org", "camera.example.org" })
            Assert.Contains($"hostname: {host}", merged);
        Assert.Contains("rtsp://localhost:8554", merged);
        Assert.True(ShortenerTunnelPlanner.PreservesExisting(busy, merged));
    }

    [Fact]
    public void RunningTheMergeTwiceChangesNothingTheSecondTime()
    {
        var routes = ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082);
        var (_, once, _) = ShortenerTunnelPlanner.MergeIngress(ExistingConfig, routes);
        var (changedAgain, twice, refusal) = ShortenerTunnelPlanner.MergeIngress(once, routes);

        Assert.False(changedAgain);
        Assert.Null(refusal);
        Assert.Equal(once, twice);
    }

    [Fact]
    public void AConfigurationWithNoIngressIsLeftAlone()
    {
        var (changed, config, refusal) = ShortenerTunnelPlanner.MergeIngress(
            "tunnel: something\ncredentials-file: /etc/cloudflared/creds.json\n",
            ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082));

        Assert.False(changed);
        Assert.NotNull(refusal);
        Assert.Contains("no ingress list", refusal);
        Assert.DoesNotContain("go.example.org", config);
    }

    [Fact]
    public void AConfigurationWithNoCatchAllIsLeftAlone()
    {
        // Rather than append one and change how the tunnel answers everything
        // else, refuse and let a person look at it.
        var (changed, _, refusal) = ShortenerTunnelPlanner.MergeIngress(
            "ingress:\n  - hostname: lessoncue.example.org\n    service: http://localhost:80\n",
            ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082));

        Assert.False(changed);
        Assert.Contains("no catch-all", refusal);
    }

    [Fact]
    public void ADroppedHostnameWouldBeCaught()
    {
        // Proving the guard works, not the merge: a "merge" that lost
        // LessonCue's own route must not pass inspection.
        var mangled = "ingress:\n  - hostname: go.example.org\n    service: http://localhost:8081\n  - service: http_status:404\n";
        Assert.False(ShortenerTunnelPlanner.PreservesExisting(ExistingConfig, mangled));
    }

    [Fact]
    public void AnEntryLeftOverFromTheVersionThatFrontedTheShortDomainIsRefused()
    {
        // 0.41.0 sent the short domain to LessonCue. That entry has to be
        // changed, not added beside -- a tunnel holds one entry per hostname --
        // and silently treating it as satisfied would leave every link broken.
        var legacy = """
            ingress:
              - hostname: lessoncue.example.org
                service: http://localhost:80
              - hostname: go.example.org
                service: http://localhost:80
              - service: http_status:404
            """;

        var (changed, config, refusal) = ShortenerTunnelPlanner.MergeIngress(
            legacy, ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082));

        Assert.False(changed);
        Assert.Equal(legacy, config);
        Assert.Contains("go.example.org", refusal);
        Assert.Contains("somewhere else", refusal);
    }

    [Fact]
    public void AnEntryAlreadyPointingAtTheRightServiceIsLeftAlone()
    {
        var current = """
            ingress:
              - hostname: lessoncue.example.org
                service: http://localhost:80
              - hostname: go.example.org
                service: http://localhost:8081
              - hostname: short.go.example.org
                service: http://localhost:8082
              - service: http_status:404
            """;

        var (changed, _, refusal) = ShortenerTunnelPlanner.MergeIngress(
            current, ShortenerTunnelPlanner.RoutesFor(Settings(), 8081, 8082));

        Assert.False(changed);
        Assert.Null(refusal);
    }
}
