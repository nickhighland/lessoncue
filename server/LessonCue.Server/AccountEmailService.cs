using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace LessonCue.Server;

public sealed record AccountEmailStatus(bool Configured, string Provider, string? Error = null);

public sealed class AccountEmailService
{
    private readonly string path;
    private readonly IDataProtector protector;
    private readonly IHttpClientFactory clients;
    private readonly ILogger<AccountEmailService> logger;
    private string? protectedApiKey;
    private string? configuredProvider;

    public AccountEmailService(string dataPath, IDataProtectionProvider protection, IHttpClientFactory clients,
        ILogger<AccountEmailService> logger)
    {
        path = Path.Combine(dataPath, "config", "email-provider.json");
        protector = protection.CreateProtector("LessonCue.AccountEmail.v1");
        this.clients = clients;
        this.logger = logger;
        (configuredProvider, protectedApiKey) = ReadProtectedKey();
    }

    public AccountEmailStatus Status(string provider) => new(
        provider == configuredProvider && provider is "resend" or "brevo" && !string.IsNullOrWhiteSpace(protectedApiKey),
        provider);

    public async Task ConfigureAsync(string provider, string? apiKey, CancellationToken ct)
    {
        if (provider == "none")
        {
            protectedApiKey = null;
            configuredProvider = null;
            if (File.Exists(path)) File.Delete(path);
            return;
        }
        if (provider is not ("resend" or "brevo")) throw new ArgumentException("Email provider must be Resend or Brevo.");
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            var protectedValue = protector.Protect(apiKey.Trim());
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temporary = path + ".tmp";
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(new { provider, protectedApiKey = protectedValue }), ct);
            File.Move(temporary, path, true);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            configuredProvider = provider;
            protectedApiKey = protectedValue;
        }
        if (configuredProvider != provider || string.IsNullOrWhiteSpace(protectedApiKey))
            throw new ArgumentException("Enter an API key the first time this provider is configured.");
    }

    public async Task SendAsync(Organization organization, string recipient, string subject, string html, CancellationToken ct)
    {
        if (!Status(organization.EmailProvider).Configured) throw new InvalidOperationException("Email delivery is not configured.");
        var key = protector.Unprotect(protectedApiKey!);
        using var request = organization.EmailProvider == "resend"
            ? ResendRequest(organization, recipient, subject, html, key)
            : BrevoRequest(organization, recipient, subject, html, key);
        using var response = await clients.CreateClient("account-email").SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync(ct);
            logger.LogWarning("Account email provider returned {Status}: {Detail}", (int)response.StatusCode,
                detail.Length > 500 ? detail[..500] : detail);
            throw new InvalidOperationException($"Email provider rejected the request ({(int)response.StatusCode}).");
        }
    }

    public static string NewToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    public static string NewRegistrationCode() => Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value.Trim()))).ToLowerInvariant();

    private (string? Provider, string? ProtectedKey) ReadProtectedKey()
    {
        try
        {
            if (!File.Exists(path)) return (null, null);
            using var json = JsonDocument.Parse(File.ReadAllText(path));
            return (json.RootElement.GetProperty("provider").GetString(),
                json.RootElement.GetProperty("protectedApiKey").GetString());
        }
        catch (Exception error)
        {
            logger.LogWarning(error, "Could not read the protected account email credential.");
            return (null, null);
        }
    }

    private static HttpRequestMessage ResendRequest(Organization organization, string recipient, string subject,
        string html, string key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Content = JsonContent.Create(new
        {
            from = $"{organization.EmailFromName} <{organization.EmailFromAddress}>",
            to = new[] { recipient },
            subject,
            html
        });
        return request;
    }

    private static HttpRequestMessage BrevoRequest(Organization organization, string recipient, string subject,
        string html, string key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email");
        request.Headers.Add("api-key", key);
        request.Content = JsonContent.Create(new
        {
            sender = new { name = organization.EmailFromName, email = organization.EmailFromAddress },
            to = new[] { new { email = recipient } },
            subject,
            htmlContent = html
        });
        return request;
    }
}
