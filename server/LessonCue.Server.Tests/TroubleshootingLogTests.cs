using LessonCue.Server;
using Microsoft.Extensions.Logging;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class TroubleshootingLogTests
{
    [Fact]
    public void RedactsCredentialValuesInMemoryAndOnDisk()
    {
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-troubleshooting-log-{Guid.NewGuid():N}");
        try
        {
            using (var log = new TroubleshootingLog(root))
            {
                var logger = log.CreateLogger("LessonCue.Server.Security");
                logger.LogInformation("""Authorization: Bearer top-secret token=query-secret&next=1 "password":"json-secret" api_key plain-secret""");
                logger.LogError(new InvalidOperationException("secret=exception-secret"), "Request failed");

                var entries = log.GetRecent(10);
                Assert.Equal(2, entries.Count);
                var combined = string.Join('\n', entries.Select(entry => $"{entry.Message} {entry.Exception}"));
                Assert.DoesNotContain("top-secret", combined);
                Assert.DoesNotContain("query-secret", combined);
                Assert.DoesNotContain("json-secret", combined);
                Assert.DoesNotContain("plain-secret", combined);
                Assert.DoesNotContain("exception-secret", combined);
                Assert.Contains("Authorization: [redacted]", combined);
                Assert.Contains("\"password\":\"[redacted]\"", combined);
            }

            var stored = File.ReadAllText(Path.Combine(root, "logs", "troubleshooting.jsonl"));
            Assert.DoesNotContain("top-secret", stored);
            Assert.DoesNotContain("query-secret", stored);
            Assert.DoesNotContain("json-secret", stored);
            Assert.DoesNotContain("plain-secret", stored);
            Assert.DoesNotContain("exception-secret", stored);

            using var reloaded = new TroubleshootingLog(root);
            Assert.Equal(2, reloaded.GetRecent(10).Count);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Fact]
    public void BoundsEntriesAndIgnoresLowValueFrameworkNoise()
    {
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-troubleshooting-log-{Guid.NewGuid():N}");
        try
        {
            using var log = new TroubleshootingLog(root);
            log.CreateLogger("Microsoft.Hosting").LogInformation("Routine framework event");
            log.CreateLogger("LessonCue.Server.Worker").LogDebug("Debug detail");
            log.CreateLogger("Microsoft.Hosting").LogWarning("Framework warning");
            log.CreateLogger("LessonCue.Server.Worker").LogInformation("Application event");

            var entries = log.GetRecent(10);
            Assert.Equal(2, entries.Count);
            Assert.Contains(entries, entry => entry.Message == "Framework warning");
            Assert.Contains(entries, entry => entry.Message == "Application event");
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}
