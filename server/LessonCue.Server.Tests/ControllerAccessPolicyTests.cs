using System.Security.Claims;
using System.Net;
using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ControllerAccessPolicyTests
{
    [Theory]
    [InlineData("lessoncue.local")]
    [InlineData("Room-Server.LOCAL")]
    [InlineData("lessoncue.local.")]
    public void LocalHostname_AcceptsMdnsNames(string hostname) =>
        Assert.True(ControllerAccessPolicy.IsLocalHostname(hostname));

    [Theory]
    [InlineData("lessoncue.example.org")]
    [InlineData("192.168.1.10")]
    [InlineData("notlocal")]
    [InlineData("")]
    public void LocalHostname_RejectsPublicAndNumericHosts(string hostname) =>
        Assert.False(ControllerAccessPolicy.IsLocalHostname(hostname));

    [Fact]
    public void RequiredLocalAccess_AllowsAdministratorsFromPublicHostname()
    {
        var user = Principal("Administrator");
        Assert.True(ControllerAccessPolicy.CanUseRoomController(true, user, "lessoncue.example.org",
            IPAddress.Parse("203.0.113.10")));
    }

    [Fact]
    public void RequiredLocalAccess_BlocksNonAdministratorFromPublicHostname()
    {
        var user = Principal("Editor");
        Assert.False(ControllerAccessPolicy.CanUseRoomController(true, user, "lessoncue.example.org",
            IPAddress.Parse("192.168.1.10")));
        Assert.False(ControllerAccessPolicy.CanUseRoomController(true, user, "lessoncue.local",
            IPAddress.Parse("203.0.113.10")));
        Assert.True(ControllerAccessPolicy.CanUseRoomController(true, user, "lessoncue.local",
            IPAddress.Parse("192.168.1.10")));
    }

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("10.20.30.40")]
    [InlineData("172.20.1.8")]
    [InlineData("192.168.4.75")]
    [InlineData("fe80::1")]
    [InlineData("fd00::25")]
    public void PrivateNetworkAddress_AcceptsLocalRanges(string address) =>
        Assert.True(ControllerAccessPolicy.IsPrivateNetworkAddress(IPAddress.Parse(address)));

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("172.32.0.1")]
    [InlineData("2001:4860:4860::8888")]
    public void PrivateNetworkAddress_RejectsPublicRanges(string address) =>
        Assert.False(ControllerAccessPolicy.IsPrivateNetworkAddress(IPAddress.Parse(address)));

    private static ClaimsPrincipal Principal(string role) =>
        new(new ClaimsIdentity([new Claim(ClaimTypes.Role, role)], "test"));
}
