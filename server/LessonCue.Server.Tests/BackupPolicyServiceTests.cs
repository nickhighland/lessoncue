using LessonCue.Server;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Net;
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

    [Fact]
    public async Task RemoteDestinationRejectsEmbeddedCredentialsAndDuplicateProviders()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(
            Path.GetTempPath(), $"lessoncue-backup-policy-remote-validation-{Guid.NewGuid():N}");
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

            var embeddedCredential = await Assert.ThrowsAsync<ArgumentException>(() =>
                policy.UpdateAsync(
                    new BackupPolicyInput(
                        true, "daily", 2, null, false, 7, 30, "exclude",
                        "scheduled correct horse battery", null, "none", null, null,
                        [new BackupDestinationInput(
                            "nextcloud", "https://admin:secret@nextcloud.test/dav/",
                            "basic", "admin", "app-password", 2, 30)]),
                    "UTC",
                    ct));
            Assert.Contains("HTTPS WebDAV", embeddedCredential.Message, StringComparison.Ordinal);

            var duplicate = await Assert.ThrowsAsync<ArgumentException>(() =>
                policy.UpdateAsync(
                    new BackupPolicyInput(
                        true, "daily", 2, null, false, 7, 30, "exclude",
                        "scheduled correct horse battery", null, "none", null, null,
                        [
                            new BackupDestinationInput(
                                "owncloud", "https://owncloud.test/dav/", "basic",
                                "admin", "app-password", 2, 30),
                            new BackupDestinationInput(
                                "owncloud", "https://owncloud.test/other/", "basic",
                                "admin", "app-password", 2, 30)
                        ]),
                    "UTC",
                    ct));
            Assert.Contains("only one owncloud", duplicate.Message, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Fact]
    public async Task ScheduledPolicyUploadsToNextcloudAndOwnCloudAndPrunesRemoteCopies()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(
            Path.GetTempPath(), $"lessoncue-backup-destinations-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        Directory.CreateDirectory(Path.Combine(root, "config", "keys"));
        try
        {
            var handler = new WebDavTestHandler();
            handler.Seed("nextcloud", [
                "lessoncue-20260101-020000-configuration-old1.lcbak",
                "lessoncue-20260102-020000-configuration-old2.lcbak",
                "lessoncue-20260103-020000-configuration-old3.lcbak"
            ]);
            handler.Seed("owncloud", [
                "lessoncue-20260101-020000-configuration-old1.lcbak",
                "lessoncue-20260102-020000-configuration-old2.lcbak",
                "lessoncue-20260103-020000-configuration-old3.lcbak",
                "do-not-delete.txt"
            ]);
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDataProtection()
                .PersistKeysToFileSystem(
                    new DirectoryInfo(Path.Combine(root, "config", "keys")))
                .SetApplicationName("LessonCue.Tests");
            services.AddDbContext<LessonCueDb>(options =>
                options.UseSqlite(
                    $"Data Source={Path.Combine(root, "database", "lessoncue.db")}"));
            services.AddHttpClient("backup-offsite")
                .ConfigurePrimaryHttpMessageHandler(() => handler);
            await using var provider = services.BuildServiceProvider();

            await using (var setup = provider.CreateAsyncScope())
            {
                var db = setup.ServiceProvider.GetRequiredService<LessonCueDb>();
                await db.Database.EnsureCreatedAsync(ct);
                db.Organizations.Add(new Organization
                {
                    Name = "Destination Academy",
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
            var saved = await policy.UpdateAsync(
                new BackupPolicyInput(
                    true,
                    "daily",
                    2,
                    null,
                    false,
                    7,
                    30,
                    "exclude",
                    "scheduled correct horse battery",
                    null,
                    "none",
                    null,
                    null,
                    [
                        new BackupDestinationInput(
                            "nextcloud",
                            "https://nextcloud.test/lessoncue/",
                            "basic",
                            "admin",
                            "nextcloud-app-password",
                            2,
                            3650),
                        new BackupDestinationInput(
                            "owncloud",
                            "https://owncloud.test/lessoncue/",
                            "basic",
                            "admin",
                            "owncloud-app-password",
                            2,
                            3650)
                    ]),
                "UTC",
                ct);

            Assert.Equal(2, saved.Destinations?.Count);
            var result = await policy.RunNowAsync("UTC", ct);

            Assert.Equal(
                ["nextcloud", "owncloud"],
                result.Destinations?.Select(destination => destination.Provider));
            Assert.All(result.Destinations!, destination =>
            {
                Assert.True(destination.SecretConfigured);
                Assert.Equal(2, destination.RetentionCount);
                Assert.Equal(2, destination.RemoteBackupCount);
                Assert.NotNull(destination.LastUploadedAt);
                Assert.Null(destination.LastError);
            });
            Assert.Equal(2, handler.DeleteCount("nextcloud"));
            Assert.Equal(2, handler.DeleteCount("owncloud"));
            Assert.Equal(2, handler.Files("nextcloud").Count);
            Assert.Equal(3, handler.Files("owncloud").Count);
            Assert.Contains("do-not-delete.txt", handler.Files("owncloud"));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    private sealed class WebDavTestHandler : HttpMessageHandler
    {
        private readonly Dictionary<string, List<string>> files = new(StringComparer.Ordinal);
        private readonly Dictionary<string, int> deletes = new(StringComparer.Ordinal);

        public void Seed(string provider, IEnumerable<string> names) =>
            files[provider] = names.ToList();

        public IReadOnlyList<string> Files(string provider) => files[provider];

        public int DeleteCount(string provider) =>
            deletes.TryGetValue(provider, out var count) ? count : 0;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var provider = request.RequestUri?.Host.Split('.')[0] ?? "unknown";
            var bucket = files.GetValueOrDefault(provider) ?? [];
            if (request.Method == HttpMethod.Put)
            {
                var fileName = Path.GetFileName(request.RequestUri!.AbsolutePath);
                if (!bucket.Contains(fileName, StringComparer.OrdinalIgnoreCase))
                    bucket.Add(fileName);
                return new HttpResponseMessage(HttpStatusCode.Created)
                {
                    RequestMessage = request
                };
            }
            if (request.Method == PropFindMethod)
            {
                var baseHref = request.RequestUri!.AbsoluteUri;
                var responses = string.Join(
                    "",
                    new[] { baseHref }.Concat(bucket.Select(file =>
                        new Uri(request.RequestUri, Uri.EscapeDataString(file)).AbsoluteUri))
                        .Select(href =>
                            $"<d:response><d:href>{href}</d:href><d:propstat><d:prop><d:getlastmodified>Wed, 01 Jan 2026 02:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>"));
                return new HttpResponseMessage(HttpStatusCode.MultiStatus)
                {
                    RequestMessage = request,
                    Content = new StringContent(
                        $"<?xml version=\"1.0\"?><d:multistatus xmlns:d=\"DAV:\">{responses}</d:multistatus>")
                };
            }
            if (request.Method == HttpMethod.Delete)
            {
                var fileName = Path.GetFileName(request.RequestUri!.AbsolutePath);
                bucket.RemoveAll(file => string.Equals(file, fileName, StringComparison.OrdinalIgnoreCase));
                deletes[provider] = DeleteCount(provider) + 1;
                return new HttpResponseMessage(HttpStatusCode.NoContent)
                {
                    RequestMessage = request
                };
            }
            await Task.Yield();
            return new HttpResponseMessage(HttpStatusCode.MethodNotAllowed)
            {
                RequestMessage = request
            };
        }

        private static readonly HttpMethod PropFindMethod = new("PROPFIND");
    }
}
