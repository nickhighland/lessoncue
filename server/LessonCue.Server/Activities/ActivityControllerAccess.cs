using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server.Activities;

/// <summary>
/// A phone remote uses its existing room/session/PIN grant to host a game.
/// This grants no access to activity editing or to another classroom's games.
/// </summary>
public static class ActivityControllerAccess
{
    public static async Task<bool> AuthorizeAsync(AuthorizationHandlerContext authorization)
    {
        if (authorization.User.Identity?.IsAuthenticated == true &&
            LessonCuePermissions.Has(authorization.User, LessonCuePermissions.Planning)) return true;
        if (authorization.Resource is not HttpContext context ||
            !Guid.TryParse(context.Request.RouteValues["id"]?.ToString(), out var runId)) return false;

        var db = context.RequestServices.GetRequiredService<LessonCueDb>();
        var sessions = context.RequestServices.GetRequiredService<ControllerSessionService>();
        var ct = context.RequestAborted;
        var lessonId = await db.ActivityRuns.AsNoTracking().Where(x => x.Id == runId)
            .Select(x => x.LessonId).SingleOrDefaultAsync(ct);
        if (lessonId is null) return false;
        var lesson = await db.Lessons.AsNoTracking().SingleOrDefaultAsync(x => x.Id == lessonId && !x.Archived, ct);
        if (lesson is null) return false;

        var controller = context.Request.Headers["X-LessonCue-Controller"].ToString();
        if (controller.Equals("universal", StringComparison.OrdinalIgnoreCase))
            return sessions.IsUniversalGrantValid(context.Request.Headers["X-LessonCue-Controller-Grant"].ToString());

        if (!controller.StartsWith("room:", StringComparison.OrdinalIgnoreCase) &&
            !controller.StartsWith("session:", StringComparison.OrdinalIgnoreCase)) return false;
        var requireLocal = await db.Organizations.AsNoTracking().OrderBy(x => x.Id)
            .Select(x => x.RequireLocalRoomControllers).FirstAsync(ct);
        if (!ControllerAccessPolicy.CanUseRoomController(requireLocal, context.User,
            context.Request.Host.Host, context.Connection.RemoteIpAddress)) return false;

        if (controller.StartsWith("room:", StringComparison.OrdinalIgnoreCase))
            return Guid.TryParse(controller[5..], out var roomId) && roomId == lesson.ClassId;

        var session = await AdminApi.ResolveControllerSessionAsync(controller[8..], sessions, db, ct);
        return session is not null && session.ClassId == lesson.ClassId &&
            (session.LessonId is null || session.LessonId == lesson.Id);
    }
}
