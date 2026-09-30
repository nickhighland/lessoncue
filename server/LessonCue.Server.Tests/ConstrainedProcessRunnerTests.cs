using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ConstrainedProcessRunnerTests
{
    [Fact]
    public void SplitsControlledFfmpegArgumentsWithoutUsingAShell()
    {
        var arguments = ConstrainedProcessRunner.SplitArguments(
            "-nostdin -i \"/data/My Lesson.mp4\" -vf \"scale=w='min(1920,iw)':h=-2\" \"/data/output.mp4\"");

        Assert.Equal(
            ["-nostdin", "-i", "/data/My Lesson.mp4", "-vf", "scale=w='min(1920,iw)':h=-2", "/data/output.mp4"],
            arguments);
    }

    [Fact]
    public void PreservesLiteralShellMetacharacters()
    {
        var arguments = ConstrainedProcessRunner.SplitArguments(
            "-i \"/data/$(touch should-not-run).mp4\" output.mp4");

        Assert.Equal("/data/$(touch should-not-run).mp4", arguments[1]);
    }

    [Fact]
    public void LinuxWorkerArgumentsCarryResourceLimitsWithoutPerUserProcessLimit()
    {
        var root = Path.Combine(Path.GetTempPath(), "lessoncue-worker-test");
        var options = new ConstrainedProcessOptions(
            TimeSpan.FromSeconds(42), MemoryBytes: 123_000_000,
            MaximumOutputFileBytes: 456_000_000, MaximumProcesses: 7,
            WritableRoots: [root]);

        if (!OperatingSystem.IsLinux())
        {
            Assert.Equal("ffmpeg",
                ConstrainedProcessRunner.BuildStartInfo("ffmpeg", ["-version"], options).FileName);
            return;
        }

        // The converter is only wrapped when the media worker is actually
        // installed, and a build agent has no reason to have one. Asserting the
        // wrapping for any Linux therefore described a path the test did not
        // reach: it passed wherever a worker happened to exist and failed
        // everywhere else, which is what it did on CI. Point the documented
        // override at a stand-in so the wrapping is exercised either way.
        var worker = Path.Combine(Path.GetTempPath(), $"lessoncue-media-worker-{Guid.NewGuid():N}");
        File.WriteAllText(worker, string.Empty);
        var previousWorker = Environment.GetEnvironmentVariable("LESSONCUE_MEDIA_WORKER_PATH");
        Environment.SetEnvironmentVariable("LESSONCUE_MEDIA_WORKER_PATH", worker);
        try
        {
            // setpriv comes from util-linux. Where it is absent the runner is
            // documented to refuse rather than quietly run the converter
            // unconfined, so that is what is checked instead of skipping.
            if (!File.Exists("/usr/bin/setpriv") && !File.Exists("/bin/setpriv"))
            {
                var refused = Assert.Throws<InvalidOperationException>(
                    () => ConstrainedProcessRunner.BuildStartInfo("ffmpeg", ["-version"], options));
                Assert.Contains("util-linux", refused.Message);
                return;
            }

            var start = ConstrainedProcessRunner.BuildStartInfo("ffmpeg", ["-version"], options);

            Assert.EndsWith("setpriv", start.FileName);
            Assert.Equal("--ambient-caps=-all", start.ArgumentList[0]);
            Assert.Equal("--inh-caps=-all", start.ArgumentList[1]);
            Assert.Equal("--no-new-privs", start.ArgumentList[2]);
            Assert.DoesNotContain("--bounding-set=-all", start.ArgumentList);
            var setprivSeparator = start.ArgumentList.IndexOf("--");
            Assert.True(setprivSeparator >= 0);
            Assert.Equal(worker, start.ArgumentList[setprivSeparator + 1]);
            Assert.Contains("--network=deny", start.ArgumentList);
            Assert.Contains("--timeout=42", start.ArgumentList);
            Assert.Contains("--memory=123000000", start.ArgumentList);
            Assert.Contains("--file-size=456000000", start.ArgumentList);
            Assert.DoesNotContain("--processes=7", start.ArgumentList);
            Assert.Contains("--write-root=" + Path.GetFullPath(root), start.ArgumentList);
            Assert.DoesNotContain("-c", start.ArgumentList);
        }
        finally
        {
            Environment.SetEnvironmentVariable("LESSONCUE_MEDIA_WORKER_PATH", previousWorker);
            File.Delete(worker);
        }
    }

    [Fact]
    public void RejectsUnmatchedQuotes()
    {
        Assert.Throws<InvalidOperationException>(() =>
            ConstrainedProcessRunner.SplitArguments("-i \"missing-end"));
    }
}
