using System.Text.Json;
using LessonCue.Server.Activities;
using LessonCue.Server.Activities.Types;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ActivityServiceTests
{
    private sealed class NullClientProxy : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class NullHubClients : IHubClients
    {
        private static readonly IClientProxy ClientProxy = new NullClientProxy();
        public IClientProxy All => ClientProxy;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => ClientProxy;
        public IClientProxy Client(string connectionId) => ClientProxy;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => ClientProxy;
        public IClientProxy Group(string groupName) => ClientProxy;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => ClientProxy;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => ClientProxy;
        public IClientProxy User(string userId) => ClientProxy;
        public IClientProxy Users(IReadOnlyList<string> userIds) => ClientProxy;
    }

    private sealed class NullGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class NullHubContext : IHubContext<ActivityHub>
    {
        public IHubClients Clients { get; } = new NullHubClients();
        public IGroupManager Groups { get; } = new NullGroupManager();
    }

    private static async Task<(LessonCueDb Db, ActivityService Service, SqliteConnection Connection)> CreateTestServiceAsync(
        IActivityRandomSource? randomSource = null)
    {
        var ct = TestContext.Current.CancellationToken;
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(ct);

        var hubContext = new NullHubContext();
        var random = randomSource ?? new DeterministicRandomSource(12345);
        var service = new ActivityService(db, random, hubContext);
        return (db, service, connection);
    }

    [Fact]
    public async Task CanCreateGetUpdateAndDuplicateActivityDefinition()
    {
        var (db, service, conn) = await CreateTestServiceAsync();
        await using (conn)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var input = new ActivityDefinitionInput(
                Name: "High School Wheel",
                Type: ActivityTypes.Wheel,
                Description: "Fun icebreakers for youth"
            );

            var created = await service.CreateDefinitionAsync(input, "test-user", ct);
            Assert.NotNull(created);
            Assert.Equal("High School Wheel", created.Name);
            Assert.Equal(ActivityTypes.Wheel, created.Type);
            Assert.Equal(1, created.Version);

            // Fetch
            var fetched = await service.GetDefinitionAsync(created.Id, ct);
            Assert.NotNull(fetched);
            Assert.Equal(created.Id, fetched.Id);

            // Update
            var updateInput = new ActivityDefinitionInput(
                Name: "Middle School Wheel",
                Type: ActivityTypes.Wheel,
                Description: "Updated description"
            );
            var updated = await service.UpdateDefinitionAsync(created.Id, updateInput, ct);
            Assert.NotNull(updated);
            Assert.Equal("Middle School Wheel", updated.Name);
            Assert.Equal(2, updated.Version);

            // Duplicate
            var duplicated = await service.DuplicateDefinitionAsync(created.Id, "Wheel Copy", "test-user", ct);
            Assert.NotNull(duplicated);
            Assert.NotEqual(created.Id, duplicated.Id);
            Assert.Equal("Wheel Copy", duplicated.Name);
            Assert.Equal(1, duplicated.Version);
        }
    }

    [Fact]
    public async Task UpdateUsesConfigPresetWhenTopLevelPresetIsStale()
    {
        var (db, service, conn) = await CreateTestServiceAsync();
        await using (conn)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var created = await service.CreateDefinitionAsync(new ActivityDefinitionInput(
                Name: "Preset race",
                Type: ActivityTypes.Trivia,
                PresetType: "trivia",
                Config: JsonDocument.Parse("{\"preset\":\"trivia\"}").RootElement
            ), "test-user", ct);

            var updated = await service.UpdateDefinitionAsync(created.Id, new ActivityDefinitionInput(
                Name: created.Name,
                Type: created.Type,
                PresetType: "trivia",
                Config: JsonDocument.Parse("{\"preset\":\"factOrFiction\"}").RootElement
            ), ct);

            Assert.NotNull(updated);
            Assert.Equal("factOrFiction", updated.PresetType);
        }
    }

    [Fact]
    public async Task ActivityLibraryCanReorderBulkDeleteAndRestoreReferencedDefinitions()
    {
        var (db, service, conn) = await CreateTestServiceAsync();
        await using (conn)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var first = await service.CreateDefinitionAsync(new ActivityDefinitionInput("First", ActivityTypes.Wheel), "test-user", ct);
            var second = await service.CreateDefinitionAsync(new ActivityDefinitionInput("Second", ActivityTypes.Wheel), "test-user", ct);
            Assert.True(await service.ReorderDefinitionsAsync([second.Id, first.Id], ct));
            var ordered = await service.ListDefinitionsAsync(ct: ct);
            Assert.Equal(second.Id, ordered[0].Id);

            await service.GetOrCreateRunAsync(second.Id, ct: ct);
            var result = await service.DeleteOrArchiveDefinitionsAsync([first.Id, second.Id, Guid.NewGuid()], ct);
            Assert.Contains(first.Id, result.DeletedIds);
            Assert.Contains(second.Id, result.ArchivedIds);
            Assert.Single(result.MissingIds);
            Assert.True(await service.RestoreDefinitionAsync(second.Id, ct));
            Assert.NotNull(await service.GetDefinitionAsync(second.Id, ct));
        }
    }

    [Fact]
    public async Task ActivityLibraryReportsDependenciesAndSupportsBulkManagement()
    {
        var (db, service, conn) = await CreateTestServiceAsync();
        await using (conn)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var definition = await service.CreateDefinitionAsync(new ActivityDefinitionInput("Review Game", ActivityTypes.Trivia), "teacher", ct);
            var lessonClass = new LessonClass { Name = "Activity Test Class" };
            var lesson = new Lesson
            {
                ClassId = lessonClass.Id,
                Date = new DateOnly(2026, 8, 15),
                Title = "Friday Review"
            };
            lesson.Items.Add(new PlaylistItem
            {
                LessonId = lesson.Id,
                Title = "Review Game Cue",
                Type = "activity",
                ActivityDefinitionId = definition.Id
            });
            var template = new LessonTemplate { Name = "Weekly Review Template" };
            template.Items.Add(new LessonTemplateItem
            {
                TemplateId = template.Id,
                Title = "Template Game Cue",
                Type = "activity",
                ActivityDefinitionId = definition.Id
            });
            db.AddRange(lessonClass, lesson, template);
            await db.SaveChangesAsync(ct);

            var listed = Assert.Single(await service.ListDefinitionsAsync(ct: ct));
            Assert.Equal(1, listed.Usage.LessonCount);
            Assert.Equal(1, listed.Usage.TemplateCount);
            Assert.Contains("Friday Review", listed.Usage.LessonNames);
            Assert.Contains("Weekly Review Template", listed.Usage.TemplateNames);
            Assert.True(listed.Usage.IsInUse);

            var archived = await service.ArchiveDefinitionsAsync([definition.Id], ct);
            Assert.Contains(definition.Id, archived.ArchivedIds);
            var restored = await service.RestoreDefinitionsAsync([definition.Id], ct);
            Assert.Contains(definition.Id, restored.RestoredIds);

            var copies = await service.DuplicateDefinitionsAsync([definition.Id], " — Copy", "teacher", ct);
            var copy = Assert.Single(copies);
            Assert.Equal("Review Game — Copy", copy.Name);
            Assert.False(copy.Usage.IsInUse);
        }
    }

    [Fact]
    public async Task ActivityLibraryCanReturnBoundedPagesWithServerSideSearch()
    {
        var (db, service, conn) = await CreateTestServiceAsync();
        await using (conn)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            await service.CreateDefinitionAsync(new ActivityDefinitionInput("Paged Alpha", ActivityTypes.Trivia, Description: "Large library test"), "teacher", ct);
            await service.CreateDefinitionAsync(new ActivityDefinitionInput("Paged Beta", ActivityTypes.Trivia, Description: "Large library test"), "teacher", ct);
            await service.CreateDefinitionAsync(new ActivityDefinitionInput("Other Activity", ActivityTypes.Trivia), "teacher", ct);

            var firstPage = await service.ListDefinitionsPageAsync(search: "Paged", page: 1, pageSize: 1, ct: ct);
            Assert.Equal(2, firstPage.TotalCount);
            Assert.Single(firstPage.Items);
            Assert.Equal(1, firstPage.Page);
            Assert.Equal(1, firstPage.PageSize);
            var secondPage = await service.ListDefinitionsPageAsync(search: "Paged", page: 2, pageSize: 1, ct: ct);
            Assert.Single(secondPage.Items);
            Assert.NotEqual(firstPage.Items[0].Id, secondPage.Items[0].Id);
        }
    }

    [Fact]
    public async Task WheelReducer_WeightedSelectionAndZeroWeightExcluded()
    {
        var deterministicRandom = new DeterministicRandomSource(42);
        var config = new WheelActivity.Config(
            Title: "Test Wheel",
            Items:
            [
                new WheelActivity.ItemConfig("item-0", "Zero Weight", 0.0),
                new WheelActivity.ItemConfig("item-1", "Only Eligible", 5.0)
            ],
            RemoveWinner: true
        );
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var initialState = (WheelActivity.State)WheelActivity.CreateInitialState(configJson);
        var stateJson = JsonSerializer.Serialize(initialState, ActivityJsonDefaults.Options);

        // Spin 1: Only item-1 should ever win
        var (success, error, newState) = WheelActivity.Reduce(configJson, stateJson, "spin", null, deterministicRandom);
        Assert.True(success);
        Assert.Null(error);

        var st = (WheelActivity.State)newState;
        Assert.Equal("item-1", st.WinnerId);
        Assert.Equal("Only Eligible", st.WinnerLabel);
        Assert.Contains("item-1", st.RemovedIds!);

        // Spin 2: Now item-1 is removed and item-0 has 0 weight -> should fail gracefully
        var stateJson2 = JsonSerializer.Serialize(st, ActivityJsonDefaults.Options);
        var (success2, error2, _) = WheelActivity.Reduce(configJson, stateJson2, "spin", null, deterministicRandom);
        Assert.False(success2);
        Assert.Contains("No eligible items", error2);

        // Restore removed
        var (success3, _, restoredState) = WheelActivity.Reduce(configJson, stateJson2, "restoreremoved", null, deterministicRandom);
        Assert.True(success3);
        var rst = (WheelActivity.State)restoredState;
        Assert.Empty(rst.RemovedIds!);
    }

    [Fact]
    public async Task ScoreboardReducer_IncrementDecrementAndUndo()
    {
        var config = new ScoreboardActivity.Config(
            Title: "Scoreboard",
            Teams:
            [
                new ScoreboardActivity.TeamConfig("team-a", "Team Alpha", "#FF0000", InitialScore: 0),
                new ScoreboardActivity.TeamConfig("team-b", "Team Beta", "#0000FF", InitialScore: 10)
            ],
            Increment: 5,
            Decrement: 2
        );
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var state = (ScoreboardActivity.State)ScoreboardActivity.CreateInitialState(configJson);
        var stateJson = JsonSerializer.Serialize(state, ActivityJsonDefaults.Options);
        var random = new DeterministicRandomSource();

        // Increment team-a by default increment (5)
        var incPayload = JsonDocument.Parse("{\"teamId\":\"team-a\"}").RootElement;
        var (s1, _, n1) = ScoreboardActivity.Reduce(configJson, stateJson, "incrementscore", incPayload, random);
        Assert.True(s1);
        var st1 = (ScoreboardActivity.State)n1;
        Assert.Equal(5, st1.Teams!.First(x => x.Id == "team-a").Score);

        // Decrement team-b by default decrement (2)
        var decPayload = JsonDocument.Parse("{\"teamId\":\"team-b\",\"amount\":2}").RootElement;
        var (s2, _, n2) = ScoreboardActivity.Reduce(configJson, JsonSerializer.Serialize(st1, ActivityJsonDefaults.Options), "decrementscore", decPayload, random);
        Assert.True(s2);
        var st2 = (ScoreboardActivity.State)n2;
        Assert.Equal(8, st2.Teams!.First(x => x.Id == "team-b").Score);

        // Undo last score change
        var (s3, _, n3) = ScoreboardActivity.Reduce(configJson, JsonSerializer.Serialize(st2, ActivityJsonDefaults.Options), "undoscore", null, random);
        Assert.True(s3);
        var st3 = (ScoreboardActivity.State)n3;
        Assert.Equal(10, st3.Teams!.First(x => x.Id == "team-b").Score);
    }

    [Fact]
    public async Task PrizeGridReducer_RevealBoxAndConcealedState()
    {
        var config = new PrizeGridActivity.Config(
            Title: "Prize Grid",
            Boxes:
            [
                new PrizeGridActivity.BoxConfig(1, "1", "🎁", "Prize A", 100),
                new PrizeGridActivity.BoxConfig(2, "2", "🎁", "Prize B", 200)
            ]
        );
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var state = (PrizeGridActivity.State)PrizeGridActivity.CreateInitialState(configJson);
        var stateJson = JsonSerializer.Serialize(state, ActivityJsonDefaults.Options);
        var random = new DeterministicRandomSource();

        // Initial state has no revealed prizes
        Assert.All(state.Boxes!, b => Assert.Null(b.Prize));

        // Reveal box 1
        var payload = JsonDocument.Parse("{\"boxNumber\":1}").RootElement;
        var (s1, _, n1) = PrizeGridActivity.Reduce(configJson, stateJson, "revealbox", payload, random);
        Assert.True(s1);
        var st1 = (PrizeGridActivity.State)n1;
        var box1 = st1.Boxes!.First(x => x.BoxNumber == 1);
        Assert.True(box1.Revealed);
        Assert.Equal("Prize A", box1.Prize);
        Assert.Equal(100, box1.Points);

        // Box 2 must remain unrevealed
        var box2 = st1.Boxes!.First(x => x.BoxNumber == 2);
        Assert.False(box2.Revealed);
        Assert.Null(box2.Prize);
    }

    [Fact]
    public async Task CountdownReducer_StartPauseAndAdjust()
    {
        var config = new CountdownActivity.Config(
            Title: "Timer",
            DurationSeconds: 60
        );
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var state = (CountdownActivity.State)CountdownActivity.CreateInitialState(configJson);
        var stateJson = JsonSerializer.Serialize(state, ActivityJsonDefaults.Options);
        var random = new DeterministicRandomSource();

        Assert.Equal(60000, state.RemainingMs);
        Assert.False(state.IsRunning);

        // Start
        var (s1, _, n1) = CountdownActivity.Reduce(configJson, stateJson, "start", null, random);
        Assert.True(s1);
        var st1 = (CountdownActivity.State)n1;
        Assert.True(st1.IsRunning);
        Assert.NotNull(st1.TargetAt);

        // Adjust time (+10s)
        var adjustPayload = JsonDocument.Parse("{\"deltaSeconds\":10}").RootElement;
        var (s2, _, n2) = CountdownActivity.Reduce(configJson, JsonSerializer.Serialize(st1, ActivityJsonDefaults.Options), "adjusttime", adjustPayload, random);
        Assert.True(s2);
        var st2 = (CountdownActivity.State)n2;
        Assert.True(st2.RemainingMs >= 69000); // adjusted to ~70s

        // Pause
        var (s3, _, n3) = CountdownActivity.Reduce(configJson, JsonSerializer.Serialize(st2, ActivityJsonDefaults.Options), "pause", null, random);
        Assert.True(s3);
        var st3 = (CountdownActivity.State)n3;
        Assert.False(st3.IsRunning);
        Assert.Null(st3.TargetAt);
    }

    [Fact]
    public async Task ActivityRun_RevisionIncrementAndMismatchHandling()
    {
        var (db, service, conn) = await CreateTestServiceAsync();
        await using (conn)
        await using (db)
        {
            var ct = TestContext.Current.CancellationToken;
            var defInput = new ActivityDefinitionInput(
                Name: "Live Scoreboard",
                Type: ActivityTypes.Scoreboard
            );
            var def = await service.CreateDefinitionAsync(defInput, "admin", ct);

            var run = await service.GetOrCreateRunAsync(def.Id, null, null, null, ct);
            Assert.NotNull(run);
            Assert.Equal(1, run.Revision);
            var runState = JsonSerializer.Deserialize<ScoreboardActivity.State>(run.StateJson, ActivityJsonDefaults.Options);
            var teamId = runState!.Teams![0].Id;
            var cmd = new ActivityCommandEnvelope(
                CommandId: "cmd-1",
                ExpectedRevision: 1,
                Action: "incrementscore",
                Payload: JsonDocument.Parse($"{{\"teamId\":\"{teamId}\",\"amount\":5}}").RootElement
            );

            var res1 = await service.ExecuteCommandAsync(run.Id, cmd, ct);
            Assert.True(res1.Success);
            Assert.Equal(2, res1.Revision);
            Assert.Equal(ActivityRunStatuses.Live, res1.Status);

            // Stale revision command (expectedRevision = 1 when current is 2) should fail with conflict
            var staleCmd = new ActivityCommandEnvelope(
                CommandId: "cmd-2",
                ExpectedRevision: 1,
                Action: "incrementscore",
                Payload: JsonDocument.Parse($"{{\"teamId\":\"{teamId}\",\"amount\":5}}").RootElement
            );
            var res2 = await service.ExecuteCommandAsync(run.Id, staleCmd, ct);
            Assert.False(res2.Success);
            Assert.Contains("mismatch", res2.Error, StringComparison.OrdinalIgnoreCase);

            // Reset run
            var resetRun = await service.ResetRunAsync(run.Id, ct);
            Assert.NotNull(resetRun);
            Assert.Equal(ActivityRunStatuses.Prepared, resetRun.Status);
            Assert.Equal(3, resetRun.Revision);
        }
    }

    [Fact]
    public void TriviaReducer_AllowsTwoChoiceQuestions()
    {
        var config = new TriviaActivity.Config(
            Title: "Quick Quiz",
            Questions:
            [
                new TriviaActivity.QuestionConfig("q1", "Pick one", ["Yes", "No"], 0)
            ]
        );
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var state = (TriviaActivity.State)TriviaActivity.CreateInitialState(configJson);

        var (success, error, nextState) = TriviaActivity.Reduce(
            configJson,
            JsonSerializer.Serialize(state, ActivityJsonDefaults.Options),
            "revealanswer",
            null,
            new DeterministicRandomSource());

        Assert.True(success);
        Assert.Null(error);
        Assert.True(((TriviaActivity.State)nextState).AnswerRevealed);
    }

    [Fact]
    public void SurveyBoardReducer_ChangesQuestionAndResetsBoard()
    {
        var config = new SurveyBoardActivity.Config(
            Title: "Survey",
            Questions:
            [
                new SurveyBoardActivity.QuestionConfig(
                    "q1", "First question",
                    Answers: [new SurveyBoardActivity.AnswerConfig(1, "First", 25)]),
                new SurveyBoardActivity.QuestionConfig(
                    "q2", "Second question",
                    Answers: [new SurveyBoardActivity.AnswerConfig(1, "Second", 40)])
            ]);
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var initial = (SurveyBoardActivity.State)SurveyBoardActivity.CreateInitialState(configJson);
        var revealPayload = JsonDocument.Parse("{\"rank\":1}").RootElement;

        var (_, _, revealed) = SurveyBoardActivity.Reduce(
            configJson,
            JsonSerializer.Serialize(initial, ActivityJsonDefaults.Options),
            "revealitem",
            revealPayload,
            new DeterministicRandomSource());
        var revealedState = (SurveyBoardActivity.State)revealed;
        Assert.Equal(25, revealedState.RevealedScore);

        var (success, error, changed) = SurveyBoardActivity.Reduce(
            configJson,
            JsonSerializer.Serialize(revealedState, ActivityJsonDefaults.Options),
            "nextquestion",
            null,
            new DeterministicRandomSource());
        var changedState = (SurveyBoardActivity.State)changed;

        Assert.True(success);
        Assert.Null(error);
        Assert.Equal(1, changedState.CurrentQuestionIndex);
        Assert.Equal(0, changedState.RevealedScore);
        Assert.All(changedState.Answers!, answer => Assert.False(answer.Revealed));
    }

    [Fact]
    public void ImageShuffleReducer_HonorsTargetAndLegacyUrlAlias()
    {
        var config = new ImageShuffleActivity.Config(
            Images:
            [
                new ImageShuffleActivity.ImageItem("a", "", "Alpha", 1, "https://example.test/a.png"),
                new ImageShuffleActivity.ImageItem("b", "https://example.test/b.png", "Beta", 1)
            ],
            RemoveAfterPick: true);
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var state = (ImageShuffleActivity.State)ImageShuffleActivity.CreateInitialState(configJson);
        var targetPayload = JsonDocument.Parse("{\"targetImageId\":\"a\"}").RootElement;

        var (success, error, nextState) = ImageShuffleActivity.Reduce(
            configJson,
            JsonSerializer.Serialize(state, ActivityJsonDefaults.Options),
            "shuffle",
            targetPayload,
            new DeterministicRandomSource());
        var result = (ImageShuffleActivity.State)nextState;

        Assert.True(success);
        Assert.Null(error);
        Assert.Equal("a", result.SelectedImageId);
        Assert.Equal("https://example.test/a.png", result.SelectedImageUrl);
        Assert.Contains("a", result.History!);
    }

    [Fact]
    public void RapidFireReducer_StartsTimerAndRevealsAnswer()
    {
        var config = new RapidFireActivity.Config(
            Title: "Speed Round",
            DefaultTimerSeconds: 12,
            Questions: [new RapidFireActivity.QuestionConfig("q1", "Pick one", ["A", "B", "C"], 1, Points: 150, TimerSeconds: 12)]);
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var initial = (RapidFireActivity.State)RapidFireActivity.CreateInitialState(configJson);
        var random = new DeterministicRandomSource();

        var (started, _, startedState) = RapidFireActivity.Reduce(configJson, JsonSerializer.Serialize(initial, ActivityJsonDefaults.Options), "start", null, random);
        var running = (RapidFireActivity.State)startedState;
        Assert.True(started);
        Assert.True(running.IsRunning);
        Assert.NotNull(running.TargetAt);

        var (revealed, _, revealedState) = RapidFireActivity.Reduce(configJson, JsonSerializer.Serialize(running, ActivityJsonDefaults.Options), "reveal", null, random);
        var final = (RapidFireActivity.State)revealedState;
        Assert.True(revealed);
        Assert.True(final.AnswerRevealed);
        Assert.False(final.IsRunning);
        Assert.Null(final.TargetAt);
    }

    [Fact]
    public void EmojiPromptReducer_HintAndRoundNavigationResetRevealState()
    {
        var config = new EmojiPromptActivity.Config(
            Rounds:
            [
                new EmojiPromptActivity.RoundConfig("r1", "🦁👑", "Movie?", "Lion King", "Animated", 100),
                new EmojiPromptActivity.RoundConfig("r2", "🌧️🐱🐶", "Phrase?", "Raining cats and dogs", "Heavy rain", 100)
            ]);
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var initial = (EmojiPromptActivity.State)EmojiPromptActivity.CreateInitialState(configJson);
        var (_, _, hinted) = EmojiPromptActivity.Reduce(configJson, JsonSerializer.Serialize(initial, ActivityJsonDefaults.Options), "showhint", null);
        var hintedState = (EmojiPromptActivity.State)hinted;
        var (_, _, revealed) = EmojiPromptActivity.Reduce(configJson, JsonSerializer.Serialize(hintedState, ActivityJsonDefaults.Options), "reveal", null);
        var revealedState = (EmojiPromptActivity.State)revealed;
        var (success, _, next) = EmojiPromptActivity.Reduce(configJson, JsonSerializer.Serialize(revealedState, ActivityJsonDefaults.Options), "next", null);
        var nextState = (EmojiPromptActivity.State)next;

        Assert.True(success);
        Assert.True(revealedState.AnswerRevealed);
        Assert.Equal(1, nextState.CurrentRoundIndex);
        Assert.False(nextState.HintRevealed);
        Assert.False(nextState.AnswerRevealed);
    }

    [Fact]
    public void RankItReducer_RevealAndNextRoundAreHostControlled()
    {
        var config = new RankItActivity.Config(
            Rounds:
            [
                new RankItActivity.RoundConfig("r1", "First", [new RankItActivity.ItemConfig("1", "One"), new RankItActivity.ItemConfig("2", "Two")]),
                new RankItActivity.RoundConfig("r2", "Second", [new RankItActivity.ItemConfig("1", "Alpha"), new RankItActivity.ItemConfig("2", "Beta")])
            ]);
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var initial = (RankItActivity.State)RankItActivity.CreateInitialState(configJson);
        var (_, _, revealed) = RankItActivity.Reduce(configJson, JsonSerializer.Serialize(initial, ActivityJsonDefaults.Options), "reveal", null);
        var revealedState = (RankItActivity.State)revealed;
        var (_, _, next) = RankItActivity.Reduce(configJson, JsonSerializer.Serialize(revealedState, ActivityJsonDefaults.Options), "next", null);
        var nextState = (RankItActivity.State)next;

        Assert.True(revealedState.AnswerRevealed);
        Assert.Equal(1, nextState.CurrentRoundIndex);
        Assert.False(nextState.AnswerRevealed);
    }

    [Fact]
    public void WordScrambleReducer_StartHintRevealAndResetTimer()
    {
        var config = new WordScrambleActivity.Config(
            SecondsPerRound: 20,
            Rounds: [new WordScrambleActivity.RoundConfig("r1", "PUZZLE", "A challenge", Hint: "It starts with P", Points: 100)]);
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var initial = (WordScrambleActivity.State)WordScrambleActivity.CreateInitialState(configJson);
        var random = new DeterministicRandomSource();

        var (_, _, started) = WordScrambleActivity.Reduce(configJson, JsonSerializer.Serialize(initial, ActivityJsonDefaults.Options), "start", null);
        var startedState = (WordScrambleActivity.State)started;
        var (_, _, hinted) = WordScrambleActivity.Reduce(configJson, JsonSerializer.Serialize(startedState, ActivityJsonDefaults.Options), "showhint", null);
        var hintedState = (WordScrambleActivity.State)hinted;
        var (_, _, revealed) = WordScrambleActivity.Reduce(configJson, JsonSerializer.Serialize(hintedState, ActivityJsonDefaults.Options), "reveal", null);
        var revealedState = (WordScrambleActivity.State)revealed;

        Assert.True(startedState.IsRunning);
        Assert.NotNull(startedState.TargetAt);
        Assert.True(hintedState.HintRevealed);
        Assert.True(revealedState.AnswerRevealed);
        Assert.False(revealedState.IsRunning);
        Assert.Null(revealedState.TargetAt);
        _ = random;
    }

    [Fact]
    public void PredictionReducerOpensClosesAndRevealsFlexibleChoices()
    {
        var config = new PredictionActivity.Config(
            Rounds: [new PredictionActivity.RoundConfig("r1", "Pick", ["A", "B"], 1, "Because B", 200)]);
        var configJson = JsonSerializer.Serialize(config, ActivityJsonDefaults.Options);
        var initial = (PredictionActivity.State)PredictionActivity.CreateInitialState(configJson);

        var (opened, _, openState) = PredictionActivity.Reduce(configJson, JsonSerializer.Serialize(initial, ActivityJsonDefaults.Options), "open", null);
        var stateAfterOpen = (PredictionActivity.State)openState;
        var (revealed, _, revealState) = PredictionActivity.Reduce(configJson, JsonSerializer.Serialize(stateAfterOpen, ActivityJsonDefaults.Options), "reveal", null);
        var stateAfterReveal = (PredictionActivity.State)revealState;

        Assert.True(opened);
        Assert.True(stateAfterOpen.ResponsesOpen);
        Assert.True(revealed);
        Assert.True(stateAfterReveal.AnswerRevealed);
        Assert.False(stateAfterReveal.ResponsesOpen);
    }
}
