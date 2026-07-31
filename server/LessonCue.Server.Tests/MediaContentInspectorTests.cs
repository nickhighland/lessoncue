using System.IO.Compression;
using System.Text;
using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaContentInspectorTests
{
    [Theory]
    [InlineData(".png", "89504e470d0a1a0a00000000", "image/png")]
    [InlineData(".jpg", "ffd8ffe000104a464946", "image/jpeg")]
    [InlineData(".mp4", "000000186674797069736f6d", "video/mp4")]
    [InlineData(".webm", "1a45dfa39f42868101", "video/webm")]
    [InlineData(".wav", "524946460000000057415645", "audio/wav")]
    [InlineData(".pdf", "255044462d312e370a", "application/pdf")]
    public void AcceptsRecognizedContent(string extension, string hex, string contentType)
    {
        using var stream = new MemoryStream(Convert.FromHexString(hex));

        var result = MediaContentInspector.Inspect(stream, extension);

        Assert.True(result.Valid);
        Assert.Equal(contentType, result.ContentType);
        Assert.Null(result.Error);
    }

    [Fact]
    public void RejectsRenamedExecutableBeforeProcessing()
    {
        using var stream = new MemoryStream(Encoding.ASCII.GetBytes("MZ-not-a-video"));

        var result = MediaContentInspector.Inspect(stream, ".mp4");

        Assert.False(result.Valid);
        Assert.Contains("do not match", result.Error);
    }

    [Fact]
    public void RequiresExpectedOpenXmlPackageEntries()
    {
        using var valid = Package(("[Content_Types].xml", "<Types/>"),
            ("ppt/presentation.xml", "<p:presentation/>"));
        using var wrong = Package(("[Content_Types].xml", "<Types/>"),
            ("word/document.xml", "<w:document/>"));

        Assert.True(MediaContentInspector.Inspect(valid, ".pptx").Valid);
        Assert.False(MediaContentInspector.Inspect(wrong, ".pptx").Valid);
    }

    [Fact]
    public void RejectsUnsafePackagePaths()
    {
        using var stream = Package(("[Content_Types].xml", "<Types/>"),
            ("ppt/presentation.xml", "<p:presentation/>"),
            ("../outside", "bad"));

        Assert.False(MediaContentInspector.Inspect(stream, ".pptx").Valid);
    }

    [Fact]
    public void DoesNotTrustBrowserProvidedContentType()
    {
        Assert.Equal("video/mp4", MediaContentInspector.ContentType(".mp4"));
        Assert.Equal("application/vnd.apple.keynote", MediaContentInspector.ContentType(".key"));
        Assert.Equal("application/octet-stream", MediaContentInspector.ContentType(".exe"));
    }

    private static MemoryStream Package(params (string Name, string Content)[] entries)
    {
        var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in entries)
            {
                var entry = archive.CreateEntry(name);
                using var writer = new StreamWriter(entry.Open(), Encoding.UTF8);
                writer.Write(content);
            }
        }
        output.Position = 0;
        return output;
    }
}
