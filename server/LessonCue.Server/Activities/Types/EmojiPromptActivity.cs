using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class EmojiPromptActivity
{
    public sealed record RoundConfig(
        string Id,
        string Emoji,
        string Prompt,
        string Answer,
        string? Hint = null,
        int Points = 100,
        string? Category = null);

    public sealed record Config(
        string Title = "Emoji Prompt",
        List<RoundConfig>? Rounds = null,
        string Instruction = "Decode the clues before the reveal!");

    public sealed record State(
        int CurrentRoundIndex = 0,
        bool HintRevealed = false,
        bool AnswerRevealed = false,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Emoji Charades",
        Instruction = "What phrase, song, or story do these emojis describe?",
        Rounds =
        [
            new RoundConfig("r1", "🦁👑", "Name the movie", "The Lion King", "It is a famous animated royal adventure.", 100, "Movies"),
            new RoundConfig("r2", "🌧️🐱🐶", "Decode the phrase", "It's raining cats and dogs", "It describes a very heavy rain.", 100, "Phrases"),
            new RoundConfig("r3", "🚢🧊💔", "Name the story", "Titanic", "A famous ship, an iceberg, and a tragic romance.", 100, "Stories")
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
            case "next":
            case "nextround":
                return (true, null, MoveRound(state, rounds, Math.Min(rounds.Count - 1, currentIndex + 1)));
            case "prev":
            case "prevround":
                return (true, null, MoveRound(state, rounds, Math.Max(0, currentIndex - 1)));
            case "setround":
            case "setquestion":
                return (true, null, MoveRound(state, rounds, Math.Clamp(ReadIndex(payload), 0, rounds.Count - 1)));
            case "showhint":
            case "revealhint":
                return (true, null, state with { HintRevealed = true, ActionNonce = state.ActionNonce + 1 });
            case "hidehint":
                return (true, null, state with { HintRevealed = false, ActionNonce = state.ActionNonce + 1 });
            case "reveal":
            case "revealanswer":
                return (true, null, state with { AnswerRevealed = true, ActionNonce = state.ActionNonce + 1 });
            case "hideanswer":
                return (true, null, state with { AnswerRevealed = false, ActionNonce = state.ActionNonce + 1 });
            case "reset":
                return (true, null, (State)CreateInitialState(configJson));
            default:
                return (false, $"Unrecognized emoji prompt action '{action}'.", state);
        }
    }

    private static List<RoundConfig> RoundsFor(Config config) =>
        config.Rounds is { Count: > 0 }
            ? config.Rounds
            : [new RoundConfig("r1", "❓", "Decode the clue", "Add a round in the editor", null, 100, "Warm up")];

    private static State MoveRound(State state, IReadOnlyList<RoundConfig> rounds, int index) => state with
    {
        CurrentRoundIndex = Math.Clamp(index, 0, rounds.Count - 1),
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
