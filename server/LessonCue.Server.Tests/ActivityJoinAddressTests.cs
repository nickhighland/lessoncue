using LessonCue.Server;
using LessonCue.Server.Activities;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ActivityJoinAddressTests
{
    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private static (ActivityJoinAddressService Service, string DataPath) Create(IShortJoinAddress? shortener = null)
    {
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-join-address-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dataPath);
        var httpPort = new HttpPortService(dataPath, 80, NullLogger<HttpPortService>.Instance);
        var localAddress = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
        var tunnel = new CloudflareTunnelService(dataPath, httpPort, new TestHttpClientFactory(),
            NullLogger<CloudflareTunnelService>.Instance);
        return (new ActivityJoinAddressService(dataPath, localAddress, tunnel, httpPort, shortener), dataPath);
    }

    /// <summary>A shortener that holds the reserved codes and nothing else.</summary>
    private sealed class RunningShortener(string domain = "go.example.org") : IShortJoinAddress
    {
        public string? ShortBaseUrl => $"https://{domain}";

        public string? ShortJoinUrlFor(string? joinCode)
        {
            var code = ReservedGameCodes.Normalize(joinCode ?? "");
            return ReservedGameCodes.IsReserved(code) ? $"https://{domain}/{code}" : null;
        }
    }

    [Fact]
    public async Task TheShortDomainIsOfferedAndUsedOnceTheShortenerRuns()
    {
        var (service, dataPath) = Create(new RunningShortener());
        try
        {
            var ct = TestContext.Current.CancellationToken;
            var offered = service.Status.Options.Single(option => option.Id == "shortener");
            Assert.True(offered.Available);
            Assert.Equal("https://go.example.org", offered.Url);

            var status = await service.SetAsync("shortener", ct);
            Assert.Equal("shortener", status.ResolvedFrom);

            var reserved = ReservedGameCodes.All[0];
            Assert.Equal($"https://go.example.org/{reserved}", service.ResolveJoinUrl(reserved));
        }
        finally { Directory.Delete(dataPath, true); }
    }

    [Fact]
    public async Task AGameWhoseCodeTheShortenerDoesNotHoldGetsAnOrdinaryAddress()
    {
        // A game started while the shortener was down has an ordinary six
        // character code. Advertising it on the short domain would be a dead
        // link on a wall, whatever the room has been asked to prefer.
        var (service, dataPath) = Create(new RunningShortener());
        try
        {
            await service.SetAsync("shortener", TestContext.Current.CancellationToken);

            var resolved = service.ResolveJoinUrl("K7M2QP");

            Assert.False(ReservedGameCodes.IsReserved("K7M2QP"));
            if (resolved is not null)
            {
                Assert.DoesNotContain("go.example.org", resolved);
                Assert.EndsWith("/play/K7M2QP", resolved);
            }
        }
        finally { Directory.Delete(dataPath, true); }
    }

    [Theory]
    [InlineData(null, "auto")]
    [InlineData("", "auto")]
    [InlineData("   ", "auto")]
    [InlineData("nonsense", "auto")]
    [InlineData("CLOUDFLARE", "cloudflare")]
    [InlineData(" local ", "local")]
    [InlineData("lan", "lan")]
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
            Assert.Equal(["auto", "shortener", "cloudflare", "local", "lan"], status.Options.Select(option => option.Id).ToArray());
            // Offered even with no shortener, so a teacher can see it exists and
            // what it needs, rather than wondering where the short domain went.
            Assert.Null(status.Options.Single(option => option.Id == "shortener").Url);
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
    public void TheNetworkAddressIsANumericFallbackForWhenMdnsFails()
    {
        var (service, dataPath) = Create();
        try
        {
            var lan = service.Status.Options.Single(option => option.Id == "lan");
            if (lan.Url is null)
            {
                // A machine with no usable interface still offers the choice
                // with an explanation rather than hiding it.
                Assert.False(lan.Available);
                Assert.Contains("No network address", lan.Detail);
                return;
            }

            Assert.True(lan.Available);
            Assert.Matches(@"^http://\d{1,3}(\.\d{1,3}){3}(:\d+)?$", lan.Url);
            // Loopback and link-local addresses reach nobody in the room.
            Assert.DoesNotContain("127.0.0.1", lan.Url);
            Assert.DoesNotContain("169.254.", lan.Url);
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
