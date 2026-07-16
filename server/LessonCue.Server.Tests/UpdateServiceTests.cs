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
}
