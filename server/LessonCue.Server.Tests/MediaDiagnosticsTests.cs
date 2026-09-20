using System.Security.Cryptography;
using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaDiagnosticsTests
{
    [Fact]
    public async Task TroubleshootingEvidenceComparesDatabaseAndPhysicalOriginal()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-media-diagnostics-{Guid.NewGuid():N}");
        var paths = new MediaStoragePaths(root);
        Directory.CreateDirectory(paths.Originals);
        var bytes = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4V8AAAAASUVORK5CYII=");
        var relative = "asset.png";
        await File.WriteAllBytesAsync(Path.Combine(paths.Originals, relative), bytes, ct);
        var sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(ct);
        var media = new MediaAsset
        {
            FileName = "lesson.png", RelativePath = relative, ContentType = "image/png",
            Sha256 = sha, SizeBytes = bytes.Length, ProcessingStatus = "ready",
            CompatibilityStatus = "not-needed", OfflineEligible = true
        };
        db.MediaAssets.Add(media);
        await db.SaveChangesAsync(ct);

        var result = Assert.Single(await MediaDiagnostics.BuildAsync(db, paths, ct: ct));

        Assert.Equal(media.Id, result.Id);
        Assert.Equal("ready", result.ProcessingStatus);
        Assert.True(result.OriginalFile?.Exists);
        Assert.Equal(bytes.Length, result.OriginalFile?.DiskSizeBytes);
        Assert.Equal(sha, result.OriginalFile?.DiskSha256);
        Assert.True(result.OriginalFile?.SizeAndSha256Match);
        Assert.Null(result.CompatibilityFile);

        Directory.Delete(root, true);
    }

    [Fact]
    public async Task RetryValidationRejectsChangedOriginalWithoutMutatingIt()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-media-recovery-{Guid.NewGuid():N}");
        var paths = new MediaStoragePaths(root);
        Directory.CreateDirectory(paths.Originals);
        var bytes = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4V8AAAAASUVORK5CYII=");
        var path = Path.Combine(paths.Originals, "asset.png");
        await File.WriteAllBytesAsync(path, bytes, ct);
        var media = new MediaAsset
        {
            FileName = "asset.png", RelativePath = "asset.png", ContentType = "image/png",
            Sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), SizeBytes = bytes.Length
        };

        var valid = await MediaRecovery.ValidateOriginalAsync(media, paths, ct);
        Assert.True(valid.Valid);
        await File.AppendAllTextAsync(path, "changed", ct);
        var changed = await MediaRecovery.ValidateOriginalAsync(media, paths, ct);
        Assert.False(changed.Valid);
        Assert.False(changed.Sha256Matches);

        Directory.Delete(root, true);
    }

    [Fact]
    public void ProcessingRuntimeFailuresAreRecoverableButMalformedMediaIsNot()
    {
        Assert.True(MediaProcessingService.IsRecoverableInfrastructureFailure(
            new InvalidOperationException("The required LessonCue media sandbox is unavailable.")));
        Assert.True(MediaProcessingService.IsRecoverableInfrastructureFailure(
            new IOException("permission denied while opening the media worker")));
        Assert.False(MediaProcessingService.IsRecoverableInfrastructureFailure(
            new InvalidDataException("The contents do not match the MP4 file type.")));
    }
}
