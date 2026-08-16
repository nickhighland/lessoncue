using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LessonCue.Server.Activities;

public static class ActivityTypes
{
    public const string Wheel = "wheel";
    public const string Picker = "picker";
    public const string PrizeGrid = "prizeGrid";
    public const string Scoreboard = "scoreboard";
    public const string SurveyBoard = "surveyBoard";
    public const string Trivia = "trivia";
    public const string ImageReveal = "imageReveal";
    public const string ImageShuffle = "imageShuffle";
    public const string Countdown = "countdown";
    public const string Poll = "poll";
    public const string Ranking = "ranking";
    public const string Responses = "responses";
    public const string RapidFire = "rapidFire";
    public const string EmojiPrompt = "emojiPrompt";
    public const string RankIt = "rankIt";
    public const string WordScramble = "wordScramble";
    public const string Prediction = "prediction";
    public const string Buzzer = "buzzer";
    public const string Punchline = "punchline";
    public const string FakeOut = "fakeOut";
    public const string Drawing = "drawing";
    public const string Ordering = "ordering";
    public const string Word = "word";
    public const string MatchPlayer = "matchPlayer";
    public const string StageChallenge = "stageChallenge";
    public const string Bracket = "bracket";
    public const string PhysicalRoom = "physicalRoom";
    public const string Utility = "utility";

    public static readonly string[] All =
    [
        Wheel, Picker, PrizeGrid, Scoreboard, SurveyBoard,
        Trivia, ImageReveal, ImageShuffle, Countdown,
        Poll, Ranking, Responses,
        RapidFire, EmojiPrompt, RankIt, WordScramble, Prediction,
        Buzzer, Punchline, FakeOut, Drawing, Ordering, Word, MatchPlayer, StageChallenge, Bracket, PhysicalRoom, Utility
    ];

    public static bool IsValid(string type) => All.Contains(type);
}

public static class ActivityUtilityTypes
{
    public const string CoinFlip = "coinFlip";
    public const string Dice = "dice";
    public const string RandomNumber = "randomNumber";
    public const string MysteryBoxes = "mysteryBoxes";
    public const string ChallengePicker = "challengePicker";
    public const string TeamGenerator = "teamGenerator";
    public const string RandomPerson = "randomPerson";
    public const string RandomTeam = "randomTeam";
    public const string Countdown = "countdown";

    public static readonly string[] All = [CoinFlip, Dice, RandomNumber, MysteryBoxes, ChallengePicker, TeamGenerator, RandomPerson, RandomTeam, Countdown];

    public static bool IsValid(string value) => All.Contains(value, StringComparer.OrdinalIgnoreCase);
}

public static class ActivityUtilityAssignmentModes
{
    public const string Manual = "manual";
    public const string Balanced = "balanced";
    public const string Random = "random";

    public static readonly string[] All = [Manual, Balanced, Random];

    public static bool IsValid(string value) => All.Contains(value, StringComparer.OrdinalIgnoreCase);
}

public static class ActivityRunStatuses
{
    public const string Prepared = "prepared";
    public const string Live = "live";
    public const string Paused = "paused";
    public const string Ended = "ended";

    public static readonly string[] All = [Prepared, Live, Paused, Ended];
    public static bool IsValid(string status) => All.Contains(status);
}

public sealed class ActivityDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(160)] public required string Name { get; set; }
    [MaxLength(32)] public required string Type { get; set; }
    [MaxLength(32)] public string EngineType { get; set; } = "";
    [MaxLength(64)] public string PresetType { get; set; } = "";
    public int SchemaVersion { get; set; } = 1;
    [MaxLength(1000)] public string Description { get; set; } = "";
    public string ConfigJson { get; set; } = "{}";
    public string ThemeJson { get; set; } = "{}";
    public string SettingsJson { get; set; } = "{}";
    public string ModifiersJson { get; set; } = "{}";
    public string PresentationJson { get; set; } = "{}";
    public Guid? ThumbnailMediaId { get; set; }
    public MediaAsset? ThumbnailMedia { get; set; }
    [MaxLength(80)] public string CreatedBy { get; set; } = "admin";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ArchivedAt { get; set; }
    /// <summary>Teacher-controlled order in the Activities library.</summary>
    public int LibraryPosition { get; set; }
    public int Version { get; set; } = 1;
    public List<ActivityAsset> Assets { get; set; } = [];

    /// <summary>
    /// Computed library metadata. It is populated by ActivityService and is not
    /// persisted with the reusable definition itself.
    /// </summary>
    [NotMapped] public ActivityDefinitionUsage Usage { get; set; } = new();
}

public sealed class ActivityDefinitionUsage
{
    public int LessonCount { get; set; }
    public int TemplateCount { get; set; }
    public int RunCount { get; set; }
    public int ActiveRunCount { get; set; }
    public IReadOnlyList<string> LessonNames { get; set; } = [];
    public IReadOnlyList<string> TemplateNames { get; set; } = [];
    public bool IsInUse => LessonCount > 0 || TemplateCount > 0 || RunCount > 0;
}

public sealed class ActivityAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityDefinitionId { get; set; }
    public ActivityDefinition? ActivityDefinition { get; set; }
    public Guid MediaId { get; set; }
    public MediaAsset? Media { get; set; }
    [MaxLength(32)] public string Role { get; set; } = "content";
    public int Position { get; set; }
    [MaxLength(2000)] public string MetadataJson { get; set; } = "{}";
}

public sealed class ActivityRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityDefinitionId { get; set; }
    public ActivityDefinition? ActivityDefinition { get; set; }
    public Guid? LessonId { get; set; }
    public Lesson? Lesson { get; set; }
    public Guid? LessonItemId { get; set; }
    public PlaylistItem? LessonItem { get; set; }
    [MaxLength(16)] public string Status { get; set; } = ActivityRunStatuses.Prepared;
    public string StateJson { get; set; } = "{}";
    public string DefinitionSnapshotJson { get; set; } = "{}";
    public long Revision { get; set; } = 1;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EndedAt { get; set; }
    public Guid? AudienceSessionId { get; set; }
    public AudienceSession? AudienceSession { get; set; }
    [MaxLength(64)] public string? RandomSeed { get; set; }
    [MaxLength(100)] public string? Scope { get; set; }
    [MaxLength(12)] public string? JoinCode { get; set; }
    [MaxLength(32)] public string CurrentPhase { get; set; } = ActivityPhases.Lobby;
    [MaxLength(32)] public string Mode { get; set; } = ActivityModes.Everyone;
    public DateTimeOffset? TimerStartedAt { get; set; }
    public long? TimerDurationMs { get; set; }
    public DateTimeOffset? TimerPausedAt { get; set; }
    public int RetentionDays { get; set; } = 7;
    public List<ActivityParticipant> Participants { get; set; } = [];
    public List<ActivityTeam> Teams { get; set; } = [];
    public List<ActivityScoreEvent> ScoreEvents { get; set; } = [];
    public List<ActivitySubmission> Submissions { get; set; } = [];
    public List<ActivityVote> Votes { get; set; } = [];
}

public static class ActivityPhases
{
    public const string Setup = "setup";
    public const string Lobby = "lobby";
    public const string Intro = "intro";
    public const string Instructions = "instructions";
    public const string RoundIntro = "roundIntro";
    public const string Prompt = "prompt";
    public const string AcceptingResponses = "acceptingResponses";
    public const string ResponsesLocked = "responsesLocked";
    public const string Reveal = "reveal";
    public const string Voting = "voting";
    public const string Judging = "judging";
    public const string Scoring = "scoring";
    public const string Leaderboard = "leaderboard";
    public const string RoundComplete = "roundComplete";
    public const string FinalResults = "finalResults";
    public const string Complete = "complete";
}

public static class ActivityModes
{
    public const string Everyone = "everyone";
    public const string Stage = "stage";
    public const string Teams = "teams";
    public const string Audience = "audience";
    public const string HostOnly = "hostOnly";
}

public sealed class ActivityParticipant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityRunId { get; set; }
    public ActivityRun? ActivityRun { get; set; }
    [MaxLength(128)] public required string ParticipantTokenHash { get; set; }
    [MaxLength(80)] public string DisplayName { get; set; } = "Guest";
    [MaxLength(16)] public string Status { get; set; } = "active";
    public Guid? TeamId { get; set; }
    public ActivityTeam? Team { get; set; }
    public bool IsAnonymous { get; set; } = true;
    public int Lives { get; set; } = 3;
    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastSeenAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ActivityTeam
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityRunId { get; set; }
    public ActivityRun? ActivityRun { get; set; }
    [MaxLength(80)] public required string Name { get; set; }
    [MaxLength(16)] public string Color { get; set; } = "#6d5dfc";
    [MaxLength(8)] public string Icon { get; set; } = "★";
    public int Position { get; set; }
    public int Score { get; set; }
    public bool Active { get; set; } = true;
    public List<ActivityParticipant> Members { get; set; } = [];
}

public sealed class ActivityScoreEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityRunId { get; set; }
    public ActivityRun? ActivityRun { get; set; }
    public Guid? ParticipantId { get; set; }
    public ActivityParticipant? Participant { get; set; }
    public Guid? TeamId { get; set; }
    public ActivityTeam? Team { get; set; }
    [MaxLength(80)] public string? RoundId { get; set; }
    public int Amount { get; set; }
    [MaxLength(240)] public required string Reason { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsUndone { get; set; }
    public DateTimeOffset? UndoneAt { get; set; }
}

public sealed class ActivitySubmission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityRunId { get; set; }
    public ActivityRun? ActivityRun { get; set; }
    public Guid ParticipantId { get; set; }
    public ActivityParticipant? Participant { get; set; }
    [MaxLength(80)] public required string RoundId { get; set; }
    [MaxLength(32)] public string Kind { get; set; } = "response";
    [MaxLength(120000)] public string PayloadJson { get; set; } = "{}";
    [MaxLength(16)] public string ModerationStatus { get; set; } = "approved";
    public bool Hidden { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ActivityVote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityRunId { get; set; }
    public ActivityRun? ActivityRun { get; set; }
    public Guid VoterParticipantId { get; set; }
    public ActivityParticipant? VoterParticipant { get; set; }
    [MaxLength(80)] public required string RoundId { get; set; }
    [MaxLength(80)] public required string TargetId { get; set; }
    [MaxLength(4000)] public string PayloadJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record ActivityDefinitionInput(
    string Name,
    string Type,
    string? Description = null,
    JsonElement? Config = null,
    JsonElement? Theme = null,
    Guid? ThumbnailMediaId = null,
    List<ActivityAssetInput>? Assets = null,
    string? EngineType = null,
    string? PresetType = null,
    int? SchemaVersion = null,
    JsonElement? Settings = null,
    JsonElement? Modifiers = null,
    JsonElement? Presentation = null);

public sealed record ActivityAssetInput(
    Guid MediaId,
    string Role = "content",
    int Position = 0,
    JsonElement? Metadata = null);

public sealed record ActivityDuplicateInput(
    string? Name = null);

public sealed record ActivityBulkDeleteInput(
    IReadOnlyList<Guid> Ids);

public sealed record ActivityBulkDuplicateInput(
    IReadOnlyList<Guid> Ids,
    string? NameSuffix = " (Copy)");

public sealed record ActivityLibraryOrderInput(
    IReadOnlyList<Guid> Ids);

public sealed record ActivityBulkMutationResult(
    IReadOnlyList<Guid> DeletedIds,
    IReadOnlyList<Guid> ArchivedIds,
    IReadOnlyList<Guid> MissingIds);

public sealed record ActivityBulkRestoreResult(
    IReadOnlyList<Guid> RestoredIds,
    IReadOnlyList<Guid> MissingIds);

public sealed record ActivityRunCreateInput(
    Guid ActivityDefinitionId,
    Guid? LessonId = null,
    Guid? LessonItemId = null,
    string? Scope = null);

public sealed record ActivityCommandEnvelope(
    string? CommandId,
    long? ExpectedRevision,
    string Action,
    JsonElement? Payload = null);

public sealed record ActivityCommandResult(
    bool Success,
    string? Error,
    long Revision,
    string Status,
    object? State,
    DateTimeOffset ServerTime);

public sealed record ActivityStateEnvelope(
    Guid RunId,
    Guid DefinitionId,
    string Type,
    long Revision,
    string Status,
    object State,
    DateTimeOffset ServerTime,
    string Name,
    object? Theme,
    object? Config = null);

public sealed record ActivityParticipantJoinInput(string? ParticipantToken, string? DisplayName = null);

public sealed record ActivityParticipantActionInput(
    string ParticipantToken,
    string Action,
    JsonElement? Payload = null);

public sealed record ActivityTeamInput(string Name, string? Color = null, string? Icon = null);
public sealed record ActivityTeamRenameInput(string Name);
public sealed record ActivityParticipantTeamInput(Guid ParticipantId, Guid? TeamId);

public sealed record ActivitySessionPublicView(
    ActivityStateEnvelope State,
    string JoinCode,
    int ParticipantCount,
    IReadOnlyList<object> Participants,
    IReadOnlyList<object> Teams);

public sealed record ActivityParticipantView(
    ActivityStateEnvelope State,
    Guid ParticipantId,
    string DisplayName,
    string? TeamId,
    bool HasSubmitted,
    bool CanRespond);

public sealed record ActivityHostView(
    ActivityStateEnvelope State,
    string? JoinCode,
    IReadOnlyList<object> Participants,
    IReadOnlyList<object> Teams,
    IReadOnlyList<object> Submissions,
    IReadOnlyList<object> Votes,
    IReadOnlyList<object> ScoreEvents);
