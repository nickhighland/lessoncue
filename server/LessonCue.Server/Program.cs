using System.Security.Cryptography;
using System.Threading.RateLimiting;
using LessonCue.Server;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var dataPath = Environment.GetEnvironmentVariable("LESSONCUE_DATA_PATH")
    ?? Path.Combine(builder.Environment.ContentRootPath, "data");
var databasePath = Path.Combine(dataPath, "database");
var mediaPath = Path.Combine(dataPath, "media", "originals");
Directory.CreateDirectory(databasePath);
Directory.CreateDirectory(mediaPath);

var port = Environment.GetEnvironmentVariable("LESSONCUE_HTTP_PORT") ?? "8080";
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddDbContext<LessonCueDb>(options =>
    options.UseSqlite($"Data Source={Path.Combine(databasePath, "lessoncue.db")}"));
builder.Services.AddScoped<ManifestService>();
builder.Services.AddSingleton<IPasswordHasher<PairingAttempt>, PasswordHasher<PairingAttempt>>();
builder.Services.AddSignalR();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyHeader().AllowAnyMethod().SetIsOriginAllowed(_ => true).AllowCredentials()));
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
});

var app = builder.Build();
app.UseCors();
app.UseRateLimiter();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
    await db.Database.EnsureCreatedAsync();
    await SeedData.RunAsync(db);
}

var serverId = ServerIdentity.LoadOrCreate(dataPath);
var serverName = Environment.GetEnvironmentVariable("LESSONCUE_SERVER_NAME")
    ?? builder.Configuration["LessonCue:ServerName"] ?? "LessonCue";
var pairingPin = builder.Configuration["LessonCue:PairingPin"] ?? RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
app.Logger.LogInformation("LessonCue pairing PIN: {PairingPin}", pairingPin);

app.MapGet("/", () => Results.Ok(new
{
    product = "LessonCue",
    message = "LessonCue server is running.",
    adminExperience = "https://lessoncue-media.nick247475.chatgpt.site/",
    api = "/.well-known/lessoncue"
}));

app.MapGet("/.well-known/lessoncue", () => new
{
    product = "LessonCue",
    serverId,
    serverName,
    apiVersion = 1,
    pairingEnabled = true
});

app.MapGet("/health", async (LessonCueDb db, CancellationToken ct) =>
    Results.Ok(new { status = await db.Database.CanConnectAsync(ct) ? "healthy" : "unhealthy", serverId }));

var api = app.MapGroup("/api/v1");

api.MapGet("/classes", async (LessonCueDb db, CancellationToken ct) =>
    await db.Classes.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct));

api.MapPost("/classes", async (ClassInput input, LessonCueDb db, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Class name is required." });
    var item = new LessonClass { Name = input.Name.Trim(), Description = input.Description?.Trim() ?? "" };
    db.Classes.Add(item);
    db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = "class.create", Object = item.Id.ToString(), Summary = item.Name });
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/v1/classes/{item.Id}", item);
});

api.MapGet("/lessons", async (LessonCueDb db, CancellationToken ct) =>
    await db.Lessons.AsNoTracking().Include(x => x.Class).Include(x => x.Items)
        .OrderBy(x => x.Date).ToListAsync(ct));

api.MapPost("/lessons", async (LessonInput input, LessonCueDb db, CancellationToken ct) =>
{
    if (!await db.Classes.AnyAsync(x => x.Id == input.ClassId, ct)) return Results.BadRequest(new { error = "Class does not exist." });
    var lesson = new Lesson
    {
        ClassId = input.ClassId,
        Date = input.Date,
        Title = input.Title.Trim(),
        AvailableFrom = input.AvailableFrom,
        ExpiresAt = input.ExpiresAt,
        DesignatedStartAt = input.DesignatedStartAt,
        PreRollEnabled = input.PreRollEnabled,
        CountdownItemId = input.CountdownItemId
    };
    db.Lessons.Add(lesson);
    db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = "lesson.create", Object = lesson.Id.ToString(), Summary = lesson.Title });
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/v1/lessons/{lesson.Id}", lesson);
});

api.MapPost("/lessons/{lessonId:guid}/items", async (Guid lessonId, PlaylistItemInput input,
    LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
{
    var lesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId, ct);
    if (lesson is null) return Results.NotFound();
    if (input.VolumePercent is < 0 or > 150) return Results.BadRequest(new { error = "Volume must be from 0 to 150." });
    var role = input.Role is "preRoll" or "countdown" ? input.Role : "lesson";
    var item = new PlaylistItem
    {
        LessonId = lessonId,
        Title = input.Title.Trim(),
        Type = input.Type,
        Role = role,
        Position = input.Position,
        MediaAssetId = input.MediaId,
        DurationMs = input.DurationMs,
        StartMs = input.StartMs,
        EndMs = input.EndMs,
        VolumePercent = input.VolumePercent,
        ImageDurationSeconds = input.ImageDurationSeconds,
        EndBehavior = input.EndBehavior ?? "advance",
        AllowSkip = input.AllowSkip
    };
    db.PlaylistItems.Add(item);
    lesson.Version++;
    if (role == "countdown") lesson.CountdownItemId = item.Id;
    db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = "playlist.item.add", Object = item.Id.ToString(), Summary = item.Title });
    await db.SaveChangesAsync(ct);
    await hub.Clients.All.SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED", manifestVersion = lesson.Version }, ct);
    return Results.Created($"/api/v1/lessons/{lessonId}/items/{item.Id}", item);
});

api.MapPost("/media", async (HttpRequest request, LessonCueDb db, CancellationToken ct) =>
{
    if (!request.HasFormContentType) return Results.BadRequest(new { error = "multipart/form-data is required." });
    var form = await request.ReadFormAsync(ct);
    var upload = form.Files.GetFile("file");
    if (upload is null || upload.Length == 0) return Results.BadRequest(new { error = "A non-empty file field is required." });
    var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".mp4", ".m4v", ".mov", ".mp3", ".m4a", ".aac", ".wav", ".jpg", ".jpeg", ".png", ".webp", ".pdf", ".pptx" };
    var extension = Path.GetExtension(upload.FileName);
    if (!allowedExtensions.Contains(extension)) return Results.BadRequest(new { error = "Unsupported media type." });

    var id = Guid.NewGuid();
    var storedName = id + extension.ToLowerInvariant();
    var destination = Path.Combine(mediaPath, storedName);
    await using (var output = File.Create(destination)) await upload.CopyToAsync(output, ct);
    await using var input = File.OpenRead(destination);
    var sha = Convert.ToHexString(await SHA256.HashDataAsync(input, ct)).ToLowerInvariant();
    var existing = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(x => x.Sha256 == sha, ct);
    if (existing is not null)
    {
        File.Delete(destination);
        return Results.Ok(new { duplicate = true, media = existing });
    }
    var media = new MediaAsset
    {
        Id = id,
        FileName = Path.GetFileName(upload.FileName),
        ContentType = string.IsNullOrWhiteSpace(upload.ContentType) ? "application/octet-stream" : upload.ContentType,
        RelativePath = storedName,
        Sha256 = sha,
        SizeBytes = upload.Length
    };
    db.MediaAssets.Add(media);
    db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = "media.upload", Object = media.Id.ToString(), Summary = media.FileName });
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/v1/media/{media.Id}", media);
}).DisableAntiforgery();

api.MapGet("/media/{mediaId:guid}/file", async (Guid mediaId, LessonCueDb db, CancellationToken ct) =>
{
    var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mediaId, ct);
    if (media is null) return Results.NotFound();
    var path = Path.GetFullPath(Path.Combine(mediaPath, media.RelativePath));
    if (!path.StartsWith(Path.GetFullPath(mediaPath), StringComparison.Ordinal) || !File.Exists(path)) return Results.NotFound();
    return Results.File(path, media.ContentType, media.FileName, enableRangeProcessing: true,
        entityTag: media.Sha256 is null ? null : new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{media.Sha256}\""));
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
    attempt.PinHash = hasher.HashPassword(attempt, pairingPin);
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
    screen.FreeBytes = input.FreeBytes;
    screen.FailedDownloads = input.FailedDownloads;
    await db.SaveChangesAsync(ct);
    return Results.Accepted();
});

api.MapGet("/audit", async (LessonCueDb db, CancellationToken ct) =>
    await db.AuditEvents.AsNoTracking().OrderByDescending(x => x.Timestamp).Take(250).ToListAsync(ct));

app.MapHub<SyncHub>("/hubs/sync");
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
