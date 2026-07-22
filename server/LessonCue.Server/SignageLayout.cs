using System.Text.Json;

namespace LessonCue.Server;

public sealed record SignageWidgetCacheEntry(string ZoneId, string Title, string Text, string[] Items,
    DateTimeOffset RefreshedAt, string? Source = null);

public static class SignageLayout
{
    public static readonly string[] ZoneTypes = ["media", "text", "clock", "calendar", "weather", "menu", "rss", "data"];
    public static readonly string[] Presets = ["single", "sidebar", "split", "header-grid", "dashboard"];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static List<SignageZoneInput> ParseZones(string? json)
    {
        try { return JsonSerializer.Deserialize<List<SignageZoneInput>>(json ?? "[]", JsonOptions) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string StoreZones(IEnumerable<SignageZoneInput>? zones) =>
        JsonSerializer.Serialize((zones ?? []).Select(Normalize).ToArray(), JsonOptions);

    public static List<SignageWidgetCacheEntry> ParseCache(string? json)
    {
        try { return JsonSerializer.Deserialize<List<SignageWidgetCacheEntry>>(json ?? "[]", JsonOptions) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string StoreCache(IEnumerable<SignageWidgetCacheEntry> cache) => JsonSerializer.Serialize(cache, JsonOptions);

    public static string NormalizePreset(string? value) => Presets.Contains(value) ? value! : "single";

    public static SignageZoneInput Normalize(SignageZoneInput zone)
    {
        var type = ZoneTypes.Contains(zone.Type) ? zone.Type : "text";
        return zone with
        {
            Id = string.IsNullOrWhiteSpace(zone.Id) ? Guid.NewGuid().ToString("N") : zone.Id.Trim()[..Math.Min(64, zone.Id.Trim().Length)],
            Type = type,
            Title = Truncate(zone.Title, 160),
            Content = Truncate(zone.Content, 4000),
            SourceUrl = string.IsNullOrWhiteSpace(zone.SourceUrl) ? null : zone.SourceUrl.Trim(),
            X = Math.Clamp(zone.X, 0, 90),
            Y = Math.Clamp(zone.Y, 0, 90),
            Width = Math.Clamp(zone.Width, 10, 100),
            Height = Math.Clamp(zone.Height, 10, 100),
            BackgroundColor = Color(zone.BackgroundColor, "#17201e"),
            TextColor = Color(zone.TextColor, "#ffffff"),
            AccentColor = Color(zone.AccentColor, "#d89127"),
            RefreshMinutes = Math.Clamp(zone.RefreshMinutes, 5, 1440)
        };
    }

    public static string? Validate(IReadOnlyCollection<SignageZoneInput>? zones, IReadOnlyCollection<string> allowedOrigins)
    {
        if (zones is null || zones.Count == 0) return null; // Legacy single-message signage remains valid.
        if (zones.Count > 8) return "A signage layout supports at most eight zones.";
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in zones)
        {
            var zone = Normalize(raw);
            if (!ids.Add(zone.Id)) return "Every signage zone must have a unique identifier.";
            if (!ZoneTypes.Contains(raw.Type)) return $"Unsupported signage zone type: {raw.Type}.";
            if (raw.X < 0 || raw.Y < 0 || raw.Width < 10 || raw.Height < 10 || raw.X + raw.Width > 100 || raw.Y + raw.Height > 100)
                return "Every signage zone must remain within the 100 × 100 layout canvas.";
            if (raw.Type == "media" && raw.MediaAssetId is null) return "Every media zone must select an image or video.";
            if (!string.IsNullOrWhiteSpace(raw.SourceUrl))
            {
                if (raw.Type is not ("calendar" or "weather" or "menu" or "rss" or "data"))
                    return "Only calendar, weather, menu, RSS, and data zones may use an online source.";
                if (!TryOrigin(raw.SourceUrl, out var origin)) return "Widget sources must be absolute HTTP or HTTPS addresses without embedded credentials.";
                if (!allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
                    return $"Approve {origin} in Settings before using it as a signage source.";
            }
        }
        return null;
    }

    public static string[] ParseAllowlist(string? json)
    {
        try { return JsonSerializer.Deserialize<string[]>(json ?? "[]")?.Where(x => TryOrigin(x, out _)).Select(x => { TryOrigin(x, out var origin); return origin; }).Distinct(StringComparer.OrdinalIgnoreCase).Order().ToArray() ?? []; }
        catch (JsonException) { return []; }
    }

    public static bool TryNormalizeAllowlist(IEnumerable<string>? values, out string[] origins, out string? error)
    {
        var normalized = new List<string>();
        foreach (var value in values ?? [])
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (!TryOrigin(value, out var origin)) { origins = []; error = $"{value.Trim()} is not a valid HTTP or HTTPS source origin."; return false; }
            normalized.Add(origin);
        }
        origins = normalized.Distinct(StringComparer.OrdinalIgnoreCase).Order().Take(100).ToArray();
        error = normalized.Count > 100 ? "At most 100 widget source origins may be approved." : null;
        return error is null;
    }

    public static bool TryOrigin(string value, out string origin)
    {
        origin = "";
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") ||
            string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrWhiteSpace(uri.UserInfo)) return false;
        origin = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        return true;
    }

    private static string? Truncate(string? value, int length)
    {
        var clean = value?.Trim();
        return string.IsNullOrEmpty(clean) ? null : clean[..Math.Min(length, clean.Length)];
    }

    private static string Color(string? value, string fallback) =>
        value is { Length: 7 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit) ? value : fallback;
}
