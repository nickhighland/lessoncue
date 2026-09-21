using Xunit;
using LessonCue.Server;

namespace LessonCue.Server.Tests;

public sealed class TroubleshootingReviewScheduleTests
{
    [Fact]
    public void DailyReviewUsesTheConfiguredOrganizationTimeZone()
    {
        var settings = new TroubleshootingReviewConfig(
            Enabled: true, Provider: "codex", Frequency: "daily", TimeLocal: "07:30");
        var before = new DateTimeOffset(2026, 9, 21, 11, 0, 0, TimeSpan.Zero);
        var after = new DateTimeOffset(2026, 9, 21, 12, 0, 0, TimeSpan.Zero);

        Assert.False(TroubleshootingReviewSchedule.IsDue(settings, "America/New_York", null, before));
        Assert.True(TroubleshootingReviewSchedule.IsDue(settings, "America/New_York", null, after));
        Assert.Equal(after, TroubleshootingReviewSchedule.NextRun(settings, "America/New_York", null, after));
    }

    [Fact]
    public void WeeklyAndMonthlyReviewsUseTheirSelectedCalendarBoundary()
    {
        var now = new DateTimeOffset(2026, 9, 21, 12, 0, 0, TimeSpan.Zero); // Monday, 08:00 local.
        var weekly = new TroubleshootingReviewConfig(
            Enabled: true, Provider: "codex", Frequency: "weekly", TimeLocal: "07:30", WeeklyDay: 1);
        var monthly = new TroubleshootingReviewConfig(
            Enabled: true, Provider: "codex", Frequency: "monthly", TimeLocal: "07:30", MonthlyDay: 30);

        Assert.True(TroubleshootingReviewSchedule.IsDue(weekly, "America/New_York",
            now.AddDays(-7), now));
        Assert.False(TroubleshootingReviewSchedule.IsDue(monthly, "America/New_York", null, now));
        Assert.Equal(new DateTimeOffset(2026, 9, 30, 11, 30, 0, TimeSpan.Zero),
            TroubleshootingReviewSchedule.NextRun(monthly, "America/New_York", null, now));
    }

    [Fact]
    public void CustomIntervalsAreMeasuredFromTheLastRun()
    {
        var settings = new TroubleshootingReviewConfig(
            Enabled: true, Provider: "deepseek", Frequency: "custom", TimeLocal: "07:30",
            CustomInterval: 2, CustomUnit: "days");
        var lastRun = new DateTimeOffset(2026, 9, 19, 12, 0, 0, TimeSpan.Zero);

        Assert.False(TroubleshootingReviewSchedule.IsDue(settings, "UTC", lastRun, lastRun.AddHours(47)));
        Assert.True(TroubleshootingReviewSchedule.IsDue(settings, "UTC", lastRun, lastRun.AddDays(2)));
        Assert.Equal(lastRun.AddDays(2),
            TroubleshootingReviewSchedule.NextRun(settings, "UTC", lastRun, lastRun.AddHours(1)));
    }

    [Fact]
    public void CustomSchedulesUseTheConfiguredFirstRunTime()
    {
        var settings = new TroubleshootingReviewConfig(
            Enabled: true, Provider: "codex", Frequency: "custom", TimeLocal: "07:30",
            CustomInterval: 12, CustomUnit: "hours");
        var before = new DateTimeOffset(2026, 9, 21, 11, 0, 0, TimeSpan.Zero);
        var after = new DateTimeOffset(2026, 9, 21, 12, 0, 0, TimeSpan.Zero);

        Assert.False(TroubleshootingReviewSchedule.IsDue(settings, "America/New_York", null, before));
        Assert.True(TroubleshootingReviewSchedule.IsDue(settings, "America/New_York", null, after));
        Assert.Equal(after, TroubleshootingReviewSchedule.NextRun(settings, "America/New_York", null, after));
    }

    [Fact]
    public void InvalidSettingsAreRejectedInsteadOfSilentlyChangingTheSchedule()
    {
        var settings = new TroubleshootingReviewConfig(
            Enabled: true, Provider: "unknown", Frequency: "custom", TimeLocal: "25:00",
            WeeklyDay: 8, MonthlyDay: 0, CustomInterval: 0, CustomUnit: "minutes");

        Assert.False(TroubleshootingReviewSchedule.TryNormalize(settings, out _, out var error));
        Assert.Contains("provider", error, StringComparison.OrdinalIgnoreCase);
    }
}
