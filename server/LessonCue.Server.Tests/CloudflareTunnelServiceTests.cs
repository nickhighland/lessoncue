using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class CloudflareTunnelServiceTests
{
    [Theory]
    [InlineData("lesson.example.org", "lesson.example.org")]
    [InlineData(" HTTPS://LESSON.EXAMPLE.ORG ", "lesson.example.org")]
    [InlineData("room-2.school.example", "room-2.school.example")]
    public void NormalizesPublicHostnames(string value, string expected) =>
        Assert.Equal(expected, CloudflareTunnelService.NormalizePublicHostname(value));

    [Theory]
    [InlineData("")]
    [InlineData("lessoncue.local")]
    [InlineData("localhost")]
    [InlineData("192.168.1.10")]
    [InlineData("http://lesson.example.org")]
    [InlineData("https://lesson.example.org/path")]
    [InlineData("bad_name.example.org")]
    public void RejectsInvalidPublicHostnames(string value) =>
        Assert.Throws<ArgumentException>(() => CloudflareTunnelService.NormalizePublicHostname(value));

    [Fact]
    public void AcceptsTokenOrCompleteInstallCommand()
    {
        var token = "eyJ" + new string('a', 77);
        Assert.Equal(token, CloudflareTunnelService.NormalizeToken(token));
        Assert.Equal(token, CloudflareTunnelService.NormalizeToken($"sudo cloudflared service install {token}"));
        Assert.Equal(token, CloudflareTunnelService.NormalizeToken($"cloudflared tunnel run --token '{token}'"));
    }

    [Theory]
    [InlineData("short")]
    [InlineData("token with spaces that is intentionally much longer than fifty characters")]
    [InlineData("sudo cloudflared service install --bad-token!")]
    public void RejectsInvalidTokens(string value) =>
        Assert.Throws<ArgumentException>(() => CloudflareTunnelService.NormalizeToken(value));
}
