using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

/// <summary>
/// Publishes a fresh, redacted failures-only report for pull-based automation.
/// The scheduled email/review worker remains interval-based; this endpoint is
/// intentionally independent so Codex can request current evidence at any time.
/// </summary>
public sealed class TroubleshootingReportPullService(
    IServiceScopeFactory scopes,
    TroubleshootingReportBuilder reports)
{
    public const string EndpointPath = "/report.log";
    public const string TokenEnvironmentVariable = "LESSONCUE_TROUBLESHOOTING_REPORT_TOKEN";
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(15);
    private readonly SemaphoreSlim gate = new(1, 1);
    private byte[]? cachedContent;
    private string? cachedEtag;
    private DateTimeOffset cachedAt;
    private DateTimeOffset cachedGeneratedAt;

    public static bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(TokenEnvironmentVariable)?.Trim());

    public static string EndpointUrl(Organization organization)
    {
        var baseUrl = organization.PublicBaseUrl.Trim().TrimEnd('/');
        return string.IsNullOrWhiteSpace(baseUrl) ? EndpointPath : baseUrl + EndpointPath;
    }

    public static bool Authorize(HttpRequest request)
    {
        var configured = Environment.GetEnvironmentVariable(TokenEnvironmentVariable)?.Trim();
        if (string.IsNullOrWhiteSpace(configured)) return false;

        var authorization = request.Headers.Authorization.ToString();
        if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;
        var presented = authorization["Bearer ".Length..].Trim();
        if (presented.Length == 0) return false;

        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(configured));
        var actualHash = SHA256.HashData(Encoding.UTF8.GetBytes(presented));
        return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
    }

    public async Task<TroubleshootingReportPullResult> GetAsync(
        string? ifNoneMatch, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var now = DateTimeOffset.UtcNow;
            if (cachedContent is null || now - cachedAt >= CacheLifetime)
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                if (!await db.Organizations.AsNoTracking().AnyAsync(ct))
                    throw new InvalidOperationException("The LessonCue organization has not been initialized.");

                var report = await reports.BuildAsync(db, requestedLimit: 1_000, failuresOnly: true, ct);
                cachedContent = TroubleshootingReportBuilder.ToJson(report);
                // GeneratedAt is intentionally excluded from the ETag. A pull
                // should return 304 when the evidence is unchanged, even
                // though the server rebuilt the envelope at a later time.
                var stableReport = report with { GeneratedAt = DateTimeOffset.UnixEpoch };
                var stableContent = TroubleshootingReportBuilder.ToJson(stableReport);
                cachedEtag = $"\"{Convert.ToHexString(SHA256.HashData(stableContent)).ToLowerInvariant()}\"";
                cachedGeneratedAt = report.GeneratedAt;
                cachedAt = now;
            }

            var notModified = Matches(ifNoneMatch, cachedEtag!);
            return new TroubleshootingReportPullResult(
                notModified ? null : cachedContent,
                cachedEtag!,
                cachedGeneratedAt,
                notModified);
        }
        finally { gate.Release(); }
    }

    private static bool Matches(string? ifNoneMatch, string etag)
    {
        if (string.IsNullOrWhiteSpace(ifNoneMatch)) return false;
        return ifNoneMatch.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(value => value.Trim())
            .Any(value => value == "*" || value == etag ||
                value.StartsWith("W/", StringComparison.OrdinalIgnoreCase) && value[2..] == etag);
    }
}

public sealed record TroubleshootingReportPullResult(
    byte[]? Content,
    string ETag,
    DateTimeOffset GeneratedAt,
    bool NotModified);
