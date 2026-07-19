using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AdaptiveTranscodeTests
{
    [Fact]
    public async Task QueuesNewestReadyUploadWheneverWorkerIsIdle()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test Organization" });
        var older = ReadyVideo("older.mp4", DateTimeOffset.UtcNow.AddMinutes(-2));
        var newest = ReadyVideo("newest.mp4", DateTimeOffset.UtcNow.AddMinutes(-1));
        db.MediaAssets.AddRange(older, newest);
        await db.SaveChangesAsync(cancellationToken);

        var queued = await AdaptiveTranscodeService.QueueNextIdleUploadAsync(db, cancellationToken);

        Assert.NotNull(queued);
        Assert.Equal(newest.Id, queued.MediaAssetId);
        Assert.Equal(AdaptiveTranscodeProfiles.Balanced720, queued.Profile);
        Assert.Equal("pending", queued.Status);
        Assert.Single(await db.MediaTranscodeVariants.ToListAsync(cancellationToken));
    }

    [Fact]
    public async Task DoesNotQueueOpportunisticUploadWhileWorkerHasScheduledWork()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test Organization" });
        var media = ReadyVideo("waiting.mp4", DateTimeOffset.UtcNow);
        db.MediaAssets.Add(media);
        db.MediaTranscodeVariants.Add(new MediaTranscodeVariant
        {
            MediaAssetId = media.Id,
            Profile = AdaptiveTranscodeProfiles.DataSaver480,
            Status = "pending",
            Width = 854,
            Height = 480,
            VideoBitrateKbps = 1_500,
            SourceVersion = media.Version
        });
        await db.SaveChangesAsync(cancellationToken);

        var queued = await AdaptiveTranscodeService.QueueNextIdleUploadAsync(db, cancellationToken);

        Assert.Null(queued);
        Assert.Single(await db.MediaTranscodeVariants.ToListAsync(cancellationToken));
    }

    private static MediaAsset ReadyVideo(string fileName, DateTimeOffset createdAt) => new()
    {
        FileName = fileName,
        ContentType = "video/mp4",
        RelativePath = fileName,
        ProcessingStatus = "ready",
        CompatibilityStatus = "native",
        VideoCodec = "h264",
        CreatedAt = createdAt
    };
}
