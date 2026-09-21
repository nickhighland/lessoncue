using LessonCue.Server.Activities;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class OffensiveNameFilterTests
{
    [Theory]
    [InlineData("f.u.c.k")]
    [InlineData("sh1t")]
    [InlineData("son of a bitch")]
    public void RejectsProfanityVariants(string value)
    {
        Assert.False(OffensiveNameFilter.IsAllowed(value));
    }

    [Theory]
    [InlineData("Class Captain")]
    [InlineData("Sasha")]
    [InlineData("Café Notes")]
    public void AllowsOrdinaryNamesAndWords(string value)
    {
        Assert.True(OffensiveNameFilter.IsAllowed(value));
    }
}
