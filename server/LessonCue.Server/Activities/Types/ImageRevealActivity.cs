using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class ImageRevealActivity
{
    public sealed record Config(
        string Title = "Image Reveal",
        string? ImageUrl = null,
        string Style = "tiles", // "tiles", "pixel", "blur"
        int TotalStages = 10,
        int AutoIntervalSeconds = 3,
        string Prompt = "Can you guess what it is?",
        string Answer = "",
        int? Stages = null)
    {
        public int EffectiveTotalStages => Math.Max(1, Stages ?? TotalStages);
    }

    public sealed record State(
        int CurrentStage = 0,
        bool IsAutoPlaying = false,
        bool Revealed = false,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Who Is It?",
        Style = "tiles",
        TotalStages = 12,
        Prompt = "Guess the mystery object!"
    };

    public static object CreateInitialState(string configJson) => new State(
        CurrentStage: 0,
        IsAutoPlaying: false,
        Revealed: false,
        ActionNonce: 0
    );

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload,
        IActivityRandomSource random)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? (State)CreateInitialState(configJson);
        var totalStages = config.EffectiveTotalStages;

        switch (action.ToLowerInvariant())
        {
            case "nextstage":
            case "revealstage":
            case "revealstep":
            {
                var next = Math.Min(totalStages, state.CurrentStage + 1);
                return (true, null, state with
                {
                    CurrentStage = next,
                    Revealed = next >= totalStages,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "prevstage":
            {
                var prev = Math.Max(0, state.CurrentStage - 1);
                return (true, null, state with
                {
                    CurrentStage = prev,
                    Revealed = false,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "revealall":
            {
                return (true, null, state with
                {
                    CurrentStage = totalStages,
                    Revealed = true,
                    IsAutoPlaying = false,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "startauto":
                return (true, null, state with { IsAutoPlaying = true, ActionNonce = state.ActionNonce + 1 });

            case "pauseauto":
                return (true, null, state with { IsAutoPlaying = false, ActionNonce = state.ActionNonce + 1 });

            case "reset":
                return (true, null, (State)CreateInitialState(configJson));

            default:
                return (false, $"Unrecognized image reveal action '{action}'.", state);
        }
    }
}
