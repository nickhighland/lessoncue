using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class LessonCueDb(DbContextOptions<LessonCueDb> options) : DbContext(options)
{
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<AdminAccount> AdminAccounts => Set<AdminAccount>();
    public DbSet<AccountToken> AccountTokens => Set<AccountToken>();
    public DbSet<RegistrationCode> RegistrationCodes => Set<RegistrationCode>();
    public DbSet<LessonClass> Classes => Set<LessonClass>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<PlaylistItem> PlaylistItems => Set<PlaylistItem>();
    public DbSet<LessonTemplate> LessonTemplates => Set<LessonTemplate>();
    public DbSet<LessonTemplateItem> LessonTemplateItems => Set<LessonTemplateItem>();
    public DbSet<RecurringLessonSchedule> RecurringLessonSchedules => Set<RecurringLessonSchedule>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<MediaAssetVersion> MediaAssetVersions => Set<MediaAssetVersion>();
    public DbSet<MediaTranscodeVariant> MediaTranscodeVariants => Set<MediaTranscodeVariant>();
    public DbSet<Screen> Screens => Set<Screen>();
    public DbSet<PlaybackCommandRecord> PlaybackCommands => Set<PlaybackCommandRecord>();
    public DbSet<PairingAttempt> PairingAttempts => Set<PairingAttempt>();
    public DbSet<DeviceCredential> DeviceCredentials => Set<DeviceCredential>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<SignagePlaylist> SignagePlaylists => Set<SignagePlaylist>();
    public DbSet<BackupRecord> BackupRecords => Set<BackupRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<LessonClass>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<LessonClass>().HasQueryFilter(x => x.DeletedAt == null);
        modelBuilder.Entity<Lesson>().HasQueryFilter(x => x.DeletedAt == null);
        modelBuilder.Entity<MediaAsset>().HasQueryFilter(x => x.DeletedAt == null);
        modelBuilder.Entity<PlaylistItem>().HasQueryFilter(x => x.Lesson!.DeletedAt == null);
        modelBuilder.Entity<MediaAssetVersion>().HasQueryFilter(x => x.MediaAsset!.DeletedAt == null);
        modelBuilder.Entity<MediaTranscodeVariant>().HasQueryFilter(x => x.MediaAsset!.DeletedAt == null);
        modelBuilder.Entity<RecurringLessonSchedule>().HasQueryFilter(x => x.Class!.DeletedAt == null);
        modelBuilder.Entity<AdminAccount>().HasIndex(x => x.Username).IsUnique();
        modelBuilder.Entity<AdminAccount>().HasIndex(x => x.Email);
        modelBuilder.Entity<AccountToken>().HasIndex(x => x.TokenHash).IsUnique();
        modelBuilder.Entity<AccountToken>().HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<RegistrationCode>().HasIndex(x => x.CodeHash).IsUnique();
        modelBuilder.Entity<MediaAsset>().HasIndex(x => x.Sha256);
        modelBuilder.Entity<MediaAssetVersion>().HasIndex(x => new { x.MediaAssetId, x.VersionNumber }).IsUnique();
        modelBuilder.Entity<MediaAssetVersion>().HasOne(x => x.MediaAsset).WithMany(x => x.Versions)
            .HasForeignKey(x => x.MediaAssetId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<MediaTranscodeVariant>().HasIndex(x => new { x.MediaAssetId, x.Profile }).IsUnique();
        modelBuilder.Entity<MediaTranscodeVariant>().HasIndex(x => x.Status);
        modelBuilder.Entity<MediaTranscodeVariant>().HasOne(x => x.MediaAsset).WithMany(x => x.TranscodeVariants)
            .HasForeignKey(x => x.MediaAssetId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Lesson>().HasMany(x => x.Items).WithOne(x => x.Lesson)
            .HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Lesson>().HasIndex(x => new { x.GeneratedByScheduleId, x.Date }).IsUnique();
        modelBuilder.Entity<PlaylistItem>().Property(x => x.Position).HasPrecision(18, 6);
        modelBuilder.Entity<LessonTemplate>().HasMany(x => x.Items).WithOne(x => x.Template)
            .HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<LessonTemplate>().HasMany(x => x.Schedules).WithOne(x => x.Template)
            .HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<LessonTemplateItem>().Property(x => x.Position).HasPrecision(18, 6);
        modelBuilder.Entity<LessonTemplateItem>().HasOne(x => x.MediaAsset).WithMany()
            .HasForeignKey(x => x.MediaAssetId).OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<RecurringLessonSchedule>().HasOne(x => x.Class).WithMany()
            .HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<DeviceCredential>().HasIndex(x => x.TokenHash).IsUnique();
        modelBuilder.Entity<PlaybackCommandRecord>().HasIndex(x => new { x.ScreenId, x.Version }).IsUnique();
        modelBuilder.Entity<PlaybackCommandRecord>().HasOne(x => x.Screen).WithMany()
            .HasForeignKey(x => x.ScreenId).OnDelete(DeleteBehavior.Cascade);
    }
}
