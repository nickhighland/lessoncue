using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed class LessonCueDb(DbContextOptions<LessonCueDb> options) : DbContext(options)
{
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<AdminAccount> AdminAccounts => Set<AdminAccount>();
    public DbSet<LessonClass> Classes => Set<LessonClass>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<PlaylistItem> PlaylistItems => Set<PlaylistItem>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<Screen> Screens => Set<Screen>();
    public DbSet<PairingAttempt> PairingAttempts => Set<PairingAttempt>();
    public DbSet<DeviceCredential> DeviceCredentials => Set<DeviceCredential>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<LessonClass>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<AdminAccount>().HasIndex(x => x.Username).IsUnique();
        modelBuilder.Entity<Lesson>().HasMany(x => x.Items).WithOne(x => x.Lesson)
            .HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<PlaylistItem>().Property(x => x.Position).HasPrecision(18, 6);
        modelBuilder.Entity<DeviceCredential>().HasIndex(x => x.TokenHash).IsUnique();
    }
}
