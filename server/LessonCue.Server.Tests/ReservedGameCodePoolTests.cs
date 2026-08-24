using LessonCue.Server.Activities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// Handing out reserved codes, and taking them back when a game finishes.
/// </summary>
public class ReservedGameCodePoolTests
{
    private static async Task<(LessonCueDb Db, ReservedGameCodePool Pool, SqliteConnection Connection)> CreateAsync(int seed = 7)
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        var db = new LessonCueDb(new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);
        return (db, new ReservedGameCodePool(db, new DeterministicRandomSource(seed)), connection);
    }

    private static async Task<ActivityRun> LiveRunAsync(LessonCueDb db, string code, string status = ActivityRunStatuses.Live)
    {
        var definition = new ActivityDefinition { Id = Guid.NewGuid(), Name = "Game", Type = ActivityTypes.Trivia, ConfigJson = "{}" };
        db.ActivityDefinitions.Add(definition);
        var run = new ActivityRun
        {
            Id = Guid.NewGuid(), ActivityDefinitionId = definition.Id, JoinCode = code,
            Status = status, StateJson = "{}", DefinitionSnapshotJson = "{}",
        };
        db.ActivityRuns.Add(run);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return run;
    }

    [Fact]
    public async Task AFreshPoolHasEveryCodeAvailable()
    {
        var (db, pool, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var status = await pool.StatusAsync(TestContext.Current.CancellationToken);
            Assert.Equal((100, 100, 0), status);
        }
    }

    [Fact]
    public async Task ACodeInUseIsNotHandedOutAgain()
    {
        var (db, pool, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            await LiveRunAsync(db, "Q7Z6");
            var available = await pool.AvailableAsync(TestContext.Current.CancellationToken);
            Assert.DoesNotContain("Q7Z6", available);
            Assert.Equal(99, available.Count);
        }
    }

    [Fact]
    public async Task NoTwoLiveGamesCanHoldTheSameCode()
    {
        var (db, pool, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            // Take repeatedly, standing each one up as a live game, and the
            // pool should never offer one that is already running.
            var handed = new List<string>();
            for (var index = 0; index < 25; index++)
            {
                var code = await pool.TakeAsync(TestContext.Current.CancellationToken);
                Assert.DoesNotContain(code, handed);
                handed.Add(code);
                await LiveRunAsync(db, code);
            }
            Assert.Equal(25, handed.Distinct(StringComparer.Ordinal).Count());
        }
    }

    [Fact]
    public async Task AFinishedGameGivesItsCodeBack()
    {
        var (db, pool, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var run = await LiveRunAsync(db, "Q7Z6");
            Assert.DoesNotContain("Q7Z6", await pool.AvailableAsync(TestContext.Current.CancellationToken));

            run.Status = ActivityRunStatuses.Ended;
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);

            // The short link never changed; only who owns the code did.
            Assert.Contains("Q7Z6", await pool.AvailableAsync(TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public async Task ACodeCanBeUsedAgainByALaterGame()
    {
        var (db, pool, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            var first = await LiveRunAsync(db, "A3C8");
            first.Status = ActivityRunStatuses.Ended;
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
            await LiveRunAsync(db, "A3C8");

            var status = await pool.StatusAsync(TestContext.Current.CancellationToken);
            Assert.Equal(1, status.Active);
            Assert.Equal(99, status.Available);
        }
    }

    [Fact]
    public async Task CodesAreNotHandedOutInOrder()
    {
        var (db, pool, connection) = await CreateAsync(seed: 3);
        await using (connection)
        await using (db)
        {
            var taken = new List<string>();
            for (var index = 0; index < 10; index++)
            {
                var code = await pool.TakeAsync(TestContext.Current.CancellationToken);
                taken.Add(code);
                await LiveRunAsync(db, code);
            }
            // A room that meets weekly should not be able to guess the next one.
            Assert.NotEqual(ReservedGameCodes.All.Take(10), taken);
        }
    }

    [Fact]
    public async Task AFullPoolSaysSoRatherThanHandingOutADuplicate()
    {
        var (db, pool, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            foreach (var code in ReservedGameCodes.All) await LiveRunAsync(db, code);

            Assert.Empty(await pool.AvailableAsync(TestContext.Current.CancellationToken));
            await Assert.ThrowsAsync<ReservedGameCodePool.ExhaustedException>(
                () => pool.TakeAsync(TestContext.Current.CancellationToken));
            // And the caller that would rather cope gets a null instead.
            Assert.Null(await pool.TryTakeAsync(TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public async Task AnOrdinaryRandomCodeDoesNotConsumeAReservedOne()
    {
        var (db, pool, connection) = await CreateAsync();
        await using (connection)
        await using (db)
        {
            // Games created before the shortener was switched on keep their
            // six-character codes, and those are none of the pool's business.
            await LiveRunAsync(db, "K7M2QP");
            Assert.Equal(100, (await pool.AvailableAsync(TestContext.Current.CancellationToken)).Count);
        }
    }
}
