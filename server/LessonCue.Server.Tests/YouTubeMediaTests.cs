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
}
