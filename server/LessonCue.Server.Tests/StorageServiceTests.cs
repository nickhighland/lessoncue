using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class StorageServiceTests
{
    [Fact]
    public async Task EnforcesConfiguredAllocationAgainstFilesAlreadyStored()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-storage-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllBytesAsync(Path.Combine(root, "existing.bin"), new byte[100], cancellationToken);
        try
        {
            await using var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync(cancellationToken);
            var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(cancellationToken);
            db.Organizations.Add(new Organization { Name = "Test Organization", StorageLimitBytes = 1024 });
            await db.SaveChangesAsync(cancellationToken);

            var service = new StorageService(root);
            var snapshot = await service.GetSnapshotAsync(db, cancellationToken);

            Assert.Equal(100, snapshot.UsedBytes);
            Assert.Equal(924, snapshot.RemainingBytes);
            Assert.NotNull(await service.EnsureAvailableAsync(db, 924, cancellationToken));
            Assert.Null(await service.EnsureAvailableAsync(db, 925, cancellationToken));
        }
        finally { Directory.Delete(root, true); }
    }
}
