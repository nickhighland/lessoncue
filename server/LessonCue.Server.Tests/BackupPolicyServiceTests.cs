using LessonCue.Server;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class BackupPolicyServiceTests
{
    [Fact]
    public async Task ScheduledPolicyEncryptsVerifiesAndPrunesWithoutPersistingPlaintextPassword()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(
            Path.GetTempPath(), $"lessoncue-backup-policy-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        Directory.CreateDirectory(Path.Combine(root, "config", "keys"));
        try
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDataProtection()
                .PersistKeysToFileSystem(
                    new DirectoryInfo(Path.Combine(root, "config", "keys")))
                .SetApplicationName("LessonCue.Tests");
            services.AddDbContext<LessonCueDb>(options =>
                options.UseSqlite(
                    $"Data Source={Path.Combine(root, "database", "lessoncue.db")}"));
            services.AddHttpClient("backup-offsite");
            await using var provider = services.BuildServiceProvider();

            await using (var setup = provider.CreateAsyncScope())
            {
                var db = setup.ServiceProvider.GetRequiredService<LessonCueDb>();
                await db.Database.EnsureCreatedAsync(ct);
                db.Organizations.Add(new Organization
                {
                    Name = "Scheduled Academy",
                    TimeZone = "UTC"
                });
                await db.SaveChangesAsync(ct);
            }

            var backups = new BackupService(root);
            var policy = new BackupPolicyService(
                root,
                provider.GetRequiredService<IServiceScopeFactory>(),
                backups,
                provider.GetRequiredService<IDataProtectionProvider>(),
                provider.GetRequiredService<IHttpClientFactory>(),
                provider.GetRequiredService<ILogger<BackupPolicyService>>());
            const string password = "scheduled correct horse battery";
            var saved = await policy.UpdateAsync(
                new BackupPolicyInput(
                    true,
                    "daily",
                    2,
                    null,
                    false,
                    1,
                    30,
                    "exclude",
                    password,
                    null,
                    "none",
                    null,
                    null),
                "UTC",
                ct);

            Assert.True(saved.Enabled);
            Assert.True(saved.BackupPasswordConfigured);
            var policyJson = await File.ReadAllTextAsync(
                Path.Combine(root, "config", "backup-policy.json"), ct);
            Assert.DoesNotContain(password, policyJson, StringComparison.Ordinal);

            var first = await policy.RunNowAsync("UTC", ct);
            Assert.NotNull(first.LastSucceededAt);
            Assert.NotNull(first.LastVerifiedAt);
            Assert.EndsWith(".lcbak", first.LastBackupFileName, StringComparison.Ordinal);

            var second = await policy.RunNowAsync("UTC", ct);
            Assert.NotNull(second.LastSucceededAt);
            await using (var verification = provider.CreateAsyncScope())
            {
                var db = verification.ServiceProvider.GetRequiredService<LessonCueDb>();
                var records = await db.BackupRecords
                    .Where(x => x.CreatedBy == "scheduled-backup")
                    .ToListAsync(ct);
                Assert.Single(records);
                var preview = await backups.VerifyStoredAsync(
                    records[0], ct, password);
                Assert.True(preview.Encrypted);
                Assert.Equal("exclude", preview.SecretHandling);
            }
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Fact]
    public async Task EnabledPolicyRequiresARecoverableBackupPassword()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(
            Path.GetTempPath(), $"lessoncue-backup-policy-validation-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "config", "keys"));
        try
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDataProtection()
                .PersistKeysToFileSystem(
                    new DirectoryInfo(Path.Combine(root, "config", "keys")));
            services.AddDbContext<LessonCueDb>(options =>
                options.UseSqlite(
                    $"Data Source={Path.Combine(root, "database", "lessoncue.db")}"));
            services.AddHttpClient("backup-offsite");
            await using var provider = services.BuildServiceProvider();
            var policy = new BackupPolicyService(
                root,
                provider.GetRequiredService<IServiceScopeFactory>(),
                new BackupService(root),
                provider.GetRequiredService<IDataProtectionProvider>(),
                provider.GetRequiredService<IHttpClientFactory>(),
                provider.GetRequiredService<ILogger<BackupPolicyService>>());

            var error = await Assert.ThrowsAsync<ArgumentException>(() =>
                policy.UpdateAsync(
                    new BackupPolicyInput(
                        true, "daily", 2, null, true, 7, 30, "exclude",
                        null, null, "none", null, null),
                    "UTC",
                    ct));
            Assert.Contains("password", error.Message, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}
