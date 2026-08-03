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
    public void LinuxWorkerArgumentsCarryAllLimits()
    {
        var root = Path.Combine(Path.GetTempPath(), "lessoncue-worker-test");
        var options = new ConstrainedProcessOptions(
            TimeSpan.FromSeconds(42), MemoryBytes: 123_000_000,
            MaximumOutputFileBytes: 456_000_000, MaximumProcesses: 7,
            WritableRoots: [root]);

        var start = ConstrainedProcessRunner.BuildStartInfo("ffmpeg", ["-version"], options);

        if (OperatingSystem.IsLinux())
        {
            Assert.EndsWith("setpriv", start.FileName);
            Assert.Equal("--ambient-caps=-all", start.ArgumentList[0]);
            Assert.Equal("--inh-caps=-all", start.ArgumentList[1]);
            var setprivSeparator = start.ArgumentList.IndexOf("--");
            Assert.True(setprivSeparator >= 0);
            Assert.EndsWith("lessoncue-media-worker", start.ArgumentList[setprivSeparator + 1]);
            Assert.Contains("--network=deny", start.ArgumentList);
            Assert.Contains("--timeout=42", start.ArgumentList);
            Assert.Contains("--memory=123000000", start.ArgumentList);
            Assert.Contains("--file-size=456000000", start.ArgumentList);
            Assert.Contains("--processes=7", start.ArgumentList);
            Assert.Contains("--write-root=" + Path.GetFullPath(root), start.ArgumentList);
            Assert.DoesNotContain("-c", start.ArgumentList);
        }
        else Assert.Equal("ffmpeg", start.FileName);
    }

    [Fact]
    public void RejectsUnmatchedQuotes()
    {
        Assert.Throws<InvalidOperationException>(() =>
            ConstrainedProcessRunner.SplitArguments("-i \"missing-end"));
    }
}
