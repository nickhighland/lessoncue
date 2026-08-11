using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Globalization;
using System.Xml;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public sealed record BackupDestinationInput(
    string Provider,
    string? WebDavUrl,
    string Authentication,
    string? Username,
    string? Secret,
    int RetentionCount,
    int RetentionDays);

public sealed record BackupDestinationStatus(
    string Provider,
    bool Enabled,
    string? WebDavUrl,
    string Authentication,
    string? Username,
    bool SecretConfigured,
    int RetentionCount,
    int RetentionDays,
    DateTimeOffset? LastUploadedAt,
    string? LastUploadedFileName,
    int? RemoteBackupCount,
    string? LastError);

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
    string? RemoteSecret,
    IReadOnlyList<BackupDestinationInput>? Destinations = null);

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
    bool Running,
    IReadOnlyList<BackupDestinationStatus>? Destinations = null);

public sealed class BackupPolicyService : BackgroundService
{
    private static readonly XNamespace DavNamespace = "DAV:";
    private static readonly HttpMethod PropFindMethod = new("PROPFIND");
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

        var requestedDestinations = input.Destinations ?? LegacyDestination(input);
        var destinations = new List<StoredBackupDestination>();
        var providers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var requested in requestedDestinations)
        {
            if (string.IsNullOrWhiteSpace(requested.WebDavUrl)) continue;
            var provider = NormalizeProvider(requested.Provider);
            if (!providers.Add(provider))
                throw new ArgumentException($"Configure only one {provider} backup destination.");
            var remoteUrl = NormalizeRemoteUrl(requested.WebDavUrl);
            var authentication = requested.Authentication.Trim().ToLowerInvariant();
            if (authentication is not ("none" or "basic" or "bearer"))
                throw new ArgumentException("Choose no authentication, basic authentication, or a bearer token.");
            var username = string.IsNullOrWhiteSpace(requested.Username)
                ? null
                : requested.Username.Trim();
            if (authentication == "basic" && string.IsNullOrWhiteSpace(username))
                throw new ArgumentException($"Enter the {provider} WebDAV username.");
            if (requested.RetentionCount is < 1 or > 365)
                throw new ArgumentException($"{provider} backup retention must keep 1–365 copies.");
            if (requested.RetentionDays is < 1 or > 3650)
                throw new ArgumentException($"{provider} backup retention must be 1–3,650 days.");

            var previous = (current.Destinations ?? []).FirstOrDefault(destination =>
                string.Equals(destination.Provider, provider, StringComparison.OrdinalIgnoreCase));
            var sameRemote = previous is not null &&
                             string.Equals(previous.WebDavUrl, remoteUrl, StringComparison.Ordinal) &&
                             string.Equals(previous.Authentication, authentication, StringComparison.Ordinal) &&
                             string.Equals(previous.Username, username, StringComparison.Ordinal);
            var protectedRemoteSecret = sameRemote ? previous!.ProtectedSecret : null;
            if (!string.IsNullOrEmpty(requested.Secret))
            {
                if (requested.Secret.Length > 4096)
                    throw new ArgumentException("The remote credential cannot exceed 4,096 characters.");
                protectedRemoteSecret = protector.Protect(requested.Secret);
            }
            if (authentication != "none" && string.IsNullOrEmpty(protectedRemoteSecret))
                throw new ArgumentException($"Enter the {provider} WebDAV password or bearer token.");

            destinations.Add(new StoredBackupDestination
            {
                Provider = provider,
                WebDavUrl = remoteUrl,
                Authentication = authentication,
                Username = username,
                ProtectedSecret = protectedRemoteSecret,
                RetentionCount = requested.RetentionCount,
                RetentionDays = requested.RetentionDays,
                LastUploadedAt = sameRemote ? previous!.LastUploadedAt : null,
                LastUploadedFileName = sameRemote ? previous!.LastUploadedFileName : null,
                RemoteBackupCount = sameRemote ? previous!.RemoteBackupCount : null,
                LastError = sameRemote ? previous!.LastError : null
            });
        }

        var legacy = destinations.FirstOrDefault(destination =>
            string.Equals(destination.Provider, "webdav", StringComparison.OrdinalIgnoreCase));

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
            RemoteWebDavUrl = legacy?.WebDavUrl,
            RemoteAuthentication = legacy?.Authentication ?? "none",
            RemoteUsername = legacy?.Username,
            ProtectedRemoteSecret = legacy?.ProtectedSecret,
            Destinations = destinations
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

            var remoteErrors = new List<string>();
            var destinations = policy.Destinations?.ToList() ?? [];
            for (var index = 0; index < destinations.Count; index++)
            {
                var destination = destinations[index];
                try
                {
                    await UploadRemoteAsync(destination, record, ct);
                    var remaining = await PruneRemoteAsync(destination, ct);
                    destinations[index] = destination with
                    {
                        LastUploadedAt = DateTimeOffset.UtcNow,
                        LastUploadedFileName = record.FileName,
                        RemoteBackupCount = remaining,
                        LastError = null
                    };
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    var safeError = SafeError(ex);
                    destinations[index] = destination with { LastError = safeError };
                    remoteErrors.Add($"{destination.Provider}: {safeError}");
                }
            }
            policy = policy with { Destinations = destinations };
            await WriteAsync(policy, ct);
            if (remoteErrors.Count > 0)
                throw new IOException($"One or more off-site backup destinations failed: {string.Join("; ", remoteErrors)}");

            db.AuditEvents.Add(new AuditEvent
            {
                Actor = "system",
                Action = "backup.schedule.run",
                Object = record.Id.ToString(),
                Summary = JsonSerializer.Serialize(new
                {
                    record.FileName,
                    remote = destinations.Count,
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
        StoredBackupDestination destination,
        BackupRecord record,
        CancellationToken ct)
    {
        var path = backups.Resolve(record.FileName)
                   ?? throw new FileNotFoundException("The scheduled backup file is missing.");
        var target = new Uri(
            new Uri(destination.WebDavUrl!, UriKind.Absolute),
            Uri.EscapeDataString(record.FileName));
        using var request = new HttpRequestMessage(HttpMethod.Put, target);
        var secret = string.IsNullOrEmpty(destination.ProtectedSecret)
            ? null
            : protector.Unprotect(destination.ProtectedSecret);
        AddRemoteAuthorization(request, destination, secret);
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
                    $"The {destination.Provider} WebDAV target rejected the backup ({(int)response.StatusCode}).");
        }
    }

    private async Task<int> PruneRemoteAsync(
        StoredBackupDestination destination,
        CancellationToken ct)
    {
        var baseUri = new Uri(destination.WebDavUrl!, UriKind.Absolute);
        using var request = new HttpRequestMessage(PropFindMethod, baseUri);
        request.Headers.Add("Depth", "1");
        request.Content = new StringContent(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:getlastmodified /></d:prop></d:propfind>",
            Encoding.UTF8,
            "application/xml");
        var secret = string.IsNullOrEmpty(destination.ProtectedSecret)
            ? null
            : protector.Unprotect(destination.ProtectedSecret);
        AddRemoteAuthorization(request, destination, secret);
        var response = await clients.CreateClient("backup-offsite")
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        List<WebDavEntry> entries;
        using (response)
        {
            if ((int)response.StatusCode is not (200 or 207))
                throw new IOException(
                    $"The {destination.Provider} WebDAV folder could not be listed ({(int)response.StatusCode}).");
            await using var content = await response.Content.ReadAsStreamAsync(ct);
            entries = await ReadRemoteEntriesAsync(content, baseUri, ct);
        }
        var candidates = entries
            .Where(entry => entry.FileName.StartsWith("lessoncue-", StringComparison.OrdinalIgnoreCase) &&
                            entry.FileName.EndsWith(".lcbak", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(entry => entry.LastModified ?? DateTimeOffset.MinValue)
            .ThenByDescending(entry => entry.FileName, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var cutoff = DateTimeOffset.UtcNow.AddDays(-destination.RetentionDays);
        var keep = candidates.Take(destination.RetentionCount)
            .Select(entry => entry.FileName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in candidates)
        {
            if (keep.Contains(entry.FileName) &&
                (entry.LastModified is null || entry.LastModified >= cutoff))
                continue;
            await DeleteRemoteAsync(destination, baseUri, entry.FileName, ct);
        }
        return candidates.Count(entry => keep.Contains(entry.FileName) &&
                                         (entry.LastModified is null || entry.LastModified >= cutoff));
    }

    private async Task DeleteRemoteAsync(
        StoredBackupDestination destination,
        Uri baseUri,
        string fileName,
        CancellationToken ct)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Delete,
            new Uri(baseUri, Uri.EscapeDataString(fileName)));
        var secret = string.IsNullOrEmpty(destination.ProtectedSecret)
            ? null
            : protector.Unprotect(destination.ProtectedSecret);
        AddRemoteAuthorization(request, destination, secret);
        var response = await clients.CreateClient("backup-offsite").SendAsync(request, ct);
        using (response)
        {
            if (!response.IsSuccessStatusCode && response.StatusCode != System.Net.HttpStatusCode.NotFound)
                throw new IOException(
                    $"The {destination.Provider} WebDAV target rejected backup cleanup ({(int)response.StatusCode}).");
        }
    }

    private static void AddRemoteAuthorization(
        HttpRequestMessage request,
        StoredBackupDestination destination,
        string? secret)
    {
        if (destination.Authentication == "basic")
        {
            var raw = Convert.ToBase64String(
                Encoding.UTF8.GetBytes($"{destination.Username}:{secret}"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", raw);
        }
        else if (destination.Authentication == "bearer")
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        }
    }

    private static async Task<List<WebDavEntry>> ReadRemoteEntriesAsync(
        Stream content,
        Uri baseUri,
        CancellationToken ct)
    {
        var settings = new XmlReaderSettings
        {
            Async = true,
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = 2_000_000
        };
        using var reader = XmlReader.Create(content, settings);
        var document = await XDocument.LoadAsync(reader, LoadOptions.None, ct);
        return document.Descendants(DavNamespace + "response")
            .Select(response =>
            {
                var href = (string?)response.Element(DavNamespace + "href");
                if (string.IsNullOrWhiteSpace(href)) return null;
                Uri? uri = Uri.TryCreate(href, UriKind.Absolute, out var absolute)
                    ? absolute
                    : Uri.TryCreate(baseUri, href, out var relative) ? relative : null;
                if (uri is null) return null;
                if (!string.Equals(uri.Scheme, baseUri.Scheme, StringComparison.OrdinalIgnoreCase) ||
                    !string.Equals(uri.Host, baseUri.Host, StringComparison.OrdinalIgnoreCase) ||
                    uri.Port != baseUri.Port ||
                    !string.IsNullOrEmpty(uri.Query) ||
                    !uri.AbsolutePath.StartsWith(baseUri.AbsolutePath, StringComparison.Ordinal))
                    return null;
                var relativePath = uri.AbsolutePath[baseUri.AbsolutePath.Length..].Trim('/');
                if (relativePath.Length == 0 || relativePath.Contains('/')) return null;
                var fileName = Uri.UnescapeDataString(relativePath);
                if (string.IsNullOrWhiteSpace(fileName)) return null;
                var modifiedValue = (string?)response
                    .Descendants(DavNamespace + "getlastmodified")
                    .FirstOrDefault();
                DateTimeOffset? modified = DateTimeOffset.TryParse(
                    modifiedValue,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out var parsed)
                    ? parsed
                    : null;
                return new WebDavEntry(fileName, modified);
            })
            .Where(entry => entry is not null)
            .Select(entry => entry!)
            .GroupBy(entry => entry.FileName, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();
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
        var destinations = (policy.Destinations ?? []).Select(destination =>
            new BackupDestinationStatus(
                destination.Provider,
                !string.IsNullOrEmpty(destination.WebDavUrl),
                destination.WebDavUrl,
                destination.Authentication,
                destination.Username,
                !string.IsNullOrEmpty(destination.ProtectedSecret),
                destination.RetentionCount,
                destination.RetentionDays,
                destination.LastUploadedAt,
                destination.LastUploadedFileName,
                destination.RemoteBackupCount,
                destination.LastError)).ToArray();
        var legacy = (policy.Destinations ?? []).FirstOrDefault(destination =>
            string.Equals(destination.Provider, "webdav", StringComparison.OrdinalIgnoreCase));
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
            legacy?.WebDavUrl ?? policy.RemoteWebDavUrl,
            legacy?.Authentication ?? policy.RemoteAuthentication,
            legacy?.Username ?? policy.RemoteUsername,
            !string.IsNullOrEmpty(legacy?.ProtectedSecret ?? policy.ProtectedRemoteSecret),
            policy.LastAttemptAt,
            policy.LastSucceededAt,
            policy.LastVerifiedAt,
            policy.LastBackupFileName,
            policy.LastError,
            next,
            overdue,
            running,
            destinations);
    }

    private StoredBackupPolicy Read()
    {
        try
        {
            var policy = File.Exists(policyPath)
                ? JsonSerializer.Deserialize<StoredBackupPolicy>(
                      File.ReadAllText(policyPath), JsonOptions) ??
                  new StoredBackupPolicy()
                : new StoredBackupPolicy();
            if ((policy.Destinations is null || policy.Destinations.Count == 0) &&
                !string.IsNullOrWhiteSpace(policy.RemoteWebDavUrl))
            {
                policy = policy with
                {
                    Destinations =
                    [
                        new StoredBackupDestination
                        {
                            Provider = "webdav",
                            WebDavUrl = policy.RemoteWebDavUrl,
                            Authentication = policy.RemoteAuthentication,
                            Username = policy.RemoteUsername,
                            ProtectedSecret = policy.ProtectedRemoteSecret,
                            RetentionCount = policy.RetentionCount,
                            RetentionDays = policy.RetentionDays
                        }
                    ]
                };
            }
            return policy;
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
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException(
                "Enter an HTTPS WebDAV folder URL without a query or fragment.");
        var builder = new UriBuilder(uri);
        if (!builder.Path.EndsWith('/')) builder.Path += "/";
        return builder.Uri.AbsoluteUri;
    }

    private static string NormalizeProvider(string value)
    {
        var provider = value.Trim().ToLowerInvariant();
        return provider is "nextcloud" or "owncloud" or "webdav"
            ? provider
            : throw new ArgumentException("Choose Nextcloud, ownCloud, or another WebDAV destination.");
    }

    private static IReadOnlyList<BackupDestinationInput> LegacyDestination(BackupPolicyInput input) =>
        string.IsNullOrWhiteSpace(input.RemoteWebDavUrl)
            ? []
            :
            [
                new BackupDestinationInput(
                    "webdav",
                    input.RemoteWebDavUrl,
                    input.RemoteAuthentication,
                    input.RemoteUsername,
                    input.RemoteSecret,
                    input.RetentionCount,
                    input.RetentionDays)
            ];

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
        public List<StoredBackupDestination> Destinations { get; init; } = [];
        public DateTimeOffset? LastAttemptAt { get; init; }
        public DateTimeOffset? LastSucceededAt { get; init; }
        public DateTimeOffset? LastVerifiedAt { get; init; }
        public string? LastBackupFileName { get; init; }
        public string? LastError { get; init; }
    }

    private sealed record StoredBackupDestination
    {
        public string Provider { get; init; } = "webdav";
        public string? WebDavUrl { get; init; }
        public string Authentication { get; init; } = "none";
        public string? Username { get; init; }
        public string? ProtectedSecret { get; init; }
        public int RetentionCount { get; init; } = 7;
        public int RetentionDays { get; init; } = 30;
        public DateTimeOffset? LastUploadedAt { get; init; }
        public string? LastUploadedFileName { get; init; }
        public int? RemoteBackupCount { get; init; }
        public string? LastError { get; init; }
    }

    private sealed record WebDavEntry(string FileName, DateTimeOffset? LastModified);
}
