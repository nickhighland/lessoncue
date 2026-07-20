using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

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
    public bool AdaptiveTranscodingEnabled { get; set; } = true;
    public int TranscodeLeadDays { get; set; } = 7;
    public bool HardwareAccelerationEnabled { get; set; } = true;
    [MaxLength(12000)] public string MediaFoldersJson { get; set; } = "[\"General\",\"Lessons\",\"Signage\"]";
    [MaxLength(12000)] public string MediaTagsJson { get; set; } = "[\"Reusable\",\"Intro\",\"Outro\",\"Reference\"]";
    [JsonIgnore] public string? ControllerPinHash { get; set; }
    public bool RequireLocalRoomControllers { get; set; }
    [MaxLength(16)] public string RegistrationMode { get; set; } = "closed";
    [MaxLength(253)] public string PublicBaseUrl { get; set; } = "";
    [MaxLength(200)] public string EmailFromAddress { get; set; } = "";
    [MaxLength(120)] public string EmailFromName { get; set; } = "LessonCue";
    [MaxLength(16)] public string EmailProvider { get; set; } = "none";
}

public sealed class AdminAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(80)] public required string Username { get; set; }
    [MaxLength(120)] public string DisplayName { get; set; } = "Administrator";
    [MaxLength(200)] public string? Email { get; set; }
    [MaxLength(32)] public string Role { get; set; } = "Owner";
    [MaxLength(512)] public string? PermissionsCsv { get; set; }
    public bool Disabled { get; set; }
    public required string PasswordHash { get; set; }
    public int SessionVersion { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAt { get; set; }
    public bool EmailVerified { get; set; } = true;
    public DateTimeOffset? EmailVerifiedAt { get; set; }
    public bool PendingApproval { get; set; }
    public bool PendingSetup { get; set; }
    public bool MustChangePassword { get; set; }
}

public sealed class AccountToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AccountId { get; set; }
    public AdminAccount? Account { get; set; }
    [MaxLength(32)] public required string Purpose { get; set; }
    [MaxLength(64)] public required string TokenHash { get; set; }
    [MaxLength(200)] public string? PendingEmail { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UsedAt { get; set; }
}

public sealed class RegistrationCode
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(64)] public required string CodeHash { get; set; }
    [MaxLength(16)] public required string Hint { get; set; }
    [MaxLength(120)] public string Label { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public int Uses { get; set; }
    public int? MaxUses { get; set; }
}

public sealed class LessonClass
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(120)] public required string Name { get; set; }
    [MaxLength(1000)] public string Description { get; set; } = "";
    [MaxLength(63)] public string ControllerSlug { get; set; } = "";
    [MaxLength(16)] public string ControllerColor { get; set; } = "#2d6a4f";
    [MaxLength(253)] public string? ControllerHostname { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    [MaxLength(80)] public string? DeletedBy { get; set; }
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
    public Guid? GeneratedByScheduleId { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    [MaxLength(80)] public string? DeletedBy { get; set; }
    public List<PlaylistItem> Items { get; set; } = [];
}

public sealed class LessonTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(160)] public required string Name { get; set; }
    [MaxLength(1000)] public string Description { get; set; } = "";
    [MaxLength(160)] public string DefaultTitle { get; set; } = "Lesson";
    public int? DefaultStartMinutes { get; set; }
    public int? PreRollLeadMinutes { get; set; }
    public int? AvailableLeadMinutes { get; set; }
    public int? ExpiresAfterMinutes { get; set; }
    public bool PreRollEnabled { get; set; }
    public bool KeepOffline { get; set; }
    public int DownloadDaysBefore { get; set; } = 7;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<LessonTemplateItem> Items { get; set; } = [];
    public List<RecurringLessonSchedule> Schedules { get; set; } = [];
}

public sealed class LessonTemplateItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TemplateId { get; set; }
    public LessonTemplate? Template { get; set; }
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
    [MaxLength(8000)] public string CuePointsJson { get; set; } = "[]";
}

public sealed class RecurringLessonSchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TemplateId { get; set; }
    public LessonTemplate? Template { get; set; }
    public Guid ClassId { get; set; }
    public LessonClass? Class { get; set; }
    [MaxLength(160)] public required string Name { get; set; }
    [MaxLength(32)] public string Frequency { get; set; } = "weekly";
    public int Interval { get; set; } = 1;
    public int? DayOfWeek { get; set; }
    public int? DayOfMonth { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public int? StartMinutes { get; set; }
    [MaxLength(240)] public string TitlePattern { get; set; } = "{template} — {date}";
    [MaxLength(12000)] public string CustomDatesJson { get; set; } = "[]";
    [MaxLength(12000)] public string ExcludedDatesJson { get; set; } = "[]";
    public bool Enabled { get; set; } = true;
    public int GenerateDaysAhead { get; set; } = 90;
    public DateTimeOffset? LastGeneratedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
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
    [MaxLength(8000)] public string CuePointsJson { get; set; } = "[]";
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
    public DateTimeOffset? DeletedAt { get; set; }
    [MaxLength(80)] public string? DeletedBy { get; set; }
    [MaxLength(32)] public string ProcessingStatus { get; set; } = "pending";
    [MaxLength(1000)] public string? ProcessingError { get; set; }
    [MaxLength(40)] public string? VideoCodec { get; set; }
    [MaxLength(40)] public string? AudioCodec { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public double? LoudnessLufs { get; set; }
    [MaxLength(512)] public string? ThumbnailPath { get; set; }
    [MaxLength(512)] public string? FilmstripPath { get; set; }
    [MaxLength(512)] public string? WaveformPath { get; set; }
    [MaxLength(512)] public string? CompatibilityPath { get; set; }
    [MaxLength(64)] public string? CompatibilitySha256 { get; set; }
    public long? CompatibilitySizeBytes { get; set; }
    [MaxLength(24)] public string CompatibilityStatus { get; set; } = "pending";
    [MaxLength(1000)] public string? CompatibilityError { get; set; }
    public DateTimeOffset? CompatibilityTranscodedAt { get; set; }
    [MaxLength(32)] public string? CompatibilityTranscodeEngine { get; set; }
    [MaxLength(32)] public string SourceKind { get; set; } = "upload";
    [MaxLength(2048)] public string? SourceUrl { get; set; }
    [MaxLength(32)] public string? LinkKind { get; set; }
    [MaxLength(32)] public string StoragePolicy { get; set; } = "persistent";
    public Guid? OriginLessonId { get; set; }
    public DateTimeOffset? DeleteAfter { get; set; }
    public bool RetentionDateIsManual { get; set; }
    [MaxLength(120)] public string Folder { get; set; } = "";
    [MaxLength(500)] public string TagsCsv { get; set; } = "";
    public int Version { get; set; } = 1;
    public DateTimeOffset? ReplacedAt { get; set; }
    [MaxLength(24)] public string ConversionStatus { get; set; } = "none";
    [MaxLength(1000)] public string? ConversionError { get; set; }
    [MaxLength(24000)] public string ConvertedSlidesJson { get; set; } = "[]";
    public DateTimeOffset? ConvertedAt { get; set; }
    public Guid? ConversionLessonId { get; set; }
    public int ConversionSlideDurationSeconds { get; set; } = 10;
    public List<MediaAssetVersion> Versions { get; set; } = [];
    public List<MediaTranscodeVariant> TranscodeVariants { get; set; } = [];
}

public sealed class MediaTranscodeVariant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }
    [MaxLength(32)] public required string Profile { get; set; }
    [MaxLength(24)] public string Status { get; set; } = "pending";
    [MaxLength(512)] public string? RelativePath { get; set; }
    [MaxLength(64)] public string? Sha256 { get; set; }
    public long? SizeBytes { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public int VideoBitrateKbps { get; set; }
    public int SourceVersion { get; set; }
    [MaxLength(1000)] public string? Error { get; set; }
    [MaxLength(32)] public string? TranscodeEngine { get; set; }
    public DateTimeOffset QueuedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class MediaAssetVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MediaAssetId { get; set; }
    public MediaAsset? MediaAsset { get; set; }
    public int VersionNumber { get; set; }
    [MaxLength(255)] public required string FileName { get; set; }
    [MaxLength(100)] public string ContentType { get; set; } = "application/octet-stream";
    [MaxLength(512)] public required string RelativePath { get; set; }
    [MaxLength(64)] public string? Sha256 { get; set; }
    public long SizeBytes { get; set; }
    public long? DurationMs { get; set; }
    [MaxLength(32)] public string SourceKind { get; set; } = "upload";
    [MaxLength(2048)] public string? SourceUrl { get; set; }
    [MaxLength(32)] public string? LinkKind { get; set; }
    public DateTimeOffset ArchivedAt { get; set; } = DateTimeOffset.UtcNow;
    [MaxLength(80)] public string ArchivedBy { get; set; } = "admin";
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
    public int AcknowledgedControlVersion { get; set; }
    [MaxLength(24)] public string PlaybackState { get; set; } = "idle";
    public Guid? PlaybackLessonId { get; set; }
    public Guid? PlaybackItemId { get; set; }
    public long PlaybackPositionMs { get; set; }
    public long? PlaybackDurationMs { get; set; }
    public int PlaybackVolumePercent { get; set; } = 100;
    public DateTimeOffset? PlaybackUpdatedAt { get; set; }
    [MaxLength(1000)] public string? PlaybackError { get; set; }
    public int CachedItems { get; set; }
    public int TotalItems { get; set; }
    [MaxLength(160)] public string? DeviceModel { get; set; }
    [MaxLength(80)] public string? OsVersion { get; set; }
    public string CacheInventoryJson { get; set; } = "[]";
    public string DownloadQueueJson { get; set; } = "[]";
    public string CodecCapabilitiesJson { get; set; } = "[]";
    public string RecentErrorsJson { get; set; } = "[]";
    public long? ClockOffsetMs { get; set; }
    public int? NetworkLatencyMs { get; set; }
    [MaxLength(24)] public string NetworkQuality { get; set; } = "unknown";
    public DateTimeOffset? DiagnosticsUpdatedAt { get; set; }
    public bool AllowDiagnosticScreenshots { get; set; }
    public Guid? ScreenshotRequestId { get; set; }
    public DateTimeOffset? ScreenshotRequestedAt { get; set; }
    public DateTimeOffset? ScreenshotExpiresAt { get; set; }
    [MaxLength(24)] public string ScreenshotStatus { get; set; } = "none";
    public DateTimeOffset? ScreenshotCapturedAt { get; set; }
    [MaxLength(255)] public string? ScreenshotRelativePath { get; set; }
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
    [MaxLength(16)] public string Recurrence { get; set; } = "once";
    public DateOnly? ScheduleStartDate { get; set; }
    public DateOnly? ScheduleEndDate { get; set; }
    public int? StartMinutes { get; set; }
    public int? EndMinutes { get; set; }
    [MaxLength(64)] public string DaysOfWeekCsv { get; set; } = "";
    [MaxLength(12000)] public string ExcludedDatesJson { get; set; } = "[]";
    [MaxLength(12000)] public string TargetScreenIdsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
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

public sealed record ClassInput(string Name, string? Description, string? ControllerSlug = null,
    string? ControllerColor = null, string? ControllerHostname = null);
public sealed record LessonInput(Guid ClassId, DateOnly Date, string Title, DateTimeOffset? AvailableFrom,
    DateTimeOffset? ExpiresAt, DateTimeOffset? DesignatedStartAt, bool PreRollEnabled, Guid? CountdownItemId,
    DateTimeOffset? PreRollStartsAt = null);
public sealed record PlaylistItemInput(string Title, string Type, string? Role, decimal Position,
    Guid? MediaId, long? DurationMs, long StartMs, long? EndMs, int VolumePercent,
    int? ImageDurationSeconds, string? EndBehavior, bool AllowSkip);
public sealed record PairingRequestInput(string DeviceName, string Platform, string AppVersion, string? DevicePublicKey);
public sealed record PairingConfirmInput(Guid RequestId, string Pin);
public sealed record PairingPinInput(string? Pin, bool Automatic = false);
public sealed record ControllerPinInput(string Pin);
public sealed record TemporaryControllerSessionInput(Guid ClassId, Guid? LessonId, int ExpiresInMinutes = 60);
public sealed record RecycleBinItem(string Kind, Guid Id, string Title, string Detail,
    DateTimeOffset DeletedAt, string? DeletedBy);
public sealed record BackupRestoreInput(Guid RestoreId, string Confirmation);
public sealed record TvStatusInput(Guid ScreenId, string AppVersion, bool Online, long FreeBytes,
    int ManifestVersion, int FailedDownloads, int? AcknowledgedControlVersion = null,
    string? PlaybackState = null, Guid? LessonId = null, Guid? ItemId = null,
    long? PositionMs = null, long? DurationMs = null, int? VolumePercent = null,
    string? PlaybackError = null, int? CachedItems = null, int? TotalItems = null,
    string? DeviceModel = null, string? OsVersion = null, long? ClientTimeUnixMs = null,
    int? NetworkLatencyMs = null, string? NetworkQuality = null,
    List<TvCacheItemInput>? CacheInventory = null, List<TvDownloadItemInput>? DownloadQueue = null,
    List<TvCodecCapabilityInput>? CodecCapabilities = null, List<TvDiagnosticErrorInput>? RecentErrors = null);
public sealed record TvCacheItemInput(string ItemId, string Title, string State, long SizeBytes,
    long? ExpectedBytes = null, string? Error = null);
public sealed record TvDownloadItemInput(string ItemId, string Title, string State, long BytesDownloaded = 0,
    long? ExpectedBytes = null, string? Error = null);
public sealed record TvCodecCapabilityInput(string Kind, string Codec, bool Supported, string? Detail = null);
public sealed record TvDiagnosticErrorInput(DateTimeOffset Timestamp, string Area, string Message, string? ItemId = null);
public sealed record AdminSetupInput(string OrganizationName, string Username, string Password,
    string? DisplayName = null, string? TimeZone = null, string? Email = null,
    string? SiteName = null, string? WeekStartsOn = null);
public sealed record AdminLoginInput(string Username, string Password);
public sealed record RegistrationInput(string Username, string DisplayName, string Email, string Password, string? Code);
public sealed record VerifyAccountInput(string Token);
public sealed record PasswordRecoveryInput(string Email);
public sealed record PasswordResetInput(string Token, string Password);
public sealed record RequiredPasswordChangeInput(string CurrentPassword, string NewPassword);
public sealed record AccountSetupInput(string Token, string Username, string DisplayName, string Password);
public sealed record ProfileUpdateInput(string DisplayName, string Username, string Email, string? CurrentPassword,
    string? NewPassword);
public sealed record RegistrationSettingsInput(string Mode, string PublicBaseUrl, string EmailProvider,
    string EmailFromAddress, string EmailFromName, string? ApiKey);
public sealed record TestAccountEmailInput(string Recipient);
public sealed record RegistrationCodeInput(string Label, DateTimeOffset? ExpiresAt, int? MaxUses);
public sealed record LessonUpdateInput(string? Title, DateOnly? Date, DateTimeOffset? AvailableFrom,
    DateTimeOffset? ExpiresAt, DateTimeOffset? DesignatedStartAt, bool? PreRollEnabled, Guid? CountdownItemId,
    bool ClearCountdown = false, bool ClearAvailableFrom = false, bool ClearExpiresAt = false,
    bool ClearDesignatedStartAt = false, DateTimeOffset? PreRollStartsAt = null, bool ClearPreRollStartsAt = false);
public sealed record PlaylistItemUpdateInput(string? Title, string? Type, string? Role, Guid? MediaId,
    long? DurationMs, long? StartMs, long? EndMs, int? VolumePercent, int? ImageDurationSeconds,
    string? EndBehavior, bool? AllowSkip, bool ClearEndMs = false, string? Notes = null,
    int? FadeInMs = null, int? FadeOutMs = null, bool? NormalizeAudio = null,
    List<CuePointInput>? CuePoints = null);
public sealed record CuePointInput(string Name, long PositionMs);
public sealed record PlaylistReorderInput(List<Guid> ItemIds);
public sealed record LessonBulkInput(List<Guid> LessonIds, string Action, Guid? ClassId = null,
    int? ShiftDays = null, string? TitlePrefix = null);
public sealed record PlaylistItemBulkInput(List<Guid> ItemIds, string Action, string? Role = null,
    int? VolumePercent = null, string? EndBehavior = null, bool? AllowSkip = null, string? TitlePrefix = null);
public sealed record ScreenUpdateInput(string? Name, Guid? AssignedClassId, bool? VolunteerMode,
    bool ClearAssignment = false, string? TagsCsv = null, string? Site = null,
    bool? AllowDiagnosticScreenshots = null);
public sealed record ScreenControlInput(string Action, Guid? LessonId = null, Guid? ItemId = null, long? PositionMs = null);
public sealed record UserInput(string Username, string DisplayName, string? Email, string Role, string? Password,
    bool Disabled = false, List<string>? Permissions = null);
public sealed record UserInvitationInput(string Email, string Role, List<string>? Permissions = null,
    string? DisplayName = null);
public sealed record TemporaryPasswordInput(string Password);
public sealed record OrganizationInput(string Name, string SiteName, string TimeZone, string WeekStartsOn,
    int DefaultLessonDurationMinutes, int DefaultRetentionDays, string PrimaryColor, string AccentColor,
    string? NavigationTextColor, string? SelectedTabColor, string WelcomeMessage,
    bool? AdaptiveTranscodingEnabled = null, int? TranscodeLeadDays = null,
    bool? RequireLocalRoomControllers = null, bool? HardwareAccelerationEnabled = null);
public sealed record StorageLimitInput(long LimitBytes);
public sealed record LocalHostnameInput(string Hostname);
public sealed record HttpPortInput(int Port);
public sealed record CloudflareTunnelInput(bool Enabled, string? PublicHostname, string? Token,
    bool AcknowledgedRemoteExposure = false);
public sealed record SignageInput(string Name, string Mode, bool Enabled, int Priority, DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt, string? Message, string? BackgroundColor, string? TextColor, Guid? MediaAssetId,
    string? TargetTagsCsv, string? Recurrence = null, DateOnly? ScheduleStartDate = null, DateOnly? ScheduleEndDate = null,
    int? StartMinutes = null, int? EndMinutes = null, List<int>? DaysOfWeek = null,
    List<DateOnly>? ExcludedDates = null, List<Guid>? TargetScreenIds = null);
public sealed record LinkInput(string Url, string? Title, bool Download = false, bool Persistent = true,
    Guid? LessonId = null, string? Folder = null, string? TagsCsv = null, bool ImportPresentation = false);
public sealed record UploadCompleteInput(string FileName, string ContentType, int TotalChunks, long? DurationMs,
    bool Persistent = false, Guid? LessonId = null, string? Folder = null, string? TagsCsv = null);
public sealed record MediaBulkInput(List<Guid> MediaIds, string? Action, DateOnly? DeleteOn = null,
    string? Folder = null, string? TagsCsv = null, string? FileNamePrefix = null);
public sealed record MediaOrganizeInput(string? FileName, string? Folder, string? TagsCsv);
public sealed record MediaTaxonomyInput(List<string>? Folders, List<string>? Tags);
public sealed record PresentationLessonInput(Guid LessonId, int ImageDurationSeconds = 10);
public sealed record LessonTemplateFromLessonInput(Guid LessonId, string Name, string? Description = null);
public sealed record LessonTemplateReplaceInput(Guid LessonId);
public sealed record LessonTemplateUpdateInput(string Name, string? Description, string? DefaultTitle,
    int? DefaultStartMinutes, int? PreRollLeadMinutes, bool PreRollEnabled, bool KeepOffline, int DownloadDaysBefore);
public sealed record LessonTemplateInstantiateInput(Guid ClassId, DateOnly Date, string? Title = null, int? StartMinutes = null);
public sealed record RecurringScheduleInput(Guid TemplateId, Guid ClassId, string Name, string Frequency,
    int Interval, int? DayOfWeek, int? DayOfMonth, DateOnly StartDate, DateOnly? EndDate,
    int? StartMinutes, string? TitlePattern, List<DateOnly>? CustomDates, List<DateOnly>? ExcludedDates,
    bool Enabled = true, int GenerateDaysAhead = 90);
public sealed record RecurringScheduleGenerateInput(DateOnly? ThroughDate = null);
public sealed record RecurringScheduleExceptionInput(DateOnly Date, bool Excluded = true);
