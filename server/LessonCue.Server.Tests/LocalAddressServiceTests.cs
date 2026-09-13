using LessonCue.Server;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class LocalAddressServiceTests
{
    [Theory]
    [InlineData("lessoncue", "lessoncue")]
    [InlineData("LessonCue.local", "lessoncue")]
    [InlineData(" north-campus.local ", "north-campus")]
    [InlineData("school2", "school2")]
    public void NormalizesLocalHostnames(string value, string expected) =>
        Assert.Equal(expected, LocalAddressService.NormalizeHostname(value));

    [Theory]
    [InlineData("")]
    [InlineData("-lessoncue")]
    [InlineData("lessoncue-")]
    [InlineData("lesson cue")]
    [InlineData("lessoncue.example.com")]
    [InlineData("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    public void RejectsInvalidLocalHostnames(string value) =>
        Assert.Throws<ArgumentException>(() => LocalAddressService.NormalizeHostname(value));

    [Fact]
    public async Task LocalIpv6PreferenceIsOptInToChangingAndPersistsAcrossServiceInstances()
    {
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-local-address-{Guid.NewGuid():N}");
        try
        {
            var service = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
            Assert.True(service.Status.Ipv6Enabled);
            Assert.False((await service.SetAsync("lessoncue", false, TestContext.Current.CancellationToken)).Ipv6Enabled);

            var reloaded = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
            Assert.False(reloaded.Status.Ipv6Enabled);
            Assert.True((await reloaded.SetAsync("lessoncue", true, TestContext.Current.CancellationToken)).Ipv6Enabled);
        }
        finally { if (Directory.Exists(dataPath)) Directory.Delete(dataPath, true); }
    }
}
