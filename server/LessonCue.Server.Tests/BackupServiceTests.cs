using System.IO.Compression;
using System.Text.Json.Nodes;
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
        Directory.CreateDirectory(Path.Combine(root, "config", "keys"));
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
            await File.WriteAllTextAsync(Path.Combine(root, "config", "email-provider.json"), "protected-email-key", ct);
            await File.WriteAllTextAsync(Path.Combine(root, "config", "pairing-secret"), "pairing-secret", ct);
            await File.WriteAllTextAsync(Path.Combine(root, "config", "keys", "data-protection.xml"), "local-key", ct);
            var service = new BackupService(root);
            var backup = await service.CreateAsync(db, true, "owner", ct);
            var verification = await service.VerifyStoredAsync(backup, ct);
            Assert.Equal("Restored Academy", verification.Organization);
            Assert.True(verification.FileCount >= 3);
            using (var created = ZipFile.OpenRead(service.Resolve(backup.FileName)!))
            {
                Assert.DoesNotContain(created.Entries, entry => entry.FullName.EndsWith("cloudflare-token.pending", StringComparison.Ordinal));
                Assert.DoesNotContain(created.Entries, entry => entry.FullName == "config/email-provider.json");
                Assert.DoesNotContain(created.Entries, entry => entry.FullName == "config/pairing-secret");
                Assert.DoesNotContain(created.Entries, entry => entry.FullName.StartsWith("config/keys/", StringComparison.Ordinal));
            }
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

    [Fact]
    public async Task PasswordEncryptedBackupAuthenticatesArchiveAndCanIncludeProtectedSecrets()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-encrypted-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        Directory.CreateDirectory(Path.Combine(root, "config", "keys"));
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>()
                .UseSqlite($"Data Source={Path.Combine(root, "database", "lessoncue.db")}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(ct);
            db.Organizations.Add(new Organization { Name = "Encrypted Academy" });
            await db.SaveChangesAsync(ct);
            await File.WriteAllTextAsync(
                Path.Combine(root, "config", "email-provider.json"), "protected-provider-key", ct);
            await File.WriteAllTextAsync(
                Path.Combine(root, "config", "keys", "data-protection.xml"), "local-key", ct);
            const string password = "correct horse battery staple";
            var service = new BackupService(root);

            var backup = await service.CreateAsync(
                db, false, "owner", ct, password, "include");

            Assert.EndsWith(".lcbak", backup.FileName, StringComparison.Ordinal);
            var path = service.Resolve(backup.FileName)!;
            await using (var input = File.OpenRead(path))
                Assert.True(BackupArchiveEncryption.IsEncrypted(input));
            var preview = await service.VerifyStoredAsync(backup, ct, password);
            Assert.True(preview.Encrypted);
            Assert.Equal("include", preview.SecretHandling);
            Assert.Contains(preview.Warnings, warning => warning.Contains("credentials", StringComparison.OrdinalIgnoreCase));
            await Assert.ThrowsAsync<InvalidDataException>(
                () => service.VerifyStoredAsync(backup, ct, "this password is incorrect"));

            var decrypted = Path.Combine(root, "decrypted.zip");
            await BackupArchiveEncryption.DecryptAsync(path, decrypted, password, ct);
            using (var archive = ZipFile.OpenRead(decrypted))
            {
                Assert.Contains(archive.Entries, entry => entry.FullName == "config/email-provider.json");
                Assert.Contains(archive.Entries, entry => entry.FullName == "config/keys/data-protection.xml");
            }

            await using (var stream = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            {
                stream.Position = stream.Length - 1;
                var value = stream.ReadByte();
                stream.Position = stream.Length - 1;
                stream.WriteByte((byte)(value ^ 0x5a));
            }
            await Assert.ThrowsAsync<InvalidDataException>(
                () => service.VerifyStoredAsync(backup, ct, password));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public async Task PerFileManifestDetectsChangesInLegacyZipContainer()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-manifest-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        Directory.CreateDirectory(Path.Combine(root, "config"));
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>()
                .UseSqlite($"Data Source={Path.Combine(root, "database", "lessoncue.db")}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(ct);
            db.Organizations.Add(new Organization { Name = "Manifest Academy" });
            await db.SaveChangesAsync(ct);
            await File.WriteAllTextAsync(Path.Combine(root, "config", "appsettings.json"), "before", ct);
            var service = new BackupService(root);
            var backup = await service.CreateAsync(db, false, "owner", ct);
            var path = service.Resolve(backup.FileName)!;

            using (var archive = ZipFile.Open(path, ZipArchiveMode.Update))
            {
                archive.GetEntry("config/appsettings.json")!.Delete();
                var replacement = archive.CreateEntry("config/appsettings.json");
                await using var writer = new StreamWriter(replacement.Open());
                await writer.WriteAsync("after");
            }

            var error = await Assert.ThrowsAsync<InvalidDataException>(
                () => service.VerifyStoredAsync(backup, ct));
            Assert.Contains("manifest", error.Message, StringComparison.OrdinalIgnoreCase);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public async Task PreviewRejectsBackupFromANewerServerVersion()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(Path.GetTempPath(), $"lessoncue-version-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>()
                .UseSqlite($"Data Source={Path.Combine(root, "database", "lessoncue.db")}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(ct);
            db.Organizations.Add(new Organization { Name = "Future Academy" });
            await db.SaveChangesAsync(ct);
            var service = new BackupService(root);
            var backup = await service.CreateAsync(db, false, "owner", ct);
            var path = service.Resolve(backup.FileName)!;

            using (var archive = ZipFile.Open(path, ZipArchiveMode.Update))
            {
                var entry = archive.GetEntry("lessoncue-backup.json")!;
                string json;
                using (var reader = new StreamReader(entry.Open()))
                    json = await reader.ReadToEndAsync(ct);
                entry.Delete();
                var manifest = JsonNode.Parse(json)!.AsObject();
                manifest["serverVersion"] = "999.0.0";
                var replacement = archive.CreateEntry("lessoncue-backup.json");
                await using var writer = new StreamWriter(replacement.Open());
                await writer.WriteAsync(manifest.ToJsonString());
            }

            var error = await Assert.ThrowsAsync<InvalidDataException>(
                () => service.VerifyStoredAsync(backup, ct));
            Assert.Contains("Update this server", error.Message, StringComparison.Ordinal);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
