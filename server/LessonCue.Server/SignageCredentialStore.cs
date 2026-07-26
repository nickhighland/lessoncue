using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace LessonCue.Server;

public sealed class SignageCredentialStore
{
    private readonly string path;
    private readonly IDataProtector protector;
    private readonly SemaphoreSlim gate = new(1, 1);
    private Dictionary<string, StoredCredential> credentials;

    public SignageCredentialStore(string dataPath, IDataProtectionProvider protection)
    {
        path = Path.Combine(dataPath, "config", "signage-credentials.json");
        protector = protection.CreateProtector("LessonCue.SignageCredentials.v1");
        credentials = Read();
    }

    public IReadOnlyCollection<object> List() => credentials.OrderBy(pair => pair.Key).Select(pair => (object)new
    {
        key = pair.Key, pair.Value.Kind, pair.Value.Username, pair.Value.HeaderName,
        configured = !string.IsNullOrWhiteSpace(pair.Value.ProtectedSecret), pair.Value.UpdatedAt
    }).ToArray();

    public async Task PutAsync(string key, string kind, string? username, string? headerName, string secret,
        CancellationToken ct)
    {
        key = NormalizeKey(key);
        if (string.IsNullOrWhiteSpace(secret) || secret.Length > 4096) throw new ArgumentException("Enter a credential secret up to 4,096 characters.");
        var next = new Dictionary<string, StoredCredential>(credentials, StringComparer.OrdinalIgnoreCase)
        {
            [key] = new(kind is "basic" or "custom" ? kind : "bearer", username?.Trim(),
                headerName?.Trim(), protector.Protect(secret), DateTimeOffset.UtcNow)
        };
        await SaveAsync(next, ct);
    }

    public async Task<bool> DeleteAsync(string key, CancellationToken ct)
    {
        var next = new Dictionary<string, StoredCredential>(credentials, StringComparer.OrdinalIgnoreCase);
        if (!next.Remove(key)) return false;
        await SaveAsync(next, ct);
        return true;
    }

    public void Apply(HttpRequestMessage request, string? key)
    {
        if (string.IsNullOrWhiteSpace(key) || !credentials.TryGetValue(key, out var credential)) return;
        var secret = protector.Unprotect(credential.ProtectedSecret);
        if (credential.Kind == "basic")
        {
            var raw = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{credential.Username ?? ""}:{secret}"));
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", raw);
        }
        else if (credential.Kind == "custom" && !string.IsNullOrWhiteSpace(credential.HeaderName))
            request.Headers.TryAddWithoutValidation(credential.HeaderName, secret);
        else request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", secret);
    }

    private async Task SaveAsync(Dictionary<string, StoredCredential> next, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temporary = path + ".tmp";
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(next), ct);
            File.Move(temporary, path, true);
            credentials = next;
        }
        finally { gate.Release(); }
    }

    private Dictionary<string, StoredCredential> Read()
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, StoredCredential>>(File.ReadAllText(path))
                ?? new(StringComparer.OrdinalIgnoreCase);
        }
        catch (Exception) { return new(StringComparer.OrdinalIgnoreCase); }
    }

    private static string NormalizeKey(string value)
    {
        var key = value.Trim().ToLowerInvariant();
        if (key.Length is < 2 or > 120 || key.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_'))
            throw new ArgumentException("Credential key must use 2–120 lowercase letters, numbers, dashes, or underscores.");
        return key;
    }

    private sealed record StoredCredential(string Kind, string? Username, string? HeaderName,
        string ProtectedSecret, DateTimeOffset UpdatedAt);
}
