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

    /// <summary>
    /// Config keys a lesson designer can set to override the defaults above.
    /// Every one is optional: absent means the shipped pace, which is what
    /// almost every game should run at.
    /// </summary>
    public const string IntroSecondsKey = "introSeconds";
    public const string ResponseSecondsKey = "responseSeconds";
    public const string RevealSecondsKey = "revealSeconds";
    public const string StandingsSecondsKey = "standingsSeconds";

    /// <summary>
    /// Bounds on an authored pace. A beat of zero would race past the room, and
    /// one of an hour would look like the game had hung -- neither is a pace a
    /// teacher means to set, whatever they typed.
    /// </summary>
    public const int MinPacingSeconds = 1;
    public const int MaxPacingSeconds = 300;
    public const int MinResponseSeconds = 5;
    public const int MaxResponseSeconds = 600;

    /// <summary>Seconds for one paced beat, honouring an authored override.</summary>
    public static int PacingSeconds(JsonObject config, string key, int fallback) =>
        AuthoredSeconds(config, key) is { } authored
            ? Math.Clamp(authored, MinPacingSeconds, MaxPacingSeconds)
            : fallback;

    private static int? AuthoredSeconds(JsonObject config, string key)
    {
        if (!config.TryGetPropertyValue(key, out var node) || node is not JsonValue value) return null;
        // Numbers arrive as int or double depending on how they were written,
        // and a form posts them as text.
        if (value.TryGetValue<int>(out var whole) && whole > 0) return whole;
        if (value.TryGetValue<double>(out var real) && real > 0) return (int)Math.Round(real);
        if (value.TryGetValue<string>(out var text) && int.TryParse(text, out var parsed) && parsed > 0) return parsed;
        return null;
    }

    /// <summary>Engines whose rounds follow the shared collect-reveal shape.</summary>
    private static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
    {
        ActivityTypes.Trivia, ActivityTypes.RapidFire, ActivityTypes.Poll, ActivityTypes.Prediction,
        ActivityTypes.Punchline, ActivityTypes.FakeOut, ActivityTypes.Drawing,
        ActivityTypes.Ordering, ActivityTypes.Word, ActivityTypes.MatchPlayer,
        ActivityTypes.ImageReveal,
    };

    /// <summary>Seconds between stages of a reveal, when the engine sets none.</summary>
    public const int RevealStageSeconds = 3;
    public const string RevealIntervalKey = "autoIntervalSeconds";

    /// <summary>
    /// Engines where the room votes on what everyone wrote. Their locked
    /// answers go to a vote rather than straight to the reveal -- which is what
    /// they did before, so nobody ever voted unless the host pressed for it.
    /// </summary>
    private static readonly HashSet<string> Votes = new(StringComparer.OrdinalIgnoreCase)
    {
        ActivityTypes.Punchline, ActivityTypes.FakeOut, ActivityTypes.Drawing,
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

    /// <summary>
    /// What to do next, and what to do instead if the game refuses it.
    /// </summary>
    /// <param name="Fallback">
    /// A refused action parks the game for a person to rescue. Some steps are
    /// worth trying but not worth stopping for -- a vote needs at least two
    /// answers to vote on, and a round with fewer should simply reveal rather
    /// than stall waiting for a host who was told they need not watch.
    /// </param>
    public sealed record Step(string Action, DateTimeOffset DueAt, string? Fallback = null);

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

        // A reveal is its own shape: it walks stages rather than collecting
        // answers, so the generic round below would try to lock a window that
        // was never open.
        if (string.Equals(activityType, ActivityTypes.ImageReveal, StringComparison.OrdinalIgnoreCase))
            return NextRevealStep(config, state, phase, now);

        return phase switch
        {
            // The one thing a host still does: decide when the room is ready.
            ActivityPhases.Setup or ActivityPhases.Lobby => null,

            ActivityPhases.Intro or ActivityPhases.Instructions or ActivityPhases.RoundIntro or ActivityPhases.Prompt =>
                new Step("open", now.AddSeconds(PacingSeconds(config, IntroSecondsKey, RoundIntroSeconds))),

            ActivityPhases.AcceptingResponses or ActivityPhases.Voting =>
                everyoneAnswered
                    // Nobody left to wait for, so do not sit on a dead clock.
                    ? new Step(phase == ActivityPhases.Voting ? "closevoting" : "lock", now)
                    : new Step(phase == ActivityPhases.Voting ? "closevoting" : "lock",
                        ResponseDeadline(activityType, config, state, now)),

            // Anonymous work waiting on a human decision. No timer rescues this.
            ActivityPhases.ResponsesLocked or ActivityPhases.Judging =>
                moderationPending ? null
                    : Votes.Contains(activityType ?? "")
                        ? new Step("openvoting", now.AddSeconds(1), Fallback: "reveal")
                        : new Step("reveal", now.AddSeconds(1)),

            ActivityPhases.Reveal or ActivityPhases.Scoring =>
                new Step("showleaderboard", now.AddSeconds(PacingSeconds(config, RevealSecondsKey, RevealSeconds))),

            ActivityPhases.Leaderboard or ActivityPhases.RoundComplete =>
                new Step("next", now.AddSeconds(PacingSeconds(config, StandingsSecondsKey, StandingsSeconds))),

            _ => null,
        };
    }

    /// <summary>
    /// The next stage of a staged reveal.
    /// </summary>
    /// <remarks>
    /// This used to be a setInterval in the host's browser, so the reveal
    /// stopped the moment they closed the remote, switched tabs or let the
    /// phone sleep -- in the one flow where the host is meant to be watching
    /// the room rather than the console. The server owns the clock now, and it
    /// keeps time whatever the host's device is doing.
    /// </remarks>
    private static Step? NextRevealStep(JsonObject config, JsonObject state, string phase, DateTimeOffset now)
    {
        if (phase is ActivityPhases.Setup or ActivityPhases.Lobby) return null;
        // Fully revealed, or the host paused it. Either way it is not ours.
        if (BoolValue(state, "revealed")) return null;
        if (!BoolValue(state, "isAutoPlaying")) return null;

        var seconds = PacingSeconds(config, RevealIntervalKey, RevealStageSeconds);
        return new Step("revealstage", now.AddSeconds(seconds));
    }

    private static bool BoolValue(JsonObject source, string key) =>
        source.TryGetPropertyValue(key, out var node) && node is JsonValue value
        && value.TryGetValue<bool>(out var flag) && flag;

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

        var seconds = AuthoredSeconds(config, ResponseSecondsKey) ?? DefaultResponseSeconds(activityType);
        return now.AddSeconds(Math.Clamp(seconds, MinResponseSeconds, MaxResponseSeconds));
    }
}
