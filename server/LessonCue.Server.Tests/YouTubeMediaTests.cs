using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class YouTubeMediaTests
{
    [Theory]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgXcQ")]
    [InlineData("https://youtu.be/dQw4w9WgXcQ")]
    [InlineData("https://www.youtube.com/shorts/dQw4w9WgXcQ")]
    [InlineData("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")]
    public void ProducesEmbedUrlForSupportedYouTubeLinks(string value)
    {
        Assert.Equal("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=1&rel=0", YouTubeMedia.EmbedUrl(value));
    }

    [Theory]
    [InlineData("https://youtube.com.example.test/watch?v=dQw4w9WgXcQ")]
    [InlineData("https://example.test/youtube.com/watch?v=dQw4w9WgXcQ")]
    [InlineData("http://127.0.0.1/watch?v=dQw4w9WgXcQ")]
    public void RejectsLookalikeAndNonYouTubeHosts(string value)
    {
        Assert.Null(YouTubeMedia.EmbedUrl(value));
        Assert.False(YouTubeMedia.IsYouTubeUrl(new Uri(value)));
    }

    [Fact]
    public void DownloadArgumentsConfigureTheBundledDenoRuntime()
    {
        var arguments = YouTubeImportService.BuildDownloadArguments(
            "/var/lib/lessoncue/temporary/%(id)s.%(ext)s",
            123456,
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "/opt/lessoncue/deno");

        var runtimeIndex = Array.IndexOf(arguments.ToArray(), "--js-runtimes");
        Assert.True(runtimeIndex >= 0);
        Assert.Equal("deno:/opt/lessoncue/deno", arguments[runtimeIndex + 1]);
        Assert.Contains("123456", arguments);
        Assert.Contains("--no-config", arguments);
        Assert.Contains("--no-playlist", arguments);
    }

    [Fact]
    public void DownloadArgumentsUseTheAndroidPlayerClientToAvoidSabred403Urls()
    {
        var arguments = YouTubeImportService.BuildDownloadArguments(
            "/var/lib/lessoncue/temporary/%(id)s.%(ext)s",
            123456,
            "https://www.youtube.com/watch?v=c4PmpM058is",
            "/opt/lessoncue/deno");

        var extractorIndex = Array.IndexOf(arguments.ToArray(), "--extractor-args");
        Assert.True(extractorIndex >= 0);
        Assert.Equal("youtube:player_client=android", arguments[extractorIndex + 1]);
        Assert.Contains("3", arguments);
    }

    [Fact]
    public void FallbackDownloadArgumentsMergeAdaptiveMp4Streams()
    {
        var arguments = YouTubeImportService.BuildFallbackDownloadArguments(
            "/var/lib/lessoncue/temporary/%(id)s.%(ext)s",
            123456,
            "https://www.youtube.com/watch?v=c4PmpM058is",
            "/opt/lessoncue/deno");

        Assert.Contains("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]", arguments);
        var mergeIndex = Array.IndexOf(arguments.ToArray(), "--merge-output-format");
        Assert.True(mergeIndex >= 0);
        Assert.Equal("mp4", arguments[mergeIndex + 1]);
        Assert.DoesNotContain("--extractor-args", arguments);
        Assert.Contains("deno:/opt/lessoncue/deno", arguments);
    }
}
