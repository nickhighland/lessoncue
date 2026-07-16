using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class HttpPortServiceTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(80)]
    [InlineData(8080)]
    [InlineData(65535)]
    public void AcceptsValidPorts(int value) => Assert.Equal(value, HttpPortConfiguration.Normalize(value));

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(65536)]
    public void RejectsInvalidPorts(int value) =>
        Assert.Throws<ArgumentException>(() => HttpPortConfiguration.Normalize(value));

    [Theory]
    [InlineData("lessoncue", 80, "http://lessoncue.local")]
    [InlineData("north-campus", 8080, "http://north-campus.local:8080")]
    public void FormatsBrowserAddress(string hostname, int port, string expected) =>
        Assert.Equal(expected, HttpPortConfiguration.FormatAddress(hostname, port));

    [Fact]
    public void SavedPortOverridesEnvironmentValue()
    {
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-port-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(dataPath, "config"));
        var previous = Environment.GetEnvironmentVariable("LESSONCUE_HTTP_PORT");
        try
        {
            Environment.SetEnvironmentVariable("LESSONCUE_HTTP_PORT", "8080");
            File.WriteAllText(Path.Combine(dataPath, "config", "http-port"), "80\n");
            Assert.Equal(80, HttpPortConfiguration.Resolve(dataPath));
        }
        finally
        {
            Environment.SetEnvironmentVariable("LESSONCUE_HTTP_PORT", previous);
            Directory.Delete(dataPath, true);
        }
    }
}
