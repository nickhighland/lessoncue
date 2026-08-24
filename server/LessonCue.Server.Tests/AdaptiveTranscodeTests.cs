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

    [Fact]
    public async Task QueueingSurvivesAnotherWriterQueueingTheSameProfileFirst()
    {
        // The administrator's request is not the only writer: the screen prewarm
        // queues the same profiles from its own context. Both read nothing, both
        // insert, and the unique index turned the loser into a 500 for work the
        // winner had already scheduled.
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;

        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test Organization" });
        var media = ReadyVideo("contested.mp4", DateTimeOffset.UtcNow);
        db.MediaAssets.Add(media);
        await db.SaveChangesAsync(cancellationToken);

        // This context reads before the other writer commits, so it sees nothing.
        await AdaptiveTranscodeService.QueueAsync(db, media, AdaptiveTranscodeProfiles.Balanced720, cancellationToken);

        await using (var other = new LessonCueDb(options))
        {
            var winner = await other.MediaAssets.SingleAsync(x => x.Id == media.Id, cancellationToken);
            await AdaptiveTranscodeService.QueueAsync(other, winner, AdaptiveTranscodeProfiles.Balanced720, cancellationToken);
            await other.SaveChangesAsync(cancellationToken);
        }

        await AdaptiveTranscodeService.SaveQueuedAsync(db, cancellationToken);

        await using var reader = new LessonCueDb(options);
        var variants = await reader.MediaTranscodeVariants
            .Where(x => x.MediaAssetId == media.Id).ToListAsync(cancellationToken);
        Assert.Single(variants);
        Assert.Equal("pending", variants[0].Status);
    }

    [Fact]
    public async Task SavingStillReportsAConstraintFailureThatIsNotADuplicateProfile()
    {
        // The tolerance is for one specific lost race, not a licence to swallow
        // whatever the database refuses.
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test Organization" });
        await db.SaveChangesAsync(cancellationToken);

        // No such media asset, so the foreign key is what fails.
        db.MediaTranscodeVariants.Add(new MediaTranscodeVariant
        {
            MediaAssetId = Guid.NewGuid(), Profile = AdaptiveTranscodeProfiles.Balanced720,
            Status = "pending", QueuedAt = DateTimeOffset.UtcNow
        });

        await Assert.ThrowsAsync<DbUpdateException>(
            () => AdaptiveTranscodeService.SaveQueuedAsync(db, cancellationToken));
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
