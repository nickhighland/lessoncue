using Microsoft.AspNetCore.SignalR;

namespace LessonCue.Server.Activities;

public sealed class ActivityHub : Hub
{
    public Task JoinRun(string runId) => Groups.AddToGroupAsync(Context.ConnectionId, $"run:{runId}");
    public Task LeaveRun(string runId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, $"run:{runId}");
}
