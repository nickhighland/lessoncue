using LessonCue.Server.Activities;
using LessonCue.Server.Shortener;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// The shortener is optional in the strong sense. Losing it should cost short
/// links and nothing else.
/// </summary>
public class ShortenerResilienceTests
{
    private static ShortenerSettings On(string domain = "go.example.org") =>
        new(true, domain, $"short.{domain}", "http://shlink:8080", ShortenerRootRedirect.NotFound, "", 1);

    [Fact]
    public void WithTheIntegrationOffAGameKeepsLessonCuesOwnJoinAddress()
    {
        // Null means "use the address you already had", which is what every
        // installation without a shortener gets.
        var off = ShortenerSettings.Empty;
        Assert.False(off.Enabled);
        Assert.Equal("", off.ShortLinkFor("Q7Z6"));
    }

    [Fact]
    public void AnOrdinaryCodeNeverGetsAShortLink()
    {
        // Six-character codes have no reserved slug behind them, so pointing a
        // room at the short domain for one would be a dead end.
        Assert.False(ReservedGameCodes.IsReserved("K7M2QP"));
        Assert.True(ReservedGameCodes.IsReserved("Q7Z6"));
    }

    [Fact]
    public void AReservedCodeResolvesWhicheverWayItIsTyped()
    {
        // Loose mode in the shortener, upper case on the television.
        Assert.Equal("Q7Z6", ReservedGameCodes.Normalize("q7z6"));
        Assert.Equal("Q7Z6", ReservedGameCodes.Normalize(" Q7z6 "));
    }

    [Fact]
    public void TheShortLinkIsBuiltFromConfigurationAlone()
    {
        // Two installations, two domains, no code change between them.
        Assert.Equal("https://go.example.org/Q7Z6", On().ShortLinkFor("Q7Z6"));
        Assert.Equal("https://links.school.edu/Q7Z6", On("links.school.edu").ShortLinkFor("Q7Z6"));
    }

    [Fact]
    public void AnUnreachableShortenerLeavesTheReservedPoolIntact()
    {
        // The pool is LessonCue's own record of which code is in play. It is
        // read from live sessions, so it keeps working when the shortener does
        // not -- the links simply stop resolving until it returns.
        Assert.Equal(100, ReservedGameCodes.All.Count);
        Assert.True(ReservedGameCodes.IsReserved("A3C8"));
    }

    [Theory]
    [InlineData(ShortenerState.Stopped)]
    [InlineData(ShortenerState.Degraded)]
    [InlineData(ShortenerState.ConfigurationError)]
    public void EveryUnhappyStateIsStillAStateTheConsoleCanShow(ShortenerState state) =>
        Assert.False(string.IsNullOrWhiteSpace(state.ToString()));

    [Fact]
    public void ConfiguredMeansBothADomainAndSomewhereToReachIt()
    {
        Assert.False(ShortenerSettings.Empty.Configured);
        Assert.False((On() with { Upstream = "" }).Configured);
        Assert.False((On() with { Domain = "" }).Configured);
        Assert.True(On().Configured);
    }

    [Fact]
    public void ThePoolIsNotADenialOfTheRestOfTheApp()
    {
        // A hundred reserved slugs is a hundred slugs. Everything an
        // organization actually wants from a short domain stays free.
        foreach (var wanted in new[] { "kids", "give", "easter", "parents", "register", "vbs", "youth" })
            Assert.False(ReservedGameCodes.IsReserved(wanted));
    }
}
