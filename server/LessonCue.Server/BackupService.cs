using System.IO.Compression;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class BackupService(string dataPath)
{
    public string BackupPath { get; } = Path.Combine(dataPath, "backups");

    public async Task<BackupRecord> CreateAsync(LessonCueDb db, bool includeMedia, string actor, CancellationToken ct)
    {
        Directory.CreateDirectory(BackupPath);
        await db.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(FULL);", ct);
        var id = Guid.NewGuid();
        var kind = includeMedia ? "full" : "configuration";
        var fileName = $"lessoncue-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{kind}-{id.ToString()[..8]}.zip";
        var destination = Path.Combine(BackupPath, fileName);
        using (var archive = ZipFile.Open(destination, ZipArchiveMode.Create))
        {
            AddDirectory(archive, Path.Combine(dataPath, "database"), "database");
            AddDirectory(archive, Path.Combine(dataPath, "config"), "config");
            if (includeMedia) AddDirectory(archive, Path.Combine(dataPath, "media"), "media");
        }
        var record = new BackupRecord { Id = id, FileName = fileName, Kind = kind,
            SizeBytes = new FileInfo(destination).Length, CreatedBy = actor };
        db.BackupRecords.Add(record);
        await db.SaveChangesAsync(ct);
        return record;
    }

    public string? Resolve(string fileName)
    {
        var path = Path.GetFullPath(Path.Combine(BackupPath, Path.GetFileName(fileName)));
        return path.StartsWith(Path.GetFullPath(BackupPath), StringComparison.Ordinal) && File.Exists(path) ? path : null;
    }

    private static void AddDirectory(ZipArchive archive, string source, string prefix)
    {
        if (!Directory.Exists(source)) return;
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(source, file).Replace('\\', '/');
            archive.CreateEntryFromFile(file, $"{prefix}/{relative}", CompressionLevel.Fastest);
        }
    }
}
