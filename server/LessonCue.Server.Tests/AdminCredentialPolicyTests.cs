using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AdminCredentialPolicyTests
{
    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("ab")]
    public void RejectsShortOrBlankUsernames(string username) =>
        Assert.NotNull(AdminCredentialPolicy.ValidateUsername(username));

    [Fact]
    public void RejectsUsernamesLongerThanEightyCharacters() =>
        Assert.NotNull(AdminCredentialPolicy.ValidateUsername(new string('a', 81)));

    [Theory]
    [InlineData("owner")]
    [InlineData(" lesson-admin ")]
    [InlineData("teacher@example")]
    public void AcceptsUsableUsernames(string username) =>
        Assert.Null(AdminCredentialPolicy.ValidateUsername(username));
}
