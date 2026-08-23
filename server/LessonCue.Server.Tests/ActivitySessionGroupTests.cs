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

    private static async Task<(LessonCueDb Db, ActivityService Activities, ActivitySessionService Sessions, SqliteConnection Connection, string DataPath)> CreateAsync()
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
            new ActivitySessionService(db, new NullHubContext(), new DeterministicRandomSource(7), joinAddress),
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
}
