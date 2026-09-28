using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// The containment rule that keeps a stored path inside the directory it
/// belongs to. Eight call sites depend on it, so the escapes it has to refuse
/// are written down here rather than left to each of them.
/// </summary>
public sealed class ContainedPathTests
{
    private static string Root() =>
        Path.Combine(Path.GetTempPath(), $"lessoncue-contained-{Guid.NewGuid():N}", "media");

    [Fact]
    public void ResolvesAnOrdinaryStoredFileUnderTheRoot()
    {
        var root = Root();
        var resolved = ContainedPath.Resolve(root, "3f2b-v2-9c1d.mp4");

        Assert.Equal(Path.Combine(Path.GetFullPath(root), "3f2b-v2-9c1d.mp4"), resolved);
    }

    [Fact]
    public void ResolvesANestedStoredFile()
    {
        var root = Root();
        // Archived versions are stored one directory down, per media id.
        var resolved = ContainedPath.Resolve(root, Path.Combine("3f2b", "v0004-9c1d.mp4"));

        Assert.NotNull(resolved);
        Assert.StartsWith(Path.GetFullPath(root), resolved);
    }

    [Theory]
    [InlineData("../escaped.mp4")]
    [InlineData("../../etc/passwd")]
    [InlineData("nested/../../escaped.mp4")]
    [InlineData("./../escaped.mp4")]
    public void RefusesATraversalOutOfTheRoot(string relative)
    {
        Assert.Null(ContainedPath.Resolve(Root(), relative.Replace('/', Path.DirectorySeparatorChar)));
    }

    [Fact]
    public void RefusesAnAbsolutePath()
    {
        // Path.Combine would discard the root and return this unchanged.
        var absolute = OperatingSystem.IsWindows() ? @"C:\Windows\System32\drivers\etc\hosts" : "/etc/passwd";

        Assert.Null(ContainedPath.Resolve(Root(), absolute));
    }

    [Fact]
    public void RefusesASiblingDirectoryThatSharesTheRootsName()
    {
        // The escape a prefix comparison misses when it forgets the trailing
        // separator: "/…/media-old" starts with "/…/media".
        var root = Root();
        var sibling = Path.Combine("..", "media-old", "secret.mp4");

        Assert.Null(ContainedPath.Resolve(root, sibling));
    }

    [Fact]
    public void RefusesTheRootItself()
    {
        Assert.Null(ContainedPath.Resolve(Root(), "."));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void RefusesAnEmptyStoredPath(string? relative)
    {
        Assert.Null(ContainedPath.Resolve(Root(), relative));
        Assert.Null(ContainedPath.Resolve(relative, "file.mp4"));
    }

    [Fact]
    public void ResolveExistingFileRequiresTheFileToBeThere()
    {
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-contained-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            Assert.Null(ContainedPath.ResolveExistingFile(root, "absent.mp4"));

            File.WriteAllText(Path.Combine(root, "present.mp4"), "x");
            Assert.NotNull(ContainedPath.ResolveExistingFile(root, "present.mp4"));
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void IsInsideAnswersForAPathBuiltAgainstADifferentRoot()
    {
        // The troubleshooting archive combines against the data path and then
        // requires the result to land in the artifact directory.
        var data = Path.Combine(Path.GetTempPath(), "lessoncue-data");
        var artifacts = Path.Combine(data, "troubleshooting");

        Assert.True(ContainedPath.IsInside(artifacts, Path.Combine(artifacts, "run-1", "report.json")));
        // Under the data path, but not under the artifact root.
        Assert.False(ContainedPath.IsInside(artifacts, Path.Combine(data, "media", "lesson.mp4")));
        // The sibling whose name starts with the root's.
        Assert.False(ContainedPath.IsInside(artifacts, Path.Combine(data, "troubleshooting-old", "report.json")));
        Assert.False(ContainedPath.IsInside(artifacts, artifacts));
    }

    [Fact]
    public void DeleteIfContainedRemovesOnlyWhatIsInside()
    {
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-contained-{Guid.NewGuid():N}");
        var inside = Path.Combine(root, "media");
        Directory.CreateDirectory(inside);
        try
        {
            var target = Path.Combine(inside, "gone.mp4");
            var neighbour = Path.Combine(root, "kept.mp4");
            File.WriteAllText(target, "x");
            File.WriteAllText(neighbour, "x");

            ContainedPath.DeleteIfContained(inside, "gone.mp4");
            Assert.False(File.Exists(target));

            // The same call cannot be talked into reaching up one level.
            ContainedPath.DeleteIfContained(inside, Path.Combine("..", "kept.mp4"));
            Assert.True(File.Exists(neighbour));
        }
        finally { Directory.Delete(root, true); }
    }
}
