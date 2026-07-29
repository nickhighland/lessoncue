using System.Text.Json;

namespace LessonCue.Server;

public static class SignageStudio
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public static readonly (string Key, string Name, int Width, int Height)[] Resolutions =
    [
        ("full-hd", "Full HD landscape", 1920, 1080),
        ("full-hd-portrait", "Full HD portrait", 1080, 1920),
        ("4k", "4K landscape", 3840, 2160),
        ("4k-portrait", "4K portrait", 2160, 3840),
        ("ultrawide", "Ultrawide", 2560, 1080),
        ("square", "Square", 1080, 1080)
    ];

    public static List<SignageContentPlaylistItemInput> ParseItems(string? json)
    {
        try { return JsonSerializer.Deserialize<List<SignageContentPlaylistItemInput>>(json ?? "[]", JsonOptions) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string StoreItems(IEnumerable<SignageContentPlaylistItemInput>? items) =>
        JsonSerializer.Serialize((items ?? []).Take(500).Select(NormalizeItem).ToArray(), JsonOptions);

    public static Dictionary<string, Guid> ParsePlaylistAssignments(string? json)
    {
        try
        {
            return (JsonSerializer.Deserialize<Dictionary<string, Guid>>(json ?? "{}", JsonOptions) ?? [])
                .Where(entry => !string.IsNullOrWhiteSpace(entry.Key) && entry.Value != Guid.Empty)
                .ToDictionary(entry => entry.Key.Trim(), entry => entry.Value, StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException) { return []; }
    }

    public static string StorePlaylistAssignments(IReadOnlyDictionary<string, Guid>? assignments) =>
        JsonSerializer.Serialize((assignments ?? new Dictionary<string, Guid>())
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Key) && entry.Value != Guid.Empty)
            .Take(100).ToDictionary(entry => entry.Key.Trim(), entry => entry.Value,
                StringComparer.OrdinalIgnoreCase), JsonOptions);

    public static bool ReferencesLayout(string? draftItemsJson, string? publishedItemsJson, Guid layoutId) =>
        ParseItems(draftItemsJson).Concat(ParseItems(publishedItemsJson))
            .Any(entry => entry.LayoutId == layoutId);

    public static SignageContentPlaylistItemInput NormalizeItem(SignageContentPlaylistItemInput item)
    {
        var kind = item.Kind is "layout" or "media" or "app" or "web" or "nested" or "tag" or "cloud" or "csv"
            ? item.Kind : "layout";
        return item with
        {
            Id = string.IsNullOrWhiteSpace(item.Id) ? Guid.NewGuid().ToString("N") : Truncate(item.Id, 64)!,
            Kind = kind,
            Title = Truncate(item.Title, 160),
            AppType = Truncate(item.AppType, 80),
            SourceUrl = Truncate(item.SourceUrl, 2000),
            DurationSeconds = Math.Clamp(item.DurationSeconds, 1, 86400),
            Transition = item.Transition is "fade" or "slide" or "zoom" ? item.Transition : "cut",
            TagsCsv = Truncate(item.TagsCsv, 2000),
            VolumePercent = Math.Clamp(item.VolumePercent, 0, 100),
            FadeInMs = Math.Clamp(item.FadeInMs, 0, 30000),
            FadeOutMs = Math.Clamp(item.FadeOutMs, 0, 30000),
            Fit = item.Fit is "cover" or "fill" ? item.Fit : "contain"
        };
    }

    public static string? ValidatePlaylist(SignageContentPlaylistInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "Playlist name is required.";
        if (input.Name.Trim().Length > 160) return "Playlist name must be 160 characters or fewer.";
        if ((input.Items?.Count ?? 0) > 500) return "A signage playlist supports at most 500 entries.";
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in input.Items ?? [])
        {
            var item = NormalizeItem(raw);
            if (!ids.Add(item.Id)) return "Every playlist entry must have a unique identifier.";
            if (item.Kind == "layout" && item.LayoutId is null) return "Every layout entry must select a layout.";
            if (item.Kind == "media" && item.MediaAssetId is null) return "Every media entry must select media.";
            if (item.Kind == "nested" && item.NestedPlaylistId is null) return "Every nested entry must select a playlist.";
            if (item.Kind == "web" && !WebSource(item.SourceUrl))
                return "web entries require an absolute HTTP or HTTPS address or a LessonCue audience-display path.";
            if (item.Kind is "cloud" or "csv" && !AbsoluteHttp(item.SourceUrl))
                return $"{item.Kind} entries require an absolute HTTP or HTTPS address.";
        }
        return null;
    }

    public static string? ValidateLayout(SignageLayoutResourceInput input, IReadOnlyCollection<string> allowedOrigins)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "Layout name is required.";
        if (input.Name.Trim().Length > 160) return "Layout name must be 160 characters or fewer.";
        if (input.CanvasWidth is < 240 or > 7680 || input.CanvasHeight is < 240 or > 7680)
            return "Canvas dimensions must be from 240 to 7,680 pixels.";
        if (input.SafeAreaPercent is < 0 or > 20) return "Safe area must be from 0 to 20 percent.";
        if ((input.ThumbnailDataUrl?.Length ?? 0) > 12000 ||
            !string.IsNullOrWhiteSpace(input.ThumbnailDataUrl) && !input.ThumbnailDataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            return "Layout thumbnail must be a small image data URL.";
        return SignageLayout.Validate(input.Zones, allowedOrigins);
    }

    public static object MapLayout(SignageLayoutResource item, bool includeDraft = true) => new
    {
        item.Id, item.Name, item.Folder, item.Description, item.IsTemplate, item.IsStarter, item.TemplateKey,
        item.BackgroundColor, item.CanvasWidth, item.CanvasHeight, item.Orientation, item.SafeAreaPercent,
        zones = SignageLayout.ParseZones(includeDraft ? item.DraftZonesJson : item.PublishedZonesJson),
        publishedZones = SignageLayout.ParseZones(item.PublishedZonesJson),
        item.BackgroundAudioAssetId, item.Version, item.PublishedVersion, item.PublishState, item.PublishedAt,
        item.ThumbnailDataUrl, item.CreatedAt, item.UpdatedAt
    };

    public static object MapPlaylist(SignageContentPlaylist item, bool includeDraft = true) => new
    {
        item.Id, item.Name, item.Folder, item.PlaybackMode, item.Synchronization,
        items = ParseItems(includeDraft ? item.DraftItemsJson : item.PublishedItemsJson),
        publishedItems = ParseItems(item.PublishedItemsJson),
        item.Version, item.PublishedVersion, item.PublishState, item.PublishedAt, item.CreatedAt, item.UpdatedAt
    };

    public static void ApplyLayout(SignageLayoutResource item, SignageLayoutResourceInput input)
    {
        item.Name = input.Name.Trim();
        item.Folder = Truncate(input.Folder, 160) ?? "";
        item.Description = Truncate(input.Description, 1000) ?? "";
        item.IsTemplate = input.IsTemplate;
        item.BackgroundColor = Color(input.BackgroundColor, "#25302d");
        item.CanvasWidth = Math.Clamp(input.CanvasWidth, 240, 7680);
        item.CanvasHeight = Math.Clamp(input.CanvasHeight, 240, 7680);
        item.Orientation = item.CanvasWidth == item.CanvasHeight ? "square" : item.CanvasWidth > item.CanvasHeight ? "landscape" : "portrait";
        item.SafeAreaPercent = Math.Clamp(input.SafeAreaPercent, 0, 20);
        item.DraftZonesJson = SignageLayout.StoreZones(input.Zones);
        item.BackgroundAudioAssetId = input.BackgroundAudioAssetId;
        item.ThumbnailDataUrl = input.ThumbnailDataUrl?.Trim() ?? "";
        item.Version++;
        item.PublishState = item.PublishedVersion == 0 ? "draft" : "changes";
        item.UpdatedAt = DateTimeOffset.UtcNow;
    }

    public static void Publish(SignageLayoutResource item)
    {
        item.PublishedZonesJson = item.DraftZonesJson;
        item.PublishedVersion = item.Version;
        item.PublishState = "published";
        item.PublishedAt = DateTimeOffset.UtcNow;
        item.UpdatedAt = DateTimeOffset.UtcNow;
    }

    public static void ApplyPlaylist(SignageContentPlaylist item, SignageContentPlaylistInput input)
    {
        item.Name = input.Name.Trim();
        item.Folder = Truncate(input.Folder, 160) ?? "";
        item.PlaybackMode = input.PlaybackMode is "random" or "tag" or "interactive" ? input.PlaybackMode : "ordered";
        item.Synchronization = input.Synchronization is "region" or "global" ? input.Synchronization : "screen";
        item.DraftItemsJson = StoreItems(input.Items);
        item.Version++;
        item.PublishState = item.PublishedVersion == 0 ? "draft" : "changes";
        item.UpdatedAt = DateTimeOffset.UtcNow;
    }

    public static void Publish(SignageContentPlaylist item)
    {
        item.PublishedItemsJson = item.DraftItemsJson;
        item.PublishedVersion = item.Version;
        item.PublishState = "published";
        item.PublishedAt = DateTimeOffset.UtcNow;
        item.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static bool AbsoluteHttp(string? value) =>
        Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" &&
        string.IsNullOrWhiteSpace(uri.UserInfo);
    private static bool WebSource(string? value)
    {
        var clean = value?.Trim() ?? "";
        if (AbsoluteHttp(clean)) return true;
        const string prefix = "/audience-display/";
        if (!clean.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var suffix = clean[prefix.Length..];
        var queryAt = suffix.IndexOf('?');
        var code = queryAt < 0 ? suffix : suffix[..queryAt];
        if (code.Length != 6 || !code.All(char.IsAsciiLetterOrDigit)) return false;
        if (queryAt < 0) return true;
        var query = suffix[(queryAt + 1)..];
        return query.Split('&', StringSplitOptions.RemoveEmptyEntries).All(part =>
        {
            var pair = part.Split('=', 2);
            if (pair.Length != 2) return false;
            return pair[0] switch
            {
                "results" => pair[1] is "0" or "1",
                "delay" => int.TryParse(pair[1], out var delay) && delay is >= 0 and <= 3600,
                _ => false
            };
        });
    }
    private static string? Truncate(string? value, int length)
    {
        var clean = value?.Trim();
        return string.IsNullOrEmpty(clean) ? null : clean[..Math.Min(length, clean.Length)];
    }
    private static string Color(string? value, string fallback) =>
        value is { Length: 7 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit) ? value : fallback;
}
