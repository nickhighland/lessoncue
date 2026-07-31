using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record BackupPolicyInput(
    bool Enabled,
    string Frequency,
    int HourLocal,
    int? WeeklyDay,
    bool IncludeMedia,
    int RetentionCount,
    int RetentionDays,
    string SecretHandling,
    string? BackupPassword,
    string? RemoteWebDavUrl,
    string RemoteAuthentication,
    string? RemoteUsername,
    string? RemoteSecret);

public sealed record BackupPolicyStatus(
    bool Enabled,
    string Frequency,
    int HourLocal,
    int? WeeklyDay,
    bool IncludeMedia,
    int RetentionCount,
    int RetentionDays,
    string SecretHandling,
    bool BackupPasswordConfigured,
    string? RemoteWebDavUrl,
    string RemoteAuthentication,
    string? RemoteUsername,
    bool RemoteSecretConfigured,
    DateTimeOffset? LastAttemptAt,
    DateTimeOffset? LastSucceededAt,
    DateTimeOffset? LastVerifiedAt,
    string? LastBackupFileName,
    string? LastError,
    DateTimeOffset? NextRunAt,
    bool Overdue,
    bool Running);

public sealed class BackupPolicyService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string policyPath;
    private readonly IServiceScopeFactory scopes;
    private readonly BackupService backups;
    private readonly IDataProtector protector;
    private readonly IHttpClientFactory clients;
    private readonly ILogger<BackupPolicyService> logger;
    private readonly SemaphoreSlim gate = new(1, 1);
    private volatile bool running;

    public BackupPolicyService(
        string dataPath,
        IServiceScopeFactory scopes,
        BackupService backups,
        IDataProtectionProvider protection,
        IHttpClientFactory clients,
        ILogger<BackupPolicyService> logger)
    {
        policyPath = Path.Combine(dataPath, "config", "backup-policy.json");
        this.scopes = scopes;
        this.backups = backups;
        protector = protection.CreateProtector("LessonCue.BackupPolicy.v1");
        this.clients = clients;
        this.logger = logger;
    }

    public BackupPolicyStatus GetStatus(string timeZone)
    {
        var policy = Read();
        var next = policy.Enabled
            ? Schedule(policy, timeZone, DateTimeOffset.UtcNow)
            : null;
        return Public(policy, next);
    }

    public async Task<BackupPolicyStatus> UpdateAsync(
        BackupPolicyInput input,
        string timeZone,
        CancellationToken ct)
    {
        var current = Read();
        var frequency = input.Frequency.Trim().ToLowerInvariant();
        if (frequency is not ("daily" or "weekly"))
            throw new ArgumentException("Choose a daily or weekly backup schedule.");
        if (input.HourLocal is < 0 or > 23)
            throw new ArgumentException("Backup hour must be from 0 through 23.");
        if (frequency == "weekly" && input.WeeklyDay is not (>= 0 and <= 6))
            throw new ArgumentException("Choose a weekday for the weekly backup.");
        if (input.RetentionCount is < 1 or > 365)
            throw new ArgumentException("Keep between 1 and 365 scheduled backups.");
        if (input.RetentionDays is < 1 or > 3650)
            throw new ArgumentException("Retention must be from 1 to 3,650 days.");
        var secretHandling = input.SecretHandling.Trim().ToLowerInvariant();
        if (secretHandling is not ("exclude" or "include"))
            throw new ArgumentException("Choose whether server credentials are excluded or included.");

        var protectedPassword = current.ProtectedBackupPassword;
        if (!string.IsNullOrEmpty(input.BackupPassword))
        {
            if (input.BackupPassword.Length is < 12 or > 1024)
                throw new ArgumentException("Backup passwords must contain 12–1,024 characters.");
            protectedPassword = protector.Protect(input.BackupPassword);
        }
        if (input.Enabled && string.IsNullOrEmpty(protectedPassword))
            throw new ArgumentException("Enter the password for scheduled encrypted backups.");

        string? remoteUrl = null;
        var authentication = input.RemoteAuthentication.Trim().ToLowerInvariant();
        string? username = null;
        string? protectedRemoteSecret = null;
        if (!string.IsNullOrWhiteSpace(input.RemoteWebDavUrl))
        {
            remoteUrl = NormalizeRemoteUrl(input.RemoteWebDavUrl);
            if (authentication is not ("none" or "basic" or "bearer"))
                throw new ArgumentException("Choose no authentication, basic authentication, or a bearer token.");
            username = string.IsNullOrWhiteSpace(input.RemoteUsername)
                ? null
                : input.RemoteUsername.Trim();
            if (authentication == "basic" && string.IsNullOrWhiteSpace(username))
                throw new ArgumentException("Enter the WebDAV username.");
            var sameRemote = string.Equals(
                                 current.RemoteWebDavUrl, remoteUrl, StringComparison.Ordinal) &&
                             string.Equals(
                                 current.RemoteAuthentication, authentication, StringComparison.Ordinal) &&
                             string.Equals(current.RemoteUsername, username, StringComparison.Ordinal);
            protectedRemoteSecret = sameRemote ? current.ProtectedRemoteSecret : null;
            if (!string.IsNullOrEmpty(input.RemoteSecret))
            {
                if (input.RemoteSecret.Length > 4096)
                    throw new ArgumentException("The remote credential cannot exceed 4,096 characters.");
                protectedRemoteSecret = protector.Protect(input.RemoteSecret);
            }
            if (authentication != "none" && string.IsNullOrEmpty(protectedRemoteSecret))
                throw new ArgumentException("Enter the WebDAV password or bearer token.");
        }
        else
        {
            authentication = "none";
        }

        var revised = current with
        {
            Enabled = input.Enabled,
            EnabledAt = input.Enabled
                ? current.EnabledAt ?? DateTimeOffset.UtcNow
                : null,
            Frequency = frequency,
            HourLocal = input.HourLocal,
            WeeklyDay = frequency == "weekly" ? input.WeeklyDay : null,
            IncludeMedia = input.IncludeMedia,
            RetentionCount = input.RetentionCount,
            RetentionDays = input.RetentionDays,
            SecretHandling = secretHandling,
            ProtectedBackupPassword = protectedPassword,
            RemoteWebDavUrl = remoteUrl,
            RemoteAuthentication = authentication,
            RemoteUsername = username,
            ProtectedRemoteSecret = protectedRemoteSecret
        };
        await WriteAsync(revised, ct);
        return Public(
            revised,
            revised.Enabled ? Schedule(revised, timeZone, DateTimeOffset.UtcNow) : null);
    }

    public async Task<BackupPolicyStatus> RunNowAsync(string timeZone, CancellationToken ct)
    {
        var policy = Read();
        if (string.IsNullOrEmpty(policy.ProtectedBackupPassword))
            throw new InvalidOperationException(
                "Save a scheduled-backup password before running the policy.");
        await RunPolicyAsync(policy, ct);
        return GetStatus(timeZone);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(15));
        do
        {
            try
            {
                var policy = Read();
                if (policy.Enabled)
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                    var timeZone = await db.Organizations.AsNoTracking()
                        .Select(x => x.TimeZone)
                        .FirstOrDefaultAsync(stoppingToken) ?? "UTC";
                    var boundary = LatestBoundary(policy, timeZone, DateTimeOffset.UtcNow);
                    var recentlyAttempted = policy.LastAttemptAt is not null &&
                                            policy.LastAttemptAt > DateTimeOffset.UtcNow.AddHours(-1);
                    if (!recentlyAttempted &&
                        (policy.LastSucceededAt is null || policy.LastSucceededAt < boundary))
                        await RunPolicyAsync(policy, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Scheduled LessonCue backup failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunPolicyAsync(StoredBackupPolicy requested, CancellationToken ct)
    {
        if (!await gate.WaitAsync(0, ct))
            throw new InvalidOperationException("A scheduled backup is already running.");
        running = true;
        var policy = requested with { LastAttemptAt = DateTimeOffset.UtcNow, LastError = null };
        await WriteAsync(policy, ct);
        try
        {
            var password = protector.Unprotect(
                policy.ProtectedBackupPassword ??
                throw new InvalidOperationException("The scheduled backup password is missing."));
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
            var record = await backups.CreateAsync(
                db,
                policy.IncludeMedia,
                "scheduled-backup",
                ct,
                password,
                policy.SecretHandling);
            var verification = await backups.VerifyStoredAsync(record, ct, password);
            var verifiedAt = DateTimeOffset.UtcNow;

            if (!string.IsNullOrEmpty(policy.RemoteWebDavUrl))
                await UploadRemoteAsync(policy, record, ct);

            db.AuditEvents.Add(new AuditEvent
            {
                Actor = "system",
                Action = "backup.schedule.run",
                Object = record.Id.ToString(),
                Summary = JsonSerializer.Serialize(new
                {
                    record.FileName,
                    remote = !string.IsNullOrEmpty(policy.RemoteWebDavUrl),
                    verification.FileCount
                })
            });
            await PruneAsync(db, policy, record.Id, ct);
            await db.SaveChangesAsync(ct);
            policy = policy with
            {
                LastSucceededAt = DateTimeOffset.UtcNow,
                LastVerifiedAt = verifiedAt,
                LastBackupFileName = record.FileName,
                LastError = null
            };
            await WriteAsync(policy, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            policy = policy with { LastError = SafeError(ex) };
            await WriteAsync(policy, CancellationToken.None);
            throw;
        }
        finally
        {
            running = false;
            gate.Release();
        }
    }

    private async Task UploadRemoteAsync(
        StoredBackupPolicy policy,
        BackupRecord record,
        CancellationToken ct)
    {
        var path = backups.Resolve(record.FileName)
                   ?? throw new FileNotFoundException("The scheduled backup file is missing.");
        var target = new Uri(
            new Uri(policy.RemoteWebDavUrl!, UriKind.Absolute),
            Uri.EscapeDataString(record.FileName));
        using var request = new HttpRequestMessage(HttpMethod.Put, target);
        var secret = string.IsNullOrEmpty(policy.ProtectedRemoteSecret)
            ? null
            : protector.Unprotect(policy.ProtectedRemoteSecret);
        if (policy.RemoteAuthentication == "basic")
        {
            var raw = Convert.ToBase64String(
                Encoding.UTF8.GetBytes($"{policy.RemoteUsername}:{secret}"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", raw);
        }
        else if (policy.RemoteAuthentication == "bearer")
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        }

        await using var stream = File.OpenRead(path);
        request.Content = new StreamContent(stream);
        request.Content.Headers.ContentType =
            new MediaTypeHeaderValue("application/vnd.lessoncue.backup");
        request.Content.Headers.ContentLength = stream.Length;
        var response = await clients.CreateClient("backup-offsite")
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        using (response)
        {
            if (!response.IsSuccessStatusCode)
                throw new IOException(
                    $"The WebDAV target rejected the backup ({(int)response.StatusCode}).");
        }
    }

    private async Task PruneAsync(
        LessonCueDb db,
        StoredBackupPolicy policy,
        Guid currentId,
        CancellationToken ct)
    {
        var records = (await db.BackupRecords
            .Where(x => x.CreatedBy == "scheduled-backup")
            .ToListAsync(ct))
            .OrderByDescending(x => x.CreatedAt)
            .ToList();
        var cutoff = DateTimeOffset.UtcNow.AddDays(-policy.RetentionDays);
        foreach (var record in records
                     .Where((record, index) =>
                         record.Id != currentId &&
                         (index >= policy.RetentionCount || record.CreatedAt < cutoff))
                     .ToList())
        {
            var path = backups.Resolve(record.FileName);
            if (path is not null) TryDelete(path);
            db.BackupRecords.Remove(record);
        }
    }

    private BackupPolicyStatus Public(StoredBackupPolicy policy, DateTimeOffset? next)
    {
        var interval = policy.Frequency == "weekly"
            ? TimeSpan.FromDays(8)
            : TimeSpan.FromHours(30);
        var overdue = policy.Enabled &&
                      (policy.LastSucceededAt is not null
                          ? policy.LastSucceededAt < DateTimeOffset.UtcNow - interval
                          : policy.EnabledAt is not null &&
                            policy.EnabledAt < DateTimeOffset.UtcNow - interval);
        return new BackupPolicyStatus(
            policy.Enabled,
            policy.Frequency,
            policy.HourLocal,
            policy.WeeklyDay,
            policy.IncludeMedia,
            policy.RetentionCount,
            policy.RetentionDays,
            policy.SecretHandling,
            !string.IsNullOrEmpty(policy.ProtectedBackupPassword),
            policy.RemoteWebDavUrl,
            policy.RemoteAuthentication,
            policy.RemoteUsername,
            !string.IsNullOrEmpty(policy.ProtectedRemoteSecret),
            policy.LastAttemptAt,
            policy.LastSucceededAt,
            policy.LastVerifiedAt,
            policy.LastBackupFileName,
            policy.LastError,
            next,
            overdue,
            running);
    }

    private StoredBackupPolicy Read()
    {
        try
        {
            return File.Exists(policyPath)
                ? JsonSerializer.Deserialize<StoredBackupPolicy>(
                      File.ReadAllText(policyPath), JsonOptions) ??
                  new StoredBackupPolicy()
                : new StoredBackupPolicy();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "LessonCue could not read the scheduled-backup policy");
            return new StoredBackupPolicy
            {
                LastError = "The scheduled-backup policy is unreadable. Save it again."
            };
        }
    }

    private async Task WriteAsync(StoredBackupPolicy policy, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(policyPath)!);
        var temporary = $"{policyPath}.{Guid.NewGuid():N}.tmp";
        try
        {
            await File.WriteAllTextAsync(
                temporary, JsonSerializer.Serialize(policy, JsonOptions), ct);
            if (!OperatingSystem.IsWindows())
                File.SetUnixFileMode(
                    temporary,
                    UnixFileMode.UserRead | UnixFileMode.UserWrite);
            File.Move(temporary, policyPath, true);
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    private static DateTimeOffset? Schedule(
        StoredBackupPolicy policy,
        string timeZone,
        DateTimeOffset now)
    {
        var latest = LatestBoundary(policy, timeZone, now);
        if (policy.LastSucceededAt is null || policy.LastSucceededAt < latest)
            return latest;
        return policy.Frequency == "weekly"
            ? latest.AddDays(7)
            : latest.AddDays(1);
    }

    private static DateTimeOffset LatestBoundary(
        StoredBackupPolicy policy,
        string timeZone,
        DateTimeOffset now)
    {
        TimeZoneInfo zone;
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(timeZone); }
        catch { zone = TimeZoneInfo.Utc; }
        var localNow = TimeZoneInfo.ConvertTime(now, zone);
        var date = DateOnly.FromDateTime(localNow.Date);
        if (policy.Frequency == "weekly")
        {
            var target = (DayOfWeek)(policy.WeeklyDay ?? 0);
            var daysBack = ((int)localNow.DayOfWeek - (int)target + 7) % 7;
            date = date.AddDays(-daysBack);
        }
        var boundary = LocalBoundary(date, policy.HourLocal, zone);
        if (boundary > now)
            boundary = LocalBoundary(
                date.AddDays(policy.Frequency == "weekly" ? -7 : -1),
                policy.HourLocal,
                zone);
        return boundary;
    }

    private static DateTimeOffset LocalBoundary(
        DateOnly date,
        int hour,
        TimeZoneInfo zone)
    {
        var local = date.ToDateTime(new TimeOnly(hour, 0), DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(local)) local = local.AddMinutes(30);
        var offsets = zone.IsAmbiguousTime(local)
            ? zone.GetAmbiguousTimeOffsets(local)
            : [zone.GetUtcOffset(local)];
        return new DateTimeOffset(local, offsets.Max()).ToUniversalTime();
    }

    private static string NormalizeRemoteUrl(string value)
    {
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException(
                "Enter an HTTPS WebDAV folder URL without a query or fragment.");
        var builder = new UriBuilder(uri);
        if (!builder.Path.EndsWith('/')) builder.Path += "/";
        return builder.Uri.AbsoluteUri;
    }

    private static string SafeError(Exception exception)
    {
        var message = exception.Message.Replace('\r', ' ').Replace('\n', ' ').Trim();
        return message.Length <= 500 ? message : message[..500];
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { }
    }

    private sealed record StoredBackupPolicy
    {
        public bool Enabled { get; init; }
        public DateTimeOffset? EnabledAt { get; init; }
        public string Frequency { get; init; } = "daily";
        public int HourLocal { get; init; } = 2;
        public int? WeeklyDay { get; init; }
        public bool IncludeMedia { get; init; } = true;
        public int RetentionCount { get; init; } = 7;
        public int RetentionDays { get; init; } = 30;
        public string SecretHandling { get; init; } = "exclude";
        public string? ProtectedBackupPassword { get; init; }
        public string? RemoteWebDavUrl { get; init; }
        public string RemoteAuthentication { get; init; } = "none";
        public string? RemoteUsername { get; init; }
        public string? ProtectedRemoteSecret { get; init; }
        public DateTimeOffset? LastAttemptAt { get; init; }
        public DateTimeOffset? LastSucceededAt { get; init; }
        public DateTimeOffset? LastVerifiedAt { get; init; }
        public string? LastBackupFileName { get; init; }
        public string? LastError { get; init; }
    }
}
