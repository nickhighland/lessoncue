using LessonCue.Server;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// The short domain's root, and the promise that it is only ever the root.
/// </summary>
public class ShortDomainTests
{
    private static ShortDomainSettings Configured(
        string domain = "go.example.org",
        string destination = "https://www.example.org",
        bool enabled = true,
        string fallback = "shortener",
        bool permanent = false,
        bool preserveQuery = true) =>
        new(domain, destination, enabled, fallback, permanent, preserveQuery, "http://shlink:8080");

    [Theory]
    [InlineData("go.example.org", true)]
    [InlineData("GO.EXAMPLE.ORG", true)]
    [InlineData("go.example.org:8443", true)]
    [InlineData("go.example.org.", true)]
    [InlineData("lesson.example.org", false)]
    [InlineData("other.org", false)]
    [InlineData("", false)]
    public void OnlyTheShortDomainIsClaimed(string host, bool expected) =>
        Assert.Equal(expected, ShortDomainService.Matches(Configured(), host));

    [Fact]
    public void AnUnconfiguredShortDomainClaimsNothing() =>
        Assert.False(ShortDomainService.Matches(ShortDomainSettings.Empty, "go.example.org"));

    [Theory]
    [InlineData("/", true)]
    [InlineData("", true)]
    [InlineData("/kids", false)]
    [InlineData("/Q7Z6", false)]
    [InlineData("/rest/v3/short-urls", false)]
    // A trailing slash is a path, not the root; the shortener owns it.
    [InlineData("/kids/", false)]
    public void OnlyTheExactRootBelongsToTheRedirect(string path, bool expected) =>
        Assert.Equal(expected, ShortDomainService.IsRoot(new PathString(path.Length == 0 ? null : path)));

    [Fact]
    public void TheQueryStringRidesAlongWhenAskedFor()
    {
        var settings = Configured();
        Assert.Equal("https://www.example.org?source=poster",
            ShortDomainService.RootDestination(settings, new QueryString("?source=poster")));
        Assert.Equal("https://www.example.org",
            ShortDomainService.RootDestination(settings, QueryString.Empty));
    }

    [Fact]
    public void TheQueryStringCanBeLeftBehind() =>
        Assert.Equal("https://www.example.org",
            ShortDomainService.RootDestination(Configured(preserveQuery: false), new QueryString("?source=poster")));

    [Fact]
    public void AQueryOnTheDestinationIsKeptAndMergedInto() =>
        Assert.Equal("https://www.example.org/welcome?utm=print&source=poster",
            ShortDomainService.RootDestination(
                Configured(destination: "https://www.example.org/welcome?utm=print"),
                new QueryString("?source=poster")));

    [Fact]
    public void AFragmentStaysAtTheEndWhereItBelongs() =>
        Assert.Equal("https://www.example.org/?source=poster#kids",
            ShortDomainService.RootDestination(
                Configured(destination: "https://www.example.org/#kids"),
                new QueryString("?source=poster")));

    [Fact]
    public void ThreeHundredAndTwoUnlessTheAdministratorSaidOtherwise()
    {
        Assert.Equal(302, Configured().RedirectStatusCode);
        Assert.Equal(301, Configured(permanent: true).RedirectStatusCode);
    }

    [Theory]
    [InlineData("shortener", ShortDomainRootAction.Shortener)]
    [InlineData("lessoncue", ShortDomainRootAction.LessonCue)]
    [InlineData("notfound", ShortDomainRootAction.NotFound)]
    public void SwitchingTheRedirectOffFallsBackToTheChosenBehaviour(string fallback, ShortDomainRootAction expected) =>
        Assert.Equal(expected, Configured(enabled: false, fallback: fallback).RootAction);

    [Fact]
    public void ADestinationWithTheRedirectOffIsStillNotARedirect() =>
        Assert.Equal(ShortDomainRootAction.Shortener, Configured(enabled: false).RootAction);

    [Fact]
    public void AnEnabledRedirectWithNowhereToGoFallsBackRatherThanBreaking() =>
        Assert.Equal(ShortDomainRootAction.Shortener, Configured(destination: "").RootAction);

    // ------------------------------------------------------------ validation

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,<script>")]
    [InlineData("file:///etc/passwd")]
    [InlineData("ftp://example.org")]
    public void UnsafeSchemesAreRefused(string destination) =>
        Assert.Throws<ArgumentException>(() => ShortDomainService.NormalizeRootRedirect(destination, "go.example.org"));

    [Fact]
    public void ADestinationOnTheShortDomainItselfIsALoopAndIsRefused()
    {
        var error = Assert.Throws<ArgumentException>(
            () => ShortDomainService.NormalizeRootRedirect("https://go.example.org", "go.example.org"));
        Assert.Contains("back to itself", error.Message);
    }

    [Fact]
    public void TheLoopCheckIgnoresCaseAndPath() =>
        Assert.Throws<ArgumentException>(
            () => ShortDomainService.NormalizeRootRedirect("https://GO.example.org/welcome", "go.example.org"));

    [Fact]
    public void ASubdomainOfTheShortDomainIsNotItselfALoop() =>
        Assert.Equal("https://www.go.example.org/",
            ShortDomainService.NormalizeRootRedirect("https://www.go.example.org", "go.example.org"));

    [Fact]
    public void ABareDestinationIsAssumedToBeHttps() =>
        Assert.StartsWith("https://www.example.org", ShortDomainService.NormalizeRootRedirect("www.example.org", "go.example.org"));

    [Fact]
    public void PlainHttpIsAllowedButCalledOut()
    {
        var settings = Configured(destination: "http://www.example.org/");
        Assert.Contains(ShortDomainService.Warnings(settings), warning => warning.Contains("not encrypted"));
    }

    [Fact]
    public void APermanentRedirectIsCalledOutBecauseItIsHardToTakeBack() =>
        Assert.Contains(ShortDomainService.Warnings(Configured(permanent: true)), warning => warning.Contains("cached hard"));

    [Fact]
    public void AQuietDefaultConfigurationHasNothingToWarnAbout() =>
        Assert.Empty(ShortDomainService.Warnings(Configured()));

    [Theory]
    [InlineData("go.example.org", "go.example.org")]
    [InlineData("https://go.example.org", "go.example.org")]
    [InlineData("  GO.Example.ORG. ", "go.example.org")]
    public void TheDomainIsAcceptedHoweverItIsTyped(string typed, string expected) =>
        Assert.Equal(expected, ShortDomainService.NormalizeDomain(typed));

    [Theory]
    [InlineData("https://go.example.org/kids")]
    [InlineData("localhost")]
    [InlineData("10.0.0.4")]
    public void ADomainThatIsNotAPublicNameIsRefused(string typed) =>
        Assert.Throws<ArgumentException>(() => ShortDomainService.NormalizeDomain(typed));

    [Fact]
    public void AnEmptyDomainSwitchesTheWholeFeatureOff() =>
        Assert.Equal("", ShortDomainService.NormalizeDomain("  "));

    [Theory]
    [InlineData("shlink:8080", "http://shlink:8080")]
    [InlineData("http://shlink:8080/", "http://shlink:8080")]
    [InlineData("https://shlink.internal", "https://shlink.internal")]
    public void TheUpstreamIsReducedToSomethingToDialUp(string typed, string expected) =>
        Assert.Equal(expected, ShortDomainService.NormalizeUpstream(typed));

    [Fact]
    public void AnUnknownFallbackBecomesTheSafeOne() =>
        Assert.Equal("shortener", ShortDomainService.NormalizeFallback("something-else"));

    // ------------------------------------------------------------- routing

    [Theory]
    [InlineData("/kids")]
    [InlineData("/Q7Z6")]
    [InlineData("/rest/v3/short-urls")]
    [InlineData("/kids/")]
    [InlineData("/robots.txt")]
    public void NoRootSettingCanEverSwallowANonRootPath(string path)
    {
        // The one guarantee the whole feature rests on: whatever the root is
        // told to do, a short link and a reserved game code still get there.
        foreach (var settings in new[]
        {
            Configured(),
            Configured(permanent: true),
            Configured(enabled: false, fallback: "lessoncue"),
            Configured(enabled: false, fallback: "notfound"),
            Configured(enabled: false, fallback: "shortener"),
        })
        {
            Assert.Equal(ShortDomainService.Disposition.Forward,
                ShortDomainService.Decide(settings, "go.example.org", new PathString(path)));
        }
    }

    [Fact]
    public void TheRootDoesWhatItWasConfiguredToDo()
    {
        var root = new PathString("/");
        Assert.Equal(ShortDomainService.Disposition.Redirect,
            ShortDomainService.Decide(Configured(), "go.example.org", root));
        Assert.Equal(ShortDomainService.Disposition.PassThrough,
            ShortDomainService.Decide(Configured(enabled: false, fallback: "lessoncue"), "go.example.org", root));
        Assert.Equal(ShortDomainService.Disposition.NotFound,
            ShortDomainService.Decide(Configured(enabled: false, fallback: "notfound"), "go.example.org", root));
        Assert.Equal(ShortDomainService.Disposition.Forward,
            ShortDomainService.Decide(Configured(enabled: false, fallback: "shortener"), "go.example.org", root));
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/kids")]
    [InlineData("/settings")]
    public void LessonCuesOwnAddressIsNeverTouched(string path) =>
        Assert.Equal(ShortDomainService.Disposition.PassThrough,
            ShortDomainService.Decide(Configured(), "lesson.example.org", new PathString(path)));

    [Theory]
    [InlineData("/")]
    [InlineData("/kids")]
    public void WithNoShortDomainConfiguredNothingIsIntercepted(string path) =>
        Assert.Equal(ShortDomainService.Disposition.PassThrough,
            ShortDomainService.Decide(ShortDomainSettings.Empty, "go.example.org", new PathString(path)));
}
