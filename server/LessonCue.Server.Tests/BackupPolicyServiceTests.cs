using LessonCue.Server;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
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
            Assert.Equal(2, saved.HourLocal);
            Assert.NotNull(saved.NextRunAt);
            Assert.Equal(2, TimeZoneInfo.ConvertTime(saved.NextRunAt!.Value, TimeZoneInfo.Utc).Hour);
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
    public async Task ScheduledPolicySyncsMediaIntoNamedFolderAndDeletesOnlyManagedFiles()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(
            Path.GetTempPath(), $"lessoncue-media-sync-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "database"));
        Directory.CreateDirectory(Path.Combine(root, "config", "keys"));
        Directory.CreateDirectory(Path.Combine(root, "media", "originals"));
        Directory.CreateDirectory(Path.Combine(root, "media", "temporary"));
        await File.WriteAllTextAsync(
            Path.Combine(root, "media", "originals", "keep.jpg"), "keep", ct);
        await File.WriteAllTextAsync(
            Path.Combine(root, "media", "originals", "new.mp4"), "new", ct);
        await File.WriteAllTextAsync(
            Path.Combine(root, "media", "temporary", "in-progress.part"), "ignore", ct);

        try
        {
            var handler = new SyncWebDavTestHandler();
            handler.SeedCollection("root");
            handler.SeedFile(
                "root/LessonCue/media/originals/keep.jpg",
                Encoding.UTF8.GetBytes("keep"));
            handler.SeedFile(
                "root/LessonCue/media/originals/old.jpg",
                Encoding.UTF8.GetBytes("old"));
            handler.SeedFile(
                "root/LessonCue/readme.txt",
                Encoding.UTF8.GetBytes("unrelated"));
            handler.SeedFile(
                "root/LessonCue/media/.lessoncue-media-sync.json",
                BuildMediaSyncManifest(
                    ("originals/keep.jpg", "keep"),
                    ("originals/old.jpg", "old")));

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
                var setupDb = setup.ServiceProvider.GetRequiredService<LessonCueDb>();
                await setupDb.Database.EnsureCreatedAsync(ct);
                setupDb.Organizations.Add(new Organization
                {
                    Name = "Media Sync Academy",
                    TimeZone = "UTC"
                });
                await setupDb.SaveChangesAsync(ct);
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
                    [new BackupDestinationInput(
                        "webdav",
                        "https://sync.test/root/",
                        "none",
                        null,
                        null,
                        2,
                        3650,
                        "LessonCue")],
                    "sync"),
                "UTC",
                ct);

            Assert.Equal("sync", saved.MediaMode);
            Assert.False(saved.IncludeMedia);
            Assert.Equal("LessonCue", Assert.Single(saved.Destinations!).FolderName);

            var result = await policy.RunNowAsync("UTC", ct);
            var destination = Assert.Single(result.Destinations!);
            Assert.Equal("LessonCue", destination.FolderName);
            Assert.Equal("https://sync.test/root/", destination.WebDavUrl);
            Assert.Equal(1, destination.LastMediaSyncAdded);
            Assert.Equal(0, destination.LastMediaSyncUpdated);
            Assert.Equal(1, destination.LastMediaSyncDeleted);
            Assert.Null(destination.LastError);

            Assert.Contains(
                "root/LessonCue/media/originals/keep.jpg",
                handler.FilePaths);
            Assert.Contains(
                "root/LessonCue/media/originals/new.mp4",
                handler.FilePaths);
            Assert.DoesNotContain(
                "root/LessonCue/media/originals/old.jpg",
                handler.FilePaths);
            Assert.DoesNotContain(
                "root/LessonCue/media/temporary/in-progress.part",
                handler.FilePaths);
            Assert.Contains("root/LessonCue/readme.txt", handler.FilePaths);
            Assert.Contains(
                "root/LessonCue/media/.lessoncue-media-sync.json",
                handler.FilePaths);
            Assert.Contains("root/LessonCue", handler.CollectionPaths);
            Assert.Contains("root/LessonCue/media", handler.CollectionPaths);
            Assert.Contains("root/LessonCue/media/originals", handler.CollectionPaths);

            await using var verification = provider.CreateAsyncScope();
            var verificationDb = verification.ServiceProvider.GetRequiredService<LessonCueDb>();
            var record = await verificationDb.BackupRecords
                .SingleAsync(item => item.CreatedBy == "scheduled-backup", ct);
            var preview = await backups.VerifyStoredAsync(
                record, ct, "scheduled correct horse battery");
            Assert.False(preview.IncludesMedia);
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

    private sealed class SyncWebDavTestHandler : HttpMessageHandler
    {
        private static readonly XNamespace Dav = "DAV:";
        private readonly Dictionary<string, byte[]> files = new(StringComparer.Ordinal);
        private readonly HashSet<string> collections = new(StringComparer.Ordinal);

        public IReadOnlyCollection<string> FilePaths => files.Keys.ToArray();
        public IReadOnlyCollection<string> CollectionPaths => collections.ToArray();

        public void SeedCollection(string path) => collections.Add(Normalize(path));

        public void SeedFile(string path, byte[] content)
        {
            var normalized = Normalize(path);
            files[normalized] = content;
            AddParentCollections(normalized);
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var path = PathFor(request.RequestUri!);
            if (request.Method.Method.Equals("MKCOL", StringComparison.OrdinalIgnoreCase))
            {
                if (collections.Contains(path))
                    return Response(request, HttpStatusCode.MethodNotAllowed);
                collections.Add(path);
                AddParentCollections(path);
                return Response(request, HttpStatusCode.Created);
            }

            if (request.Method == HttpMethod.Put)
            {
                files[path] = await request.Content!.ReadAsByteArrayAsync(cancellationToken);
                AddParentCollections(path);
                return Response(request, HttpStatusCode.Created);
            }

            if (request.Method == HttpMethod.Get)
            {
                if (!files.TryGetValue(path, out var content))
                    return Response(request, HttpStatusCode.NotFound);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    RequestMessage = request,
                    Content = new ByteArrayContent(content)
                };
            }

            if (request.Method == HttpMethod.Delete)
            {
                files.Remove(path);
                return Response(request, HttpStatusCode.NoContent);
            }

            if (request.Method.Method.Equals("PROPFIND", StringComparison.OrdinalIgnoreCase))
            {
                if (!collections.Contains(path))
                    return Response(request, HttpStatusCode.NotFound);
                var responsePaths = new List<(string Path, bool IsCollection, long? Bytes)>
                {
                    (path, true, null)
                };
                responsePaths.AddRange(collections
                    .Where(candidate => Parent(candidate) == path)
                    .Select(candidate => (candidate, true, (long?)null)));
                responsePaths.AddRange(files
                    .Where(pair => Parent(pair.Key) == path)
                    .Select(pair => (pair.Key, false, (long?)pair.Value.Length)));
                var document = new XDocument(
                    new XElement(
                        Dav + "multistatus",
                        responsePaths.Select(entry =>
                            new XElement(
                                Dav + "response",
                                new XElement(
                                    Dav + "href",
                                    Href(request.RequestUri!, entry.Path, entry.IsCollection)),
                                new XElement(
                                    Dav + "propstat",
                                    new XElement(
                                        Dav + "prop",
                                        new XElement(
                                            Dav + "resourcetype",
                                            entry.IsCollection
                                                ? new XElement(Dav + "collection")
                                                : null),
                                        entry.Bytes is not null
                                            ? new XElement(
                                                Dav + "getcontentlength",
                                                entry.Bytes.Value)
                                            : null))))));
                return new HttpResponseMessage(HttpStatusCode.MultiStatus)
                {
                    RequestMessage = request,
                    Content = new StringContent(document.ToString(SaveOptions.DisableFormatting))
                };
            }

            return Response(request, HttpStatusCode.MethodNotAllowed);
        }

        private void AddParentCollections(string path)
        {
            var parent = Parent(path);
            while (parent.Length > 0)
            {
                collections.Add(parent);
                parent = Parent(parent);
            }
        }

        private static string PathFor(Uri uri) => Normalize(Uri.UnescapeDataString(uri.AbsolutePath));

        private static string Normalize(string path) => path.Trim('/');

        private static string Parent(string path)
        {
            var slash = path.LastIndexOf('/');
            return slash < 0 ? "" : path[..slash];
        }

        private static string Href(Uri requestUri, string path, bool isCollection)
        {
            var escaped = string.Join(
                "/",
                path.Split('/', StringSplitOptions.RemoveEmptyEntries)
                    .Select(Uri.EscapeDataString));
            var builder = new UriBuilder(requestUri)
            {
                Path = "/" + escaped + (isCollection ? "/" : "")
            };
            return builder.Uri.AbsoluteUri;
        }

        private static HttpResponseMessage Response(
            HttpRequestMessage request,
            HttpStatusCode status) => new(status) { RequestMessage = request };

    }

    private static byte[] BuildMediaSyncManifest(
        params (string Path, string Content)[] entries)
    {
        var files = entries.ToDictionary(
            entry => entry.Path,
            entry => new
            {
                bytes = Encoding.UTF8.GetByteCount(entry.Content),
                sha256 = Convert.ToHexString(
                        SHA256.HashData(Encoding.UTF8.GetBytes(entry.Content)))
                    .ToLowerInvariant()
            });
        return JsonSerializer.SerializeToUtf8Bytes(new
        {
            product = "LessonCue",
            formatVersion = 1,
            generatedAt = DateTimeOffset.UtcNow,
            files
        });
    }
}
