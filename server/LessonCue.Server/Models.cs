using System.ComponentModel.DataAnnotations;

namespace LessonCue.Server;

public sealed class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(160)] public required string Name { get; set; }
    [MaxLength(100)] public string TimeZone { get; set; } = "America/New_York";
    [MaxLength(160)] public string SiteName { get; set; } = "Main Site";
    [MaxLength(16)] public string WeekStartsOn { get; set; } = "Sunday";
    public int DefaultLessonDurationMinutes { get; set; } = 60;
    public int DefaultRetentionDays { get; set; } = 30;
    public long StorageLimitBytes { get; set; }
    [MaxLength(16)] public string PrimaryColor { get; set; } = "#25302d";
    [MaxLength(16)] public string AccentColor { get; set; } = "#d89127";
    [MaxLength(16)] public string NavigationTextColor { get; set; } = "#aac0bb";
    [MaxLength(16)] public string SelectedTabColor { get; set; } = "#3a4541";
    [MaxLength(240)] public string WelcomeMessage { get; set; } = "Welcome";
}

public sealed class AdminAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(80)] public required string Username { get; set; }
    [MaxLength(120)] public string DisplayName { get; set; } = "Administrator";
    [MaxLength(200)] public string? Email { get; set; }
    [MaxLength(32)] public string Role { get; set; } = "Owner";
    public bool Disabled { get; set; }
    public required string PasswordHash { get; set; }
    public int SessionVersion { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAt { get; set; }
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
    public DateTimeOffset? PreRollStartsAt { get; set; }
    public bool PreRollEnabled { get; set; }
    public Guid? CountdownItemId { get; set; }
    public int Version { get; set; } = 1;
    public bool Archived { get; set; }
    public bool KeepOffline { get; set; }
    public int DownloadDaysBefore { get; set; } = 7;
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
    [MaxLength(2000)] public string Notes { get; set; } = "";
    public int FadeInMs { get; set; }
    public int FadeOutMs { get; set; }
    public bool NormalizeAudio { get; set; }
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
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [MaxLength(32)] public string ProcessingStatus { get; set; } = "pending";
    [MaxLength(1000)] public string? ProcessingError { get; set; }
    [MaxLength(40)] public string? VideoCodec { get; set; }
    [MaxLength(40)] public string? AudioCodec { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public double? LoudnessLufs { get; set; }
    [MaxLength(512)] public string? ThumbnailPath { get; set; }
    [MaxLength(32)] public string SourceKind { get; set; } = "upload";
    [MaxLength(2048)] public string? SourceUrl { get; set; }
    [MaxLength(32)] public string? LinkKind { get; set; }
    [MaxLength(32)] public string StoragePolicy { get; set; } = "persistent";
    public Guid? OriginLessonId { get; set; }
    public DateTimeOffset? DeleteAfter { get; set; }
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
    [MaxLength(32)] public string AppVersion { get; set; } = "unknown";
    public int ManifestVersion { get; set; }
    [MaxLength(500)] public string TagsCsv { get; set; } = "";
    [MaxLength(100)] public string Site { get; set; } = "Main Site";
    [MaxLength(64)] public string? LastIpAddress { get; set; }
    public int ControlVersion { get; set; }
    [MaxLength(24)] public string ControlAction { get; set; } = "none";
    public Guid? ControlLessonId { get; set; }
    public Guid? ControlItemId { get; set; }
    public long? ControlPositionMs { get; set; }
    public DateTimeOffset? ControlIssuedAt { get; set; }
    [MaxLength(24)] public string PlaybackState { get; set; } = "idle";
}

public sealed class PlaybackCommandRecord
{
    public long Id { get; set; }
    public Guid ScreenId { get; set; }
    public Screen? Screen { get; set; }
    public int Version { get; set; }
    [MaxLength(24)] public string Action { get; set; } = "none";
    public Guid? LessonId { get; set; }
    public Guid? ItemId { get; set; }
    public long? PositionMs { get; set; }
    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SignagePlaylist
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(160)] public required string Name { get; set; }
    [MaxLength(32)] public string Mode { get; set; } = "scheduled";
    public bool Enabled { get; set; } = true;
    public int Priority { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    [MaxLength(2000)] public string Message { get; set; } = "";
    [MaxLength(16)] public string BackgroundColor { get; set; } = "#25302d";
    [MaxLength(16)] public string TextColor { get; set; } = "#ffffff";
    public Guid? MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }
    [MaxLength(2000)] public string TargetTagsCsv { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class BackupRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(255)] public required string FileName { get; set; }
    [MaxLength(32)] public string Kind { get; set; } = "configuration";
    public long SizeBytes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [MaxLength(80)] public string CreatedBy { get; set; } = "system";
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
    DateTimeOffset? ExpiresAt, DateTimeOffset? DesignatedStartAt, bool PreRollEnabled, Guid? CountdownItemId,
    DateTimeOffset? PreRollStartsAt = null);
public sealed record PlaylistItemInput(string Title, string Type, string? Role, decimal Position,
    Guid? MediaId, long? DurationMs, long StartMs, long? EndMs, int VolumePercent,
    int? ImageDurationSeconds, string? EndBehavior, bool AllowSkip);
public sealed record PairingRequestInput(string DeviceName, string Platform, string AppVersion, string? DevicePublicKey);
public sealed record PairingConfirmInput(Guid RequestId, string Pin);
public sealed record PairingPinInput(string? Pin, bool Automatic = false);
public sealed record TvStatusInput(Guid ScreenId, string AppVersion, bool Online, long FreeBytes,
    int ManifestVersion, int FailedDownloads);
public sealed record AdminSetupInput(string OrganizationName, string Username, string Password,
    string? DisplayName = null, string? TimeZone = null, string? Email = null,
    string? SiteName = null, string? WeekStartsOn = null);
public sealed record AdminLoginInput(string Username, string Password);
public sealed record LessonUpdateInput(string? Title, DateOnly? Date, DateTimeOffset? AvailableFrom,
    DateTimeOffset? ExpiresAt, DateTimeOffset? DesignatedStartAt, bool? PreRollEnabled, Guid? CountdownItemId,
    bool ClearCountdown = false, bool ClearAvailableFrom = false, bool ClearExpiresAt = false,
    bool ClearDesignatedStartAt = false, DateTimeOffset? PreRollStartsAt = null, bool ClearPreRollStartsAt = false);
public sealed record PlaylistItemUpdateInput(string? Title, string? Type, string? Role, Guid? MediaId,
    long? DurationMs, long? StartMs, long? EndMs, int? VolumePercent, int? ImageDurationSeconds,
    string? EndBehavior, bool? AllowSkip, bool ClearEndMs = false, string? Notes = null,
    int? FadeInMs = null, int? FadeOutMs = null, bool? NormalizeAudio = null);
public sealed record PlaylistReorderInput(List<Guid> ItemIds);
public sealed record ScreenUpdateInput(string? Name, Guid? AssignedClassId, bool? VolunteerMode,
    bool ClearAssignment = false, string? TagsCsv = null, string? Site = null);
public sealed record ScreenControlInput(string Action, Guid? LessonId = null, Guid? ItemId = null, long? PositionMs = null);
public sealed record UserInput(string Username, string DisplayName, string? Email, string Role, string? Password, bool Disabled = false);
public sealed record OrganizationInput(string Name, string SiteName, string TimeZone, string WeekStartsOn,
    int DefaultLessonDurationMinutes, int DefaultRetentionDays, string PrimaryColor, string AccentColor,
    string? NavigationTextColor, string? SelectedTabColor, string WelcomeMessage);
public sealed record StorageLimitInput(long LimitBytes);
public sealed record LocalHostnameInput(string Hostname);
public sealed record SignageInput(string Name, string Mode, bool Enabled, int Priority, DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt, string? Message, string? BackgroundColor, string? TextColor, Guid? MediaAssetId, string? TargetTagsCsv);
public sealed record LinkInput(string Url, string? Title, bool Download = false, bool Persistent = true, Guid? LessonId = null);
public sealed record UploadCompleteInput(string FileName, string ContentType, int TotalChunks, long? DurationMs,
    bool Persistent = false, Guid? LessonId = null);
