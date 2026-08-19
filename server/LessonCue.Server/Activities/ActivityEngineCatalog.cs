using System.Text.Json;
using System.Text.Json.Nodes;

namespace LessonCue.Server.Activities;

public sealed record ActivityPresetDefinition(
    string Type,
    string EngineType,
    string PresetType,
    string DisplayName,
    string Description,
    string[] SupportedModes,
    string[] InputTypes,
    bool RequiresPhones,
    bool SupportsAnonymousResponses);

/// <summary>
/// The server-side registry is the single mapping between teacher-facing activity
/// types and reusable game engines. Existing legacy types without EngineType stay
/// on their original reducers; newly created definitions are upgraded into the
/// shared engine path.
/// </summary>
public static class ActivityEngineCatalog
{
    private static readonly IReadOnlyDictionary<string, ActivityPresetDefinition> Presets =
        new Dictionary<string, ActivityPresetDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            [ActivityTypes.Trivia] = new(ActivityTypes.Trivia, "quiz", "trivia", "Trivia", "Teacher-authored questions with host-controlled reveal and scoring.", [ActivityModes.Everyone, ActivityModes.Teams, ActivityModes.Stage], ["singleChoice", "multipleChoice", "boolean", "text", "number", "buzzer"], true, false),
            [ActivityTypes.RapidFire] = new(ActivityTypes.RapidFire, "quiz", "rapidFire", "Rapid Fire", "Timed review questions with a quick answer window.", [ActivityModes.Everyone, ActivityModes.Teams], ["singleChoice", "multipleChoice", "boolean"], true, false),
            [ActivityTypes.Poll] = new(ActivityTypes.Poll, "poll", "readTheRoom", "Read the Room", "See what the room thinks, then reveal the distribution.", [ActivityModes.Everyone, ActivityModes.Audience], ["singleChoice", "multipleChoice", "boolean", "slider", "ranking"], true, true),
            [ActivityTypes.Prediction] = new(ActivityTypes.Prediction, "poll", "prediction", "Prediction Machine", "Lock in a prediction before the host reveals what happened.", [ActivityModes.Everyone, ActivityModes.Teams], ["singleChoice", "multipleChoice", "number"], true, false),
            [ActivityTypes.Buzzer] = new(ActivityTypes.Buzzer, "buzzer", "buzzerBattle", "Buzzer Battle", "Race to answer first as clues appear one at a time.", [ActivityModes.Stage, ActivityModes.Teams], ["buzzer", "text"], true, false),
            [ActivityTypes.Punchline] = new(ActivityTypes.Punchline, "creative", "punchline", "Punchline", "Submit anonymous creative answers and let the room choose a favorite.", [ActivityModes.Everyone, ActivityModes.Audience], ["text", "vote"], true, true),
            [ActivityTypes.FakeOut] = new(ActivityTypes.FakeOut, "bluff", "fakeOut", "Fake Out", "Write believable false answers, then find the truth.", [ActivityModes.Everyone, ActivityModes.Audience], ["text", "vote"], true, true),
            [ActivityTypes.SurveyBoard] = new(ActivityTypes.SurveyBoard, "survey", "surveyShowdown", "Survey Showdown", "Reveal ranked survey answers with strikes, buzzers, and scores.", [ActivityModes.Teams, ActivityModes.Stage], ["text", "buzzer"], true, false),
            [ActivityTypes.ImageReveal] = new(ActivityTypes.ImageReveal, "media", "mysteryImage", "Mystery Image", "Reveal a teacher-selected image progressively with a clean public projection.", [ActivityModes.Stage, ActivityModes.Audience], ["media", "buzzer"], false, false),
            [ActivityTypes.Drawing] = new(ActivityTypes.Drawing, "drawing", "doodle", "Doodle & Guess", "Draw a prompt, reveal the gallery, and let the room vote or guess.", [ActivityModes.Everyone, ActivityModes.Audience], ["drawing", "vote"], true, true),
            [ActivityTypes.Ordering] = new(ActivityTypes.Ordering, "ordering", "orderUp", "Order Up", "Arrange items into the right order with accessible move controls.", [ActivityModes.Everyone, ActivityModes.Teams], ["sorting", "ranking"], true, false),
            [ActivityTypes.Word] = new(ActivityTypes.Word, "word", "wordStorm", "Word Storm", "Collect approved words, spot repeats, and build a living category cloud.", [ActivityModes.Everyone, ActivityModes.Audience], ["text"], true, true),
            [ActivityTypes.MatchPlayer] = new(ActivityTypes.MatchPlayer, "match", "matchMinds", "Match Minds", "One player answers privately while the room predicts the same answer.", [ActivityModes.Everyone, ActivityModes.Stage], ["singleChoice", "text"], true, false),
            [ActivityTypes.StageChallenge] = new(ActivityTypes.StageChallenge, "stage", "beatTheClock", "Beat the Clock", "Host-led timed challenges with simple success/fail rulings and scoring.", [ActivityModes.Stage, ActivityModes.Teams, ActivityModes.HostOnly], ["timer", "hostJudge"], false, false),
            [ActivityTypes.Bracket] = new(ActivityTypes.Bracket, "bracket", "bracketBattle", "Bracket Battle", "Advance teacher-entered matchups through audience voting and a host-controlled final.", [ActivityModes.Everyone, ActivityModes.Audience, ActivityModes.Teams], ["vote", "hostJudge"], true, false),
            [ActivityTypes.PhysicalRoom] = new(ActivityTypes.PhysicalRoom, "physical", "fourCorners", "Four Corners", "Lead a no-phone room activity with large instructions, timers, randomization, and host awards.", [ActivityModes.HostOnly, ActivityModes.Teams, ActivityModes.Everyone], ["timer", "hostJudge", "reaction"], false, false),
            [ActivityTypes.Utility] = new(ActivityTypes.Utility, "utility", "gameShowUtilities", "Game Show Utilities", "Run a coin flip, dice roll, random picker, countdown, mystery box, challenge picker, or team generator from the same host surface.", [ActivityModes.HostOnly, ActivityModes.Teams], ["random", "timer", "score", "team"], false, false),
        };

    public static bool TryGet(string type, out ActivityPresetDefinition preset) => Presets.TryGetValue(type, out preset!);

    public static ActivityPresetDefinition? ForType(string type) => TryGet(type, out var preset) ? preset : null;

    public static string EngineFor(string type, string? requested = null) =>
        !string.IsNullOrWhiteSpace(requested)
            ? requested.Trim()
            : ForType(type)?.EngineType ?? "";

    public static string PresetFor(string type, string? requested = null) =>
        !string.IsNullOrWhiteSpace(requested)
            ? requested.Trim()
            : ForType(type)?.PresetType ?? "";

    public static bool IsInteractive(ActivityDefinition definition) =>
        !string.IsNullOrWhiteSpace(definition.EngineType) && ForType(definition.Type) is not null;

    public static bool IsInteractiveType(string type) => ForType(type) is not null;

    public static IReadOnlyList<ActivityPresetDefinition> All() => Presets.Values.OrderBy(x => x.DisplayName).ToArray();
}

public static class InteractiveActivityDefaults
{
    public static object CreateDefaultConfig(string type) => type switch
    {
        ActivityTypes.Buzzer => new
        {
            title = "Buzzer Battle",
            clues = new[]
            {
                new { id = "clue-1", prompt = "This warm-up answer is something bright in the night sky.", answer = "The moon", points = 100 },
                new { id = "clue-2", prompt = "It can be full, new, or crescent.", answer = "The moon", points = 75 },
                new { id = "clue-3", prompt = "It controls the tides.", answer = "The moon", points = 50 }
            },
            lockOutOnMiss = true,
            stealOnMiss = true,
            wrongPenalty = 0
        },
        ActivityTypes.Punchline => new
        {
            title = "Punchline",
            prompts = new[]
            {
                new { id = "prompt-1", prompt = "The worst possible school mascot would be ______.", points = 100 }
            },
            requireModeration = true,
            votingSeconds = 30,
            votingStyle = "gallery",
            headToHeadMatchPoints = 0
        },
        ActivityTypes.FakeOut => new
        {
            title = "Fake Out",
            rounds = new[]
            {
                new { id = "round-1", prompt = "Which of these facts is true? Write a believable fake answer.", truth = "Honey never spoils.", points = 100 }
            },
            requireModeration = true,
            votingSeconds = 30,
            bluffPoints = 50,
            truthPoints = 100,
            hostFavoritePoints = 25,
            revealAuthors = true
        },
        ActivityTypes.Drawing => new
        {
            title = "Doodle & Guess",
            prompts = new[]
            {
                new { id = "prompt-1", prompt = "Draw a place where you would never want to lose your keys.", points = 100 }
            },
            requireModeration = true,
            votingSeconds = 30,
            maxStrokes = 80,
            maxPointsPerStroke = 120
        },
        ActivityTypes.Ordering => new
        {
            title = "Order Up",
            rounds = new[]
            {
                new
                {
                    id = "round-1",
                    prompt = "Put these steps in the best order.",
                    items = new[] { new { id = "item-1", label = "Start" }, new { id = "item-2", label = "Try" }, new { id = "item-3", label = "Reflect" } },
                    correctOrder = new[] { "item-1", "item-2", "item-3" },
                    points = 100
                }
            }
        },
        ActivityTypes.Word => new
        {
            title = "Word Storm",
            rounds = new[]
            {
                new { id = "round-1", prompt = "Name something that helps a team work well.", category = "Teamwork", points = 10, seconds = 45 }
            },
            requireModeration = true,
            allowDuplicates = false,
            maxWords = 30,
            turnBased = false,
            eliminateOnDuplicate = false
        },
        ActivityTypes.MatchPlayer => new
        {
            title = "Match Minds",
            rounds = new[]
            {
                new { id = "round-1", prompt = "Which would you choose for a free afternoon?", options = new[] { "Read", "Explore", "Create", "Rest" }, points = 100 }
            }
        },
        ActivityTypes.StageChallenge => new
        {
            title = "Beat the Clock",
            audienceVoting = false,
            audienceVotePoints = 25,
            challenges = new[]
            {
                new { id = "challenge-1", title = "Build a paper tower", instructions = "Build the tallest free-standing tower you can before the clock stops.", seconds = 60, points = 100, failPoints = 0 }
            }
        },
        ActivityTypes.Bracket => new
        {
            title = "Bracket Battle",
            preset = "bracketBattle",
            presetLabel = "BRACKET BATTLE",
            entrantSource = "teacher",
            entrantSelection = "all",
            pointsPerWin = 0,
            entrants = new[]
            {
                new { id = "entrant-1", label = "North Team" },
                new { id = "entrant-2", label = "South Team" },
                new { id = "entrant-3", label = "East Team" },
                new { id = "entrant-4", label = "West Team" }
            },
            votingSeconds = 30
        },
        ActivityTypes.PhysicalRoom => new
        {
            title = "Four Corners",
            preset = "fourCorners",
            presetLabel = "FOUR CORNERS",
            rounds = new[]
            {
                new
                {
                    id = "round-1",
                    title = "Four Corners",
                    instructions = "Choose a corner of the room. When the timer ends, the host reveals the prompt.",
                    choices = new[] { "North", "South", "East", "West" },
                    seconds = 30,
                    revealText = "Show your corner and explain your choice."
                }
            },
            randomizeChoices = false
        },
        ActivityTypes.Utility => new
        {
            title = "Coin Flip",
            utilityType = ActivityUtilityTypes.CoinFlip,
            choices = new[] { "Heads", "Tails" },
            diceSides = 6,
            minimum = 1,
            maximum = 100,
            boxes = new[]
            {
                new { id = "box-1", label = "Mystery Box 1", value = "Bonus points", points = 100 },
                new { id = "box-2", label = "Mystery Box 2", value = "Choose the next challenge", points = 0 },
                new { id = "box-3", label = "Mystery Box 3", value = "Double points", points = 200 }
            },
            challenges = new[]
            {
                new { id = "challenge-1", label = "Answer a bonus question", instructions = "Give the room a quick review question.", points = 100 },
                new { id = "challenge-2", label = "Do a ten-second celebration", instructions = "Let the winning team celebrate.", points = 50 },
                new { id = "challenge-3", label = "Choose the next category", instructions = "Pick the next round's category.", points = 0 }
            },
            teamCount = 2,
            teamAssignmentMode = ActivityUtilityAssignmentModes.Balanced,
            durationSeconds = 60
        },
        _ => new { }
    };

    public static object CreateInitialState(ActivityDefinition definition)
    {
        var type = definition.Type;
        return type switch
        {
            ActivityTypes.ImageReveal => new
            {
                phase = ActivityPhases.Lobby,
                currentStage = 0,
                isAutoPlaying = false,
                revealed = false,
                revealedCardIds = Array.Empty<string>(),
                memoryCardsVisible = false,
                memoryTimerRunning = false,
                memoryDurationMs = 0L,
                audioNonce = 0L,
                actionNonce = 0L
            },
            ActivityTypes.Trivia or ActivityTypes.RapidFire => new
            {
                phase = ActivityPhases.Lobby,
                currentQuestionIndex = 0,
                roundIndex = 0,
                responsesOpen = false,
                responsesLocked = false,
                answerRevealed = false,
                revealedCorrectIndex = (int?)null,
                explanationRevealed = false,
                responseDeadlineAt = (DateTimeOffset?)null,
                actionNonce = 0L
            },
            ActivityTypes.Poll or ActivityTypes.Prediction => new
            {
                phase = ActivityPhases.Lobby,
                currentRoundIndex = 0,
                responsesOpen = false,
                resultsVisible = false,
                responsesLocked = false,
                votes = new Dictionary<string, int>(),
                totalVotes = 0,
                actionNonce = 0L
            },
            ActivityTypes.Buzzer => new
            {
                phase = ActivityPhases.Lobby,
                currentClueIndex = 0,
                cluesRevealed = 0,
                buzzWinnerParticipantId = (string?)null,
                buzzWinnerName = (string?)null,
                buzzLocked = false,
                responsesOpen = false,
                answerRevealed = false,
                stealOpen = false,
                actionNonce = 0L
            },
            ActivityTypes.Punchline => new
            {
                phase = ActivityPhases.Lobby,
                currentPromptIndex = 0,
                responsesOpen = false,
                responsesLocked = false,
                votingOpen = false,
                resultsVisible = false,
                telephoneStepIndex = 0,
                telephoneStepKind = "drawing",
                telephoneChainStarted = false,
                actionNonce = 0L
            },
            ActivityTypes.FakeOut => new
            {
                phase = ActivityPhases.Lobby,
                currentRoundIndex = 0,
                responsesOpen = false,
                responsesLocked = false,
                votingOpen = false,
                resultsVisible = false,
                answerRevealed = false,
                scoresApplied = false,
                hostFavoriteScoreApplied = false,
                actionNonce = 0L
            },
            ActivityTypes.SurveyBoard => new
            {
                phase = ActivityPhases.Lobby,
                currentQuestionIndex = 0,
                strikes = 0,
                strikeLimit = 3,
                revealedScore = 0,
                responsesOpen = false,
                buzzWinnerParticipantId = (string?)null,
                buzzWinnerName = (string?)null,
                buzzWinnerTeamId = (string?)null,
                currentTeamId = (string?)null,
                currentTeamName = (string?)null,
                stealOpen = false,
                stealTeamId = (string?)null,
                stealTeamName = (string?)null,
                buzzLocked = false,
                actionNonce = 0L
            },
            ActivityTypes.Drawing => new
            {
                phase = ActivityPhases.Lobby,
                currentPromptIndex = 0,
                responsesOpen = false,
                responsesLocked = false,
                votingOpen = false,
                resultsVisible = false,
                actionNonce = 0L
            },
            ActivityTypes.Ordering or ActivityTypes.Word => new
            {
                phase = ActivityPhases.Lobby,
                currentRoundIndex = 0,
                responsesOpen = false,
                responsesLocked = false,
                resultsVisible = false,
                actionNonce = 0L
            },
            ActivityTypes.MatchPlayer => new
            {
                phase = ActivityPhases.Lobby,
                currentRoundIndex = 0,
                targetParticipantId = (string?)null,
                targetName = (string?)null,
                responsesOpen = false,
                responsesLocked = false,
                answerRevealed = false,
                actionNonce = 0L
            },
            ActivityTypes.StageChallenge => new
            {
                phase = ActivityPhases.Lobby,
                currentChallengeIndex = 0,
                selectedParticipantId = (string?)null,
                selectedParticipantName = (string?)null,
                challengeStatus = "ready",
                timerDurationMs = 0L,
                timerStartedAt = (DateTimeOffset?)null,
                timerPausedAt = (DateTimeOffset?)null,
                audienceVotingOpen = false,
                audienceVoteCounts = new JsonObject(),
                audienceVoteScoreApplied = false,
                actionNonce = 0L
            },
            ActivityTypes.Bracket => new
            {
                phase = ActivityPhases.Lobby,
                currentMatchId = (string?)null,
                currentRound = 1,
                matchups = Array.Empty<object>(),
                bracketChampionId = (string?)null,
                actionNonce = 0L
            },
            ActivityTypes.PhysicalRoom => new
            {
                phase = ActivityPhases.Lobby,
                currentRoundIndex = 0,
                challengeStatus = "ready",
                timerDurationMs = 0L,
                timerStartedAt = (DateTimeOffset?)null,
                timerPausedAt = (DateTimeOffset?)null,
                revealed = false,
                randomizedChoices = Array.Empty<string>(),
                actionNonce = 0L
            },
            ActivityTypes.Utility => new
            {
                phase = ActivityPhases.Lobby,
                utilityType = ActivityUtilityTypes.CoinFlip,
                result = (JsonObject?)null,
                revealedBoxIds = Array.Empty<string>(),
                history = Array.Empty<object>(),
                timerDurationMs = 60000L,
                timerRemainingMs = 60000L,
                timerRunning = false,
                timerStartedAt = (DateTimeOffset?)null,
                timerPausedAt = (DateTimeOffset?)null,
                timerCompleted = false,
                actionNonce = 0L
            },
            _ => new { phase = ActivityPhases.Lobby, actionNonce = 0L }
        };
    }

    public static JsonObject ParseObject(string json)
    {
        try { return JsonNode.Parse(json)?.AsObject() ?? []; }
        catch (JsonException) { return []; }
    }

    public static string Serialize(JsonNode node) => node.ToJsonString(ActivityJsonDefaults.Options);
}
