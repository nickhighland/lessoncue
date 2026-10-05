using System.Text.Json;

namespace LessonCue.Server;

public sealed record MediaPlaybackSource(
    string Profile,
    string Url,
    string ContentType,
    string? Sha256,
    long? SizeBytes,
    int? Width,
    int? Height);

/// <summary>
/// Produces a quality-ordered set of files a display can try for one video.
/// The original is preferred only when its codecs are supported; otherwise the
/// universal H.264 copy and ready lower-resolution variants lead the list.
/// </summary>
public static class MediaPlaybackSources
{
    public static IReadOnlyList<MediaPlaybackSource> For(MediaAsset? media, Screen screen)
    {
        if (!AdaptiveTranscodeEligibility.IsVideoFile(media) || media!.VideoCodec is null) return [];

        var sources = new List<MediaPlaybackSource>();
        var h264Supported = Supports(screen, ["H.264", "AVC"]);
        var aacSupported = Supports(screen, ["AAC"], audio: true);
        var compatibleLadderSupported = h264Supported != false && aacSupported != false;
        var videoCapability = CodecSupported(screen, media.VideoCodec);
        var audioCapability = media.AudioCodec is null ? true : CodecSupported(screen, media.AudioCodec, audio: true);
        var originalSupported = videoCapability != false && audioCapability != false;
        var originalCapabilityKnown = videoCapability is not null && audioCapability is not null;

        if (originalSupported && originalCapabilityKnown)
            AddOriginal();

        if (compatibleLadderSupported)
        {
            if (media.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath))
            {
                Add("compatible-1080", $"/api/v1/media/{media.Id}/playback", "video/mp4",
                    media.CompatibilitySha256, media.CompatibilitySizeBytes,
                    Math.Min(media.Width ?? 1920, 1920), Math.Min(media.Height ?? 1080, 1080));
            }

            foreach (var variant in media.TranscodeVariants
                         .Where(x => x.Status == "ready" && x.SourceVersion == media.Version &&
                             !string.IsNullOrWhiteSpace(x.RelativePath) && AdaptiveTranscodeProfiles.All.ContainsKey(x.Profile))
                         .OrderByDescending(x => x.Height).ThenByDescending(x => x.Width))
            {
                Add(variant.Profile, $"/api/v1/media/{media.Id}/transcodes/{variant.Profile}", "video/mp4",
                    variant.Sha256, variant.SizeBytes, variant.Width, variant.Height);
            }
        }

        // Older clients may not yet have reported codec support. Prefer the
        // safe H.264 ladder when available, while retaining the original as a
        // final high-quality attempt rather than silently omitting it.
        if (originalSupported && !originalCapabilityKnown)
            AddOriginal();

        return sources.DistinctBy(x => x.Url).ToArray();

        void AddOriginal() => Add("original", $"/api/v1/media/{media.Id}/file", media.ContentType,
            media.Sha256, media.SizeBytes, media.Width, media.Height);

        void Add(string profile, string path, string contentType, string? sha256, long? sizeBytes,
            int? width, int? height)
        {
            var version = string.IsNullOrWhiteSpace(sha256)
                ? media.Version.ToString()
                : sha256[..Math.Min(12, sha256.Length)];
            sources.Add(new MediaPlaybackSource(profile,
                $"{path}?v={Uri.EscapeDataString(version)}", contentType, sha256, sizeBytes, width, height));
        }
    }

    private static bool? CodecSupported(Screen screen, string codec, bool audio = false)
    {
        string[] aliases = codec.ToLowerInvariant() switch
        {
            "h264" or "avc" => ["H.264", "AVC"],
            "hevc" or "h265" => ["H.265", "HEVC"],
            "vp9" => ["VP9"],
            "av1" => ["AV1"],
            "aac" => ["AAC"],
            "mp3" => ["MP3"],
            "ac3" or "eac3" => ["AC-3", "E-AC-3", "Dolby"],
            "opus" => ["Opus"],
            _ => []
        };
        return aliases.Length == 0 ? null : Supports(screen, aliases, audio);
    }

    private static bool? Supports(Screen screen, string[] aliases, bool audio = false)
    {
        try
        {
            using var document = JsonDocument.Parse(screen.CodecCapabilitiesJson);
            foreach (var capability in document.RootElement.EnumerateArray())
            {
                if (capability.TryGetProperty("kind", out var kind) &&
                    (kind.GetString() == "audio") != audio) continue;
                var name = capability.TryGetProperty("codec", out var codec) ? codec.GetString() ?? "" : "";
                if (!aliases.Any(alias => name.Contains(alias, StringComparison.OrdinalIgnoreCase))) continue;
                if (capability.TryGetProperty("supported", out var supported)) return supported.GetBoolean();
            }
        }
        catch (JsonException) { }
        return null;
    }
}
