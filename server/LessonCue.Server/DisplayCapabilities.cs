namespace LessonCue.Server;

public sealed record DisplayCapability(
    string Id,
    string Label,
    bool Supported,
    string Fallback,
    string? Notes = null);

public sealed record DisplayCapabilityContract(
    string Platform,
    string DisplayName,
    int ContractVersion,
    string MinimumClientVersion,
    DisplayCapability[] Capabilities,
    string[] Limitations);

public sealed record DisplayCompatibilityIssue(
    string Code,
    string Severity,
    string ContentKind,
    string ContentId,
    string Title,
    string Message,
    string Fallback);

public sealed record DisplayRenderDecision(string Support, string? Message)
{
    public bool CanRender => Support == "supported";
}

public static class DisplayCapabilities
{
    public const int ContractVersion = 1;
    public const string Fallback =
        "LessonCue will show an explanatory title card and keep remote navigation available.";

    private static readonly string[] LessonCapabilities =
    [
        "lesson.image", "lesson.audio", "lesson.video", "lesson.live-stream",
        "lesson.youtube", "lesson.webpage", "lesson.audience-results",
        "playback.trim", "playback.fade-through-black", "playback.transform",
        "playback.repeat", "remote.dpad"
    ];

    private static readonly string[] SignageZoneCapabilities =
        SignageLayout.ZoneTypes.Select(value => $"signage.{value}").ToArray();

    public static DisplayCapabilityContract For(string? platform)
    {
        var normalized = Normalize(platform);
        var browser = normalized == "web-player";
        var android = normalized == "android-tv";
        var known = browser || android;
        var capabilities = new List<DisplayCapability>();

        foreach (var id in LessonCapabilities)
        {
            var supported = known;
            capabilities.Add(new DisplayCapability(id, Label(id), supported, Fallback,
                supported ? null : "Pair this screen again with a supported LessonCue display client."));
        }

        foreach (var id in SignageZoneCapabilities)
        {
            var zoneType = id["signage.".Length..];
            var supported = browser || android && zoneType != "audience";
            var notes = android && zoneType is "calendar" or "weather" or "rss"
                ? "Android renders the server-validated, cached data snapshot."
                : android && zoneType == "audience"
                    ? "Interactive audience-result signage currently requires the browser display."
                    : null;
            capabilities.Add(new DisplayCapability(id, Label(id), supported, Fallback, notes));
        }

        capabilities.Add(new DisplayCapability("signage.audience-live-results",
            "Live audience-result graphics", browser, Fallback,
            browser ? null : "Use the browser display for live audience-result signage."));

        return new DisplayCapabilityContract(
            normalized,
            browser ? "Browser display" : android ? "Android TV / Google TV / Fire TV" : "Unknown display",
            ContractVersion,
            browser ? "0.40.6" : android ? "0.40.6" : "unsupported",
            capabilities.ToArray(),
            browser
                ? ["Playback of third-party webpages and videos still depends on their embedding and network policies."]
                : android
                    ? [
                        "Audience-result signage uses a safe title-card fallback; use a browser display for the live result graphic.",
                        "Webpage and third-party video playback still depends on network access and the provider's embedding policy."
                    ]
                    : ["This client has not declared a LessonCue display capability contract."]);
    }

    public static string Normalize(string? platform) => platform?.Trim().ToLowerInvariant() switch
    {
        "web" or "browser" or "web-player" => "web-player",
        "android" or "android-tv" or "google-tv" or "fire-tv" => "android-tv",
        _ => "unknown"
    };

    public static bool Supports(string? platform, string capabilityId) =>
        For(platform).Capabilities.FirstOrDefault(value => value.Id == capabilityId)?.Supported == true;

    public static DisplayRenderDecision LessonDecision(string? platform, PlaylistItem item)
    {
        var media = item.MediaAsset;
        if (media is null)
            return Unsupported($"“{item.Title}” has no media attached.");
        if (media.DeletedAt is not null)
            return Unsupported($"“{item.Title}” uses media that is in the recycling bin.");
        if (media.ProcessingStatus == "failed" || media.CompatibilityStatus == "failed")
            return Unsupported($"“{item.Title}” could not be prepared for reliable playback.");
        if (media.SourceKind != "link" && string.IsNullOrWhiteSpace(media.RelativePath))
            return Unsupported($"The media file for “{item.Title}” is missing.");

        var capability = media.SourceKind == "link"
            ? media.LinkKind switch
            {
                "youtube" or "embedded" => "lesson.youtube",
                "webpage" or "external" => "lesson.webpage",
                "direct" => MediaCapability(media.ContentType, item.Type),
                _ => ""
            }
            : MediaCapability(media.ContentType, item.Type);
        if (string.IsNullOrWhiteSpace(capability))
            return Unsupported($"“{item.Title}” uses an unrecognized media or link type.");
        return Supports(platform, capability)
            ? new DisplayRenderDecision("supported", null)
            : Unsupported($"“{item.Title}” is not supported by this display client.");
    }

    public static DisplayRenderDecision ZoneDecision(string? platform, SignageZoneInput zone)
    {
        if (!SignageLayout.ZoneTypes.Contains(zone.Type))
            return Unsupported($"The “{zone.Title ?? zone.Id}” element uses an unknown signage type.");
        return Supports(platform, $"signage.{zone.Type}")
            ? new DisplayRenderDecision("supported", null)
            : Unsupported($"The “{zone.Title ?? zone.Id}” {zone.Type} element is browser-only on this release.");
    }

    public static DisplayRenderDecision ZoneDecision(
        string? platform, SignageZoneInput zone, MediaAsset? media)
    {
        var platformDecision = ZoneDecision(platform, zone);
        if (!platformDecision.CanRender) return platformDecision;
        if (zone.Type == "media" && media is null)
            return Unsupported($"The media for “{zone.Title ?? zone.Id}” is missing.");
        if (media is not null &&
            (media.ProcessingStatus == "failed" || media.CompatibilityStatus == "failed" ||
             media.SourceKind != "link" && string.IsNullOrWhiteSpace(media.RelativePath)))
            return Unsupported($"The media for “{zone.Title ?? zone.Id}” could not be prepared for reliable playback.");
        return platformDecision;
    }

    public static List<DisplayCompatibilityIssue> AssessLessons(string? platform, IEnumerable<Lesson> lessons)
    {
        var issues = new List<DisplayCompatibilityIssue>();
        foreach (var lesson in lessons)
        foreach (var item in lesson.Items.OrderBy(value => value.Position))
        {
            var decision = LessonDecision(platform, item);
            if (decision.CanRender) continue;
            issues.Add(new DisplayCompatibilityIssue(
                "unsupported-lesson-cue", "warning", "lesson", item.Id.ToString(), item.Title,
                decision.Message ?? "This cue is not supported.", Fallback));
        }
        return issues;
    }

    public static List<DisplayCompatibilityIssue> AssessZones(string? platform, IEnumerable<SignageZoneInput> zones,
        IReadOnlyDictionary<Guid, MediaAsset>? media = null)
    {
        var issues = new List<DisplayCompatibilityIssue>();
        foreach (var zone in zones)
        {
            var asset = zone.MediaAssetId is { } mediaId && media is not null
                ? media.GetValueOrDefault(mediaId) : null;
            var decision = media is null ? ZoneDecision(platform, zone) : ZoneDecision(platform, zone, asset);
            if (decision.CanRender) continue;
            issues.Add(new DisplayCompatibilityIssue(
                "unsupported-signage-element", "warning", "signage", zone.Id, zone.Title ?? zone.Id,
                decision.Message ?? "This signage element is not supported.", Fallback));
        }
        return issues;
    }

    private static string MediaCapability(string? contentType, string itemType)
    {
        if (contentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) == true || itemType == "image")
            return "lesson.image";
        if (contentType?.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) == true || itemType == "audio")
            return "lesson.audio";
        if (contentType?.StartsWith("video/", StringComparison.OrdinalIgnoreCase) == true || itemType == "video")
            return "lesson.video";
        if (itemType is "liveStream" or "stream") return "lesson.live-stream";
        return "";
    }

    private static DisplayRenderDecision Unsupported(string message) => new("fallback", message);

    private static string Label(string id) => id switch
    {
        "lesson.image" => "Lesson images",
        "lesson.audio" => "Lesson audio",
        "lesson.video" => "Lesson video",
        "lesson.live-stream" => "Lesson live streams",
        "lesson.youtube" => "YouTube and embedded video",
        "lesson.webpage" => "Webpages",
        "lesson.audience-results" => "Audience results in lessons",
        "playback.trim" => "Trim points",
        "playback.fade-through-black" => "Audio and visual fades through black",
        "playback.transform" => "Crop, rotate, and fit",
        "playback.repeat" => "Repeat and end behavior",
        "remote.dpad" => "D-pad and media remote controls",
        _ when id.StartsWith("signage.", StringComparison.Ordinal) =>
            $"Signage {id["signage.".Length..].Replace('-', ' ')}",
        _ => id
    };
}
