using System.Text.Json;
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

    [Theory]
    [InlineData("pending")]
    [InlineData("converting")]
    [InlineData("failed")]
    public void OriginalUploadRemainsRenderableWhileCompatibilityCopyIsUnavailable(string compatibilityStatus)
    {
        var media = new MediaAsset
        {
            FileName = "original.mp4",
            RelativePath = "original.mp4",
            ContentType = "video/mp4",
            ProcessingStatus = "ready",
            CompatibilityStatus = compatibilityStatus
        };
        var item = new PlaylistItem { Title = "Immediate clip", Type = "video", MediaAsset = media };

        var decision = DisplayCapabilities.LessonDecision("android-tv", item);

        Assert.Equal("supported", decision.Support);
        if (compatibilityStatus == "failed")
            Assert.Contains("original", decision.Message, StringComparison.OrdinalIgnoreCase);
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

    [Theory]
    [InlineData("android-tv")]
    [InlineData("browser")]
    public void CommittedCapabilityFixturesMatchThePublishedContracts(string fixtureName)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "display-capabilities", $"{fixtureName}.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var platform = root.GetProperty("platform").GetString();
        var contract = DisplayCapabilities.For(platform);
        var capabilities = contract.Capabilities.ToDictionary(value => value.Id);

        Assert.Equal(DisplayCapabilities.ContractVersion, root.GetProperty("contractVersion").GetInt32());
        foreach (var expected in root.GetProperty("expected").EnumerateObject())
            Assert.Equal(expected.Value.GetBoolean(), capabilities[expected.Name].Supported);
        if (root.TryGetProperty("requiredFallback", out var fallback))
            Assert.False(capabilities[fallback.GetString()!].Supported);
    }
}
