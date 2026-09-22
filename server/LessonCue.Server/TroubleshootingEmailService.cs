using System.Globalization;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record DailyTroubleshootingEmailStatus(
    bool Enabled,
    string Recipient,
    string TimeLocal,
    bool ProviderConfigured,
    DateTimeOffset? LastSentAt,
    string? LastError,
    DateTimeOffset? NextRunAt);

/// <summary>
/// Sends an opt-in failures-only troubleshooting bundle once per organization
/// local day. The recipient and schedule are database settings; provider keys
/// remain in AccountEmailService's protected configuration file.
/// </summary>
public sealed class TroubleshootingEmailService(
    IServiceScopeFactory scopes,
    AccountEmailService email,
    TroubleshootingReportBuilder reports,
    ILogger<TroubleshootingEmailService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(5);
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly SemaphoreSlim sendNowSignal = new(0);
    private int sendNowQueued;

    /// <summary>
    /// Queue a manual delivery and return immediately. Building the diagnostic
    /// bundle can inspect large media files and probe optional integrations, so
    /// doing that work in the browser request made a successful email provider
    /// look like a 502 from the reverse proxy.
    /// </summary>
    public async Task<DailyTroubleshootingEmailStatus> QueueSendNowAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
        var organization = await db.Organizations.OrderBy(item => item.Id).FirstOrDefaultAsync(ct);
        if (organization is null)
            throw new InvalidOperationException("The LessonCue organization has not been initialized.");

        var providerConfigured = email.Status(organization.EmailProvider).Configured;
        var recipient = organization.DailyTroubleshootingEmailRecipient.Trim().ToLowerInvariant();
        if (!TroubleshootingEmailSchedule.IsEmail(recipient))
            throw new InvalidOperationException("Set a valid daily troubleshooting recipient before sending delivery.");
        if (!providerConfigured)
            throw new InvalidOperationException(
                "Configure Resend or Brevo account email before sending daily troubleshooting delivery.");

        if (Interlocked.Exchange(ref sendNowQueued, 1) == 0)
            sendNowSignal.Release();
        return Status(organization, providerConfigured, DateTimeOffset.UtcNow);
    }

    public static DailyTroubleshootingEmailStatus Status(
        Organization organization, bool providerConfigured, DateTimeOffset now)
    {
        var next = organization.DailyTroubleshootingEmailEnabled
            ? TroubleshootingEmailSchedule.NextRun(
                organization.DailyTroubleshootingEmailTime,
                organization.TimeZone,
                organization.DailyTroubleshootingEmailLastSentAt,
                now)
            : null;
        return new DailyTroubleshootingEmailStatus(
            organization.DailyTroubleshootingEmailEnabled,
            organization.DailyTroubleshootingEmailRecipient,
            organization.DailyTroubleshootingEmailTime,
            providerConfigured,
            organization.DailyTroubleshootingEmailLastSentAt,
            organization.DailyTroubleshootingEmailLastError,
            next);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(PollInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            using var waitCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            var tickTask = timer.WaitForNextTickAsync(waitCts.Token).AsTask();
            var sendNowTask = sendNowSignal.WaitAsync(waitCts.Token);
            var completed = await Task.WhenAny(tickTask, sendNowTask);
            waitCts.Cancel();
            try { await tickTask; } catch (OperationCanceledException) { }
            try { await sendNowTask; } catch (OperationCanceledException) { }

            // If the timer and manual signal complete together, WhenAny may
            // return either task. Do not lose a queued manual delivery in
            // that race.
            var manual = sendNowTask.Status == TaskStatus.RanToCompletion;
            if (manual) Interlocked.Exchange(ref sendNowQueued, 0);
            try { await RunAsync(force: manual, DateTimeOffset.UtcNow, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception exception)
            {
                logger.LogError(exception, "Scheduled troubleshooting email failed");
            }
        }
    }

    private async Task<DailyTroubleshootingEmailStatus> RunAsync(
        bool force, DateTimeOffset now, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        Guid? organizationId = null;
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
            var organization = await db.Organizations.OrderBy(item => item.Id).FirstOrDefaultAsync(ct);
            if (organization is null)
                throw new InvalidOperationException("The LessonCue organization has not been initialized.");
            organizationId = organization.Id;

            var providerConfigured = email.Status(organization.EmailProvider).Configured;
            if (!force && !organization.DailyTroubleshootingEmailEnabled)
                return Status(organization, providerConfigured, now);

            var recipient = organization.DailyTroubleshootingEmailRecipient.Trim().ToLowerInvariant();
            if (!TroubleshootingEmailSchedule.IsEmail(recipient))
                return await HandleUnavailableAsync(
                    db, organization, providerConfigured,
                    "Set a valid daily troubleshooting recipient before enabling delivery.", force, now, ct);
            if (!providerConfigured)
                return await HandleUnavailableAsync(
                    db, organization, providerConfigured,
                    "Configure Resend or Brevo account email before enabling daily troubleshooting delivery.",
                    force, now, ct);

            if (!force && !TroubleshootingEmailSchedule.IsDue(
                    organization.DailyTroubleshootingEmailTime,
                    organization.TimeZone,
                    organization.DailyTroubleshootingEmailLastSentAt,
                    now))
                return Status(organization, providerConfigured, now);

            var report = await reports.BuildAsync(db, failuresOnly: true, ct: ct);
            var localDate = TroubleshootingEmailSchedule.LocalDate(now, organization.TimeZone);
            var attachment = new EmailAttachment(
                ReportAttachmentFileName(localDate),
                TroubleshootingReportBuilder.ToJson(report));
            var safeName = System.Net.WebUtility.HtmlEncode(organization.Name);
            var html = $"<p>Daily LessonCue troubleshooting report for <strong>{safeName}</strong>.</p>" +
                       "<ul>" +
                       $"<li>Runtime failure entries: {report.Runtime.Count}</li>" +
                       $"<li>Failed audit entries: {report.Audit.Count}</li>" +
                       $"<li>Media items needing attention: {report.MediaAttentionCount}</li>" +
                       $"<li>TVs needing attention: {report.ScreenAttentionCount}</li>" +
                       $"<li>Diagnostic components unavailable: {report.DiagnosticErrors.Count}</li>" +
                       "</ul>" +
                       "<p>The attached JSON contains the redacted failures-only runtime/audit log, " +
                       "recent media state and file checks, converter dependencies, and TV diagnostics. " +
                       "Routine successful HTTP request entries and credentials/tokens are excluded. " +
                       "Any partial diagnostic failures are listed in the JSON so they can be fixed on the next review.</p>";
            await email.SendAsync(
                organization,
                recipient,
                $"LessonCue daily troubleshooting report — {localDate:yyyy-MM-dd}",
                html,
                ct,
                [attachment]);

            organization.DailyTroubleshootingEmailLastSentAt = now;
            organization.DailyTroubleshootingEmailLastError = null;
            db.AuditEvents.Add(new AuditEvent
            {
                Actor = "system",
                Action = "troubleshooting.email.sent",
                Object = organization.Id.ToString(),
                Summary = $"Failures-only report delivered through {organization.EmailProvider}."
            });
            await db.SaveChangesAsync(ct);
            return Status(organization, providerConfigured, now);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            if (organizationId is { } id)
            {
                try
                {
                    await using var failureScope = scopes.CreateAsyncScope();
                    var failureDb = failureScope.ServiceProvider.GetRequiredService<LessonCueDb>();
                    var failureOrganization = await failureDb.Organizations
                        .SingleOrDefaultAsync(item => item.Id == id, CancellationToken.None);
                    if (failureOrganization is not null)
                    {
                        var failure = FailureText(error);
                        failureOrganization.DailyTroubleshootingEmailLastError = failure;
                        failureDb.AuditEvents.Add(new AuditEvent
                        {
                            Actor = "system",
                            Action = "troubleshooting.email.failed",
                            Object = id.ToString(),
                            Result = "failed",
                            Summary = failure,
                        });
                        await failureDb.SaveChangesAsync(CancellationToken.None);
                    }
                }
                catch (Exception saveError)
                {
                    logger.LogWarning(saveError, "Could not save the troubleshooting email failure state.");
                }
            }
            logger.LogError(error, "Troubleshooting email delivery failed.");
            throw;
        }
        finally { gate.Release(); }
    }

    /// <summary>
    /// Email providers commonly allow text attachments but reject diagnostic
    /// formats such as .gz and .json. Keep the payload as JSON while using a
    /// provider-safe filename so the daily report is delivered consistently.
    /// </summary>
    internal static string ReportAttachmentFileName(DateOnly localDate) =>
        $"lessoncue-troubleshooting-{localDate:yyyy-MM-dd}.txt";

    private static string FailureText(Exception error)
    {
        var message = error.Message.Trim();
        return message.Length <= 500 ? message : message[..500] + "…";
    }

    private static async Task<DailyTroubleshootingEmailStatus> HandleUnavailableAsync(
        LessonCueDb db, Organization organization, bool providerConfigured, string error,
        bool force, DateTimeOffset now, CancellationToken ct)
    {
        organization.DailyTroubleshootingEmailLastError = error;
        await db.SaveChangesAsync(ct);
        if (force) throw new InvalidOperationException(error);
        return Status(organization, providerConfigured, now);
    }
}

public static class TroubleshootingEmailSchedule
{
    public static bool IsEmail(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 200) return false;
        try
        {
            var address = new MailAddress(value.Trim());
            return address.Address.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    public static bool TryNormalizeTime(string? value, out string normalized)
    {
        if (TimeOnly.TryParseExact(value?.Trim(), ["H:mm", "HH:mm"],
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
        {
            normalized = time.ToString("HH:mm", CultureInfo.InvariantCulture);
            return true;
        }
        normalized = "";
        return false;
    }

    public static bool IsDue(string time, string timeZone, DateTimeOffset? lastSentAt, DateTimeOffset now)
    {
        var localNow = Convert(now, timeZone);
        if (!TryNormalizeTime(time, out var normalized) ||
            !TimeOnly.TryParseExact(normalized, "HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var scheduledTime))
            return false;
        var scheduled = LocalBoundary(DateOnly.FromDateTime(localNow.DateTime), scheduledTime, Resolve(timeZone));
        var lastLocalDate = lastSentAt is null ? (DateOnly?)null : LocalDate(lastSentAt.Value, timeZone);
        return localNow >= scheduled && lastLocalDate != DateOnly.FromDateTime(localNow.DateTime);
    }

    public static DateTimeOffset? NextRun(
        string time, string timeZone, DateTimeOffset? lastSentAt, DateTimeOffset now)
    {
        if (!TryNormalizeTime(time, out var normalized) ||
            !TimeOnly.TryParseExact(normalized, "HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var scheduledTime))
            return null;
        var zone = Resolve(timeZone);
        var localNow = TimeZoneInfo.ConvertTime(now, zone);
        var localDate = DateOnly.FromDateTime(localNow.DateTime);
        var scheduled = LocalBoundary(localDate, scheduledTime, zone);
        var lastLocalDate = lastSentAt is null ? (DateOnly?)null : LocalDate(lastSentAt.Value, timeZone);
        if (lastLocalDate == localDate || scheduled <= now)
            scheduled = LocalBoundary(localDate.AddDays(1), scheduledTime, zone);
        return scheduled;
    }

    public static DateOnly LocalDate(DateTimeOffset value, string timeZone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(value, Resolve(timeZone)).DateTime);

    private static DateTimeOffset Convert(DateTimeOffset value, string timeZone) =>
        TimeZoneInfo.ConvertTime(value, Resolve(timeZone));

    private static TimeZoneInfo Resolve(string timeZone)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(timeZone); }
        catch { return TimeZoneInfo.Utc; }
    }

    private static DateTimeOffset LocalBoundary(DateOnly date, TimeOnly time, TimeZoneInfo zone)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(local)) local = local.AddMinutes(30);
        var offsets = zone.IsAmbiguousTime(local)
            ? zone.GetAmbiguousTimeOffsets(local)
            : [zone.GetUtcOffset(local)];
        return new DateTimeOffset(local, offsets.Max()).ToUniversalTime();
    }
}
