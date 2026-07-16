using System.Security.Cryptography;
using System.Threading.RateLimiting;
using LessonCue.Server;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
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

var port = Environment.GetEnvironmentVariable("LESSONCUE_HTTP_PORT") ?? "8080";
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
builder.Services.AddSingleton(services => new LocalAddressService(dataPath, services.GetRequiredService<ILogger<LocalAddressService>>()));
builder.Services.AddHostedService(services => services.GetRequiredService<LocalAddressService>());
builder.Services.AddHostedService<MediaProcessingService>();
builder.Services.AddHostedService<YouTubeImportService>();
builder.Services.AddHostedService<MediaRetentionService>();
builder.Services.AddHttpClient("updates", client =>
{
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("LessonCue-Server/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2026-03-10");
});
builder.Services.AddSingleton<UpdateService>();
builder.Services.AddHostedService(services => services.GetRequiredService<UpdateService>());
builder.Services.AddSingleton<IPasswordHasher<PairingAttempt>, PasswordHasher<PairingAttempt>>();
builder.Services.AddSingleton<IPasswordHasher<AdminAccount>, PasswordHasher<AdminAccount>>();
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
        if (!await db.AdminAccounts.AsNoTracking().AnyAsync(x => x.Id == accountId && !x.Disabled && x.SessionVersion == sessionVersion, context.HttpContext.RequestAborted))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
    };
});
builder.Services.AddAuthorization();
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
});

var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers.ContentSecurityPolicy = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    var unsafeMethod = context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE";
    if (unsafeMethod && context.Request.Path.StartsWithSegments("/api/v1") && context.User.Identity?.IsAuthenticated == true)
    {
        if (context.User.IsInRole("Viewer")) { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
        var origin = context.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin) && (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
            !string.Equals(uri.Authority, context.Request.Host.Value, StringComparison.OrdinalIgnoreCase)))
        { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
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
app.Logger.LogInformation("LessonCue pairing PIN: {PairingPin}", pairingCodes.Current);

app.MapGet("/.well-known/lessoncue", () => new
{
    product = "LessonCue",
    serverId,
    serverName,
    localAddress = localAddress.Status.Address,
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

api.MapGet("/media/{mediaId:guid}/thumbnail", async (Guid mediaId, LessonCueDb db, CancellationToken ct) =>
{
    var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mediaId, ct);
    if (media?.ThumbnailPath is null) return Results.NotFound();
    var thumbnails = Path.Combine(dataPath, "media", "thumbnails");
    var path = Path.GetFullPath(Path.Combine(thumbnails, media.ThumbnailPath));
    if (!path.StartsWith(Path.GetFullPath(thumbnails), StringComparison.Ordinal) || !File.Exists(path)) return Results.NotFound();
    return Results.File(path, "image/jpeg", enableRangeProcessing: true);
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

api.MapPost("/tv/status", async (TvStatusInput input, HttpRequest request, LessonCueDb db, CancellationToken ct) =>
{
    if (!await HasDeviceAccess(request, db, input.ScreenId, ct)) return Results.Unauthorized();
    var screen = await db.Screens.SingleOrDefaultAsync(x => x.Id == input.ScreenId, ct);
    if (screen is null) return Results.NotFound();
    screen.LastSeenAt = DateTimeOffset.UtcNow;
    screen.AppVersion = input.AppVersion;
    screen.ManifestVersion = input.ManifestVersion;
    screen.LastIpAddress = request.HttpContext.Connection.RemoteIpAddress?.ToString();
    screen.FreeBytes = input.FreeBytes;
    screen.FailedDownloads = input.FailedDownloads;
    await db.SaveChangesAsync(ct);
    return Results.Accepted();
});

app.MapHub<SyncHub>("/hubs/sync");
app.MapFallbackToFile("index.html");
app.Run();

static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

static async Task<bool> HasDeviceAccess(HttpRequest request, LessonCueDb db, Guid screenId, CancellationToken ct)
{
    var authorization = request.Headers.Authorization.ToString();
    if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;
    var hash = HashToken(authorization[7..].Trim());
    return await db.DeviceCredentials.AnyAsync(x => x.ScreenId == screenId && x.TokenHash == hash && x.RevokedAt == null, ct);
}

public partial class Program;
