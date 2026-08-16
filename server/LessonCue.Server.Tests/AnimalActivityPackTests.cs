using System.Text.Json;
using LessonCue.Server.Activities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AnimalActivityPackTests
{
    [Fact]
    public async Task AnimalPackCreatesEveryStudioTypeAndOneLessonCuePerActivity()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(TestContext.Current.CancellationToken);

        var result = await AnimalActivityPack.EnsureAsync(db, TestContext.Current.CancellationToken);

        Assert.Equal(27, result.ActivityCount);
        Assert.Equal(27, result.LessonCueCount);
        Assert.Equal(27, await db.ActivityDefinitions.CountAsync(x => x.CreatedBy == AnimalActivityPack.Marker, TestContext.Current.CancellationToken));
        Assert.Equal(27, await db.PlaylistItems.CountAsync(x => x.LessonId == result.LessonId && x.Type == "activity", TestContext.Current.CancellationToken));
        Assert.Equal(27, result.ActivityNames.Distinct(StringComparer.OrdinalIgnoreCase).Count());

        var definitions = await db.ActivityDefinitions
            .Where(x => x.CreatedBy == AnimalActivityPack.Marker)
            .OrderBy(x => x.LibraryPosition)
            .ToListAsync(TestContext.Current.CancellationToken);
        foreach (var definition in definitions)
        {
            Assert.Null(ActivityValidation.ValidateDefinition(definition.Type, definition.Name, definition.ConfigJson));
            Assert.Contains("animal", definition.Name + definition.Description, StringComparison.OrdinalIgnoreCase);
            Assert.NotEqual("{}", definition.ThemeJson);
            using var config = JsonDocument.Parse(definition.ConfigJson);
            Assert.Equal(JsonValueKind.Object, config.RootElement.ValueKind);
        }

        var second = await AnimalActivityPack.EnsureAsync(db, TestContext.Current.CancellationToken);
        Assert.Equal(result.LessonId, second.LessonId);
        Assert.Equal(27, await db.ActivityDefinitions.CountAsync(x => x.CreatedBy == AnimalActivityPack.Marker, TestContext.Current.CancellationToken));
        Assert.Equal(27, await db.PlaylistItems.CountAsync(x => x.LessonId == result.LessonId && x.Type == "activity", TestContext.Current.CancellationToken));
    }
}
