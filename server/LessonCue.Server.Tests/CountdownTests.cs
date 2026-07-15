using LessonCue.Server;

namespace LessonCue.Server.Tests;

public sealed class CountdownTests
{
    [Fact]
    public void StartsExactlyOneDurationBeforeDesignatedTime()
    {
        var designated = new DateTimeOffset(2026, 7, 19, 9, 0, 0, TimeSpan.FromHours(-4));
        var actual = ManifestService.CountdownStart(designated, 300_000);
        Assert.Equal(new DateTimeOffset(2026, 7, 19, 8, 55, 0, TimeSpan.FromHours(-4)), actual);
    }

    [Fact]
    public void MissingScheduleHasNoCountdownStart()
    {
        Assert.Null(ManifestService.CountdownStart(null, 300_000));
        Assert.Null(ManifestService.CountdownStart(DateTimeOffset.UtcNow, null));
    }
}
