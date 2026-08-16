using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class RankItActivity
{
    public sealed record ItemConfig(
        string Id,
        string Label,
        string? Detail = null,
        string? Icon = null);

    // Items are stored in the correct order. The stage scrambles them until the host reveals the answer.
    public sealed record RoundConfig(
        string Id,
        string Prompt,
        List<ItemConfig> Items,
        string? RevealNote = null,
        string? Category = null);

    public sealed record Config(
        string Title = "Rank It",
        List<RoundConfig>? Rounds = null,
        string Instruction = "Put the items in the right order before the reveal!");

    public sealed record State(
        int CurrentRoundIndex = 0,
        bool AnswerRevealed = false,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Rank It!",
        Instruction = "Which one belongs first, and which one belongs last?",
        Rounds =
        [
            new RoundConfig("r1", "Rank these movie-night snacks from lightest to heaviest.",
            [
                new ItemConfig("i1", "Popcorn", "A classic handful", "🍿"),
                new ItemConfig("i2", "Nachos", "Crunchy with toppings", "🧀"),
                new ItemConfig("i3", "Pizza", "A full slice", "🍕"),
                new ItemConfig("i4", "Ice-cream sundae", "The grand finale", "🍨")
            ], "A fun debate is part of the game—there can be more than one defensible answer!", "Warm-up"),
            new RoundConfig("r2", "Rank these stages of a classic quest from beginning to end.",
            [
                new ItemConfig("i1", "Meet the challenge", "The problem appears", "⚡"),
                new ItemConfig("i2", "Gather the team", "Find your allies", "🤝"),
                new ItemConfig("i3", "Face the final test", "The big moment", "🛡️"),
                new ItemConfig("i4", "Celebrate the win", "Bring the lesson home", "🏆")
            ], "Use the story arc as your tiebreaker.", "Story" )
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
            case "reveal":
            case "revealanswer":
                return (true, null, state with { AnswerRevealed = true, ActionNonce = state.ActionNonce + 1 });
            case "hideanswer":
                return (true, null, state with { AnswerRevealed = false, ActionNonce = state.ActionNonce + 1 });
            case "reset":
                return (true, null, (State)CreateInitialState(configJson));
            default:
                return (false, $"Unrecognized rank it action '{action}'.", state);
        }
    }

    private static List<RoundConfig> RoundsFor(Config config) =>
        config.Rounds is { Count: > 0 }
            ? config.Rounds
            : [new RoundConfig("r1", "Create a ranking challenge in the editor.", [new ItemConfig("i1", "First item"), new ItemConfig("i2", "Second item")])];

    private static State MoveRound(State state, IReadOnlyList<RoundConfig> rounds, int index) => state with
    {
        CurrentRoundIndex = Math.Clamp(index, 0, rounds.Count - 1),
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
