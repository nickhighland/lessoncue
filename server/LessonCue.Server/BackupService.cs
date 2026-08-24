using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record BackupPreview(Guid RestoreId, string FileName, string Kind, long CompressedBytes,
    long UncompressedBytes, int FileCount, string Organization, int Users, int Classes, int Lessons,
    int MediaRecords, int MediaFiles, bool IncludesMedia, bool Encrypted, string SecretHandling,
    string? SourceVersion, string Compatibility, string[] Warnings, DateTimeOffset ExpiresAt);

public sealed record BackupRestoreResult(Guid SafetyBackupId, string SafetyBackupFileName, string Kind,
    string Organization, bool MediaRestored, string[] PreservedServerSettings);

public sealed class BackupService
{
    private const long MaximumArchiveBytes = 20L * 1024 * 1024 * 1024;
    private const long DiskReserveBytes = 512L * 1024 * 1024;
    private static readonly TimeSpan StageLifetime = TimeSpan.FromHours(24);
    private readonly string dataPath;
    private readonly string restorePath;
    private readonly SemaphoreSlim restoreGate = new(1, 1);
    private volatile bool isRestoring;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> SensitiveConfigFiles = new(StringComparer.OrdinalIgnoreCase)
    {
        "email-provider.json",
        "signage-credentials.json",
        "pairing-secret",
        "pairing-pin",
        // Credentials for the shortener's API. A backup taken without secrets
        // must not carry them, or "exclude secrets" would not mean much.
        "shortener-integration-key",
        "shortener-admin-key"
    };

    public BackupService(string dataPath)
    {
        this.dataPath = dataPath;
        BackupPath = Path.Combine(dataPath, "backups");
        restorePath = Path.Combine(dataPath, "restore-staging");
    }

    public string BackupPath { get; }
    public bool IsRestoring => isRestoring;

    public async Task<BackupRecord> CreateAsync(
        LessonCueDb db,
        bool includeMedia,
        string actor,
        CancellationToken ct,
        string? password = null,
        string secretHandling = "exclude")
    {
        secretHandling = NormalizeSecretHandling(secretHandling);
        if (secretHandling == "include" && string.IsNullOrEmpty(password))
            throw new ArgumentException(
                "Credentials and local encryption keys may only be included in a password-encrypted backup.");
        Directory.CreateDirectory(BackupPath);
        var id = Guid.NewGuid();
        var kind = includeMedia ? "full" : "configuration";
        var encrypted = !string.IsNullOrEmpty(password);
        var extension = encrypted ? ".lcbak" : ".zip";
        var fileName = $"lessoncue-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{kind}-{id.ToString()[..8]}{extension}";
        var destination = Path.Combine(BackupPath, fileName);
        var databaseSnapshot = Path.Combine(BackupPath, $".{id:N}.db");
        var plainArchive = encrypted ? Path.Combine(BackupPath, $".{id:N}.zip") : destination;
        try
        {
            await db.Database.OpenConnectionAsync(ct);
            await using (var snapshot = new SqliteConnection($"Data Source={databaseSnapshot};Pooling=False"))
            {
                await snapshot.OpenAsync(ct);
                ((SqliteConnection)db.Database.GetDbConnection()).BackupDatabase(snapshot);
            }
            var files = new Dictionary<string, BackupManifestFile>(StringComparer.Ordinal);
            using (var archive = ZipFile.Open(plainArchive, ZipArchiveMode.Create))
            {
                await AddFileAsync(
                    archive, databaseSnapshot, "database/lessoncue.db", files, ct);
                await AddDirectoryAsync(
                    archive,
                    Path.Combine(dataPath, "config"),
                    "config",
                    files,
                    path => IncludeConfigFile(path, secretHandling),
                    ct);
                if (includeMedia)
                    await AddDirectoryAsync(
                        archive,
                        Path.Combine(dataPath, "media"),
                        "media",
                        files,
                        path => !path.StartsWith(
                            Path.Combine(dataPath, "media", "temporary"),
                            StringComparison.Ordinal),
                        ct);

                var manifestEntry = archive.CreateEntry(
                    "lessoncue-backup.json", CompressionLevel.Fastest);
                await using var stream = manifestEntry.Open();
                await JsonSerializer.SerializeAsync(
                    stream,
                    new BackupManifest(
                        "LessonCue",
                        2,
                        DateTimeOffset.UtcNow,
                        kind,
                        includeMedia,
                        secretHandling,
                        UpdateService.InstalledVersion(),
                        files),
                    JsonOptions,
                    ct);
            }
            if (encrypted)
                await BackupArchiveEncryption.EncryptAsync(
                    plainArchive, destination, password!, ct);
        }
        catch
        {
            TryDelete(destination);
            TryDelete(plainArchive);
            throw;
        }
        finally
        {
            TryDelete(databaseSnapshot);
            if (encrypted) TryDelete(plainArchive);
        }
        var record = new BackupRecord { Id = id, FileName = fileName, Kind = kind,
            SizeBytes = new FileInfo(destination).Length, CreatedBy = actor };
        db.BackupRecords.Add(record);
        await db.SaveChangesAsync(ct);
        return record;
    }

    public async Task<BackupPreview> StageAsync(
        Stream source,
        string fileName,
        long length,
        CancellationToken ct,
        string? password = null)
    {
        if (length <= 0 || length > MaximumArchiveBytes) throw new InvalidDataException("Choose a non-empty LessonCue backup smaller than 20 GB.");
        CleanupExpiredStages();
        var root = Path.GetPathRoot(dataPath) ?? dataPath;
        if (new DriveInfo(root).AvailableFreeSpace - DiskReserveBytes < length)
            throw new IOException("The server does not have enough free disk space to validate this backup safely.");
        var restoreId = Guid.NewGuid();
        var stage = StageDirectory(restoreId);
        Directory.CreateDirectory(stage);
        var sourcePath = Path.Combine(stage, "upload");
        var archivePath = Path.Combine(stage, "upload.zip");
        try
        {
            await using (var destination = File.Create(sourcePath))
                await source.CopyToAsync(destination, ct);
            bool encrypted;
            long? plaintextBytes = null;
            await using (var uploaded = File.OpenRead(sourcePath))
            {
                encrypted = BackupArchiveEncryption.IsEncrypted(uploaded);
                if (encrypted)
                    plaintextBytes = BackupArchiveEncryption.ReadPlaintextLength(uploaded);
            }
            if (encrypted)
            {
                if (plaintextBytes is not long required ||
                    required > MaximumArchiveBytes ||
                    new DriveInfo(root).AvailableFreeSpace - DiskReserveBytes < required)
                    throw new IOException(
                        "The server does not have enough free disk space to decrypt and validate this backup safely.");
            }
            await PrepareArchiveAsync(sourcePath, archivePath, password, ct);
            TryDelete(sourcePath);
            await File.WriteAllTextAsync(
                Path.Combine(stage, "source-metadata.json"),
                JsonSerializer.Serialize(new BackupSourceMetadata(encrypted, length), JsonOptions),
                ct);
            var preview = await InspectAsync(
                restoreId, Path.GetFileName(fileName), archivePath, length, encrypted, ct);
            var safetySourceBytes = DirectoryBytes(Path.Combine(dataPath, "database")) +
                DirectoryBytes(Path.Combine(dataPath, "config")) + DirectoryBytes(Path.Combine(dataPath, "media"));
            if (new DriveInfo(root).AvailableFreeSpace - DiskReserveBytes < preview.UncompressedBytes + safetySourceBytes)
                throw new IOException("The server needs more free disk space to extract this backup and create the required safety backup.");
            return preview;
        }
        catch (SqliteException ex) { TryDelete(stage); throw new InvalidDataException("The archive does not contain a readable LessonCue database.", ex); }
        catch { TryDelete(stage); throw; }
    }

    public async Task<BackupRestoreResult> RestoreAsync(LessonCueDb db, Guid restoreId, string actor, CancellationToken ct)
    {
        if (!await restoreGate.WaitAsync(0, ct)) throw new InvalidOperationException("Another restore is already running.");
        isRestoring = true;
        var stage = StageDirectory(restoreId);
        var archivePath = Path.Combine(stage, "upload.zip");
        var work = Path.Combine(stage, "work");
        var rollbackDatabase = Path.Combine(stage, "rollback.db");
        string? mediaRollback = null;
        var databaseReplaced = false;
        try
        {
            if (!File.Exists(archivePath)) throw new FileNotFoundException("The staged backup expired. Upload it again.");
            var sourceMetadata = await ReadSourceMetadataAsync(stage, ct);
            var preview = await InspectAsync(
                restoreId,
                sourceMetadata.Encrypted ? "upload.lcbak" : "upload.zip",
                archivePath,
                sourceMetadata.SourceBytes,
                sourceMetadata.Encrypted,
                ct);
            var safety = await CreateAsync(db, true, $"{actor}-pre-restore", ct);
            await ExtractDatabaseAsync(Resolve(safety.FileName)!, rollbackDatabase, ct);
            TryDelete(work); Directory.CreateDirectory(work);
            await ExtractValidatedAsync(archivePath, work, ct);

            if (preview.IncludesMedia)
            {
                var liveMedia = Path.Combine(dataPath, "media");
                var restoredMedia = Path.Combine(work, "media");
                Directory.CreateDirectory(Path.Combine(restoredMedia, "temporary"));
                mediaRollback = Path.Combine(dataPath, $"media.pre-restore-{Guid.NewGuid():N}");
                if (Directory.Exists(liveMedia)) Directory.Move(liveMedia, mediaRollback);
                Directory.Move(restoredMedia, liveMedia);
            }

            var sourceDatabase = Path.Combine(work, "database", "lessoncue.db");
            await db.Database.OpenConnectionAsync(ct);
            await using (var sourceConnection = new SqliteConnection($"Data Source={sourceDatabase};Mode=ReadOnly;Pooling=False"))
            {
                await sourceConnection.OpenAsync(ct);
                sourceConnection.BackupDatabase((SqliteConnection)db.Database.GetDbConnection());
            }
            databaseReplaced = true;
            db.ChangeTracker.Clear();
            await DatabaseUpgrade.ApplyAsync(db, ct);
            // TOTP secrets are protected by the source server's key ring while
            // restores deliberately preserve the receiving server's keys.
            // Clear MFA rather than leave every restored Service Admin locked
            // behind an undecryptable secret.
            await db.AdminAccounts.ExecuteUpdateAsync(update => update
                .SetProperty(account => account.TotpSecretProtected, (string?)null)
                .SetProperty(account => account.TotpEnabled, false)
                .SetProperty(account => account.TotpLastCounter, 0L)
                .SetProperty(account => account.TotpEnabledAt, (DateTimeOffset?)null), ct);
            db.BackupRecords.Add(safety);
            db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "backup.restore", Object = restoreId.ToString(),
                Summary = JsonSerializer.Serialize(new { preview.Kind, safetyBackup = safety.FileName, preview.Organization }) });
            await db.SaveChangesAsync(ct);
            if (mediaRollback is not null) TryDelete(mediaRollback);
            TryDelete(stage);
            return new BackupRestoreResult(safety.Id, safety.FileName, preview.Kind, preview.Organization,
                preview.IncludesMedia, ["server identity", "encryption keys", "hostname and port", "pairing secrets", "optional remote-access credential"]);
        }
        catch
        {
            if (databaseReplaced && File.Exists(rollbackDatabase))
            {
                try
                {
                    await db.Database.OpenConnectionAsync(ct);
                    await using var rollback = new SqliteConnection($"Data Source={rollbackDatabase};Mode=ReadOnly;Pooling=False");
                    await rollback.OpenAsync(ct);
                    rollback.BackupDatabase((SqliteConnection)db.Database.GetDbConnection());
                    db.ChangeTracker.Clear();
                }
                catch { /* The on-disk safety archive remains available for manual recovery. */ }
            }
            if (mediaRollback is not null && Directory.Exists(mediaRollback))
            {
                var liveMedia = Path.Combine(dataPath, "media");
                TryDelete(liveMedia);
                Directory.Move(mediaRollback, liveMedia);
            }
            throw;
        }
        finally { isRestoring = false; restoreGate.Release(); }
    }

    public string? Resolve(string fileName)
    {
        var path = Path.GetFullPath(Path.Combine(BackupPath, Path.GetFileName(fileName)));
        return path.StartsWith(Path.GetFullPath(BackupPath), StringComparison.Ordinal) && File.Exists(path) ? path : null;
    }

    public async Task<BackupPreview> VerifyStoredAsync(
        BackupRecord record,
        CancellationToken ct,
        string? password = null)
    {
        var sourcePath = Resolve(record.FileName) ?? throw new FileNotFoundException("The backup file is missing.");
        CleanupExpiredStages();
        var verificationId = Guid.NewGuid();
        var stage = StageDirectory(verificationId);
        Directory.CreateDirectory(stage);
        try
        {
            var archivePath = Path.Combine(stage, "verify.zip");
            var encrypted = await PrepareArchiveAsync(sourcePath, archivePath, password, ct);
            return await InspectAsync(
                verificationId,
                record.FileName,
                archivePath,
                new FileInfo(sourcePath).Length,
                encrypted,
                ct);
        }
        finally
        {
            TryDelete(stage);
        }
    }

    private async Task<BackupPreview> InspectAsync(
        Guid restoreId,
        string fileName,
        string archivePath,
        long sourceBytes,
        bool encrypted,
        CancellationToken ct)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        var entries = ValidateEntries(archive);
        var manifest = await ValidateManifestAsync(entries, ct);
        var databaseEntry = entries.SingleOrDefault(x => x.FullName == "database/lessoncue.db")
            ?? throw new InvalidDataException("This archive does not contain database/lessoncue.db and is not a restorable LessonCue backup.");
        var previewDatabase = Path.Combine(StageDirectory(restoreId), "preview.db");
        await using (var input = databaseEntry.Open()) await using (var output = File.Create(previewDatabase))
            await input.CopyToAsync(output, ct);
        await using var connection = new SqliteConnection($"Data Source={previewDatabase};Mode=ReadOnly;Pooling=False");
        await connection.OpenAsync(ct);
        await using (var integrity = connection.CreateCommand())
        {
            integrity.CommandText = "PRAGMA integrity_check";
            if (!string.Equals((string?)await integrity.ExecuteScalarAsync(ct), "ok", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The backup database did not pass its integrity check.");
        }
        var required = new[] { "Organizations", "AdminAccounts", "Classes", "Lessons", "MediaAssets" };
        foreach (var table in required)
            if (!await TableExistsAsync(connection, table, ct)) throw new InvalidDataException($"The backup database is missing the required {table} table.");
        var organization = await ScalarStringAsync(connection, "SELECT Name FROM Organizations LIMIT 1", ct) ?? "LessonCue";
        var includesMedia = entries.Any(x => x.FullName.StartsWith("media/", StringComparison.Ordinal) && !x.FullName.EndsWith('/'));
        var mediaFiles = entries.Count(x => x.FullName.StartsWith("media/originals/", StringComparison.Ordinal) && !x.FullName.EndsWith('/'));
        var warnings = new List<string>();
        if (!includesMedia) warnings.Add("This is a configuration backup. Existing media files on this server will be preserved.");
        if (manifest.FormatVersion == 1)
            warnings.Add("This legacy backup does not contain a per-file authenticated manifest. Restore it only if you trust its source.");
        if (manifest.SourceVersion is null)
            warnings.Add("The source LessonCue version is not recorded. Compatibility will be checked again while the database is upgraded.");
        if (!encrypted)
            warnings.Add("This backup is not password-encrypted. Future exported backups should use the encrypted .lcbak format.");
        if (manifest.SecretHandling == "include")
            warnings.Add("This backup includes server credentials and local data-protection keys. Store its password separately.");
        else if (manifest.SecretHandling == "legacy-combined")
            warnings.Add("This legacy backup may place protected credentials and their local decrypting keys in the same unencrypted ZIP.");
        else
            warnings.Add("Server credentials, pairing secrets, and local data-protection keys are excluded.");
        warnings.Add("Authenticator MFA is disabled for restored accounts because this server keeps its own encryption keys.");
        var mediaRecords = await CountAsync(connection, "MediaAssets", ct);
        if (includesMedia && mediaFiles < mediaRecords) warnings.Add("Some media records may not have an original file in this archive.");
        return new BackupPreview(restoreId, fileName, includesMedia ? "full" : "configuration",
            sourceBytes, entries.Sum(x => x.Length), entries.Count, organization,
            await CountAsync(connection, "AdminAccounts", ct), await CountAsync(connection, "Classes", ct),
            await CountAsync(connection, "Lessons", ct), mediaRecords, mediaFiles, includesMedia,
            encrypted, manifest.SecretHandling, manifest.SourceVersion,
            manifest.SourceVersion is null ? "unknown" : "compatible",
            warnings.ToArray(), DateTimeOffset.UtcNow.Add(StageLifetime));
    }

    private static List<ZipArchiveEntry> ValidateEntries(ZipArchive archive)
    {
        if (archive.Entries.Count is 0 or > 100_000) throw new InvalidDataException("The backup contains an invalid number of files.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        foreach (var entry in archive.Entries)
        {
            var name = entry.FullName.Replace('\\', '/');
            if (name.StartsWith('/') || name.Split('/').Any(part => part == "..") || !names.Add(name))
                throw new InvalidDataException("The backup contains an unsafe or duplicate file path.");
            if (!(name == "lessoncue-backup.json" || name.StartsWith("database/") || name.StartsWith("config/") || name.StartsWith("media/")))
                throw new InvalidDataException("The backup contains files outside the LessonCue backup structure.");
            if (((entry.ExternalAttributes >> 16) & 0xF000) == 0xA000) throw new InvalidDataException("Symbolic links are not allowed in backups.");
            total = checked(total + entry.Length);
            if (total > MaximumArchiveBytes * 2) throw new InvalidDataException("The expanded backup is too large to restore safely.");
        }
        return archive.Entries.ToList();
    }

    private static async Task<BackupManifestSummary> ValidateManifestAsync(
        List<ZipArchiveEntry> entries,
        CancellationToken ct)
    {
        var manifestEntry = entries.SingleOrDefault(x => x.FullName == "lessoncue-backup.json")
            ?? throw new InvalidDataException("The backup does not contain a LessonCue manifest.");
        BackupManifest? manifest;
        await using (var stream = manifestEntry.Open())
            manifest = await JsonSerializer.DeserializeAsync<BackupManifest>(
                stream, JsonOptions, ct);
        if (manifest is null ||
            !string.Equals(manifest.Product, "LessonCue", StringComparison.Ordinal))
            throw new InvalidDataException("The backup manifest is not a LessonCue manifest.");
        if (manifest.FormatVersion == 1)
            return new BackupManifestSummary(1, "legacy-combined", null);
        if (manifest.FormatVersion != 2 || manifest.Files is null)
            throw new InvalidDataException(
                $"LessonCue backup format {manifest.FormatVersion} is not supported by this server.");

        var secretHandling = NormalizeSecretHandling(manifest.SecretHandling);
        var sourceVersion = NormalizeVersion(manifest.ServerVersion);
        var currentVersion = NormalizeVersion(UpdateService.InstalledVersion());
        if (sourceVersion is not null &&
            currentVersion is not null &&
            UpdateService.IsNewer(sourceVersion, currentVersion))
            throw new InvalidDataException(
                $"This backup was created by LessonCue {sourceVersion}. Update this server from {currentVersion} before restoring it.");
        var contentEntries = entries
            .Where(x => x.FullName != "lessoncue-backup.json" && !x.FullName.EndsWith('/'))
            .ToList();
        if (manifest.Files.Count != contentEntries.Count)
            throw new InvalidDataException("The backup manifest does not describe every archive file.");

        foreach (var entry in contentEntries)
        {
            if (!manifest.Files.TryGetValue(entry.FullName, out var expected) ||
                expected.Bytes != entry.Length ||
                expected.Sha256.Length != 64)
                throw new InvalidDataException(
                    $"The backup manifest entry for {entry.FullName} is missing or invalid.");
            byte[] expectedHash;
            try { expectedHash = Convert.FromHexString(expected.Sha256); }
            catch (FormatException ex)
            {
                throw new InvalidDataException(
                    $"The backup manifest hash for {entry.FullName} is invalid.", ex);
            }
            var actualHash = await HashEntryAsync(entry, ct);
            if (!CryptographicOperations.FixedTimeEquals(expectedHash, actualHash))
                throw new InvalidDataException(
                    $"The backup file {entry.FullName} does not match its authenticated manifest.");
        }

        return new BackupManifestSummary(2, secretHandling, sourceVersion);
    }

    private static async Task ExtractValidatedAsync(string archivePath, string destination, CancellationToken ct)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        foreach (var entry in ValidateEntries(archive).Where(x => !x.FullName.EndsWith('/')))
        {
            var outputPath = Path.GetFullPath(Path.Combine(destination, entry.FullName));
            if (!outputPath.StartsWith(Path.GetFullPath(destination) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                throw new InvalidDataException("The backup contains an unsafe file path.");
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
            await using var input = entry.Open(); await using var output = File.Create(outputPath);
            await input.CopyToAsync(output, ct);
        }
    }

    private static async Task ExtractDatabaseAsync(string archivePath, string destination, CancellationToken ct)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        var entry = ValidateEntries(archive).Single(x => x.FullName == "database/lessoncue.db");
        await using var input = entry.Open(); await using var output = File.Create(destination);
        await input.CopyToAsync(output, ct);
    }

    private static async Task<bool> TableExistsAsync(SqliteConnection connection, string table, CancellationToken ct)
    { await using var command = connection.CreateCommand(); command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=$name"; command.Parameters.AddWithValue("$name", table); return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 1; }
    private static async Task<int> CountAsync(SqliteConnection connection, string table, CancellationToken ct)
    { await using var command = connection.CreateCommand(); command.CommandText = $"SELECT COUNT(*) FROM \"{table}\""; return Convert.ToInt32(await command.ExecuteScalarAsync(ct)); }
    private static async Task<string?> ScalarStringAsync(SqliteConnection connection, string sql, CancellationToken ct)
    { await using var command = connection.CreateCommand(); command.CommandText = sql; return (string?)await command.ExecuteScalarAsync(ct); }
    private string StageDirectory(Guid id) => Path.Combine(restorePath, id.ToString("N"));
    private static long DirectoryBytes(string path) => Directory.Exists(path)
        ? Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories).Sum(file => new FileInfo(file).Length) : 0;
    private void CleanupExpiredStages() { if (!Directory.Exists(restorePath)) return; foreach (var directory in Directory.EnumerateDirectories(restorePath)) if (Directory.GetCreationTimeUtc(directory) < DateTime.UtcNow - StageLifetime) TryDelete(directory); }
    private static void TryDelete(string path) { try { if (Directory.Exists(path)) Directory.Delete(path, true); else if (File.Exists(path)) File.Delete(path); } catch { } }

    private async Task<bool> PrepareArchiveAsync(
        string sourcePath,
        string archivePath,
        string? password,
        CancellationToken ct)
    {
        await using var source = File.OpenRead(sourcePath);
        var encrypted = BackupArchiveEncryption.IsEncrypted(source);
        if (encrypted)
        {
            var plaintextBytes = BackupArchiveEncryption.ReadPlaintextLength(source);
            var root = Path.GetPathRoot(dataPath) ?? dataPath;
            if (plaintextBytes > MaximumArchiveBytes ||
                new DriveInfo(root).AvailableFreeSpace - DiskReserveBytes < plaintextBytes)
                throw new IOException(
                    "The server does not have enough free disk space to decrypt and validate this backup safely.");
            await BackupArchiveEncryption.DecryptAsync(
                sourcePath, archivePath, password ?? "", ct);
        }
        else
            File.Copy(sourcePath, archivePath, overwrite: false);
        return encrypted;
    }

    private static async Task<BackupSourceMetadata> ReadSourceMetadataAsync(
        string stage,
        CancellationToken ct)
    {
        var path = Path.Combine(stage, "source-metadata.json");
        if (!File.Exists(path))
            return new BackupSourceMetadata(
                false,
                new FileInfo(Path.Combine(stage, "upload.zip")).Length);
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<BackupSourceMetadata>(
                   stream, JsonOptions, ct)
               ?? throw new InvalidDataException("The staged backup metadata is unreadable.");
    }

    private bool IncludeConfigFile(string path, string secretHandling)
    {
        var configRoot = Path.Combine(dataPath, "config");
        var relative = Path.GetRelativePath(configRoot, path).Replace('\\', '/');
        if (string.Equals(relative, "cloudflare-token.pending", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(relative, "backup-policy.json", StringComparison.OrdinalIgnoreCase))
            return false;
        if (secretHandling == "include") return true;
        if (relative.StartsWith("keys/", StringComparison.OrdinalIgnoreCase)) return false;
        return !SensitiveConfigFiles.Contains(relative);
    }

    private static string NormalizeSecretHandling(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "include" => "include",
            "exclude" or null or "" => "exclude",
            _ => throw new ArgumentException(
                "Secret handling must be either exclude or include.")
        };

    private static string? NormalizeVersion(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = value.Trim().TrimStart('v', 'V').Split(['-', '+'])[0];
        return Version.TryParse(normalized, out var version)
            ? version.ToString()
            : null;
    }

    private static async Task AddDirectoryAsync(
        ZipArchive archive,
        string source,
        string prefix,
        Dictionary<string, BackupManifestFile> files,
        Func<string, bool>? include,
        CancellationToken ct)
    {
        if (!Directory.Exists(source)) return;
        foreach (var file in Directory
                     .EnumerateFiles(source, "*", SearchOption.AllDirectories)
                     .Where(path => include?.Invoke(path) != false)
                     .OrderBy(path => path, StringComparer.Ordinal))
        {
            var relative = Path.GetRelativePath(source, file).Replace('\\', '/');
            await AddFileAsync(
                archive, file, $"{prefix}/{relative}", files, ct);
        }
    }

    private static async Task AddFileAsync(
        ZipArchive archive,
        string source,
        string archivePath,
        Dictionary<string, BackupManifestFile> files,
        CancellationToken ct)
    {
        var entry = archive.CreateEntry(archivePath, CompressionLevel.Fastest);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        await using var input = new FileStream(
            source, FileMode.Open, FileAccess.Read, FileShare.Read,
            1024 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        await using var output = entry.Open();
        var buffer = new byte[1024 * 1024];
        long bytes = 0;
        while (true)
        {
            var read = await input.ReadAsync(buffer, ct);
            if (read == 0) break;
            await output.WriteAsync(buffer.AsMemory(0, read), ct);
            hash.AppendData(buffer, 0, read);
            bytes = checked(bytes + read);
        }
        files.Add(
            archivePath,
            new BackupManifestFile(bytes, Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant()));
    }

    private static async Task<byte[]> HashEntryAsync(
        ZipArchiveEntry entry,
        CancellationToken ct)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        await using var input = entry.Open();
        var buffer = new byte[1024 * 1024];
        while (true)
        {
            var read = await input.ReadAsync(buffer, ct);
            if (read == 0) break;
            hash.AppendData(buffer, 0, read);
        }
        return hash.GetHashAndReset();
    }

    private sealed record BackupManifest(
        string Product,
        int FormatVersion,
        DateTimeOffset CreatedAt,
        string Kind,
        bool IncludesMedia,
        string SecretHandling,
        string? ServerVersion,
        Dictionary<string, BackupManifestFile>? Files);

    private sealed record BackupManifestFile(long Bytes, string Sha256);
    private sealed record BackupManifestSummary(
        int FormatVersion,
        string SecretHandling,
        string? SourceVersion);
    private sealed record BackupSourceMetadata(bool Encrypted, long SourceBytes);
}
