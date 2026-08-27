using LessonCue.Server.Activities;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ActivityRelationshipMappingTests
{
    [Fact]
    public void RunScopedCollectionsUseTheExistingActivityRunForeignKeys()
    {
        var options = new DbContextOptionsBuilder<LessonCueDb>()
            .UseSqlite("Data Source=:memory:")
            .Options;
        using var db = new LessonCueDb(options);

        AssertRunForeignKey<ActivityParticipant>(db);
        AssertRunForeignKey<ActivityTeam>(db);
        AssertRunForeignKey<ActivityScoreEvent>(db);
    }

    private static void AssertRunForeignKey<TEntity>(LessonCueDb db)
        where TEntity : class
    {
        var entity = db.Model.FindEntityType(typeof(TEntity));
        Assert.NotNull(entity);

        var foreignKeys = entity!.GetForeignKeys()
            .Where(key => key.PrincipalEntityType.ClrType == typeof(ActivityRun))
            .ToArray();

        Assert.Single(foreignKeys);
        Assert.Equal(nameof(ActivityParticipant.ActivityRunId), foreignKeys[0].Properties.Single().Name);
    }
}
