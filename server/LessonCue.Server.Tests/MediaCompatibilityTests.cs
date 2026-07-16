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
