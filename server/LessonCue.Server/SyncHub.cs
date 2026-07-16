using Microsoft.AspNetCore.SignalR;

namespace LessonCue.Server;

public sealed class SyncHub : Hub
{
    public Task JoinScreen(string screenId) => Groups.AddToGroupAsync(Context.ConnectionId, $"screen:{screenId}");
    public Task JoinAdmins() => Groups.AddToGroupAsync(Context.ConnectionId, "admins");
}
