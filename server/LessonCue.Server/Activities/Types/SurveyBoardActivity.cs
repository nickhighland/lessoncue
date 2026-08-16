using System.Text.Json;
using System.Text.Json.Serialization;

namespace LessonCue.Server.Activities.Types;

public static class SurveyBoardActivity
{
    // Points is the canonical field. Count and Items remain accepted so saved
    // proof-of-concept boards can be opened without a manual migration.
    public sealed record AnswerConfig(
        int Rank,
        string Text,
        int Points = 0,
        string? Id = null,
        int? Count = null)
    {
        [JsonIgnore]
        public int Value => Count ?? Points;
    }

    public sealed record QuestionConfig(
        string Id,
        string Prompt,
        List<AnswerConfig>? Answers = null,
        List<AnswerConfig>? Items = null);

    public sealed record Config(
        string Title = "Survey Board",
        string Question = "Name something you take to the beach.",
        List<AnswerConfig>? Answers = null,
        bool PlaySound = true,
        List<QuestionConfig>? Questions = null);

    public sealed record AnswerState(int Rank, bool Revealed);

    public sealed record State(
        List<AnswerState>? Answers = null,
        int CurrentQuestionIndex = 0,
        int Strikes = 0,
        int RevealedScore = 0,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Family Feud Board",
        Questions =
        [
            new QuestionConfig(
                "q1",
                "Name something you bring to youth group.",
                Answers:
                [
                    new AnswerConfig(1, "Bible", 42),
                    new AnswerConfig(2, "Phone", 28),
                    new AnswerConfig(3, "Friends", 15),
                    new AnswerConfig(4, "Snacks", 9),
                    new AnswerConfig(5, "Good attitude", 6)
                ]),
            new QuestionConfig(
                "q2",
                "Name a reason someone might be late.",
                Answers:
                [
                    new AnswerConfig(1, "Traffic", 38),
                    new AnswerConfig(2, "Overslept", 27),
                    new AnswerConfig(3, "Could not find something", 18),
                    new AnswerConfig(4, "Helping someone", 10)
                ])
        ]
    };

    public static object CreateInitialState(string configJson)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var questions = QuestionsFor(config);
        return new State(AnswerStatesFor(AnswersFor(questions[0])), 0, 0, 0, 0);
    }

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload,
        IActivityRandomSource random)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options)
            ?? (State)CreateInitialState(configJson);
        var questions = QuestionsFor(config);
        var currentIndex = Math.Clamp(state.CurrentQuestionIndex, 0, questions.Count - 1);
        var currentQuestion = questions[currentIndex];
        var answerMap = AnswersFor(currentQuestion).ToDictionary(x => x.Rank);
        var currentAnswers = (state.Answers ?? []).ToDictionary(x => x.Rank, x => x.Revealed);
        foreach (var answer in answerMap.Values)
        {
            if (!currentAnswers.ContainsKey(answer.Rank)) currentAnswers[answer.Rank] = false;
        }

        switch (action.ToLowerInvariant())
        {
            case "nextquestion":
            case "next":
            {
                var next = Math.Min(questions.Count - 1, currentIndex + 1);
                return (true, null, ChangeQuestion(state, questions, next));
            }
            case "prevquestion":
            case "previousquestion":
            case "prev":
            {
                var previous = Math.Max(0, currentIndex - 1);
                return (true, null, ChangeQuestion(state, questions, previous));
            }
            case "setquestion":
            case "selectquestion":
            {
                var index = payload?.TryGetProperty("questionIndex", out var pIndex) == true && pIndex.TryGetInt32(out var i)
                    ? i
                    : payload?.TryGetProperty("index", out var pIndexAlias) == true && pIndexAlias.TryGetInt32(out var alias)
                        ? alias
                        : 0;
                var safeIndex = Math.Clamp(index, 0, questions.Count - 1);
                return (true, null, ChangeQuestion(state, questions, safeIndex));
            }
            case "revealanswer":
            case "revealitem":
            {
                var rank = ReadRank(payload);
                if (!answerMap.ContainsKey(rank)) return (false, $"Answer rank {rank} was not found.", state);
                currentAnswers[rank] = true;
                return (true, null, state with
                {
                    CurrentQuestionIndex = currentIndex,
                    Answers = ToAnswerStates(currentAnswers),
                    RevealedScore = Score(currentAnswers, answerMap),
                    ActionNonce = state.ActionNonce + 1
                });
            }
            case "hideanswer":
            case "hideitem":
            {
                var rank = ReadRank(payload);
                if (!answerMap.ContainsKey(rank)) return (false, $"Answer rank {rank} was not found.", state);
                currentAnswers[rank] = false;
                return (true, null, state with
                {
                    CurrentQuestionIndex = currentIndex,
                    Answers = ToAnswerStates(currentAnswers),
                    RevealedScore = Score(currentAnswers, answerMap),
                    ActionNonce = state.ActionNonce + 1
                });
            }
            case "strike":
            case "addstrike":
                return (true, null, state with
                {
                    CurrentQuestionIndex = currentIndex,
                    Strikes = Math.Clamp(state.Strikes + 1, 0, 3),
                    ActionNonce = state.ActionNonce + 1
                });
            case "setstrikes":
            {
                var count = payload?.TryGetProperty("strikes", out var pCount) == true && pCount.TryGetInt32(out var value)
                    ? value
                    : 1;
                return (true, null, state with
                {
                    CurrentQuestionIndex = currentIndex,
                    Strikes = Math.Clamp(count, 0, 3),
                    ActionNonce = state.ActionNonce + 1
                });
            }
            case "clearstrikes":
            case "resetstrikes":
                return (true, null, state with { CurrentQuestionIndex = currentIndex, Strikes = 0, ActionNonce = state.ActionNonce + 1 });
            case "revealall":
            {
                foreach (var rank in answerMap.Keys) currentAnswers[rank] = true;
                return (true, null, state with
                {
                    CurrentQuestionIndex = currentIndex,
                    Answers = ToAnswerStates(currentAnswers),
                    RevealedScore = answerMap.Values.Sum(answer => answer.Value),
                    ActionNonce = state.ActionNonce + 1
                });
            }
            case "reset":
                return (true, null, (State)CreateInitialState(configJson));
            default:
                return (false, $"Unrecognized survey board action '{action}'.", state);
        }
    }

    private static List<QuestionConfig> QuestionsFor(Config config)
    {
        if (config.Questions is { Count: > 0 }) return config.Questions;
        return [new QuestionConfig("q1", config.Question, Answers: config.Answers ?? [])];
    }

    private static List<AnswerConfig> AnswersFor(QuestionConfig question) => question.Answers ?? question.Items ?? [];

    private static List<AnswerState> AnswerStatesFor(IEnumerable<AnswerConfig> answers) =>
        answers.OrderBy(answer => answer.Rank).Select(answer => new AnswerState(answer.Rank, false)).ToList();

    private static List<AnswerState> ToAnswerStates(IReadOnlyDictionary<int, bool> answers) =>
        answers.OrderBy(answer => answer.Key).Select(answer => new AnswerState(answer.Key, answer.Value)).ToList();

    private static int Score(IReadOnlyDictionary<int, bool> revealed, IReadOnlyDictionary<int, AnswerConfig> answers) =>
        revealed.Where(item => item.Value && answers.ContainsKey(item.Key)).Sum(item => answers[item.Key].Value);

    private static int ReadRank(JsonElement? payload)
    {
        if (payload?.TryGetProperty("rank", out var rank) == true && rank.TryGetInt32(out var value)) return value;
        if (payload?.TryGetProperty("itemId", out var item) == true)
        {
            if (item.TryGetInt32(out var numeric)) return numeric;
            if (int.TryParse(item.GetString(), out var parsed)) return parsed;
        }
        return 1;
    }

    private static State ChangeQuestion(State state, IReadOnlyList<QuestionConfig> questions, int index) =>
        state with
        {
            CurrentQuestionIndex = index,
            Answers = AnswerStatesFor(AnswersFor(questions[index])),
            Strikes = 0,
            RevealedScore = 0,
            ActionNonce = state.ActionNonce + 1
        };
}
