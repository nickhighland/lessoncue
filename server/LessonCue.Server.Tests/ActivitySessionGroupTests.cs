using System.Text.Json;
using LessonCue.Server.Activities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// A lesson is one lobby. Players join once, keep who they are, and keep their
/// score as the lesson moves from one game to the next.
/// </summary>
public sealed class ActivitySessionGroupTests
{
    private sealed class NullClientProxy : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class NullHubClients : IHubClients
    {
        public IClientProxy All => new NullClientProxy();
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => new NullClientProxy();
        public IClientProxy Client(string connectionId) => new NullClientProxy();
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => new NullClientProxy();
        public IClientProxy Group(string groupName) => new NullClientProxy();
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => new NullClientProxy();
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => new NullClientProxy();
        public IClientProxy User(string userId) => new NullClientProxy();
        public IClientProxy Users(IReadOnlyList<string> userIds) => new NullClientProxy();
    }

    private sealed class NullHubContext : IHubContext<ActivityHub>
    {
        public IHubClients Clients => new NullHubClients();
        public IGroupManager Groups => new NullGroupManager();
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

    /// <summary>A shortener that is holding the reserved codes and answering.</summary>
    private sealed class RunningShortener : IReservedCodeSource
    {
        public bool ReservedCodesUsable { get; set; } = true;
    }

    private static async Task<(LessonCueDb Db, ActivityService Activities, ActivitySessionService Sessions, SqliteConnection Connection, string DataPath)> CreateAsync(
        IReservedCodeSource? shortener = null)
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);
        var dataPath = Path.Combine(Path.GetTempPath(), $"lessoncue-group-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dataPath);
        var httpPort = new HttpPortService(dataPath, 80, NullLogger<HttpPortService>.Instance);
        var localAddress = new LocalAddressService(dataPath, 80, NullLogger<LocalAddressService>.Instance);
        var tunnel = new CloudflareTunnelService(dataPath, httpPort, new TestHttpClientFactory(), NullLogger<CloudflareTunnelService>.Instance);
        var joinAddress = new ActivityJoinAddressService(dataPath, localAddress, tunnel, httpPort);
        return (db,
            new ActivityService(db, new DeterministicRandomSource(7), new NullHubContext()),
            new ActivitySessionService(db, new NullHubContext(), new DeterministicRandomSource(7), joinAddress, shortener),
            connection, dataPath);
    }

    /// <summary>A real lesson row: the session group keys off a genuine lesson.</summary>
    private static async Task<Guid> NewLessonAsync(LessonCueDb db, string title)
    {
        var lessonClass = new LessonClass { Id = Guid.NewGuid(), Name = $"Class {Guid.NewGuid():N}" };
        db.Classes.Add(lessonClass);
        var lesson = new Lesson
        {
            Id = Guid.NewGuid(),
            ClassId = lessonClass.Id,
            Title = title,
            Date = DateOnly.FromDateTime(DateTime.UtcNow),
        };
        db.Lessons.Add(lesson);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return lesson.Id;
    }

    private static JsonElement Quiz(string title) => JsonDocument.Parse($$"""
        {"title":"{{title}}","questions":[{"id":"q1","prompt":"Pick one","options":["A","B"],"correctIndex":1,"points":100}]}
        """).RootElement;

    private static async Task<ActivityRun> StartGameAsync(
        ActivityService activities, ActivitySessionService sessions, Guid lessonId, string title)
    {
        var definition = await activities.CreateDefinitionAsync(
            new ActivityDefinitionInput(title, ActivityTypes.Trivia, Config: Quiz(title)),
            "teacher", TestContext.Current.CancellationToken);
        var run = await activities.GetOrCreateRunAsync(definition.Id, lessonId, ct: TestContext.Current.CancellationToken);
        return await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task WithTheShortenerRunningAGameTakesAReservedCode()
    {
        // The four-character codes are the ones the short domain can resolve.
        // Until this test existed the session service was only ever built
        // without a shortener, so nothing checked that a game used them at all.
        var (db, activities, sessions, connection, dataPath) = await CreateAsync(new RunningShortener());
        await using (connection)
        await using (db)
        {
            var run = await StartGameAsync(activities, sessions, await NewLessonAsync(db, "Reserved Lesson"), "Reserved Game");

            Assert.Equal(4, run.JoinCode!.Length);
            Assert.True(ReservedGameCodes.IsReserved(run.JoinCode));
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task WithoutTheShortenerAGameNeverTakesAReservedCode()
    {
        // A four-character code on a wall the shortener cannot resolve is a
        // dead address. Six characters on LessonCue's own host always works.
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var run = await StartGameAsync(activities, sessions, await NewLessonAsync(db, "Plain Lesson"), "Plain Game");

            Assert.Equal(6, run.JoinCode!.Length);
            Assert.False(ReservedGameCodes.IsReserved(run.JoinCode));
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task ReservedCodesComeBackWhenTheLobbyIsDoneWithThem()
    {
        // A hundred codes is plenty, but only if finished lobbies give theirs
        // up. Otherwise the hundred-and-first game silently drops to six
        // characters and the short domain stops being used at all.
        var (db, activities, sessions, connection, dataPath) = await CreateAsync(new RunningShortener());
        await using (connection)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var first = await StartGameAsync(activities, sessions, await NewLessonAsync(db, "First Lesson"), "First Game");
            var taken = first.JoinCode!;

            var pool = new ReservedGameCodePool(db, new DeterministicRandomSource(7));
            Assert.Contains(taken, await pool.InUseAsync(ct));
            Assert.DoesNotContain(taken, await pool.AvailableAsync(ct));

            // Finish the game and let the lobby go idle, the way a room does.
            var group = await db.ActivitySessionGroups.SingleAsync(x => x.JoinCode == taken, ct);
            foreach (var item in await db.ActivityRuns.Where(x => x.SessionGroupId == group.Id).ToListAsync(ct))
            {
                item.Status = ActivityRunStatuses.Ended;
                item.EndedAt = DateTimeOffset.UtcNow.AddHours(-3);
            }
            group.UpdatedAt = DateTimeOffset.UtcNow.AddHours(-3);
            await db.SaveChangesAsync(ct);

            // A later game asks for a code, which is what reclaims dormant ones.
            var second = await StartGameAsync(activities, sessions, await NewLessonAsync(db, "Second Lesson"), "Second Game");

            Assert.Equal(4, second.JoinCode!.Length);
            Assert.True(ReservedGameCodes.IsReserved(second.JoinCode));
            Assert.DoesNotContain(taken, await pool.InUseAsync(ct));
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task ASecondGameInTheSameLessonKeepsTheReservedCode()
    {
        // Players are already looking at it. Rotating between games would send
        // the room to a code nobody has, and burn a second reserved code.
        var (db, activities, sessions, connection, dataPath) = await CreateAsync(new RunningShortener());
        await using (connection)
        await using (db)
        {
            var lessonId = await NewLessonAsync(db, "Back To Back");
            var first = await StartGameAsync(activities, sessions, lessonId, "Game One");
            var second = await StartGameAsync(activities, sessions, lessonId, "Game Two");

            Assert.True(ReservedGameCodes.IsReserved(first.JoinCode!));
            Assert.Equal(first.JoinCode, second.JoinCode);

            var pool = new ReservedGameCodePool(db, new DeterministicRandomSource(7));
            var inUse = await pool.InUseAsync(TestContext.Current.CancellationToken);
            Assert.Single(inUse.Where(code => code == first.JoinCode));
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task ALessonSharesOneJoinCodeAcrossItsGames()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var lessonId = await NewLessonAsync(db, "Lesson One");
            var first = await StartGameAsync(activities, sessions, lessonId, "Game One");
            var second = await StartGameAsync(activities, sessions, lessonId, "Game Two");

            Assert.False(string.IsNullOrWhiteSpace(first.JoinCode));
            // The whole point: one code for the room, not one per game.
            Assert.Equal(first.JoinCode, second.JoinCode);
            Assert.Equal(first.SessionGroupId, second.SessionGroupId);

            // A different lesson is a different room.
            var other = await StartGameAsync(activities, sessions, await NewLessonAsync(db, "Lesson Two"), "Other Lesson");
            Assert.NotEqual(first.JoinCode, other.JoinCode);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task TheCodeFollowsTheLessonIntoTheNextGame()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var lessonId = await NewLessonAsync(db, "Lesson");
            var first = await StartGameAsync(activities, sessions, lessonId, "Game One");
            var code = first.JoinCode!;

            var second = await StartGameAsync(activities, sessions, lessonId, "Game Two");

            // A phone holding the original code lands in the game now running,
            // rather than being stranded in the finished one.
            var resolved = await sessions.FindByJoinCodeAsync(code, TestContext.Current.CancellationToken);
            Assert.NotNull(resolved);
            Assert.Equal(second.Id, resolved!.Id);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task APlayerKeepsTheirIdentityAndScoreAcrossGames()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var lessonId = await NewLessonAsync(db, "Score Lesson");
            var first = await StartGameAsync(activities, sessions, lessonId, "Game One");
            var code = first.JoinCode!;

            var joined = await sessions.JoinAsync(code,
                new ActivityParticipantJoinInput(null, "Alex", "\U0001F98A", "#4ecdc4"),
                TestContext.Current.CancellationToken);
            Assert.Null(joined.Error);
            var token = joined.Token;
            var participantId = joined.Participant!.Id;

            // Score a point in the first game.
            await sessions.ExecuteHostActionAsync(first.Id, new ActivityCommandEnvelope(null, null, "start"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(first.Id, new ActivityCommandEnvelope(null, null, "open"), TestContext.Current.CancellationToken);
            await sessions.ExecuteParticipantActionAsync(first.Id,
                new ActivityParticipantActionInput(token, "answer", JsonDocument.Parse("{\"optionIndex\":1}").RootElement),
                TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(first.Id, new ActivityCommandEnvelope(null, null, "lock"), TestContext.Current.CancellationToken);
            await sessions.ExecuteHostActionAsync(first.Id, new ActivityCommandEnvelope(null, null, "reveal"), TestContext.Current.CancellationToken);

            var earned = await db.ActivityScoreEvents.Where(x => x.ParticipantId == participantId && !x.IsUndone)
                .SumAsync(x => x.Amount, TestContext.Current.CancellationToken);
            Assert.True(earned > 0, "the first game should have scored");

            // Next game in the same lesson: same phone, same person.
            var second = await StartGameAsync(activities, sessions, lessonId, "Game Two");
            var rejoined = await sessions.JoinAsync(code,
                new ActivityParticipantJoinInput(token, null), TestContext.Current.CancellationToken);
            Assert.Null(rejoined.Error);
            Assert.Equal(participantId, rejoined.Participant!.Id);
            Assert.Equal("Alex", rejoined.Participant!.DisplayName);
            Assert.Equal("\U0001F98A", rejoined.Participant!.Avatar);

            // And the score they already earned is still theirs.
            var host = await sessions.GetHostViewAsync(second.Id, TestContext.Current.CancellationToken);
            Assert.NotNull(host);
            Assert.Single(host!.Participants);
            var carried = JsonSerializer.Serialize(host.ScoreEvents);
            Assert.Contains(participantId.ToString(), carried);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task RenamingKeepsTheSamePlayerRatherThanForkingThem()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var lessonId = await NewLessonAsync(db, "Lesson");
            var run = await StartGameAsync(activities, sessions, lessonId, "Rename Game");

            var joined = await sessions.JoinAsync(run.JoinCode!,
                new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            var renamed = await sessions.JoinAsync(run.JoinCode!,
                new ActivityParticipantJoinInput(joined.Token, "Alexandra", "\U0001F419", "#f472b6"),
                TestContext.Current.CancellationToken);

            Assert.Equal(joined.Participant!.Id, renamed.Participant!.Id);
            Assert.Equal("Alexandra", renamed.Participant!.DisplayName);
            Assert.Equal("\U0001F419", renamed.Participant!.Avatar);

            var roster = await db.ActivityParticipants
                .Where(x => x.SessionGroupId == run.SessionGroupId)
                .CountAsync(TestContext.Current.CancellationToken);
            Assert.Equal(1, roster);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task AnAdHocRunWithoutALessonStillGetsItsOwnLobby()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var definition = await activities.CreateDefinitionAsync(
                new ActivityDefinitionInput("Ad Hoc", ActivityTypes.Trivia, Config: Quiz("Ad Hoc")),
                "teacher", TestContext.Current.CancellationToken);
            var run = await activities.GetOrCreateRunAsync(definition.Id, ct: TestContext.Current.CancellationToken);
            run = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);

            Assert.NotNull(run.SessionGroupId);
            Assert.False(string.IsNullOrWhiteSpace(run.JoinCode));
            var resolved = await sessions.FindByJoinCodeAsync(run.JoinCode!, TestContext.Current.CancellationToken);
            Assert.Equal(run.Id, resolved!.Id);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task AJoinCodeStopsResolvingAfterTwoHoursOfInactivity()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var lessonId = await NewLessonAsync(db, "Expiring lesson");
            var first = await StartGameAsync(activities, sessions, lessonId, "Expiring game");
            var code = first.JoinCode!;
            var old = DateTimeOffset.UtcNow.AddHours(-2).AddSeconds(-1);
            var storedRun = await db.ActivityRuns.SingleAsync(x => x.Id == first.Id, TestContext.Current.CancellationToken);
            var group = await db.ActivitySessionGroups.SingleAsync(x => x.Id == first.SessionGroupId, TestContext.Current.CancellationToken);
            storedRun.UpdatedAt = old;
            group.UpdatedAt = old;
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);

            Assert.Null(await sessions.FindByJoinCodeAsync(code, TestContext.Current.CancellationToken));

            var replacement = await activities.GetOrCreateRunAsync(first.ActivityDefinitionId, lessonId,
                ct: TestContext.Current.CancellationToken);
            replacement = await sessions.EnsureInteractiveRunAsync(replacement, TestContext.Current.CancellationToken);
            Assert.NotEqual(first.Id, replacement.Id);
            Assert.NotEqual(code, replacement.JoinCode);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task LegacyFiveDigitCodesAreRejectedAndRotated()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var run = await StartGameAsync(activities, sessions, await NewLessonAsync(db, "Legacy lesson"), "Legacy game");
            var group = await db.ActivitySessionGroups.SingleAsync(x => x.Id == run.SessionGroupId, TestContext.Current.CancellationToken);
            group.JoinCode = "12345";
            var storedRun = await db.ActivityRuns.SingleAsync(x => x.Id == run.Id, TestContext.Current.CancellationToken);
            storedRun.JoinCode = "12345";
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);

            Assert.Null(await sessions.FindByJoinCodeAsync("12345", TestContext.Current.CancellationToken));
            var refreshed = await sessions.EnsureInteractiveRunAsync(run, TestContext.Current.CancellationToken);
            Assert.NotEqual("12345", refreshed.JoinCode);
            Assert.Equal(6, refreshed.JoinCode!.Length);
        }
        Directory.Delete(dataPath, true);
    }

    [Fact]
    public async Task HostCanLockUnlockAndResetThePlayerLobby()
    {
        var (db, activities, sessions, connection, dataPath) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var run = await StartGameAsync(activities, sessions, await NewLessonAsync(db, "Player controls"), "Player controls game");
            var joined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(null, "Alex"), TestContext.Current.CancellationToken);
            var participant = joined.Participant!;
            var payload = JsonDocument.Parse($"{{\"participantId\":\"{participant.Id}\"}}").RootElement;

            var locked = await sessions.ExecuteHostActionAsync(run.Id,
                new ActivityCommandEnvelope(null, null, "lockparticipant", payload), TestContext.Current.CancellationToken);
            Assert.True(locked.Success);
            var lockedView = await sessions.GetParticipantViewAsync(run.Id, joined.Token, TestContext.Current.CancellationToken);
            Assert.Equal(ActivityParticipantStatuses.Locked, lockedView!.Status);
            Assert.False(lockedView.CanRespond);
            var blocked = await sessions.ExecuteParticipantActionAsync(run.Id,
                new ActivityParticipantActionInput(joined.Token, "answer", JsonDocument.Parse("{\"optionIndex\":0}").RootElement),
                TestContext.Current.CancellationToken);
            Assert.False(blocked.Success);

            var unlocked = await sessions.ExecuteHostActionAsync(run.Id,
                new ActivityCommandEnvelope(null, null, "unlockparticipant", payload), TestContext.Current.CancellationToken);
            Assert.True(unlocked.Success);
            var rejoined = await sessions.JoinAsync(run.JoinCode!, new ActivityParticipantJoinInput(joined.Token, null), TestContext.Current.CancellationToken);
            Assert.Null(rejoined.Error);
            Assert.Equal(participant.Id, rejoined.Participant!.Id);

            var oldCode = run.JoinCode!;
            var reset = await sessions.ExecuteHostActionAsync(run.Id,
                new ActivityCommandEnvelope(null, null, "resetplayers"), TestContext.Current.CancellationToken);
            Assert.True(reset.Success);
            var host = await sessions.GetHostViewAsync(run.Id, TestContext.Current.CancellationToken);
            Assert.NotEqual(oldCode, host!.JoinCode);
            Assert.Null(await sessions.FindByJoinCodeAsync(oldCode, TestContext.Current.CancellationToken));
            var joinedAgain = await sessions.JoinAsync(host.JoinCode!, new ActivityParticipantJoinInput(joined.Token, "Alex"), TestContext.Current.CancellationToken);
            Assert.Null(joinedAgain.Error);
            Assert.NotEqual(participant.Id, joinedAgain.Participant!.Id);
        }
        Directory.Delete(dataPath, true);
    }
}
