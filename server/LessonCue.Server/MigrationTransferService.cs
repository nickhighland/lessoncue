using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;

namespace LessonCue.Server;

public sealed record MigrationTransferGrant(
    string Token,
    string FileName,
    DateTimeOffset ExpiresAt);

public sealed record MigrationTransferSource(
    string Path,
    string FileName,
    DateTimeOffset ExpiresAt);

public sealed record MigrationPullInput(
    string SourceAddress,
    string TransferToken,
    string? Password);

public sealed class MigrationTransferService(
    IHttpClientFactory clients,
    BackupService backups)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);
    private readonly ConcurrentDictionary<string, Grant> grants =
        new(StringComparer.Ordinal);

    public MigrationTransferGrant Create(string path, string fileName)
    {
        Cleanup();
        if (!Path.GetExtension(fileName).Equals(
                ".lcbak", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException(
                "Create a current password-encrypted .lcbak backup before starting a server transfer.");
        var token = Convert.ToHexString(
            RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var expiresAt = DateTimeOffset.UtcNow.Add(Lifetime);
        grants[token] = new Grant(path, fileName, expiresAt);
        return new MigrationTransferGrant(token, fileName, expiresAt);
    }

    public MigrationTransferSource? Consume(string? token)
    {
        Cleanup();
        var normalized = token?.Trim().ToLowerInvariant() ?? "";
        if (normalized.Length != 64 ||
            normalized.Any(character => !Uri.IsHexDigit(character)) ||
            !grants.TryRemove(normalized, out var grant) ||
            grant.ExpiresAt <= DateTimeOffset.UtcNow ||
            !File.Exists(grant.Path))
            return null;
        return new MigrationTransferSource(
            grant.Path, grant.FileName, grant.ExpiresAt);
    }

    public async Task<BackupPreview> PullAsync(
        MigrationPullInput input,
        CancellationToken ct)
    {
        var source = NormalizeSource(input.SourceAddress);
        var token = input.TransferToken.Trim().ToLowerInvariant();
        if (token.Length != 64 ||
            token.Any(character => !Uri.IsHexDigit(character)))
            throw new ArgumentException("Enter the 64-character one-time transfer token.");
        var endpoint = new Uri(source, "/api/v1/migration/export");
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        request.Headers.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        var response = await clients.CreateClient("migration-transfer")
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        using (response)
        {
            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
                throw new InvalidDataException(
                    "The one-time transfer token is invalid, expired, or already used.");
            if (!response.IsSuccessStatusCode)
                throw new IOException(
                    $"The source LessonCue server rejected the transfer ({(int)response.StatusCode}).");
            var length = response.Content.Headers.ContentLength;
            if (length is null or <= 0)
                throw new InvalidDataException(
                    "The source server did not provide a valid backup length.");
            var fileName = response.Content.Headers.ContentDisposition?.FileNameStar ??
                           response.Content.Headers.ContentDisposition?.FileName?.Trim('"') ??
                           "lessoncue-migration.lcbak";
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            return await backups.StageAsync(
                stream,
                Path.GetFileName(fileName),
                length.Value,
                ct,
                input.Password);
        }
    }

    public static Uri NormalizeSource(string value)
    {
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https") ||
            !string.IsNullOrEmpty(uri.UserInfo))
            throw new ArgumentException(
                "Enter the source LessonCue address beginning with http:// or https://.");
        if (uri.Scheme == "http" && !IsPrivateLanHost(uri.Host))
            throw new ArgumentException(
                "Plain HTTP transfer is limited to a private numeric address, localhost, or a .local hostname. Use HTTPS for every other source.");
        return new Uri(uri.GetLeftPart(UriPartial.Authority));
    }

    private static bool IsPrivateLanHost(string host)
    {
        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".local", StringComparison.OrdinalIgnoreCase))
            return true;
        if (!IPAddress.TryParse(host, out var address)) return false;
        if (IPAddress.IsLoopback(address) || address.IsIPv6LinkLocal) return true;
        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
            return bytes[0] == 10 ||
                   bytes[0] == 127 ||
                   bytes[0] == 192 && bytes[1] == 168 ||
                   bytes[0] == 172 && bytes[1] is >= 16 and <= 31 ||
                   bytes[0] == 169 && bytes[1] == 254;
        return bytes.Length == 16 && (bytes[0] & 0xfe) == 0xfc;
    }

    private void Cleanup()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var item in grants)
            if (item.Value.ExpiresAt <= now)
                grants.TryRemove(item.Key, out _);
    }

    private sealed record Grant(
        string Path,
        string FileName,
        DateTimeOffset ExpiresAt);
}
