using System.Text.Json;

namespace LessonCue.Server;

public sealed record SignageScheduleState(bool Active, DateTimeOffset? NextChangeAt, DateOnly OccurrenceDate);

public static class SignageSchedule
{
    public static SignageScheduleState Evaluate(SignagePlaylist signage, DateTimeOffset now, string timeZoneId)
    {
        if (!signage.Enabled)
            return new(false, null, DateOnly.FromDateTime(now.UtcDateTime));

        if (NormalizeRecurrence(signage.Recurrence) == "once")
        {
            var activeOnce = (signage.StartsAt is null || signage.StartsAt <= now)
                && (signage.EndsAt is null || signage.EndsAt > now);
            var next = activeOnce
                ? signage.EndsAt
                : signage.StartsAt is { } nextStart && nextStart > now ? nextStart : null;
            return new(activeOnce, next, DateOnly.FromDateTime(now.UtcDateTime));
        }

        var zone = ResolveTimeZone(timeZoneId);
        var local = TimeZoneInfo.ConvertTime(now, zone);
        var localDate = DateOnly.FromDateTime(local.DateTime);
        var minute = local.Hour * 60 + local.Minute;
        var startMinutes = Math.Clamp(signage.StartMinutes ?? 0, 0, 1439);
        var endMinutes = Math.Clamp(signage.EndMinutes ?? 1440, 1, 1440);
        var overnight = endMinutes <= startMinutes;
        var occurrenceDate = overnight && minute < endMinutes ? localDate.AddDays(-1) : localDate;

        var inTimeWindow = overnight
            ? minute >= startMinutes || minute < endMinutes
            : minute >= startMinutes && minute < endMinutes;
        var active = inTimeWindow && DateMatches(signage, occurrenceDate);
        return new(active, NextBoundary(signage, now, localDate, startMinutes, endMinutes, zone), occurrenceDate);
    }

    public static bool TargetsScreen(SignagePlaylist signage, Screen screen)
    {
        var ids = ParseScreenIds(signage.TargetScreenIdsJson);
        var tags = SplitCsv(signage.TargetTagsCsv);
        if (ids.Count == 0 && tags.Length == 0) return true;
        if (ids.Contains(screen.Id)) return true;
        var screenTags = SplitCsv(screen.TagsCsv).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return tags.Any(screenTags.Contains);
    }

    public static bool CanOccurAgain(SignagePlaylist signage, DateTimeOffset now, string timeZoneId)
    {
        if (!signage.Enabled) return false;
        if (NormalizeRecurrence(signage.Recurrence) == "once")
            return signage.EndsAt is null || signage.EndsAt > now;
        if (signage.ScheduleEndDate is null) return true;
        var local = TimeZoneInfo.ConvertTime(now, ResolveTimeZone(timeZoneId));
        return signage.ScheduleEndDate >= DateOnly.FromDateTime(local.DateTime);
    }

    public static string NormalizeRecurrence(string? recurrence) =>
        recurrence?.Trim().ToLowerInvariant() is "daily" or "weekly" ? recurrence.Trim().ToLowerInvariant() : "once";

    public static string NormalizeDays(IEnumerable<int>? days) =>
        string.Join(',', (days ?? []).Where(day => day is >= 0 and <= 6).Distinct().Order());

    public static int[] ParseDays(string? csv) =>
        SplitCsv(csv).Select(value => int.TryParse(value, out var day) ? day : -1)
            .Where(day => day is >= 0 and <= 6).Distinct().Order().ToArray();

    public static List<DateOnly> ParseDates(string? json)
    {
        try { return JsonSerializer.Deserialize<List<DateOnly>>(json ?? "[]") ?? []; }
        catch (JsonException) { return []; }
    }

    public static List<Guid> ParseScreenIds(string? json)
    {
        try { return JsonSerializer.Deserialize<List<Guid>>(json ?? "[]") ?? []; }
        catch (JsonException) { return []; }
    }

    public static string StoreDates(IEnumerable<DateOnly>? dates) =>
        JsonSerializer.Serialize((dates ?? []).Distinct().Order().Take(366));

    public static string StoreScreenIds(IEnumerable<Guid>? ids) =>
        JsonSerializer.Serialize((ids ?? []).Where(id => id != Guid.Empty).Distinct().Take(500));

    private static bool DateMatches(SignagePlaylist signage, DateOnly date)
    {
        if (signage.ScheduleStartDate is { } start && date < start) return false;
        if (signage.ScheduleEndDate is { } end && date > end) return false;
        if (ParseDates(signage.ExcludedDatesJson).Contains(date)) return false;
        return NormalizeRecurrence(signage.Recurrence) != "weekly"
            || ParseDays(signage.DaysOfWeekCsv).Contains((int)date.DayOfWeek);
    }

    private static DateTimeOffset? NextBoundary(SignagePlaylist signage, DateTimeOffset now, DateOnly localDate,
        int startMinutes, int endMinutes, TimeZoneInfo zone)
    {
        var firstDate = localDate.AddDays(-1);
        if (signage.ScheduleStartDate is { } scheduleStart && scheduleStart > firstDate) firstDate = scheduleStart;
        DateTimeOffset? next = null;
        for (var offset = 0; offset < 16; offset++)
        {
            var occurrenceDate = firstDate.AddDays(offset);
            if (signage.ScheduleEndDate is { } scheduleEnd && occurrenceDate > scheduleEnd) break;
            if (!DateMatches(signage, occurrenceDate)) continue;
            var start = LocalBoundary(occurrenceDate, startMinutes, zone);
            var endDate = endMinutes <= startMinutes ? occurrenceDate.AddDays(1) : occurrenceDate;
            var end = LocalBoundary(endDate, endMinutes == 1440 ? 0 : endMinutes, zone);
            if (endMinutes == 1440) end = LocalBoundary(occurrenceDate.AddDays(1), 0, zone);
            if (start > now && (next is null || start < next)) next = start;
            if (end > now && (next is null || end < next)) next = end;
        }
        return next;
    }

    private static DateTimeOffset LocalBoundary(DateOnly date, int minutes, TimeZoneInfo zone)
    {
        var localBoundary = date.ToDateTime(TimeOnly.MinValue).AddMinutes(minutes);
        if (zone.IsInvalidTime(localBoundary)) localBoundary = localBoundary.AddHours(1);
        var offset = zone.GetUtcOffset(localBoundary);
        return new DateTimeOffset(localBoundary, offset);
    }

    private static TimeZoneInfo ResolveTimeZone(string timeZoneId)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId); }
        catch { return TimeZoneInfo.Local; }
    }

    private static string[] SplitCsv(string? value) =>
        (value ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
