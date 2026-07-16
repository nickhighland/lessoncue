using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class PairingCodeServiceTests
{
    [Fact]
    public void FixedPinTakesEffectImmediatelyAndPersists()
    {
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-pairing-{Guid.NewGuid():N}");
        try
        {
            var service = new PairingCodeService(root, null);
            service.SetFixedPin("042719");

            Assert.Equal("042719", service.Current);
            Assert.Equal("042719", new PairingCodeService(root, null).Current);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public void AutomaticModeOverridesConfiguredPinAcrossRestart()
    {
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-pairing-{Guid.NewGuid():N}");
        try
        {
            var service = new PairingCodeService(root, "123456");
            service.SetFixedPin(null);
            var restarted = new PairingCodeService(root, "123456");

            Assert.Null(restarted.FixedPin);
            Assert.Matches("^[0-9]{6}$", restarted.Current);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Theory]
    [InlineData("12345")]
    [InlineData("1234567")]
    [InlineData("12A456")]
    public void RejectsInvalidFixedPin(string pin)
    {
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-pairing-{Guid.NewGuid():N}");
        try { Assert.Throws<ArgumentException>(() => new PairingCodeService(root, pin)); }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
