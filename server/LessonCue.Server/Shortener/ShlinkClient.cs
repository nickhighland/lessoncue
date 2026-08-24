using System.Net;
using System.Text;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LessonCue.Server.Activities;

namespace LessonCue.Server.Shortener;

/// <summary>One short URL, as the shortener describes it.</summary>
public sealed record ShlinkShortUrl(string ShortCode, string LongUrl, IReadOnlyList<string> Tags, string? Domain);

/// <summary>What went wrong talking to the shortener.</summary>
public sealed class ShlinkException(string message, HttpStatusCode? status = null, Exception? inner = null)
    : Exception(message, inner)
{
    public HttpStatusCode? Status { get; } = status;

    /// <summary>A slug that already exists, authored by someone else.</summary>
    public bool IsConflict => Status == HttpStatusCode.BadRequest || Status == HttpStatusCode.Conflict;
}

/// <summary>
/// The shortener's REST API, as far as LessonCue needs it.
///
/// Reserved codes are created through this rather than by writing to the
/// shortener's database, so the shortener stays the authority on its own data
/// and an upgrade to it cannot leave rows we wrote behind.
/// </summary>
public sealed class ShlinkClient(HttpClient http)
{
    /// <summary>The API version LessonCue speaks.</summary>
    public const string ApiRoot = "rest/v3";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static HttpRequestMessage Request(HttpMethod method, string baseUrl, string path, string apiKey)
    {
        var request = new HttpRequestMessage(method, $"{baseUrl.TrimEnd('/')}/{path}");
        request.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);
        return request;
    }

    /// <summary>Is the shortener up? Used for the status card and before provisioning.</summary>
    public async Task<bool> HealthyAsync(string baseUrl, CancellationToken ct = default)
    {
        try
        {
            using var response = await http.GetAsync($"{baseUrl.TrimEnd('/')}/{ApiRoot}/health", ct);
            return response.IsSuccessStatusCode;
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }

    /// <summary>
    /// One short URL by its slug, or null when the shortener has never heard of
    /// it. Scoped to the domain, because the same slug can exist on more than
    /// one domain in the same shortener.
    /// </summary>
    public async Task<ShlinkShortUrl?> FindAsync(string baseUrl, string apiKey, string slug, string domain, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Get, baseUrl, $"{ApiRoot}/short-urls/{Uri.EscapeDataString(slug)}?domain={Uri.EscapeDataString(domain)}", apiKey);
        using var response = await SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        await EnsureAsync(response, $"look up /{slug}", ct);
        return Parse(await response.Content.ReadFromJsonAsync<JsonNode>(Json, ct));
    }

    /// <summary>Create one short URL with a slug we choose.</summary>
    public async Task<ShlinkShortUrl> CreateAsync(
        string baseUrl, string apiKey, string slug, string longUrl, string domain, IReadOnlyList<string> tags, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Post, baseUrl, $"{ApiRoot}/short-urls", apiKey);
        // Deliberately not findIfExists: a slug that already exists because
        // somebody created it by hand has to surface as a conflict, not be
        // quietly adopted as though we had made it.
        request.Content = Body(new { longUrl, customSlug = slug, domain, tags });
        using var response = await SendAsync(request, ct);
        await EnsureAsync(response, $"create /{slug}", ct);
        return Parse(await response.Content.ReadFromJsonAsync<JsonNode>(Json, ct))
            ?? throw new ShlinkException($"The shortener did not describe /{slug} after creating it.");
    }

    /// <summary>Point an existing short URL somewhere else, and set its tags.</summary>
    public async Task<ShlinkShortUrl> UpdateAsync(
        string baseUrl, string apiKey, string slug, string longUrl, string domain, IReadOnlyList<string> tags, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Patch, baseUrl, $"{ApiRoot}/short-urls/{Uri.EscapeDataString(slug)}?domain={Uri.EscapeDataString(domain)}", apiKey);
        request.Content = Body(new { longUrl, tags });
        using var response = await SendAsync(request, ct);
        await EnsureAsync(response, $"repair /{slug}", ct);
        return Parse(await response.Content.ReadFromJsonAsync<JsonNode>(Json, ct))
            ?? throw new ShlinkException($"The shortener did not describe /{slug} after updating it.");
    }

    /// <summary>
    /// A request body of known length.
    ///
    /// Serialized up front rather than streamed, so the request carries a
    /// Content-Length instead of being chunked. Plenty of reverse proxies in
    /// front of a shortener refuse a chunked body outright.
    /// </summary>
    private static StringContent Body<T>(T value) =>
        new(JsonSerializer.Serialize(value, Json), Encoding.UTF8, "application/json");

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        try
        {
            return await http.SendAsync(request, ct);
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            throw new ShlinkException("The shortener is not reachable.", null, error);
        }
    }

    private static async Task EnsureAsync(HttpResponseMessage response, string what, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        // The body carries the shortener's own explanation, which is more use
        // than the status code alone. It never contains the API key.
        var detail = await response.Content.ReadAsStringAsync(ct);
        var trimmed = detail.Length > 300 ? detail[..300] : detail;
        throw new ShlinkException($"The shortener refused to {what}: {(int)response.StatusCode} {trimmed}", response.StatusCode);
    }

    private static ShlinkShortUrl? Parse(JsonNode? node)
    {
        if (node is not JsonObject item) return null;
        var tags = item["tags"] is JsonArray array
            ? array.Select(entry => entry?.GetValue<string>() ?? "").Where(entry => entry.Length > 0).ToList()
            : [];
        return new ShlinkShortUrl(
            item["shortCode"]?.GetValue<string>() ?? "",
            item["longUrl"]?.GetValue<string>() ?? "",
            tags,
            item["domain"]?.GetValue<string>());
    }
}
