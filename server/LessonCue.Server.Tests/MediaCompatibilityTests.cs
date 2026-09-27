using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaCompatibilityTests
{
    [Theory]
    [InlineData("poor", 8_000_000_000, "h264-480")]
    [InlineData("fair", 8_000_000_000, "h264-720")]
    [InlineData("good", 8_000_000_000, "h264-1080")]
    [InlineData("excellent", 500_000_000, "h264-480")]
    [InlineData("excellent", 2_000_000_000, "h264-720")]
    public void Adaptive_profile_uses_network_quality_and_screen_storage(string quality, long freeBytes, string expected)
    {
        var screen = new Screen { Name = "TV", NetworkQuality = quality, FreeBytes = freeBytes,
            CodecCapabilitiesJson = "[{\"kind\":\"video\",\"codec\":\"H.264 / AVC\",\"supported\":true}]" };
        var media = new MediaAsset { FileName = "video.mp4", RelativePath = "video.mp4", VideoCodec = "h264" };
        Assert.Equal(expected, AdaptiveTranscodeProfiles.SelectForScreen(screen, media));
    }

    [Fact]
    public void Adaptive_profile_can_keep_supported_native_hevc_when_h264_is_unavailable()
    {
        var screen = new Screen { Name = "TV", NetworkQuality = "good", FreeBytes = 8_000_000_000,
            CodecCapabilitiesJson = "[{\"codec\":\"H.264 / AVC\",\"supported\":false},{\"codec\":\"H.265 / HEVC\",\"supported\":true}]" };
        var media = new MediaAsset { FileName = "video.mp4", RelativePath = "video.mp4", VideoCodec = "hevc" };
        Assert.Equal("native", AdaptiveTranscodeProfiles.SelectForScreen(screen, media));
    }

    [Fact]
    public void Playback_sources_try_the_highest_supported_original_then_compatible_lower_profiles()
    {
        var media = new MediaAsset
        {
            FileName = "lesson-4k.mkv", RelativePath = "lesson-4k.mkv", ContentType = "video/x-matroska",
            Sha256 = "original-checksum", SizeBytes = 4_000_000_000, Version = 3,
            VideoCodec = "hevc", AudioCodec = "aac", Width = 3840, Height = 2160,
            CompatibilityStatus = "ready", CompatibilityPath = "lesson.mp4",
            CompatibilitySha256 = "compat-checksum", CompatibilitySizeBytes = 800_000_000
        };
        media.TranscodeVariants.Add(new MediaTranscodeVariant
        {
            Profile = AdaptiveTranscodeProfiles.Balanced720, Status = "ready", RelativePath = "720.mp4",
            Sha256 = "720-checksum", SizeBytes = 200_000_000, Width = 1280, Height = 720, SourceVersion = 3
        });
        media.TranscodeVariants.Add(new MediaTranscodeVariant
        {
            Profile = AdaptiveTranscodeProfiles.DataSaver480, Status = "ready", RelativePath = "480.mp4",
            Sha256 = "480-checksum", SizeBytes = 100_000_000, Width = 854, Height = 480, SourceVersion = 3
        });
        var screen = new Screen
        {
            Name = "4K TV",
            CodecCapabilitiesJson = """
                [{"kind":"video","codec":"H.264 / AVC","supported":true},
                 {"kind":"video","codec":"H.265 / HEVC","supported":true},
                 {"kind":"audio","codec":"AAC","supported":true}]
                """
        };

        var sources = MediaPlaybackSources.For(media, screen);

        Assert.Equal(new[] { "original", "compatible-1080", "h264-720", "h264-480" },
            sources.Select(source => source.Profile));
        Assert.Equal($"/api/v1/media/{media.Id}/file?v=original-che", sources[0].Url);
        Assert.Equal("/api/v1/media/" + media.Id + "/transcodes/h264-720?v=720-checksum", sources[2].Url);
    }

    [Fact]
    public void Playback_sources_never_offer_a_codec_explicitly_rejected_by_the_tv()
    {
        var media = new MediaAsset
        {
            FileName = "hevc.mp4", RelativePath = "hevc.mp4", ContentType = "video/mp4",
            Sha256 = "hevc-checksum", SizeBytes = 400, Version = 1,
            VideoCodec = "hevc", AudioCodec = "aac", Width = 1920, Height = 1080,
            CompatibilityStatus = "ready", CompatibilityPath = "compatible.mp4",
            CompatibilitySha256 = "compat-checksum", CompatibilitySizeBytes = 300
        };
        media.TranscodeVariants.Add(new MediaTranscodeVariant
        {
            Profile = AdaptiveTranscodeProfiles.Balanced720, Status = "ready", RelativePath = "720.mp4",
            Sha256 = "720-checksum", SizeBytes = 200, Width = 1280, Height = 720, SourceVersion = 1
        });
        var screen = new Screen
        {
            Name = "HEVC-only TV",
            CodecCapabilitiesJson = """
                [{"kind":"video","codec":"H.264 / AVC","supported":false},
                 {"kind":"video","codec":"H.265 / HEVC","supported":true},
                 {"kind":"audio","codec":"AAC","supported":true}]
                """
        };

        var sources = MediaPlaybackSources.For(media, screen);

        Assert.Single(sources);
        Assert.Equal("original", sources[0].Profile);
    }

    [Theory]
    [InlineData("h264", "aac", "yuv420p", 41, 1920, 1080, true)]
    [InlineData("h264", null, "yuvj420p", 40, 1280, 720, true)]
    [InlineData("hevc", "aac", "yuv420p", 41, 1920, 1080, false)]
    [InlineData("h264", "opus", "yuv420p", 41, 1920, 1080, false)]
    [InlineData("h264", "aac", "yuv420p10le", 41, 1920, 1080, false)]
    [InlineData("h264", "aac", "yuv420p", 51, 3840, 2160, false)]
    public void Universal_encoding_policy_covers_both_native_tv_clients(string codec, string? audio,
        string pixelFormat, int level, int width, int height, bool expected)
    {
        Assert.Equal(expected, PlaybackCompatibility.HasUniversalEncoding(codec, audio, pixelFormat, level, width, height));
    }

    [Theory]
    [InlineData("mov,mp4,m4a,3gp,3g2,mj2", true)]
    [InlineData("mp4", true)]
    [InlineData("mov", false)]
    [InlineData("matroska,webm", false)]
    [InlineData(null, false)]
    public void Only_mp4_is_delivered_without_a_compatibility_derivative(string? formats, bool expected)
    {
        Assert.Equal(expected, PlaybackCompatibility.HasMp4Container(formats));
    }
}
