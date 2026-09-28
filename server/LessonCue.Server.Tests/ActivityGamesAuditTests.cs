using System.Text.Json;
using LessonCue.Server.Activities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// Regressions for the games/activities audit of 2026-09-28
/// (docs/activities-games-audit-2026-09-28.md). Each test names the finding it
/// pins so a failure points straight at the write-up.
/// </summary>
public sealed class ActivityGamesAuditTests
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
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-audit-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dataPath);
        var httpPort = new HttpPortService(dataPath, 80, NullLogger<HttpPortService>.Instance);
        var localAddress = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
        var tunnel = new CloudflareTunnelService(dataPath, httpPort, new TestHttpClientFactory(), NullLogger<CloudflareTunnelService>.Instance);
        var joinAddress = new ActivityJoinAddressService(dataPath, localAddress, tunnel, httpPort);
        return (db,
            new ActivityService(db, new DeterministicRandomSource(12), new NullHubContext()),
            new ActivitySessionService(db, new NullHubContext(), new DeterministicRandomSource(12), joinAddress),
            connection);
    }

    private static async Task<Guid> NewLessonAsync(LessonCueDb db)
    {
        var lessonClass = new LessonClass { Id = Guid.NewGuid(), Name = $"Class {Guid.NewGuid():N}" };
        db.Classes.Add(lessonClass);
        var lesson = new Lesson { Id = Guid.NewGuid(), ClassId = lessonClass.Id, Title = "Audit lesson", Date = DateOnly.FromDateTime(DateTime.UtcNow) };
        db.Lessons.Add(lesson);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return lesson.Id;
    }

    private static async Task<ActivityRun> LaunchAsync(ActivityService activities, ActivitySessionService sessions, string type, object config, Guid? lessonId = null)
    {
        var ct = TestContext.Current.CancellationToken;
        var definition = await activities.CreateDefinitionAsync(new ActivityDefinitionInput(
            $"Audit {type}", type, Config: JsonSerializer.SerializeToElement(config)), "teacher", ct);
        var run = await activities.GetOrCreateRunAsync(definition.Id, lessonId, ct: ct);
        return await sessions.EnsureInteractiveRunAsync(run, ct);
    }

    private static async Task<ActivityCommandResult> HostAsync(ActivitySessionService sessions, Guid runId, string action, object? payload = null) =>
        await sessions.ExecuteHostActionAsync(runId, new ActivityCommandEnvelope(null, null, action,
            payload is null ? null : JsonSerializer.SerializeToElement(payload)), TestContext.Current.CancellationToken);

    private static async Task<ActivityCommandResult> PlayAsync(ActivitySessionService sessions, Guid runId, string token, string action, object? payload = null) =>
        await sessions.ExecuteParticipantActionAsync(runId, new ActivityParticipantActionInput(token, action,
            payload is null ? null : JsonSerializer.SerializeToElement(payload)), TestContext.Current.CancellationToken);

    private static JsonElement StateOf(ActivityStateEnvelope envelope) =>
        JsonSerializer.SerializeToElement(envelope.State, ActivityJsonDefaults.Options);

    private static JsonElement ConfigOf(ActivityStateEnvelope envelope) =>
        JsonSerializer.SerializeToElement(envelope.Config, ActivityJsonDefaults.Options);

    private static string IdOf(object row) => row.GetType().GetProperty("id")!.GetValue(row)!.ToString()!;

    // AUD-01: /reset belonged to one game but deleted the whole lobby's score
    // ledger and quietly re-admitted players the host had removed or locked.
    [Fact]
    public async Task ResettingOneGameKeepsTheLessonsOtherScoresAndModeration()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var lessonId = await NewLessonAsync(db);
            var quiz = new { title = "Quiz", autoPilot = false, questions = new[] { new { id = "q1", prompt = "Pick B", options = new[] { "A", "B" }, correctIndex = 1, points = 100 } } };
            var first = await LaunchAsync(activities, sessions, ActivityTypes.Trivia, quiz, lessonId);
            var ana = await sessions.JoinAsync(first.JoinCode!, new ActivityParticipantJoinInput(null, "Ana"), ct);
            var ben = await sessions.JoinAsync(first.JoinCode!, new ActivityParticipantJoinInput(null, "Ben"), ct);
            var cam = await sessions.JoinAsync(first.JoinCode!, new ActivityParticipantJoinInput(null, "Cam"), ct);
            Assert.True((await HostAsync(sessions, first.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, first.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, first.Id, ana.Token, "answer", new { optionIndex = 1 })).Success);
            Assert.True((await HostAsync(sessions, first.Id, "reveal")).Success);
            Assert.True((await HostAsync(sessions, first.Id, "removeparticipant", new { participantId = ben.Participant!.Id })).Success);
            Assert.True((await HostAsync(sessions, first.Id, "lockparticipant", new { participantId = cam.Participant!.Id })).Success);

            var second = await LaunchAsync(activities, sessions, ActivityTypes.Trivia, quiz, lessonId);
            Assert.Equal(first.SessionGroupId, second.SessionGroupId);
            Assert.NotNull(await sessions.ResetAsync(second.Id, ct));

            Assert.Equal(100, await db.ActivityScoreEvents.Where(x => x.ActivityRunId == first.Id && !x.IsUndone).SumAsync(x => x.Amount, ct));
            db.ChangeTracker.Clear();
            Assert.Equal(ActivityParticipantStatuses.Removed, (await db.ActivityParticipants.SingleAsync(x => x.Id == ben.Participant.Id, ct)).Status);
            Assert.Equal(ActivityParticipantStatuses.Locked, (await db.ActivityParticipants.SingleAsync(x => x.Id == cam.Participant.Id, ct)).Status);
        }
    }

    // AUD-02: the truth was always the last option and its id was literally
    // "truth", so a phone could vote for it without reading anything.
    [Fact]
    public async Task FakeOutVotingDoesNotRevealWhichOptionIsTheTruth()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.FakeOut, new
            {
                title = "Fake Out", autoPilot = false, requireModeration = false, truthPoints = 100, bluffPoints = 50,
                rounds = new[] { new { id = "r1", prompt = "Which is true?", truth = "Honey never spoils." } }
            });
            var writerOne = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Writer One"), ct);
            var writerTwo = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Writer Two"), ct);
            var finder = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Finder"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, writerOne.Token, "submit", new { text = "Honey spoils in a week." })).Success);
            Assert.True((await PlayAsync(sessions, run.Id, writerTwo.Token, "submit", new { text = "Honey is a vegetable." })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "openvoting")).Success);

            var display = StateOf((await sessions.GetDisplayEnvelopeAsync(run.Id, ct))!);
            var phone = StateOf((await sessions.GetParticipantViewAsync(run.Id, finder.Token, ct))!.State);
            foreach (var projected in new[] { display, phone })
            {
                var options = projected.GetProperty("options").EnumerateArray().ToArray();
                Assert.Equal(3, options.Length);
                Assert.DoesNotContain(options, option => string.Equals(option.GetProperty("id").GetString(), "truth", StringComparison.OrdinalIgnoreCase));
                Assert.All(options, option => Assert.True(Guid.TryParse(option.GetProperty("id").GetString(), out _)));
                // Ordered by the opaque id, not by "bluffs first, truth appended".
                var ids = options.Select(option => option.GetProperty("id").GetString()!).ToArray();
                Assert.Equal(ids.OrderBy(id => id, StringComparer.Ordinal), ids);
                Assert.DoesNotContain("truthOptionId", projected.GetRawText(), StringComparison.OrdinalIgnoreCase);
            }

            // Guessing the old literal id no longer scores.
            Assert.False((await PlayAsync(sessions, run.Id, finder.Token, "vote", new { targetId = "truth" })).Success);

            var truthId = display.GetProperty("options").EnumerateArray()
                .Single(option => option.GetProperty("text").GetString() == "Honey never spoils.").GetProperty("id").GetString();
            Assert.True((await PlayAsync(sessions, run.Id, finder.Token, "vote", new { targetId = truthId })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "reveal")).Success);
            Assert.Equal(100, await db.ActivityScoreEvents.Where(x => x.ActivityRunId == run.Id && x.ParticipantId == finder.Participant!.Id).SumAsync(x => x.Amount, ct));
            var revealed = StateOf((await sessions.GetDisplayEnvelopeAsync(run.Id, ct))!);
            Assert.True(revealed.GetProperty("options").EnumerateArray().Single(option => option.GetProperty("id").GetString() == truthId).GetProperty("isTruth").GetBoolean());
        }
    }

    // AUD-03: phones and the TV were handed the items in authoring order, which
    // is the answer for every shipped Order Up style preset.
    [Fact]
    public async Task OrderingNeverPresentsItemsInTheAnswerOrder()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var itemIds = new[] { "item-1", "item-2", "item-3", "item-4", "item-5" };
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Ordering, new
            {
                title = "Timeline", autoPilot = false,
                rounds = new[] { new { id = "round-1", prompt = "Put these in order", items = itemIds.Select(id => new { id, label = id }).ToArray(), correctOrder = itemIds, points = 100 } }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Sorter"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);

            string[] PresentedOrder(ActivityStateEnvelope envelope) => ConfigOf(envelope).GetProperty("rounds")[0].GetProperty("items")
                .EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray();
            var onTv = PresentedOrder((await sessions.GetDisplayEnvelopeAsync(run.Id, ct))!);
            var onPhone = PresentedOrder((await sessions.GetParticipantViewAsync(run.Id, player.Token, ct))!.State);
            Assert.NotEqual(itemIds, onTv);
            Assert.Equal(itemIds.OrderBy(id => id), onTv.OrderBy(id => id));
            // Stable between polls, or a phone would lose the player's arrangement.
            Assert.Equal(onTv, onPhone);
            Assert.Equal(onTv, PresentedOrder((await sessions.GetDisplayEnvelopeAsync(run.Id, ct))!));
        }
    }

    [Fact]
    public async Task ConnectionsNeverPresentsCluesInTheirGroupOrder()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var itemIds = new[] { "item-1", "item-2", "item-3", "item-4", "item-5", "item-6" };
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Ordering, new
            {
                title = "Connections", autoPilot = false, interactionMode = "grouping",
                rounds = new[]
                {
                    new
                    {
                        id = "round-1", prompt = "Group these",
                        items = itemIds.Select(id => new { id, label = id }).ToArray(),
                        groups = new[]
                        {
                            new { id = "group-1", label = "Cats", itemIds = new[] { "item-1", "item-2" } },
                            new { id = "group-2", label = "Birds", itemIds = new[] { "item-3", "item-4" } },
                            new { id = "group-3", label = "Horses", itemIds = new[] { "item-5", "item-6" } }
                        },
                        points = 100
                    }
                }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Grouper"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);

            var phone = StateOf((await sessions.GetParticipantViewAsync(run.Id, player.Token, ct))!.State);
            var presented = phone.GetProperty("groupingItems").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray();
            Assert.NotEqual(itemIds, presented);
            Assert.Equal(itemIds, presented.OrderBy(id => id));
            var config = ConfigOf((await sessions.GetDisplayEnvelopeAsync(run.Id, ct))!);
            Assert.Equal(presented, config.GetProperty("rounds")[0].GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray());
        }
    }

    // AUD-04: autonomy (on by default) opens later Rapid Fire questions with
    // "open", which never armed the question timer, so every answer bounced.
    [Fact]
    public async Task RapidFireQuestionsAfterTheFirstAcceptAnswersWhenOpened()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.RapidFire, new
            {
                title = "Rapid Fire",
                questions = new[]
                {
                    new { id = "q1", prompt = "Pick B", options = new[] { "A", "B" }, correctIndex = 1, points = 100, timerSeconds = 20 },
                    new { id = "q2", prompt = "Pick A", options = new[] { "A", "B" }, correctIndex = 0, points = 100, timerSeconds = 45 }
                }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Quick"), ct);
            // A second phone keeps the head-count close from ending the window early.
            await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Slow"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, player.Token, "answer", new { optionIndex = 1 })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "reveal")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "showleaderboard")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "next")).Success);

            // The step the auto-pilot takes from the round intro.
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            var answer = await PlayAsync(sessions, run.Id, player.Token, "answer", new { optionIndex = 0 });
            Assert.True(answer.Success, answer.Error);

            var state = JsonSerializer.SerializeToElement(answer.State, ActivityJsonDefaults.Options);
            Assert.True(state.GetProperty("isRunning").GetBoolean());
            Assert.InRange(state.GetProperty("remainingMs").GetInt32(), 40_000, 45_000);

            // Auto-pilot closes the window on the question's own clock, not its 30-second default.
            var stored = await db.ActivityRuns.AsNoTracking().SingleAsync(x => x.Id == run.Id, ct);
            Assert.NotNull(stored.AutoAdvanceAt);
            Assert.True(stored.AutoAdvanceAt!.Value > DateTimeOffset.UtcNow.AddSeconds(35), $"Auto-advance was due at {stored.AutoAdvanceAt:O}.");
        }
    }

    // AUD-05: elimination was written to the lobby-wide participant, so a
    // Survivor Trivia knockout silenced that phone for every later game.
    [Fact]
    public async Task AQuizEliminationDoesNotFollowThePlayerIntoTheNextGame()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var lessonId = await NewLessonAsync(db);
            var survivor = await LaunchAsync(activities, sessions, ActivityTypes.Trivia, new
            {
                title = "Survivor", autoPilot = false,
                modifiers = new { lives = new { enabled = true, startingLives = 1, eliminateAtZero = true } },
                questions = new[] { new { id = "q1", prompt = "Pick B", options = new[] { "A", "B" }, correctIndex = 1, points = 100 } }
            }, lessonId);
            var player = await sessions.JoinAsync(survivor.JoinCode!, new ActivityParticipantJoinInput(null, "Unlucky"), ct);
            Assert.True((await HostAsync(sessions, survivor.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, survivor.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, survivor.Id, player.Token, "answer", new { optionIndex = 0 })).Success);
            Assert.True((await HostAsync(sessions, survivor.Id, "reveal")).Success);
            Assert.False((await sessions.GetParticipantViewAsync(survivor.Id, player.Token, ct))!.CanRespond);

            var poll = await LaunchAsync(activities, sessions, ActivityTypes.Poll, new
            {
                title = "Poll", autoPilot = false, question = "Which?", options = new[] { "One", "Two" }
            }, lessonId);
            Assert.True((await HostAsync(sessions, poll.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, poll.Id, "open")).Success);
            var view = await sessions.GetParticipantViewAsync(poll.Id, player.Token, ct);
            Assert.NotNull(view);
            Assert.Equal(ActivityParticipantStatuses.Active, view!.Status);
            Assert.True(view.CanRespond);
        }
    }

    // AUD-07: the score ledger's duplicate guard keyed on (player/team, round,
    // reason) swallowed every matched survey answer after the first.
    [Fact]
    public async Task SurveyBoardCreditsEveryAnswerAPlayerMatches()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.SurveyBoard, new
            {
                title = "Survey", autoPilot = false,
                questions = new[] { new { id = "q1", prompt = "Name a warm drink", answers = new[] { new { id = "a1", rank = 1, text = "Tea", points = 60 }, new { id = "a2", rank = 2, text = "Cocoa", points = 40 } } } }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Contestant"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, player.Token, "submit", new { text = "Tea" })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "matchanswer", new { rank = 1 })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "reopen")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, player.Token, "submit", new { text = "Cocoa" })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "matchanswer", new { rank = 2 })).Success);
            // Revealing the same answer again must still not double count.
            Assert.True((await HostAsync(sessions, run.Id, "matchanswer", new { rank = 2 })).Success);

            Assert.Equal(100, await db.ActivityScoreEvents.Where(x => x.ActivityRunId == run.Id && x.ParticipantId == player.Participant!.Id).SumAsync(x => x.Amount, ct));
        }
    }

    // AUD-08: a host pressing "+100 · Team 1" in round 2 was silently ignored
    // because round 1 already had a "Physical room challenge" award.
    [Fact]
    public async Task AHostCanAwardTheSameTeamAgain()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.PhysicalRoom, new
            {
                title = "Four Corners",
                rounds = new[] { new { id = "round-1", title = "Corners", instructions = "Move", choices = new[] { "North", "South" }, seconds = 30 } }
            });
            Assert.True(await sessions.SetTeamsAsync(run.Id, [new ActivityTeamInput("Team 1"), new ActivityTeamInput("Team 2")], ct));
            var host = await sessions.GetHostViewAsync(run.Id, ct);
            var teamId = IdOf(host!.Teams[0]);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "awardpoints", new { teamId, amount = 100, reason = "Physical room challenge" })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "awardpoints", new { teamId, amount = 100, reason = "Physical room challenge" })).Success);

            Assert.Equal(200, await db.ActivityScoreEvents.Where(x => x.ActivityRunId == run.Id && x.TeamId == Guid.Parse(teamId)).SumAsync(x => x.Amount, ct));
            Assert.Equal(200, (await db.ActivityTeams.AsNoTracking().SingleAsync(x => x.Id == Guid.Parse(teamId), ct)).Score);
        }
    }

    // AUD-09: "Clear scores" moved the individual cut-off but left the team
    // counter the team leaderboard reads, so team standings never cleared.
    [Fact]
    public async Task ClearingScoresAlsoClearsTeamStandings()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.PhysicalRoom, new
            {
                title = "Relay",
                rounds = new[] { new { id = "round-1", title = "Relay", instructions = "Run", choices = new[] { "Go" }, seconds = 30 } }
            });
            Assert.True(await sessions.SetTeamsAsync(run.Id, [new ActivityTeamInput("Team 1"), new ActivityTeamInput("Team 2")], ct));
            var teamId = IdOf((await sessions.GetHostViewAsync(run.Id, ct))!.Teams[0]);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "awardpoints", new { teamId, amount = 150 })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "resetscores")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "finish")).Success);

            var standings = StateOf((await sessions.GetDisplayEnvelopeAsync(run.Id, ct))!);
            var team = standings.GetProperty("teamLeaderboard").EnumerateArray().Single(item => item.GetProperty("id").GetString() == teamId);
            Assert.Equal(0, team.GetProperty("score").GetInt32());
        }
    }

    // AUD-10: a participant/team bracket filtered the roster by the run each
    // player first joined through, so a bracket later in a lesson had nobody.
    [Fact]
    public async Task ABracketLaterInTheLessonSeatsPlayersWhoJoinedEarlier()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var lessonId = await NewLessonAsync(db);
            var warmup = await LaunchAsync(activities, sessions, ActivityTypes.Poll, new { title = "Warm-up", autoPilot = false, question = "Ready?", options = new[] { "Yes", "No" } }, lessonId);
            await sessions.JoinAsync(warmup.JoinCode!, new ActivityParticipantJoinInput(null, "Ada"), ct);
            await sessions.JoinAsync(warmup.JoinCode!, new ActivityParticipantJoinInput(null, "Bo"), ct);

            var bracket = await LaunchAsync(activities, sessions, ActivityTypes.Bracket, new { title = "Bracket", autoPilot = false, entrantSource = "participants" }, lessonId);
            var started = await HostAsync(sessions, bracket.Id, "start");
            Assert.True(started.Success, started.Error);
            var entrants = StateOf((await sessions.GetDisplayEnvelopeAsync(bracket.Id, ct))!).GetProperty("bracketEntrants")
                .EnumerateArray().Select(item => item.GetProperty("label").GetString() ?? "").ToArray();
            Assert.Equal(new[] { "Ada", "Bo" }, entrants.Order().ToArray());
        }
    }

    // AUD-11: the speed bonus measured the first submission, so a placeholder
    // answer followed by the real one kept the fastest bonus.
    [Fact]
    public async Task TheSpeedBonusIsMeasuredFromTheFinalAnswer()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Trivia, new
            {
                title = "Speed", autoPilot = false,
                modifiers = new { speedBonus = new { enabled = true, maxPoints = 50, windowSeconds = 20 } },
                questions = new[] { new { id = "q1", prompt = "Pick B", options = new[] { "A", "B" }, correctIndex = 1, points = 100 } }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Hedger"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, player.Token, "answer", new { optionIndex = 0 })).Success);

            // Pretend the placeholder landed the instant the window opened and
            // the real answer comes 25 seconds later, past the bonus window.
            var stored = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, ct);
            var state = System.Text.Json.Nodes.JsonNode.Parse(stored.StateJson)!.AsObject();
            var openedAt = DateTimeOffset.UtcNow.AddSeconds(-25);
            state["responseWindowStartedAt"] = openedAt.ToString("O");
            stored.StateJson = state.ToJsonString();
            var placeholder = await db.ActivitySubmissions.SingleAsync(x => x.ActivityRunId == run.Id, ct);
            placeholder.SubmittedAt = openedAt;
            await db.SaveChangesAsync(ct);

            Assert.True((await PlayAsync(sessions, run.Id, player.Token, "answer", new { optionIndex = 1 })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "reveal")).Success);
            Assert.Equal(100, await db.ActivityScoreEvents.Where(x => x.ActivityRunId == run.Id && x.ParticipantId == player.Participant!.Id).SumAsync(x => x.Amount, ct));
        }
    }

    // AUD-12: Punchline accepted a vote for the voter's own response, unlike
    // Fake Out and Drawing.
    [Fact]
    public async Task PunchlineRefusesAVoteForYourOwnResponse()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Punchline, new
            {
                title = "Punchline", autoPilot = false, requireModeration = false,
                prompts = new[] { new { id = "p1", prompt = "The worst mascot is...", points = 100 } }
            });
            var author = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Author"), ct);
            var other = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Other"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, author.Token, "submit", new { text = "A damp sock" })).Success);
            Assert.True((await PlayAsync(sessions, run.Id, other.Token, "submit", new { text = "A tax form" })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "openvoting")).Success);
            var own = await db.ActivitySubmissions.SingleAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == author.Participant!.Id, ct);

            Assert.False((await PlayAsync(sessions, run.Id, author.Token, "vote", new { targetId = own.Id })).Success);
            Assert.True((await PlayAsync(sessions, run.Id, other.Token, "vote", new { targetId = own.Id })).Success);
        }
    }

    // AUD-13: only the latest miss was locked out; after a second miss the
    // first player could buzz again on the same clue.
    [Fact]
    public async Task EveryPlayerWhoMissesStaysLockedOutForTheClue()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Buzzer, new
            {
                title = "Buzz", autoPilot = false, lockOutOnMiss = true, stealOnMiss = true,
                clues = new[] { new { id = "c1", prompt = "Big ocean", answer = "Pacific", points = 100 } }
            });
            var first = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "First"), ct);
            var second = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Second"), ct);
            await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Third"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, first.Token, "buzz")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "incorrect")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, second.Token, "buzz")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "incorrect")).Success);

            Assert.False((await PlayAsync(sessions, run.Id, first.Token, "buzz")).Success);
            Assert.True(StateOf((await sessions.GetParticipantViewAsync(run.Id, first.Token, ct))!.State).GetProperty("isLockedOut").GetBoolean());
            Assert.DoesNotContain(first.Participant!.Id.ToString(), StateOf((await sessions.GetDisplayEnvelopeAsync(run.Id, ct))!).GetRawText(), StringComparison.OrdinalIgnoreCase);

            // A fresh clue clears every lockout.
            Assert.True((await HostAsync(sessions, run.Id, "reopen")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, first.Token, "buzz")).Success);
        }
    }

    // AUD-14: a payload that was not a JSON object reached TryGetProperty and
    // threw, turning a bad phone request into a 500 and an error log entry.
    [Theory]
    [InlineData("\"not an object\"")]
    [InlineData("[1,2,3]")]
    [InlineData("42")]
    public async Task NonObjectParticipantPayloadsAreRefusedNotThrown(string payload)
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Trivia, new
            {
                title = "Quiz", autoPilot = false,
                questions = new[] { new { id = "q1", prompt = "Pick B", options = new[] { "A", "B" }, correctIndex = 1, points = 100 } }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Fuzzer"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);

            var result = await sessions.ExecuteParticipantActionAsync(run.Id,
                new ActivityParticipantActionInput(player.Token, "answer", JsonDocument.Parse(payload).RootElement), ct);
            Assert.False(result.Success);
            var hostResult = await sessions.ExecuteHostActionAsync(run.Id,
                new ActivityCommandEnvelope(null, null, "awardpoints", JsonDocument.Parse(payload).RootElement), ct);
            Assert.False(hostResult.Success);
        }
    }

    [Theory]
    [InlineData("""{"matches":[1,2]}""")]
    [InlineData("""{"matches":[{"leftId":5,"rightId":"Antarctica"}]}""")]
    public async Task MalformedMatchUpAnswersAreRefusedNotThrown(string payload)
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Ordering, new
            {
                title = "Match-Up", autoPilot = false, interactionMode = "matching",
                rounds = new[] { new { id = "round-1", prompt = "Match", pairs = new[] { new { id = "pair-1", left = "Penguin", right = "Antarctica" }, new { id = "pair-2", left = "Camel", right = "Desert" } }, points = 100 } }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Matcher"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            var result = await sessions.ExecuteParticipantActionAsync(run.Id,
                new ActivityParticipantActionInput(player.Token, "match", JsonDocument.Parse(payload).RootElement), ct);
            Assert.False(result.Success);
        }
    }

    // AUD-15: a telephone description step validated only the text and then
    // stored, and later broadcast, whatever else the phone sent.
    [Fact]
    public async Task TelephoneDescriptionsKeepOnlyTheirText()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Drawing, new
            {
                title = "Telephone", autoPilot = false, requireModeration = false, telephoneChain = true,
                chainSteps = new[] { new { kind = "description", prompt = "Describe a cat" }, new { kind = "drawing", prompt = "Draw it" } }
            });
            var player = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Describer"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            var padding = new string('x', 250_000);
            var sent = await PlayAsync(sessions, run.Id, player.Token, "submit", new
            {
                text = "A fluffy cat",
                padding,
                strokes = new[] { new { points = new[] { new[] { 5.0, 5.0 } }, color = "not-a-colour" } }
            });
            Assert.True(sent.Success, sent.Error);
            var stored = await db.ActivitySubmissions.AsNoTracking().SingleAsync(x => x.ActivityRunId == run.Id, ct);
            using var document = JsonDocument.Parse(stored.PayloadJson);
            Assert.Equal("A fluffy cat", document.RootElement.GetProperty("text").GetString());
            Assert.False(document.RootElement.TryGetProperty("padding", out _));
            Assert.False(document.RootElement.TryGetProperty("strokes", out _));
            Assert.True(stored.PayloadJson.Length < 1_000);
        }
    }

    // AUD-16: a run's JoinCode is only a mirror now, so several ended runs can
    // share a retired code; the legacy lookup used SingleOrDefault and threw.
    [Fact]
    public async Task ARetiredCodeSharedByEndedRunsResolvesToNothingInsteadOfThrowing()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var lessonId = await NewLessonAsync(db);
            var poll = new { title = "Poll", autoPilot = false, question = "Which?", options = new[] { "One", "Two" } };
            var first = await LaunchAsync(activities, sessions, ActivityTypes.Poll, poll, lessonId);
            var second = await LaunchAsync(activities, sessions, ActivityTypes.Poll, poll, lessonId);
            var code = second.JoinCode!;
            Assert.Equal(first.JoinCode, code);
            await sessions.EndAsync(first.Id, ct);
            await sessions.EndAsync(second.Id, ct);
            // What ReleaseDormantCodeAsync does when another lobby needs the code.
            var group = await db.ActivitySessionGroups.SingleAsync(x => x.Id == second.SessionGroupId, ct);
            group.JoinCode = "XRETIRED01";
            await db.SaveChangesAsync(ct);

            Assert.Null(await sessions.FindByJoinCodeAsync(code, ct));
        }
    }

    // AUD-17: engine settings read with GetValue<int>, which throws on 12.5 or
    // "100"; a teacher typing a decimal made the reveal fail with a 500.
    [Fact]
    public async Task ADecimalPointValueDoesNotBreakTheReveal()
    {
        var (db, activities, sessions, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var run = await LaunchAsync(activities, sessions, ActivityTypes.Punchline, new
            {
                title = "Punchline", autoPilot = false, requireModeration = false,
                prompts = new[] { new { id = "p1", prompt = "Finish the joke", points = 12.5 } }
            });
            var author = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Author"), ct);
            var voter = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Voter"), ct);
            Assert.True((await HostAsync(sessions, run.Id, "start")).Success);
            Assert.True((await HostAsync(sessions, run.Id, "open")).Success);
            Assert.True((await PlayAsync(sessions, run.Id, author.Token, "submit", new { text = "Knock knock" })).Success);
            Assert.True((await HostAsync(sessions, run.Id, "openvoting")).Success);
            var submission = await db.ActivitySubmissions.SingleAsync(x => x.ActivityRunId == run.Id, ct);
            Assert.True((await PlayAsync(sessions, run.Id, voter.Token, "vote", new { targetId = submission.Id })).Success);
            var revealed = await HostAsync(sessions, run.Id, "reveal");
            Assert.True(revealed.Success, revealed.Error);
            Assert.Equal(13, await db.ActivityScoreEvents.Where(x => x.ActivityRunId == run.Id).SumAsync(x => x.Amount, ct));
        }
    }
}
