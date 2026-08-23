using System.Text.Json;
using System.Text.Json.Nodes;
using LessonCue.Server.Activities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// The host presses Start and moderates. Everything else is on a clock.
/// </summary>
public sealed class ActivityAutoPilotTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 23, 10, 0, 0, TimeSpan.Zero);

    private static JsonObject State(string phase, params (string Key, JsonNode? Value)[] extras)
    {
        var state = new JsonObject { ["phase"] = phase };
        foreach (var (key, value) in extras) state[key] = value;
        return state;
    }

    private static ActivityAutoPilot.Step? Next(
        string type, JsonObject state, JsonObject? config = null,
        bool everyoneAnswered = false, bool moderationPending = false) =>
        ActivityAutoPilot.Next(type, config ?? [], state, Now, everyoneAnswered, moderationPending);

    [Fact]
    public void StartingIsTheHostsCallAndIsNeverAutomatic()
    {
        // Only the host knows the room is ready.
        Assert.Null(Next(ActivityTypes.Trivia, State(ActivityPhases.Lobby)));
        Assert.Null(Next(ActivityTypes.Trivia, State(ActivityPhases.Setup)));
    }

    [Fact]
    public void ModerationWaitsForAHumanAndIsNeverTimedOut()
    {
        var locked = State(ActivityPhases.ResponsesLocked);
        Assert.Null(Next(ActivityTypes.Punchline, locked, moderationPending: true));

        // Once the queue is clear the game moves on by itself.
        var resumed = Next(ActivityTypes.Punchline, locked, moderationPending: false);
        Assert.Equal("reveal", resumed!.Action);
    }

    [Fact]
    public void AResponseWindowEndsOnTheClockOrTheLastAnswer()
    {
        var open = State(ActivityPhases.AcceptingResponses);

        var waiting = Next(ActivityTypes.Trivia, open);
        Assert.Equal("lock", waiting!.Action);
        // Multiple choice gets 30 seconds.
        Assert.Equal(Now.AddSeconds(30), waiting.DueAt);

        // Everyone in: close immediately rather than sitting on a dead clock.
        var everyoneIn = Next(ActivityTypes.Trivia, open, everyoneAnswered: true);
        Assert.Equal(Now, everyoneIn!.DueAt);
    }

    [Fact]
    public void ComposingAnAnswerGetsLongerThanPickingOne()
    {
        Assert.Equal(30, ActivityAutoPilot.DefaultResponseSeconds(ActivityTypes.Trivia));
        Assert.Equal(30, ActivityAutoPilot.DefaultResponseSeconds(ActivityTypes.Poll));
        Assert.Equal(60, ActivityAutoPilot.DefaultResponseSeconds(ActivityTypes.Drawing));
        Assert.Equal(60, ActivityAutoPilot.DefaultResponseSeconds(ActivityTypes.Punchline));
        Assert.Equal(60, ActivityAutoPilot.DefaultResponseSeconds(ActivityTypes.Word));
    }

    [Fact]
    public void AnAuthoredTimerBeatsTheDefault()
    {
        var config = new JsonObject { ["responseSeconds"] = 12 };
        var step = Next(ActivityTypes.Trivia, State(ActivityPhases.AcceptingResponses), config);
        Assert.Equal(Now.AddSeconds(12), step!.DueAt);

        // And the engine's own running clock beats both.
        var state = State(ActivityPhases.AcceptingResponses,
            ("timerStartedAt", JsonValue.Create(Now.ToString("O"))),
            ("timerDurationMs", JsonValue.Create(45_000L)));
        Assert.Equal(Now.AddSeconds(45), Next(ActivityTypes.Trivia, state, config)!.DueAt);
    }

    [Fact]
    public void ARoundRunsAllTheWayToTheNextOneWithoutTheHost()
    {
        Assert.Equal("open", Next(ActivityTypes.Trivia, State(ActivityPhases.RoundIntro))!.Action);
        Assert.Equal("reveal", Next(ActivityTypes.Trivia, State(ActivityPhases.ResponsesLocked))!.Action);
        // Standings after every round, not only at the end.
        Assert.Equal("showleaderboard", Next(ActivityTypes.Trivia, State(ActivityPhases.Reveal))!.Action);
        Assert.Equal("next", Next(ActivityTypes.Trivia, State(ActivityPhases.Leaderboard))!.Action);
    }

    [Fact]
    public void VotingClosesOnItsOwnPhaseAction()
    {
        var step = Next(ActivityTypes.Punchline, State(ActivityPhases.Voting));
        Assert.Equal("closevoting", step!.Action);
    }

    [Fact]
    public void AFinishedGameSitsStill()
    {
        Assert.Null(Next(ActivityTypes.Trivia, State(ActivityPhases.FinalResults)));
        Assert.Null(Next(ActivityTypes.Trivia, State(ActivityPhases.Complete)));
    }

    [Fact]
    public void AHostHoldStopsTheClockCompletely()
    {
        var held = State(ActivityPhases.Reveal, ("autoPaused", JsonValue.Create(true)));
        Assert.Null(Next(ActivityTypes.Trivia, held));
    }

    [Fact]
    public void AutonomyIsOptOutPerRunAndPerActivity()
    {
        Assert.True(ActivityAutoPilot.IsEnabled(ActivityTypes.Trivia, [], []));

        var authoredOff = new JsonObject { ["autoPilot"] = false };
        Assert.False(ActivityAutoPilot.IsEnabled(ActivityTypes.Trivia, authoredOff, []));

        // The live run overrides what was authored, in both directions.
        var runOn = new JsonObject { ["autoPilot"] = true };
        Assert.True(ActivityAutoPilot.IsEnabled(ActivityTypes.Trivia, authoredOff, runOn));
        var runOff = new JsonObject { ["autoPilot"] = false };
        Assert.False(ActivityAutoPilot.IsEnabled(ActivityTypes.Trivia, [], runOff));
    }

    [Fact]
    public void HostLedEnginesAreLeftAlone()
    {
        // Physical room, stage challenge, brackets and utilities are run by a
        // person in the room; a clock would talk over them.
        foreach (var type in new[]
        {
            ActivityTypes.PhysicalRoom, ActivityTypes.StageChallenge,
            ActivityTypes.Bracket, ActivityTypes.Utility, ActivityTypes.Buzzer,
            ActivityTypes.SurveyBoard, ActivityTypes.ImageReveal,
        })
        {
            Assert.False(ActivityAutoPilot.Supports(type), type);
            Assert.Null(Next(type, State(ActivityPhases.RoundIntro)));
        }
    }

    // ---------------------------------------------------------------- live

    private sealed class NullClientProxy : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class NullHubClients : IHubClients
    {
        public IClientProxy All => new NullClientProxy();
        public IClientProxy AllExcept(IReadOnlyList<string> excluded) => new NullClientProxy();
        public IClientProxy Client(string connectionId) => new NullClientProxy();
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => new NullClientProxy();
        public IClientProxy Group(string groupName) => new NullClientProxy();
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excluded) => new NullClientProxy();
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => new NullClientProxy();
        public IClientProxy User(string userId) => new NullClientProxy();
        public IClientProxy Users(IReadOnlyList<string> userIds) => new NullClientProxy();
    }

    private sealed class NullGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string c, string g, CancellationToken ct = default) => Task.CompletedTask;
        public Task RemoveFromGroupAsync(string c, string g, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NullHubContext : IHubContext<ActivityHub>
    {
        public IHubClients Clients => new NullHubClients();
        public IGroupManager Groups => new NullGroupManager();
    }

    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private static async Task<(LessonCueDb Db, ActivityService Activities, ActivitySessionService Sessions, SqliteConnection Connection, string DataPath)> LiveAsync()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        var db = new LessonCueDb(new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-autopilot-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dataPath);
        var httpPort = new HttpPortService(dataPath, 80, NullLogger<HttpPortService>.Instance);
        var localAddress = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
        var tunnel = new CloudflareTunnelService(dataPath, httpPort, new TestHttpClientFactory(), NullLogger<CloudflareTunnelService>.Instance);
        var joinAddress = new ActivityJoinAddressService(dataPath, localAddress, tunnel, httpPort);
        return (db,
            new ActivityService(db, new DeterministicRandomSource(3), new NullHubContext()),
            new ActivitySessionService(db, new NullHubContext(), new DeterministicRandomSource(3), joinAddress),
            connection, dataPath);
    }

    /// <summary>Pull the run's due time back so the next tick is owed now.</summary>
    private static async Task MakeDueAsync(LessonCueDb db, Guid runId)
    {
        var run = await db.ActivityRuns.SingleAsync(x => x.Id == runId, TestContext.Current.CancellationToken);
        if (run.AutoAdvanceAt is null) return;
        run.AutoAdvanceAt = DateTimeOffset.UtcNow.AddSeconds(-1);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
    }

    private static string PhaseOf(ActivityRun run) =>
        JsonNode.Parse(run.StateJson)?["phase"]?.GetValue<string>() ?? "";

    [Fact]
    public async Task AQuizRunsItselfFromStartToStandingsWithoutTheHost()
    {
        var (db, activities, sessions, connection, dataPath) = await LiveAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
                "Self Running", ActivityTypes.Trivia, Config: JsonDocument.Parse("""
                    {"title":"Self Running","questions":[{"id":"q1","prompt":"Pick","options":["A","B"],"correctIndex":1},{"id":"q2","prompt":"Again","options":["A","B"],"correctIndex":0}]}
                    """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);
            var alex = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);

            // A lobby waits for a person. Nothing should move on its own here.
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.Lobby, PhaseOf(await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken)));

            // The one press a host makes.
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);

            // From here the game drives itself: intro opens the question…
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.AcceptingResponses, PhaseOf(await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken)));

            // …the last answer closes it…
            await sessions.ExecuteParticipantActionAsync(run.Id,
                new ActivityParticipantActionInput(alex.Token, "answer", JsonDocument.Parse("{\"optionIndex\":1}").RootElement),
                TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.ResponsesLocked, PhaseOf(await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken)));

            // …the answer is revealed…
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.Reveal, PhaseOf(await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken)));

            // …and the standings come up after the round, unasked.
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.Leaderboard, PhaseOf(await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken)));

            // Then straight into the next question.
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            var next = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(1, JsonNode.Parse(next.StateJson)?["currentQuestionIndex"]?.GetValue<int>());
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task PendingModerationStopsTheGameUntilTheHostDecides()
    {
        var (db, activities, sessions, connection, dataPath) = await LiveAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
                "Moderated", ActivityTypes.Punchline, Config: JsonDocument.Parse("""
                    {"title":"Moderated","requireModeration":true,"prompts":[{"id":"p1","prompt":"Finish this"}]}
                    """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);
            var alex = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);

            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            await sessions.ExecuteParticipantActionAsync(run.Id,
                new ActivityParticipantActionInput(alex.Token, "submit", JsonDocument.Parse("{\"text\":\"a joke\"}").RootElement),
                TestContext.Current.CancellationToken);

            // Everyone is in, so the window closes on its own.
            var locked = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.ResponsesLocked, PhaseOf(locked));

            // But anonymous work waiting on approval is never timed past.
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            var held = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.ResponsesLocked, PhaseOf(held));
            Assert.Null(held.AutoAdvanceAt);

            // The host's decision is what restarts it.
            var submission = await db.ActivitySubmissions.FirstAsync(x => x.ActivityRunId == run.Id, TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "moderate",
                JsonDocument.Parse($"{{\"submissionId\":\"{submission.Id}\",\"status\":\"approved\"}}").RootElement),
                TestContext.Current.CancellationToken);
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            var moved = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken);
            Assert.NotEqual(ActivityPhases.ResponsesLocked, PhaseOf(moved));
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task ARefusedActionParksTheGameInsteadOfRetryingForever()
    {
        var (db, activities, sessions, connection, dataPath) = await LiveAsync();
        await using (connection)
        await using (db)
        {
            // Match Minds cannot open a round until somebody is the target.
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
                "Match", ActivityTypes.MatchPlayer, Config: JsonDocument.Parse("""
                    {"title":"Match","rounds":[{"id":"r1","prompt":"Pick","options":["A","B"],"answerMode":"choice"}]}
                    """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);

            // Nobody has joined, so no target can be chosen for it.
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);

            var parked = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken);
            // Parked rather than left due, which would spin the service every
            // second against a command that can only fail.
            Assert.Null(parked.AutoAdvanceAt);
            Assert.Contains("target", JsonNode.Parse(parked.StateJson)?["autoBlockedReason"]?.GetValue<string>() ?? "",
                StringComparison.OrdinalIgnoreCase);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task AutonomyPicksTheMatchTargetSoTheRoundCanOpen()
    {
        var (db, activities, sessions, connection, dataPath) = await LiveAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
                "Match", ActivityTypes.MatchPlayer, Config: JsonDocument.Parse("""
                    {"title":"Match","rounds":[
                        {"id":"r1","prompt":"Pick","options":["A","B"],"answerMode":"choice"},
                        {"id":"r2","prompt":"Again","options":["A","B"],"answerMode":"choice"}]}
                    """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);
            await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Jordan"), TestContext.Current.CancellationToken);

            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);

            // Choosing who answers privately is a host chore worth removing.
            var opened = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken);
            var first = JsonNode.Parse(opened.StateJson)?["targetParticipantId"]?.GetValue<string>();
            Assert.False(string.IsNullOrWhiteSpace(first));
            Assert.Equal(ActivityPhases.AcceptingResponses, PhaseOf(opened));

            // And the spotlight moves, rather than landing on one person all game.
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken);
            await MakeDueAsync(db, run.Id);
            await sessions.AdvanceAutomaticallyAsync(run.Id, TestContext.Current.CancellationToken);
            var second = JsonNode.Parse((await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken)).StateJson)
                ?["targetParticipantId"]?.GetValue<string>();
            Assert.NotEqual(first, second);
        }
        Directory.Delete(dataPath, true);
    }
}
