using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class CountdownActivity
{
    public sealed record Config(
        string Title = "Countdown Timer",
        int DurationSeconds = 300,
        int WarningThresholdSeconds = 10,
        bool PlaySoundOnWarning = true,
        bool PlaySoundOnZero = true,
        string EndBehavior = "pause",
        string? BackgroundColor = "#000000",
        string? Message = "Starting soon");

    public sealed record State(
        int DurationSeconds = 300,
        int RemainingMs = 300000,
        bool IsRunning = false,
        DateTimeOffset? StartedAt = null,
        DateTimeOffset? TargetAt = null,
        bool Completed = false,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Game Countdown",
        DurationSeconds = 180,
        WarningThresholdSeconds = 10,
        Message = "Time Remaining"
    };

    public static object CreateInitialState(string configJson)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        return new State(
            DurationSeconds: config.DurationSeconds,
            RemainingMs: config.DurationSeconds * 1000,
            IsRunning: false,
            StartedAt: null,
            TargetAt: null,
            Completed: false,
            ActionNonce: 0
        );
    }

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload,
        IActivityRandomSource random)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? (State)CreateInitialState(configJson);
        var now = DateTimeOffset.UtcNow;

        // Recalculate remaining ms if running
        int currentRemainingMs = state.RemainingMs;
        if (state.IsRunning && state.TargetAt.HasValue)
        {
            currentRemainingMs = (int)Math.Max(0, (state.TargetAt.Value - now).TotalMilliseconds);
        }

        switch (action.ToLowerInvariant())
        {
            case "start":
            case "resume":
            {
                if (state.IsRunning) return (true, null, state);
                if (currentRemainingMs <= 0) currentRemainingMs = config.DurationSeconds * 1000;

                var targetAt = now.AddMilliseconds(currentRemainingMs);
                var newState = state with
                {
                    IsRunning = true,
                    StartedAt = state.StartedAt ?? now,
                    TargetAt = targetAt,
                    RemainingMs = currentRemainingMs,
                    Completed = false,
                    ActionNonce = state.ActionNonce + 1
                };
                return (true, null, newState);
            }

            case "pause":
            {
                if (!state.IsRunning) return (true, null, state);
                var remaining = state.TargetAt.HasValue
                    ? (int)Math.Max(0, (state.TargetAt.Value - now).TotalMilliseconds)
                    : state.RemainingMs;

                var newState = state with
                {
                    IsRunning = false,
                    RemainingMs = remaining,
                    TargetAt = null,
                    ActionNonce = state.ActionNonce + 1
                };
                return (true, null, newState);
            }

            case "adjusttime":
            {
                var deltaSeconds = payload?.TryGetProperty("deltaSeconds", out var pDelta) == true && pDelta.TryGetInt32(out var d)
                    ? d
                    : 0;

                var newRemaining = Math.Max(0, currentRemainingMs + (deltaSeconds * 1000));
                DateTimeOffset? newTarget = state.IsRunning ? now.AddMilliseconds(newRemaining) : null;

                var newState = state with
                {
                    RemainingMs = newRemaining,
                    TargetAt = newTarget,
                    Completed = newRemaining == 0,
                    ActionNonce = state.ActionNonce + 1
                };
                return (true, null, newState);
            }

            case "settime":
            {
                var seconds = payload?.TryGetProperty("seconds", out var pSec) == true && pSec.TryGetInt32(out var s)
                    ? s
                    : config.DurationSeconds;

                var newRemaining = Math.Max(0, seconds * 1000);
                DateTimeOffset? newTarget = state.IsRunning ? now.AddMilliseconds(newRemaining) : null;

                var newState = state with
                {
                    DurationSeconds = seconds,
                    RemainingMs = newRemaining,
                    TargetAt = newTarget,
                    Completed = false,
                    ActionNonce = state.ActionNonce + 1
                };
                return (true, null, newState);
            }

            case "reset":
            {
                return (true, null, (State)CreateInitialState(configJson));
            }

            default:
                return (false, $"Unrecognized countdown action '{action}'.", state);
        }
    }
}
