using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class UpdateServiceTests
{
    [Theory]
    [InlineData("0.4.0", "0.3.1", true)]
    [InlineData("0.3.1", "0.3.1", false)]
    [InlineData("0.3.0", "0.3.1", false)]
    [InlineData("not-a-version", "0.3.1", false)]
    public void ComparesReleaseVersions(string latest, string current, bool expected) =>
        Assert.Equal(expected, UpdateService.IsNewer(latest, current));

    [Theory]
    [InlineData("0.40.18", "update:v0.40.18:2026-08-03T12:34:56.0000000+00:00")]
    [InlineData("v0.40.18", "update:v0.40.18:2026-08-03T12:34:56.0000000+00:00")]
    [InlineData(null, "update:2026-08-03T12:34:56.0000000+00:00")]
    [InlineData("invalid", "update:2026-08-03T12:34:56.0000000+00:00")]
    public void BuildsPinnedUpdateRequestsWhenAReleaseVersionIsKnown(string? version, string expected)
    {
        var requestedAt = new DateTimeOffset(2026, 8, 3, 12, 34, 56, TimeSpan.Zero);

        Assert.Equal(expected, UpdateService.BuildUpdateRequest(version, requestedAt));
    }
}
