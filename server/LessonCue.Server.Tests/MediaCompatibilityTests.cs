using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaCompatibilityTests
{
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
