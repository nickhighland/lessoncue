using System.Text.Json.Nodes;

namespace LessonCue.Server.Activities;

/// <summary>
/// Decides what a running game does next without the host pressing anything.
///
/// A host should press Start and then watch the room. Everywhere a button press
/// used to be required, a timer takes its place — except moderation, which is a
/// judgement about a student's work and is never timed out.
///
/// Pure decision logic: given a phase and the clock, say what the next host
/// action is and when it is due. The service that acts on it drives the same
/// command path a host would, so autonomy can never do something a host could
/// not have done manually.
/// </summary>
public static class ActivityAutoPilot
{
    /// <summary>Long enough to read a question, short enough to keep moving.</summary>
    public const int RoundIntroSeconds = 4;
    public const int RevealSeconds = 6;
    public const int StandingsSeconds = 6;

    /// <summary>A quick choice needs less time than composing an answer.</summary>
    public const int ChoiceResponseSeconds = 30;
    public const int ComposeResponseSeconds = 60;

    /// <summary>Engines whose rounds follow the shared collect-reveal shape.</summary>
    private static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
    {
        ActivityTypes.Trivia, ActivityTypes.RapidFire, ActivityTypes.Poll, ActivityTypes.Prediction,
        ActivityTypes.Punchline, ActivityTypes.FakeOut, ActivityTypes.Drawing,
        ActivityTypes.Ordering, ActivityTypes.Word, ActivityTypes.MatchPlayer,
    };

    /// <summary>Engines where players compose rather than pick, so they get longer.</summary>
    private static readonly HashSet<string> Compose = new(StringComparer.OrdinalIgnoreCase)
    {
        ActivityTypes.Punchline, ActivityTypes.FakeOut, ActivityTypes.Drawing,
        ActivityTypes.Ordering, ActivityTypes.Word,
    };

    public static bool Supports(string? activityType) =>
        !string.IsNullOrWhiteSpace(activityType) && Supported.Contains(activityType!);

    /// <summary>Default seconds a response window stays open for this engine.</summary>
    public static int DefaultResponseSeconds(string? activityType) =>
        Compose.Contains(activityType ?? "") ? ComposeResponseSeconds : ChoiceResponseSeconds;

    /// <summary>
    /// Whether autonomy is on. Opt-out rather than opt-in: a game that needs a
    /// host at every step is the exception now.
    /// </summary>
    public static bool IsEnabled(string? activityType, JsonObject config, JsonObject state)
    {
        if (!Supports(activityType)) return false;
        if (state.TryGetPropertyValue("autoPilot", out var runLevel) && runLevel is JsonValue runValue
            && runValue.TryGetValue<bool>(out var runFlag)) return runFlag;
        if (config.TryGetPropertyValue("autoPilot", out var authored) && authored is JsonValue authoredValue
            && authoredValue.TryGetValue<bool>(out var authoredFlag)) return authoredFlag;
        return true;
    }

    public sealed record Step(string Action, DateTimeOffset DueAt);

    /// <summary>
    /// The next move for this phase, or null when the game should sit still —
    /// waiting on the host to start it, on moderation, or because it is over.
    /// </summary>
    public static Step? Next(
        string? activityType,
        JsonObject config,
        JsonObject state,
        DateTimeOffset now,
        bool everyoneAnswered,
        bool moderationPending)
    {
        if (!IsEnabled(activityType, config, state)) return null;
        // An explicit hold from the host stops the clock entirely.
        if (state.TryGetPropertyValue("autoPaused", out var paused) && paused is JsonValue pausedValue
            && pausedValue.TryGetValue<bool>(out var isPaused) && isPaused) return null;

        var phase = (state["phase"]?.GetValue<string>() ?? ActivityPhases.Lobby).Trim();

        return phase switch
        {
            // The one thing a host still does: decide when the room is ready.
            ActivityPhases.Setup or ActivityPhases.Lobby => null,

            ActivityPhases.Intro or ActivityPhases.Instructions or ActivityPhases.RoundIntro or ActivityPhases.Prompt =>
                new Step("open", now.AddSeconds(RoundIntroSeconds)),

            ActivityPhases.AcceptingResponses or ActivityPhases.Voting =>
                everyoneAnswered
                    // Nobody left to wait for, so do not sit on a dead clock.
                    ? new Step(phase == ActivityPhases.Voting ? "closevoting" : "lock", now)
                    : new Step(phase == ActivityPhases.Voting ? "closevoting" : "lock",
                        ResponseDeadline(activityType, config, state, now)),

            // Anonymous work waiting on a human decision. No timer rescues this.
            ActivityPhases.ResponsesLocked or ActivityPhases.Judging =>
                moderationPending ? null : new Step("reveal", now.AddSeconds(1)),

            ActivityPhases.Reveal or ActivityPhases.Scoring =>
                new Step("showleaderboard", now.AddSeconds(RevealSeconds)),

            ActivityPhases.Leaderboard or ActivityPhases.RoundComplete =>
                new Step("next", now.AddSeconds(StandingsSeconds)),

            _ => null,
        };
    }

    /// <summary>
    /// When the open response window should close: the round's own timer if the
    /// engine set one, otherwise this engine's default.
    /// </summary>
    private static DateTimeOffset ResponseDeadline(
        string? activityType, JsonObject config, JsonObject state, DateTimeOffset now)
    {
        if (state.TryGetPropertyValue("timerStartedAt", out var startedNode)
            && startedNode is JsonValue startedValue
            && startedValue.TryGetValue<string>(out var startedText)
            && DateTimeOffset.TryParse(startedText, out var startedAt)
            && state.TryGetPropertyValue("timerDurationMs", out var durationNode)
            && durationNode is JsonValue durationValue
            && durationValue.TryGetValue<long>(out var durationMs)
            && durationMs > 0)
        {
            return startedAt.AddMilliseconds(durationMs);
        }

        var seconds = config.TryGetPropertyValue("responseSeconds", out var authored)
            && authored is JsonValue authoredValue
            && authoredValue.TryGetValue<int>(out var authoredSeconds)
            && authoredSeconds > 0
                ? authoredSeconds
                : DefaultResponseSeconds(activityType);
        return now.AddSeconds(Math.Clamp(seconds, 5, 600));
    }
}
