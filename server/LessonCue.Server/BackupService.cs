using System.IO.Compression;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record BackupPreview(Guid RestoreId, string FileName, string Kind, long CompressedBytes,
    long UncompressedBytes, int FileCount, string Organization, int Users, int Classes, int Lessons,
    int MediaRecords, int MediaFiles, bool IncludesMedia, string[] Warnings, DateTimeOffset ExpiresAt);

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

    public BackupService(string dataPath)
    {
        this.dataPath = dataPath;
        BackupPath = Path.Combine(dataPath, "backups");
        restorePath = Path.Combine(dataPath, "restore-staging");
    }

    public string BackupPath { get; }
    public bool IsRestoring => isRestoring;

    public async Task<BackupRecord> CreateAsync(LessonCueDb db, bool includeMedia, string actor, CancellationToken ct)
    {
        Directory.CreateDirectory(BackupPath);
        var id = Guid.NewGuid();
        var kind = includeMedia ? "full" : "configuration";
        var fileName = $"lessoncue-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{kind}-{id.ToString()[..8]}.zip";
        var destination = Path.Combine(BackupPath, fileName);
        var databaseSnapshot = Path.Combine(BackupPath, $".{id:N}.db");
        try
        {
            await db.Database.OpenConnectionAsync(ct);
            await using (var snapshot = new SqliteConnection($"Data Source={databaseSnapshot};Pooling=False"))
            {
                await snapshot.OpenAsync(ct);
                ((SqliteConnection)db.Database.GetDbConnection()).BackupDatabase(snapshot);
            }
            using (var archive = ZipFile.Open(destination, ZipArchiveMode.Create))
            {
                var manifest = archive.CreateEntry("lessoncue-backup.json", CompressionLevel.Fastest);
                await using (var stream = manifest.Open())
                    await JsonSerializer.SerializeAsync(stream, new { product = "LessonCue", formatVersion = 1,
                        createdAt = DateTimeOffset.UtcNow, kind, includesMedia = includeMedia }, cancellationToken: ct);
                archive.CreateEntryFromFile(databaseSnapshot, "database/lessoncue.db", CompressionLevel.Fastest);
                AddDirectory(archive, Path.Combine(dataPath, "config"), "config");
                if (includeMedia) AddDirectory(archive, Path.Combine(dataPath, "media"), "media", path =>
                    !path.StartsWith(Path.Combine(dataPath, "media", "temporary"), StringComparison.Ordinal));
            }
        }
        catch
        {
            TryDelete(destination);
            throw;
        }
        finally
        {
            TryDelete(databaseSnapshot);
        }
        var record = new BackupRecord { Id = id, FileName = fileName, Kind = kind,
            SizeBytes = new FileInfo(destination).Length, CreatedBy = actor };
        db.BackupRecords.Add(record);
        await db.SaveChangesAsync(ct);
        return record;
    }

    public async Task<BackupPreview> StageAsync(Stream source, string fileName, long length, CancellationToken ct)
    {
        if (length <= 0 || length > MaximumArchiveBytes) throw new InvalidDataException("Choose a non-empty LessonCue backup smaller than 20 GB.");
        CleanupExpiredStages();
        var root = Path.GetPathRoot(dataPath) ?? dataPath;
        if (new DriveInfo(root).AvailableFreeSpace - DiskReserveBytes < length)
            throw new IOException("The server does not have enough free disk space to validate this backup safely.");
        var restoreId = Guid.NewGuid();
        var stage = StageDirectory(restoreId);
        Directory.CreateDirectory(stage);
        var archivePath = Path.Combine(stage, "upload.zip");
        try
        {
            await using (var destination = File.Create(archivePath)) await source.CopyToAsync(destination, ct);
            var preview = await InspectAsync(restoreId, Path.GetFileName(fileName), archivePath, ct);
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
            var preview = await InspectAsync(restoreId, "upload.zip", archivePath, ct);
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
            db.BackupRecords.Add(safety);
            db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "backup.restore", Object = restoreId.ToString(),
                Summary = JsonSerializer.Serialize(new { preview.Kind, safetyBackup = safety.FileName, preview.Organization }) });
            await db.SaveChangesAsync(ct);
            if (mediaRollback is not null) TryDelete(mediaRollback);
            TryDelete(stage);
            return new BackupRestoreResult(safety.Id, safety.FileName, preview.Kind, preview.Organization,
                preview.IncludesMedia, ["server identity", "encryption keys", "hostname and port", "pairing secrets"]);
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

    private async Task<BackupPreview> InspectAsync(Guid restoreId, string fileName, string archivePath, CancellationToken ct)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        var entries = ValidateEntries(archive);
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
        var mediaRecords = await CountAsync(connection, "MediaAssets", ct);
        if (includesMedia && mediaFiles < mediaRecords) warnings.Add("Some media records may not have an original file in this archive.");
        return new BackupPreview(restoreId, fileName, includesMedia ? "full" : "configuration",
            new FileInfo(archivePath).Length, entries.Sum(x => x.Length), entries.Count, organization,
            await CountAsync(connection, "AdminAccounts", ct), await CountAsync(connection, "Classes", ct),
            await CountAsync(connection, "Lessons", ct), mediaRecords, mediaFiles, includesMedia,
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

    private static void AddDirectory(ZipArchive archive, string source, string prefix, Func<string, bool>? include = null)
    {
        if (!Directory.Exists(source)) return;
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories).Where(path => include?.Invoke(path) != false))
        {
            var relative = Path.GetRelativePath(source, file).Replace('\\', '/');
            archive.CreateEntryFromFile(file, $"{prefix}/{relative}", CompressionLevel.Fastest);
        }
    }
}
