using System.Text.Json;
using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class PresentationConversionTests
{
    [Fact]
    public async Task ConvertedSlidesAreAddedInOrderAndExtendLessonRetention()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(ct);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(ct);
        var lessonClass = new LessonClass { Name = "Training" };
        var lesson = new Lesson { ClassId = lessonClass.Id, Date = new DateOnly(2026, 9, 10), Title = "Orientation" };
        var first = new MediaAsset { FileName = "Deck — Slide 1", RelativePath = "slide-1.png",
            SourceKind = "presentation-slide", StoragePolicy = MediaRetention.LessonScoped };
        var second = new MediaAsset { FileName = "Deck — Slide 2", RelativePath = "slide-2.png",
            SourceKind = "presentation-slide", StoragePolicy = MediaRetention.LessonScoped };
        var source = new MediaAsset { FileName = "Deck.pdf", RelativePath = "deck.pdf", ConversionStatus = "ready",
            ConvertedSlidesJson = JsonSerializer.Serialize(new[] { first.Id, second.Id }) };
        db.AddRange(lessonClass, lesson, first, second, source);
        await db.SaveChangesAsync(ct);

        var added = await PresentationConversion.AddToLessonAsync(db, source, lesson, 12, "owner", ct);

        Assert.Equal(2, added);
        var items = await db.PlaylistItems.OrderBy(x => x.Position).ToListAsync(ct);
        Assert.Equal(new Guid?[] { first.Id, second.Id }, items.Select(x => x.MediaAssetId).ToArray());
        Assert.All(items, item => Assert.Equal(12_000, item.DurationMs));
        Assert.All(items, item => Assert.Equal(12, item.ImageDurationSeconds));
        Assert.Equal(MediaRetention.DeleteAfterFor(lesson.Date), first.DeleteAfter);
        Assert.Equal(MediaRetention.DeleteAfterFor(lesson.Date), second.DeleteAfter);
        Assert.Equal(2, lesson.Version);
        Assert.True(await db.AuditEvents.AnyAsync(x => x.Action == "presentation.add-to-lesson", ct));
    }

    [Theory]
    [InlineData("slides.pdf")]
    [InlineData("slides.pptx")]
    [InlineData("slides.odp")]
    [InlineData("handout.docx")]
    public void SupportedDocumentsAreRecognized(string fileName) => Assert.True(PresentationConversion.IsConvertible(fileName));
}
