using System.Net;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging.Abstractions;
using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AccountEmailServiceTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"lessoncue-account-email-{Guid.NewGuid():N}");

    [Fact]
    public void CreatesUniqueHighEntropyTokensAndOneWayHashes()
    {
        var first = AccountEmailService.NewToken();
        var second = AccountEmailService.NewToken();
        var code = AccountEmailService.NewRegistrationCode();

        Assert.Equal(64, first.Length);
        Assert.Equal(16, code.Length);
        Assert.NotEqual(first, second);
        Assert.Equal(AccountEmailService.Hash(first), AccountEmailService.Hash($" {first} "));
        Assert.DoesNotContain(first, AccountEmailService.Hash(first));
    }

    [Fact]
    public async Task StoresTheProviderKeyProtectedAndRecoversItAfterRestart()
    {
        var handler = new CapturingHandler();
        var protection = DataProtectionProvider.Create(new DirectoryInfo(Path.Combine(root, "keys")));
        var service = CreateService(protection, handler);

        await service.ConfigureAsync("resend", "re_test_secret_value", TestContext.Current.CancellationToken);

        var configuration = await File.ReadAllTextAsync(Path.Combine(root, "config", "email-provider.json"),
            TestContext.Current.CancellationToken);
        Assert.DoesNotContain("re_test_secret_value", configuration);
        Assert.Contains("\"provider\":\"resend\"", configuration);
        Assert.True(service.Status("resend").Configured);
        Assert.False(service.Status("brevo").Configured);

        var restarted = CreateService(protection, handler);
        Assert.True(restarted.Status("resend").Configured);
    }

    [Theory]
    [InlineData("resend", "https://api.resend.com/emails", "Bearer", "re_example")]
    [InlineData("brevo", "https://api.brevo.com/v3/smtp/email", "api-key", "brevo-example")]
    public async Task SendsThroughTheConfiguredProvider(string provider, string address, string header, string key)
    {
        var handler = new CapturingHandler();
        var protection = DataProtectionProvider.Create(new DirectoryInfo(Path.Combine(root, $"keys-{provider}")));
        var service = CreateService(protection, handler);
        await service.ConfigureAsync(provider, key, TestContext.Current.CancellationToken);
        var organization = new Organization
        {
            Name = "LessonCue Test",
            EmailProvider = provider,
            EmailFromName = "LessonCue Test",
            EmailFromAddress = "accounts@example.org"
        };

        await service.SendAsync(organization, "person@example.org", "Verify account", "<p>Verify</p>",
            TestContext.Current.CancellationToken);

        Assert.Equal(address, handler.Address);
        Assert.Contains("person@example.org", handler.Body);
        Assert.Contains("Verify account", handler.Body);
        if (header == "Bearer") Assert.Equal($"Bearer {key}", handler.Authorization);
        else Assert.Equal(key, handler.ApiKey);
    }

    private AccountEmailService CreateService(IDataProtectionProvider protection, HttpMessageHandler handler) =>
        new(root, protection, new TestHttpClientFactory(handler), NullLogger<AccountEmailService>.Instance);

    public void Dispose()
    {
        if (Directory.Exists(root)) Directory.Delete(root, true);
    }

    private sealed class TestHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class CapturingHandler : HttpMessageHandler
    {
        public string Address { get; private set; } = "";
        public string Body { get; private set; } = "";
        public string Authorization { get; private set; } = "";
        public string ApiKey { get; private set; } = "";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Address = request.RequestUri?.ToString() ?? "";
            Body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Authorization = request.Headers.Authorization?.ToString() ?? "";
            ApiKey = request.Headers.TryGetValues("api-key", out var values) ? values.Single() : "";
            return new HttpResponseMessage(HttpStatusCode.Created);
        }
    }
}
