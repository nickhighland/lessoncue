using LessonCue.Server;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class UploadSessionTests
{
    [Fact]
    public void ChunkBitmapTracksReceivedAndMissingChunks()
    {
        var bitmap = UploadChunkBitmap.Empty(4);
        bitmap = UploadChunkBitmap.Set(bitmap, 1);
        bitmap = UploadChunkBitmap.Set(bitmap, 3);

        Assert.False(UploadChunkBitmap.Has(bitmap, 0));
        Assert.True(UploadChunkBitmap.Has(bitmap, 1));
        Assert.Equal([0, 2], UploadChunkBitmap.Missing(bitmap));
    }

    [Fact]
    public void QuotaPolicyUsesStrictestApplicableAccountLimitAndCodecAllowlist()
    {
        var ownerId = Guid.NewGuid();
        var policy = UploadQuotaPolicy.Normalize(new UploadQuotaPolicyInput(
            MaxFileBytes: 20_000,
            MaxDailyBytes: 10_000,
            MaxActiveSessionsPerUser: 4,
            UserDailyBytes: new Dictionary<string, long> { ["alex"] = 8_000 },
            RoleDailyBytes: new Dictionary<string, long> { ["Editor"] = 6_000 },
            ClassDailyBytes: new Dictionary<string, long> { ["Science"] = 40_000 },
            AllowedVideoCodecs: ["h264"],
            AllowedAudioCodecs: ["aac"]));

        Assert.Equal(6_000, policy.UserLimit(ownerId, "alex", "Editor"));
        Assert.Equal(40_000, policy.ClassLimit(Guid.NewGuid(), "Science"));
        Assert.True(policy.Allows("h264", "aac"));
        Assert.False(policy.Allows("hevc", "aac"));
    }

    [Fact]
    public async Task StorageReservationsAreAtomicAndVisible()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-reservation-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllBytesAsync(Path.Combine(root, "existing.bin"), new byte[100], ct);
        try
        {
            await using var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync(ct);
            var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(ct);
            db.Organizations.Add(new Organization { Name = "Test", StorageLimitBytes = 1_000 });
            await db.SaveChangesAsync(ct);
            var storage = new StorageService(root);

            var first = Session(600);
            var reserved = await storage.ReserveUploadAsync(db, first, ct);
            Assert.True(reserved.Allowed);
            Assert.Equal(300, reserved.Snapshot.RemainingBytes);

            var snapshot = await storage.GetSnapshotAsync(db, ct);
            Assert.Equal(600, snapshot.ReservedBytes);
            Assert.Equal(300, snapshot.RemainingBytes);

            var rejected = await storage.ReserveUploadAsync(db, Session(301), ct);
            Assert.False(rejected.Allowed);
            Assert.Equal(1, await db.UploadSessions.CountAsync(ct));
        }
        finally
        {
            Directory.Delete(root, true);
        }

        static UploadSession Session(long bytes) => new()
        {
            FileName = "upload.png",
            ExpectedLength = bytes,
            ReservedBytes = bytes,
            ChunkSize = (int)bytes,
            ChunkCount = 1,
            ChunkBitmap = "0"
        };
    }

    [Fact]
    public async Task UploadCanPauseResumeCompleteAndCleanUpExpiredPartials()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-upload-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var databasePath = Path.Combine(root, "lessoncue.db");
        await using var connection = new SqliteConnection($"Data Source={databasePath}");
        await connection.OpenAsync(ct);
        var services = new ServiceCollection();
        services.AddSingleton(connection);
        services.AddDbContext<LessonCueDb>((provider, options) =>
            options.UseSqlite(provider.GetRequiredService<SqliteConnection>()));
        services.AddLogging();
        await using var provider = services.BuildServiceProvider();
        var paths = new MediaStoragePaths(root);
        Directory.CreateDirectory(paths.Originals);
        var storage = new StorageService(root);
        var service = new UploadSessionService(
            provider.GetRequiredService<IServiceScopeFactory>(),
            paths,
            storage,
            provider.GetRequiredService<ILogger<UploadSessionService>>());
        try
        {
            using var scope = provider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
            await db.Database.EnsureCreatedAsync(ct);
            var owner = Guid.NewGuid();
            db.Organizations.Add(new Organization { Name = "Test", StorageLimitBytes = 20 * 1024 * 1024 });
            await db.SaveChangesAsync(ct);

            var png = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4V8AAAAASUVORK5CYII=");
            var create = await service.CreateAsync(db, owner, "alex", "Editor",
                new UploadCreateInput("pixel.png", png.Length, "image/png", Persistent: true), ct);
            Assert.True(create.Success);
            var upload = create.Session!;

            var paused = await service.ChangeStateAsync(db, upload.Id, owner, true, ct);
            Assert.Equal(UploadSessionStates.Paused, paused.Session!.State);
            var blocked = await service.WriteChunkAsync(db, upload.Id, owner, 0,
                new MemoryStream(png), png.Length, ct);
            Assert.Equal(StatusCodes.Status409Conflict, blocked.StatusCode);

            await service.ChangeStateAsync(db, upload.Id, owner, false, ct);
            var written = await service.WriteChunkAsync(db, upload.Id, owner, 0,
                new MemoryStream(png), png.Length, ct);
            Assert.True(written.Success);
            Assert.Equal(png.Length, written.Session!.ReceivedBytes);

            var completed = await service.CompleteAsync(db, upload.Id, owner,
                new UploadCompleteInput(), ct);
            Assert.True(completed.Success);
            Assert.False(completed.Duplicate);
            Assert.Equal("image/png", completed.Media!.ContentType);
            Assert.True(File.Exists(Path.Combine(paths.Originals, completed.Media.RelativePath)));

            var expired = new UploadSession
            {
                OwnerAccountId = owner,
                FileName = "abandoned.png",
                ExpectedLength = 100,
                ReservedBytes = 100,
                ChunkSize = 100,
                ChunkCount = 1,
                ChunkBitmap = "1",
                ReceivedBytes = 100,
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1)
            };
            db.UploadSessions.Add(expired);
            await db.SaveChangesAsync(ct);
            var expiredFolder = Path.Combine(paths.Temporary, expired.Id.ToString("N"));
            Directory.CreateDirectory(expiredFolder);
            await File.WriteAllBytesAsync(Path.Combine(expiredFolder, "00000000"), new byte[100], ct);

            Assert.Equal(1, await service.CleanupAsync(DateTimeOffset.UtcNow, ct));
            db.ChangeTracker.Clear();
            var cleaned = await db.UploadSessions.SingleAsync(value => value.Id == expired.Id, ct);
            Assert.Equal(UploadSessionStates.Expired, cleaned.State);
            Assert.False(Directory.Exists(expiredFolder));
        }
        finally
        {
            await connection.CloseAsync();
            Directory.Delete(root, true);
        }
    }
}
