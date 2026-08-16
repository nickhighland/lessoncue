using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class WordScrambleActivity
{
    public sealed record RoundConfig(
        string Id,
        string Word,
        string Clue,
        string? Category = null,
        string? Hint = null,
        int Points = 100,
        string? ScrambledWord = null);

    public sealed record Config(
        string Title = "Word Scramble",
        List<RoundConfig>? Rounds = null,
        int SecondsPerRound = 30,
        string Instruction = "Unscramble the word before time runs out!");

    public sealed record State(
        int CurrentRoundIndex = 0,
        bool IsRunning = false,
        DateTimeOffset? TargetAt = null,
        int? RemainingMs = null,
        bool HintRevealed = false,
        bool AnswerRevealed = false,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Word Scramble",
        SecondsPerRound = 30,
        Instruction = "Unscramble the word before time runs out!",
        Rounds =
        [
            new RoundConfig("r1", "CREATIVE", "A way to make something new", "Making", "It starts with C and ends with E.", 100, "EIVRCAET"),
            new RoundConfig("r2", "FRIENDSHIP", "A bond that makes a team stronger", "People", "It begins with F.", 150, "DIFRHSENIP"),
            new RoundConfig("r3", "ADVENTURE", "A journey with a little mystery", "Stories", "It begins with A and ends with E.", 200, "RVENTUDEA")
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
        var now = DateTimeOffset.UtcNow;
        var roundMs = Math.Clamp(config.SecondsPerRound, 5, 600) * 1000;
        var currentRemainingMs = state.RemainingMs ?? roundMs;
        if (state.IsRunning && state.TargetAt.HasValue)
        {
            currentRemainingMs = Math.Max(0, (int)(state.TargetAt.Value - now).TotalMilliseconds);
        }

        switch (action.ToLowerInvariant())
        {
            case "start":
            case "resume":
            {
                if (state.IsRunning) return (true, null, state);
                if (currentRemainingMs <= 0) currentRemainingMs = roundMs;
                return (true, null, state with
                {
                    CurrentRoundIndex = currentIndex,
                    IsRunning = true,
                    TargetAt = now.AddMilliseconds(currentRemainingMs),
                    RemainingMs = currentRemainingMs,
                    HintRevealed = false,
                    AnswerRevealed = false,
                    ActionNonce = state.ActionNonce + 1
                });
            }
            case "pause":
                return (true, null, state with { IsRunning = false, TargetAt = null, RemainingMs = currentRemainingMs, ActionNonce = state.ActionNonce + 1 });
            case "reveal":
            case "revealanswer":
                return (true, null, state with { IsRunning = false, TargetAt = null, RemainingMs = currentRemainingMs, AnswerRevealed = true, ActionNonce = state.ActionNonce + 1 });
            case "showhint":
            case "revealhint":
                return (true, null, state with { HintRevealed = true, ActionNonce = state.ActionNonce + 1 });
            case "hidehint":
                return (true, null, state with { HintRevealed = false, ActionNonce = state.ActionNonce + 1 });
            case "hideanswer":
                return (true, null, state with { AnswerRevealed = false, HintRevealed = false, ActionNonce = state.ActionNonce + 1 });
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
                return (false, $"Unrecognized word scramble action '{action}'.", state);
        }
    }

    private static List<RoundConfig> RoundsFor(Config config) =>
        config.Rounds is { Count: > 0 }
            ? config.Rounds
            : [new RoundConfig("r1", "SCRAMBLE", "Add a word scramble round in the editor.", "Warm-up", null, 100, "ELBSCMARA")];

    private static State MoveRound(State state, IReadOnlyList<RoundConfig> rounds, int index) => state with
    {
        CurrentRoundIndex = Math.Clamp(index, 0, rounds.Count - 1),
        IsRunning = false,
        TargetAt = null,
        RemainingMs = null,
        HintRevealed = false,
        AnswerRevealed = false,
        ActionNonce = state.ActionNonce + 1
    };

    private static int ReadIndex(JsonElement? payload)
    {
        if (payload?.TryGetProperty("index", out var index) == true && index.TryGetInt32(out var value)) return value;
        if (payload?.TryGetProperty("roundIndex", out var roundIndex) == true && roundIndex.TryGetInt32(out var roundValue)) return roundValue;
        return 0;
    }
}
