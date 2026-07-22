using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class SignageWidgetService(IServiceScopeFactory scopeFactory, IHttpClientFactory clients,
    IHubContext<SyncHub> hub, ILogger<SignageWidgetService> logger) : BackgroundService
{
    private readonly SemaphoreSlim refreshLock = new(1, 1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        do
        {
            try { await RefreshAsync(null, false, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogWarning(error, "Signage widget refresh failed"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public async Task<int> RefreshAsync(Guid? signageId, bool force, CancellationToken cancellationToken)
    {
        if (!await refreshLock.WaitAsync(0, cancellationToken)) return 0;
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
            var organization = await db.Organizations.AsNoTracking().FirstAsync(cancellationToken);
            var allowlist = SignageLayout.ParseAllowlist(organization.SignageSourceAllowlistJson);
            var query = db.SignagePlaylists.Where(x => x.Enabled);
            if (signageId is { } id) query = query.Where(x => x.Id == id);
            var signage = await query.ToListAsync(cancellationToken);
            var changed = 0;
            foreach (var sign in signage)
            {
                var zones = SignageLayout.ParseZones(sign.ZonesJson);
                var cache = SignageLayout.ParseCache(sign.WidgetCacheJson).ToDictionary(x => x.ZoneId, StringComparer.OrdinalIgnoreCase);
                var errors = new List<string>();
                var signChanged = false;
                foreach (var zone in zones.Where(x => !string.IsNullOrWhiteSpace(x.SourceUrl)))
                {
                    if (!SignageLayout.TryOrigin(zone.SourceUrl!, out var origin) || !allowlist.Contains(origin, StringComparer.OrdinalIgnoreCase))
                    {
                        errors.Add($"{zone.Title ?? zone.Type}: source is no longer approved");
                        continue;
                    }
                    if (!force && cache.TryGetValue(zone.Id, out var existing) &&
                        existing.RefreshedAt.AddMinutes(Math.Clamp(zone.RefreshMinutes, 5, 1440)) > DateTimeOffset.UtcNow) continue;
                    try
                    {
                        cache[zone.Id] = await FetchAsync(zone, cancellationToken);
                        signChanged = true;
                    }
                    catch (Exception error) when (error is HttpRequestException or TaskCanceledException or InvalidDataException or JsonException)
                    {
                        errors.Add($"{zone.Title ?? zone.Type}: {Short(error.Message)}");
                    }
                }
                var errorText = errors.Count == 0 ? null : string.Join(" · ", errors);
                if (signChanged || sign.WidgetCacheError != errorText)
                {
                    sign.WidgetCacheJson = SignageLayout.StoreCache(cache.Values);
                    if (signChanged) sign.WidgetCacheUpdatedAt = DateTimeOffset.UtcNow;
                    sign.WidgetCacheError = errorText;
                    changed++;
                }
            }
            if (changed > 0)
            {
                await db.SaveChangesAsync(cancellationToken);
                await hub.Clients.Group("admins").SendAsync("ManifestInvalidated", new { version = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }, cancellationToken);
            }
            return changed;
        }
        finally { refreshLock.Release(); }
    }

    public async Task<SignageWidgetCacheEntry> FetchAsync(SignageZoneInput zone, CancellationToken cancellationToken)
    {
        using var response = await clients.CreateClient("signage-widgets").GetAsync(zone.SourceUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength is > 2_000_000) throw new InvalidDataException("Source response exceeds 2 MB.");
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        if (text.Length > 2_000_000) throw new InvalidDataException("Source response exceeds 2 MB.");
        return Parse(zone, text, DateTimeOffset.UtcNow);
    }

    public static SignageWidgetCacheEntry Parse(SignageZoneInput zone, string payload, DateTimeOffset refreshedAt)
    {
        var title = zone.Title ?? zone.Type.ToUpperInvariant();
        var text = zone.Content ?? "";
        var items = Array.Empty<string>();
        if (zone.Type == "rss")
        {
            var document = XDocument.Parse(payload);
            var channel = document.Descendants().FirstOrDefault(x => x.Name.LocalName == "channel");
            title = zone.Title ?? Clean(channel?.Elements().FirstOrDefault(x => x.Name.LocalName == "title")?.Value) ?? title;
            items = document.Descendants().Where(x => x.Name.LocalName is "item" or "entry")
                .Select(x => Clean(x.Elements().FirstOrDefault(y => y.Name.LocalName == "title")?.Value))
                .Where(x => !string.IsNullOrWhiteSpace(x)).Take(8).Cast<string>().ToArray();
        }
        else if (zone.Type == "calendar")
        {
            var unfolded = Regex.Replace(payload, "\\r?\\n[ \\t]", "");
            items = unfolded.Split('\n').Select(x => x.Trim()).Where(x => x.StartsWith("SUMMARY", StringComparison.OrdinalIgnoreCase))
                .Select(x => Clean(x[(x.IndexOf(':') + 1)..])).Where(x => !string.IsNullOrWhiteSpace(x)).Take(8).Cast<string>().ToArray();
            if (items.Length == 0) items = ParseJsonItems(payload);
        }
        else if (zone.Type is "weather" or "data")
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            title = zone.Title ?? StringProperty(root, "title") ?? StringProperty(root, "name") ?? title;
            text = StringProperty(root, "summary") ?? StringProperty(root, "message") ?? StringProperty(root, "text") ?? WeatherText(root) ?? text;
            items = JsonItems(root);
        }
        else
        {
            items = payload.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(Clean).Where(x => !string.IsNullOrWhiteSpace(x)).Take(12).Cast<string>().ToArray();
        }
        return new(zone.Id, title, Clean(text) ?? "", items, refreshedAt, zone.SourceUrl);
    }

    private static string[] ParseJsonItems(string payload)
    {
        try { using var document = JsonDocument.Parse(payload); return JsonItems(document.RootElement); }
        catch (JsonException) { return []; }
    }

    private static string[] JsonItems(JsonElement root)
    {
        if (!root.TryGetProperty("items", out var items) && !root.TryGetProperty("events", out items)) return [];
        if (items.ValueKind != JsonValueKind.Array) return [];
        return items.EnumerateArray().Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() :
            StringProperty(item, "title") ?? StringProperty(item, "name") ?? StringProperty(item, "summary"))
            .Where(x => !string.IsNullOrWhiteSpace(x)).Take(8).Cast<string>().ToArray();
    }

    private static string? WeatherText(JsonElement root)
    {
        if (root.TryGetProperty("current_weather", out var current) || root.TryGetProperty("current", out current))
        {
            var temperature = NumberProperty(current, "temperature") ?? NumberProperty(current, "temperature_2m");
            var unit = StringProperty(current, "temperature_unit") ?? "°";
            if (temperature is not null) return $"{temperature:0.#}{unit}";
        }
        return null;
    }

    private static string? StringProperty(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static double? NumberProperty(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : null;
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null :
        WebUtility.HtmlDecode(Regex.Replace(value, "<[^>]+>", " ")).Replace("\\n", " ").Trim()[..Math.Min(500, WebUtility.HtmlDecode(Regex.Replace(value, "<[^>]+>", " ")).Replace("\\n", " ").Trim().Length)];
    private static string Short(string value) => value.Length <= 180 ? value : value[..180];
}
