using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class LocalAddressServiceTests
{
    [Theory]
    [InlineData("lessoncue", "lessoncue")]
    [InlineData("LessonCue.local", "lessoncue")]
    [InlineData(" north-campus.local ", "north-campus")]
    [InlineData("school2", "school2")]
    public void NormalizesLocalHostnames(string value, string expected) =>
        Assert.Equal(expected, LocalAddressService.NormalizeHostname(value));

    [Theory]
    [InlineData("")]
    [InlineData("-lessoncue")]
    [InlineData("lessoncue-")]
    [InlineData("lesson cue")]
    [InlineData("lessoncue.example.com")]
    [InlineData("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    public void RejectsInvalidLocalHostnames(string value) =>
        Assert.Throws<ArgumentException>(() => LocalAddressService.NormalizeHostname(value));
}
