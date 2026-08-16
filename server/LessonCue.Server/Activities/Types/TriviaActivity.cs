using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class TriviaActivity
{
    public sealed record QuestionConfig(
        string Id,
        string Prompt,
        List<string>? Options = null,
        int? CorrectIndex = null,
        string? Explanation = null,
        int Points = 100,
        int? TimerSeconds = 20,
        string? MediaUrl = null,
        string AnswerMode = "choice",
        string? CorrectText = null,
        List<string>? AcceptedAnswers = null,
        double? TargetNumber = null,
        double? Tolerance = null,
        string? ScoringMode = null);

    public sealed record Config(
        string Title = "Trivia Challenge",
        List<QuestionConfig>? Questions = null,
        bool PlaySound = true);

    public sealed record State(
        int CurrentQuestionIndex = 0,
        bool ResponsesOpen = false,
        bool AnswerRevealed = false,
        bool ExplanationRevealed = false,
        int? TimerRemainingSeconds = null,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Youth Trivia Night",
        Questions =
        [
            new QuestionConfig(Guid.NewGuid().ToString(), "How many days and nights did it rain in Noah's Ark?", ["30", "40", "50", "100"], 1, "Genesis 7:12 tells us the rain was upon the earth 40 days and 40 nights.", 100, 20),
            new QuestionConfig(Guid.NewGuid().ToString(), "Who defeated Goliath with a sling and a stone?", ["David", "Saul", "Solomon", "Samson"], 0, "David was a young shepherd boy when he defeated Goliath.", 100, 20),
            new QuestionConfig(Guid.NewGuid().ToString(), "What is the longest book in the Bible?", ["Genesis", "Matthew", "Psalms", "Isaiah"], 2, "Psalms has 150 chapters.", 100, 20)
        ]
    };

    public static object CreateInitialState(string configJson) => new State(
        CurrentQuestionIndex: 0,
        ResponsesOpen: false,
        AnswerRevealed: false,
        ExplanationRevealed: false,
        TimerRemainingSeconds: null,
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
        var qCount = (config.Questions ?? []).Count;

        switch (action.ToLowerInvariant())
        {
            case "nextquestion":
            {
                var next = Math.Min(qCount - 1, state.CurrentQuestionIndex + 1);
                return (true, null, state with
                {
                    CurrentQuestionIndex = next,
                    ResponsesOpen = false,
                    AnswerRevealed = false,
                    ExplanationRevealed = false,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "prevquestion":
            {
                var prev = Math.Max(0, state.CurrentQuestionIndex - 1);
                return (true, null, state with
                {
                    CurrentQuestionIndex = prev,
                    ResponsesOpen = false,
                    AnswerRevealed = false,
                    ExplanationRevealed = false,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "setquestion":
            {
                var idx = payload?.TryGetProperty("index", out var pIdx) == true && pIdx.TryGetInt32(out var i) ? i : 0;
                var safeIdx = Math.Clamp(idx, 0, Math.Max(0, qCount - 1));
                return (true, null, state with
                {
                    CurrentQuestionIndex = safeIdx,
                    ResponsesOpen = false,
                    AnswerRevealed = false,
                    ExplanationRevealed = false,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "openresponses":
                return (true, null, state with { ResponsesOpen = true, ActionNonce = state.ActionNonce + 1 });

            case "closeresponses":
                return (true, null, state with { ResponsesOpen = false, ActionNonce = state.ActionNonce + 1 });

            case "revealanswer":
                return (true, null, state with { AnswerRevealed = true, ActionNonce = state.ActionNonce + 1 });

            case "hideanswer":
                return (true, null, state with { AnswerRevealed = false, ActionNonce = state.ActionNonce + 1 });

            case "revealexplanation":
                return (true, null, state with { ExplanationRevealed = true, ActionNonce = state.ActionNonce + 1 });

            case "hideexplanation":
                return (true, null, state with { ExplanationRevealed = false, ActionNonce = state.ActionNonce + 1 });

            case "reset":
                return (true, null, (State)CreateInitialState(configJson));

            default:
                return (false, $"Unrecognized trivia action '{action}'.", state);
        }
    }
}
