using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class DisplayCapabilitiesTests
{
    [Fact]
    public void PublishesExplicitBrowserAndAndroidContracts()
    {
        var browser = DisplayCapabilities.For("web-player");
        var android = DisplayCapabilities.For("android-tv");

        Assert.Equal(DisplayCapabilities.ContractVersion, browser.ContractVersion);
        Assert.Equal("Browser display", browser.DisplayName);
        Assert.All(SignageLayout.ZoneTypes, zone =>
            Assert.True(browser.Capabilities.Single(value => value.Id == $"signage.{zone}").Supported));
        Assert.False(android.Capabilities.Single(value => value.Id == "signage.audience").Supported);
        Assert.True(android.Capabilities.Single(value => value.Id == "signage.weather").Supported);
        Assert.Contains(android.Limitations, value => value.Contains("Audience-result", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("browser", "web-player")]
    [InlineData("google-tv", "android-tv")]
    [InlineData("fire-tv", "android-tv")]
    [InlineData("mystery", "unknown")]
    public void NormalizesKnownClientFamilies(string input, string expected) =>
        Assert.Equal(expected, DisplayCapabilities.Normalize(input));

    [Fact]
    public void MissingLessonMediaGetsNavigableFallback()
    {
        var item = new PlaylistItem { Title = "Missing clip", Type = "video" };

        var decision = DisplayCapabilities.LessonDecision("android-tv", item);

        Assert.Equal("fallback", decision.Support);
        Assert.Contains("no media", decision.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AndroidAudienceSignageIsReportedBeforeAssignment()
    {
        var issues = DisplayCapabilities.AssessZones("android-tv",
        [
            new SignageZoneInput("poll", "audience", "Vote now")
        ]);

        var issue = Assert.Single(issues);
        Assert.Equal("unsupported-signage-element", issue.Code);
        Assert.Contains("browser-only", issue.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("title card", issue.Fallback, StringComparison.OrdinalIgnoreCase);
    }
}
