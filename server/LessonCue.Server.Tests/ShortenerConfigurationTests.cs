using LessonCue.Server.Shortener;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// The configuration has to serve any installation's domain, so these tests
/// deliberately use several unrelated ones.
/// </summary>
public class ShortenerConfigurationTests
{
    [Theory]
    [InlineData("go.example.org", "go.example.org")]
    [InlineData("https://go.example.org", "go.example.org")]
    [InlineData("https://go.example.org/", "go.example.org")]
    [InlineData("  GO.Example.ORG. ", "go.example.org")]
    [InlineData("links.school.edu", "links.school.edu")]
    [InlineData("a.co", "a.co")]
    public void ADomainIsAcceptedHoweverItIsTyped(string typed, string expected) =>
        Assert.Equal(expected, ShortenerConfiguration.NormalizeHost(typed));

    [Theory]
    [InlineData("https://go.example.org/kids")]
    [InlineData("go.example.org/kids")]
    [InlineData("localhost")]
    [InlineData("10.0.0.4")]
    [InlineData("javascript:alert(1)")]
    [InlineData("go example org")]
    [InlineData("https://go.example.org#kids")]
    public void ADomainThatIsNotAPublicNameIsRefused(string typed) =>
        Assert.Throws<ArgumentException>(() => ShortenerConfiguration.NormalizeHost(typed));

    [Fact]
    public void AnEmptyDomainLeavesTheIntegrationOff() =>
        Assert.Equal("", ShortenerConfiguration.NormalizeHost("  "));

    [Theory]
    [InlineData("go.example.org", "short.go.example.org")]
    [InlineData("chroc.cc", "short.chroc.cc")]
    [InlineData("links.school.edu", "short.links.school.edu")]
    [InlineData("", "")]
    public void TheManagementHostIsDerivedFromWhicheverDomainWasGiven(string domain, string expected) =>
        Assert.Equal(expected, ShortenerConfiguration.DefaultAdminHost(domain));

    [Fact]
    public void TheDerivedManagementHostIsOnlyADefault() =>
        Assert.Equal("admin.elsewhere.net",
            ShortenerConfiguration.NormalizeAdminHost("admin.elsewhere.net", "go.example.org"));

    [Fact]
    public void LeavingTheManagementHostBlankTakesTheDefault() =>
        Assert.Equal("short.go.example.org", ShortenerConfiguration.NormalizeAdminHost("", "go.example.org"));

    [Fact]
    public void TheManagementHostCannotBeTheShortDomainItself()
    {
        // One serves the links, the other serves the console. A single
        // hostname cannot do both.
        var error = Assert.Throws<ArgumentException>(
            () => ShortenerConfiguration.NormalizeAdminHost("go.example.org", "go.example.org"));
        Assert.Contains("differ from the short domain", error.Message);
    }

    [Theory]
    [InlineData("shlink:8080", "http://shlink:8080")]
    [InlineData("http://shlink:8080/", "http://shlink:8080")]
    [InlineData("https://shortener.internal", "https://shortener.internal")]
    public void TheUpstreamIsReducedToSomethingToDialUp(string typed, string expected) =>
        Assert.Equal(expected, ShortenerConfiguration.NormalizeUpstream(typed));

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,<script>")]
    [InlineData("file:///etc/passwd")]
    [InlineData("ftp://example.org")]
    public void UnsafeRedirectSchemesAreRefused(string destination) =>
        Assert.Throws<ArgumentException>(() => ShortenerConfiguration.NormalizeRedirect(destination, "go.example.org"));

    [Fact]
    public void ARedirectBackToTheShortDomainIsALoopAndIsRefused() =>
        Assert.Contains("back to itself", Assert.Throws<ArgumentException>(
            () => ShortenerConfiguration.NormalizeRedirect("https://go.example.org", "go.example.org")).Message);

    [Fact]
    public void ASubdomainOfTheShortDomainIsNotALoop() =>
        Assert.Equal("https://www.go.example.org/",
            ShortenerConfiguration.NormalizeRedirect("https://www.go.example.org", "go.example.org"));

    [Fact]
    public void ABareRedirectIsAssumedToBeHttps() =>
        Assert.StartsWith("https://www.example.org",
            ShortenerConfiguration.NormalizeRedirect("www.example.org", "go.example.org"));

    // ------------------------------------------------------- root behaviour

    private static ShortenerSettings With(ShortenerRootRedirect mode, string url = "") =>
        new(true, "go.example.org", "short.go.example.org", "http://shlink:8080", mode, url, 1);

    [Fact]
    public void TheRootCanBeSentToLessonCue() =>
        Assert.Equal("https://lessoncue.example.org",
            ShortenerConfiguration.ResolveRootRedirect(With(ShortenerRootRedirect.LessonCue), "https://lessoncue.example.org"));

    [Fact]
    public void TheRootCanBeSentToTheOrganizationSite() =>
        Assert.Equal("https://www.example.org/",
            ShortenerConfiguration.ResolveRootRedirect(
                With(ShortenerRootRedirect.Organization, "https://www.example.org/"), "https://lessoncue.example.org"));

    [Fact]
    public void TheRootCanBeLeftToTheShortener() =>
        Assert.Equal("", ShortenerConfiguration.ResolveRootRedirect(With(ShortenerRootRedirect.NotFound), "https://lessoncue.example.org"));

    [Theory]
    [InlineData("lessoncue", ShortenerRootRedirect.LessonCue)]
    [InlineData("organization", ShortenerRootRedirect.Organization)]
    [InlineData("custom", ShortenerRootRedirect.Custom)]
    [InlineData("notfound", ShortenerRootRedirect.NotFound)]
    [InlineData("something-else", ShortenerRootRedirect.NotFound)]
    [InlineData(null, ShortenerRootRedirect.NotFound)]
    public void RootModesRoundTripAndUnknownOnesFallBackSafely(string? stored, ShortenerRootRedirect expected)
    {
        var parsed = ShortenerConfiguration.ParseRootRedirect(stored);
        Assert.Equal(expected, parsed);
        Assert.Equal(parsed, ShortenerConfiguration.ParseRootRedirect(ShortenerConfiguration.RootRedirectName(parsed)));
    }

    // ------------------------------------------------------------- addresses

    [Theory]
    [InlineData("go.example.org", "Q7Z6", "https://go.example.org/Q7Z6")]
    [InlineData("chroc.cc", "A3C8", "https://chroc.cc/A3C8")]
    [InlineData("links.school.edu", "M4S9", "https://links.school.edu/M4S9")]
    public void AShortLinkIsBuiltFromWhicheverDomainIsConfigured(string domain, string code, string expected) =>
        Assert.Equal(expected, With(ShortenerRootRedirect.NotFound) with { Domain = domain } is var s ? s.ShortLinkFor(code) : "");

    [Fact]
    public void ShortLinksAndTheConsoleLiveOnDifferentHosts()
    {
        var settings = With(ShortenerRootRedirect.NotFound);
        Assert.Equal("https://go.example.org", settings.PublicUrl);
        Assert.Equal("https://short.go.example.org", settings.AdminUrl);
        // Public links must never be moved onto the management host.
        Assert.StartsWith(settings.PublicUrl + "/", settings.ShortLinkFor("Q7Z6"));
    }

    // ------------------------------------------------------- where it lives

    [Fact]
    public void InsideTheComposeNetworkTheShortenerIsAnotherContainer() =>
        // Service name and the port it listens on inside itself, which is not
        // the port the stack publishes.
        Assert.Equal("http://shlink:8080", ShortenerConfiguration.SuggestUpstream(true, 8081));

    [Fact]
    public void InstalledNativelyItIsReachedOnThePublishedPort() =>
        Assert.Equal("http://127.0.0.1:8081", ShortenerConfiguration.SuggestUpstream(false, 8081));

    [Fact]
    public void ACustomPublishedPortIsRespected() =>
        Assert.Equal("http://127.0.0.1:9091", ShortenerConfiguration.SuggestUpstream(false, 9091));

    [Fact]
    public void TheSuggestionIsSomethingTheValidatorAccepts()
    {
        // A suggestion that would be rejected on save is worse than none.
        foreach (var suggested in new[]
        {
            ShortenerConfiguration.SuggestUpstream(true, 8081),
            ShortenerConfiguration.SuggestUpstream(false, 8081),
        })
            Assert.Equal(suggested, ShortenerConfiguration.NormalizeUpstream(suggested));
    }
}
