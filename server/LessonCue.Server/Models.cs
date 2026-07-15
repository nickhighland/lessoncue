using System.ComponentModel.DataAnnotations;

namespace LessonCue.Server;

public sealed class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(160)] public required string Name { get; set; }
    [MaxLength(100)] public string TimeZone { get; set; } = "America/New_York";
}

public sealed class LessonClass
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(120)] public required string Name { get; set; }
    [MaxLength(1000)] public string Description { get; set; } = "";
}

public sealed class Lesson
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClassId { get; set; }
    public LessonClass? Class { get; set; }
    public DateOnly Date { get; set; }
    [MaxLength(160)] public required string Title { get; set; }
    public DateTimeOffset? AvailableFrom { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? DesignatedStartAt { get; set; }
    public bool PreRollEnabled { get; set; }
    public Guid? CountdownItemId { get; set; }
    public int Version { get; set; } = 1;
    public List<PlaylistItem> Items { get; set; } = [];
}

public sealed class PlaylistItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }
    [MaxLength(160)] public required string Title { get; set; }
    [MaxLength(32)] public string Type { get; set; } = "video";
    [MaxLength(32)] public string Role { get; set; } = "lesson";
    public decimal Position { get; set; }
    public Guid? MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }
    public long? DurationMs { get; set; }
    public long StartMs { get; set; }
    public long? EndMs { get; set; }
    public int VolumePercent { get; set; } = 100;
    public int? ImageDurationSeconds { get; set; }
    [MaxLength(24)] public string EndBehavior { get; set; } = "advance";
    public bool AllowSkip { get; set; } = true;
}

public sealed class MediaAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(255)] public required string FileName { get; set; }
    [MaxLength(100)] public string ContentType { get; set; } = "application/octet-stream";
    [MaxLength(512)] public required string RelativePath { get; set; }
    [MaxLength(64)] public string? Sha256 { get; set; }
    public long SizeBytes { get; set; }
    public long? DurationMs { get; set; }
    public bool OfflineEligible { get; set; } = true;
}

public sealed class Screen
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(120)] public required string Name { get; set; }
    [MaxLength(32)] public string Platform { get; set; } = "android-tv";
    public Guid? AssignedClassId { get; set; }
    public bool VolunteerMode { get; set; } = true;
    public DateTimeOffset? LastSeenAt { get; set; }
    public long FreeBytes { get; set; }
    public int FailedDownloads { get; set; }
    public bool Revoked { get; set; }
}

public sealed class PairingAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(120)] public required string DeviceName { get; set; }
    [MaxLength(32)] public required string Platform { get; set; }
    [MaxLength(32)] public required string AppVersion { get; set; }
    public string PinHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public int FailedAttempts { get; set; }
    public bool Completed { get; set; }
}

public sealed class DeviceCredential
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ScreenId { get; set; }
    [MaxLength(64)] public required string TokenHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    [MaxLength(100)] public string Actor { get; set; } = "system";
    [MaxLength(80)] public required string Action { get; set; }
    [MaxLength(160)] public required string Object { get; set; }
    [MaxLength(32)] public string Result { get; set; } = "success";
    public string? Summary { get; set; }
}

public sealed record ClassInput(string Name, string? Description);
public sealed record LessonInput(Guid ClassId, DateOnly Date, string Title, DateTimeOffset? AvailableFrom,
    DateTimeOffset? ExpiresAt, DateTimeOffset? DesignatedStartAt, bool PreRollEnabled, Guid? CountdownItemId);
public sealed record PlaylistItemInput(string Title, string Type, string? Role, decimal Position,
    Guid? MediaId, long? DurationMs, long StartMs, long? EndMs, int VolumePercent,
    int? ImageDurationSeconds, string? EndBehavior, bool AllowSkip);
public sealed record PairingRequestInput(string DeviceName, string Platform, string AppVersion, string? DevicePublicKey);
public sealed record PairingConfirmInput(Guid RequestId, string Pin);
public sealed record TvStatusInput(Guid ScreenId, string AppVersion, bool Online, long FreeBytes,
    int ManifestVersion, int FailedDownloads);
