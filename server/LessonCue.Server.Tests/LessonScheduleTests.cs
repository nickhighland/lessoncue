using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class LessonScheduleTests
{
    [Fact]
    public async Task Template_preserves_structure_and_instantiates_with_local_timing()
    {
        await using var fixture = await Fixture.CreateAsync();
        var asset = new MediaAsset
        {
            FileName = "welcome.mp4", RelativePath = "welcome.mp4", StoragePolicy = MediaRetention.LessonScoped,
            DeleteAfter = new DateTimeOffset(2026, 8, 1, 0, 0, 0, TimeSpan.Zero)
        };
        var source = new Lesson
        {
            ClassId = fixture.Class.Id, Date = new DateOnly(2026, 9, 6), Title = "Standard session",
            DesignatedStartAt = new DateTimeOffset(2026, 9, 6, 10, 30, 0, TimeSpan.FromHours(-4)),
            PreRollStartsAt = new DateTimeOffset(2026, 9, 6, 10, 15, 0, TimeSpan.FromHours(-4)),
            AvailableFrom = new DateTimeOffset(2026, 9, 5, 10, 30, 0, TimeSpan.FromHours(-4)),
            ExpiresAt = new DateTimeOffset(2026, 9, 7, 12, 30, 0, TimeSpan.FromHours(-4)),
            PreRollEnabled = true, KeepOffline = true, DownloadDaysBefore = 14
        };
        source.Items.Add(new PlaylistItem
        {
            LessonId = source.Id, Title = "Welcome loop", Role = "preRoll", Type = "video", Position = 1000,
            MediaAssetId = asset.Id, StartMs = 1250, EndMs = 9125, FadeInMs = 500, FadeOutMs = 750,
            EndBehavior = "loop", Notes = "Start quietly", CuePointsJson = "[{\"name\":\"Ready\",\"positionMs\":3000}]"
        });
        fixture.Db.AddRange(asset, source); await fixture.Db.SaveChangesAsync(TestContext.Current.CancellationToken);

        var template = await LessonScheduleService.CreateTemplateFromLessonAsync(
            fixture.Db, source.Id, "Weekly structure", "Reusable plan", TestContext.Current.CancellationToken);
        Assert.NotNull(template);
        Assert.Equal(630, template.DefaultStartMinutes);
        Assert.Equal(15, template.PreRollLeadMinutes);
        Assert.Equal(1440, template.AvailableLeadMinutes);
        Assert.Equal(1560, template.ExpiresAfterMinutes);
        Assert.Single(template.Items);
        Assert.Equal(MediaRetention.Persistent, asset.StoragePolicy);
        Assert.Null(asset.DeleteAfter);

        var lesson = await LessonScheduleService.InstantiateAsync(fixture.Db, template.Id, fixture.Class.Id,
            new DateOnly(2026, 11, 1), null, null, null, "tester", TestContext.Current.CancellationToken);
        Assert.NotNull(lesson);
        Assert.Equal("Standard session", lesson.Title);
        Assert.True(lesson.PreRollEnabled);
        Assert.Equal(10, lesson.DesignatedStartAt!.Value.Hour);
        Assert.Equal(TimeSpan.FromHours(-5), lesson.DesignatedStartAt.Value.Offset);
        Assert.Equal(15, (lesson.DesignatedStartAt.Value - lesson.PreRollStartsAt!.Value).TotalMinutes);
        var item = Assert.Single(lesson.Items);
        Assert.Equal("preRoll", item.Role);
        Assert.Equal(1250, item.StartMs);
        Assert.Equal(750, item.FadeOutMs);
        Assert.Equal(asset.Id, item.MediaAssetId);
        Assert.Null(asset.DeleteAfter);

        var revised = new Lesson { ClassId = fixture.Class.Id, Date = new DateOnly(2026, 11, 8), Title = "Revised session" };
        revised.Items.Add(new PlaylistItem { LessonId = revised.Id, Title = "First", Position = 1000 });
        revised.Items.Add(new PlaylistItem { LessonId = revised.Id, Title = "Second", Position = 2000, Role = "countdown" });
        fixture.Db.Lessons.Add(revised); await fixture.Db.SaveChangesAsync(TestContext.Current.CancellationToken);
        Assert.True(await LessonScheduleService.ReplaceTemplateFromLessonAsync(fixture.Db, template.Id, revised.Id,
            "tester", TestContext.Current.CancellationToken));
        var refreshed = await fixture.Db.LessonTemplates.AsNoTracking().Include(x => x.Items)
            .SingleAsync(x => x.Id == template.Id, TestContext.Current.CancellationToken);
        Assert.Equal("Revised session", refreshed.DefaultTitle);
        Assert.Equal(["First", "Second"], refreshed.Items.OrderBy(x => x.Position).Select(x => x.Title));
    }

    [Fact]
    public async Task Weekly_generation_is_idempotent_and_respects_exceptions()
    {
        await using var fixture = await Fixture.CreateAsync();
        var template = new LessonTemplate { Name = "Lab", DefaultTitle = "Lab plan" };
        template.Items.Add(new LessonTemplateItem { TemplateId = template.Id, Title = "Opening", Position = 1000 });
        var schedule = new RecurringLessonSchedule
        {
            Name = "Fall labs", TemplateId = template.Id, ClassId = fixture.Class.Id, Frequency = "weekly",
            Interval = 1, DayOfWeek = (int)DayOfWeek.Wednesday, StartDate = new DateOnly(2026, 9, 1),
            EndDate = new DateOnly(2026, 9, 30), TitlePattern = "{class}: {template} ({date})",
            ExcludedDatesJson = LessonScheduleService.SerializeDates([new DateOnly(2026, 9, 16)])
        };
        fixture.Db.AddRange(template, schedule); await fixture.Db.SaveChangesAsync(TestContext.Current.CancellationToken);

        var first = await LessonScheduleService.GenerateAsync(fixture.Db, schedule.Id,
            new DateOnly(2026, 9, 30), "tester", TestContext.Current.CancellationToken);
        var second = await LessonScheduleService.GenerateAsync(fixture.Db, schedule.Id,
            new DateOnly(2026, 9, 30), "tester", TestContext.Current.CancellationToken);

        Assert.Equal(4, first);
        Assert.Equal(0, second);
        var lessons = await fixture.Db.Lessons.Where(x => x.GeneratedByScheduleId == schedule.Id)
            .OrderBy(x => x.Date).Include(x => x.Items).ToListAsync(TestContext.Current.CancellationToken);
        Assert.Equal([new DateOnly(2026, 9, 2), new DateOnly(2026, 9, 9),
            new DateOnly(2026, 9, 23), new DateOnly(2026, 9, 30)], lessons.Select(x => x.Date));
        Assert.All(lessons, lesson => Assert.Equal("Learning Lab: Lab plan (" + lesson.Date.ToString("yyyy-MM-dd") + ")", lesson.Title));
        Assert.All(lessons, lesson => Assert.Single(lesson.Items));
    }

    [Fact]
    public void Monthly_and_custom_occurrences_are_bounded_and_filtered()
    {
        var monthly = new RecurringLessonSchedule
        {
            Name = "Monthly", Frequency = "monthly", Interval = 1, DayOfMonth = 31,
            StartDate = new DateOnly(2026, 1, 1), ExcludedDatesJson = "[]"
        };
        Assert.Equal([new DateOnly(2026, 1, 31), new DateOnly(2026, 3, 31)],
            LessonScheduleService.Occurrences(monthly, new DateOnly(2026, 3, 31)));

        var custom = new RecurringLessonSchedule
        {
            Name = "Term days", Frequency = "custom", StartDate = new DateOnly(2026, 8, 1),
            EndDate = new DateOnly(2026, 8, 31),
            CustomDatesJson = LessonScheduleService.SerializeDates([
                new DateOnly(2026, 7, 31), new DateOnly(2026, 8, 10), new DateOnly(2026, 8, 24)]),
            ExcludedDatesJson = LessonScheduleService.SerializeDates([new DateOnly(2026, 8, 24)])
        };
        Assert.Equal([new DateOnly(2026, 8, 10)],
            LessonScheduleService.Occurrences(custom, new DateOnly(2026, 9, 1)));
    }

    [Fact]
    public async Task Appliance_upgrade_recreates_template_and_schedule_schema_idempotently()
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.Db.Database.ExecuteSqlRawAsync(
            "DROP TABLE \"RecurringLessonSchedules\"; DROP TABLE \"LessonTemplateItems\"; DROP TABLE \"LessonTemplates\";",
            TestContext.Current.CancellationToken);

        await DatabaseUpgrade.ApplyAsync(fixture.Db, TestContext.Current.CancellationToken);
        await DatabaseUpgrade.ApplyAsync(fixture.Db, TestContext.Current.CancellationToken);

        var connection = fixture.Db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('LessonTemplates','LessonTemplateItems','RecurringLessonSchedules')";
        Assert.Equal(3L, (long)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly string path;
        public LessonCueDb Db { get; }
        public LessonClass Class { get; }

        private Fixture(string path, LessonCueDb db, LessonClass lessonClass)
        { this.path = path; Db = db; Class = lessonClass; }

        public static async Task<Fixture> CreateAsync()
        {
            var path = Path.Combine(Path.GetTempPath(), $"lessoncue-schedule-{Guid.NewGuid():N}.db");
            var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite($"Data Source={path}").Options;
            var db = new LessonCueDb(options); await db.Database.EnsureCreatedAsync();
            var organization = new Organization { Name = "Test", TimeZone = "America/New_York" };
            var lessonClass = new LessonClass { Name = "Learning Lab" };
            db.AddRange(organization, lessonClass); await db.SaveChangesAsync();
            return new Fixture(path, db, lessonClass);
        }

        public async ValueTask DisposeAsync()
        {
            await Db.DisposeAsync();
            try { File.Delete(path); } catch { }
        }
    }
}
