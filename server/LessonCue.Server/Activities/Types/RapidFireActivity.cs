using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class RapidFireActivity
{
    public sealed record QuestionConfig(
        string Id,
        string Prompt,
        List<string> Options,
        int CorrectIndex,
        string? Explanation = null,
        int Points = 100,
        int TimerSeconds = 15);

    public sealed record Config(
        string Title = "Rapid Fire",
        List<QuestionConfig>? Questions = null,
        int DefaultTimerSeconds = 15,
        bool PlaySound = true);

    public sealed record State(
        int CurrentQuestionIndex = 0,
        bool IsRunning = false,
        DateTimeOffset? TargetAt = null,
        int? RemainingMs = null,
        bool AnswerRevealed = false,
        bool ExplanationRevealed = false,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Rapid Fire Showdown",
        DefaultTimerSeconds = 15,
        Questions =
        [
            new QuestionConfig("q1", "Which planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter"], 1, "Mars looks red because of iron oxide on its surface.", 100, 15),
            new QuestionConfig("q2", "How many sides does a hexagon have?", ["5", "6", "8", "10"], 1, "Hex means six.", 100, 12),
            new QuestionConfig("q3", "Which animal is famous for its black-and-white stripes?", ["Tiger", "Zebra", "Panda", "Skunk"], 1, "Every zebra has a unique stripe pattern.", 100, 12)
        ]
    };

    public static object CreateInitialState(string configJson) => new State();

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload,
        IActivityRandomSource random)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? new State();
        var questions = QuestionsFor(config);
        var currentIndex = Math.Clamp(state.CurrentQuestionIndex, 0, questions.Count - 1);
        var current = questions[currentIndex];
        var now = DateTimeOffset.UtcNow;
        var defaultSeconds = Math.Clamp(current.TimerSeconds > 0 ? current.TimerSeconds : config.DefaultTimerSeconds, 3, 600);
        var currentRemainingMs = state.RemainingMs ?? defaultSeconds * 1000;
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
                if (currentRemainingMs <= 0) currentRemainingMs = defaultSeconds * 1000;
                return (true, null, state with
                {
                    CurrentQuestionIndex = currentIndex,
                    IsRunning = true,
                    TargetAt = now.AddMilliseconds(currentRemainingMs),
                    RemainingMs = currentRemainingMs,
                    AnswerRevealed = false,
                    ExplanationRevealed = false,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "pause":
                return (true, null, state with { IsRunning = false, TargetAt = null, RemainingMs = currentRemainingMs, ActionNonce = state.ActionNonce + 1 });

            case "reveal":
            case "revealanswer":
                return (true, null, state with { IsRunning = false, TargetAt = null, RemainingMs = currentRemainingMs, AnswerRevealed = true, ActionNonce = state.ActionNonce + 1 });

            case "hideanswer":
                return (true, null, state with { AnswerRevealed = false, ExplanationRevealed = false, ActionNonce = state.ActionNonce + 1 });

            case "showexplanation":
            case "revealexplanation":
                return (true, null, state with { AnswerRevealed = true, ExplanationRevealed = true, ActionNonce = state.ActionNonce + 1 });

            case "hideexplanation":
                return (true, null, state with { ExplanationRevealed = false, ActionNonce = state.ActionNonce + 1 });

            case "next":
            case "nextquestion":
                return (true, null, MoveQuestion(state, questions, Math.Min(questions.Count - 1, currentIndex + 1)));

            case "prev":
            case "prevquestion":
                return (true, null, MoveQuestion(state, questions, Math.Max(0, currentIndex - 1)));

            case "setquestion":
            case "setround":
            {
                var index = ReadIndex(payload);
                return (true, null, MoveQuestion(state, questions, Math.Clamp(index, 0, questions.Count - 1)));
            }

            case "reset":
                return (true, null, (State)CreateInitialState(configJson));

            default:
                return (false, $"Unrecognized rapid fire action '{action}'.", state);
        }
    }

    private static List<QuestionConfig> QuestionsFor(Config config) =>
        config.Questions is { Count: > 0 }
            ? config.Questions
            : [new QuestionConfig("q1", "Ready?", ["Go!", "Wait!"], 0, null, 100, config.DefaultTimerSeconds)];

    private static State MoveQuestion(State state, IReadOnlyList<QuestionConfig> questions, int index) => state with
    {
        CurrentQuestionIndex = Math.Clamp(index, 0, questions.Count - 1),
        IsRunning = false,
        TargetAt = null,
        RemainingMs = null,
        AnswerRevealed = false,
        ExplanationRevealed = false,
        ActionNonce = state.ActionNonce + 1
    };

    private static int ReadIndex(JsonElement? payload)
    {
        if (payload?.TryGetProperty("index", out var index) == true && index.TryGetInt32(out var value)) return value;
        if (payload?.TryGetProperty("questionIndex", out var questionIndex) == true && questionIndex.TryGetInt32(out var questionValue)) return questionValue;
        return 0;
    }
}
