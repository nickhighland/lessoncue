using System.Data;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

/// <summary>
/// LessonCue ships as a single-file appliance, so upgrades must work without an
/// operator installing a migration tool. New installs are created by EF and this
/// small, idempotent upgrader brings existing v0.1/v0.2 databases forward.
/// </summary>
public static class DatabaseUpgrade
{
    public static async Task ApplyAsync(LessonCueDb db, CancellationToken cancellationToken = default)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open) await connection.OpenAsync(cancellationToken);

        await ExecuteAsync(connection,
            """
            CREATE TABLE IF NOT EXISTS "AdminAccounts" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_AdminAccounts" PRIMARY KEY,
                "Username" TEXT NOT NULL,
                "PasswordHash" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "LastLoginAt" TEXT NULL,
                "DisplayName" TEXT NOT NULL DEFAULT 'Administrator',
                "Email" TEXT NULL,
                "Role" TEXT NOT NULL DEFAULT 'Owner',
                "Disabled" INTEGER NOT NULL DEFAULT 0,
                "SessionVersion" INTEGER NOT NULL DEFAULT 1
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AdminAccounts_Username" ON "AdminAccounts" ("Username");
            CREATE INDEX IF NOT EXISTS "IX_AdminAccounts_Email" ON "AdminAccounts" ("Email");
            CREATE TABLE IF NOT EXISTS "AccountTokens" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_AccountTokens" PRIMARY KEY,
                "AccountId" TEXT NOT NULL,
                "Purpose" TEXT NOT NULL,
                "TokenHash" TEXT NOT NULL,
                "PendingEmail" TEXT NULL,
                "ExpiresAt" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "UsedAt" TEXT NULL,
                CONSTRAINT "FK_AccountTokens_AdminAccounts_AccountId" FOREIGN KEY ("AccountId") REFERENCES "AdminAccounts" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AccountTokens_TokenHash" ON "AccountTokens" ("TokenHash");
            CREATE INDEX IF NOT EXISTS "IX_AccountTokens_AccountId" ON "AccountTokens" ("AccountId");
            CREATE TABLE IF NOT EXISTS "RegistrationCodes" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_RegistrationCodes" PRIMARY KEY,
                "CodeHash" TEXT NOT NULL,
                "Hint" TEXT NOT NULL,
                "Label" TEXT NOT NULL DEFAULT '',
                "CreatedAt" TEXT NOT NULL,
                "ExpiresAt" TEXT NULL,
                "RevokedAt" TEXT NULL,
                "Uses" INTEGER NOT NULL DEFAULT 0,
                "MaxUses" INTEGER NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_RegistrationCodes_CodeHash" ON "RegistrationCodes" ("CodeHash");
            CREATE INDEX IF NOT EXISTS "IX_MediaAssets_Sha256" ON "MediaAssets" ("Sha256");
            CREATE TABLE IF NOT EXISTS "MediaAssetVersions" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_MediaAssetVersions" PRIMARY KEY,
                "MediaAssetId" TEXT NOT NULL,
                "VersionNumber" INTEGER NOT NULL,
                "FileName" TEXT NOT NULL,
                "ContentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
                "RelativePath" TEXT NOT NULL,
                "Sha256" TEXT NULL,
                "SizeBytes" INTEGER NOT NULL DEFAULT 0,
                "DurationMs" INTEGER NULL,
                "SourceKind" TEXT NOT NULL DEFAULT 'upload',
                "SourceUrl" TEXT NULL,
                "LinkKind" TEXT NULL,
                "ArchivedAt" TEXT NOT NULL,
                "ArchivedBy" TEXT NOT NULL DEFAULT 'admin',
                CONSTRAINT "FK_MediaAssetVersions_MediaAssets_MediaAssetId" FOREIGN KEY ("MediaAssetId") REFERENCES "MediaAssets" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_MediaAssetVersions_MediaAssetId_VersionNumber" ON "MediaAssetVersions" ("MediaAssetId", "VersionNumber");
            CREATE TABLE IF NOT EXISTS "SignagePlaylists" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_SignagePlaylists" PRIMARY KEY,
                "Name" TEXT NOT NULL,
                "Mode" TEXT NOT NULL DEFAULT 'scheduled',
                "Enabled" INTEGER NOT NULL DEFAULT 1,
                "Priority" INTEGER NOT NULL DEFAULT 0,
                "StartsAt" TEXT NULL,
                "EndsAt" TEXT NULL,
                "Message" TEXT NOT NULL DEFAULT '',
                "BackgroundColor" TEXT NOT NULL DEFAULT '#25302d',
                "TextColor" TEXT NOT NULL DEFAULT '#ffffff',
                "MediaAssetId" TEXT NULL,
                "TargetTagsCsv" TEXT NOT NULL DEFAULT '',
                "Recurrence" TEXT NOT NULL DEFAULT 'once',
                "ScheduleStartDate" TEXT NULL,
                "ScheduleEndDate" TEXT NULL,
                "StartMinutes" INTEGER NULL,
                "EndMinutes" INTEGER NULL,
                "DaysOfWeekCsv" TEXT NOT NULL DEFAULT '',
                "ExcludedDatesJson" TEXT NOT NULL DEFAULT '[]',
                "TargetScreenIdsJson" TEXT NOT NULL DEFAULT '[]',
                "LayoutPreset" TEXT NOT NULL DEFAULT 'single',
                "ZonesJson" TEXT NOT NULL DEFAULT '[]',
                "WidgetCacheJson" TEXT NOT NULL DEFAULT '[]',
                "WidgetCacheUpdatedAt" TEXT NULL,
                "WidgetCacheError" TEXT NULL,
                "CreatedAt" TEXT NOT NULL,
                "UpdatedAt" TEXT NOT NULL,
                CONSTRAINT "FK_SignagePlaylists_MediaAssets_MediaAssetId" FOREIGN KEY ("MediaAssetId") REFERENCES "MediaAssets" ("Id")
            );
            CREATE TABLE IF NOT EXISTS "BackupRecords" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_BackupRecords" PRIMARY KEY,
                "FileName" TEXT NOT NULL,
                "Kind" TEXT NOT NULL DEFAULT 'configuration',
                "SizeBytes" INTEGER NOT NULL DEFAULT 0,
                "CreatedAt" TEXT NOT NULL,
                "CreatedBy" TEXT NOT NULL DEFAULT 'system'
            );
            CREATE TABLE IF NOT EXISTS "MediaTranscodeVariants" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_MediaTranscodeVariants" PRIMARY KEY,
                "MediaAssetId" TEXT NOT NULL,
                "Profile" TEXT NOT NULL,
                "Status" TEXT NOT NULL DEFAULT 'pending',
                "RelativePath" TEXT NULL,
                "Sha256" TEXT NULL,
                "SizeBytes" INTEGER NULL,
                "Width" INTEGER NOT NULL DEFAULT 0,
                "Height" INTEGER NOT NULL DEFAULT 0,
                "VideoBitrateKbps" INTEGER NOT NULL DEFAULT 0,
                "SourceVersion" INTEGER NOT NULL DEFAULT 1,
                "Error" TEXT NULL,
                "TranscodeEngine" TEXT NULL,
                "QueuedAt" TEXT NOT NULL,
                "StartedAt" TEXT NULL,
                "CompletedAt" TEXT NULL,
                CONSTRAINT "FK_MediaTranscodeVariants_MediaAssets_MediaAssetId" FOREIGN KEY ("MediaAssetId") REFERENCES "MediaAssets" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_MediaTranscodeVariants_MediaAssetId_Profile" ON "MediaTranscodeVariants" ("MediaAssetId", "Profile");
            CREATE INDEX IF NOT EXISTS "IX_MediaTranscodeVariants_Status" ON "MediaTranscodeVariants" ("Status");
            CREATE TABLE IF NOT EXISTS "PlaybackCommands" (
                "Id" INTEGER NOT NULL CONSTRAINT "PK_PlaybackCommands" PRIMARY KEY AUTOINCREMENT,
                "ScreenId" TEXT NOT NULL,
                "Version" INTEGER NOT NULL,
                "Action" TEXT NOT NULL DEFAULT 'none',
                "LessonId" TEXT NULL,
                "ItemId" TEXT NULL,
                "PositionMs" INTEGER NULL,
                "IssuedAt" TEXT NOT NULL,
                CONSTRAINT "FK_PlaybackCommands_Screens_ScreenId" FOREIGN KEY ("ScreenId") REFERENCES "Screens" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlaybackCommands_ScreenId_Version" ON "PlaybackCommands" ("ScreenId", "Version");
            CREATE TABLE IF NOT EXISTS "LessonTemplates" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_LessonTemplates" PRIMARY KEY,
                "Name" TEXT NOT NULL,
                "Description" TEXT NOT NULL DEFAULT '',
                "DefaultTitle" TEXT NOT NULL DEFAULT 'Lesson',
                "DefaultStartMinutes" INTEGER NULL,
                "PreRollLeadMinutes" INTEGER NULL,
                "AvailableLeadMinutes" INTEGER NULL,
                "ExpiresAfterMinutes" INTEGER NULL,
                "PreRollEnabled" INTEGER NOT NULL DEFAULT 0,
                "KeepOffline" INTEGER NOT NULL DEFAULT 0,
                "DownloadDaysBefore" INTEGER NOT NULL DEFAULT 7,
                "CreatedAt" TEXT NOT NULL,
                "UpdatedAt" TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS "LessonTemplateItems" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_LessonTemplateItems" PRIMARY KEY,
                "TemplateId" TEXT NOT NULL,
                "Title" TEXT NOT NULL,
                "Type" TEXT NOT NULL DEFAULT 'video',
                "Role" TEXT NOT NULL DEFAULT 'lesson',
                "Position" TEXT NOT NULL,
                "MediaAssetId" TEXT NULL,
                "DurationMs" INTEGER NULL,
                "StartMs" INTEGER NOT NULL DEFAULT 0,
                "EndMs" INTEGER NULL,
                "VolumePercent" INTEGER NOT NULL DEFAULT 100,
                "ImageDurationSeconds" INTEGER NULL,
                "EndBehavior" TEXT NOT NULL DEFAULT 'advance',
                "AllowSkip" INTEGER NOT NULL DEFAULT 1,
                "Notes" TEXT NOT NULL DEFAULT '',
                "FadeInMs" INTEGER NOT NULL DEFAULT 0,
                "FadeOutMs" INTEGER NOT NULL DEFAULT 0,
                "NormalizeAudio" INTEGER NOT NULL DEFAULT 0,
                "CuePointsJson" TEXT NOT NULL DEFAULT '[]',
                CONSTRAINT "FK_LessonTemplateItems_LessonTemplates_TemplateId" FOREIGN KEY ("TemplateId") REFERENCES "LessonTemplates" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_LessonTemplateItems_MediaAssets_MediaAssetId" FOREIGN KEY ("MediaAssetId") REFERENCES "MediaAssets" ("Id") ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS "IX_LessonTemplateItems_TemplateId" ON "LessonTemplateItems" ("TemplateId");
            CREATE INDEX IF NOT EXISTS "IX_LessonTemplateItems_MediaAssetId" ON "LessonTemplateItems" ("MediaAssetId");
            CREATE TABLE IF NOT EXISTS "RecurringLessonSchedules" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_RecurringLessonSchedules" PRIMARY KEY,
                "TemplateId" TEXT NOT NULL,
                "ClassId" TEXT NOT NULL,
                "Name" TEXT NOT NULL,
                "Frequency" TEXT NOT NULL DEFAULT 'weekly',
                "Interval" INTEGER NOT NULL DEFAULT 1,
                "DayOfWeek" INTEGER NULL,
                "DayOfMonth" INTEGER NULL,
                "StartDate" TEXT NOT NULL,
                "EndDate" TEXT NULL,
                "StartMinutes" INTEGER NULL,
                "TitlePattern" TEXT NOT NULL DEFAULT '{template} — {date}',
                "CustomDatesJson" TEXT NOT NULL DEFAULT '[]',
                "ExcludedDatesJson" TEXT NOT NULL DEFAULT '[]',
                "Enabled" INTEGER NOT NULL DEFAULT 1,
                "GenerateDaysAhead" INTEGER NOT NULL DEFAULT 90,
                "LastGeneratedAt" TEXT NULL,
                "CreatedAt" TEXT NOT NULL,
                "UpdatedAt" TEXT NOT NULL,
                CONSTRAINT "FK_RecurringLessonSchedules_LessonTemplates_TemplateId" FOREIGN KEY ("TemplateId") REFERENCES "LessonTemplates" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_RecurringLessonSchedules_Classes_ClassId" FOREIGN KEY ("ClassId") REFERENCES "Classes" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_RecurringLessonSchedules_TemplateId" ON "RecurringLessonSchedules" ("TemplateId");
            CREATE INDEX IF NOT EXISTS "IX_RecurringLessonSchedules_ClassId" ON "RecurringLessonSchedules" ("ClassId");
            """, cancellationToken);

        var additions = new Dictionary<string, (string Table, string Sql)>
        {
            ["Organizations.SiteName"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"SiteName\" TEXT NOT NULL DEFAULT 'Main Site'"),
            ["Organizations.WeekStartsOn"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"WeekStartsOn\" TEXT NOT NULL DEFAULT 'Sunday'"),
            ["Organizations.DefaultLessonDurationMinutes"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"DefaultLessonDurationMinutes\" INTEGER NOT NULL DEFAULT 60"),
            ["Organizations.DefaultRetentionDays"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"DefaultRetentionDays\" INTEGER NOT NULL DEFAULT 30"),
            ["Organizations.StorageLimitBytes"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"StorageLimitBytes\" INTEGER NOT NULL DEFAULT 0"),
            ["Organizations.PrimaryColor"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"PrimaryColor\" TEXT NOT NULL DEFAULT '#25302d'"),
            ["Organizations.AccentColor"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"AccentColor\" TEXT NOT NULL DEFAULT '#d89127'"),
            ["Organizations.NavigationTextColor"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"NavigationTextColor\" TEXT NOT NULL DEFAULT '#aac0bb'"),
            ["Organizations.SelectedTabColor"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"SelectedTabColor\" TEXT NOT NULL DEFAULT '#3a4541'"),
            ["Organizations.WelcomeMessage"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"WelcomeMessage\" TEXT NOT NULL DEFAULT 'Welcome'"),
            ["Organizations.AdaptiveTranscodingEnabled"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"AdaptiveTranscodingEnabled\" INTEGER NOT NULL DEFAULT 1"),
            ["Organizations.TranscodeLeadDays"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"TranscodeLeadDays\" INTEGER NOT NULL DEFAULT 7"),
            ["Organizations.HardwareAccelerationEnabled"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"HardwareAccelerationEnabled\" INTEGER NOT NULL DEFAULT 1"),
            ["Organizations.MediaFoldersJson"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"MediaFoldersJson\" TEXT NOT NULL DEFAULT '[\"General\",\"Lessons\",\"Signage\"]'"),
            ["Organizations.MediaTagsJson"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"MediaTagsJson\" TEXT NOT NULL DEFAULT '[\"Reusable\",\"Intro\",\"Outro\",\"Reference\"]'"),
            ["Organizations.SignageSourceAllowlistJson"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"SignageSourceAllowlistJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["Organizations.ControllerPinHash"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"ControllerPinHash\" TEXT NULL"),
            ["Organizations.RequireLocalRoomControllers"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"RequireLocalRoomControllers\" INTEGER NOT NULL DEFAULT 0"),
            ["Organizations.RegistrationMode"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"RegistrationMode\" TEXT NOT NULL DEFAULT 'closed'"),
            ["Organizations.PublicBaseUrl"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"PublicBaseUrl\" TEXT NOT NULL DEFAULT ''"),
            ["Organizations.EmailFromAddress"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"EmailFromAddress\" TEXT NOT NULL DEFAULT ''"),
            ["Organizations.EmailFromName"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"EmailFromName\" TEXT NOT NULL DEFAULT 'LessonCue'"),
            ["Organizations.EmailProvider"] = ("Organizations", "ALTER TABLE \"Organizations\" ADD COLUMN \"EmailProvider\" TEXT NOT NULL DEFAULT 'none'"),
            ["MediaAssets.ConversionLessonId"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ConversionLessonId\" TEXT NULL"),
            ["MediaAssets.ConversionSlideDurationSeconds"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ConversionSlideDurationSeconds\" INTEGER NOT NULL DEFAULT 10"),
            ["Classes.ControllerSlug"] = ("Classes", "ALTER TABLE \"Classes\" ADD COLUMN \"ControllerSlug\" TEXT NOT NULL DEFAULT ''"),
            ["Classes.ControllerColor"] = ("Classes", "ALTER TABLE \"Classes\" ADD COLUMN \"ControllerColor\" TEXT NOT NULL DEFAULT '#2d6a4f'"),
            ["Classes.ControllerHostname"] = ("Classes", "ALTER TABLE \"Classes\" ADD COLUMN \"ControllerHostname\" TEXT NULL"),
            ["Classes.DeletedAt"] = ("Classes", "ALTER TABLE \"Classes\" ADD COLUMN \"DeletedAt\" TEXT NULL"),
            ["Classes.DeletedBy"] = ("Classes", "ALTER TABLE \"Classes\" ADD COLUMN \"DeletedBy\" TEXT NULL"),
            ["AdminAccounts.DisplayName"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"DisplayName\" TEXT NOT NULL DEFAULT 'Administrator'"),
            ["AdminAccounts.Email"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"Email\" TEXT NULL"),
            ["AdminAccounts.Role"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"Role\" TEXT NOT NULL DEFAULT 'Owner'"),
            ["AdminAccounts.PermissionsCsv"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"PermissionsCsv\" TEXT NULL"),
            ["AdminAccounts.Disabled"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"Disabled\" INTEGER NOT NULL DEFAULT 0"),
            ["AdminAccounts.SessionVersion"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"SessionVersion\" INTEGER NOT NULL DEFAULT 1"),
            ["AdminAccounts.EmailVerified"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"EmailVerified\" INTEGER NOT NULL DEFAULT 1"),
            ["AdminAccounts.EmailVerifiedAt"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"EmailVerifiedAt\" TEXT NULL"),
            ["AdminAccounts.PendingApproval"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"PendingApproval\" INTEGER NOT NULL DEFAULT 0"),
            ["AdminAccounts.PendingSetup"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"PendingSetup\" INTEGER NOT NULL DEFAULT 0"),
            ["AdminAccounts.MustChangePassword"] = ("AdminAccounts", "ALTER TABLE \"AdminAccounts\" ADD COLUMN \"MustChangePassword\" INTEGER NOT NULL DEFAULT 0"),
            ["Lessons.Archived"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"Archived\" INTEGER NOT NULL DEFAULT 0"),
            ["Lessons.KeepOffline"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"KeepOffline\" INTEGER NOT NULL DEFAULT 0"),
            ["Lessons.DownloadDaysBefore"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"DownloadDaysBefore\" INTEGER NOT NULL DEFAULT 7"),
            ["Lessons.VolumePercent"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"VolumePercent\" INTEGER NOT NULL DEFAULT 100"),
            ["Lessons.Muted"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"Muted\" INTEGER NOT NULL DEFAULT 0"),
            ["Lessons.SubstituteNotes"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"SubstituteNotes\" TEXT NOT NULL DEFAULT ''"),
            ["Lessons.PreRollMonitorUrl"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"PreRollMonitorUrl\" TEXT NULL"),
            ["Lessons.PreRollStartsAt"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"PreRollStartsAt\" TEXT NULL"),
            ["Lessons.GeneratedByScheduleId"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"GeneratedByScheduleId\" TEXT NULL"),
            ["Lessons.DeletedAt"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"DeletedAt\" TEXT NULL"),
            ["Lessons.DeletedBy"] = ("Lessons", "ALTER TABLE \"Lessons\" ADD COLUMN \"DeletedBy\" TEXT NULL"),
            ["PlaylistItems.Notes"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"Notes\" TEXT NOT NULL DEFAULT ''"),
            ["PlaylistItems.FadeInMs"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"FadeInMs\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.FadeOutMs"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"FadeOutMs\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.NormalizeAudio"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"NormalizeAudio\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.CuePointsJson"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"CuePointsJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["PlaylistItems.FitMode"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"FitMode\" TEXT NOT NULL DEFAULT 'fit'"),
            ["PlaylistItems.RotationDegrees"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"RotationDegrees\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.CropLeftPercent"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"CropLeftPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.CropTopPercent"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"CropTopPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.CropRightPercent"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"CropRightPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.CropBottomPercent"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"CropBottomPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.Muted"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"Muted\" INTEGER NOT NULL DEFAULT 0"),
            ["PlaylistItems.PlaybackRatePercent"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"PlaybackRatePercent\" INTEGER NOT NULL DEFAULT 100"),
            ["PlaylistItems.RepeatCount"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"RepeatCount\" INTEGER NOT NULL DEFAULT 1"),
            ["PlaylistItems.BackgroundColor"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"BackgroundColor\" TEXT NOT NULL DEFAULT '#000000'"),
            ["PlaylistItems.TransitionStyle"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"TransitionStyle\" TEXT NOT NULL DEFAULT 'cut'"),
            ["PlaylistItems.TransitionDurationMs"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"TransitionDurationMs\" INTEGER NOT NULL DEFAULT 500"),
            ["PlaylistItems.FlexibleTime"] = ("PlaylistItems", "ALTER TABLE \"PlaylistItems\" ADD COLUMN \"FlexibleTime\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplates.VolumePercent"] = ("LessonTemplates", "ALTER TABLE \"LessonTemplates\" ADD COLUMN \"VolumePercent\" INTEGER NOT NULL DEFAULT 100"),
            ["LessonTemplates.Muted"] = ("LessonTemplates", "ALTER TABLE \"LessonTemplates\" ADD COLUMN \"Muted\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplates.SubstituteNotes"] = ("LessonTemplates", "ALTER TABLE \"LessonTemplates\" ADD COLUMN \"SubstituteNotes\" TEXT NOT NULL DEFAULT ''"),
            ["LessonTemplateItems.FitMode"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"FitMode\" TEXT NOT NULL DEFAULT 'fit'"),
            ["LessonTemplateItems.RotationDegrees"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"RotationDegrees\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplateItems.CropLeftPercent"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"CropLeftPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplateItems.CropTopPercent"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"CropTopPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplateItems.CropRightPercent"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"CropRightPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplateItems.CropBottomPercent"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"CropBottomPercent\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplateItems.Muted"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"Muted\" INTEGER NOT NULL DEFAULT 0"),
            ["LessonTemplateItems.PlaybackRatePercent"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"PlaybackRatePercent\" INTEGER NOT NULL DEFAULT 100"),
            ["LessonTemplateItems.RepeatCount"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"RepeatCount\" INTEGER NOT NULL DEFAULT 1"),
            ["LessonTemplateItems.BackgroundColor"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"BackgroundColor\" TEXT NOT NULL DEFAULT '#000000'"),
            ["LessonTemplateItems.TransitionStyle"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"TransitionStyle\" TEXT NOT NULL DEFAULT 'cut'"),
            ["LessonTemplateItems.TransitionDurationMs"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"TransitionDurationMs\" INTEGER NOT NULL DEFAULT 500"),
            ["LessonTemplateItems.FlexibleTime"] = ("LessonTemplateItems", "ALTER TABLE \"LessonTemplateItems\" ADD COLUMN \"FlexibleTime\" INTEGER NOT NULL DEFAULT 0"),
            ["MediaAssets.CreatedAt"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CreatedAt\" TEXT NOT NULL DEFAULT '1970-01-01T00:00:00+00:00'"),
            ["MediaAssets.DeletedAt"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"DeletedAt\" TEXT NULL"),
            ["MediaAssets.DeletedBy"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"DeletedBy\" TEXT NULL"),
            ["MediaAssets.ProcessingStatus"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ProcessingStatus\" TEXT NOT NULL DEFAULT 'ready'"),
            ["MediaAssets.ProcessingError"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ProcessingError\" TEXT NULL"),
            ["MediaAssets.VideoCodec"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"VideoCodec\" TEXT NULL"),
            ["MediaAssets.AudioCodec"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"AudioCodec\" TEXT NULL"),
            ["MediaAssets.Width"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"Width\" INTEGER NULL"),
            ["MediaAssets.Height"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"Height\" INTEGER NULL"),
            ["MediaAssets.LoudnessLufs"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"LoudnessLufs\" REAL NULL"),
            ["MediaAssets.ThumbnailPath"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ThumbnailPath\" TEXT NULL"),
            ["MediaAssets.FilmstripPath"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"FilmstripPath\" TEXT NULL"),
            ["MediaAssets.WaveformPath"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"WaveformPath\" TEXT NULL"),
            ["MediaAssets.CompatibilityPath"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CompatibilityPath\" TEXT NULL"),
            ["MediaAssets.CompatibilitySha256"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CompatibilitySha256\" TEXT NULL"),
            ["MediaAssets.CompatibilitySizeBytes"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CompatibilitySizeBytes\" INTEGER NULL"),
            ["MediaAssets.CompatibilityStatus"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CompatibilityStatus\" TEXT NOT NULL DEFAULT 'pending'"),
            ["MediaAssets.CompatibilityError"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CompatibilityError\" TEXT NULL"),
            ["MediaAssets.CompatibilityTranscodedAt"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CompatibilityTranscodedAt\" TEXT NULL"),
            ["MediaAssets.CompatibilityTranscodeEngine"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"CompatibilityTranscodeEngine\" TEXT NULL"),
            ["MediaTranscodeVariants.TranscodeEngine"] = ("MediaTranscodeVariants", "ALTER TABLE \"MediaTranscodeVariants\" ADD COLUMN \"TranscodeEngine\" TEXT NULL"),
            ["MediaAssets.SourceKind"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"SourceKind\" TEXT NOT NULL DEFAULT 'upload'"),
            ["MediaAssets.SourceUrl"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"SourceUrl\" TEXT NULL"),
            ["MediaAssets.LinkKind"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"LinkKind\" TEXT NULL"),
            ["MediaAssets.StoragePolicy"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"StoragePolicy\" TEXT NOT NULL DEFAULT 'persistent'"),
            ["MediaAssets.OriginLessonId"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"OriginLessonId\" TEXT NULL"),
            ["MediaAssets.DeleteAfter"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"DeleteAfter\" TEXT NULL"),
            ["MediaAssets.RetentionDateIsManual"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"RetentionDateIsManual\" INTEGER NOT NULL DEFAULT 0"),
            ["MediaAssets.Folder"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"Folder\" TEXT NOT NULL DEFAULT ''"),
            ["MediaAssets.TagsCsv"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"TagsCsv\" TEXT NOT NULL DEFAULT ''"),
            ["MediaAssets.Version"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"Version\" INTEGER NOT NULL DEFAULT 1"),
            ["MediaAssets.ReplacedAt"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ReplacedAt\" TEXT NULL"),
            ["MediaAssets.ConversionStatus"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ConversionStatus\" TEXT NOT NULL DEFAULT 'none'"),
            ["MediaAssets.ConversionError"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ConversionError\" TEXT NULL"),
            ["MediaAssets.ConvertedSlidesJson"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ConvertedSlidesJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["MediaAssets.ConvertedAt"] = ("MediaAssets", "ALTER TABLE \"MediaAssets\" ADD COLUMN \"ConvertedAt\" TEXT NULL"),
            ["SignagePlaylists.Recurrence"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"Recurrence\" TEXT NOT NULL DEFAULT 'once'"),
            ["SignagePlaylists.ScheduleStartDate"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"ScheduleStartDate\" TEXT NULL"),
            ["SignagePlaylists.ScheduleEndDate"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"ScheduleEndDate\" TEXT NULL"),
            ["SignagePlaylists.StartMinutes"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"StartMinutes\" INTEGER NULL"),
            ["SignagePlaylists.EndMinutes"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"EndMinutes\" INTEGER NULL"),
            ["SignagePlaylists.DaysOfWeekCsv"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"DaysOfWeekCsv\" TEXT NOT NULL DEFAULT ''"),
            ["SignagePlaylists.ExcludedDatesJson"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"ExcludedDatesJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["SignagePlaylists.TargetScreenIdsJson"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"TargetScreenIdsJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["SignagePlaylists.UpdatedAt"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"UpdatedAt\" TEXT NOT NULL DEFAULT '1970-01-01T00:00:00+00:00'"),
            ["SignagePlaylists.LayoutPreset"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"LayoutPreset\" TEXT NOT NULL DEFAULT 'single'"),
            ["SignagePlaylists.ZonesJson"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"ZonesJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["SignagePlaylists.WidgetCacheJson"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"WidgetCacheJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["SignagePlaylists.WidgetCacheUpdatedAt"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"WidgetCacheUpdatedAt\" TEXT NULL"),
            ["SignagePlaylists.WidgetCacheError"] = ("SignagePlaylists", "ALTER TABLE \"SignagePlaylists\" ADD COLUMN \"WidgetCacheError\" TEXT NULL"),
            ["Screens.AppVersion"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"AppVersion\" TEXT NOT NULL DEFAULT 'unknown'"),
            ["Screens.ManifestVersion"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ManifestVersion\" INTEGER NOT NULL DEFAULT 0"),
            ["Screens.TagsCsv"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"TagsCsv\" TEXT NOT NULL DEFAULT ''"),
            ["Screens.Site"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"Site\" TEXT NOT NULL DEFAULT 'Main Site'"),
            ["Screens.LastIpAddress"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"LastIpAddress\" TEXT NULL"),
            ["Screens.ControlVersion"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ControlVersion\" INTEGER NOT NULL DEFAULT 0"),
            ["Screens.ControlAction"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ControlAction\" TEXT NOT NULL DEFAULT 'none'"),
            ["Screens.ControlLessonId"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ControlLessonId\" TEXT NULL"),
            ["Screens.ControlItemId"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ControlItemId\" TEXT NULL"),
            ["Screens.ControlPositionMs"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ControlPositionMs\" INTEGER NULL"),
            ["Screens.ControlIssuedAt"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ControlIssuedAt\" TEXT NULL"),
            ["Screens.PlaybackState"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackState\" TEXT NOT NULL DEFAULT 'idle'"),
            ["Screens.AcknowledgedControlVersion"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"AcknowledgedControlVersion\" INTEGER NOT NULL DEFAULT 0"),
            ["Screens.PlaybackLessonId"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackLessonId\" TEXT NULL"),
            ["Screens.PlaybackItemId"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackItemId\" TEXT NULL"),
            ["Screens.PlaybackPositionMs"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackPositionMs\" INTEGER NOT NULL DEFAULT 0"),
            ["Screens.PlaybackDurationMs"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackDurationMs\" INTEGER NULL"),
            ["Screens.PlaybackVolumePercent"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackVolumePercent\" INTEGER NOT NULL DEFAULT 100"),
            ["Screens.PlaybackUpdatedAt"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackUpdatedAt\" TEXT NULL"),
            ["Screens.PlaybackError"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"PlaybackError\" TEXT NULL"),
            ["Screens.CachedItems"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"CachedItems\" INTEGER NOT NULL DEFAULT 0"),
            ["Screens.TotalItems"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"TotalItems\" INTEGER NOT NULL DEFAULT 0"),
            ["Screens.DeviceModel"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"DeviceModel\" TEXT NULL"),
            ["Screens.OsVersion"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"OsVersion\" TEXT NULL"),
            ["Screens.CacheInventoryJson"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"CacheInventoryJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["Screens.DownloadQueueJson"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"DownloadQueueJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["Screens.CodecCapabilitiesJson"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"CodecCapabilitiesJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["Screens.RecentErrorsJson"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"RecentErrorsJson\" TEXT NOT NULL DEFAULT '[]'"),
            ["Screens.ClockOffsetMs"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ClockOffsetMs\" INTEGER NULL"),
            ["Screens.NetworkLatencyMs"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"NetworkLatencyMs\" INTEGER NULL"),
            ["Screens.NetworkQuality"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"NetworkQuality\" TEXT NOT NULL DEFAULT 'unknown'"),
            ["Screens.DiagnosticsUpdatedAt"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"DiagnosticsUpdatedAt\" TEXT NULL"),
            ["Screens.AllowDiagnosticScreenshots"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"AllowDiagnosticScreenshots\" INTEGER NOT NULL DEFAULT 0"),
            ["Screens.ScreenshotRequestId"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ScreenshotRequestId\" TEXT NULL"),
            ["Screens.ScreenshotRequestedAt"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ScreenshotRequestedAt\" TEXT NULL"),
            ["Screens.ScreenshotExpiresAt"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ScreenshotExpiresAt\" TEXT NULL"),
            ["Screens.ScreenshotStatus"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ScreenshotStatus\" TEXT NOT NULL DEFAULT 'none'"),
            ["Screens.ScreenshotCapturedAt"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ScreenshotCapturedAt\" TEXT NULL"),
            ["Screens.ScreenshotRelativePath"] = ("Screens", "ALTER TABLE \"Screens\" ADD COLUMN \"ScreenshotRelativePath\" TEXT NULL")
        };

        foreach (var (key, addition) in additions)
        {
            var column = key[(key.IndexOf('.') + 1)..];
            if (!await ColumnExistsAsync(connection, addition.Table, column, cancellationToken))
                await ExecuteAsync(connection, addition.Sql, cancellationToken);
        }

        await ExecuteAsync(connection,
            "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_Lessons_GeneratedByScheduleId_Date\" ON \"Lessons\" (\"GeneratedByScheduleId\", \"Date\");",
            cancellationToken);

        var organization = await db.Organizations.FirstOrDefaultAsync(cancellationToken);
        if (organization is not null)
        {
            var current = MediaTaxonomy.Read(organization);
            var existing = await db.MediaAssets.IgnoreQueryFilters().AsNoTracking()
                .Select(media => new { media.Folder, media.TagsCsv }).ToListAsync(cancellationToken);
            var folders = current.Folders.Concat(existing.Select(media => media.Folder).Where(value => !string.IsNullOrWhiteSpace(value)));
            var tags = current.Tags.Concat(existing.SelectMany(media => MediaTaxonomy.SplitTags(media.TagsCsv)));
            if (MediaTaxonomy.TryCreate(folders, tags, out var merged, out _))
            {
                MediaTaxonomy.Store(organization, merged);
                await db.SaveChangesAsync(cancellationToken);
            }
        }

        // Rename only the exact untouched demonstration records shipped in earlier releases.
        await ExecuteAsync(connection,
            """
            UPDATE "Classes" SET "Name" = 'Learning Lab', "Description" = 'A ready-to-use example class for any learning environment.'
              WHERE "Name" = 'Children''s Sunday School' AND "Description" = 'A ready-to-use example class.';
            UPDATE "Lessons" SET "Title" = 'Sample Lesson'
              WHERE "Title" = 'The Good Samaritan' AND "Date" = '2026-07-19'
                AND "ClassId" IN (SELECT "Id" FROM "Classes" WHERE "Name" = 'Learning Lab');
            UPDATE "PlaylistItems" SET "Title" = 'Five-Minute Countdown'
              WHERE "Title" = 'Five Minute Countdown' AND "LessonId" IN
                (SELECT "Id" FROM "Lessons" WHERE "Title" = 'Sample Lesson' AND "Date" = '2026-07-19');
            UPDATE "PlaylistItems" SET "Title" = 'Main Presentation'
              WHERE "Title" = 'Teaching Video' AND "LessonId" IN
                (SELECT "Id" FROM "Lessons" WHERE "Title" = 'Sample Lesson' AND "Date" = '2026-07-19');
            """, cancellationToken);
    }

    private static async Task<bool> ColumnExistsAsync(System.Data.Common.DbConnection connection, string table, string column, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info(\"{table.Replace("\"", "\"\"")}\")";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    private static async Task ExecuteAsync(System.Data.Common.DbConnection connection, string sql, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(ct);
    }
}
