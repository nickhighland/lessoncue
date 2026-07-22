using System.Security.Cryptography;
using System.Threading.RateLimiting;
using LessonCue.Server;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var dataPath = Environment.GetEnvironmentVariable("LESSONCUE_DATA_PATH")
    ?? Path.Combine(builder.Environment.ContentRootPath, "data");
if (AdminRecoveryCommand.IsRequested(args))
{
    Environment.ExitCode = await AdminRecoveryCommand.RunAsync(args, dataPath);
    return;
}
var configPath = Path.Combine(dataPath, "config");
var databasePath = Path.Combine(dataPath, "database");
var mediaPath = Path.Combine(dataPath, "media", "originals");
Directory.CreateDirectory(configPath);
Directory.CreateDirectory(databasePath);
Directory.CreateDirectory(mediaPath);
var keyPath = Path.Combine(configPath, "keys");
Directory.CreateDirectory(keyPath);
builder.Configuration.AddJsonFile(Path.Combine(configPath, "appsettings.json"), optional: true, reloadOnChange: true);

var port = HttpPortConfiguration.Resolve(dataPath);
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 20L * 1024 * 1024 * 1024);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 20L * 1024 * 1024 * 1024);

builder.Services.AddDbContext<LessonCueDb>(options =>
    options.UseSqlite($"Data Source={Path.Combine(databasePath, "lessoncue.db")}"));
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keyPath))
    .SetApplicationName("LessonCue");
builder.Services.AddScoped<ManifestService>();
builder.Services.AddSingleton(new PairingCodeService(dataPath, builder.Configuration["LessonCue:PairingPin"]));
builder.Services.AddSingleton(new BackupService(dataPath));
builder.Services.AddSingleton(new MediaStoragePaths(dataPath));
builder.Services.AddSingleton(new StorageService(dataPath));
builder.Services.AddSingleton<HardwareAccelerationService>();
builder.Services.AddHostedService(services => services.GetRequiredService<HardwareAccelerationService>());
builder.Services.AddSingleton(services => new HttpPortService(dataPath, port, services.GetRequiredService<ILogger<HttpPortService>>()));
builder.Services.AddHostedService(services => services.GetRequiredService<HttpPortService>());
builder.Services.AddSingleton(services => new LocalAddressService(dataPath, port, services.GetRequiredService<ILogger<LocalAddressService>>()));
builder.Services.AddHostedService(services => services.GetRequiredService<LocalAddressService>());
builder.Services.AddHostedService<MediaProcessingService>();
builder.Services.AddHostedService<AdaptiveTranscodeService>();
builder.Services.AddHostedService<PresentationConversionService>();
builder.Services.AddHostedService<YouTubeImportService>();
builder.Services.AddHostedService<MediaRetentionService>();
builder.Services.AddHostedService<RecurringLessonGeneratorService>();
builder.Services.AddSingleton(services => new ScreenDiagnosticCleanupService(services.GetRequiredService<IServiceScopeFactory>(),
    dataPath, services.GetRequiredService<ILogger<ScreenDiagnosticCleanupService>>()));
builder.Services.AddHostedService(services => services.GetRequiredService<ScreenDiagnosticCleanupService>());
builder.Services.AddHttpClient("updates", client =>
{
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("LessonCue-Server/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2026-03-10");
});
builder.Services.AddSingleton<UpdateService>();
builder.Services.AddHostedService(services => services.GetRequiredService<UpdateService>());
builder.Services.AddHttpClient("cloudflare-tunnel", client => client.Timeout = TimeSpan.FromSeconds(2));
builder.Services.AddHttpClient("account-email", client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddHttpClient("presentation-import", client =>
{
    client.Timeout = TimeSpan.FromMinutes(3);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("LessonCue-Server/1.0");
});
builder.Services.AddHttpClient("signage-widgets", client =>
{
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("LessonCue-Signage/1.0");
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<SignageWidgetService>();
builder.Services.AddHostedService(services => services.GetRequiredService<SignageWidgetService>());
builder.Services.AddSingleton(services => new AccountEmailService(dataPath,
    services.GetRequiredService<IDataProtectionProvider>(), services.GetRequiredService<IHttpClientFactory>(),
    services.GetRequiredService<ILogger<AccountEmailService>>()));
builder.Services.AddSingleton(services => new CloudflareTunnelService(dataPath,
    services.GetRequiredService<HttpPortService>(), services.GetRequiredService<IHttpClientFactory>(),
    services.GetRequiredService<ILogger<CloudflareTunnelService>>()));
builder.Services.AddHostedService(services => services.GetRequiredService<CloudflareTunnelService>());
builder.Services.AddSingleton<IPasswordHasher<PairingAttempt>, PasswordHasher<PairingAttempt>>();
builder.Services.AddSingleton<IPasswordHasher<AdminAccount>, PasswordHasher<AdminAccount>>();
builder.Services.AddSingleton<IPasswordHasher<Organization>, PasswordHasher<Organization>>();
builder.Services.AddSingleton<ControllerSessionService>();
builder.Services.AddSignalR();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "lessoncue.admin";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromHours(12);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
    options.Events.OnValidatePrincipal = async context =>
    {
        var id = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(id, out var accountId)) { context.RejectPrincipal(); return; }
        var sessionVersionValue = context.Principal?.FindFirst("session_version")?.Value;
        var sessionVersion = int.TryParse(sessionVersionValue, out var parsedVersion) ? parsedVersion : 1;
        var db = context.HttpContext.RequestServices.GetRequiredService<LessonCueDb>();
        if (!await db.AdminAccounts.AsNoTracking().AnyAsync(x => x.Id == accountId && !x.Disabled &&
            !x.PendingApproval && !x.PendingSetup && x.SessionVersion == sessionVersion,
            context.HttpContext.RequestAborted))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
    };
});
builder.Services.AddAuthorization(LessonCuePermissions.AddPolicies);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("pairing", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(5),
            QueueLimit = 0
        }));
    options.AddPolicy("account", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(15),
            QueueLimit = 0
        }));
});

var app = builder.Build();
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    ForwardLimit = 1
};
forwardedHeaders.KnownIPNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
forwardedHeaders.KnownProxies.Add(System.Net.IPAddress.Loopback);
forwardedHeaders.KnownProxies.Add(System.Net.IPAddress.IPv6Loopback);
app.UseForwardedHeaders(forwardedHeaders);
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers.ContentSecurityPolicy = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; frame-src 'self' https: http:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    var unsafeMethod = context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE";
    var restore = context.RequestServices.GetRequiredService<BackupService>();
    if (unsafeMethod && restore.IsRestoring && !context.Request.Path.StartsWithSegments("/api/v1/backups/restore"))
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { error = "LessonCue is restoring a backup. Try again after it finishes." });
        return;
    }
    if (unsafeMethod && context.Request.Path.StartsWithSegments("/api/v1") && context.User.Identity?.IsAuthenticated == true)
    {
        var origin = context.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin) && (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
            !string.Equals(uri.Authority, context.Request.Host.Value, StringComparison.OrdinalIgnoreCase)))
        { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
    }
    if (context.User.HasClaim("must_change_password", "true") &&
        context.Request.Path.StartsWithSegments("/api/v1") &&
        !context.Request.Path.StartsWithSegments("/api/v1/auth/session") &&
        !context.Request.Path.StartsWithSegments("/api/v1/auth/password/change-required") &&
        !context.Request.Path.StartsWithSegments("/api/v1/auth/logout"))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { error = "Change the temporary password before using LessonCue." });
        return;
    }
    await next();
});
app.UseAuthorization();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
    await db.Database.EnsureCreatedAsync();
    await DatabaseUpgrade.ApplyAsync(db);
    await SeedData.RunAsync(db);
}

var serverId = ServerIdentity.LoadOrCreate(dataPath);
var serverName = Environment.GetEnvironmentVariable("LESSONCUE_SERVER_NAME")
    ?? builder.Configuration["LessonCue:ServerName"] ?? "LessonCue";
var pairingCodes = app.Services.GetRequiredService<PairingCodeService>();
var localAddress = app.Services.GetRequiredService<LocalAddressService>();
var httpPort = app.Services.GetRequiredService<HttpPortService>();
app.Logger.LogInformation("LessonCue pairing PIN: {PairingPin}", pairingCodes.Current);

app.MapGet("/.well-known/lessoncue", () => new
{
    product = "LessonCue",
    serverId,
    serverName,
    localAddress = httpPort.Status.Address,
    apiVersion = 1,
    pairingEnabled = true
});

app.MapGet("/health", async (LessonCueDb db, CancellationToken ct) =>
    Results.Ok(new { status = await db.Database.CanConnectAsync(ct) ? "healthy" : "unhealthy", serverId }));

var api = app.MapGroup("/api/v1");

app.MapLessonCueAdmin(mediaPath, dataPath, serverId, serverName);

api.MapGet("/media/{mediaId:guid}/file", async (Guid mediaId, LessonCueDb db, CancellationToken ct) =>
{
    var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mediaId, ct);
    if (media is null || media.SourceKind == "link") return Results.NotFound();
    var path = Path.GetFullPath(Path.Combine(mediaPath, media.RelativePath));
    if (!path.StartsWith(Path.GetFullPath(mediaPath), StringComparison.Ordinal) || !File.Exists(path)) return Results.NotFound();
    return Results.File(path, media.ContentType, media.FileName, enableRangeProcessing: true,
        entityTag: media.Sha256 is null ? null : new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{media.Sha256}\""));
});

api.MapGet("/media/{mediaId:guid}/playback", async (Guid mediaId, LessonCueDb db,
    MediaStoragePaths paths, CancellationToken ct) =>
{
    var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mediaId, ct);
    if (media is null || media.SourceKind == "link") return Results.NotFound();
    var compatible = media.CompatibilityStatus == "ready" && !string.IsNullOrWhiteSpace(media.CompatibilityPath);
    var root = compatible ? paths.Compatibility : paths.Originals;
    var relative = compatible ? media.CompatibilityPath! : media.RelativePath;
    var normalizedRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
    var path = Path.GetFullPath(Path.Combine(root, relative));
    if (!path.StartsWith(normalizedRoot, StringComparison.Ordinal) || !File.Exists(path)) return Results.NotFound();
    var contentType = compatible ? "video/mp4" : media.ContentType;
    var fileName = compatible ? Path.GetFileNameWithoutExtension(media.FileName) + ".mp4" : media.FileName;
    var hash = compatible ? media.CompatibilitySha256 : media.Sha256;
    return Results.File(path, contentType, fileName, enableRangeProcessing: true,
        entityTag: hash is null ? null : new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{hash}\""));
});

api.MapGet("/media/{mediaId:guid}/transcodes/{profile}", async (Guid mediaId, string profile,
    LessonCueDb db, MediaStoragePaths paths, CancellationToken ct) =>
{
    var variant = await db.MediaTranscodeVariants.AsNoTracking().SingleOrDefaultAsync(x =>
        x.MediaAssetId == mediaId && x.Profile == profile && x.Status == "ready", ct);
    if (variant?.RelativePath is null) return Results.NotFound();
    var root = Path.GetFullPath(paths.Transcodes) + Path.DirectorySeparatorChar;
    var path = Path.GetFullPath(Path.Combine(paths.Transcodes, variant.RelativePath));
    if (!path.StartsWith(root, StringComparison.Ordinal) || !File.Exists(path)) return Results.NotFound();
    return Results.File(path, "video/mp4", enableRangeProcessing: true,
        entityTag: variant.Sha256 is null ? null : new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{variant.Sha256}\""));
});

api.MapGet("/media/{mediaId:guid}/thumbnail", async (Guid mediaId, LessonCueDb db, CancellationToken ct) =>
{
    var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mediaId, ct);
    if (media?.ThumbnailPath is null) return Results.NotFound();
    var thumbnails = Path.Combine(dataPath, "media", "thumbnails");
    var path = Path.GetFullPath(Path.Combine(thumbnails, media.ThumbnailPath));
    if (!path.StartsWith(Path.GetFullPath(thumbnails), StringComparison.Ordinal) || !File.Exists(path)) return Results.NotFound();
    return Results.File(path, "image/jpeg", enableRangeProcessing: true);
});

api.MapGet("/media/{mediaId:guid}/filmstrip", async (Guid mediaId, LessonCueDb db,
    MediaStoragePaths paths, CancellationToken ct) =>
{
    var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mediaId, ct);
    return DerivativeFile(media?.FilmstripPath, paths.Thumbnails, "image/jpeg");
});

api.MapGet("/media/{mediaId:guid}/waveform", async (Guid mediaId, LessonCueDb db,
    MediaStoragePaths paths, CancellationToken ct) =>
{
    var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mediaId, ct);
    return DerivativeFile(media?.WaveformPath, paths.Thumbnails, "image/png");
});

api.MapPost("/pairing/request", async (PairingRequestInput input, LessonCueDb db,
    IPasswordHasher<PairingAttempt> hasher, CancellationToken ct) =>
{
    var attempt = new PairingAttempt
    {
        DeviceName = input.DeviceName.Trim(),
        Platform = input.Platform,
        AppVersion = input.AppVersion,
        ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10)
    };
    attempt.PinHash = hasher.HashPassword(attempt, pairingCodes.Current);
    db.PairingAttempts.Add(attempt);
    db.AuditEvents.Add(new AuditEvent { Actor = input.DeviceName, Action = "screen.pair.request", Object = attempt.Id.ToString() });
    await db.SaveChangesAsync(ct);
    return Results.Accepted(value: new { requestId = attempt.Id, attempt.ExpiresAt });
}).RequireRateLimiting("pairing");

api.MapPost("/pairing/confirm", async (PairingConfirmInput input, LessonCueDb db,
    IPasswordHasher<PairingAttempt> hasher, CancellationToken ct) =>
{
    var attempt = await db.PairingAttempts.SingleOrDefaultAsync(x => x.Id == input.RequestId, ct);
    if (attempt is null || attempt.Completed || attempt.ExpiresAt <= DateTimeOffset.UtcNow || attempt.FailedAttempts >= 5)
        return Results.BadRequest(new { error = "Pairing request expired or locked." });
    var result = hasher.VerifyHashedPassword(attempt, attempt.PinHash, input.Pin);
    if (result == PasswordVerificationResult.Failed)
    {
        attempt.FailedAttempts++;
        await db.SaveChangesAsync(ct);
        return Results.BadRequest(new { error = "Incorrect PIN." });
    }

    var screen = new Screen { Name = attempt.DeviceName, Platform = attempt.Platform };
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    db.Screens.Add(screen);
    db.DeviceCredentials.Add(new DeviceCredential { ScreenId = screen.Id, TokenHash = HashToken(token) });
    attempt.Completed = true;
    db.AuditEvents.Add(new AuditEvent { Actor = attempt.DeviceName, Action = "screen.pair.complete", Object = screen.Id.ToString() });
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { screenId = screen.Id, deviceToken = token, apiVersion = 1, serverPublicKey = (string?)null });
}).RequireRateLimiting("pairing");

api.MapGet("/screens/{screenId:guid}/manifest", async (Guid screenId, HttpRequest request,
    LessonCueDb db, ManifestService manifests, CancellationToken ct) =>
{
    if (!await HasDeviceAccess(request, db, screenId, ct)) return Results.Unauthorized();
    var manifest = await manifests.BuildAsync(screenId, ct);
    return manifest is null ? Results.NotFound() : Results.Ok(manifest);
});

api.MapGet("/screens/{screenId:guid}/control", async (Guid screenId, int? after, HttpRequest request,
    LessonCueDb db, CancellationToken ct) =>
{
    if (!await HasDeviceAccess(request, db, screenId, ct)) return Results.Unauthorized();
    var screen = await db.Screens.AsNoTracking().SingleOrDefaultAsync(x => x.Id == screenId && !x.Revoked, ct);
    if (screen is null) return Results.NotFound();
    var command = after is null ? null : await db.PlaybackCommands.AsNoTracking()
        .Where(x => x.ScreenId == screenId && x.Version > after.Value)
        .OrderBy(x => x.Version).FirstOrDefaultAsync(ct);
    return Results.Ok(new { changed = command is not null, version = command?.Version ?? screen.ControlVersion,
        action = command?.Action ?? "none", lessonId = command?.LessonId,
        itemId = command?.ItemId, positionMs = command?.PositionMs,
        issuedAt = command?.IssuedAt, state = screen.PlaybackState,
        screenshotRequestId = screen.AllowDiagnosticScreenshots && screen.ScreenshotStatus == "pending" &&
            screen.ScreenshotExpiresAt > DateTimeOffset.UtcNow ? screen.ScreenshotRequestId : null,
        screenshotExpiresAt = screen.AllowDiagnosticScreenshots && screen.ScreenshotStatus == "pending" &&
            screen.ScreenshotExpiresAt > DateTimeOffset.UtcNow ? screen.ScreenshotExpiresAt : null });
});

api.MapPut("/tv/screens/{screenId:guid}/diagnostics/screenshot/{requestId:guid}", async (Guid screenId, Guid requestId,
    HttpRequest request, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
{
    if (!await HasDeviceAccess(request, db, screenId, ct)) return Results.Unauthorized();
    var screen = await db.Screens.SingleOrDefaultAsync(x => x.Id == screenId && !x.Revoked, ct);
    if (screen is null) return Results.NotFound();
    if (!screen.AllowDiagnosticScreenshots || screen.ScreenshotStatus != "pending" ||
        screen.ScreenshotRequestId != requestId || screen.ScreenshotExpiresAt <= DateTimeOffset.UtcNow)
        return Results.Conflict(new { error = "This one-time diagnostic screenshot request is no longer active." });
    if (request.ContentLength is null or <= 0 or > 8 * 1024 * 1024)
        return Results.BadRequest(new { error = "Screenshot must be between 1 byte and 8 MB." });
    var extension = request.ContentType?.StartsWith("image/png", StringComparison.OrdinalIgnoreCase) == true ? ".png" :
        request.ContentType?.StartsWith("image/jpeg", StringComparison.OrdinalIgnoreCase) == true ? ".jpg" : null;
    if (extension is null) return Results.BadRequest(new { error = "Screenshot must be JPEG or PNG." });

    var relative = Path.Combine("diagnostics", "screens", screenId.ToString("N"), requestId.ToString("N") + extension);
    var destination = Path.GetFullPath(Path.Combine(dataPath, relative));
    Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
    var temporary = destination + ".upload";
    await using (var output = File.Create(temporary)) await request.Body.CopyToAsync(output, ct);
    if (new FileInfo(temporary).Length > 8 * 1024 * 1024) { File.Delete(temporary); return Results.BadRequest(new { error = "Screenshot exceeds 8 MB." }); }
    var signature = new byte[8];
    await using (var input = File.OpenRead(temporary)) _ = await input.ReadAsync(signature, ct);
    var validJpeg = extension == ".jpg" && signature[0] == 0xff && signature[1] == 0xd8 && signature[2] == 0xff;
    var validPng = extension == ".png" && signature.SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
    if (!validJpeg && !validPng) { File.Delete(temporary); return Results.BadRequest(new { error = "Screenshot data does not match its image type." }); }
    if (!string.IsNullOrWhiteSpace(screen.ScreenshotRelativePath))
    {
        var previous = Path.GetFullPath(Path.Combine(dataPath, screen.ScreenshotRelativePath));
        if (previous.StartsWith(Path.GetFullPath(dataPath) + Path.DirectorySeparatorChar, StringComparison.Ordinal)) try { File.Delete(previous); } catch { }
    }
    File.Move(temporary, destination, true);
    screen.ScreenshotRelativePath = relative;
    screen.ScreenshotCapturedAt = DateTimeOffset.UtcNow;
    screen.ScreenshotStatus = "ready";
    db.AuditEvents.Add(new AuditEvent { Actor = screen.Name, Action = "screen.screenshot.capture", Object = screen.Id.ToString(),
        Summary = "Privacy-gated diagnostic screenshot captured; automatic expiry 24 hours" });
    await db.SaveChangesAsync(ct);
    await hub.Clients.Group("admins").SendAsync("ScreenStatusChanged", new { screen.Id }, ct);
    return Results.Accepted();
});

api.MapPost("/tv/status", async (TvStatusInput input, HttpRequest request, LessonCueDb db,
    IHubContext<SyncHub> hub, CancellationToken ct) =>
{
    if (!await HasDeviceAccess(request, db, input.ScreenId, ct)) return Results.Unauthorized();
    var screen = await db.Screens.SingleOrDefaultAsync(x => x.Id == input.ScreenId, ct);
    if (screen is null) return Results.NotFound();
    ScreenTelemetry.Apply(screen, input, DateTimeOffset.UtcNow,
        request.HttpContext.Connection.RemoteIpAddress?.ToString());
    await db.SaveChangesAsync(ct);
    await hub.Clients.Group("admins").SendAsync("ScreenStatusChanged", new { screen.Id }, ct);
    return Results.Accepted();
});

app.MapHub<SyncHub>("/hubs/sync").RequireAuthorization();
app.MapFallbackToFile("index.html");
app.Run();

static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

static IResult DerivativeFile(string? relativePath, string root, string contentType)
{
    if (string.IsNullOrWhiteSpace(relativePath)) return Results.NotFound();
    var normalizedRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
    var path = Path.GetFullPath(Path.Combine(root, relativePath));
    return path.StartsWith(normalizedRoot, StringComparison.Ordinal) && File.Exists(path)
        ? Results.File(path, contentType, enableRangeProcessing: true)
        : Results.NotFound();
}

static async Task<bool> HasDeviceAccess(HttpRequest request, LessonCueDb db, Guid screenId, CancellationToken ct)
{
    var authorization = request.Headers.Authorization.ToString();
    if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;
    var hash = HashToken(authorization[7..].Trim());
    var access = await (from credential in db.DeviceCredentials.AsNoTracking()
        join screen in db.Screens.AsNoTracking() on credential.ScreenId equals screen.Id
        where credential.ScreenId == screenId && credential.TokenHash == hash && credential.RevokedAt == null
        select new { credential.CreatedAt, screen.Platform, screen.LastSeenAt }).SingleOrDefaultAsync(ct);
    if (access is null) return false;
    return !ScreenDiagnosticCleanupService.IsBrowserPairExpired(
        access.Platform, access.LastSeenAt, access.CreatedAt, DateTimeOffset.UtcNow);
}

public partial class Program;
