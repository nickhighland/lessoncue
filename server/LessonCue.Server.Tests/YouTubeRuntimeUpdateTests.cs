using System.Runtime.InteropServices;
using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class YouTubeRuntimeUpdateTests
{
    [Fact]
    public void UpdateNoticeStaysSilentUntilAnImportFails()
    {
        Assert.False(YouTubeRuntimeUpdateService.ShouldShowNotice(updateAvailable: true, consecutiveFailures: 0));
        Assert.True(YouTubeRuntimeUpdateService.ShouldShowNotice(updateAvailable: true, consecutiveFailures: 1));
        Assert.False(YouTubeRuntimeUpdateService.ShouldShowNotice(updateAvailable: false, consecutiveFailures: 4));
    }

    [Fact]
    public void OfficialLinuxAssetMatchesTheServerArchitecture()
    {
        var expected = RuntimeInformation.ProcessArchitecture switch
        {
            Architecture.X64 => "yt-dlp_linux",
            Architecture.Arm64 => "yt-dlp_linux_aarch64",
            _ => null
        };
        Assert.Equal(expected, YouTubeRuntimeUpdateService.ExpectedAssetName(RuntimeInformation.ProcessArchitecture));
    }

    [Theory]
    [InlineData("2026.08.19", true)]
    [InlineData("v2026.08.19", false)]
    [InlineData("latest", false)]
    [InlineData("", false)]
    public void StableVersionsAreValidated(string candidate, bool expected)
    {
        Assert.Equal(expected, YouTubeRuntime.IsValidVersion(candidate));
    }

    [Fact]
    public void NewerDateVersionIsDetectedWithoutTreatingAnEqualVersionAsNew()
    {
        Assert.True(YouTubeRuntime.IsNewer("2026.09.01", "2026.08.19"));
        Assert.False(YouTubeRuntime.IsNewer("2026.08.19", "2026.08.19"));
        Assert.False(YouTubeRuntime.IsNewer("2026.08.19", null));
    }
}
