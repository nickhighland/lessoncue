using Xunit;
using LessonCue.Server;

namespace LessonCue.Server.Tests;

public sealed class TroubleshootingEmailScheduleTests
{
    [Fact]
    public void DueUsesTheOrganizationLocalDateAndRunsOnlyOncePerDay()
    {
        var now = new DateTimeOffset(2026, 9, 20, 11, 5, 0, TimeSpan.Zero);

        Assert.True(TroubleshootingEmailSchedule.IsDue("07:00", "America/New_York", null, now));
        Assert.False(TroubleshootingEmailSchedule.IsDue("07:00", "America/New_York", now, now));
        Assert.False(TroubleshootingEmailSchedule.IsDue("12:00", "America/New_York", null, now));
    }

    [Fact]
    public void NextRunPreservesTheConfiguredTimeZone()
    {
        var now = new DateTimeOffset(2026, 9, 20, 15, 30, 0, TimeSpan.Zero);

        var next = TroubleshootingEmailSchedule.NextRun("07:00", "America/New_York", now, now);

        Assert.Equal(new DateTimeOffset(2026, 9, 21, 11, 0, 0, TimeSpan.Zero), next);
    }

    [Fact]
    public void Daily_report_keeps_json_payload_but_uses_a_provider_safe_text_filename()
    {
        Assert.Equal("lessoncue-troubleshooting-2026-09-22.txt",
            TroubleshootingEmailService.ReportAttachmentFileName(new DateOnly(2026, 9, 22)));
    }

    [Theory]
    [InlineData("7:05", "07:05")]
    [InlineData("23:59", "23:59")]
    public void NormalizesAcceptedClockValues(string value, string expected)
    {
        Assert.True(TroubleshootingEmailSchedule.TryNormalizeTime(value, out var normalized));
        Assert.Equal(expected, normalized);
    }
}
