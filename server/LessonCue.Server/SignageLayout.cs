using System.Text.Json;

namespace LessonCue.Server;

public sealed record SignageCalendarEvent(string Title, string? Description, string? Location,
    DateTimeOffset? StartsAt, DateTimeOffset? EndsAt, bool AllDay = false);
public sealed record SignageWeatherSnapshot(double? Temperature, double? FeelsLike, double? High, double? Low,
    double? Precipitation, double? Humidity, double? Wind, string? TemperatureUnit, string? WindUnit,
    string? Conditions, string? Forecast, string? Sunrise, string? Sunset, string? WindText);
public sealed record SignageWidgetCacheEntry(string ZoneId, string Title, string Text, string[] Items,
    DateTimeOffset RefreshedAt, string? Source = null, string? Icon = null,
    SignageCalendarEvent[]? Events = null, SignageWeatherSnapshot? Weather = null);

public static class SignageLayout
{
    public static readonly string[] ZoneTypes = ["media", "stream", "presentation", "text", "clock", "calendar",
        "weather", "rss", "qr", "ticker", "counter", "webpage", "wifi", "audience", "customHtml"];
    public static readonly string[] Presets = ["single", "sidebar", "split", "header-grid", "dashboard"];
    public static readonly string[] WeatherProviders = ["open-meteo", "nws", "custom"];
    public static readonly string[] WeatherDisplayFields = ["icon", "conditions", "temperature", "feelsLike", "high", "low",
        "precipitation", "humidity", "wind", "forecast", "sunrise", "sunset"];
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
            Content = Truncate(zone.Content, zone.Type == "customHtml" ? 50000 : 4000),
            SourceUrl = Truncate(zone.SourceUrl, 2000),
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
            QrValue = type == "wifi" && !string.IsNullOrWhiteSpace(zone.WifiNetworkName)
                ? BuildWifiQr(zone.WifiNetworkName!, zone.WifiPassword, zone.WifiSecurity, zone.WifiHidden)
                : Truncate(zone.QrValue, 2000),
            QrLabelTop = Truncate(zone.QrLabelTop, 160),
            QrLabelBottom = Truncate(zone.QrLabelBottom, 160),
            QrLabelLeft = Truncate(zone.QrLabelLeft, 160),
            QrLabelRight = Truncate(zone.QrLabelRight, 160),
            QrPlacement = zone.QrPlacement is "left" or "right" ? zone.QrPlacement : "center",
            QrSizePercent = Math.Clamp(zone.QrSizePercent, 20, 90),
            TickerSpeed = Math.Clamp(zone.TickerSpeed, 10, 300),
            CredentialKey = Truncate(zone.CredentialKey, 120),
            ClockDisplay = zone.ClockDisplay is "time" or "date" ? zone.ClockDisplay : "both",
            ClockTimeFormat = zone.ClockTimeFormat is "12h-seconds" or "24h" or "24h-seconds"
                ? zone.ClockTimeFormat : "12h",
            ClockDateFormat = zone.ClockDateFormat is "short" or "medium" or "numeric"
                ? zone.ClockDateFormat : "long",
            ClockOrder = zone.ClockOrder is "date-time" or "inline" ? zone.ClockOrder : "time-date",
            ClockTimeFontSize = Math.Clamp(zone.ClockTimeFontSize, 8, 300),
            ClockDateFontSize = Math.Clamp(zone.ClockDateFontSize, 8, 300),
            WeatherProvider = zone.Type == "weather"
                ? WeatherProviders.Contains(zone.WeatherProvider) ? zone.WeatherProvider
                    : string.IsNullOrWhiteSpace(zone.SourceUrl) ? "open-meteo" : "custom"
                : null,
            WeatherLocation = type == "weather" ? Truncate(zone.WeatherLocation, 160) : null,
            WeatherLatitude = type == "weather" && zone.WeatherLatitude is { } latitude ? Math.Clamp(latitude, -90, 90) : null,
            WeatherLongitude = type == "weather" && zone.WeatherLongitude is { } longitude ? Math.Clamp(longitude, -180, 180) : null,
            WeatherPostalCode = type == "weather" ? Truncate(zone.WeatherPostalCode, 20) : null,
            WeatherUnits = type == "weather" ? zone.WeatherUnits == "celsius" ? "celsius" : "fahrenheit" : null,
            WeatherFields = type == "weather" ? NormalizeWeatherFields(zone.WeatherFields) : null,
            ContentPlaylistId = type == "presentation" ? zone.ContentPlaylistId : null,
            StreamOverrideWhenLive = type == "presentation" && zone.StreamOverrideWhenLive,
            ContentPadding = Math.Clamp(zone.ContentPadding, 0, 30),
            ContentScale = Math.Clamp(zone.ContentScale, 25, 100),
            VerticalAlign = zone.VerticalAlign is "top" or "bottom" ? zone.VerticalAlign : "middle",
            StreamOverrideStartsAt = type == "presentation" ? zone.StreamOverrideStartsAt : null,
            StreamOverrideEndsAt = type == "presentation" ? zone.StreamOverrideEndsAt : null,
            MediaScale = Math.Clamp(zone.MediaScale, 25, 400),
            MediaOffsetX = Math.Clamp(zone.MediaOffsetX, -150, 150),
            MediaOffsetY = Math.Clamp(zone.MediaOffsetY, -150, 150),
            MediaAllowOverflow = type == "media" && zone.MediaAllowOverflow,
            WifiNetworkName = type == "wifi" ? Truncate(zone.WifiNetworkName, 128) : null,
            WifiPassword = type == "wifi" ? Truncate(zone.WifiPassword, 256) : null,
            WifiSecurity = type == "wifi" && zone.WifiSecurity is "WEP" or "nopass" ? zone.WifiSecurity : type == "wifi" ? "WPA" : null,
            WifiHidden = type == "wifi" && zone.WifiHidden,
            WeatherIconStyle = type == "weather" && zone.WeatherIconStyle == "white" ? "white" : type == "weather" ? "color" : null,
            WeatherLayout = type == "weather" && zone.WeatherLayout is "icon-left" or "icon-right" or "compact"
                ? zone.WeatherLayout : type == "weather" ? "icon-top" : null,
            WeatherIconSize = Math.Clamp(zone.WeatherIconSize, 16, 220),
            WeatherTitleSize = Math.Clamp(zone.WeatherTitleSize, 8, 120),
            WeatherTemperatureSize = Math.Clamp(zone.WeatherTemperatureSize, 12, 220),
            WeatherDetailsSize = Math.Clamp(zone.WeatherDetailsSize, 8, 100),
            ClockShowPeriod = type != "clock" || zone.ClockShowPeriod,
            ClockShowWeekday = type != "clock" || zone.ClockShowWeekday,
            ClockShowYear = type != "clock" || zone.ClockShowYear,
            CalendarMaxItems = type == "calendar" ? Math.Clamp(zone.CalendarMaxItems, 0, 20) : 0,
            CalendarFields = type == "calendar" ? NormalizeCalendarFields(zone.CalendarFields) : null,
            AudienceSessionId = type == "audience" ? zone.AudienceSessionId : null,
            AudienceCode = type == "audience" ? NormalizeAudienceCode(zone.AudienceCode) : null,
            AudienceShowResults = type == "audience" && zone.AudienceShowResults,
            AudienceResultDelaySeconds = type == "audience" && zone.AudienceShowResults
                ? Math.Clamp(zone.AudienceResultDelaySeconds, 0, 3600)
                : 0
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
            if (raw.Type == "stream" && !TryStreamUrl(raw.SourceUrl, out _))
                return "Live stream zones require an HTTP, HTTPS, RTMP, RTMPS, or RTSP address without embedded credentials.";
            if (raw.Type == "presentation")
            {
                if (raw.StreamOverrideWhenLive && !TryStreamUrl(raw.SourceUrl, out _))
                    return "An RTMP override needs a valid RTMP, RTMPS, HTTP, HTTPS, or RTSP stream address.";
                if (!string.IsNullOrWhiteSpace(raw.SourceUrl) && !TryStreamUrl(raw.SourceUrl, out _))
                    return "Presentation live overrides require an HTTP, HTTPS, RTMP, RTMPS, or RTSP address without embedded credentials.";
                if (raw.StreamOverrideStartsAt is { } startsAt && raw.StreamOverrideEndsAt is { } endsAt && endsAt <= startsAt)
                    return "The RTMP override end time must be after its start time.";
            }
            if (raw.Type == "weather")
            {
                var provider = WeatherProviders.Contains(raw.WeatherProvider) ? raw.WeatherProvider
                    : string.IsNullOrWhiteSpace(raw.SourceUrl) ? "open-meteo" : "custom";
                var coordinatesValid = raw.WeatherLatitude is >= -90 and <= 90 &&
                    raw.WeatherLongitude is >= -180 and <= 180;
                var postalCodeValid = !string.IsNullOrWhiteSpace(raw.WeatherPostalCode) &&
                    raw.WeatherPostalCode.Trim().Length is >= 3 and <= 20;
                var locationStarted = raw.WeatherLatitude is not null || raw.WeatherLongitude is not null ||
                    !string.IsNullOrWhiteSpace(raw.WeatherPostalCode);
                if (provider is "open-meteo" or "nws" && locationStarted && !coordinatesValid && !postalCodeValid)
                    return "Preset weather elements require either a postal code or valid latitude and longitude.";
                if (provider == "nws" && coordinatesValid &&
                    (raw.WeatherLatitude is < 18 or > 72 || raw.WeatherLongitude is < -180 or > -60))
                    return "National Weather Service forecasts are available only for United States locations. Use Open-Meteo elsewhere.";
                if (provider == "custom" && string.IsNullOrWhiteSpace(raw.SourceUrl))
                    return "A custom weather provider requires an approved source URL.";
            }
            if (raw.Type == "audience" &&
                (raw.AudienceSessionId is null || NormalizeAudienceCode(raw.AudienceCode) is null))
                return "Audience Poll elements require an existing audience session.";
            if (!string.IsNullOrWhiteSpace(raw.SourceUrl))
            {
                if (raw.Type is "stream" or "presentation") continue;
                if (raw.Type == "weather" && Normalize(raw).WeatherProvider is "open-meteo" or "nws") continue;
                if (raw.Type is not ("calendar" or "weather" or "rss" or "webpage" or "customHtml"))
                    return "That signage element cannot use an online source.";
                if (!TryOrigin(raw.SourceUrl, out var origin)) return "Widget sources must be absolute HTTP or HTTPS addresses without embedded credentials.";
                if (!IsBuiltInPublicSource(raw) &&
                    !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
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

    public static bool IsBuiltInPublicSource(SignageZoneInput zone)
    {
        if (!Uri.TryCreate(zone.SourceUrl?.Trim(), UriKind.Absolute, out var uri) || uri.Scheme != "https")
            return false;
        return zone.Type == "calendar" &&
            uri.Host.Equals("calendar.google.com", StringComparison.OrdinalIgnoreCase) &&
            uri.AbsolutePath.StartsWith("/calendar/ical/", StringComparison.OrdinalIgnoreCase);
    }

    private static string? Truncate(string? value, int length)
    {
        var clean = value?.Trim();
        return string.IsNullOrEmpty(clean) ? null : clean[..Math.Min(length, clean.Length)];
    }

    private static string Color(string? value, string fallback) =>
        value is { Length: 7 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit) ? value : fallback;

    private static string? NormalizeAudienceCode(string? value)
    {
        var code = new string((value ?? "").Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
        return code.Length == 6 ? code : null;
    }

    private static string NormalizeWeatherFields(string? value)
    {
        var selected = (value ?? "icon,conditions,temperature,high,low,precipitation").Split(',',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(WeatherDisplayFields.Contains).Distinct(StringComparer.Ordinal).ToArray();
        return string.Join(',', selected.Length == 0 ? ["temperature"] : selected);
    }

    private static string NormalizeCalendarFields(string? value)
    {
        var allowed = new HashSet<string>(["date", "time", "title", "description", "location"],
            StringComparer.OrdinalIgnoreCase);
        var selected = (value ?? "date,time,title").Split(',',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(allowed.Contains).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        return string.Join(',', selected.Length == 0 ? ["date", "time", "title"] : selected);
    }

    private static string BuildWifiQr(string networkName, string? password, string? security, bool hidden)
    {
        static string Escape(string value) => value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace(";", "\\;", StringComparison.Ordinal).Replace(",", "\\,", StringComparison.Ordinal)
            .Replace(":", "\\:", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal);
        var mode = security is "WEP" or "nopass" ? security : "WPA";
        var secret = mode == "nopass" ? "" : Escape(password ?? "");
        return $"WIFI:T:{mode};S:{Escape(networkName.Trim())};P:{secret};H:{(hidden ? "true" : "false")};;";
    }
}
