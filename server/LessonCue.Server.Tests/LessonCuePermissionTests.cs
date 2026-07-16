using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class LessonCuePermissionTests
{
    [Fact]
    public void Role_presets_preserve_existing_access_and_allow_explicit_overrides()
    {
        Assert.Equal(LessonCuePermissions.All, LessonCuePermissions.Defaults("Owner"));
        Assert.Equal(LessonCuePermissions.All, LessonCuePermissions.Defaults("Administrator"));
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
    }

    [Fact]
    public void Permission_claim_marker_distinguishes_custom_none_from_legacy_role_defaults()
    {
        var legacyAdministrator = Principal("Administrator");
        Assert.True(LessonCuePermissions.Has(legacyAdministrator, LessonCuePermissions.Settings));

        var customNone = Principal("Administrator", marker: true);
        Assert.False(LessonCuePermissions.Has(customNone, LessonCuePermissions.Settings));
        Assert.Empty(LessonCuePermissions.Effective(customNone));

        var playbackOnly = Principal("Viewer", marker: true, LessonCuePermissions.Playback);
        Assert.True(LessonCuePermissions.Has(playbackOnly, LessonCuePermissions.Playback));
        Assert.False(LessonCuePermissions.Has(playbackOnly, LessonCuePermissions.Planning));
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

    private static ClaimsPrincipal Principal(string role, bool marker = false, params string[] permissions)
    {
        var claims = new List<Claim> { new(ClaimTypes.Name, "test"), new(ClaimTypes.Role, role) };
        if (marker) claims.Add(new Claim("lessoncue_permissions_version", "1"));
        claims.AddRange(permissions.Select(permission => new Claim(LessonCuePermissions.ClaimType, permission)));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
    }
}
