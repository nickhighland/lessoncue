using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

namespace LessonCue.Server;

public static class LessonCuePermissions
{
    public const string ClaimType = "lessoncue_permission";
    public const string Planning = "planning.manage";
    public const string Uploads = "uploads.manage";
    public const string Playback = "playback.control";
    public const string Screens = "screens.manage";
    public const string Users = "users.manage";
    public const string AppSettings = "app-settings.manage";
    public const string Settings = "settings.manage";
    public const string Backups = "backups.manage";
    public const string Updates = "updates.manage";

    public static readonly IReadOnlyList<string> All =
        [Planning, Uploads, Playback, Screens, Users, AppSettings, Settings, Backups, Updates];

    public static readonly IReadOnlyList<string> AppAdmin =
        [Planning, Uploads, Playback, Screens, Users, AppSettings, Updates];

    public static readonly IReadOnlyList<string> ServiceOnly = [Settings, Backups];

    public static IReadOnlyList<string> Defaults(string? role) => role switch
    {
        "Service Admin" or "Owner" => All,
        "App Admin" or "Administrator" => AppAdmin,
        "Editor" => [Planning, Uploads, Playback],
        _ => []
    };

    public static IReadOnlyList<string> Effective(AdminAccount account)
    {
        if (IsServiceAdmin(account.Role) || account.PermissionsCsv is null) return Defaults(account.Role);
        return RestrictToRole(Parse(account.PermissionsCsv), account.Role);
    }

    public static string? NormalizeCustom(IEnumerable<string>? permissions, string role)
    {
        if (IsServiceAdmin(role) || permissions is null) return null;
        return string.Join(',', RestrictToRole(permissions, role));
    }

    public static IReadOnlyList<string> Parse(string? csv) => string.IsNullOrWhiteSpace(csv)
        ? [] : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(All.Contains).Distinct().OrderBy(x => x, StringComparer.Ordinal).ToArray();

    public static bool Has(ClaimsPrincipal user, string permission)
    {
        var role = user.FindFirstValue(ClaimTypes.Role);
        if (IsServiceAdmin(role)) return true;
        if (ServiceOnly.Contains(permission)) return false;
        if (user.HasClaim(ClaimType, permission)) return true;
        if (user.HasClaim("lessoncue_permissions_version", "1")) return false;
        return Defaults(role).Contains(permission);
    }

    public static IReadOnlyList<string> Effective(ClaimsPrincipal user) => user.HasClaim("lessoncue_permissions_version", "1")
        ? IsServiceAdmin(user.FindFirstValue(ClaimTypes.Role))
            ? All
            : RestrictToRole(user.FindAll(ClaimType).Select(x => x.Value), user.FindFirstValue(ClaimTypes.Role))
        : Defaults(user.FindFirstValue(ClaimTypes.Role));

    public static bool IsServiceAdmin(string? role) => role is "Service Admin" or "Owner";

    private static IReadOnlyList<string> RestrictToRole(IEnumerable<string> permissions, string? role) =>
        permissions.Where(All.Contains)
            .Where(permission => IsServiceAdmin(role) || !ServiceOnly.Contains(permission))
            .Distinct().OrderBy(x => x, StringComparer.Ordinal).ToArray();

    public static void AddPolicies(AuthorizationOptions options)
    {
        foreach (var permission in All)
            options.AddPolicy(permission, policy => policy.RequireAuthenticatedUser()
                .RequireAssertion(context => Has(context.User, permission)));
    }
}
