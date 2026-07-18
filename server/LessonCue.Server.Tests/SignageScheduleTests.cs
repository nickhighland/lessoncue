using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class SignageScheduleTests
{
    [Fact]
    public void OneTimeScheduleUsesExclusiveEndBoundary()
    {
        var item = new SignagePlaylist
        {
            Name = "Open house",
            StartsAt = new DateTimeOffset(2026, 7, 20, 12, 0, 0, TimeSpan.Zero),
            EndsAt = new DateTimeOffset(2026, 7, 20, 14, 0, 0, TimeSpan.Zero)
        };

        Assert.False(SignageSchedule.Evaluate(item, item.StartsAt.Value.AddSeconds(-1), "UTC").Active);
        Assert.True(SignageSchedule.Evaluate(item, item.StartsAt.Value, "UTC").Active);
        Assert.False(SignageSchedule.Evaluate(item, item.EndsAt.Value, "UTC").Active);
    }

    [Fact]
    public void WeeklyScheduleHonorsWeekdaysAndExclusions()
    {
        var item = new SignagePlaylist
        {
            Name = "Weekday welcome",
            Recurrence = "weekly",
            ScheduleStartDate = new DateOnly(2026, 7, 1),
            ScheduleEndDate = new DateOnly(2026, 7, 31),
            StartMinutes = 8 * 60,
            EndMinutes = 17 * 60,
            DaysOfWeekCsv = "1,2,3,4,5",
            ExcludedDatesJson = SignageSchedule.StoreDates([new DateOnly(2026, 7, 20)])
        };

        Assert.False(SignageSchedule.Evaluate(item, new DateTimeOffset(2026, 7, 19, 12, 0, 0, TimeSpan.Zero), "UTC").Active);
        var excluded = SignageSchedule.Evaluate(item, new DateTimeOffset(2026, 7, 20, 12, 0, 0, TimeSpan.Zero), "UTC");
        Assert.False(excluded.Active);
        Assert.Equal(new DateTimeOffset(2026, 7, 21, 8, 0, 0, TimeSpan.Zero), excluded.NextChangeAt);
        Assert.True(SignageSchedule.Evaluate(item, new DateTimeOffset(2026, 7, 21, 12, 0, 0, TimeSpan.Zero), "UTC").Active);
        Assert.False(SignageSchedule.Evaluate(item, new DateTimeOffset(2026, 7, 21, 18, 0, 0, TimeSpan.Zero), "UTC").Active);
    }

    [Fact]
    public void OvernightWeeklyScheduleBelongsToStartingDay()
    {
        var item = new SignagePlaylist
        {
            Name = "Monday overnight",
            Recurrence = "weekly",
            StartMinutes = 22 * 60,
            EndMinutes = 2 * 60,
            DaysOfWeekCsv = "1"
        };

        var state = SignageSchedule.Evaluate(item,
            new DateTimeOffset(2026, 7, 21, 1, 0, 0, TimeSpan.Zero), "UTC");

        Assert.True(state.Active);
        Assert.Equal(new DateOnly(2026, 7, 20), state.OccurrenceDate);
    }

    [Fact]
    public void ExplicitScreenOrMatchingTagReceivesSignage()
    {
        var selected = new Screen { Name = "Selected", TagsCsv = "classroom" };
        var lobby = new Screen { Name = "Lobby", TagsCsv = "lobby,main" };
        var other = new Screen { Name = "Other", TagsCsv = "gym" };
        var item = new SignagePlaylist
        {
            Name = "Targeted",
            TargetTagsCsv = "lobby",
            TargetScreenIdsJson = SignageSchedule.StoreScreenIds([selected.Id])
        };

        Assert.True(SignageSchedule.TargetsScreen(item, selected));
        Assert.True(SignageSchedule.TargetsScreen(item, lobby));
        Assert.False(SignageSchedule.TargetsScreen(item, other));
    }

    [Fact]
    public void ExpiredSchedulesAreNotFutureCacheCandidates()
    {
        var now = new DateTimeOffset(2026, 7, 20, 12, 0, 0, TimeSpan.Zero);
        var oneTime = new SignagePlaylist { Name = "Past", EndsAt = now.AddSeconds(-1) };
        var recurring = new SignagePlaylist
        {
            Name = "Past recurring", Recurrence = "daily", ScheduleEndDate = new DateOnly(2026, 7, 19)
        };

        Assert.False(SignageSchedule.CanOccurAgain(oneTime, now, "UTC"));
        Assert.False(SignageSchedule.CanOccurAgain(recurring, now, "UTC"));
    }
}
