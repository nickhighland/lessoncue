namespace LessonCue.Server;

/// <summary>
/// Resolves a stored relative path without letting it leave the directory it
/// belongs to.
/// </summary>
/// <remarks>
/// This check was written out by hand in eight places — the media library, the
/// retention sweep, backups, diagnostics, recovery, slide conversion, screenshot
/// cleanup and the troubleshooting archive — in three slightly different
/// spellings. All of them were correct, but a rule copied eight times is a rule
/// that will eventually be copied wrong, and two of the copies had already
/// drifted: one compared against a root with no trailing separator, and one
/// combined a stored path with no containment check at all.
///
/// Paths reaching here are built from names that were once user-supplied — an
/// uploaded file name, a stored <c>RelativePath</c> — so they are treated as
/// untrusted even though the server generates most of them itself.
/// </remarks>
public static class ContainedPath
{
    /// <summary>
    /// The absolute path <paramref name="relativePath"/> names inside
    /// <paramref name="root"/>, or <see langword="null"/> if it names anything
    /// else. Existence is not checked: that is the caller's business.
    /// </summary>
    public static string? Resolve(string? root, string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(root) || string.IsNullOrWhiteSpace(relativePath)) return null;
        try
        {
            // An absolute or drive-qualified path makes Path.Combine discard the
            // root and hand back that path unchanged. Containment would still
            // reject it, but refusing it here says so plainly rather than
            // leaving it to a later comparison to notice.
            if (Path.IsPathRooted(relativePath)) return null;

            var candidate = Path.GetFullPath(Path.Combine(Path.GetFullPath(root), relativePath));
            return IsInside(root, candidate) ? candidate : null;
        }
        catch (ArgumentException) { return null; }
        catch (PathTooLongException) { return null; }
        catch (NotSupportedException) { return null; }
    }

    /// <summary>
    /// Whether an already-resolved path lies inside <paramref name="root"/>.
    /// For the callers that build a path against one directory and require it
    /// to land in another.
    /// </summary>
    public static bool IsInside(string? root, string? absolutePath)
    {
        if (string.IsNullOrWhiteSpace(root) || string.IsNullOrWhiteSpace(absolutePath)) return false;
        try
        {
            // Containment is asked of the path API rather than of string
            // prefixes. A prefix comparison has to remember the trailing
            // separator, or "/data/media-old/secret" reads as living inside
            // "/data/media"; and it has to pick a casing rule, which differs by
            // platform. GetRelativePath already knows both.
            var relative = Path.GetRelativePath(Path.GetFullPath(root), Path.GetFullPath(absolutePath));
            return relative.Length > 0
                && relative != "."
                && relative != ".."
                && !relative.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal)
                && !relative.StartsWith("../", StringComparison.Ordinal)
                && !Path.IsPathRooted(relative);
        }
        catch (ArgumentException) { return false; }
        catch (PathTooLongException) { return false; }
        catch (NotSupportedException) { return false; }
    }

    /// <summary>
    /// The contained path, but only when a file is actually there. This is the
    /// shape most callers want, and keeps the existence check from being
    /// forgotten at one of them.
    /// </summary>
    public static string? ResolveExistingFile(string? root, string? relativePath)
    {
        var path = Resolve(root, relativePath);
        return path is not null && File.Exists(path) ? path : null;
    }

    /// <summary>
    /// Deletes a stored file if it is inside <paramref name="root"/> and
    /// present. Failures are swallowed: every caller is a cleanup path where a
    /// file that cannot be removed must not abort the work in hand.
    /// </summary>
    public static void DeleteIfContained(string? root, string? relativePath)
    {
        var path = ResolveExistingFile(root, relativePath);
        if (path is null) return;
        try { File.Delete(path); } catch { /* cleanup is best effort */ }
    }
}
