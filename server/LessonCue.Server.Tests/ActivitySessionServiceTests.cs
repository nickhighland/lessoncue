using System.Text.Json;
using System.Text.Json.Nodes;
using LessonCue.Server.Activities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ActivitySessionServiceTests
{
    private sealed class NullClientProxy : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class NullHubClients : IHubClients
    {
        private static readonly IClientProxy Proxy = new NullClientProxy();
        public IClientProxy All => Proxy;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => Proxy;
        public IClientProxy Client(string connectionId) => Proxy;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => Proxy;
        public IClientProxy Group(string groupName) => Proxy;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => Proxy;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Proxy;
        public IClientProxy User(string userId) => Proxy;
        public IClientProxy Users(IReadOnlyList<string> userIds) => Proxy;
    }

    private sealed class NullHubContext : IHubContext<ActivityHub>
    {
        public IHubClients Clients { get; } = new NullHubClients();
        public IGroupManager Groups { get; } = new NullGroupManager();
    }

    private sealed class NullGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    /// <summary>Join-address resolution with no tunnel and no mDNS name configured.</summary>
    private static ActivityJoinAddressService CreateJoinAddress(string dataPath)
    {
        var httpPort = new HttpPortService(dataPath, 80, NullLogger<HttpPortService>.Instance);
        var localAddress = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
        var tunnel = new CloudflareTunnelService(dataPath, httpPort, new TestHttpClientFactory(),
            NullLogger<CloudflareTunnelService>.Instance);
        return new ActivityJoinAddressService(dataPath, localAddress, tunnel, httpPort);
    }

    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private static async Task<(LessonCueDb Db, ActivityService Activities, ActivitySessionService Sessions, SqliteConnection Connection)> CreateAsync()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);
        var activities = new ActivityService(db, new DeterministicRandomSource(12), new NullHubContext());
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-session-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dataPath);
        var sessions = new ActivitySessionService(db, new NullHubContext(), new DeterministicRandomSource(12),
            CreateJoinAddress(dataPath));
        return (db, activities, sessions, connection);
    }

    [Fact]
    public async Task AutoAdvanceClosesTheWindowOnlyWhenEveryPlayerIsInAndOnlyWhenEnabled()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
                "Auto Quiz", ActivityTypes.Trivia, Config: JsonDocument.Parse("""
                    {"title":"Auto Quiz","questions":[{"id":"q1","prompt":"Pick one","options":["A","B"],"correctIndex":1},{"id":"q2","prompt":"Pick again","options":["A","B"],"correctIndex":0}]}
                    """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);

            var alex = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            var jordan = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Jordan"), TestContext.Current.CancellationToken);

            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);

            // Off by default: both answer and the window stays open for the host.
            await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(alex.Token, "answer", JsonDocument.Parse("{\"optionIndex\":1}").RootElement), TestContext.Current.CancellationToken);
            var both = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(jordan.Token, "answer", JsonDocument.Parse("{\"optionIndex\":0}").RootElement), TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.AcceptingResponses, PhaseOf(both));

            // Re-open, arm auto-advance, and add a third player who has not answered.
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "autoadvance",
                JsonDocument.Parse("{\"enabled\":true}").RootElement), TestContext.Current.CancellationToken);
            var sam = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Sam"), TestContext.Current.CancellationToken);

            await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(alex.Token, "answer", JsonDocument.Parse("{\"optionIndex\":1}").RootElement), TestContext.Current.CancellationToken);
            var partial = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(jordan.Token, "answer", JsonDocument.Parse("{\"optionIndex\":1}").RootElement), TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.AcceptingResponses, PhaseOf(partial));

            // The last player in closes it.
            var last = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(sam.Token, "answer", JsonDocument.Parse("{\"optionIndex\":0}").RootElement), TestContext.Current.CancellationToken);
            Assert.Equal(ActivityPhases.ResponsesLocked, PhaseOf(last));
        }
    }

    [Fact]
    public async Task AutoAdvanceIsRefusedForEnginesWhereAHeadCountIsMeaningless()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            // Only one player answers a buzzer clue by design.
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
                "Buzz", ActivityTypes.Buzzer, Config: JsonDocument.Parse("""
                    {"title":"Buzz","rounds":[{"id":"r1","prompt":"Name it","answer":"Pacific","clues":[{"id":"c1","text":"Big","points":30}]}]}
                    """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);

            var refused = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "autoadvance",
                JsonDocument.Parse("{\"enabled\":true}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(refused.Success);
        }
    }

    private static string PhaseOf(ActivityCommandResult result)
    {
        var json = JsonSerializer.Serialize(result.State);
        using var document = JsonDocument.Parse(json);
        return document.RootElement.TryGetProperty("phase", out var phase) ? phase.GetString() ?? "" : "";
    }

    [Fact]
    public async Task QuizSessionJoinsReconnectsAndKeepsCorrectAnswerOutOfDisplayProjection()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
                "Review Quiz", ActivityTypes.Trivia, Config: JsonDocument.Parse("""
                    {"title":"Review Quiz","questions":[{"id":"q1","prompt":"Pick one","options":["A","B"],"correctIndex":1,"points":125,"explanation":"B is right."}]}
                    """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);

            Assert.False(string.IsNullOrWhiteSpace(run.JoinCode));
            var joined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            Assert.Null(joined.Error);
            Assert.NotNull(joined.Participant);

            var rejoined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(joined.Token, "Alex Updated"), TestContext.Current.CancellationToken);
            Assert.Equal(joined.Participant!.Id, rejoined.Participant!.Id);
            Assert.Equal("Alex Updated", rejoined.Participant.DisplayName);

            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var displayJson = JsonSerializer.Serialize(display!.Config, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("correctIndex", displayJson, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("B is right", displayJson, StringComparison.OrdinalIgnoreCase);

            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            var answer = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(joined.Token, "answer", JsonDocument.Parse("{\"optionIndex\":1}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(answer.Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);

            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.NotNull(host);
            var scores = JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.Contains("\"amount\":125", scores, StringComparison.OrdinalIgnoreCase);
            Assert.Contains(joined.Participant!.Id.ToString(), scores, StringComparison.OrdinalIgnoreCase);
            var revealed = JsonSerializer.Serialize(host.State.State, ActivityJsonDefaults.Options);
            Assert.Contains("revealedCorrectIndex", revealed, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task HostCanRenameAndRemovePlayersWithoutChangingTheReusableGame()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Player Controls", ActivityTypes.Buzzer), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var keep = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Keep Me"), TestContext.Current.CancellationToken);
            var remove = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Remove Me"), TestContext.Current.CancellationToken);

            var renamed = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "renameparticipant", JsonDocument.Parse($"{{\"participantId\":\"{keep.Participant!.Id}\",\"displayName\":\"Renamed Player\"}}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(renamed.Success, renamed.Error);
            Assert.Equal("Renamed Player", (await sessions.GetParticipantViewAsync(run.Id, keep.Token, TestContext.Current.CancellationToken))!.DisplayName);

            var removed = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "removeparticipant", JsonDocument.Parse($"{{\"participantId\":\"{remove.Participant!.Id}\"}}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(removed.Success, removed.Error);
            Assert.Null(await sessions.GetParticipantViewAsync(run.Id, remove.Token, TestContext.Current.CancellationToken));
            Assert.NotNull(await sessions.GetParticipantViewAsync(run.Id, keep.Token, TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public async Task HostCommandsRejectStaleRevisionsAndLeaveTheAuthoritativeStateUnchanged()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Revision Guard", ActivityTypes.Buzzer), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            Assert.True(run.Revision > 0);
            var initialRevision = run.Revision;

            var started = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope("start", initialRevision, "start"), TestContext.Current.CancellationToken);
            Assert.True(started.Success, started.Error);
            Assert.True(started.Revision > initialRevision);

            var phaseAfterStart = JsonSerializer.SerializeToNode((await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken))!.State.State, ActivityJsonDefaults.Options)!["phase"]?.GetValue<string>();
            var stale = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope("stale-open", initialRevision, "open"), TestContext.Current.CancellationToken);

            Assert.False(stale.Success);
            Assert.Contains("revision mismatch", stale.Error ?? string.Empty, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(started.Revision, stale.Revision);

            var phaseAfterStaleCommand = JsonSerializer.SerializeToNode((await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken))!.State.State, ActivityJsonDefaults.Options)!["phase"]?.GetValue<string>();
            Assert.Equal(phaseAfterStart, phaseAfterStaleCommand);
        }
    }

    [Fact]
    public async Task BuzzerAcceptsOnlyTheFirstServerObservedBuzz()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Buzzer", ActivityTypes.Buzzer), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);

            var firstBuzz = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "buzz"), TestContext.Current.CancellationToken);
            var secondBuzz = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "buzz"), TestContext.Current.CancellationToken);
            Assert.True(firstBuzz.Success);
            Assert.False(secondBuzz.Success);
            Assert.Contains("closed", secondBuzz.Error ?? "", StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task BuzzerSupportsDecliningClueValuesAndAnOptionalStealWindow()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Clue Ladder", ActivityTypes.Buzzer, Config: JsonDocument.Parse("""
                {"title":"Clue Ladder","clues":[{"id":"c1","prompt":"Broad clue","answer":"Answer","points":300},{"id":"c2","prompt":"Specific clue","answer":"Answer","points":200}],"lockOutOnMiss":true,"stealOnMiss":false}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second"), TestContext.Current.CancellationToken);

            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "revealclue"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "buzz"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "correct"), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "revealclue"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "buzz"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "incorrect"), TestContext.Current.CancellationToken)).Success);

            var noSteal = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "buzz"), TestContext.Current.CancellationToken);
            Assert.False(noSteal.Success);
            Assert.Equal(ActivityPhases.Reveal, JsonSerializer.Deserialize<JsonObject>(JsonSerializer.Serialize((await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken))!.State.State, ActivityJsonDefaults.Options))!["phase"]?.GetValue<string>());
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "opensteal"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "buzz"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "correct"), TestContext.Current.CancellationToken)).Success);

            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scoreJson = JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.Contains("\"amount\":300", scoreJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"amount\":200", scoreJson, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task ReadTheRoomAggregatesVotesAndKeepsThePollOpenUntilTheHostReveals()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Read the Room", ActivityTypes.Poll, Config: JsonDocument.Parse("""
                {"title":"Read the Room","question":"Which is worse?","options":["Being early","Being late"]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "vote", JsonDocument.Parse("{\"optionIndex\":0}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "vote", JsonDocument.Parse("{\"optionIndex\":1}").RootElement), TestContext.Current.CancellationToken)).Success);
            var displayBeforeReveal = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var beforeJson = JsonSerializer.Serialize(displayBeforeReveal!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"totalVotes\":2", beforeJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"resultsVisible\":false", beforeJson, StringComparison.OrdinalIgnoreCase);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var displayAfterReveal = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var afterJson = JsonSerializer.Serialize(displayAfterReveal!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"resultsVisible\":true", afterJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"0\":1", afterJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"1\":1", afterJson, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task PredictionPollHidesLiveDistributionAndScoresRoomPredictionsOnReveal()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Prediction Machine", ActivityTypes.Poll, Config: JsonDocument.Parse("""
                {"title":"Prediction Machine","preset":"predictionMachine","presetLabel":"PREDICTION MACHINE","pollMode":"prediction","points":75,"question":"Which option will the room choose most often?","options":["Option A","Option B","Option C"]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second"), TestContext.Current.CancellationToken);
            var third = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Third"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "predict", JsonDocument.Parse("{\"optionIndex\":0}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "predict", JsonDocument.Parse("{\"optionIndex\":1}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(third.Token, "predict", JsonDocument.Parse("{\"optionIndex\":0}").RootElement), TestContext.Current.CancellationToken)).Success);

            var beforeReveal = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var beforeRevealJson = JsonSerializer.Serialize(beforeReveal!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"totalVotes\":3", beforeRevealJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"votes\":{}", beforeRevealJson, StringComparison.OrdinalIgnoreCase);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);

            var afterReveal = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var afterRevealJson = JsonSerializer.Serialize(afterReveal!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"scoringMode\":\"prediction\"", afterRevealJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"winningOptionIndex\":0", afterRevealJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"winningVoteCount\":2", afterRevealJson, StringComparison.OrdinalIgnoreCase);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(2, host!.ScoreEvents.Count);
            Assert.All(host.ScoreEvents, score => Assert.Contains("\"amount\":75", JsonSerializer.Serialize(score, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact]
    public async Task MinorityPollScoresEveryTiedLeastPopularChoice()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Minority Report", ActivityTypes.Poll, Config: JsonDocument.Parse("""
                {"title":"Minority Report","pollMode":"minority","points":40,"question":"Which option will the fewest people choose?","options":["Option A","Option B","Option C"]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second"), TestContext.Current.CancellationToken);
            var third = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Third"), TestContext.Current.CancellationToken);
            var fourth = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Fourth"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            foreach (var (token, optionIndex) in new[] { (first.Token, 0), (second.Token, 0), (third.Token, 1), (fourth.Token, 2) })
                Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(token, "predict", JsonDocument.Parse($"{{\"optionIndex\":{optionIndex}}}").RootElement), TestContext.Current.CancellationToken)).Success);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var displayJson = JsonSerializer.Serialize(display!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"scoringMode\":\"minority\"", displayJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"winningOptionIndices\":[1,2]", displayJson, StringComparison.OrdinalIgnoreCase);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(2, host!.ScoreEvents.Count);
            Assert.All(host.ScoreEvents, score => Assert.Contains("\"amount\":40", JsonSerializer.Serialize(score, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact]
    public async Task CreativeResponsesAreModeratedBeforeTheyReachTheDisplay()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Punchline", ActivityTypes.Punchline), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var joined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Comedian"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(joined.Token, "submit", JsonDocument.Parse("{\"text\":\"A very silly answer\"}").RootElement), TestContext.Current.CancellationToken)).Success);

            var displayBefore = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.DoesNotContain("A very silly answer", JsonSerializer.Serialize(displayBefore!.State, ActivityJsonDefaults.Options));
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var submission = Assert.Single(host!.Submissions);
            Assert.Equal("pending", submission.GetType().GetProperty("moderationStatus")?.GetValue(submission));

            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "moderate", JsonDocument.Parse($"{{\"submissionId\":\"{submission.GetType().GetProperty("id")!.GetValue(submission)}\",\"status\":\"approved\"}}").RootElement), TestContext.Current.CancellationToken);
            var displayAfter = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("A very silly answer", JsonSerializer.Serialize(displayAfter!.State, ActivityJsonDefaults.Options));
        }
    }

    [Fact]
    public async Task FakeOutKeepsTruthUnmarkedUntilRevealAndScoresTheFinder()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Fake Out", ActivityTypes.FakeOut, Config: JsonDocument.Parse("""
                {"title":"Fake Out","rounds":[{"id":"r1","prompt":"Which statement is true?","truth":"A real answer","points":100}],"requireModeration":true,"truthPoints":100,"bluffPoints":50}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var writer = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Bluffer"), TestContext.Current.CancellationToken);
            var finder = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Finder"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(writer.Token, "submit", JsonDocument.Parse("{\"text\":\"A convincing fake\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            var hostBeforeVote = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var submission = Assert.Single(hostBeforeVote!.Submissions);
            var submissionId = submission.GetType().GetProperty("id")!.GetValue(submission)!.ToString();
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "moderate", JsonDocument.Parse($"{{\"submissionId\":\"{submissionId}\",\"status\":\"approved\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openvoting"), TestContext.Current.CancellationToken);

            var participantState = await sessions.GetParticipantViewAsync(run.Id, finder.Token, TestContext.Current.CancellationToken);
            var optionsBeforeReveal = JsonSerializer.Serialize(participantState!.State.State, ActivityJsonDefaults.Options);
            Assert.Contains("A real answer", optionsBeforeReveal, StringComparison.Ordinal);
            Assert.DoesNotContain("\"isTruth\":true", optionsBeforeReveal, StringComparison.OrdinalIgnoreCase);

            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(finder.Token, "vote", JsonDocument.Parse("{\"targetId\":\"truth\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var displayAfterReveal = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"isTruth\":true", JsonSerializer.Serialize(displayAfterReveal!.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            var hostAfterReveal = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":100", JsonSerializer.Serialize(hostAfterReveal!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task FakeOutCanAwardHostFavoritePointsAndRevealAuthorsOnlyAfterReveal()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Fake Out Favorite", ActivityTypes.FakeOut, Config: JsonDocument.Parse("""
                {"title":"Fake Out","rounds":[{"id":"r1","prompt":"Which statement is true?","truth":"A real answer"}],"requireModeration":false,"truthPoints":100,"bluffPoints":50,"hostFavoritePoints":25,"revealAuthors":true}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var writer = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Bluffer"), TestContext.Current.CancellationToken);
            var finder = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Finder"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(writer.Token, "submit", JsonDocument.Parse("{\"text\":\"A convincing fake\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            var hostBeforeVote = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var submission = Assert.Single(hostBeforeVote!.Submissions);
            var submissionId = submission.GetType().GetProperty("id")!.GetValue(submission)!.ToString();
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openvoting"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(finder.Token, "vote", JsonDocument.Parse("{\"targetId\":\"truth\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            var beforeReveal = JsonSerializer.Serialize((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("Bluffer", beforeReveal, StringComparison.Ordinal);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "hostfavorite", JsonDocument.Parse($"{{\"submissionId\":\"{submissionId}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            var afterReveal = JsonSerializer.Serialize((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Contains("Bluffer", afterReveal, StringComparison.Ordinal);
            var hostAfterReveal = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scoreJson = JsonSerializer.Serialize(hostAfterReveal!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.Contains("\"amount\":100", scoreJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"amount\":25", scoreJson, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task SurveyBoardRevealsMatchedAnswersAndAwardsPoints()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Survey Showdown", ActivityTypes.SurveyBoard, Config: JsonDocument.Parse("""
                {"title":"Survey Showdown","questions":[{"id":"q1","prompt":"Name a warm drink","answers":[{"id":"a1","rank":1,"text":"Tea","points":60},{"id":"a2","rank":2,"text":"Cocoa","points":40}]}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var joined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Contestant"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(joined.Token, "submit", JsonDocument.Parse("{\"text\":\"Cocoa\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "matchanswer", JsonDocument.Parse("{\"rank\":2}").RootElement), TestContext.Current.CancellationToken)).Success);
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var displayJson = JsonSerializer.Serialize(display!.State, ActivityJsonDefaults.Options);
            Assert.Contains("Cocoa", displayJson, StringComparison.Ordinal);
            Assert.Contains("\"revealedScore\":40", displayJson, StringComparison.OrdinalIgnoreCase);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":40", JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task SurveyBoardTeamTurnsRestrictAnswersAndAwardACompletedStealToTheTeam()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Team Survey", ActivityTypes.SurveyBoard, Config: JsonDocument.Parse("""
                {"title":"Team Survey","teamPlay":true,"stealEnabled":true,"strikesToSteal":2,"questions":[{"id":"q1","prompt":"Name a team strength","answers":[{"id":"a1","rank":1,"text":"Trust","points":50},{"id":"a2","rank":2,"text":"Listening","points":30}]}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First Team Player"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second Team Player"), TestContext.Current.CancellationToken);

            Assert.True(await sessions.SetTeamsAsync(run.Id, [new ActivityTeamInput("Team One"), new ActivityTeamInput("Team Two")], TestContext.Current.CancellationToken));
            var teams = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var teamOneId = Guid.Parse(teams!.Teams[0].GetType().GetProperty("id")!.GetValue(teams.Teams[0])!.ToString()!);
            var teamTwoId = Guid.Parse(teams.Teams[1].GetType().GetProperty("id")!.GetValue(teams.Teams[1])!.ToString()!);
            Assert.True(await sessions.AssignParticipantAsync(run.Id, first.Participant!.Id, teamOneId, TestContext.Current.CancellationToken));
            Assert.True(await sessions.AssignParticipantAsync(run.Id, second.Participant!.Id, teamTwoId, TestContext.Current.CancellationToken));

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
            var wrongTeam = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "submit", JsonDocument.Parse("{\"text\":\"too soon\"}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(wrongTeam.Success);
            Assert.Contains("Team One", wrongTeam.Error ?? "", StringComparison.Ordinal);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "submit", JsonDocument.Parse("{\"text\":\"wrong\"}").RootElement), TestContext.Current.CancellationToken)).Success);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "addstrike"), TestContext.Current.CancellationToken)).Success);
            var steal = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "addstrike"), TestContext.Current.CancellationToken);
            Assert.True(steal.Success, steal.Error);
            var stealState = JsonSerializer.SerializeToElement(steal.State, ActivityJsonDefaults.Options);
            Assert.True(stealState.GetProperty("stealOpen").GetBoolean());
            Assert.Equal("Team Two", stealState.GetProperty("stealTeamName").GetString());

            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "submit", JsonDocument.Parse("{\"text\":\"Trust\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "matchanswer", JsonDocument.Parse("{\"rank\":1}").RootElement), TestContext.Current.CancellationToken)).Success);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scores = JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.Contains("\"amount\":50", scores, StringComparison.OrdinalIgnoreCase);
            Assert.Contains(teamTwoId.ToString(), scores, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("Steal survey answer", scores, StringComparison.Ordinal);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "showleaderboard"), TestContext.Current.CancellationToken)).Success);
            var leaderboard = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("Team Two", JsonSerializer.Serialize(leaderboard!.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task SurveyBoardOffersConservativeAliasSuggestionsWithoutRemovingManualHostJudgment()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Suggested Survey", ActivityTypes.SurveyBoard, Config: JsonDocument.Parse("""
                {"title":"Suggested Survey","questions":[{"id":"q1","prompt":"Name a warm drink","answers":[{"id":"a1","rank":1,"text":"Tea","aliases":["chai"],"points":60},{"id":"a2","rank":2,"text":"Cocoa","points":40}]}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var joined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Contestant"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(joined.Token, "submit", JsonDocument.Parse("{\"text\":\"chai\"}").RootElement), TestContext.Current.CancellationToken)).Success);

            var suggestion = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "suggestmatch"), TestContext.Current.CancellationToken);
            Assert.True(suggestion.Success, suggestion.Error);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var hostState = JsonSerializer.Serialize(host!.State.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"rank\":1", hostState, StringComparison.Ordinal);
            Assert.Contains("\"confidence\":100", hostState, StringComparison.Ordinal);
            var displayState = JsonSerializer.Serialize((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("surveyMatchSuggestions", displayState, StringComparison.Ordinal);

            // A suggestion never makes the decision; the host can intentionally
            // choose a different board item and the selected item is what scores.
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "matchanswer", JsonDocument.Parse("{\"rank\":2}").RootElement), TestContext.Current.CancellationToken)).Success);
            var scoredHost = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":40", JsonSerializer.Serialize(scoredHost!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task DrawingSubmissionsStayPrivateUntilApprovedAndTheRoomCanVoteOnTheGallery()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Doodle", ActivityTypes.Drawing, Config: JsonDocument.Parse("""
                {"title":"Doodle","prompts":[{"id":"p1","prompt":"Draw a tree","points":75}],"requireModeration":true,"votingSeconds":5}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var artist = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Artist"), TestContext.Current.CancellationToken);
            var voter = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Voter"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            var drawingPayload = JsonDocument.Parse("""
                {"strokes":[{"color":"#f8fafc","width":0.012,"points":[[0.1,0.1],[0.2,0.2],[0.3,0.25]]}]}
                """).RootElement;
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(artist.Token, "submit", drawingPayload), TestContext.Current.CancellationToken)).Success);

            var beforeApproval = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.DoesNotContain("0.1", JsonSerializer.Serialize(beforeApproval!.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
            var pending = Assert.Single((await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken))!.Submissions);
            var submissionId = pending.GetType().GetProperty("id")!.GetValue(pending)!.ToString();
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "moderate", JsonDocument.Parse($"{{\"submissionId\":\"{submissionId}\",\"status\":\"approved\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openvoting"), TestContext.Current.CancellationToken);
            var votingState = await sessions.GetParticipantViewAsync(run.Id, voter.Token, TestContext.Current.CancellationToken);
            Assert.Contains("0.1", JsonSerializer.Serialize(votingState!.State.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
            Assert.Contains("votingTimerRemainingMs", JsonSerializer.Serialize(votingState.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            var selfVote = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(artist.Token, "vote", JsonDocument.Parse($"{{\"targetId\":\"{submissionId}\"}}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(selfVote.Success);
            Assert.Contains("another", selfVote.Error ?? "", StringComparison.OrdinalIgnoreCase);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(voter.Token, "vote", JsonDocument.Parse($"{{\"targetId\":\"{submissionId}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            var persisted = await db.ActivityRuns.SingleAsync(item => item.Id == run.Id, TestContext.Current.CancellationToken);
            var expiredState = JsonNode.Parse(persisted.StateJson)!.AsObject();
            expiredState["votingStartedAt"] = DateTimeOffset.UtcNow.AddSeconds(-10).ToString("O");
            persisted.StateJson = expiredState.ToJsonString(ActivityJsonDefaults.Options);
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
            var expiredVote = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(artist.Token, "vote", JsonDocument.Parse($"{{\"targetId\":\"{submissionId}\"}}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(expiredVote.Success);
            Assert.Contains("time is up", expiredVote.Error ?? "", StringComparison.OrdinalIgnoreCase);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":75", JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"votes\":1", JsonSerializer.Serialize(host.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task OrderingKeepsTheAnswerOutOfPublicConfigAndAwardsPositionCredit()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Order Up", ActivityTypes.Ordering, Config: JsonDocument.Parse("""
                {"title":"Order Up","rounds":[{"id":"r1","prompt":"Order the steps","items":[{"id":"a","label":"Plan"},{"id":"b","label":"Do"},{"id":"c","label":"Review"}],"correctOrder":["a","b","c"],"points":100}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            Assert.Contains("\"correctOrder\":[\"a\",\"b\",\"c\"]", definition.ConfigJson, StringComparison.Ordinal);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var participant = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Sorter"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(participant.Token, "sort", JsonDocument.Parse("{\"order\":[\"a\",\"c\",\"b\"]}").RootElement), TestContext.Current.CancellationToken)).Success);
            var submitted = Assert.Single((await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken))!.Submissions);
            var submittedJson = JsonSerializer.Serialize(submitted, ActivityJsonDefaults.Options);
            Assert.Contains("\"order\":[\"a\",\"c\",\"b\"]", submittedJson, StringComparison.Ordinal);
            var beforeReveal = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.DoesNotContain("correctOrder", JsonSerializer.Serialize(beforeReveal!.Config, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "lock"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var afterReveal = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var revealedJson = JsonSerializer.Serialize(afterReveal!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"correctOrder\":[\"a\",\"b\",\"c\"]", revealedJson, StringComparison.Ordinal);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scoreJson = JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.True(scoreJson.Contains("\"amount\":33", StringComparison.OrdinalIgnoreCase), scoreJson);
        }
    }

    [Fact]
    public async Task OrderingRequiresEveryItemAndSupportsExactScoring()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Exact Timeline", ActivityTypes.Ordering, Config: JsonDocument.Parse("""
                {"title":"Exact Timeline","scoringMode":"exact","rounds":[{"id":"r1","prompt":"Order the animals","items":[{"id":"a","label":"Ant"},{"id":"b","label":"Bear"},{"id":"c","label":"Cat"}],"correctOrder":["a","b","c"],"points":100}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var participant = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Sorter"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);

            var incomplete = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(participant.Token, "sort", JsonDocument.Parse("{\"order\":[\"a\",\"b\"]}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(incomplete.Success);
            Assert.Contains("every item", incomplete.Error ?? "", StringComparison.OrdinalIgnoreCase);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(participant.Token, "sort", JsonDocument.Parse("{\"order\":[\"a\",\"c\",\"b\"]}").RootElement), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "lock"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);

            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Empty(host!.ScoreEvents);
            var stateJson = JsonSerializer.Serialize(host.State.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"orderingScoringMode\":\"exact\"", stateJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"earned\":0", stateJson, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task WordStormNormalizesApprovedWordsIntoACloudAndScoresContributors()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Word Storm", ActivityTypes.Word, Config: JsonDocument.Parse("""
                {"title":"Word Storm","rounds":[{"id":"r1","prompt":"Name a team strength","category":"Teamwork","points":10}],"requireModeration":true}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var participant = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Contributor"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(participant.Token, "submit", JsonDocument.Parse("{\"text\":\"Trust, TRUST, listening\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            var pending = Assert.Single((await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken))!.Submissions);
            var submissionId = pending.GetType().GetProperty("id")!.GetValue(pending)!.ToString();
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "moderate", JsonDocument.Parse($"{{\"submissionId\":\"{submissionId}\",\"status\":\"approved\"}}").RootElement), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var displayJson = JsonSerializer.Serialize(display!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"word\":\"trust\"", displayJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"word\":\"listening\"", displayJson, StringComparison.OrdinalIgnoreCase);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":20", JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task LastOneStandingAdvancesTurnsAndEliminatesDuplicateWords()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Last One Standing", ActivityTypes.Word, Config: JsonDocument.Parse("""
                {"title":"Last One Standing","preset":"lastOneStanding","turnBased":true,"maxWords":1,"eliminateOnDuplicate":true,"requireModeration":false,"rounds":[{"id":"r1","prompt":"Name a team strength","category":"Teamwork","points":10}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First Player"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second Player"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);

            var firstOpen = await sessions.GetParticipantViewAsync(run.Id, first.Token, TestContext.Current.CancellationToken);
            var secondOpen = await sessions.GetParticipantViewAsync(run.Id, second.Token, TestContext.Current.CancellationToken);
            Assert.Contains("\"isCurrentTurn\":true", JsonSerializer.Serialize(firstOpen!.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"isCurrentTurn\":false", JsonSerializer.Serialize(secondOpen!.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);

            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "submit", JsonDocument.Parse("{\"text\":\"trust\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            var secondTurn = await sessions.GetParticipantViewAsync(run.Id, second.Token, TestContext.Current.CancellationToken);
            Assert.Contains("\"isCurrentTurn\":true", JsonSerializer.Serialize(secondTurn!.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "submit", JsonDocument.Parse("{\"text\":\"trust\"}").RootElement), TestContext.Current.CancellationToken)).Success);

            var secondEliminated = await sessions.GetParticipantViewAsync(run.Id, second.Token, TestContext.Current.CancellationToken);
            var firstNext = await sessions.GetParticipantViewAsync(run.Id, first.Token, TestContext.Current.CancellationToken);
            var eliminatedStateJson = JsonSerializer.Serialize(secondEliminated!.State.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"isEliminated\":true", eliminatedStateJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("repeated", eliminatedStateJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"isCurrentTurn\":true", JsonSerializer.Serialize(firstNext!.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            Assert.False((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "submit", JsonDocument.Parse("{\"text\":\"another\"}").RootElement), TestContext.Current.CancellationToken)).Success);

            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "submit", JsonDocument.Parse("{\"text\":\"listening\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "lock"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scoreJson = JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.Contains("\"amount\":20", scoreJson, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task WordRoundsRespectConfiguredWordLimitsAndServerTimerExpiry()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Animal Name Five", ActivityTypes.Word, Config: JsonDocument.Parse("""
                {"title":"Animal Name Five","maxWords":2,"requireModeration":false,"rounds":[{"id":"r1","prompt":"Name animals","seconds":5,"points":10}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var participant = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Wordsmith"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);

            var tooMany = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(participant.Token, "submit", JsonDocument.Parse("{\"words\":[\"lion\",\"tiger\",\"zebra\"]}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(tooMany.Success);
            Assert.Contains("at most 2", tooMany.Error ?? "", StringComparison.OrdinalIgnoreCase);

            var state = JsonNode.Parse(run.StateJson)!.AsObject();
            state["timerStartedAt"] = DateTimeOffset.UtcNow.AddSeconds(-10).ToString("O");
            run.StateJson = state.ToJsonString(ActivityJsonDefaults.Options);
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
            var expired = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(participant.Token, "submit", JsonDocument.Parse("{\"words\":[\"lion\"]}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(expired.Success);
            Assert.Contains("time is up", expired.Error ?? "", StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task MatchMindsKeepsTheTargetAnswerPrivateAndScoresMatchingPredictions()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Match Minds", ActivityTypes.MatchPlayer, Config: JsonDocument.Parse("""
                {"title":"Match Minds","rounds":[{"id":"r1","prompt":"Choose a free afternoon plan","options":["Read","Explore","Create","Rest"],"points":100}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var target = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Target"), TestContext.Current.CancellationToken);
            var predictor = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Predictor"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "selecttarget", JsonDocument.Parse($"{{\"participantId\":\"{target.Participant!.Id}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);

            var targetView = await sessions.GetParticipantViewAsync(run.Id, target.Token, TestContext.Current.CancellationToken);
            var predictorView = await sessions.GetParticipantViewAsync(run.Id, predictor.Token, TestContext.Current.CancellationToken);
            Assert.Contains("\"isTarget\":true", JsonSerializer.Serialize(targetView!.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"isTarget\":false", JsonSerializer.Serialize(predictorView!.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.False((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(predictor.Token, "answer", JsonDocument.Parse("{\"optionIndex\":2}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(target.Token, "answer", JsonDocument.Parse("{\"optionIndex\":2}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(predictor.Token, "predict", JsonDocument.Parse("{\"optionIndex\":2}").RootElement), TestContext.Current.CancellationToken)).Success);
            var beforeReveal = await sessions.GetParticipantViewAsync(run.Id, predictor.Token, TestContext.Current.CancellationToken);
            Assert.DoesNotContain("Create", JsonSerializer.Serialize(beforeReveal!.State.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "lock"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"revealedAnswer\":\"Create\"", JsonSerializer.Serialize(display!.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":100", JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task MatchMindsSupportsPrivateTextAnswersAndNormalizedMatching()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Text Match Minds", ActivityTypes.MatchPlayer, Config: JsonDocument.Parse("""
                {"title":"Text Match Minds","rounds":[{"id":"r1","prompt":"Name a favorite animal","answerMode":"text","points":100}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var target = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Target"), TestContext.Current.CancellationToken);
            var predictor = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Predictor"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "selecttarget", JsonDocument.Parse($"{{\"participantId\":\"{target.Participant!.Id}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(target.Token, "answer", JsonDocument.Parse("{\"text\":\"  Red   panda \"}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(predictor.Token, "predict", JsonDocument.Parse("{\"text\":\"red panda\"}").RootElement), TestContext.Current.CancellationToken)).Success);

            var beforeReveal = await sessions.GetParticipantViewAsync(run.Id, predictor.Token, TestContext.Current.CancellationToken);
            Assert.DoesNotContain("Red   panda", JsonSerializer.Serialize(beforeReveal!.State.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "lock"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"revealedAnswer\":\"Red   panda\"", JsonSerializer.Serialize(display!.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":100", JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task MysteryImagePreservesTheExistingActivityButHidesItsAnswerUntilReveal()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Mystery Image", ActivityTypes.ImageReveal, Config: JsonDocument.Parse("""
                {"title":"Mystery Image","imageUrl":"/api/v1/media/example","totalStages":3,"prompt":"What is this?","answer":"A lighthouse"}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var before = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.DoesNotContain("A lighthouse", JsonSerializer.Serialize(before!.Config, ActivityJsonDefaults.Options), StringComparison.Ordinal);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "revealstage"), TestContext.Current.CancellationToken);
            var partial = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.DoesNotContain("A lighthouse", JsonSerializer.Serialize(partial!.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "revealall"), TestContext.Current.CancellationToken);
            var revealed = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"revealedAnswer\":\"A lighthouse\"", JsonSerializer.Serialize(revealed!.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task StageChallengeUsesServerTimerMetadataAndAwardsAHostJudgedResult()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Beat the Clock", ActivityTypes.StageChallenge, Config: JsonDocument.Parse("""
                {"title":"Beat the Clock","challenges":[{"id":"c1","title":"Stack cups","instructions":"Make the tallest stack.","seconds":10,"points":125,"failPoints":-25}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var contestant = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Contestant"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "selectcontestant", JsonDocument.Parse($"{{\"participantId\":\"{contestant.Participant!.Id}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "starttimer"), TestContext.Current.CancellationToken)).Success);
            var running = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var runningJson = JsonSerializer.Serialize(running!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"challengeStatus\":\"running\"", runningJson, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"timerDurationMs\":10000", runningJson, StringComparison.OrdinalIgnoreCase);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "success"), TestContext.Current.CancellationToken)).Success);
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"outcome\":\"success\"", JsonSerializer.Serialize(display!.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":125", JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task StageChallengeAudienceVoteStaysPrivateUntilRevealAndAwardsMatchingCallers()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Audience Stage Challenge", ActivityTypes.StageChallenge, Config: JsonDocument.Parse("""
                {"title":"Audience Stage Challenge","audienceVoting":true,"audienceVotePoints":15,"challenges":[{"id":"c1","title":"Balance a banana","instructions":"Keep the banana balanced for ten seconds.","seconds":10,"points":125,"failPoints":-25}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var contestant = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Contestant"), TestContext.Current.CancellationToken);
            var voter = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Voter"), TestContext.Current.CancellationToken);

            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "selectcontestant", JsonDocument.Parse($"{{\"participantId\":\"{contestant.Participant!.Id}\"}}").RootElement), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "starttimer"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "pausetimer"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openaudiencevote"), TestContext.Current.CancellationToken)).Success);

            var votingView = await sessions.GetParticipantViewAsync(run.Id, voter.Token, TestContext.Current.CancellationToken);
            var votingState = JsonSerializer.Serialize(votingView!.State.State, ActivityJsonDefaults.Options);
            Assert.Contains("audienceVoteOptions", votingState, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("audienceVoteCounts", votingState, StringComparison.OrdinalIgnoreCase);

            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(voter.Token, "vote", JsonDocument.Parse("{\"outcome\":\"success\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "closeaudiencevote"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "useaudiencevote"), TestContext.Current.CancellationToken)).Success);

            var displayState = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal("success", displayState.GetProperty("outcome").GetString());
            Assert.Equal(1, displayState.GetProperty("audienceVoteCounts").GetProperty("success").GetInt32());
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scoreEvents = JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.Contains("\"amount\":125", scoreEvents, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"reason\":\"Stage challenge success\"", scoreEvents, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"amount\":15", scoreEvents, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("\"reason\":\"Audience call bonus\"", scoreEvents, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task BracketBattleAdvancesWinnersThroughMultipleRounds()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Bracket Battle", ActivityTypes.Bracket, Config: JsonDocument.Parse("""
                {"title":"Bracket Battle","entrants":[{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"},{"id":"c","label":"Gamma"},{"id":"d","label":"Delta"}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var voter = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Voter"), TestContext.Current.CancellationToken);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            for (var matchIndex = 0; matchIndex < 4; matchIndex++)
            {
                var before = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
                var beforeJson = JsonSerializer.SerializeToElement(before!.State, ActivityJsonDefaults.Options);
                if (beforeJson.TryGetProperty("bracketChampionId", out var champion) && champion.ValueKind == JsonValueKind.String) break;
                var current = beforeJson.GetProperty("currentMatch");
                var entrantId = current.GetProperty("entrantAId").GetString()!;
                Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
                Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(voter.Token, "vote", JsonDocument.Parse($"{{\"entrantId\":\"{entrantId}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
                Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal", JsonDocument.Parse($"{{\"winnerId\":\"{entrantId}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
                var revealed = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
                Assert.Contains("bracketMatches", JsonSerializer.Serialize(revealed!.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
                Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken)).Success);
            }

            var final = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var finalJson = JsonSerializer.Serialize(final!.State, ActivityJsonDefaults.Options);
            Assert.Contains("\"bracketChampionId\":\"a\"", finalJson, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task PhysicalRoomRunsWithoutPhonesAndUsesServerTimerMetadata()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Four Corners", ActivityTypes.PhysicalRoom, Config: JsonDocument.Parse("""
                {"title":"Four Corners","rounds":[{"id":"r1","title":"Choose a corner","instructions":"Move to the corner that fits your answer.","choices":["North","South","East","West"],"seconds":10,"revealText":"Explain your choice."},{"id":"r2","title":"Second prompt","instructions":"Choose again.","choices":["Left","Right"],"seconds":15,"revealText":"Reveal the room."}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);

            var hostBeforeStart = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Empty(hostBeforeStart!.Participants);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);

            var started = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var startedState = JsonSerializer.SerializeToElement(started!.State, ActivityJsonDefaults.Options);
            Assert.Equal(ActivityPhases.RoundIntro, startedState.GetProperty("phase").GetString());
            Assert.Equal(4, startedState.GetProperty("currentRound").GetProperty("choices").GetArrayLength());
            Assert.False((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "randomize"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "starttimer"), TestContext.Current.CancellationToken)).Success);
            var running = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal("running", running.GetProperty("challengeStatus").GetString());
            Assert.Equal(10000, running.GetProperty("timerDurationMs").GetInt64());
            Assert.True(running.GetProperty("timerStartedAt").GetString() is not null);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "pausetimer"), TestContext.Current.CancellationToken)).Success);
            var paused = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal("paused", paused.GetProperty("challengeStatus").GetString());
            Assert.True(paused.GetProperty("timerPausedAt").GetString() is not null);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resumetimer"), TestContext.Current.CancellationToken)).Success);
            Assert.False((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "randomize"), TestContext.Current.CancellationToken)).Success);

            var randomized = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal(4, randomized.GetProperty("currentRound").GetProperty("choices").GetArrayLength());
            Assert.Equal(new[] { "East", "North", "South", "West" }, randomized.GetProperty("currentRound").GetProperty("choices").EnumerateArray().Select(choice => choice.GetString()).OrderBy(choice => choice).ToArray());
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            var revealed = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.True(revealed.GetProperty("revealed").GetBoolean());

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken)).Success);
            var secondRound = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal(1, secondRound.GetProperty("currentRoundIndex").GetInt32());
            Assert.Equal("ready", secondRound.GetProperty("challengeStatus").GetString());
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "starttimer"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken)).Success);
            var complete = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal(ActivityPhases.FinalResults, complete.GetProperty("phase").GetString());
        }
    }

    [Fact]
    public async Task ParticipantBracketSeedsLiveRosterAndAwardsSharedScoreEvents()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Live Bracket", ActivityTypes.Bracket, Config: JsonDocument.Parse("""
                {"title":"Live Bracket","entrantSource":"participants","pointsPerWin":25}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second"), TestContext.Current.CancellationToken);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            var started = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            var matchup = started.GetProperty("currentMatch");
            Assert.Equal(first.Participant!.Id.ToString(), matchup.GetProperty("entrantAId").GetString());
            Assert.Equal(second.Participant!.Id.ToString(), matchup.GetProperty("entrantBId").GetString());
            Assert.Equal("First", matchup.GetProperty("entrantA").GetString());

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "close"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal", JsonDocument.Parse($"{{\"winnerId\":\"{first.Participant.Id}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scores = JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options);
            Assert.Contains("\"amount\":25", scores, StringComparison.OrdinalIgnoreCase);
            Assert.Contains(first.Participant.Id.ToString(), scores, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task UtilityPresetsUseServerRandomnessAndKeepMysteryValuesPrivateUntilReveal()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var presets = new[]
            {
                (Type: ActivityUtilityTypes.CoinFlip, Action: "flip", Config: """{"title":"Coin","utilityType":"coinFlip","choices":["Heads","Tails"]}"""),
                (Type: ActivityUtilityTypes.Dice, Action: "roll", Config: """{"title":"Dice","utilityType":"dice","diceSides":20}"""),
                (Type: ActivityUtilityTypes.RandomNumber, Action: "draw", Config: """{"title":"Number","utilityType":"randomNumber","minimum":10,"maximum":20}"""),
                (Type: ActivityUtilityTypes.ChallengePicker, Action: "pick", Config: """{"title":"Challenge","utilityType":"challengePicker","challenges":[{"id":"c1","label":"Do a dance","instructions":"Ten seconds.","points":25}]}""")
            };

            foreach (var preset in presets)
            {
                var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(preset.Type, ActivityTypes.Utility, Config: JsonDocument.Parse(preset.Config).RootElement), "teacher", TestContext.Current.CancellationToken);
                var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
                Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
                var command = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, preset.Action), TestContext.Current.CancellationToken);
                Assert.True(command.Success, command.Error);
                var state = JsonSerializer.SerializeToElement(command.State, ActivityJsonDefaults.Options);
                Assert.Equal(preset.Type, state.GetProperty("result").GetProperty("kind").GetString());
            }

            var mysteryDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Mystery Boxes", ActivityTypes.Utility, Config: JsonDocument.Parse("""
                {"title":"Mystery Boxes","utilityType":"mysteryBoxes","boxes":[{"id":"box-1","label":"First","value":"Secret answer","points":999},{"id":"box-2","label":"Second","value":"Another secret","points":10}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var mysteryRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(mysteryDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(mysteryRun.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            var beforeReveal = await sessions.GetDisplayEnvelopeAsync(mysteryRun.Id, TestContext.Current.CancellationToken);
            var publicBefore = JsonSerializer.Serialize(beforeReveal!.Config, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("Secret answer", publicBefore, StringComparison.Ordinal);
            Assert.DoesNotContain("999", publicBefore, StringComparison.Ordinal);
            Assert.True((await sessions.ExecuteHostActionAsync(mysteryRun.Id, new ActivityCommandEnvelope(null, null, "revealbox", JsonDocument.Parse("{\"boxId\":\"box-1\"}").RootElement), TestContext.Current.CancellationToken)).Success);
            var afterReveal = await sessions.GetDisplayEnvelopeAsync(mysteryRun.Id, TestContext.Current.CancellationToken);
            var publicState = JsonSerializer.Serialize(afterReveal!.State, ActivityJsonDefaults.Options);
            Assert.Contains("Secret answer", publicState, StringComparison.Ordinal);
            Assert.False((await sessions.ExecuteHostActionAsync(mysteryRun.Id, new ActivityCommandEnvelope(null, null, "revealbox", JsonDocument.Parse("{\"boxId\":\"box-1\"}").RootElement), TestContext.Current.CancellationToken)).Success);
        }
    }

    [Fact]
    public async Task UtilityTeamGeneratorRandomizesLiveParticipantsIntoSharedTeams()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Team Generator", ActivityTypes.Utility, Config: JsonDocument.Parse("""
                {"title":"Team Generator","utilityType":"teamGenerator","teamCount":2}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Jordan"), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Casey"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);

            var generated = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "generateteams"), TestContext.Current.CancellationToken);
            Assert.True(generated.Success, generated.Error);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(2, host!.Teams.Count);
            Assert.All(host.Participants, participant => Assert.NotNull(participant.GetType().GetProperty("teamId")?.GetValue(participant)));
            var state = JsonSerializer.SerializeToElement(generated.State, ActivityJsonDefaults.Options);
            Assert.Equal(ActivityUtilityTypes.TeamGenerator, state.GetProperty("result").GetProperty("kind").GetString());
        }
    }

    [Fact]
    public async Task UtilityRosterPickersAndCountdownUseSessionStateAndRecoverThroughHostActions()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var personDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Random Person", ActivityTypes.Utility, Config: JsonDocument.Parse("""
                {"title":"Random Person","utilityType":"randomPerson"}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var personRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(personDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(personRun.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(personRun.JoinCode!, new ActivityParticipantJoinInput(null, "Jordan"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(personRun.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            var pickedPerson = await sessions.ExecuteHostActionAsync(personRun.Id, new ActivityCommandEnvelope(null, null, "pickperson"), TestContext.Current.CancellationToken);
            Assert.True(pickedPerson.Success, pickedPerson.Error);
            var personState = JsonSerializer.SerializeToElement(pickedPerson.State, ActivityJsonDefaults.Options);
            Assert.Equal(ActivityUtilityTypes.RandomPerson, personState.GetProperty("result").GetProperty("kind").GetString());
            Assert.Contains(personState.GetProperty("result").GetProperty("label").GetString(), new[] { "Alex", "Jordan" });
            var retriedPerson = await sessions.ExecuteHostActionAsync(personRun.Id, new ActivityCommandEnvelope(null, null, "retry"), TestContext.Current.CancellationToken);
            Assert.True(retriedPerson.Success, retriedPerson.Error);
            var skippedPerson = await sessions.ExecuteHostActionAsync(personRun.Id, new ActivityCommandEnvelope(null, null, "skip"), TestContext.Current.CancellationToken);
            Assert.True(skippedPerson.Success, skippedPerson.Error);
            var skippedState = JsonSerializer.SerializeToElement(skippedPerson.State, ActivityJsonDefaults.Options);
            Assert.Equal("roundComplete", skippedState.GetProperty("phase").GetString());
            Assert.Equal(JsonValueKind.Null, skippedState.GetProperty("result").ValueKind);

            var teamDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Random Team", ActivityTypes.Utility, Config: JsonDocument.Parse("""
                {"title":"Random Team","utilityType":"randomTeam"}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var teamRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(teamDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(teamRun.JoinCode!, new ActivityParticipantJoinInput(null, "Casey"), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(teamRun.JoinCode!, new ActivityParticipantJoinInput(null, "Morgan"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(teamRun.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            var generatedTeams = await sessions.ExecuteHostActionAsync(teamRun.Id, new ActivityCommandEnvelope(null, null, "generateteams", JsonDocument.Parse("{\"teamCount\":2}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(generatedTeams.Success, generatedTeams.Error);
            var pickedTeam = await sessions.ExecuteHostActionAsync(teamRun.Id, new ActivityCommandEnvelope(null, null, "pickteam"), TestContext.Current.CancellationToken);
            Assert.True(pickedTeam.Success, pickedTeam.Error);
            var teamState = JsonSerializer.SerializeToElement(pickedTeam.State, ActivityJsonDefaults.Options);
            Assert.Equal(ActivityUtilityTypes.RandomTeam, teamState.GetProperty("result").GetProperty("kind").GetString());

            var countdownDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Utility Countdown", ActivityTypes.Utility, Config: JsonDocument.Parse("""
                {"title":"Utility Countdown","utilityType":"countdown","durationSeconds":30,"warningThresholdSeconds":5}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var countdownRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(countdownDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(countdownRun.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            var started = await sessions.ExecuteHostActionAsync(countdownRun.Id, new ActivityCommandEnvelope(null, null, "starttimer"), TestContext.Current.CancellationToken);
            Assert.True(started.Success, started.Error);
            var startedState = JsonSerializer.SerializeToElement(started.State, ActivityJsonDefaults.Options);
            Assert.True(startedState.GetProperty("timerRunning").GetBoolean());
            Assert.Equal(30000, startedState.GetProperty("timerDurationMs").GetInt64());
            var paused = await sessions.ExecuteHostActionAsync(countdownRun.Id, new ActivityCommandEnvelope(null, null, "pausetimer"), TestContext.Current.CancellationToken);
            Assert.True(paused.Success, paused.Error);
            var pausedState = JsonSerializer.SerializeToElement(paused.State, ActivityJsonDefaults.Options);
            Assert.False(pausedState.GetProperty("timerRunning").GetBoolean());
            Assert.InRange(pausedState.GetProperty("timerRemainingMs").GetInt64(), 0, 30000);
            var adjusted = await sessions.ExecuteHostActionAsync(countdownRun.Id, new ActivityCommandEnvelope(null, null, "adjusttime", JsonDocument.Parse("{\"deltaSeconds\":10}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(adjusted.Success, adjusted.Error);
            var adjustedState = JsonSerializer.SerializeToElement(adjusted.State, ActivityJsonDefaults.Options);
            Assert.InRange(adjustedState.GetProperty("timerRemainingMs").GetInt64(), 10000, 40000);
            var display = await sessions.GetDisplayEnvelopeAsync(countdownRun.Id, TestContext.Current.CancellationToken);
            var displayState = JsonSerializer.SerializeToElement(display!.State, ActivityJsonDefaults.Options);
            Assert.True(displayState.GetProperty("timerRemainingMs").GetInt64() >= 0);
            Assert.True(displayState.TryGetProperty("timerExpired", out _));
        }
    }

    [Fact]
    public async Task UtilityTeamGeneratorSupportsManualBalancedAndRandomAssignmentModes()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Team Modes", ActivityTypes.Utility, Config: JsonDocument.Parse("""
                {"title":"Team Modes","utilityType":"teamGenerator","teamCount":2,"teamAssignmentMode":"balanced"}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            foreach (var name in new[] { "Alex", "Jordan", "Casey", "Morgan" })
                await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, name), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);

            var manual = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "generateteams", JsonDocument.Parse("{\"teamCount\":2,\"assignmentMode\":\"manual\"}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(manual.Success, manual.Error);
            var manualHost = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.All(manualHost!.Participants, participant => Assert.Null(participant.GetType().GetProperty("teamId")?.GetValue(participant)));
            var manualState = JsonSerializer.SerializeToElement(manual.State, ActivityJsonDefaults.Options);
            Assert.Equal(ActivityUtilityAssignmentModes.Manual, manualState.GetProperty("result").GetProperty("assignmentMode").GetString());

            var random = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "generateteams", JsonDocument.Parse("{\"teamCount\":2,\"assignmentMode\":\"random\"}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(random.Success, random.Error);
            var randomHost = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var teamIds = randomHost!.Teams.Select(team => team.GetType().GetProperty("id")?.GetValue(team)?.ToString()).ToHashSet();
            Assert.All(randomHost.Participants, participant => Assert.Contains(participant.GetType().GetProperty("teamId")?.GetValue(participant)?.ToString(), teamIds));
            var randomState = JsonSerializer.SerializeToElement(random.State, ActivityJsonDefaults.Options);
            Assert.Equal(ActivityUtilityAssignmentModes.Random, randomState.GetProperty("result").GetProperty("assignmentMode").GetString());
            var firstTeamId = Guid.Parse(randomHost.Teams[0].GetType().GetProperty("id")!.GetValue(randomHost.Teams[0])!.ToString()!);
            Assert.True(await sessions.RenameTeamAsync(run.Id, firstTeamId, "Blue Rockets", TestContext.Current.CancellationToken));
            var renamedHost = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains(renamedHost!.Teams, team => team.GetType().GetProperty("name")?.GetValue(team)?.ToString() == "Blue Rockets");
            Assert.False(await sessions.RenameTeamAsync(run.Id, firstTeamId, "   ", TestContext.Current.CancellationToken));

            var invalid = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "generateteams", JsonDocument.Parse("{\"assignmentMode\":\"surprise\"}").RootElement), TestContext.Current.CancellationToken);
            Assert.False(invalid.Success);
        }
    }

    [Fact]
    public async Task QuizModifiersApplyServerWagersDoubleOrNothingAndLives()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Modifier Quiz", ActivityTypes.Trivia, Config: JsonDocument.Parse("""
                {
                  "title":"Modifier Quiz",
                  "questions":[
                    {"id":"q1","prompt":"Choose A","options":["A","B"],"correctIndex":0,"points":100},
                    {"id":"q2","prompt":"Choose B","options":["A","B"],"correctIndex":1,"points":100}
                  ],
                  "modifiers":{
                    "wager":{"enabled":true,"maxPoints":50,"defaultPoints":0},
                    "speedBonus":{"enabled":false,"maxPoints":10,"windowSeconds":20},
                    "lives":{"enabled":true,"startingLives":2,"eliminateAtZero":true},
                    "doubleOrNothing":{"enabled":true}
                  }
                }
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var joined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Risk Taker"), TestContext.Current.CancellationToken);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
            var wrong = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(joined.Token, "answer", JsonDocument.Parse("""{"optionIndex":1,"wager":20,"doubleOrNothing":true}""").RootElement), TestContext.Current.CancellationToken);
            Assert.True(wrong.Success, wrong.Error);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);

            var afterWrong = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Equal(1, afterWrong!.Participants.Single().GetType().GetProperty("lives")!.GetValue(afterWrong.Participants.Single()));
            var wrongScores = await db.ActivityScoreEvents.Where(score => score.ActivityRunId == run.Id).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Contains(wrongScores, score => score.Amount == -100);
            Assert.Contains(wrongScores, score => score.Amount == -20);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
            var correct = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(joined.Token, "answer", JsonDocument.Parse("""{"optionIndex":1,"wager":20,"doubleOrNothing":true}""").RootElement), TestContext.Current.CancellationToken);
            Assert.True(correct.Success, correct.Error);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);

            var afterCorrect = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var allScores = await db.ActivityScoreEvents.Where(score => score.ActivityRunId == run.Id).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Contains(allScores, score => score.Amount == 240);
            Assert.Equal(120, allScores.Where(score => score.ParticipantId == joined.Participant!.Id).Sum(score => score.Amount));
            var participantView = await sessions.GetParticipantViewAsync(run.Id, joined.Token, TestContext.Current.CancellationToken);
            Assert.Contains("myLives", JsonSerializer.Serialize(participantView!.State.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task RapidFireUsesTheSharedServerTimerAndQuizScoringPath()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Rapid Fire", ActivityTypes.RapidFire, Config: JsonDocument.Parse("""
                {"title":"Rapid Fire","questions":[{"id":"q1","prompt":"Pick B","options":["A","B"],"correctIndex":1,"points":80,"timerSeconds":5}],"modifiers":{"speedBonus":{"enabled":false}}}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var joined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Fast Player"), TestContext.Current.CancellationToken);
            var started = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            Assert.True(started.Success, started.Error);
            var startedState = JsonSerializer.SerializeToElement(started.State, ActivityJsonDefaults.Options);
            Assert.True(startedState.GetProperty("isRunning").GetBoolean());
            Assert.InRange(startedState.GetProperty("remainingMs").GetInt32(), 4500, 5000);
            Assert.True(startedState.TryGetProperty("targetAt", out _));

            var answer = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(joined.Token, "answer", JsonDocument.Parse("""{"optionIndex":1}""").RootElement), TestContext.Current.CancellationToken);
            Assert.True(answer.Success, answer.Error);
            var revealed = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            Assert.True(revealed.Success, revealed.Error);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scores = await db.ActivityScoreEvents.Where(score => score.ActivityRunId == run.Id).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Contains(scores, score => score.Amount == 80 && score.ParticipantId == joined.Participant!.Id);
            var revealedState = JsonSerializer.SerializeToElement(revealed.State, ActivityJsonDefaults.Options);
            Assert.False(revealedState.GetProperty("isRunning").GetBoolean());
            Assert.Equal(JsonValueKind.Null, revealedState.GetProperty("targetAt").ValueKind);
        }
    }

    [Fact]
    public async Task CreativeHeadToHeadPairsApprovedResponsesAndAwardsMatchAndChampionPoints()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Head-to-Head Punchline", ActivityTypes.Punchline, Config: JsonDocument.Parse("""
                {"title":"Head-to-Head Punchline","votingStyle":"headToHead","headToHeadMatchPoints":25,"requireModeration":false,"prompts":[{"id":"p1","prompt":"The worst mascot would be...","points":100}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First Writer"), TestContext.Current.CancellationToken);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second Writer"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "submit", JsonDocument.Parse("""{"text":"A surprisingly tiny mascot"}""").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "submit", JsonDocument.Parse("""{"text":"A mascot that only says homework"}""").RootElement), TestContext.Current.CancellationToken)).Success);

            var openVoting = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openvoting"), TestContext.Current.CancellationToken);
            Assert.True(openVoting.Success, openVoting.Error);
            var matchState = JsonSerializer.SerializeToElement(openVoting.State, ActivityJsonDefaults.Options);
            Assert.Equal("voting", matchState.GetProperty("phase").GetString());
            Assert.Equal("open", matchState.GetProperty("creativeMatches")[0].GetProperty("status").GetString());
            var submissions = (await db.ActivitySubmissions.Where(item => item.ActivityRunId == run.Id).ToListAsync(TestContext.Current.CancellationToken)).OrderBy(item => item.SubmittedAt).ToList();
            var firstSubmissionId = submissions[0].Id.ToString();
            var secondSubmissionId = submissions[1].Id.ToString();
            var participantView = await sessions.GetParticipantViewAsync(run.Id, first.Token, TestContext.Current.CancellationToken);
            var participantState = JsonSerializer.SerializeToElement(participantView!.State.State, ActivityJsonDefaults.Options);
            Assert.Contains("A surprisingly tiny mascot", participantState.GetProperty("creativeCurrentMatch").GetProperty("entrantA").GetString()! + participantState.GetProperty("creativeCurrentMatch").GetProperty("entrantB").GetString()!);
            Assert.DoesNotContain("First Writer", JsonSerializer.Serialize(participantState, ActivityJsonDefaults.Options), StringComparison.Ordinal);

            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(first.Token, "vote", JsonDocument.Parse($"{{\"targetId\":\"{firstSubmissionId}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(second.Token, "vote", JsonDocument.Parse($"{{\"targetId\":\"{secondSubmissionId}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            var reveal = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal", JsonDocument.Parse($"{{\"winnerId\":\"{firstSubmissionId}\"}}").RootElement), TestContext.Current.CancellationToken);
            Assert.True(reveal.Success, reveal.Error);
            var revealState = JsonSerializer.SerializeToElement(reveal.State, ActivityJsonDefaults.Options);
            Assert.Equal("finalResults", revealState.GetProperty("phase").GetString());
            Assert.Equal(firstSubmissionId, revealState.GetProperty("creativeChampionId").GetString());
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            var scores = await db.ActivityScoreEvents.Where(score => score.ActivityRunId == run.Id && score.ParticipantId == first.Participant!.Id).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Equal(125, scores.Sum(score => score.Amount));
            var displayState = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("First Writer", displayState.GetProperty("submissions").GetRawText(), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task ExistingEnginesCanRunAnEmbeddedUtilityWithoutCreatingAnotherRun()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Buzzer Bonus Utility", ActivityTypes.Buzzer, Config: JsonDocument.Parse("""
                {"title":"Buzzer Bonus","clues":[{"id":"c1","prompt":"A clue","answer":"Answer","points":100}],"embeddedUtility":{"utilityType":"coinFlip","choices":["Heads","Tails"]}}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            var result = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "utility.flip"), TestContext.Current.CancellationToken);
            Assert.True(result.Success, result.Error);
            var state = JsonSerializer.SerializeToElement(result.State, ActivityJsonDefaults.Options);
            Assert.Equal("coinFlip", state.GetProperty("embeddedUtilityState").GetProperty("result").GetProperty("kind").GetString());
            Assert.DoesNotContain("embeddedUtilityState", JsonSerializer.Serialize((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.Config, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task BracketCanDrawARandomSubsetFromTheLiveParticipantRoster()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Random Roster Bracket", ActivityTypes.Bracket, Config: JsonDocument.Parse("""
                {"title":"Random Roster Bracket","entrantSource":"participants","entrantSelection":"random","randomEntrantCount":2,"pointsPerWin":10}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var names = new[] { "Alex", "Jordan", "Casey", "Morgan" };
            foreach (var name in names) await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, name), TestContext.Current.CancellationToken);
            var started = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            Assert.True(started.Success, started.Error);
            var state = JsonSerializer.SerializeToElement(started.State, ActivityJsonDefaults.Options);
            var roster = state.GetProperty("bracketEntrants").EnumerateArray().Select(item => item.GetProperty("label").GetString()).ToArray();
            Assert.Equal(2, roster.Length);
            Assert.All(roster, label => Assert.Contains(label, names));
            Assert.Equal(1, state.GetProperty("matchups").GetArrayLength());
        }
    }

    [Fact]
    public async Task BracketCanImportFinalistsFromAnotherActivityRun()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var sourceDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Source Challenge", ActivityTypes.StageChallenge, Config: JsonDocument.Parse("""
                {"title":"Source Challenge","challenges":[{"id":"c1","title":"Explain it","instructions":"Give your best explanation.","seconds":10,"points":90}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var sourceRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(sourceDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var sourceWinner = await sessions.JoinAsync(sourceRun.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(sourceRun.JoinCode!, new ActivityParticipantJoinInput(null, "Jordan"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(sourceRun.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(sourceRun.Id, new ActivityCommandEnvelope(null, null, "selectcontestant", JsonDocument.Parse($"{{\"participantId\":\"{sourceWinner.Participant!.Id}\"}}").RootElement), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(sourceRun.Id, new ActivityCommandEnvelope(null, null, "starttimer"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(sourceRun.Id, new ActivityCommandEnvelope(null, null, "success"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(sourceRun.Id, new ActivityCommandEnvelope(null, null, "finish"), TestContext.Current.CancellationToken);

            var bracketDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Finalist Bracket", ActivityTypes.Bracket, Config: JsonDocument.Parse("""
                {"title":"Finalist Bracket","entrantSource":"participants","pointsPerWin":10}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var bracketRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(bracketDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(bracketRun.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            await sessions.JoinAsync(bracketRun.JoinCode!, new ActivityParticipantJoinInput(null, "Jordan"), TestContext.Current.CancellationToken);

            var imported = await sessions.ImportBracketFinalistsAsync(bracketRun.Id, sourceRun.Id, 2, TestContext.Current.CancellationToken);
            Assert.True(imported.Success, imported.Error);
            Assert.Equal(2, imported.Count);
            var state = JsonSerializer.SerializeToElement((await sessions.GetHostViewAsync(bracketRun.Id, TestContext.Current.CancellationToken))!.State.State, ActivityJsonDefaults.Options);
            Assert.Equal(sourceRun.Id.ToString(), state.GetProperty("bracketHandoffSourceRunId").GetString());
            Assert.Equal(new[] { "Alex", "Jordan" }, state.GetProperty("bracketEntrants").EnumerateArray().Select(item => item.GetProperty("label").GetString()).OrderBy(value => value).ToArray());
        }
    }

    [Fact]
    public async Task MatchUpAndConnectionsAcceptStructuredAnswersAndScorePartialResults()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var matchDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Match-Up", ActivityTypes.Ordering, Config: JsonDocument.Parse("""
                {"title":"Match-Up","interactionMode":"matching","scoringMode":"partial","rounds":[{"id":"r1","prompt":"Match the animals","points":100,"pairs":[{"id":"penguin","left":"Penguin","right":"Antarctica"},{"id":"camel","left":"Camel","right":"Desert"}]}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var matchRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(matchDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var matchPlayer = await sessions.JoinAsync(matchRun.JoinCode!, new ActivityParticipantJoinInput(null, "Match Player"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(matchRun.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(matchRun.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
            var matchSubmission = await sessions.ExecuteParticipantActionAsync(matchRun.Id, new ActivityParticipantActionInput(matchPlayer.Token, "match", JsonDocument.Parse("""
                {"matches":[{"leftId":"penguin","rightId":"Antarctica"},{"leftId":"camel","rightId":"Wrong Habitat"}]}
                """).RootElement), TestContext.Current.CancellationToken);
            Assert.True(matchSubmission.Success, matchSubmission.Error);
            var matchReveal = await sessions.ExecuteHostActionAsync(matchRun.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            Assert.True(matchReveal.Success, matchReveal.Error);
            var matchState = JsonSerializer.SerializeToElement(matchReveal.State, ActivityJsonDefaults.Options);
            Assert.Equal("matching", matchState.GetProperty("orderingInteractionMode").GetString());
            Assert.Equal(1, matchState.GetProperty("orderingResults")[0].GetProperty("correctPairs").GetInt32());
            var matchScores = await db.ActivityScoreEvents.Where(score => score.ActivityRunId == matchRun.Id && score.ParticipantId == matchPlayer.Participant!.Id).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Equal(50, matchScores.Sum(score => score.Amount));

            var connectionsDefinition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Connections", ActivityTypes.Ordering, Config: JsonDocument.Parse("""
                {"title":"Connections","interactionMode":"grouping","rounds":[{"id":"r1","prompt":"Group the animals","points":80,"items":[{"id":"cat","label":"Cat"},{"id":"dog","label":"Dog"},{"id":"eagle","label":"Eagle"},{"id":"hawk","label":"Hawk"}],"groups":[{"id":"pets","label":"Pets","itemIds":["cat","dog"]},{"id":"birds","label":"Birds","itemIds":["eagle","hawk"]}]}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var connectionsRun = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(connectionsDefinition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var connectionsPlayer = await sessions.JoinAsync(connectionsRun.JoinCode!, new ActivityParticipantJoinInput(null, "Connections Player"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(connectionsRun.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(connectionsRun.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken)).Success);
            var groupingSubmission = await sessions.ExecuteParticipantActionAsync(connectionsRun.Id, new ActivityParticipantActionInput(connectionsPlayer.Token, "group", JsonDocument.Parse("""
                {"groups":[{"groupId":"pets","itemIds":["cat","dog"]},{"groupId":"birds","itemIds":["eagle","hawk"]}]}
                """).RootElement), TestContext.Current.CancellationToken);
            Assert.True(groupingSubmission.Success, groupingSubmission.Error);
            var groupingReveal = await sessions.ExecuteHostActionAsync(connectionsRun.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            Assert.True(groupingReveal.Success, groupingReveal.Error);
            var groupingState = JsonSerializer.SerializeToElement(groupingReveal.State, ActivityJsonDefaults.Options);
            Assert.Equal("grouping", groupingState.GetProperty("orderingInteractionMode").GetString());
            Assert.Equal(4, groupingState.GetProperty("orderingResults")[0].GetProperty("correctItems").GetInt32());
            var groupingScores = await db.ActivityScoreEvents.Where(score => score.ActivityRunId == connectionsRun.Id && score.ParticipantId == connectionsPlayer.Participant!.Id).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Equal(80, groupingScores.Sum(score => score.Amount));
        }
    }

    [Fact]
    public async Task MemoryGridKeepsCardLabelsPrivateUntilTheHostShowsTheCards()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Memory Grid", ActivityTypes.ImageReveal, Config: JsonDocument.Parse("""
                {"title":"Memory Grid","mediaMode":"memoryGrid","memorySeconds":4,"memoryCards":[{"id":"lion","label":"Lion","match":"savanna"},{"id":"savanna","label":"Savanna","match":"savanna"}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Memory Player"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);

            var hidden = await sessions.GetParticipantViewAsync(run.Id, player.Token, TestContext.Current.CancellationToken);
            var hiddenJson = JsonSerializer.Serialize(hidden!.State, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("Lion", hiddenJson, StringComparison.Ordinal);
            Assert.DoesNotContain("Savanna", hiddenJson, StringComparison.Ordinal);
            Assert.Contains("?", hiddenJson, StringComparison.Ordinal);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "showallcards"), TestContext.Current.CancellationToken)).Success);
            var visible = await sessions.GetParticipantViewAsync(run.Id, player.Token, TestContext.Current.CancellationToken);
            var visibleJson = JsonSerializer.Serialize(visible!.State, ActivityJsonDefaults.Options);
            Assert.Contains("Lion", visibleJson, StringComparison.Ordinal);
            Assert.Contains("memoryTimerRemainingMs", visibleJson, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task AudioRoundsUseAHostPlaybackNonceAndKeepTheAnswerInTheHostProjection()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Sound Check", ActivityTypes.ImageReveal, Config: JsonDocument.Parse("""
                {"title":"Sound Check","mediaMode":"audio","audioDurationSeconds":1,"audioUrl":"/media/roar.mp3","prompt":"Name the animal","answer":"Lion"}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            var played = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "playaudio"), TestContext.Current.CancellationToken);
            Assert.True(played.Success, played.Error);
            var playedState = JsonSerializer.SerializeToElement(played.State, ActivityJsonDefaults.Options);
            Assert.Equal(1, playedState.GetProperty("audioNonce").GetInt64());
            Assert.Equal(ActivityPhases.AcceptingResponses, playedState.GetProperty("phase").GetString());
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var displayJson = JsonSerializer.Serialize(display, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("\"answer\":\"Lion\"", displayJson, StringComparison.Ordinal);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("Lion", JsonSerializer.Serialize(host!.State, ActivityJsonDefaults.Options), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task AdventureStoresVotesAndMovesToTheServerSelectedBranch()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Animal Adventure", ActivityTypes.PhysicalRoom, Config: JsonDocument.Parse("""
                {"title":"Animal Adventure","adventure":true,"rounds":[{"id":"start","title":"Fork in the trail","instructions":"Choose a path.","choices":["Follow pawprints","Climb lookout"],"branches":{"0":1,"1":2}},{"id":"waterfall","title":"Waterfall","instructions":"Choose again.","choices":["Search","Build"],"branches":{"0":3,"1":3}},{"id":"lookout","title":"Lookout","instructions":"Choose again.","choices":["Call","Walk"],"branches":{"0":3,"1":3}},{"id":"finish","title":"Finish","instructions":"Celebrate.","choices":[]}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Explorer"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openchoices"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(player.Token, "choose", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken)).Success);
            var resolved = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvechoice", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken);
            Assert.True(resolved.Success, resolved.Error);
            var state = JsonSerializer.SerializeToElement(resolved.State, ActivityJsonDefaults.Options);
            Assert.Equal(1, state.GetProperty("currentRoundIndex").GetInt32());
            Assert.Equal("waterfall", state.GetProperty("currentRound").GetProperty("id").GetString());
            Assert.Equal("Follow pawprints", state.GetProperty("adventureLastChoice").GetString());
            Assert.Contains("adventureHistory", state.GetRawText(), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task AdventureResolvesNamedNodesAndCanFinishFromAChoice()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Named Animal Adventure", ActivityTypes.PhysicalRoom, Config: JsonDocument.Parse("""
                {"title":"Named Animal Adventure","adventure":true,"rounds":[{"id":"start","title":"Choose a trail","instructions":"Pick a path.","choices":["Waterfall","Finish"],"branches":{"0":"waterfall","1":"__end__"}},{"id":"waterfall","title":"Waterfall","instructions":"Look closely.","choices":["Return"],"branches":{"0":"finish"}},{"id":"finish","title":"Safari Celebration","instructions":"Celebrate.","choices":[]}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Explorer"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openchoices"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(player.Token, "choose", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken)).Success);
            var waterfall = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvechoice", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken);
            Assert.True(waterfall.Success, waterfall.Error);
            var waterfallState = JsonSerializer.SerializeToElement(waterfall.State, ActivityJsonDefaults.Options);
            Assert.Equal("waterfall", waterfallState.GetProperty("currentRound").GetProperty("id").GetString());

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openchoices"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(player.Token, "choose", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken)).Success);
            var finish = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvechoice", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken);
            Assert.True(finish.Success, finish.Error);
            var finishState = JsonSerializer.SerializeToElement(finish.State, ActivityJsonDefaults.Options);
            Assert.Equal("finish", finishState.GetProperty("currentRound").GetProperty("id").GetString());
            Assert.Equal(ActivityPhases.Reveal, finishState.GetProperty("phase").GetString());
            Assert.True(finishState.GetProperty("adventureTerminal").GetBoolean());
            var ended = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken);
            Assert.True(ended.Success, ended.Error);
            Assert.Equal(ActivityPhases.FinalResults, JsonSerializer.SerializeToElement(ended.State, ActivityJsonDefaults.Options).GetProperty("phase").GetString());
        }
    }

    [Fact]
    public async Task AdventureTypedNodesRunThroughTheSharedAuthoritativeReducer()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Typed Animal Adventure", ActivityTypes.PhysicalRoom, Config: JsonDocument.Parse("""
                {"title":"Typed Animal Adventure","adventure":true,"rounds":[
                  {"id":"scene","nodeType":"scene","title":"The trailhead","nextTarget":"poll"},
                  {"id":"poll","nodeType":"poll","title":"Choose a route","choices":["River","Ridge"],"branches":{"0":"quiz","1":"end"}},
                  {"id":"quiz","nodeType":"quiz","title":"Animal clue","choices":["Otter","Owl"],"correctIndex":0,"branches":{"0":"random","1":"random"}},
                  {"id":"random","nodeType":"random","title":"Wind in the trees","randomTargets":["score"]},
                  {"id":"score","nodeType":"score","title":"Bonus cache","scoreDelta":100,"scoreTarget":"allTeams","nextTarget":"inventory"},
                  {"id":"inventory","nodeType":"inventory","title":"Found badge","inventoryKey":"badge","inventoryValue":"moon badge","nextTarget":"condition"},
                  {"id":"condition","nodeType":"condition","title":"A locked gate","conditionKey":"badge","conditionEquals":"moon badge","trueTarget":"end","falseTarget":"end"},
                  {"id":"end","nodeType":"end","title":"Safari celebration"}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            await sessions.SetTeamsAsync(run.Id, [new ActivityTeamInput("Explorers"), new ActivityTeamInput("Trackers")], TestContext.Current.CancellationToken);
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Explorer"), TestContext.Current.CancellationToken);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken)).Success);
            var scene = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvenode"), TestContext.Current.CancellationToken);
            Assert.True(scene.Success, scene.Error);
            Assert.Equal("poll", JsonSerializer.SerializeToElement(scene.State, ActivityJsonDefaults.Options).GetProperty("currentRound").GetProperty("id").GetString());

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openchoices"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(player.Token, "choose", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvechoice", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken)).Success);

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "openchoices"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(player.Token, "choose", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken)).Success);
            var quiz = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvechoice", JsonDocument.Parse("""{"choiceIndex":0}""").RootElement), TestContext.Current.CancellationToken);
            Assert.True(quiz.Success, quiz.Error);
            Assert.Equal("random", JsonSerializer.SerializeToElement(quiz.State, ActivityJsonDefaults.Options).GetProperty("currentRound").GetProperty("id").GetString());

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvenode"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvenode"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvenode"), TestContext.Current.CancellationToken)).Success);
            var condition = await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "resolvenode"), TestContext.Current.CancellationToken);
            Assert.True(condition.Success, condition.Error);
            var conditionState = JsonSerializer.SerializeToElement(condition.State, ActivityJsonDefaults.Options);
            Assert.Equal("end", conditionState.GetProperty("currentRound").GetProperty("id").GetString());
            Assert.Equal(ActivityPhases.Reveal, conditionState.GetProperty("phase").GetString());

            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("adventureScoreDelta", JsonSerializer.Serialize(host!.State, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
            Assert.Contains("100", JsonSerializer.Serialize(host.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.Ordinal);
            var display = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var publicJson = JsonSerializer.Serialize(display, ActivityJsonDefaults.Options);
            Assert.DoesNotContain("correctIndex", publicJson, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("scoreTarget", publicJson, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("conditionKey", publicJson, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("randomTargets", publicJson, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task TelephoneDrawCarriesTheChainFromDrawingToDescriptionToReplay()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Telephone Draw", ActivityTypes.Drawing, Config: JsonDocument.Parse("""
                {"title":"Telephone Draw","telephoneChain":true,"requireModeration":false,"chainSteps":[{"kind":"drawing","label":"Draw it","prompt":"Draw the animal.","phrase":"A dancing penguin"},{"kind":"description","label":"Describe it","prompt":"Describe what you see."},{"kind":"drawing","label":"Redraw it","prompt":"Draw the description."}]}
                """).RootElement), "teacher", TestContext.Current.CancellationToken);
            var run = await sessions.EnsureInteractiveRunAsync(await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Artist"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            var strokes = """{"strokes":[{"points":[[0.1,0.1],[0.9,0.9]]}]}""";
            var drawingSubmission = await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(player.Token, "draw", JsonDocument.Parse(strokes).RootElement), TestContext.Current.CancellationToken);
            Assert.True(drawingSubmission.Success, drawingSubmission.Error);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "nextstep"), TestContext.Current.CancellationToken)).Success);
            var descriptionView = await sessions.GetParticipantViewAsync(run.Id, player.Token, TestContext.Current.CancellationToken);
            var descriptionJson = JsonSerializer.Serialize(descriptionView!.State, ActivityJsonDefaults.Options);
            Assert.Contains("telephoneSourceStrokes", descriptionJson, StringComparison.Ordinal);
            Assert.Contains("Describe it", descriptionJson, StringComparison.Ordinal);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(player.Token, "submit", JsonDocument.Parse("""{"text":"A penguin dancing in the snow"}""").RootElement), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var replay = await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken);
            var replayJson = JsonSerializer.Serialize(replay!.State, ActivityJsonDefaults.Options);
            Assert.Contains("telephoneChain", replayJson, StringComparison.Ordinal);
            Assert.Contains("A penguin dancing in the snow", replayJson, StringComparison.Ordinal);
        }
    }
}
