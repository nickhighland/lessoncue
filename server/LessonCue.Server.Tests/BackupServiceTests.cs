using System.IO.Compression;
using LessonCue.Server;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class BackupServiceTests
{
    [Fact]
    public async Task FullBackupCanBePreviewedAndRestoredWithSafetyBackup()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-restore-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        Directory.CreateDirectory(Path.Combine(root, "config"));
        Directory.CreateDirectory(Path.Combine(root, "media", "originals"));
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>()
                .UseSqlite($"Data Source={Path.Combine(root, "database", "lessoncue.db")}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(ct);
            db.AddRange(new Organization { Name = "Restored Academy" }, new LessonClass { Name = "Science" },
                new AdminAccount { Username = "owner", DisplayName = "Owner", PasswordHash = "hash" },
                new MediaAsset { FileName = "lesson.mp4", RelativePath = "lesson.mp4", SizeBytes = 8 });
            await db.SaveChangesAsync(ct);
            await File.WriteAllTextAsync(Path.Combine(root, "media", "originals", "lesson.mp4"), "original", ct);
            await File.WriteAllTextAsync(Path.Combine(root, "config", "cloudflare-token.pending"), "must-not-be-backed-up", ct);
            var service = new BackupService(root);
            var backup = await service.CreateAsync(db, true, "owner", ct);
            using (var created = ZipFile.OpenRead(service.Resolve(backup.FileName)!))
                Assert.DoesNotContain(created.Entries, entry => entry.FullName.EndsWith("cloudflare-token.pending", StringComparison.Ordinal));
            await using var archive = File.OpenRead(service.Resolve(backup.FileName)!);
            var preview = await service.StageAsync(archive, backup.FileName, archive.Length, ct);

            Assert.Equal("full", preview.Kind);
            Assert.Equal("Restored Academy", preview.Organization);
            Assert.Equal(1, preview.Users);
            Assert.Equal(1, preview.Classes);
            Assert.True(preview.IncludesMedia);

            (await db.Organizations.SingleAsync(ct)).Name = "Changed after backup";
            await db.SaveChangesAsync(ct);
            await File.WriteAllTextAsync(Path.Combine(root, "media", "originals", "lesson.mp4"), "changed", ct);

            var result = await service.RestoreAsync(db, preview.RestoreId, "owner", ct);
            db.ChangeTracker.Clear();

            Assert.Equal("Restored Academy", (await db.Organizations.SingleAsync(ct)).Name);
            Assert.Equal("original", await File.ReadAllTextAsync(Path.Combine(root, "media", "originals", "lesson.mp4"), ct));
            Assert.True(result.MediaRestored);
            Assert.NotNull(service.Resolve(result.SafetyBackupFileName));
            Assert.True(await db.BackupRecords.AnyAsync(x => x.Id == result.SafetyBackupId, ct));
            Assert.True(await db.AuditEvents.AnyAsync(x => x.Action == "backup.restore", ct));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public async Task ConfigurationRestorePreservesCurrentMediaFiles()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-restore-config-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        Directory.CreateDirectory(Path.Combine(root, "media", "originals"));
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>()
                .UseSqlite($"Data Source={Path.Combine(root, "database", "lessoncue.db")}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(ct);
            db.Organizations.Add(new Organization { Name = "Configuration Source" });
            await db.SaveChangesAsync(ct);
            var service = new BackupService(root);
            var backup = await service.CreateAsync(db, false, "owner", ct);
            await File.WriteAllTextAsync(Path.Combine(root, "media", "originals", "local.mp4"), "keep me", ct);
            await using var archive = File.OpenRead(service.Resolve(backup.FileName)!);
            var preview = await service.StageAsync(archive, backup.FileName, archive.Length, ct);

            var result = await service.RestoreAsync(db, preview.RestoreId, "owner", ct);

            Assert.False(result.MediaRestored);
            Assert.Equal("keep me", await File.ReadAllTextAsync(Path.Combine(root, "media", "originals", "local.mp4"), ct));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public async Task PreviewRejectsArchiveTraversal()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-restore-unsafe-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var zipPath = Path.Combine(root, "unsafe.zip");
        try
        {
            using (var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create))
            {
                var entry = zip.CreateEntry("../outside.txt");
                await using var writer = new StreamWriter(entry.Open());
                await writer.WriteAsync("unsafe");
            }
            var service = new BackupService(root);
            await using var archive = File.OpenRead(zipPath);
            await Assert.ThrowsAsync<InvalidDataException>(() =>
                service.StageAsync(archive, "unsafe.zip", archive.Length, ct));
            Assert.False(File.Exists(Path.Combine(root, "outside.txt")));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
