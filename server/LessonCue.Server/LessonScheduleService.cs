using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class LessonScheduleService
{
    private static readonly SemaphoreSlim GenerationLock = new(1, 1);

    public static async Task<LessonTemplate?> CreateTemplateFromLessonAsync(
        LessonCueDb db, Guid lessonId, string name, string description, CancellationToken ct)
    {
        var source = await db.Lessons.AsNoTracking().Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == lessonId, ct);
        if (source is null) return null;

        var template = new LessonTemplate
        {
            Name = name.Trim(), Description = description.Trim(), DefaultTitle = source.Title,
            DefaultStartMinutes = MinutesOfDay(source.DesignatedStartAt),
            PreRollLeadMinutes = DifferenceMinutes(source.DesignatedStartAt, source.PreRollStartsAt),
            AvailableLeadMinutes = DifferenceMinutes(source.DesignatedStartAt, source.AvailableFrom),
            ExpiresAfterMinutes = DifferenceMinutes(source.ExpiresAt, source.DesignatedStartAt),
            PreRollEnabled = source.PreRollEnabled, KeepOffline = source.KeepOffline,
            DownloadDaysBefore = source.DownloadDaysBefore, VolumePercent = source.VolumePercent,
            Muted = source.Muted, SubstituteNotes = source.SubstituteNotes
        };
        foreach (var item in source.Items.OrderBy(x => x.Position)) template.Items.Add(CloneItem(item, template.Id));
        await PreserveTemplateMediaAsync(db, source.Items, ct);
        db.LessonTemplates.Add(template);
        db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = "template.create", Object = template.Id.ToString(), Summary = template.Name });
        await db.SaveChangesAsync(ct);
        return template;
    }

    public static async Task<bool> ReplaceTemplateFromLessonAsync(LessonCueDb db, Guid templateId,
        Guid lessonId, string actor, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var template = await db.LessonTemplates.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == templateId, ct);
        var source = await db.Lessons.AsNoTracking().Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == lessonId, ct);
        if (template is null || source is null) return false;
        template.Items.Clear();
        template.DefaultTitle = source.Title;
        template.DefaultStartMinutes = MinutesOfDay(source.DesignatedStartAt);
        template.PreRollLeadMinutes = DifferenceMinutes(source.DesignatedStartAt, source.PreRollStartsAt);
        template.AvailableLeadMinutes = DifferenceMinutes(source.DesignatedStartAt, source.AvailableFrom);
        template.ExpiresAfterMinutes = DifferenceMinutes(source.ExpiresAt, source.DesignatedStartAt);
        template.PreRollEnabled = source.PreRollEnabled;
        template.KeepOffline = source.KeepOffline;
        template.DownloadDaysBefore = source.DownloadDaysBefore;
        template.VolumePercent = source.VolumePercent;
        template.Muted = source.Muted;
        template.SubstituteNotes = source.SubstituteNotes;
        template.UpdatedAt = DateTimeOffset.UtcNow;
        foreach (var item in source.Items.OrderBy(x => x.Position))
        {
            var clone = CloneItem(item, template.Id);
            template.Items.Add(clone);
            db.LessonTemplateItems.Add(clone);
        }
        await PreserveTemplateMediaAsync(db, source.Items, ct);
        db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "template.structure.replace", Object = template.Id.ToString(), Summary = $"{template.Name} from {source.Title}" });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public static async Task<Lesson?> InstantiateAsync(LessonCueDb db, Guid templateId, Guid classId,
        DateOnly date, string? title, int? startMinutes, Guid? scheduleId, string actor, CancellationToken ct)
    {
        var template = await db.LessonTemplates.AsNoTracking().Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == templateId, ct);
        if (template is null || !await db.Classes.AnyAsync(x => x.Id == classId, ct)) return null;
        return await InstantiateLoadedAsync(db, template, classId, date, title, startMinutes, scheduleId, actor, ct);
    }

    public static async Task<int> GenerateAsync(LessonCueDb db, Guid scheduleId, DateOnly? throughDate,
        string actor, CancellationToken ct)
    {
        await GenerationLock.WaitAsync(ct);
        try
        {
            var schedule = await db.RecurringLessonSchedules.Include(x => x.Template).ThenInclude(x => x!.Items)
                .Include(x => x.Class).SingleOrDefaultAsync(x => x.Id == scheduleId, ct);
            if (schedule?.Template is null || schedule.Class is null) return -1;
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var through = throughDate ?? today.AddDays(schedule.GenerateDaysAhead);
            if (schedule.EndDate is DateOnly end && through > end) through = end;
            if (through < schedule.StartDate) return 0;
            if (through.DayNumber - schedule.StartDate.DayNumber > 3660)
                throw new InvalidOperationException("A schedule can generate at most ten years at a time.");

            var dates = Occurrences(schedule, through).Take(1000).ToList();
            var existing = await db.Lessons.IgnoreQueryFilters().AsNoTracking()
                .Where(x => x.GeneratedByScheduleId == schedule.Id && dates.Contains(x.Date))
                .Select(x => x.Date).ToListAsync(ct);
            var existingSet = existing.ToHashSet();
            var created = 0;
            foreach (var date in dates.Where(x => !existingSet.Contains(x)))
            {
                var title = FormatTitle(schedule.TitlePattern, schedule.Template.DefaultTitle, schedule.Class.Name, date);
                await InstantiateLoadedAsync(db, schedule.Template, schedule.ClassId, date, title,
                    schedule.StartMinutes, schedule.Id, actor, ct, save: false);
                created++;
            }
            schedule.LastGeneratedAt = DateTimeOffset.UtcNow;
            schedule.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent
            {
                Actor = actor, Action = "schedule.generate", Object = schedule.Id.ToString(),
                Summary = $"{schedule.Name}: {created} lesson(s) through {through:yyyy-MM-dd}"
            });
            await db.SaveChangesAsync(ct);
            return created;
        }
        finally { GenerationLock.Release(); }
    }

    public static IReadOnlyList<DateOnly> Occurrences(RecurringLessonSchedule schedule, DateOnly through)
    {
        var excluded = ParseDates(schedule.ExcludedDatesJson);
        IEnumerable<DateOnly> values = schedule.Frequency switch
        {
            "monthly" => MonthlyDates(schedule, through),
            "custom" => ParseDates(schedule.CustomDatesJson).OrderBy(x => x),
            _ => WeeklyDates(schedule, through)
        };
        return values.Where(x => x >= schedule.StartDate && x <= through &&
            (schedule.EndDate is null || x <= schedule.EndDate.Value) && !excluded.Contains(x)).Distinct().OrderBy(x => x).ToList();
    }

    public static string SerializeDates(IEnumerable<DateOnly> dates) =>
        JsonSerializer.Serialize(dates.Distinct().OrderBy(x => x).Select(x => x.ToString("yyyy-MM-dd")));

    public static HashSet<DateOnly> ParseDates(string? json)
    {
        try
        {
            return (JsonSerializer.Deserialize<List<string>>(json ?? "[]") ?? [])
                .Select(x => DateOnly.TryParse(x, out var date) ? (DateOnly?)date : null)
                .Where(x => x is not null).Select(x => x!.Value).ToHashSet();
        }
        catch (JsonException) { return []; }
    }

    private static IEnumerable<DateOnly> WeeklyDates(RecurringLessonSchedule schedule, DateOnly through)
    {
        var weekday = schedule.DayOfWeek is >= 0 and <= 6 ? schedule.DayOfWeek.Value : (int)schedule.StartDate.DayOfWeek;
        var first = schedule.StartDate;
        while ((int)first.DayOfWeek != weekday) first = first.AddDays(1);
        var step = Math.Clamp(schedule.Interval, 1, 52) * 7;
        for (var date = first; date <= through; date = date.AddDays(step)) yield return date;
    }

    private static IEnumerable<DateOnly> MonthlyDates(RecurringLessonSchedule schedule, DateOnly through)
    {
        var day = Math.Clamp(schedule.DayOfMonth ?? schedule.StartDate.Day, 1, 31);
        var step = Math.Clamp(schedule.Interval, 1, 24);
        var month = new DateOnly(schedule.StartDate.Year, schedule.StartDate.Month, 1);
        while (month <= through)
        {
            if (day <= DateTime.DaysInMonth(month.Year, month.Month))
            {
                var candidate = new DateOnly(month.Year, month.Month, day);
                if (candidate >= schedule.StartDate) yield return candidate;
            }
            month = month.AddMonths(step);
        }
    }

    private static async Task<Lesson> InstantiateLoadedAsync(LessonCueDb db, LessonTemplate template, Guid classId,
        DateOnly date, string? title, int? startMinutes, Guid? scheduleId, string actor, CancellationToken ct, bool save = true)
    {
        var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
        var start = LocalDateTime(date, startMinutes ?? template.DefaultStartMinutes, organization.TimeZone);
        var lesson = new Lesson
        {
            ClassId = classId, Date = date,
            Title = string.IsNullOrWhiteSpace(title) ? template.DefaultTitle : title.Trim(),
            DesignatedStartAt = start,
            AvailableFrom = start is not null && template.AvailableLeadMinutes is int available
                ? start.Value.AddMinutes(-available) : null,
            ExpiresAt = start is not null && template.ExpiresAfterMinutes is int expires
                ? start.Value.AddMinutes(expires) : null,
            PreRollStartsAt = start is not null && template.PreRollLeadMinutes is int preRoll
                ? start.Value.AddMinutes(-preRoll) : null,
            PreRollEnabled = template.PreRollEnabled, KeepOffline = template.KeepOffline,
            DownloadDaysBefore = template.DownloadDaysBefore, GeneratedByScheduleId = scheduleId,
            VolumePercent = template.VolumePercent, Muted = template.Muted,
            SubstituteNotes = template.SubstituteNotes
        };
        foreach (var source in template.Items.OrderBy(x => x.Position))
        {
            var item = CloneItem(source, lesson.Id);
            lesson.Items.Add(item);
            if (source.Role == "countdown") lesson.CountdownItemId = item.Id;
        }
        var mediaIds = lesson.Items.Where(x => x.MediaAssetId != null).Select(x => x.MediaAssetId!.Value).Distinct().ToList();
        var media = await db.MediaAssets.Where(x => mediaIds.Contains(x.Id) && x.StoragePolicy == MediaRetention.LessonScoped).ToListAsync(ct);
        foreach (var asset in media) MediaRetention.KeepForLesson(asset, lesson);
        db.Lessons.Add(lesson);
        db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = scheduleId is null ? "template.instantiate" : "schedule.lesson.create", Object = lesson.Id.ToString(), Summary = lesson.Title });
        if (save) await db.SaveChangesAsync(ct);
        return lesson;
    }

    private static LessonTemplateItem CloneItem(PlaylistItem source, Guid templateId) => new()
    {
        TemplateId = templateId, Title = source.Title, Type = source.Type, Role = source.Role, Position = source.Position,
        MediaAssetId = source.MediaAssetId, DurationMs = source.DurationMs, StartMs = source.StartMs, EndMs = source.EndMs,
        VolumePercent = source.VolumePercent, ImageDurationSeconds = source.ImageDurationSeconds, EndBehavior = source.EndBehavior,
        AllowSkip = source.AllowSkip, Notes = source.Notes, FadeInMs = source.FadeInMs, FadeOutMs = source.FadeOutMs,
        NormalizeAudio = source.NormalizeAudio, CuePointsJson = source.CuePointsJson, FitMode = source.FitMode,
        RotationDegrees = source.RotationDegrees, CropLeftPercent = source.CropLeftPercent,
        CropTopPercent = source.CropTopPercent, CropRightPercent = source.CropRightPercent,
        CropBottomPercent = source.CropBottomPercent, Muted = source.Muted,
        PlaybackRatePercent = source.PlaybackRatePercent, RepeatCount = source.RepeatCount,
        BackgroundColor = source.BackgroundColor, TransitionStyle = source.TransitionStyle,
        TransitionDurationMs = source.TransitionDurationMs, FlexibleTime = source.FlexibleTime
    };

    private static async Task PreserveTemplateMediaAsync(LessonCueDb db, IEnumerable<PlaylistItem> items, CancellationToken ct)
    {
        var ids = items.Where(x => x.MediaAssetId is not null).Select(x => x.MediaAssetId!.Value).Distinct().ToList();
        var assets = await db.MediaAssets.Where(x => ids.Contains(x.Id) && x.StoragePolicy == MediaRetention.LessonScoped).ToListAsync(ct);
        foreach (var asset in assets)
        {
            asset.StoragePolicy = MediaRetention.Persistent;
            asset.DeleteAfter = null;
            asset.RetentionDateIsManual = false;
            asset.OriginLessonId = null;
        }
    }

    private static PlaylistItem CloneItem(LessonTemplateItem source, Guid lessonId) => new()
    {
        LessonId = lessonId, Title = source.Title, Type = source.Type, Role = source.Role, Position = source.Position,
        MediaAssetId = source.MediaAssetId, DurationMs = source.DurationMs, StartMs = source.StartMs, EndMs = source.EndMs,
        VolumePercent = source.VolumePercent, ImageDurationSeconds = source.ImageDurationSeconds, EndBehavior = source.EndBehavior,
        AllowSkip = source.AllowSkip, Notes = source.Notes, FadeInMs = source.FadeInMs, FadeOutMs = source.FadeOutMs,
        NormalizeAudio = source.NormalizeAudio, CuePointsJson = source.CuePointsJson, FitMode = source.FitMode,
        RotationDegrees = source.RotationDegrees, CropLeftPercent = source.CropLeftPercent,
        CropTopPercent = source.CropTopPercent, CropRightPercent = source.CropRightPercent,
        CropBottomPercent = source.CropBottomPercent, Muted = source.Muted,
        PlaybackRatePercent = source.PlaybackRatePercent, RepeatCount = source.RepeatCount,
        BackgroundColor = source.BackgroundColor, TransitionStyle = source.TransitionStyle,
        TransitionDurationMs = source.TransitionDurationMs, FlexibleTime = source.FlexibleTime
    };

    private static int? MinutesOfDay(DateTimeOffset? value) => value is null ? null : value.Value.Hour * 60 + value.Value.Minute;
    private static int? DifferenceMinutes(DateTimeOffset? later, DateTimeOffset? earlier) =>
        later is null || earlier is null ? null : Math.Max(0, (int)Math.Round((later.Value - earlier.Value).TotalMinutes));

    private static DateTimeOffset? LocalDateTime(DateOnly date, int? minutes, string timeZoneId)
    {
        if (minutes is not >= 0 or > 1439) return null;
        TimeZoneInfo zone;
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId); }
        catch { zone = TimeZoneInfo.Local; }
        var local = date.ToDateTime(new TimeOnly(minutes.Value / 60, minutes.Value % 60), DateTimeKind.Unspecified);
        return new DateTimeOffset(local, zone.GetUtcOffset(local));
    }

    private static string FormatTitle(string pattern, string template, string className, DateOnly date) =>
        (string.IsNullOrWhiteSpace(pattern) ? "{template} — {date}" : pattern.Trim())
            .Replace("{template}", template, StringComparison.OrdinalIgnoreCase)
            .Replace("{class}", className, StringComparison.OrdinalIgnoreCase)
            .Replace("{date}", date.ToString("yyyy-MM-dd"), StringComparison.OrdinalIgnoreCase);
}

public sealed class RecurringLessonGeneratorService(IServiceScopeFactory scopes, IHubContext<SyncHub> hub,
    ILogger<RecurringLessonGeneratorService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                var ids = await db.RecurringLessonSchedules.AsNoTracking().Where(x => x.Enabled).Select(x => x.Id).ToListAsync(stoppingToken);
                foreach (var id in ids)
                {
                    var created = await LessonScheduleService.GenerateAsync(db, id, null, "system", stoppingToken);
                    if (created > 0) await hub.Clients.All.SendAsync("ManifestInvalidated",
                        new { type = "MANIFEST_INVALIDATED", generated = created }, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogError(error, "Recurring lesson generation failed"); }
            try { await Task.Delay(TimeSpan.FromHours(24), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
