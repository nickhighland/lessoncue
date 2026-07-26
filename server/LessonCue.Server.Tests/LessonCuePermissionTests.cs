using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class LessonCuePermissionTests
{
    [Fact]
    public void Administrator_tiers_enforce_service_only_boundaries_and_allow_safe_overrides()
    {
        Assert.Equal(LessonCuePermissions.All, LessonCuePermissions.Defaults("Service Admin"));
        Assert.Equal(LessonCuePermissions.AppAdmin, LessonCuePermissions.Defaults("App Admin"));
        Assert.Contains(LessonCuePermissions.AppSettings, LessonCuePermissions.Defaults("App Admin"));
        Assert.DoesNotContain(LessonCuePermissions.Settings, LessonCuePermissions.Defaults("App Admin"));
        Assert.DoesNotContain(LessonCuePermissions.Backups, LessonCuePermissions.Defaults("App Admin"));
        Assert.Equal([LessonCuePermissions.Planning, LessonCuePermissions.Uploads, LessonCuePermissions.Playback],
            LessonCuePermissions.Defaults("Editor"));
        Assert.Empty(LessonCuePermissions.Defaults("Viewer"));

        var custom = new AdminAccount
        {
            Username = "operator", PasswordHash = "hash", Role = "Viewer",
            PermissionsCsv = LessonCuePermissions.NormalizeCustom(
                [LessonCuePermissions.Playback, LessonCuePermissions.Playback, "unknown"], "Viewer")
        };
        Assert.Equal([LessonCuePermissions.Playback], LessonCuePermissions.Effective(custom));

        custom.PermissionsCsv = "";
        Assert.Empty(LessonCuePermissions.Effective(custom));
        custom.PermissionsCsv = null;
        Assert.Empty(LessonCuePermissions.Effective(custom));

        var attemptedServiceEscalation = new AdminAccount
        {
            Username = "app-admin", PasswordHash = "hash", Role = "App Admin",
            PermissionsCsv = LessonCuePermissions.NormalizeCustom(
                [LessonCuePermissions.AppSettings, LessonCuePermissions.Settings, LessonCuePermissions.Backups],
                "App Admin")
        };
        Assert.Equal([LessonCuePermissions.AppSettings], LessonCuePermissions.Effective(attemptedServiceEscalation));
    }

    [Fact]
    public void Permission_claim_marker_distinguishes_custom_none_from_legacy_role_defaults()
    {
        var legacyAdministrator = Principal("Administrator");
        Assert.True(LessonCuePermissions.Has(legacyAdministrator, LessonCuePermissions.AppSettings));
        Assert.False(LessonCuePermissions.Has(legacyAdministrator, LessonCuePermissions.Settings));

        var customNone = Principal("App Admin", marker: true);
        Assert.False(LessonCuePermissions.Has(customNone, LessonCuePermissions.AppSettings));
        Assert.Empty(LessonCuePermissions.Effective(customNone));

        var playbackOnly = Principal("Viewer", marker: true, LessonCuePermissions.Playback);
        Assert.True(LessonCuePermissions.Has(playbackOnly, LessonCuePermissions.Playback));
        Assert.False(LessonCuePermissions.Has(playbackOnly, LessonCuePermissions.Planning));
    }

    [Fact]
    public void Service_only_claims_are_rejected_for_every_non_service_role()
    {
        var appAdmin = Principal("App Admin", marker: true,
            LessonCuePermissions.AppSettings, LessonCuePermissions.Settings, LessonCuePermissions.Backups);
        Assert.True(LessonCuePermissions.Has(appAdmin, LessonCuePermissions.AppSettings));
        Assert.False(LessonCuePermissions.Has(appAdmin, LessonCuePermissions.Settings));
        Assert.False(LessonCuePermissions.Has(appAdmin, LessonCuePermissions.Backups));
        Assert.Equal([LessonCuePermissions.AppSettings], LessonCuePermissions.Effective(appAdmin));

        var serviceAdmin = Principal("Service Admin", marker: true);
        Assert.All(LessonCuePermissions.All, permission =>
            Assert.True(LessonCuePermissions.Has(serviceAdmin, permission)));
    }

    [Fact]
    public async Task Appliance_upgrade_adds_nullable_custom_permissions_column()
    {
        var path = Path.Combine(Path.GetTempPath(), $"lessoncue-permissions-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite($"Data Source={path}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"AdminAccounts\" DROP COLUMN \"PermissionsCsv\"",
                TestContext.Current.CancellationToken);

            await DatabaseUpgrade.ApplyAsync(db, TestContext.Current.CancellationToken);
            await DatabaseUpgrade.ApplyAsync(db, TestContext.Current.CancellationToken);

            var connection = db.Database.GetDbConnection();
            await connection.OpenAsync(TestContext.Current.CancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM pragma_table_info('AdminAccounts') WHERE name='PermissionsCsv'";
            Assert.Equal(1L, (long)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
        }
        finally { try { File.Delete(path); } catch { } }
    }

    [Fact]
    public async Task Appliance_upgrade_renames_legacy_administrator_roles_and_invalidates_sessions()
    {
        var path = Path.Combine(Path.GetTempPath(), $"lessoncue-roles-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite($"Data Source={path}").Options;
            await using var db = new LessonCueDb(options);
            await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);
            db.AdminAccounts.AddRange(
                new AdminAccount { Username = "owner", PasswordHash = "hash", Role = "Owner", SessionVersion = 4 },
                new AdminAccount { Username = "administrator", PasswordHash = "hash", Role = "Administrator", SessionVersion = 7 });
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);

            await DatabaseUpgrade.ApplyAsync(db, TestContext.Current.CancellationToken);
            db.ChangeTracker.Clear();

            var owner = await db.AdminAccounts.SingleAsync(x => x.Username == "owner", TestContext.Current.CancellationToken);
            var administrator = await db.AdminAccounts.SingleAsync(x => x.Username == "administrator", TestContext.Current.CancellationToken);
            Assert.Equal("Service Admin", owner.Role);
            Assert.Equal(5, owner.SessionVersion);
            Assert.Equal("App Admin", administrator.Role);
            Assert.Equal(8, administrator.SessionVersion);

            await DatabaseUpgrade.ApplyAsync(db, TestContext.Current.CancellationToken);
            db.ChangeTracker.Clear();
            Assert.Equal(5, (await db.AdminAccounts.SingleAsync(x => x.Username == "owner",
                TestContext.Current.CancellationToken)).SessionVersion);
        }
        finally { try { File.Delete(path); } catch { } }
    }

    private static ClaimsPrincipal Principal(string role, bool marker = false, params string[] permissions)
    {
        var claims = new List<Claim> { new(ClaimTypes.Name, "test"), new(ClaimTypes.Role, role) };
        if (marker) claims.Add(new Claim("lessoncue_permissions_version", "1"));
        claims.AddRange(permissions.Select(permission => new Claim(LessonCuePermissions.ClaimType, permission)));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
    }
}
