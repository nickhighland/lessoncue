using System.Text.Json;

namespace LessonCue.Server;

public sealed record SignageWidgetCacheEntry(string ZoneId, string Title, string Text, string[] Items,
    DateTimeOffset RefreshedAt, string? Source = null);

public static class SignageLayout
{
    public static readonly string[] ZoneTypes = ["media", "stream", "text", "clock", "calendar", "weather", "menu", "rss", "data",
        "shape", "icon", "qr", "ticker", "counter", "webpage", "dashboard", "social", "traffic", "wifi", "customHtml", "slides"];
    public static readonly string[] Presets = ["single", "sidebar", "split", "header-grid", "dashboard"];
    public static readonly string[] WeatherProviders = ["open-meteo", "nws", "custom"];
    public static readonly string[] WeatherDisplayFields = ["icon", "conditions", "temperature", "feelsLike", "high", "low",
        "precipitation", "humidity", "wind"];
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
            Width = Math.Clamp(zone.Width, 2, 100),
            Height = Math.Clamp(zone.Height, 2, 100),
            BackgroundColor = Color(zone.BackgroundColor, "#17201e"),
            TextColor = Color(zone.TextColor, "#ffffff"),
            AccentColor = Color(zone.AccentColor, "#d89127"),
            RefreshMinutes = Math.Clamp(zone.RefreshMinutes, 5, 1440),
            Rotation = Math.Clamp(zone.Rotation, -180, 180),
            ZIndex = Math.Clamp(zone.ZIndex, 0, 100),
            Opacity = Math.Clamp(zone.Opacity, 0, 100),
            Fit = zone.Fit is "contain" or "fill" ? zone.Fit : "cover",
            GroupId = Truncate(zone.GroupId, 64),
            LockMode = zone.LockMode is "position" or "content" or "full" ? zone.LockMode : zone.Locked ? "position" : "none",
            RichTextJson = Truncate(zone.RichTextJson, 12000),
            FontFamily = Truncate(zone.FontFamily, 80) ?? "system-ui",
            FontSize = Math.Clamp(zone.FontSize, 8, 300),
            FontWeight = Math.Clamp(zone.FontWeight, 100, 900),
            LineHeightPercent = Math.Clamp(zone.LineHeightPercent, 80, 300),
            TextAlign = zone.TextAlign is "center" or "right" or "justify" ? zone.TextAlign : "left",
            Shape = zone.Shape is "circle" or "triangle" or "line" ? zone.Shape : "rectangle",
            StrokeColor = Color(zone.StrokeColor, "#ffffff"),
            StrokeWidth = Math.Clamp(zone.StrokeWidth, 0, 30),
            CornerRadius = Math.Clamp(zone.CornerRadius, 0, 100),
            IconName = Truncate(zone.IconName, 80),
            QrValue = Truncate(zone.QrValue, 2000),
            TickerSpeed = Math.Clamp(zone.TickerSpeed, 10, 300),
            CredentialKey = Truncate(zone.CredentialKey, 120),
            WeatherProvider = zone.Type == "weather"
                ? WeatherProviders.Contains(zone.WeatherProvider) ? zone.WeatherProvider
                    : string.IsNullOrWhiteSpace(zone.SourceUrl) ? "open-meteo" : "custom"
                : null,
            WeatherLocation = type == "weather" ? Truncate(zone.WeatherLocation, 160) : null,
            WeatherLatitude = type == "weather" && zone.WeatherLatitude is { } latitude ? Math.Clamp(latitude, -90, 90) : null,
            WeatherLongitude = type == "weather" && zone.WeatherLongitude is { } longitude ? Math.Clamp(longitude, -180, 180) : null,
            WeatherUnits = type == "weather" ? zone.WeatherUnits == "celsius" ? "celsius" : "fahrenheit" : null,
            WeatherFields = type == "weather" ? NormalizeWeatherFields(zone.WeatherFields) : null
        };
    }

    public static string? Validate(IReadOnlyCollection<SignageZoneInput>? zones, IReadOnlyCollection<string> allowedOrigins)
    {
        if (zones is null || zones.Count == 0) return null; // Legacy single-message signage remains valid.
        if (zones.Count > 64) return "A signage layout supports at most 64 elements.";
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in zones)
        {
            var zone = Normalize(raw);
            if (!ids.Add(zone.Id)) return "Every signage zone must have a unique identifier.";
            if (!ZoneTypes.Contains(raw.Type)) return $"Unsupported signage zone type: {raw.Type}.";
            if (raw.X < 0 || raw.Y < 0 || raw.Width < 2 || raw.Height < 2 || raw.X + raw.Width > 100 || raw.Y + raw.Height > 100)
                return "Every signage zone must remain within the 100 × 100 layout canvas.";
            if (raw.Type == "media" && raw.MediaAssetId is null) return "Every media zone must select an image or video.";
            if (raw.Type == "stream" && !TryStreamUrl(raw.SourceUrl, out _))
                return "Live stream zones require an HTTP, HTTPS, RTMP, RTMPS, or RTSP address without embedded credentials.";
            if (raw.Type == "weather")
            {
                var provider = WeatherProviders.Contains(raw.WeatherProvider) ? raw.WeatherProvider
                    : string.IsNullOrWhiteSpace(raw.SourceUrl) ? "open-meteo" : "custom";
                if (provider is "open-meteo" or "nws" &&
                    (raw.WeatherLatitude is null or < -90 or > 90 || raw.WeatherLongitude is null or < -180 or > 180))
                    return "Open-Meteo and National Weather Service weather elements require a valid latitude and longitude.";
                if (provider == "nws" && (raw.WeatherLatitude is < 18 or > 72 || raw.WeatherLongitude is < -180 or > -60))
                    return "National Weather Service forecasts are available only for United States locations. Use Open-Meteo elsewhere.";
                if (provider == "custom" && string.IsNullOrWhiteSpace(raw.SourceUrl))
                    return "A custom weather provider requires an approved source URL.";
            }
            if (!string.IsNullOrWhiteSpace(raw.SourceUrl))
            {
                if (raw.Type == "stream") continue;
                if (raw.Type == "weather" && Normalize(raw).WeatherProvider is "open-meteo" or "nws") continue;
                if (raw.Type is not ("calendar" or "weather" or "menu" or "rss" or "data" or "webpage" or "dashboard" or "social" or "traffic" or "slides" or "customHtml"))
                    return "That signage element cannot use an online source.";
                if (!TryOrigin(raw.SourceUrl, out var origin)) return "Widget sources must be absolute HTTP or HTTPS addresses without embedded credentials.";
                if (!allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
                    return $"Approve {origin} in Settings before using it as a signage source.";
            }
        }
        return null;
    }

    public static bool TryStreamUrl(string? value, out string normalized)
    {
        normalized = "";
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https" or "rtmp" or "rtmps" or "rtsp") ||
            string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrWhiteSpace(uri.UserInfo)) return false;
        normalized = uri.AbsoluteUri;
        return true;
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

    private static string NormalizeWeatherFields(string? value)
    {
        var selected = (value ?? "icon,conditions,temperature,high,low,precipitation").Split(',',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(WeatherDisplayFields.Contains).Distinct(StringComparer.Ordinal).ToArray();
        return string.Join(',', selected.Length == 0 ? ["temperature"] : selected);
    }
}
