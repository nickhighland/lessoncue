using LessonCue.Server.Activities;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ActivityIdentityTests
{
    [Fact]
    public void UnknownAvatarsAndColoursFallBackToTheAllowedSet()
    {
        // Players supply these from a phone, so anything not on the list is
        // replaced rather than stored and shown to the whole room.
        Assert.Equal(ActivityIdentity.DefaultAvatar, ActivityIdentity.NormalizeAvatar("<script>alert(1)</script>"));
        Assert.Equal(ActivityIdentity.DefaultAvatar, ActivityIdentity.NormalizeAvatar(null));
        Assert.Equal(ActivityIdentity.DefaultAvatar, ActivityIdentity.NormalizeAvatar("   "));
        Assert.Equal(ActivityIdentity.DefaultColor, ActivityIdentity.NormalizeColor("red; background:url(x)"));
        Assert.Equal(ActivityIdentity.DefaultColor, ActivityIdentity.NormalizeColor("#not-a-colour"));
    }

    [Fact]
    public void AllowedValuesAreKeptAndColoursAreCaseInsensitive()
    {
        Assert.Equal(ActivityIdentity.Avatars[3], ActivityIdentity.NormalizeAvatar(ActivityIdentity.Avatars[3]));
        Assert.Equal("#4ecdc4", ActivityIdentity.NormalizeColor("  #4ECDC4 "));
    }

    [Fact]
    public void DefaultIdentitiesSpreadAcrossJoinOrder()
    {
        var first = ActivityIdentity.ForIndex(0);
        var second = ActivityIdentity.ForIndex(1);
        Assert.NotEqual(first.Avatar, second.Avatar);
        Assert.NotEqual(first.Color, second.Color);

        // Wraps rather than throwing once the room is larger than the palette.
        var wrapped = ActivityIdentity.ForIndex(ActivityIdentity.Avatars.Length);
        Assert.Equal(first.Avatar, wrapped.Avatar);
        Assert.Equal(ActivityIdentity.Avatars[0], ActivityIdentity.ForIndex(-5).Avatar);
    }

    [Fact]
    public void EveryPaletteEntryIsDistinct()
    {
        Assert.Equal(ActivityIdentity.Avatars.Length, ActivityIdentity.Avatars.Distinct().Count());
        Assert.Equal(ActivityIdentity.Colors.Length, ActivityIdentity.Colors.Distinct().Count());
        Assert.Contains(ActivityIdentity.DefaultAvatar, ActivityIdentity.Avatars);
        Assert.Contains(ActivityIdentity.DefaultColor, ActivityIdentity.Colors);
    }
}
