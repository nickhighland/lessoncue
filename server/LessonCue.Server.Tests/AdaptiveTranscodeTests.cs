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
    public async Task QueuesEveryAdaptiveProfileImmediatelyForReadyVideo()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test Organization" });
        var media = ReadyVideo("immediate.mp4", DateTimeOffset.UtcNow);
        db.MediaAssets.Add(media);
        await db.SaveChangesAsync(cancellationToken);

        var queued = await AdaptiveTranscodeService.QueueReadyVideoProfilesAsync(db, cancellationToken);

        Assert.Equal(AdaptiveTranscodeProfiles.All.Count, queued);
        var variants = await db.MediaTranscodeVariants
            .Where(x => x.MediaAssetId == media.Id)
            .ToListAsync(cancellationToken);
        Assert.Equal(AdaptiveTranscodeProfiles.All.Count, variants.Count);
        Assert.All(variants, variant =>
        {
            Assert.Equal("pending", variant.Status);
            Assert.Equal(media.Version, variant.SourceVersion);
        });
        Assert.Equal(0, await AdaptiveTranscodeService.QueueReadyVideoProfilesAsync(db, cancellationToken));
    }

    [Fact]
    public async Task QueuesAdaptiveProfilesBeforeCompatibilityCopyCompletes()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test Organization" });
        var media = ReadyVideo("compatibility-pending.mp4", DateTimeOffset.UtcNow);
        media.CompatibilityStatus = "pending";
        db.MediaAssets.Add(media);
        await db.SaveChangesAsync(cancellationToken);

        var queued = await AdaptiveTranscodeService.QueueReadyVideoProfilesAsync(db, cancellationToken);

        Assert.Equal(AdaptiveTranscodeProfiles.All.Count, queued);
        Assert.All(await db.MediaTranscodeVariants.ToListAsync(cancellationToken), variant =>
            Assert.Equal("pending", variant.Status));
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
    public async Task DoesNotQueueStillImagesEvenWhenLegacyProbeRecordedAnImageCodec()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test Organization" });
        db.MediaAssets.Add(new MediaAsset
        {
            FileName = "slide.jpeg",
            ContentType = "image/jpeg",
            RelativePath = "slide.jpeg",
            ProcessingStatus = "ready",
            CompatibilityStatus = "not-needed",
            VideoCodec = "mjpeg",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(cancellationToken);

        var queued = await AdaptiveTranscodeService.QueueNextIdleUploadAsync(db, cancellationToken);

        Assert.Null(queued);
        Assert.Empty(await db.MediaTranscodeVariants.ToListAsync(cancellationToken));
    }

    [Fact]
    public async Task DirectQueuePathRejectsStillImages()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        var image = new MediaAsset
        {
            FileName = "slide.png",
            ContentType = "image/png",
            RelativePath = "slide.png",
            ProcessingStatus = "ready",
            CompatibilityStatus = "not-needed",
            VideoCodec = "mjpeg"
        };
        db.MediaAssets.Add(image);
        await db.SaveChangesAsync(cancellationToken);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            AdaptiveTranscodeService.QueueAsync(db, image, AdaptiveTranscodeProfiles.Balanced720, cancellationToken));

        Assert.Empty(await db.MediaTranscodeVariants.ToListAsync(cancellationToken));
    }

    [Fact]
    public async Task RemovesLegacyStillImageVariantsAndTheirDerivedFiles()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-adaptive-cleanup-{Guid.NewGuid():N}");
        var paths = new MediaStoragePaths(root);
        Directory.CreateDirectory(paths.Transcodes);
        var storedFile = Path.Combine(paths.Transcodes, "stale.mp4");
        await File.WriteAllTextAsync(storedFile, "stale", cancellationToken);

        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        var image = new MediaAsset
        {
            FileName = "slide.jpeg",
            ContentType = "image/jpeg",
            RelativePath = "slide.jpeg",
            ProcessingStatus = "ready",
            CompatibilityStatus = "not-needed",
            VideoCodec = "mjpeg"
        };
        db.MediaAssets.Add(image);
        db.MediaTranscodeVariants.Add(new MediaTranscodeVariant
        {
            MediaAsset = image,
            Profile = AdaptiveTranscodeProfiles.DataSaver480,
            Status = "failed",
            RelativePath = "stale.mp4",
            Error = "The universal playback source is not ready.",
            SourceVersion = image.Version
        });
        await db.SaveChangesAsync(cancellationToken);

        var removed = await AdaptiveTranscodeService.RemoveIneligibleVariantsAsync(db, paths, cancellationToken);

        Assert.Equal(1, removed);
        Assert.Empty(await db.MediaTranscodeVariants.ToListAsync(cancellationToken));
        Assert.False(File.Exists(storedFile));
        Directory.Delete(root, true);
    }

    [Fact]
    public async Task RequeuesHistoricalMissingWorkerFailuresForCurrentVideos()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        var media = ReadyVideo("recovery.mp4", DateTimeOffset.UtcNow);
        db.MediaAssets.Add(media);
        db.MediaTranscodeVariants.Add(new MediaTranscodeVariant
        {
            MediaAsset = media,
            Profile = AdaptiveTranscodeProfiles.DataSaver480,
            Status = "failed",
            Error = "An error occurred trying to start process 'lessoncue-media-worker'. No such file or directory",
            SourceVersion = media.Version,
            QueuedAt = DateTimeOffset.UtcNow.AddDays(-30),
            CompletedAt = DateTimeOffset.UtcNow.AddDays(-30)
        });
        await db.SaveChangesAsync(cancellationToken);

        var requeued = await AdaptiveTranscodeService.RecoverKnownEnvironmentFailuresAsync(db, cancellationToken);

        var variant = Assert.Single(await db.MediaTranscodeVariants.ToListAsync(cancellationToken));
        Assert.Equal(1, requeued);
        Assert.Equal("pending", variant.Status);
        Assert.Null(variant.Error);
        Assert.Null(variant.CompletedAt);
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
