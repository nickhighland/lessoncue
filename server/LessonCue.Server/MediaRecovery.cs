using System.Security.Cryptography;

namespace LessonCue.Server;

public sealed record MediaSourceValidation(
    bool Valid,
    bool Exists,
    long? DiskSizeBytes,
    bool? Sha256Matches,
    string? Error);

public static class MediaRecovery
{
    public static async Task<MediaSourceValidation> ValidateOriginalAsync(
        MediaAsset media, MediaStoragePaths paths, CancellationToken ct = default)
    {
        var original = Resolve(paths.Originals, media.RelativePath);
        if (original is null)
            return new(false, false, null, null, "The recorded original path is outside LessonCue storage.");
        if (!File.Exists(original))
            return new(false, false, null, media.Sha256 is null ? null : false,
                "The original file is missing from LessonCue storage.");

        try
        {
            var info = new FileInfo(original);
            if (info.Length != media.SizeBytes)
                return new(false, true, info.Length, media.Sha256 is null ? null : false,
                    $"The original size is {info.Length} bytes, but the MediaAsset records {media.SizeBytes} bytes.");

            string? actualSha256 = null;
            if (!string.IsNullOrWhiteSpace(media.Sha256))
            {
                await using var stream = new FileStream(original, FileMode.Open, FileAccess.Read, FileShare.Read,
                    128 * 1024, FileOptions.SequentialScan | FileOptions.Asynchronous);
                actualSha256 = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
                if (!string.Equals(actualSha256, media.Sha256, StringComparison.OrdinalIgnoreCase))
                    return new(false, true, info.Length, false,
                        $"The original SHA-256 is {actualSha256}, but the MediaAsset records {media.Sha256}.");
            }

            var inspection = MediaContentInspector.Inspect(original, media.RelativePath);
            if (!inspection.Valid)
                return new(false, true, info.Length, string.IsNullOrWhiteSpace(media.Sha256) ? null : true,
                    inspection.Error ?? "The original file failed LessonCue content validation.");
            return new(true, true, info.Length, string.IsNullOrWhiteSpace(media.Sha256) ? null : true, null);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException)
        {
            return new(false, true, null, null, $"The original could not be read safely: {error.Message}");
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
