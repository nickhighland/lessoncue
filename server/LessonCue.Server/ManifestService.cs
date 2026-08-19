using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace LessonCue.Server;

public sealed class ManifestService(LessonCueDb db)
{
    public async Task<object?> BuildAsync(Guid screenId, CancellationToken cancellationToken, DateTimeOffset? generatedAt = null)
    {
        var screen = await db.Screens.AsNoTracking().SingleOrDefaultAsync(x => x.Id == screenId, cancellationToken);
        if (screen is null || screen.Revoked) return null;

        var now = generatedAt ?? DateTimeOffset.UtcNow;
        var organization = await db.Organizations.AsNoTracking()
            .OrderBy(item => item.Id).Select(x => new { x.TimeZone }).FirstOrDefaultAsync(cancellationToken);
        var timeZone = organization?.TimeZone ?? "UTC";
        var lessonsQuery = db.Lessons.AsNoTracking().Include(x => x.Class).Include(x => x.Items)
            .ThenInclude(x => x.MediaAsset).ThenInclude(x => x!.TranscodeVariants)
            .Include(x => x.Items).ThenInclude(x => x.ActivityDefinition)
            .AsSplitQuery().AsQueryable();
        if (screen.SignageOnly)
            lessonsQuery = lessonsQuery.Where(_ => false);
        else if (screen.AssignedClassId is { } classId)
            lessonsQuery = lessonsQuery.Where(x => x.ClassId == classId);

        var lessons = (await lessonsQuery.Where(x => !x.Archived).OrderBy(x => x.Date).ToListAsync(cancellationToken))
            .ToList();
        var signage = await db.SignagePlaylists.AsNoTracking().Include(x => x.MediaAsset).ThenInclude(x => x!.TranscodeVariants)
            .Where(x => x.Enabled && x.Mode == "sign").ToListAsync(cancellationToken);
        signage = screen.AssignedSignageId is { } assignedSignageId
            ? signage.Where(item => item.Id == assignedSignageId).ToList()
            : [];
        var signageLayouts = (await db.SignageLayouts.AsNoTracking().Where(x => x.PublishedVersion > 0).ToListAsync(cancellationToken))
            .ToDictionary(x => x.Id);
        var signageContentPlaylists = (await db.SignageContentPlaylists.AsNoTracking().Where(x => x.PublishedVersion > 0)
            .ToListAsync(cancellationToken)).ToDictionary(x => x.Id);
        var layoutZones = signageLayouts.Values.SelectMany(item => SignageLayout.ParseZones(item.PublishedZonesJson));
        var scheduleZones = signage.SelectMany(item => EffectiveZones(item, signageLayouts));
        var contentItems = signageContentPlaylists.Values.SelectMany(item => SignageStudio.ParseItems(item.PublishedItemsJson)).ToArray();
        var zoneMediaIds = scheduleZones.Concat(layoutZones)
            .Where(zone => zone.MediaAssetId is not null).Select(zone => zone.MediaAssetId!.Value).Distinct().ToArray();
        var contentMediaIds = contentItems.Where(item => item.MediaAssetId is not null).Select(item => item.MediaAssetId!.Value);
        var backgroundAudioIds = signageLayouts.Values.Where(item => item.BackgroundAudioAssetId is not null)
            .Select(item => item.BackgroundAudioAssetId!.Value);
        zoneMediaIds = zoneMediaIds.Concat(contentMediaIds).Concat(backgroundAudioIds).Distinct().ToArray();
        var zoneMedia = await db.MediaAssets.AsNoTracking().Include(media => media.TranscodeVariants)
            .Where(media => zoneMediaIds.Contains(media.Id)).ToDictionaryAsync(media => media.Id, cancellationToken);
        if (contentItems.Any(item => item.Kind == "tag"))
        {
            var taggedMedia = await db.MediaAssets.AsNoTracking().Include(media => media.TranscodeVariants).ToListAsync(cancellationToken);
            foreach (var media in taggedMedia) zoneMedia.TryAdd(media.Id, media);
        }
        var targetedSignage = signage
            .Select(item => new { Item = item, State = SignageSchedule.Evaluate(item, now, timeZone) })
            .Where(entry => (entry.State.Active || SignageSchedule.CanOccurAgain(entry.Item, now, timeZone))
                && SignageSchedule.TargetsScreen(entry.Item, screen))
            .OrderBy(entry => ModeRank(entry.Item.Mode))
            .ThenByDescending(entry => entry.Item.Priority)
            .ThenByDescending(entry => entry.Item.UpdatedAt)
            .ToArray();
        var matchingSignage = targetedSignage.Where(entry => entry.State.Active).ToArray();
        var compatibilityWarnings = DisplayCapabilities.AssessLessons(screen.Platform, lessons);
        compatibilityWarnings.AddRange(targetedSignage.SelectMany(entry =>
            DisplayCapabilities.AssessZones(screen.Platform, EffectiveZones(entry.Item, signageLayouts), zoneMedia)));
        var version = ManifestVersion(lessons, targetedSignage.Select(entry => entry.Item),
            matchingSignage.Select(entry => entry.Item.Id));
        return new
        {
            apiVersion = 1,
            capabilityContractVersion = DisplayCapabilities.ContractVersion,
            manifestVersion = version,
            generatedAt = now,
            displayCapabilities = DisplayCapabilities.For(screen.Platform),
            compatibilityWarnings,
            screen = new { id = screen.Id, screen.Name, screen.VolunteerMode, screen.Site, tags = SplitTags(screen.TagsCsv),
                orientation = screen.SignageOrientation, width = screen.SignageWidth, height = screen.SignageHeight,
                screen.SignageOnly, screen.PermanentPairing },
            signage = matchingSignage.Select(entry => MapSignage(entry.Item, entry.State, screen, zoneMedia,
                signageLayouts, signageContentPlaylists)).ToArray(),
            signageSchedule = targetedSignage.Select(entry => MapSignage(entry.Item, entry.State, screen, zoneMedia,
                signageLayouts, signageContentPlaylists)).ToArray(),
            playlists = lessons.Select(x => BuildPlaylist(x, screen)).ToArray()
        };
    }

    private static object BuildPlaylist(Lesson lesson, Screen screen)
    {
        var ordered = lesson.Items.OrderBy(x => x.Position).ToList();
        var countdownItem = ordered.FirstOrDefault(x => x.Id == lesson.CountdownItemId || x.Role == "countdown");
        var countdownDuration = EffectiveDuration(countdownItem);
        var countdownStart = lesson.DesignatedStartAt is { } start && countdownDuration is { } duration
            ? start.AddMilliseconds(-duration)
            : (DateTimeOffset?)null;
        var preRollItems = ordered.Where(x => x.Role == "preRoll")
            .Select(x => MapItem(x, screen, lesson.Id, lesson.VolumePercent, lesson.Muted)).ToArray();
        var postLessonItems = ordered.Where(x => x.Role == "postLesson")
            .Select(x => MapItem(x, screen, lesson.Id, lesson.VolumePercent, lesson.Muted)).ToArray();

        return new
        {
            playlistId = lesson.Id,
            title = string.IsNullOrWhiteSpace(lesson.Title) ? lesson.Class?.Name ?? "Lesson" : lesson.Title,
            version = lesson.Version,
            volumePercent = lesson.VolumePercent,
            muted = lesson.Muted,
            lessonDate = lesson.Date,
            designatedStartAt = UtcTimestamp(lesson.DesignatedStartAt),
            preRollStartsAt = UtcTimestamp(lesson.PreRollStartsAt),
            availableFrom = UtcTimestamp(lesson.AvailableFrom),
            expiresAt = UtcTimestamp(lesson.ExpiresAt),
            countdown = countdownItem is null || countdownDuration is null ? null : new
            {
                enabled = true,
                itemId = countdownItem.Id,
                durationMs = countdownDuration.Value,
                startAt = UtcTimestamp(countdownStart),
                item = MapItem(countdownItem, screen, lesson.Id, lesson.VolumePercent, lesson.Muted)
            },
            preRoll = !lesson.PreRollEnabled || preRollItems.Length == 0 ? null : new
            {
                enabled = true,
                loop = true,
                items = preRollItems
            },
            postLesson = postLessonItems.Length == 0 ? null : new
            {
                enabled = true,
                loop = true,
                items = postLessonItems
            },
            items = ordered.Where(x => x.Role == "lesson")
                .Select(x => MapItem(x, screen, lesson.Id, lesson.VolumePercent, lesson.Muted)).ToArray()
        };
    }

    public static DateTimeOffset? CountdownStart(DateTimeOffset? designatedStartAt, long? durationMs) =>
        designatedStartAt is { } start && durationMs is > 0 ? start.AddMilliseconds(-durationMs.Value) : null;

    private static DateTime? UtcTimestamp(DateTimeOffset? value) => value?.UtcDateTime;

    private static long? EffectiveDuration(PlaylistItem? item) => item is null
        ? null
        : item.EndMs is { } end ? Math.Max(0, end - item.StartMs) : item.DurationMs ?? item.MediaAsset?.DurationMs;

    private static object MapItem(PlaylistItem item, Screen screen, Guid lessonId, int lessonVolumePercent, bool lessonMuted)
    {
        var media = item.MediaAsset;
        var render = DisplayCapabilities.LessonDecision(screen.Platform, item);
        var compatible = media?.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath);
        var requestedProfile = media?.VideoCodec is not null ? AdaptiveTranscodeProfiles.SelectForScreen(screen, media) : null;
        var variant = requestedProfile is null ? null : media?.TranscodeVariants.FirstOrDefault(x =>
            x.Profile == requestedProfile && x.Status == "ready" && x.SourceVersion == media.Version && !string.IsNullOrWhiteSpace(x.RelativePath));
        var useVariant = variant is not null;
        var useNative = requestedProfile == "native";
        var selectedProfile = useVariant ? variant!.Profile : useNative ? "native" : compatible ? AdaptiveTranscodeProfiles.Universal1080 : media?.CompatibilityStatus == "native" ? "native" : "original";
        return new
        {
            itemId = item.Id,
            mediaId = item.MediaAssetId,
            item.Type,
            item.Title,
            renderSupport = render.Support,
            fallbackMessage = render.Message,
            downloadUrl = !render.CanRender ? null :
                media is { SourceKind: "link", LinkKind: "direct" } linked ? linked.SourceUrl :
                useVariant ? $"/api/v1/media/{media!.Id}/transcodes/{variant!.Profile}" :
                useNative ? $"/api/v1/media/{media!.Id}/file" :
                item.MediaAssetId is { } mediaId && media?.SourceKind != "link" && !string.IsNullOrWhiteSpace(media?.RelativePath)
                    ? $"/api/v1/media/{mediaId}/playback" : null,
            playbackUrl = render.CanRender && media is { SourceKind: "link" } online
                ? YouTubeMedia.EmbedUrl(online.SourceUrl) ?? online.SourceUrl
                : (render.CanRender && item.ActivityDefinitionId is { } definitionId
                    ? $"/activity-display?definitionId={definitionId}&lessonId={lessonId}&lessonItemId={item.Id}"
                    : null),
            sha256 = useVariant ? variant!.Sha256 : compatible && !useNative ? media?.CompatibilitySha256 : media?.Sha256,
            sizeBytes = useVariant ? variant!.SizeBytes : compatible && !useNative ? media?.CompatibilitySizeBytes : media?.SizeBytes,
            contentType = useVariant || compatible && !useNative ? "video/mp4" : media?.ContentType,
            fileExtension = useVariant || compatible && !useNative ? "mp4" : Path.GetExtension(media?.RelativePath ?? "").TrimStart('.').ToLowerInvariant(),
            compatibilityStatus = media?.CompatibilityStatus,
            requestedProfile,
            selectedProfile,
            transcodeStatus = requestedProfile is not null && AdaptiveTranscodeProfiles.All.ContainsKey(requestedProfile)
                ? media?.TranscodeVariants.FirstOrDefault(x => x.Profile == requestedProfile)?.Status ?? "not-generated" : "not-needed",
            durationMs = item.DurationMs ?? media?.DurationMs,
            item.StartMs,
            item.EndMs,
            volumePercent = lessonMuted || item.Muted ? 0 : Math.Clamp(
                (int)Math.Round(item.VolumePercent * lessonVolumePercent / 100d), 0, 150),
            configuredVolumePercent = item.VolumePercent,
            item.Muted,
            item.ImageDurationSeconds,
            item.EstimatedDurationSeconds,
            item.EndBehavior,
            item.AllowSkip,
            offlineEligible = media?.OfflineEligible ?? false,
            sourceKind = media?.SourceKind,
            sourceUrl = media?.SourceUrl,
            linkKind = media?.LinkKind ?? (item.ActivityDefinitionId.HasValue || item.Type == "activity" ? "activity" : null),
            item.Notes,
            item.FadeInMs,
            item.FadeOutMs,
            item.NormalizeAudio,
            item.FitMode,
            item.RotationDegrees,
            item.CropLeftPercent,
            item.CropTopPercent,
            item.CropRightPercent,
            item.CropBottomPercent,
            item.PlaybackRatePercent,
            item.RepeatCount,
            item.BackgroundColor,
            item.TransitionStyle,
            item.TransitionDurationMs,
            item.FlexibleTime,
            activityDefinitionId = item.ActivityDefinitionId,
            activity = item.ActivityDefinitionId.HasValue ? new
            {
                definitionId = item.ActivityDefinitionId.Value,
                activityType = item.ActivityDefinition?.Type ?? item.Type,
                definitionVersion = item.ActivityDefinition?.Version ?? 1,
                name = item.ActivityDefinition?.Name ?? item.Title,
                requiresNetwork = true
            } : null,
            cuePoints = ParseCuePoints(item.CuePointsJson)
        };
    }

    private static (object? Manifest, string? Url) MapSignageMedia(MediaAsset? media, string itemId, string title, Screen screen)
    {
        if (media is null) return (null, null);
        var compatible = media.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath);
        var requestedProfile = media.VideoCodec is not null ? AdaptiveTranscodeProfiles.SelectForScreen(screen, media) : null;
        var variant = requestedProfile is null ? null : media.TranscodeVariants.FirstOrDefault(x =>
            x.Profile == requestedProfile && x.Status == "ready" && x.SourceVersion == media.Version && !string.IsNullOrWhiteSpace(x.RelativePath));
        var useVariant = variant is not null;
        var useNative = requestedProfile == "native";
        var url = useVariant ? $"/api/v1/media/{media.Id}/transcodes/{variant!.Profile}" :
            useNative ? $"/api/v1/media/{media.Id}/file" :
            compatible ? $"/api/v1/media/{media.Id}/playback" :
            !string.IsNullOrWhiteSpace(media.RelativePath) ? $"/api/v1/media/{media.Id}/file" : null;
        var contentType = useVariant || compatible && !useNative ? "video/mp4" : media.ContentType;
        var extension = useVariant || compatible && !useNative
            ? "mp4" : Path.GetExtension(media.RelativePath ?? media.FileName).TrimStart('.').ToLowerInvariant();
        var type = contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase) ? "video"
            : contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ? "audio" : "image";
        var sha256 = useVariant ? variant!.Sha256 : compatible && !useNative ? media.CompatibilitySha256 : media.Sha256;
        var sizeBytes = useVariant ? variant!.SizeBytes : compatible && !useNative ? media.CompatibilitySizeBytes : media.SizeBytes;
        var cacheVersion = string.IsNullOrWhiteSpace(sha256) ? media.Version.ToString() : sha256[..Math.Min(12, sha256.Length)];
        var versionedUrl = url is null ? null : $"{url}?v={Uri.EscapeDataString(cacheVersion)}";
        var manifest = new
        {
            itemId,
            mediaId = media.Id,
            title,
            type,
            downloadUrl = versionedUrl,
            contentType,
            fileExtension = extension,
            sha256,
            sizeBytes,
            durationMs = media.DurationMs,
            startMs = 0,
            endMs = (long?)null,
            volumePercent = 100,
            imageDurationSeconds = (int?)null,
            endBehavior = "loop",
            allowSkip = false,
            offlineEligible = media.OfflineEligible
        };
        return (manifest, versionedUrl);
    }

    private static object MapSignage(SignagePlaylist item, SignageScheduleState state, Screen screen,
        IReadOnlyDictionary<Guid, MediaAsset> zoneMedia, IReadOnlyDictionary<Guid, SignageLayoutResource> layouts,
        IReadOnlyDictionary<Guid, SignageContentPlaylist> contentPlaylists)
    {
        var signageMedia = MapSignageMedia(item.MediaAsset, $"signage-{item.Id}", item.Name, screen);
        var cache = SignageLayout.ParseCache(item.WidgetCacheJson).ToDictionary(entry => entry.ZoneId, StringComparer.OrdinalIgnoreCase);
        var playlistAssignments = SignageStudio.ParsePlaylistAssignments(item.ZonePlaylistAssignmentsJson);
        layouts.TryGetValue(item.LayoutId ?? Guid.Empty, out var layout);
        contentPlaylists.TryGetValue(item.ContentPlaylistId ?? Guid.Empty, out var contentPlaylist);
        var effectiveZones = EffectiveZones(item, layouts);
        var backgroundAudio = layout?.BackgroundAudioAssetId is { } audioId && zoneMedia.TryGetValue(audioId, out var audio)
            ? MapSignageMedia(audio, $"signage-{item.Id}-background-audio", $"{item.Name} background audio", screen).Manifest : null;
        var zones = effectiveZones.Select(zone =>
        {
            var media = zone.MediaAssetId is { } mediaId && zoneMedia.TryGetValue(mediaId, out var found) ? found : null;
            var render = DisplayCapabilities.ZoneDecision(screen.Platform, zone, media);
            var mappedMedia = MapSignageMedia(media, $"signage-{item.Id}-zone-{zone.Id}", zone.Title ?? item.Name, screen);
            cache.TryGetValue(zone.Id, out var cached);
            var assignedPlaylistId = playlistAssignments.GetValueOrDefault(zone.Id,
                zone.ContentPlaylistId ?? Guid.Empty);
            contentPlaylists.TryGetValue(assignedPlaylistId, out var zonePlaylist);
            var zoneItems = zonePlaylist is null ? [] : ResolveContentItems(zonePlaylist, contentPlaylists,
                zoneMedia.Values, 0).ToArray();
            if (zonePlaylist?.PlaybackMode == "random")
                zoneItems = zoneItems.OrderBy(entry => HashCode.Combine(entry.Id,
                    DateOnly.FromDateTime(DateTime.UtcNow).DayNumber)).ToArray();
            return new
            {
                zone.Id, zone.Type, zone.Title, zone.Content,
                renderSupport = render.Support,
                fallbackMessage = render.Message,
                sourceUrl = zone.Type is "stream" or "presentation" ? null : zone.SourceUrl,
                zone.X, zone.Y, zone.Width, zone.Height, zone.BackgroundColor, zone.TextColor, zone.AccentColor,
                zone.RefreshMinutes, zone.Rotation, zone.ZIndex, zone.Opacity, zone.Fit,
                zone.Locked, zone.Hidden, zone.FlipX, zone.FlipY,
                zone.GroupId, zone.LockMode, zone.RichTextJson, zone.FontFamily, zone.FontSize, zone.FontScalePercent, zone.FontWeight,
                zone.Italic, zone.Underline, zone.LineHeightPercent, zone.TextAlign, zone.Shape,
                zone.StrokeColor, zone.StrokeWidth, zone.CornerRadius, zone.IconName, zone.QrValue,
                zone.QrLabelTop, zone.QrLabelBottom, zone.QrLabelLeft, zone.QrLabelRight, zone.QrPlacement,
                zone.QrSizePercent,
                zone.TickerSpeed, zone.CounterTargetAt, zone.CounterRepeatWeekly,
                zone.ClockDisplay, zone.ClockTimeFormat, zone.ClockDateFormat, zone.ClockOrder,
                zone.ClockTimeFontSize, zone.ClockDateFontSize,
                zone.WeatherProvider, zone.WeatherLocation, zone.WeatherLatitude, zone.WeatherLongitude,
                zone.WeatherPostalCode, zone.WeatherUnits, zone.WeatherFields,
                contentPlaylistId = assignedPlaylistId == Guid.Empty ? (Guid?)null : assignedPlaylistId,
                zone.StreamOverrideWhenLive, zone.ContentPadding, zone.ContentScale, zone.VerticalAlign,
                zone.StreamOverrideStartsAt, zone.StreamOverrideEndsAt,
                zone.MediaScale, zone.MediaOffsetX, zone.MediaOffsetY, zone.MediaAllowOverflow,
                zone.WeatherIconStyle, zone.WeatherLayout, zone.WeatherIconSize, zone.WeatherTitleSize,
                zone.WeatherTemperatureSize, zone.WeatherDetailsSize,
                zone.ClockShowPeriod, zone.ClockShowWeekday, zone.ClockShowYear,
                zone.CalendarMaxItems, zone.CalendarFields,
                zone.AudienceSessionId, zone.AudienceCode, zone.AudienceShowResults,
                zone.AudienceResultDelaySeconds,
                streamUrl = (zone.Type is "stream" or "presentation") && !string.IsNullOrWhiteSpace(zone.SourceUrl)
                    ? $"/api/v1/signage/{item.Id}/zones/{Uri.EscapeDataString(zone.Id)}/stream/index.m3u8"
                    : null,
                htmlUrl = zone.Type == "customHtml" && !string.IsNullOrWhiteSpace(zone.Content)
                    ? $"/api/v1/signage/{item.Id}/zones/{Uri.EscapeDataString(zone.Id)}/html"
                    : null,
                contentPlaylist = zonePlaylist is null ? null : new
                {
                    zonePlaylist.Id, zonePlaylist.Name, zonePlaylist.PlaybackMode, zonePlaylist.Synchronization,
                    version = zonePlaylist.PublishedVersion,
                    items = zoneItems.Select(entry => MapContentPlaylistItem(entry, item, screen, zoneMedia, layouts, contentPlaylists)).ToArray()
                },
                media = mappedMedia.Manifest, cached
            };
        }).ToArray();
        var resolvedContentItems = contentPlaylist is null ? [] : ResolveContentItems(contentPlaylist, contentPlaylists, zoneMedia.Values, 0).ToArray();
        if (contentPlaylist?.PlaybackMode == "random")
            resolvedContentItems = resolvedContentItems.OrderBy(entry => HashCode.Combine(entry.Id,
                DateOnly.FromDateTime(DateTime.UtcNow).DayNumber)).ToArray();
        var playlistItems = resolvedContentItems
            .Select(entry => MapContentPlaylistItem(entry, item, screen, zoneMedia, layouts, contentPlaylists)).ToArray();
        var referencedMedia = new[] { item.MediaAsset }.Concat(effectiveZones
            .Select(zone => zone.MediaAssetId is { } id && zoneMedia.TryGetValue(id, out var media) ? media : null))
            .Concat(resolvedContentItems
                .Select(entry => entry.MediaAssetId is { } id && zoneMedia.TryGetValue(id, out var media) ? media : null)).ToArray();
        var readiness = referencedMedia.Select(SignageReadiness).OrderBy(value => value switch
        {
            "failed" => 0, "missing" => 1, "preparing" => 2, _ => 3
        }).FirstOrDefault() ?? "ready";
        return new
        {
            item.Id,
            item.Name,
            item.Version,
            item.PublishedVersion,
            item.PublishState,
            item.Mode,
            item.Priority,
            item.Message,
            item.BackgroundColor,
            item.TextColor,
            item.MediaAssetId,
            mediaUrl = signageMedia.Url,
            media = signageMedia.Manifest,
            item.LayoutPreset,
            item.LayoutId,
            canvasWidth = layout?.CanvasWidth ?? 1920,
            canvasHeight = layout?.CanvasHeight ?? 1080,
            safeAreaPercent = layout?.SafeAreaPercent ?? 0,
            zones,
            backgroundAudio,
            contentPlaylist = contentPlaylist is null ? null : new
            {
                contentPlaylist.Id, contentPlaylist.Name, contentPlaylist.PlaybackMode, contentPlaylist.Synchronization,
                version = contentPlaylist.PublishedVersion, items = playlistItems
            },
            item.ContentPlaylistId,
            item.VolumePercent,
            item.DisplayPower,
            kiosk = item.KioskEnabled ? new
            {
                enabled = true, interactionUrl = item.KioskInteractionUrl, timeoutSeconds = item.KioskTimeoutSeconds,
                showCloseButton = item.KioskShowCloseButton, showTouchIndicator = item.KioskShowTouchIndicator,
                virtualKeyboard = item.KioskVirtualKeyboard
            } : null,
            item.WidgetCacheUpdatedAt,
            item.WidgetCacheError,
            item.StartsAt,
            item.EndsAt,
            recurrence = SignageSchedule.NormalizeRecurrence(item.Recurrence),
            item.ScheduleStartDate,
            item.ScheduleEndDate,
            item.StartMinutes,
            item.EndMinutes,
            daysOfWeek = SignageSchedule.ParseDays(item.DaysOfWeekCsv),
            excludedDates = SignageSchedule.ParseDates(item.ExcludedDatesJson),
            activeNow = state.Active,
            state.NextChangeAt,
            ready = readiness == "ready",
            readiness
        };
    }

    private static List<SignageZoneInput> EffectiveZones(SignagePlaylist item,
        IReadOnlyDictionary<Guid, SignageLayoutResource> layouts) =>
        item.LayoutId is { } layoutId && layouts.TryGetValue(layoutId, out var layout)
            ? SignageLayout.ParseZones(layout.PublishedZonesJson)
            : SignageLayout.ParseZones(item.ZonesJson);

    private static object MapContentPlaylistItem(SignageContentPlaylistItemInput entry, SignagePlaylist schedule,
        Screen screen, IReadOnlyDictionary<Guid, MediaAsset> media, IReadOnlyDictionary<Guid, SignageLayoutResource> layouts,
        IReadOnlyDictionary<Guid, SignageContentPlaylist> contentPlaylists, int depth = 0)
    {
        var mappedMedia = entry.MediaAssetId is { } mediaId && media.TryGetValue(mediaId, out var asset)
            ? MapSignageMedia(asset, $"signage-{schedule.Id}-playlist-{entry.Id}", entry.Title ?? asset.FileName, screen).Manifest : null;
        object? mappedLayout = null;
        if (entry.LayoutId is { } layoutId && layouts.TryGetValue(layoutId, out var layout))
        {
            mappedLayout = new
            {
                layout.Id, layout.Name, layout.BackgroundColor, layout.CanvasWidth, layout.CanvasHeight, layout.SafeAreaPercent,
                backgroundAudio = layout.BackgroundAudioAssetId is { } audioId && media.TryGetValue(audioId, out var audioAsset)
                    ? MapSignageMedia(audioAsset, $"signage-{schedule.Id}-playlist-{entry.Id}-background-audio",
                        $"{layout.Name} background audio", screen).Manifest : null,
                zones = SignageLayout.ParseZones(layout.PublishedZonesJson).Select(zone =>
                {
                    var zoneAsset = zone.MediaAssetId is { } currentZoneMediaId &&
                        media.TryGetValue(currentZoneMediaId, out var currentAsset) ? currentAsset : null;
                    var render = DisplayCapabilities.ZoneDecision(screen.Platform, zone, zoneAsset);
                    contentPlaylists.TryGetValue(zone.ContentPlaylistId ?? Guid.Empty, out var zonePlaylist);
                    var nestedItems = zonePlaylist is null || depth >= 2 ? [] : ResolveContentItems(
                        zonePlaylist, contentPlaylists, media.Values, depth + 1).ToArray();
                    return new
                    {
                        zone.Id, zone.Type, zone.Title, zone.Content,
                        renderSupport = render.Support,
                        fallbackMessage = render.Message,
                        sourceUrl = zone.Type is "stream" or "presentation" ? null : zone.SourceUrl,
                        zone.X, zone.Y, zone.Width, zone.Height, zone.BackgroundColor, zone.TextColor, zone.AccentColor,
                        zone.RefreshMinutes, zone.Rotation, zone.ZIndex, zone.Opacity, zone.Fit,
                        zone.Locked, zone.Hidden, zone.FlipX, zone.FlipY, zone.GroupId, zone.LockMode,
                        zone.RichTextJson, zone.FontFamily, zone.FontSize, zone.FontScalePercent, zone.FontWeight, zone.Italic, zone.Underline,
                        zone.LineHeightPercent, zone.TextAlign, zone.Shape, zone.StrokeColor, zone.StrokeWidth,
                        zone.CornerRadius, zone.IconName, zone.QrValue,
                        zone.QrLabelTop, zone.QrLabelBottom, zone.QrLabelLeft, zone.QrLabelRight, zone.QrPlacement,
                        zone.QrSizePercent,
                        zone.TickerSpeed, zone.CounterTargetAt, zone.CounterRepeatWeekly,
                        zone.ClockDisplay, zone.ClockTimeFormat, zone.ClockDateFormat, zone.ClockOrder,
                        zone.ClockTimeFontSize, zone.ClockDateFontSize,
                        zone.WeatherProvider, zone.WeatherLocation, zone.WeatherLatitude, zone.WeatherLongitude,
                        zone.WeatherPostalCode, zone.WeatherUnits, zone.WeatherFields,
                        zone.ContentPlaylistId, zone.StreamOverrideWhenLive,
                        zone.ContentPadding, zone.ContentScale, zone.VerticalAlign,
                        zone.StreamOverrideStartsAt, zone.StreamOverrideEndsAt,
                        zone.MediaScale, zone.MediaOffsetX, zone.MediaOffsetY, zone.MediaAllowOverflow,
                        zone.WeatherIconStyle, zone.WeatherLayout, zone.WeatherIconSize, zone.WeatherTitleSize,
                        zone.WeatherTemperatureSize, zone.WeatherDetailsSize,
                        zone.ClockShowPeriod, zone.ClockShowWeekday, zone.ClockShowYear,
                        zone.CalendarMaxItems, zone.CalendarFields,
                        zone.AudienceSessionId, zone.AudienceCode, zone.AudienceShowResults,
                        zone.AudienceResultDelaySeconds,
                        streamUrl = (zone.Type is "stream" or "presentation") && !string.IsNullOrWhiteSpace(zone.SourceUrl)
                            ? $"/api/v1/signage/{schedule.Id}/zones/{Uri.EscapeDataString(zone.Id)}/stream/index.m3u8"
                            : null,
                        htmlUrl = zone.Type == "customHtml" && !string.IsNullOrWhiteSpace(zone.Content)
                            ? $"/api/v1/signage/{schedule.Id}/zones/{Uri.EscapeDataString(zone.Id)}/html"
                            : null,
                        contentPlaylist = zonePlaylist is null || depth >= 2 ? null : new
                        {
                            zonePlaylist.Id, zonePlaylist.Name, zonePlaylist.PlaybackMode, zonePlaylist.Synchronization,
                            version = zonePlaylist.PublishedVersion,
                            items = nestedItems.Select(item => MapContentPlaylistItem(
                                item, schedule, screen, media, layouts, contentPlaylists, depth + 1)).ToArray()
                        },
                        media = zoneAsset is not null
                            ? MapSignageMedia(zoneAsset, $"signage-{schedule.Id}-playlist-{entry.Id}-zone-{zone.Id}",
                                zone.Title ?? zoneAsset.FileName, screen).Manifest : null
                    };
                }).ToArray()
            };
        }
        return new
        {
            entry.Id, entry.Kind, entry.Title, entry.LayoutId, entry.MediaAssetId, entry.NestedPlaylistId,
            entry.AppType, entry.SourceUrl, entry.DurationSeconds, entry.Transition, entry.Hidden, entry.Transparent,
            entry.TagsCsv, entry.VolumePercent, entry.Muted, entry.FadeInMs, entry.FadeOutMs, entry.Fit,
            media = mappedMedia, layout = mappedLayout
        };
    }

    private static IEnumerable<SignageContentPlaylistItemInput> ResolveContentItems(SignageContentPlaylist playlist,
        IReadOnlyDictionary<Guid, SignageContentPlaylist> playlists, IEnumerable<MediaAsset> media, int depth)
    {
        foreach (var item in SignageStudio.ParseItems(playlist.PublishedItemsJson))
        {
            if (item.Hidden) continue;
            if (item.Kind == "nested" && depth < 4 && item.NestedPlaylistId is { } nestedId &&
                playlists.TryGetValue(nestedId, out var nested))
            {
                foreach (var child in ResolveContentItems(nested, playlists, media, depth + 1)) yield return child;
            }
            else if (item.Kind == "tag")
            {
                var tags = (item.TagsCsv ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                foreach (var asset in media.Where(asset => tags.Intersect(
                    asset.TagsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                    StringComparer.OrdinalIgnoreCase).Any()).OrderBy(asset => asset.FileName))
                    yield return item with { Id = $"{item.Id}-{asset.Id:N}", Kind = "media", MediaAssetId = asset.Id,
                        Title = asset.FileName };
            }
            else yield return item;
        }
    }

    private static List<CuePointInput> ParseCuePoints(string json)
    {
        try { return JsonSerializer.Deserialize<List<CuePointInput>>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? []; }
        catch (JsonException) { return []; }
    }

    private static string[] SplitTags(string tags) =>
        tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static int ModeRank(string mode) => mode switch
    {
        "emergency" => 0,
        "scheduled" => 1,
        _ => 2
    };

    private static bool SignageReady(MediaAsset? media) => media is null || SignageReadiness(media) == "ready";

    private static string SignageReadiness(MediaAsset? media)
    {
        if (media is null) return "ready";
        if (media.ProcessingStatus is "pending" or "processing" || media.CompatibilityStatus is "pending" or "processing")
            return "preparing";
        if (media.ProcessingStatus == "failed" || media.CompatibilityStatus == "failed") return "failed";
        if (media.SourceKind != "link" && string.IsNullOrWhiteSpace(media.RelativePath)) return "missing";
        return "ready";
    }

    private static int ManifestVersion(IEnumerable<Lesson> lessons, IEnumerable<SignagePlaylist> signage,
        IEnumerable<Guid> activeSignageIds)
    {
        var hash = 17;
        foreach (var lesson in lessons.OrderBy(x => x.Id))
            hash = unchecked(hash * 31 + HashCode.Combine(lesson.Id, lesson.Version));
        foreach (var item in signage.OrderBy(x => x.Id))
            hash = unchecked(hash * 31 + HashCode.Combine(item.Id, item.Priority, item.UpdatedAt.UtcTicks,
                item.WidgetCacheUpdatedAt?.UtcTicks ?? 0));
        foreach (var id in activeSignageIds.Order())
            hash = unchecked(hash * 31 + id.GetHashCode());
        return Math.Max(1, hash & int.MaxValue);
    }
}
