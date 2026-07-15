using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class AdminApi
{
    public static void MapLessonCueAdmin(this IEndpointRouteBuilder routes, string mediaPath,
        Guid serverId, string serverName, string pairingPin)
    {
        var api = routes.MapGroup("/api/v1");
        var auth = api.MapGroup("/auth");

        auth.MapGet("/session", async (HttpContext context, LessonCueDb db, CancellationToken ct) => new
        {
            setupRequired = !await db.AdminAccounts.AnyAsync(ct),
            authenticated = context.User.Identity?.IsAuthenticated == true,
            username = context.User.Identity?.Name
        });

        auth.MapPost("/setup", async (AdminSetupInput input, HttpContext context, LessonCueDb db,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            if (await db.AdminAccounts.AnyAsync(ct)) return Results.Conflict(new { error = "Administrator setup is already complete." });
            var validation = ValidateCredentials(input.Username, input.Password);
            if (validation is not null) return Results.BadRequest(new { error = validation });

            var account = new AdminAccount { Username = input.Username.Trim().ToLowerInvariant(), PasswordHash = "pending" };
            account.PasswordHash = hasher.HashPassword(account, input.Password);
            db.AdminAccounts.Add(account);
            var organization = await db.Organizations.FirstAsync(ct);
            if (!string.IsNullOrWhiteSpace(input.OrganizationName)) organization.Name = input.OrganizationName.Trim();
            db.AuditEvents.Add(new AuditEvent { Actor = account.Username, Action = "admin.setup", Object = account.Id.ToString() });
            await db.SaveChangesAsync(ct);
            await SignInAsync(context, account);
            return Results.Ok(new { account.Username, organization = organization.Name });
        }).RequireRateLimiting("login");

        auth.MapPost("/login", async (AdminLoginInput input, HttpContext context, LessonCueDb db,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            var username = input.Username.Trim().ToLowerInvariant();
            var account = await db.AdminAccounts.SingleOrDefaultAsync(x => x.Username == username, ct);
            if (account is null || hasher.VerifyHashedPassword(account, account.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
            {
                db.AuditEvents.Add(new AuditEvent { Actor = username, Action = "admin.login", Object = "session", Result = "failed" });
                await db.SaveChangesAsync(ct);
                return Results.Unauthorized();
            }
            account.LastLoginAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { Actor = username, Action = "admin.login", Object = "session" });
            await db.SaveChangesAsync(ct);
            await SignInAsync(context, account);
            return Results.Ok(new { account.Username });
        }).RequireRateLimiting("login");

        auth.MapPost("/logout", async (HttpContext context) =>
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).RequireAuthorization();

        var admin = api.MapGroup("").RequireAuthorization();

        admin.MapGet("/admin/bootstrap", async (LessonCueDb db, CancellationToken ct) =>
        {
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            return Results.Ok(new
            {
                serverId,
                serverName,
                organization = organization.Name,
                organization.TimeZone,
                pairingPin,
                counts = new
                {
                    classes = await db.Classes.CountAsync(ct),
                    lessons = await db.Lessons.CountAsync(ct),
                    media = await db.MediaAssets.CountAsync(ct),
                    screens = await db.Screens.CountAsync(x => !x.Revoked, ct)
                }
            });
        });

        admin.MapGet("/classes", async (LessonCueDb db, CancellationToken ct) =>
            await db.Classes.AsNoTracking().OrderBy(x => x.Name).Select(x => new
            {
                x.Id,
                x.Name,
                x.Description,
                lessonCount = db.Lessons.Count(lesson => lesson.ClassId == x.Id),
                screenCount = db.Screens.Count(screen => screen.AssignedClassId == x.Id && !screen.Revoked)
            }).ToListAsync(ct));

        admin.MapPost("/classes", async (ClassInput input, LessonCueDb db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Class name is required." });
            var item = new LessonClass { Name = input.Name.Trim(), Description = input.Description?.Trim() ?? "" };
            db.Classes.Add(item);
            Audit(db, "class.create", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/classes/{item.Id}", item);
        });

        admin.MapPut("/classes/{id:guid}", async (Guid id, ClassInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var item = await db.Classes.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Class name is required." });
            item.Name = input.Name.Trim();
            item.Description = input.Description?.Trim() ?? "";
            Audit(db, "class.update", id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Ok(item);
        });

        admin.MapGet("/lessons", async (Guid? classId, LessonCueDb db, CancellationToken ct) =>
        {
            var query = db.Lessons.AsNoTracking().AsQueryable();
            if (classId is not null) query = query.Where(x => x.ClassId == classId);
            return Results.Ok(await query.OrderBy(x => x.Date).Select(x => new
            {
                x.Id,
                x.ClassId,
                className = x.Class!.Name,
                x.Date,
                x.Title,
                x.AvailableFrom,
                x.ExpiresAt,
                x.DesignatedStartAt,
                x.PreRollEnabled,
                x.CountdownItemId,
                x.Version,
                items = x.Items.OrderBy(item => item.Position).Select(item => new
                {
                    item.Id,
                    item.Title,
                    item.Type,
                    item.Role,
                    item.Position,
                    item.MediaAssetId,
                    mediaFileName = item.MediaAsset != null ? item.MediaAsset.FileName : null,
                    item.DurationMs,
                    mediaDurationMs = item.MediaAsset != null ? item.MediaAsset.DurationMs : null,
                    item.StartMs,
                    item.EndMs,
                    item.VolumePercent,
                    item.ImageDurationSeconds,
                    item.EndBehavior,
                    item.AllowSkip,
                    offlineEligible = item.MediaAsset != null && item.MediaAsset.OfflineEligible
                }).ToList()
            }).ToListAsync(ct));
        });

        admin.MapPost("/lessons", async (LessonInput input, LessonCueDb db, CancellationToken ct) =>
        {
            if (!await db.Classes.AnyAsync(x => x.Id == input.ClassId, ct)) return Results.BadRequest(new { error = "Class does not exist." });
            if (string.IsNullOrWhiteSpace(input.Title)) return Results.BadRequest(new { error = "Lesson title is required." });
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
            Audit(db, "lesson.create", lesson.Id, lesson.Title);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/lessons/{lesson.Id}", lesson);
        });

        admin.MapPut("/lessons/{id:guid}", async (Guid id, LessonUpdateInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.FindAsync([id], ct);
            if (lesson is null) return Results.NotFound();
            if (input.Title is not null) lesson.Title = input.Title.Trim();
            if (input.Date is not null) lesson.Date = input.Date.Value;
            if (input.ClearAvailableFrom) lesson.AvailableFrom = null;
            else if (input.AvailableFrom is not null) lesson.AvailableFrom = input.AvailableFrom;
            if (input.ClearExpiresAt) lesson.ExpiresAt = null;
            else if (input.ExpiresAt is not null) lesson.ExpiresAt = input.ExpiresAt;
            if (input.ClearDesignatedStartAt) lesson.DesignatedStartAt = null;
            else if (input.DesignatedStartAt is not null) lesson.DesignatedStartAt = input.DesignatedStartAt;
            if (input.PreRollEnabled is not null) lesson.PreRollEnabled = input.PreRollEnabled.Value;
            if (input.ClearCountdown) lesson.CountdownItemId = null;
            else if (input.CountdownItemId is not null) lesson.CountdownItemId = input.CountdownItemId;
            lesson.Version++;
            Audit(db, "lesson.update", lesson.Id, lesson.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, lesson.Version, ct);
            return Results.Ok(lesson);
        });

        admin.MapDelete("/lessons/{id:guid}", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.FindAsync([id], ct);
            if (lesson is null) return Results.NotFound();
            db.Lessons.Remove(lesson);
            Audit(db, "lesson.delete", id, lesson.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, 0, ct);
            return Results.NoContent();
        });

        admin.MapPost("/lessons/{lessonId:guid}/items", async (Guid lessonId, PlaylistItemInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId, ct);
            if (lesson is null) return Results.NotFound();
            if (input.VolumePercent is < 0 or > 150) return Results.BadRequest(new { error = "Volume must be from 0 to 150." });
            var role = NormalizeRole(input.Role);
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
            if (role == "countdown")
            {
                var otherCountdowns = await db.PlaylistItems.Where(x => x.LessonId == lessonId && x.Role == "countdown").ToListAsync(ct);
                foreach (var other in otherCountdowns) other.Role = "lesson";
                lesson.CountdownItemId = item.Id;
            }
            if (role == "preRoll") lesson.PreRollEnabled = true;
            Audit(db, "playlist.item.add", item.Id, item.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, lesson.Version, ct);
            return Results.Created($"/api/v1/lessons/{lessonId}/items/{item.Id}", item);
        });

        admin.MapPatch("/playlist-items/{id:guid}", async (Guid id, PlaylistItemUpdateInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.PlaylistItems.Include(x => x.Lesson).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (item?.Lesson is null) return Results.NotFound();
            if (input.Title is not null) item.Title = input.Title.Trim();
            if (input.Type is not null) item.Type = input.Type;
            var wasCountdown = item.Lesson.CountdownItemId == item.Id || item.Role == "countdown";
            if (input.Role is not null) item.Role = NormalizeRole(input.Role);
            if (input.MediaId is not null) item.MediaAssetId = input.MediaId;
            if (input.DurationMs is not null) item.DurationMs = input.DurationMs;
            if (input.StartMs is not null) item.StartMs = input.StartMs.Value;
            if (input.ClearEndMs) item.EndMs = null;
            else if (input.EndMs is not null) item.EndMs = input.EndMs;
            if (input.VolumePercent is not null) item.VolumePercent = Math.Clamp(input.VolumePercent.Value, 0, 150);
            if (input.ImageDurationSeconds is not null) item.ImageDurationSeconds = input.ImageDurationSeconds;
            if (input.EndBehavior is not null) item.EndBehavior = input.EndBehavior;
            if (input.AllowSkip is not null) item.AllowSkip = input.AllowSkip.Value;
            if (item.Role == "countdown")
            {
                var otherCountdowns = await db.PlaylistItems.Where(x => x.LessonId == item.LessonId && x.Id != item.Id && x.Role == "countdown").ToListAsync(ct);
                foreach (var other in otherCountdowns) other.Role = "lesson";
                item.Lesson.CountdownItemId = item.Id;
            }
            else if (wasCountdown) item.Lesson.CountdownItemId = null;
            if (item.Role == "preRoll") item.Lesson.PreRollEnabled = true;
            item.Lesson.Version++;
            Audit(db, "playlist.item.update", item.Id, item.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, item.Lesson.Version, ct);
            return Results.Ok(item);
        });

        admin.MapDelete("/playlist-items/{id:guid}", async (Guid id, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.PlaylistItems.Include(x => x.Lesson).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (item?.Lesson is null) return Results.NotFound();
            if (item.Lesson.CountdownItemId == id) item.Lesson.CountdownItemId = null;
            item.Lesson.Version++;
            var version = item.Lesson.Version;
            db.PlaylistItems.Remove(item);
            Audit(db, "playlist.item.delete", id, item.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, version, ct);
            return Results.NoContent();
        });

        admin.MapPost("/lessons/{lessonId:guid}/reorder", async (Guid lessonId, PlaylistReorderInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == lessonId, ct);
            if (lesson is null) return Results.NotFound();
            var byId = lesson.Items.ToDictionary(x => x.Id);
            if (input.ItemIds.Count != byId.Count || input.ItemIds.Distinct().Count() != byId.Count || input.ItemIds.Any(id => !byId.ContainsKey(id)))
                return Results.BadRequest(new { error = "Reorder list must contain every playlist item exactly once." });
            for (var index = 0; index < input.ItemIds.Count; index++) byId[input.ItemIds[index]].Position = (index + 1) * 1000;
            lesson.Version++;
            Audit(db, "playlist.reorder", lesson.Id, lesson.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, lesson.Version, ct);
            return Results.NoContent();
        });

        admin.MapGet("/media", async (LessonCueDb db, CancellationToken ct) =>
            await db.MediaAssets.AsNoTracking().OrderByDescending(x => x.Id).Select(x => new
            {
                x.Id,
                x.FileName,
                x.ContentType,
                x.SizeBytes,
                x.DurationMs,
                x.Sha256,
                x.OfflineEligible,
                downloadUrl = $"/api/v1/media/{x.Id}/file"
            }).ToListAsync(ct));

        admin.MapPost("/media", async (HttpRequest request, LessonCueDb db, CancellationToken ct) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest(new { error = "multipart/form-data is required." });
            var form = await request.ReadFormAsync(ct);
            var upload = form.Files.GetFile("file");
            if (upload is null || upload.Length == 0) return Results.BadRequest(new { error = "A non-empty file field is required." });
            var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".mp4", ".m4v", ".mov", ".mp3", ".m4a", ".aac", ".wav", ".jpg", ".jpeg", ".png", ".webp", ".pdf", ".pptx" };
            var extension = Path.GetExtension(upload.FileName);
            if (!allowedExtensions.Contains(extension)) return Results.BadRequest(new { error = "Unsupported media type." });

            var id = Guid.NewGuid();
            var storedName = id + extension.ToLowerInvariant();
            var destination = Path.Combine(mediaPath, storedName);
            await using (var output = File.Create(destination)) await upload.CopyToAsync(output, ct);
            await using var stream = File.OpenRead(destination);
            var sha = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
            var existing = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(x => x.Sha256 == sha, ct);
            if (existing is not null)
            {
                File.Delete(destination);
                return Results.Ok(new { duplicate = true, media = existing });
            }
            long? duration = long.TryParse(form["durationMs"], NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
            var media = new MediaAsset
            {
                Id = id,
                FileName = Path.GetFileName(upload.FileName),
                ContentType = string.IsNullOrWhiteSpace(upload.ContentType) ? "application/octet-stream" : upload.ContentType,
                RelativePath = storedName,
                Sha256 = sha,
                SizeBytes = upload.Length,
                DurationMs = duration
            };
            db.MediaAssets.Add(media);
            Audit(db, "media.upload", media.Id, media.FileName);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/media/{media.Id}", media);
        }).DisableAntiforgery();

        admin.MapGet("/screens", async (LessonCueDb db, CancellationToken ct) =>
        {
            var onlineCutoff = DateTimeOffset.UtcNow.AddMinutes(-2);
            return await db.Screens.AsNoTracking().OrderBy(x => x.Name).Select(x => new
            {
                x.Id,
                x.Name,
                x.Platform,
                x.AssignedClassId,
                assignedClassName = db.Classes.Where(c => c.Id == x.AssignedClassId).Select(c => c.Name).FirstOrDefault(),
                x.VolunteerMode,
                x.LastSeenAt,
                online = x.LastSeenAt != null && x.LastSeenAt >= onlineCutoff,
                x.FreeBytes,
                x.FailedDownloads,
                x.Revoked
            }).ToListAsync(ct);
        });

        admin.MapPatch("/screens/{id:guid}", async (Guid id, ScreenUpdateInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var screen = await db.Screens.FindAsync([id], ct);
            if (screen is null) return Results.NotFound();
            if (input.Name is not null) screen.Name = input.Name.Trim();
            if (input.ClearAssignment) screen.AssignedClassId = null;
            else if (input.AssignedClassId is not null) screen.AssignedClassId = input.AssignedClassId;
            if (input.VolunteerMode is not null) screen.VolunteerMode = input.VolunteerMode.Value;
            Audit(db, "screen.update", screen.Id, screen.Name);
            await db.SaveChangesAsync(ct);
            await hub.Clients.Group($"screen:{id}").SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED" }, ct);
            return Results.Ok(screen);
        });

        admin.MapDelete("/screens/{id:guid}", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var screen = await db.Screens.FindAsync([id], ct);
            if (screen is null) return Results.NotFound();
            screen.Revoked = true;
            var credentials = await db.DeviceCredentials.Where(x => x.ScreenId == id && x.RevokedAt == null).ToListAsync(ct);
            foreach (var credential in credentials) credential.RevokedAt = DateTimeOffset.UtcNow;
            Audit(db, "screen.revoke", screen.Id, screen.Name);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        admin.MapGet("/audit", async (LessonCueDb db, CancellationToken ct) =>
            await db.AuditEvents.AsNoTracking().OrderByDescending(x => x.Timestamp).Take(250).ToListAsync(ct));
    }

    private static string NormalizeRole(string? role) => role is "preRoll" or "countdown" ? role : "lesson";

    private static string? ValidateCredentials(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Trim().Length < 3) return "Username must be at least three characters.";
        if (password.Length < 10) return "Password must be at least ten characters.";
        if (!password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit))
            return "Password must contain uppercase, lowercase, and numeric characters.";
        return null;
    }

    private static Task SignInAsync(HttpContext context, AdminAccount account)
    {
        var identity = new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new Claim(ClaimTypes.Name, account.Username),
            new Claim(ClaimTypes.Role, "Administrator")
        ], CookieAuthenticationDefaults.AuthenticationScheme);
        return context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(12) });
    }

    private static void Audit(LessonCueDb db, string action, Guid id, string? summary) =>
        db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = action, Object = id.ToString(), Summary = summary });

    private static Task InvalidateAsync(IHubContext<SyncHub> hub, int version, CancellationToken ct) =>
        hub.Clients.All.SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED", manifestVersion = version }, ct);
}
