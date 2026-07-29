using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AudienceInteractionTests
{
    [Fact]
    public async Task AudienceStorageEnforcesAnonymousResponseUniquenessAndCascadeDeletion()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        await using var db = new LessonCueDb(
            new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(ct);

        var session = new AudienceSession
        {
            Title = "Class check-in",
            Code = "ABC234",
            RetentionDays = 3,
            PurgeAt = DateTimeOffset.UtcNow.AddDays(3)
        };
        var question = new AudienceQuestion
        {
            Session = session,
            Prompt = "Which topic should we review?",
            Type = "single",
            OptionsJson = """["Algebra","Geometry"]"""
        };
        db.Add(new AudienceResponse
        {
            Session = session,
            Question = question,
            ParticipantTokenHash = new string('a', 64),
            AnswerJson = """["Algebra"]"""
        });
        await db.SaveChangesAsync(ct);

        db.Add(new AudienceResponse
        {
            SessionId = session.Id,
            QuestionId = question.Id,
            ParticipantTokenHash = new string('a', 64),
            AnswerJson = """["Geometry"]"""
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync(ct));
        db.ChangeTracker.Clear();

        var stored = await db.AudienceSessions.SingleAsync(ct);
        db.AudienceSessions.Remove(stored);
        await db.SaveChangesAsync(ct);
        Assert.Empty(await db.AudienceQuestions.ToListAsync(ct));
        Assert.Empty(await db.AudienceResponses.ToListAsync(ct));
    }

    [Fact]
    public async Task ApplianceUpgradeCreatesAudienceTablesIdempotently()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        await using var db = new LessonCueDb(
            new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(ct);
        foreach (var table in new[] { "AudienceResponses", "AudienceQuestions", "AudienceSessions" })
        {
            await using var drop = connection.CreateCommand();
            drop.CommandText = $"DROP TABLE \"{table}\"";
            await drop.ExecuteNonQueryAsync(ct);
        }

        await DatabaseUpgrade.ApplyAsync(db, ct);
        await DatabaseUpgrade.ApplyAsync(db, ct);

        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('AudienceSessions','AudienceQuestions','AudienceResponses')";
        Assert.Equal(3L, (long)(await command.ExecuteScalarAsync(ct))!);
    }

    [Fact]
    public async Task RetentionDeletesOnlyExpiredSessionsAndTheirResponses()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        await using var db = new LessonCueDb(
            new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var expired = new AudienceSession { Title = "Old poll", Code = "OLD234", PurgeAt = now.AddMinutes(-1) };
        var active = new AudienceSession { Title = "Current poll", Code = "NOW234", PurgeAt = now.AddDays(1) };
        db.AddRange(expired, active);
        await db.SaveChangesAsync(ct);

        Assert.Equal(1, await AudienceRetentionService.CleanupAsync(db, now, ct));
        Assert.Equal(active.Id, (await db.AudienceSessions.SingleAsync(ct)).Id);
        Assert.Contains(await db.AuditEvents.ToListAsync(ct), x => x.Action == "audience.retention.purge");
    }
}
