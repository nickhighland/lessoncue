using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class PredictionActivity
{
    public sealed record RoundConfig(
        string Id,
        string Prompt,
        List<string> Options,
        int CorrectIndex,
        string? Explanation = null,
        int Points = 100,
        string? Category = null);

    public sealed record Config(
        string Title = "Make Your Prediction",
        List<RoundConfig>? Rounds = null,
        string Instruction = "Lock in your prediction before the host reveals the answer!");

    public sealed record State(
        int CurrentRoundIndex = 0,
        bool ResponsesOpen = false,
        bool AnswerRevealed = false,
        bool ExplanationRevealed = false,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Make Your Prediction",
        Instruction = "Lock in your prediction before the host reveals the answer!",
        Rounds =
        [
            new RoundConfig("r1", "Which team will score first?", ["Gold", "Green", "Blue", "Red"], 0, "Gold is the warm-up answer in this sample round.", 100, "Warm-up"),
            new RoundConfig("r2", "What happens next in the story?", ["A surprise", "A celebration", "A challenge", "A quiet moment"], 2, "The challenge keeps the story moving.", 150, "Story"),
            new RoundConfig("r3", "Which answer will the room choose?", ["A", "B", "C"], 1, "The host can use this as a quick tie-breaker.", 200, "Tie-breaker")
        ]
    };

    public static object CreateInitialState(string configJson) => new State();

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? new State();
        var rounds = RoundsFor(config);
        var currentIndex = Math.Clamp(state.CurrentRoundIndex, 0, rounds.Count - 1);

        switch (action.ToLowerInvariant())
        {
            case "open":
            case "openpredictions":
                return (true, null, state with { ResponsesOpen = true, AnswerRevealed = false, ExplanationRevealed = false, ActionNonce = state.ActionNonce + 1 });
            case "close":
            case "closepredictions":
                return (true, null, state with { ResponsesOpen = false, ActionNonce = state.ActionNonce + 1 });
            case "reveal":
            case "revealanswer":
                return (true, null, state with { ResponsesOpen = false, AnswerRevealed = true, ActionNonce = state.ActionNonce + 1 });
            case "hideanswer":
                return (true, null, state with { AnswerRevealed = false, ExplanationRevealed = false, ActionNonce = state.ActionNonce + 1 });
            case "showexplanation":
            case "revealexplanation":
                return (true, null, state with { AnswerRevealed = true, ExplanationRevealed = true, ActionNonce = state.ActionNonce + 1 });
            case "hideexplanation":
                return (true, null, state with { ExplanationRevealed = false, ActionNonce = state.ActionNonce + 1 });
            case "next":
            case "nextround":
                return (true, null, MoveRound(state, rounds, Math.Min(rounds.Count - 1, currentIndex + 1)));
            case "prev":
            case "prevround":
                return (true, null, MoveRound(state, rounds, Math.Max(0, currentIndex - 1)));
            case "setround":
                return (true, null, MoveRound(state, rounds, Math.Clamp(ReadIndex(payload), 0, rounds.Count - 1)));
            case "reset":
                return (true, null, (State)CreateInitialState(configJson));
            default:
                return (false, $"Unrecognized prediction action '{action}'.", state);
        }
    }

    private static List<RoundConfig> RoundsFor(Config config) =>
        config.Rounds is { Count: > 0 }
            ? config.Rounds
            : [new RoundConfig("r1", "Create a prediction round in the editor.", ["Option A", "Option B"], 0, null, 100, "Warm-up")];

    private static State MoveRound(State state, IReadOnlyList<RoundConfig> rounds, int index) => state with
    {
        CurrentRoundIndex = Math.Clamp(index, 0, rounds.Count - 1),
        ResponsesOpen = false,
        AnswerRevealed = false,
        ExplanationRevealed = false,
        ActionNonce = state.ActionNonce + 1
    };

    private static int ReadIndex(JsonElement? payload)
    {
        if (payload?.TryGetProperty("index", out var index) == true && index.TryGetInt32(out var value)) return value;
        if (payload?.TryGetProperty("roundIndex", out var roundIndex) == true && roundIndex.TryGetInt32(out var roundValue)) return roundValue;
        return 0;
    }
}
