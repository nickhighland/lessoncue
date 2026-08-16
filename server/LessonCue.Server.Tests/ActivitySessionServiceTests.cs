using System.Text.Json;
using LessonCue.Server.Activities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
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

    private static async Task<(LessonCueDb Db, ActivityService Activities, ActivitySessionService Sessions, SqliteConnection Connection)> CreateAsync()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);
        var activities = new ActivityService(db, new DeterministicRandomSource(12), new NullHubContext());
        var sessions = new ActivitySessionService(db, new NullHubContext(), new DeterministicRandomSource(12));
        return (db, activities, sessions, connection);
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
    public async Task DrawingSubmissionsStayPrivateUntilApprovedAndTheRoomCanVoteOnTheGallery()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput("Doodle", ActivityTypes.Drawing, Config: JsonDocument.Parse("""
                {"title":"Doodle","prompts":[{"id":"p1","prompt":"Draw a tree","points":75}],"requireModeration":true}
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
            Assert.True((await sessions.ExecuteParticipantActionAsync(run.Id, new ActivityParticipantActionInput(voter.Token, "vote", JsonDocument.Parse($"{{\"targetId\":\"{submissionId}\"}}").RootElement), TestContext.Current.CancellationToken)).Success);
            await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.Contains("\"amount\":75", JsonSerializer.Serialize(host!.ScoreEvents, ActivityJsonDefaults.Options), StringComparison.OrdinalIgnoreCase);
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

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "randomize"), TestContext.Current.CancellationToken)).Success);
            var randomized = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal(4, randomized.GetProperty("currentRound").GetProperty("choices").GetArrayLength());
            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken)).Success);
            var revealed = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.True(revealed.GetProperty("revealed").GetBoolean());

            Assert.True((await sessions.ExecuteHostActionAsync(run.Id, new ActivityCommandEnvelope(null, null, "next"), TestContext.Current.CancellationToken)).Success);
            var secondRound = JsonSerializer.SerializeToElement((await sessions.GetDisplayEnvelopeAsync(run.Id, TestContext.Current.CancellationToken))!.State, ActivityJsonDefaults.Options);
            Assert.Equal(1, secondRound.GetProperty("currentRoundIndex").GetInt32());
            Assert.Equal("ready", secondRound.GetProperty("challengeStatus").GetString());
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
}
