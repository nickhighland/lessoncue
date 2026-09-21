using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

/// <summary>
/// Read-only evidence for the troubleshooting export. This deliberately keeps
/// the database state beside what is actually on disk so an AI or operator can
/// distinguish a queue problem from a missing/corrupt file without shell access.
/// </summary>
public static class MediaDiagnostics
{
    private const int DefaultLimit = 50;
    private const int MaximumLimit = 100;
    private const long MaximumHashBytes = 2L * 1024 * 1024 * 1024;

    public static async Task<IReadOnlyList<MediaDiagnosticSnapshot>> BuildAsync(
        LessonCueDb db, MediaStoragePaths paths, int? requestedLimit = null, CancellationToken ct = default)
    {
        var limit = Math.Clamp(requestedLimit ?? DefaultLimit, 1, MaximumLimit);
        // SQLite cannot translate DateTimeOffset ordering consistently across
        // its provider versions. Materialize the compact asset/variant rows,
        // then apply the time ordering in .NET so the diagnostic endpoint also
        // works against upgraded production databases.
        var assets = (await db.MediaAssets.AsNoTracking()
            .Include(item => item.TranscodeVariants)
            .ToListAsync(ct))
            .OrderByDescending(item => item.CreatedAt)
            .Take(limit)
            .ToList();

        var result = new List<MediaDiagnosticSnapshot>(assets.Count);
        foreach (var asset in assets)
        {
            ct.ThrowIfCancellationRequested();
            var original = await InspectFileAsync(paths.Originals, asset.RelativePath, asset.Sha256, asset.SizeBytes, ct);
            var compatibility = await InspectFileAsync(paths.Compatibility, asset.CompatibilityPath,
                asset.CompatibilitySha256, asset.CompatibilitySizeBytes, ct);
            result.Add(new MediaDiagnosticSnapshot(
                asset.Id, asset.FileName, asset.RelativePath, asset.ContentType, asset.SizeBytes, asset.Sha256,
                asset.CreatedAt, asset.ProcessingStatus, asset.ProcessingError, asset.CompatibilityStatus,
                asset.CompatibilityError, asset.CompatibilityPath, asset.CompatibilitySha256,
                asset.CompatibilitySizeBytes, asset.VideoCodec, asset.AudioCodec, asset.Width, asset.Height,
                asset.OfflineEligible, asset.Version, asset.StoragePolicy, asset.SourceKind,
                original, compatibility,
                asset.TranscodeVariants.OrderBy(item => item.Profile).Select(item => new MediaVariantDiagnostic(
                    item.Id, item.Profile, item.Status, item.RelativePath, item.Sha256, item.SizeBytes,
                    item.Width, item.Height, item.VideoBitrateKbps, item.SourceVersion, item.Error,
                    item.TranscodeEngine, item.QueuedAt, item.StartedAt, item.CompletedAt)).ToArray()));
        }

        return result;
    }

    private static async Task<MediaFileDiagnostic?> InspectFileAsync(
        string root, string? relativePath, string? expectedSha256, long? expectedSizeBytes, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return null;
        var path = Resolve(root, relativePath);
        if (path is null)
            return new MediaFileDiagnostic(relativePath, false, null, null, null, expectedSha256,
                expectedSizeBytes is null ? null : false, "path is outside the configured media root");

        FileInfo info;
        try
        {
            info = new FileInfo(path);
            if (!info.Exists)
                return new MediaFileDiagnostic(relativePath, false, null, null, null, expectedSha256,
                    expectedSizeBytes is null ? null : false, "file does not exist");

            var sizeMatches = expectedSizeBytes is null || info.Length == expectedSizeBytes.Value;
            if (expectedSha256 is null)
                return new MediaFileDiagnostic(relativePath, true, info.Length, null, null, null, sizeMatches, null);
            if (info.Length > MaximumHashBytes)
                return new MediaFileDiagnostic(relativePath, true, info.Length, null, null, expectedSha256,
                    sizeMatches ? null : false, $"SHA-256 skipped for files larger than {MaximumHashBytes} bytes");

            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
                128 * 1024, FileOptions.SequentialScan | FileOptions.Asynchronous);
            var actualSha256 = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
            return new MediaFileDiagnostic(relativePath, true, info.Length, actualSha256,
                string.Equals(actualSha256, expectedSha256, StringComparison.OrdinalIgnoreCase), expectedSha256,
                sizeMatches && string.Equals(actualSha256, expectedSha256, StringComparison.OrdinalIgnoreCase), null);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            return new MediaFileDiagnostic(relativePath, false, null, null, null, expectedSha256,
                expectedSha256 is null ? null : false, $"could not read file: {error.Message}");
        }
    }

    private static string? Resolve(string root, string relativePath)
    {
        try
        {
            var rootFull = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            var candidate = Path.GetFullPath(Path.Combine(rootFull, relativePath));
            return candidate.StartsWith(rootFull, StringComparison.Ordinal) ? candidate : null;
        }
        catch (ArgumentException) { return null; }
    }
}

public sealed record MediaDiagnosticSnapshot(
    Guid Id,
    string FileName,
    string RelativePath,
    string ContentType,
    long SizeBytes,
    string? Sha256,
    DateTimeOffset CreatedAt,
    string ProcessingStatus,
    string? ProcessingError,
    string CompatibilityStatus,
    string? CompatibilityError,
    string? CompatibilityPath,
    string? CompatibilitySha256,
    long? CompatibilitySizeBytes,
    string? VideoCodec,
    string? AudioCodec,
    int? Width,
    int? Height,
    bool OfflineEligible,
    int Version,
    string StoragePolicy,
    string SourceKind,
    MediaFileDiagnostic? OriginalFile,
    MediaFileDiagnostic? CompatibilityFile,
    IReadOnlyList<MediaVariantDiagnostic> Transcodes);

public sealed record MediaFileDiagnostic(
    string RelativePath,
    bool Exists,
    long? DiskSizeBytes,
    string? DiskSha256,
    bool? Sha256Matches,
    string? ExpectedSha256,
    bool? SizeAndSha256Match,
    string? CheckError);

public sealed record MediaVariantDiagnostic(
    Guid Id,
    string Profile,
    string Status,
    string? RelativePath,
    string? Sha256,
    long? SizeBytes,
    int Width,
    int Height,
    int VideoBitrateKbps,
    int SourceVersion,
    string? Error,
    string? TranscodeEngine,
    DateTimeOffset QueuedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt);

public static class MediaDependencyDiagnostics
{
    public static object Build(MediaStoragePaths paths)
    {
        var workerCandidates = new[]
        {
            "/usr/local/libexec/lessoncue-media-worker",
            Path.Combine(AppContext.BaseDirectory, "lessoncue-media-worker")
        }.Distinct(StringComparer.Ordinal);
        var commands = new[] { "ffmpeg", "ffprobe", "setpriv" }
            .Select(command => new { command, path = FindOnPath(command), available = FindOnPath(command) is not null })
            .ToArray();
        var youtube = new
        {
            ytDlp = RuntimeState("yt-dlp", "LESSONCUE_YTDLP_PATH"),
            deno = RuntimeState("deno", "LESSONCUE_DENO_PATH"),
            jsRuntimeRequired = true,
            requirement = "yt-dlp YouTube extraction requires a supported JavaScript runtime; LessonCue bundles Deno 2.3 or newer."
        };
        var worker = workerCandidates.Select(path => new
        {
            path,
            exists = File.Exists(path),
            executable = IsExecutable(path),
            readable = CanRead(path)
        }).ToArray();

        return new
        {
            commands,
            youtube,
            mediaWorker = worker,
            storage = new
            {
                dataPath = paths.DataPath,
                originals = DirectoryState(paths.Originals),
                thumbnails = DirectoryState(paths.Thumbnails),
                compatibility = DirectoryState(paths.Compatibility),
                transcodes = DirectoryState(paths.Transcodes),
                temporary = DirectoryState(paths.Temporary)
            },
            workerRuntime = new
            {
                linux = OperatingSystem.IsLinux(),
                mode = OperatingSystem.IsLinux() ? "direct-systemd-bounded-worker" : "platform-native",
                worker = "/usr/local/libexec/lessoncue-media-worker",
                limits = new[] { "wall-time", "CPU", "address-space", "output-file-size", "process-count", "open-files", "captured-output" },
                serviceBoundary = "lessoncue service account, NoNewPrivileges, ProtectSystem=strict, ProtectHome, PrivateTmp, capability bounding set",
                localConverterProtocols = "file,pipe,crypto,data",
                networkNote = "The direct worker does not create a network namespace. FFmpeg/FFprobe media inputs are restricted to local protocols; deployments should keep the LessonCue service network policy unchanged for server features that require outbound access."
            }
        };
    }

    private static object RuntimeState(string command, string environmentName)
    {
        var configured = Environment.GetEnvironmentVariable(environmentName);
        var bundled = YouTubeRuntimeLocator.BundledPath(command);
        var selected = YouTubeRuntimeLocator.FindExecutable(environmentName, command);
        var available = selected is not null && YouTubeRuntimeLocator.IsUsable(selected);
        var readable = selected is not null && CanRead(selected);
        return new
        {
            command,
            configured,
            bundled,
            path = selected,
            available,
            executable = available,
            readable
        };
    }

    private static string? FindOnPath(string command)
    {
        var path = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(path)) return null;
        foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(directory, command);
            if (File.Exists(candidate) && IsExecutable(candidate)) return candidate;
        }
        return null;
    }

    private static object DirectoryState(string path)
    {
        var exists = Directory.Exists(path);
        var readable = false;
        var writable = false;
        string? error = null;
        try
        {
            if (exists)
            {
                _ = Directory.EnumerateFileSystemEntries(path).Take(1).ToArray();
                readable = true;
                var probe = Path.Combine(path, $".lessoncue-diagnostic-{Guid.NewGuid():N}");
                File.WriteAllText(probe, "diagnostic probe");
                File.Delete(probe);
                writable = true;
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            error = exception.Message;
        }
        return new { path, exists, readable, writable, error };
    }

    private static bool CanRead(string path)
    {
        try
        {
            if (!File.Exists(path)) return false;
            using var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            return stream.CanRead;
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    private static bool IsExecutable(string path)
    {
        if (!File.Exists(path)) return false;
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS()) return true;
        try
        {
            var mode = File.GetUnixFileMode(path);
            return mode.HasFlag(UnixFileMode.UserExecute) || mode.HasFlag(UnixFileMode.GroupExecute) || mode.HasFlag(UnixFileMode.OtherExecute);
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

}
