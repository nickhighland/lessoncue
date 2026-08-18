using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ActivityJoinAddressTests
{
    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private static (ActivityJoinAddressService Service, string DataPath) Create()
    {
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-join-address-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dataPath);
        var httpPort = new HttpPortService(dataPath, 80, NullLogger<HttpPortService>.Instance);
        var localAddress = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
        var tunnel = new CloudflareTunnelService(dataPath, httpPort, new TestHttpClientFactory(),
            NullLogger<CloudflareTunnelService>.Instance);
        return (new ActivityJoinAddressService(dataPath, localAddress, tunnel), dataPath);
    }

    [Theory]
    [InlineData(null, "auto")]
    [InlineData("", "auto")]
    [InlineData("   ", "auto")]
    [InlineData("nonsense", "auto")]
    [InlineData("CLOUDFLARE", "cloudflare")]
    [InlineData(" local ", "local")]
    public void ModeNormalizationRejectsUnknownValues(string? input, string expected)
    {
        Assert.Equal(expected, ActivityJoinAddressService.NormalizeMode(input));
    }

    [Fact]
    public async Task SelectedModePersistsAcrossReads()
    {
        var (service, dataPath) = Create();
        try
        {
            Assert.Equal("auto", service.Status.Mode);
            var updated = await service.SetAsync("local", TestContext.Current.CancellationToken);
            Assert.Equal("local", updated.Mode);
            Assert.Equal("local", service.Status.Mode);

            // An unknown mode must not corrupt the stored preference.
            var reset = await service.SetAsync("not-a-mode", TestContext.Current.CancellationToken);
            Assert.Equal("auto", reset.Mode);
        }
        finally { Directory.Delete(dataPath, true); }
    }

    [Fact]
    public void EveryModeIsOfferedWithReachabilityAndGuidance()
    {
        var (service, dataPath) = Create();
        try
        {
            var status = service.Status;
            Assert.Equal(["auto", "cloudflare", "local"], status.Options.Select(option => option.Id).ToArray());
            // Unreachable options stay listed so the teacher can see why.
            Assert.All(status.Options, option => Assert.False(string.IsNullOrWhiteSpace(option.Label)));
            Assert.All(status.Options, option => Assert.False(string.IsNullOrWhiteSpace(option.Detail)));
            // No tunnel is configured in a bare data path.
            Assert.Null(status.Options.Single(option => option.Id == "cloudflare").Url);
        }
        finally { Directory.Delete(dataPath, true); }
    }

    [Fact]
    public async Task ChoosingAnUnreachableAddressFallsBackInsteadOfAdvertisingIt()
    {
        var (service, dataPath) = Create();
        try
        {
            // No tunnel is published here, so "cloudflare" cannot be honoured.
            var status = await service.SetAsync("cloudflare", TestContext.Current.CancellationToken);
            Assert.Equal("cloudflare", status.Mode);
            Assert.NotEqual("cloudflare", status.ResolvedFrom);
            if (status.Url is not null) Assert.Single(System.Text.RegularExpressions.Regex.Matches(status.Url, "://"));
        }
        finally { Directory.Delete(dataPath, true); }
    }

    [Fact]
    public void JoinUrlNeedsACodeAndIsAlwaysAbsolute()
    {
        var (service, dataPath) = Create();
        try
        {
            Assert.Null(service.ResolveJoinUrl(null));
            Assert.Null(service.ResolveJoinUrl("   "));

            var url = service.ResolveJoinUrl("ab12cd");
            if (url is null) return; // No reachable address on this machine.
            // Phones cannot use a relative path, and codes are shown uppercase.
            Assert.Matches("^https?://", url);
            Assert.EndsWith("/play/AB12CD", url);
            // Regression: the base URL already carries its scheme, so building
            // one on top produced "http://http://host/play/CODE".
            Assert.Single(System.Text.RegularExpressions.Regex.Matches(url, "://"));
        }
        finally { Directory.Delete(dataPath, true); }
    }
}
