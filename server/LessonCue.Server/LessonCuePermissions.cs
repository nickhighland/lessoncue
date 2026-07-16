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
    public const string Settings = "settings.manage";
    public const string Backups = "backups.manage";
    public const string Updates = "updates.manage";

    public static readonly IReadOnlyList<string> All =
        [Planning, Uploads, Playback, Screens, Users, Settings, Backups, Updates];

    public static IReadOnlyList<string> Defaults(string? role) => role switch
    {
        "Owner" or "Administrator" => All,
        "Editor" => [Planning, Uploads, Playback],
        _ => []
    };

    public static IReadOnlyList<string> Effective(AdminAccount account)
    {
        if (account.Role == "Owner" || account.PermissionsCsv is null) return Defaults(account.Role);
        return Parse(account.PermissionsCsv);
    }

    public static string? NormalizeCustom(IEnumerable<string>? permissions, string role)
    {
        if (role == "Owner" || permissions is null) return null;
        return string.Join(',', permissions.Where(All.Contains).Distinct().OrderBy(x => x, StringComparer.Ordinal));
    }

    public static IReadOnlyList<string> Parse(string? csv) => string.IsNullOrWhiteSpace(csv)
        ? [] : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(All.Contains).Distinct().OrderBy(x => x, StringComparer.Ordinal).ToArray();

    public static bool Has(ClaimsPrincipal user, string permission)
    {
        if (user.IsInRole("Owner") || user.HasClaim(ClaimType, permission)) return true;
        if (user.HasClaim("lessoncue_permissions_version", "1")) return false;
        return Defaults(user.FindFirstValue(ClaimTypes.Role)).Contains(permission);
    }

    public static IReadOnlyList<string> Effective(ClaimsPrincipal user) => user.HasClaim("lessoncue_permissions_version", "1")
        ? user.FindAll(ClaimType).Select(x => x.Value).Where(All.Contains).Distinct().OrderBy(x => x).ToArray()
        : Defaults(user.FindFirstValue(ClaimTypes.Role));

    public static void AddPolicies(AuthorizationOptions options)
    {
        foreach (var permission in All)
            options.AddPolicy(permission, policy => policy.RequireAuthenticatedUser()
                .RequireAssertion(context => Has(context.User, permission)));
    }
}
