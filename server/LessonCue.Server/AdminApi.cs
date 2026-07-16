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
    public static void MapLessonCueAdmin(this IEndpointRouteBuilder routes, string mediaPath, string dataPath,
        Guid serverId, string serverName)
    {
        var api = routes.MapGroup("/api/v1");
        var auth = api.MapGroup("/auth");

        auth.MapGet("/session", async (HttpContext context, LessonCueDb db, CancellationToken ct) => new
        {
            setupRequired = !await db.AdminAccounts.AnyAsync(ct),
            authenticated = context.User.Identity?.IsAuthenticated == true,
            username = context.User.Identity?.Name,
            displayName = context.User.FindFirstValue("display_name"),
            role = context.User.FindFirstValue(ClaimTypes.Role)
        });

        auth.MapPost("/setup", async (AdminSetupInput input, HttpContext context, LessonCueDb db,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            if (await db.AdminAccounts.AnyAsync(ct)) return Results.Conflict(new { error = "Administrator setup is already complete." });
            var validation = ValidateCredentials(input.Username, input.Password);
            if (validation is not null) return Results.BadRequest(new { error = validation });

            var account = new AdminAccount { Username = input.Username.Trim().ToLowerInvariant(), PasswordHash = "pending",
                DisplayName = string.IsNullOrWhiteSpace(input.DisplayName) ? "Administrator" : input.DisplayName.Trim(),
                Email = input.Email?.Trim(), Role = "Owner" };
            account.PasswordHash = hasher.HashPassword(account, input.Password);
            db.AdminAccounts.Add(account);
            var organization = await db.Organizations.FirstAsync(ct);
            if (!string.IsNullOrWhiteSpace(input.OrganizationName)) organization.Name = input.OrganizationName.Trim();
            if (!string.IsNullOrWhiteSpace(input.TimeZone)) organization.TimeZone = input.TimeZone.Trim();
            if (!string.IsNullOrWhiteSpace(input.SiteName)) organization.SiteName = input.SiteName.Trim();
            organization.WeekStartsOn = input.WeekStartsOn == "Monday" ? "Monday" : "Sunday";
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
            if (account is null || account.Disabled || hasher.VerifyHashedPassword(account, account.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
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

        admin.MapGet("/admin/bootstrap", async (LessonCueDb db, PairingCodeService pairing, StorageService storage,
            UpdateService updates, CancellationToken ct) =>
        {
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var storageStatus = await storage.GetSnapshotAsync(organization.StorageLimitBytes, ct);
            return Results.Ok(new
            {
                serverId,
                serverName,
                organization = organization.Name,
                settings = organization,
                organization.TimeZone,
                pairingPin = pairing.Current,
                pairingExpiresAt = pairing.ExpiresAt,
                storage = storageStatus,
                update = updates.Status,
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
                x.PreRollStartsAt,
                x.PreRollEnabled,
                x.CountdownItemId,
                x.Version,
                x.Archived,
                x.KeepOffline,
                x.DownloadDaysBefore,
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
                    item.Notes,
                    item.FadeInMs,
                    item.FadeOutMs,
                    item.NormalizeAudio,
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
                PreRollStartsAt = input.PreRollStartsAt,
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
            if (input.ClearPreRollStartsAt) lesson.PreRollStartsAt = null;
            else if (input.PreRollStartsAt is not null) lesson.PreRollStartsAt = input.PreRollStartsAt;
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

        admin.MapPost("/lessons/{id:guid}/duplicate", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var source = await db.Lessons.AsNoTracking().Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (source is null) return Results.NotFound();
            var copy = new Lesson
            {
                ClassId = source.ClassId, Date = source.Date.AddDays(7), Title = source.Title + " copy",
                AvailableFrom = source.AvailableFrom?.AddDays(7), ExpiresAt = source.ExpiresAt?.AddDays(7),
                DesignatedStartAt = source.DesignatedStartAt?.AddDays(7), PreRollEnabled = source.PreRollEnabled,
                PreRollStartsAt = source.PreRollStartsAt?.AddDays(7),
                KeepOffline = source.KeepOffline, DownloadDaysBefore = source.DownloadDaysBefore
            };
            foreach (var sourceItem in source.Items.OrderBy(x => x.Position))
            {
                var clone = new PlaylistItem
                {
                    LessonId = copy.Id, Title = sourceItem.Title, Type = sourceItem.Type, Role = sourceItem.Role,
                    Position = sourceItem.Position, MediaAssetId = sourceItem.MediaAssetId, DurationMs = sourceItem.DurationMs,
                    StartMs = sourceItem.StartMs, EndMs = sourceItem.EndMs, VolumePercent = sourceItem.VolumePercent,
                    ImageDurationSeconds = sourceItem.ImageDurationSeconds, EndBehavior = sourceItem.EndBehavior,
                    AllowSkip = sourceItem.AllowSkip, Notes = sourceItem.Notes, FadeInMs = sourceItem.FadeInMs,
                    FadeOutMs = sourceItem.FadeOutMs, NormalizeAudio = sourceItem.NormalizeAudio
                };
                copy.Items.Add(clone);
                if (sourceItem.Id == source.CountdownItemId || sourceItem.Role == "countdown") copy.CountdownItemId = clone.Id;
            }
            var copiedMediaIds = copy.Items.Where(x => x.MediaAssetId != null).Select(x => x.MediaAssetId!.Value).Distinct().ToList();
            var copiedMedia = await db.MediaAssets.Where(x => copiedMediaIds.Contains(x.Id) && x.StoragePolicy == MediaRetention.LessonScoped).ToListAsync(ct);
            foreach (var media in copiedMedia) MediaRetention.KeepForLesson(media, copy);
            db.Lessons.Add(copy); Audit(db, "lesson.duplicate", copy.Id, copy.Title);
            await db.SaveChangesAsync(ct); await InvalidateAsync(hub, copy.Version, ct);
            return Results.Created($"/api/v1/lessons/{copy.Id}", new { copy.Id });
        });

        admin.MapPost("/lessons/{id:guid}/archive", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.FindAsync([id], ct);
            if (lesson is null) return Results.NotFound();
            lesson.Archived = !lesson.Archived; lesson.Version++;
            Audit(db, lesson.Archived ? "lesson.archive" : "lesson.restore", id, lesson.Title);
            await db.SaveChangesAsync(ct); await InvalidateAsync(hub, lesson.Version, ct);
            return Results.Ok(new { lesson.Archived });
        });

        admin.MapPost("/lessons/{lessonId:guid}/items", async (Guid lessonId, PlaylistItemInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId, ct);
            if (lesson is null) return Results.NotFound();
            if (input.VolumePercent is < 0 or > 150) return Results.BadRequest(new { error = "Volume must be from 0 to 150." });
            if (string.IsNullOrWhiteSpace(input.Title)) return Results.BadRequest(new { error = "A display title is required." });
            MediaAsset? itemMedia = null;
            if (input.MediaId is Guid mediaId)
            {
                itemMedia = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == mediaId, ct);
                if (itemMedia is null) return Results.BadRequest(new { error = "The selected media file does not exist." });
            }
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
            if (itemMedia is not null && itemMedia.StoragePolicy == MediaRetention.LessonScoped)
                MediaRetention.KeepForLesson(itemMedia, lesson);
            Audit(db, "playlist.item.add", item.Id, item.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, lesson.Version, ct);
            return Results.Created($"/api/v1/lessons/{lessonId}/items/{item.Id}", new
            {
                item.Id, item.Title, item.Type, item.Role, item.Position, item.MediaAssetId,
                item.DurationMs, item.StartMs, item.EndMs, item.VolumePercent,
                item.ImageDurationSeconds, item.EndBehavior, item.AllowSkip
            });
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
            if (input.Notes is not null) item.Notes = input.Notes.Trim();
            if (input.FadeInMs is not null) item.FadeInMs = Math.Clamp(input.FadeInMs.Value, 0, 30_000);
            if (input.FadeOutMs is not null) item.FadeOutMs = Math.Clamp(input.FadeOutMs.Value, 0, 30_000);
            if (input.NormalizeAudio is not null) item.NormalizeAudio = input.NormalizeAudio.Value;
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
            return Results.NoContent();
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
                x.CreatedAt,
                x.ProcessingStatus,
                x.ProcessingError,
                x.VideoCodec,
                x.AudioCodec,
                x.Width,
                x.Height,
                x.LoudnessLufs,
                x.SourceKind,
                x.SourceUrl,
                x.LinkKind,
                x.StoragePolicy,
                x.OriginLessonId,
                x.DeleteAfter,
                thumbnailUrl = x.ThumbnailPath == null ? null : $"/api/v1/media/{x.Id}/thumbnail",
                downloadUrl = $"/api/v1/media/{x.Id}/file"
            }).ToListAsync(ct));

        admin.MapPost("/media", async (HttpRequest request, LessonCueDb db, StorageService storage, CancellationToken ct) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest(new { error = "multipart/form-data is required." });
            var form = await request.ReadFormAsync(ct);
            var upload = form.Files.GetFile("file");
            if (upload is null || upload.Length == 0) return Results.BadRequest(new { error = "A non-empty file field is required." });
            var persistent = bool.TryParse(form["persistent"], out var keep) && keep;
            Lesson? retentionLesson = null;
            if (!persistent)
            {
                if (!Guid.TryParse(form["lessonId"], out var retentionLessonId))
                    return Results.BadRequest(new { error = "Choose the lesson this upload belongs to, or choose Keep permanently." });
                retentionLesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == retentionLessonId, ct);
                if (retentionLesson is null) return Results.BadRequest(new { error = "The selected lesson does not exist." });
            }
            var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".mp4", ".m4v", ".mov", ".mp3", ".m4a", ".aac", ".wav", ".jpg", ".jpeg", ".png", ".webp", ".pdf", ".pptx" };
            var extension = Path.GetExtension(upload.FileName);
            if (!allowedExtensions.Contains(extension)) return Results.BadRequest(new { error = "Unsupported media type." });
            if (await storage.EnsureAvailableAsync(db, upload.Length, ct) is null)
                return StorageExceeded(upload.Length);

            var id = Guid.NewGuid();
            var storedName = id + extension.ToLowerInvariant();
            var destination = Path.Combine(mediaPath, storedName);
            await using (var output = File.Create(destination)) await upload.CopyToAsync(output, ct);
            await using var stream = File.OpenRead(destination);
            var sha = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
            var existing = await db.MediaAssets.FirstOrDefaultAsync(x => x.Sha256 == sha, ct);
            if (existing is not null)
            {
                File.Delete(destination);
                if (persistent) MediaRetention.KeepPermanently(existing);
                else if (existing.StoragePolicy == MediaRetention.LessonScoped) MediaRetention.KeepForLesson(existing, retentionLesson!);
                await db.SaveChangesAsync(ct);
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
            if (persistent) MediaRetention.KeepPermanently(media);
            else MediaRetention.SetNewUploadPolicy(media, retentionLesson!);
            db.MediaAssets.Add(media);
            Audit(db, "media.upload", media.Id, media.FileName);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/media/{media.Id}", media);
        }).DisableAntiforgery();

        admin.MapPost("/media/link", async (LinkInput input, LessonCueDb db, CancellationToken ct) =>
        {
            if (!Uri.TryCreate(input.Url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
                return Results.BadRequest(new { error = "Enter a complete http or https URL." });
            var extension = Path.GetExtension(uri.AbsolutePath).ToLowerInvariant();
            var direct = extension is ".mp4" or ".m4v" or ".mov" or ".mp3" or ".m4a" or ".aac" or ".wav" or ".jpg" or ".jpeg" or ".png" or ".webp";
            var embedded = uri.Host.Contains("youtube.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Contains("youtu.be", StringComparison.OrdinalIgnoreCase) || uri.Host.Contains("vimeo.com", StringComparison.OrdinalIgnoreCase);
            var kind = direct ? "direct" : embedded ? "embedded" : "external";
            var contentType = extension switch
            {
                ".mp4" or ".m4v" or ".mov" => "video/mp4",
                ".mp3" => "audio/mpeg",
                ".m4a" or ".aac" => "audio/aac",
                ".wav" => "audio/wav",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                _ => "text/uri-list"
            };
            var title = string.IsNullOrWhiteSpace(input.Title) ? uri.Host : input.Title.Trim();
            var media = new MediaAsset { FileName = title, ContentType = contentType, RelativePath = "",
                SizeBytes = 0, OfflineEligible = direct, ProcessingStatus = "ready", SourceKind = "link", SourceUrl = uri.ToString(), LinkKind = kind };
            db.MediaAssets.Add(media); Audit(db, "media.link", media.Id, $"{kind}: {uri.Host}"); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/media/{media.Id}", media);
        });

        admin.MapPost("/uploads", async (string? fileName, long? totalBytes, LessonCueDb db, StorageService storage,
            CancellationToken ct) =>
        {
            if (totalBytes is null or <= 0) return Results.BadRequest(new { error = "The total upload size is required." });
            if (await storage.EnsureAvailableAsync(db, totalBytes.Value, ct) is null) return StorageExceeded(totalBytes.Value);
            return Results.Ok(new { uploadId = Guid.NewGuid(), fileName = Path.GetFileName(fileName ?? "upload.bin"), chunkSize = 8 * 1024 * 1024 });
        });

        admin.MapPut("/uploads/{uploadId:guid}/chunks/{index:int}", async (Guid uploadId, int index, HttpRequest request,
            LessonCueDb db, StorageService storage, CancellationToken ct) =>
        {
            if (index < 0 || request.ContentLength is > 8 * 1024 * 1024) return Results.BadRequest(new { error = "Invalid upload chunk." });
            var folder = Path.Combine(dataPath, "media", "temporary", uploadId.ToString("N")); Directory.CreateDirectory(folder);
            var path = Path.Combine(folder, index.ToString("D8"));
            var previousSize = File.Exists(path) ? new FileInfo(path).Length : 0;
            var additional = Math.Max(0, (request.ContentLength ?? 8L * 1024 * 1024) - previousSize);
            if (await storage.EnsureAvailableAsync(db, additional, ct) is null) return StorageExceeded(additional);
            await using var output = File.Create(path);
            var buffer = new byte[64 * 1024]; var total = 0L;
            while (true)
            {
                var read = await request.Body.ReadAsync(buffer, ct); if (read == 0) break;
                total += read;
                if (total > 8L * 1024 * 1024) { output.Close(); File.Delete(path); return Results.BadRequest(new { error = "Upload chunks cannot exceed 8 MB." }); }
                await output.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            return Results.NoContent();
        }).DisableAntiforgery();

        admin.MapPost("/uploads/{uploadId:guid}/complete", async (Guid uploadId, UploadCompleteInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".mp4", ".m4v", ".mov", ".mp3", ".m4a", ".aac", ".wav", ".jpg", ".jpeg", ".png", ".webp", ".pdf", ".pptx" };
            var extension = Path.GetExtension(input.FileName); if (!allowedExtensions.Contains(extension)) return Results.BadRequest(new { error = "Unsupported media type." });
            if (input.TotalChunks is < 1 or > 100000) return Results.BadRequest(new { error = "Invalid chunk count." });
            Lesson? retentionLesson = null;
            if (!input.Persistent)
            {
                if (input.LessonId is not Guid lessonId)
                    return Results.BadRequest(new { error = "Choose the lesson this upload belongs to, or choose Keep permanently." });
                retentionLesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId, ct);
                if (retentionLesson is null) return Results.BadRequest(new { error = "The selected lesson does not exist." });
            }
            var folder = Path.Combine(dataPath, "media", "temporary", uploadId.ToString("N"));
            for (var i = 0; i < input.TotalChunks; i++) if (!File.Exists(Path.Combine(folder, i.ToString("D8")))) return Results.BadRequest(new { error = $"Upload chunk {i} is missing." });
            var mediaId = Guid.NewGuid(); var storedName = mediaId + extension.ToLowerInvariant(); var destination = Path.Combine(mediaPath, storedName);
            await using (var output = File.Create(destination))
            {
                for (var i = 0; i < input.TotalChunks; i++)
                {
                    var chunkPath = Path.Combine(folder, i.ToString("D8"));
                    await using (var chunk = File.OpenRead(chunkPath)) await chunk.CopyToAsync(output, ct);
                    File.Delete(chunkPath);
                }
            }
            Directory.Delete(folder, true);
            await using var stream = File.OpenRead(destination); var sha = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
            var existing = await db.MediaAssets.FirstOrDefaultAsync(x => x.Sha256 == sha, ct);
            if (existing is not null)
            {
                File.Delete(destination);
                if (input.Persistent) MediaRetention.KeepPermanently(existing);
                else if (existing.StoragePolicy == MediaRetention.LessonScoped) MediaRetention.KeepForLesson(existing, retentionLesson!);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { duplicate = true, media = existing });
            }
            var media = new MediaAsset { Id = mediaId, FileName = Path.GetFileName(input.FileName), ContentType = input.ContentType,
                RelativePath = storedName, Sha256 = sha, SizeBytes = new FileInfo(destination).Length, DurationMs = input.DurationMs };
            if (input.Persistent) MediaRetention.KeepPermanently(media);
            else MediaRetention.SetNewUploadPolicy(media, retentionLesson!);
            db.MediaAssets.Add(media); Audit(db, "media.upload.complete", media.Id, media.FileName); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/media/{media.Id}", media);
        });

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
                x.Revoked,
                x.AppVersion,
                x.ManifestVersion,
                x.TagsCsv,
                x.Site,
                x.LastIpAddress
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
            if (input.TagsCsv is not null) screen.TagsCsv = input.TagsCsv.Trim();
            if (input.Site is not null) screen.Site = input.Site.Trim();
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
            (await db.AuditEvents.AsNoTracking().OrderByDescending(x => x.Id).Take(250).ToListAsync(ct)).OrderByDescending(x => x.Timestamp));

        MapOperations(admin, dataPath);
    }

    private static void MapOperations(RouteGroupBuilder admin, string dataPath)
    {
        admin.MapGet("/organization", async (LessonCueDb db, CancellationToken ct) =>
            await db.Organizations.AsNoTracking().FirstAsync(ct));

        admin.MapPut("/organization", async (OrganizationInput input, LessonCueDb db, HttpContext context, CancellationToken ct) =>
        {
            if (!IsManager(context.User)) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.TimeZone))
                return Results.BadRequest(new { error = "Organization name and time zone are required." });
            try { _ = TimeZoneInfo.FindSystemTimeZoneById(input.TimeZone); }
            catch { return Results.BadRequest(new { error = "The server does not recognize that IANA time zone." }); }
            if (!IsColor(input.PrimaryColor) || !IsColor(input.AccentColor))
                return Results.BadRequest(new { error = "Brand colors must use six-digit hex notation." });
            var organization = await db.Organizations.FirstAsync(ct);
            organization.Name = input.Name.Trim(); organization.SiteName = input.SiteName.Trim();
            organization.TimeZone = input.TimeZone.Trim(); organization.WeekStartsOn = input.WeekStartsOn == "Monday" ? "Monday" : "Sunday";
            organization.DefaultLessonDurationMinutes = Math.Clamp(input.DefaultLessonDurationMinutes, 5, 480);
            organization.DefaultRetentionDays = Math.Clamp(input.DefaultRetentionDays, 1, 3650);
            organization.PrimaryColor = input.PrimaryColor; organization.AccentColor = input.AccentColor;
            organization.WelcomeMessage = input.WelcomeMessage.Trim();
            Audit(db, "organization.update", organization.Id, organization.Name); await db.SaveChangesAsync(ct);
            return Results.Ok(organization);
        });

        admin.MapGet("/storage", async (LessonCueDb db, StorageService storage, CancellationToken ct) =>
            Results.Ok(await storage.GetSnapshotAsync(db, ct)));

        admin.MapPut("/storage", async (StorageLimitInput input, LessonCueDb db, StorageService storage,
            HttpContext context, CancellationToken ct) =>
        {
            if (!IsManager(context.User)) return Results.Forbid();
            var organization = await db.Organizations.FirstAsync(ct);
            var snapshot = await storage.GetSnapshotAsync(organization.StorageLimitBytes, ct);
            if (input.LimitBytes < 0) return Results.BadRequest(new { error = "Storage allocation cannot be negative." });
            if (input.LimitBytes > 0 && input.LimitBytes < snapshot.UsedBytes)
                return Results.BadRequest(new { error = $"The app already uses {snapshot.UsedBytes} bytes. The allocation cannot be lower than current usage." });
            if (input.LimitBytes > snapshot.MaximumAllocationBytes)
                return Results.BadRequest(new { error = "That allocation is larger than the safely available space on this computer." });
            organization.StorageLimitBytes = input.LimitBytes;
            Audit(db, "storage.limit.update", organization.Id, input.LimitBytes == 0 ? "automatic" : input.LimitBytes.ToString());
            await db.SaveChangesAsync(ct);
            return Results.Ok(await storage.GetSnapshotAsync(input.LimitBytes, ct));
        });

        admin.MapGet("/updates", (UpdateService updates) => Results.Ok(updates.Status));

        admin.MapPost("/updates/check", async (UpdateService updates, CancellationToken ct) =>
            Results.Ok(await updates.CheckAsync(true, ct)));

        admin.MapPost("/updates/install", async (UpdateService updates, LessonCueDb db, HttpContext context,
            CancellationToken ct) =>
        {
            if (!IsManager(context.User)) return Results.Forbid();
            var status = await updates.CheckAsync(true, ct);
            if (!status.UpdateAvailable) return Results.Conflict(new { error = "LessonCue is already up to date." });
            if (!status.AutomaticInstallSupported)
                return Results.Conflict(new { error = "Automatic installation is not configured on this server. Run the latest Linux installer once to enable it." });
            Audit(db, "server.update.start", Guid.Empty, $"{status.CurrentVersion} to {status.LatestVersion}");
            await db.SaveChangesAsync(ct);
            return await updates.StartInstallAsync(ct)
                ? Results.Accepted(value: new { message = "The update has started. LessonCue will restart automatically." })
                : Results.Problem("The server could not start the protected update service.", statusCode: 500);
        });

        admin.MapGet("/users", async (LessonCueDb db, CancellationToken ct) =>
            await db.AdminAccounts.AsNoTracking().OrderBy(x => x.DisplayName).Select(x => new
            { x.Id, x.Username, x.DisplayName, x.Email, x.Role, x.Disabled, x.CreatedAt, x.LastLoginAt }).ToListAsync(ct));

        admin.MapPost("/users", async (UserInput input, LessonCueDb db, HttpContext context,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            if (!IsManager(context.User)) return Results.Forbid();
            var validation = ValidateCredentials(input.Username, input.Password ?? "");
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var username = input.Username.Trim().ToLowerInvariant();
            if (await db.AdminAccounts.AnyAsync(x => x.Username == username, ct)) return Results.Conflict(new { error = "That username already exists." });
            var account = new AdminAccount { Username = username, DisplayName = input.DisplayName.Trim(), Email = input.Email?.Trim(),
                Role = NormalizeAdminRole(input.Role), Disabled = input.Disabled, PasswordHash = "pending" };
            account.PasswordHash = hasher.HashPassword(account, input.Password!);
            db.AdminAccounts.Add(account); Audit(db, "user.create", account.Id, account.Username); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/users/{account.Id}", new { account.Id });
        });

        admin.MapPut("/users/{id:guid}", async (Guid id, UserInput input, LessonCueDb db, HttpContext context,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            if (!IsManager(context.User)) return Results.Forbid();
            var account = await db.AdminAccounts.FindAsync([id], ct); if (account is null) return Results.NotFound();
            var role = NormalizeAdminRole(input.Role);
            if (account.Role == "Owner" && (role != "Owner" || input.Disabled) && await db.AdminAccounts.CountAsync(x => x.Role == "Owner" && !x.Disabled, ct) <= 1)
                return Results.BadRequest(new { error = "At least one active owner is required." });
            account.DisplayName = input.DisplayName.Trim(); account.Email = input.Email?.Trim(); account.Role = role; account.Disabled = input.Disabled;
            if (!string.IsNullOrWhiteSpace(input.Password))
            {
                var validation = ValidateCredentials(account.Username, input.Password); if (validation is not null) return Results.BadRequest(new { error = validation });
                account.PasswordHash = hasher.HashPassword(account, input.Password);
            }
            Audit(db, "user.update", account.Id, account.Username); await db.SaveChangesAsync(ct); return Results.NoContent();
        });

        admin.MapGet("/signage", async (LessonCueDb db, CancellationToken ct) =>
            await db.SignagePlaylists.AsNoTracking().OrderByDescending(x => x.Priority).ThenBy(x => x.Name).Select(x => new
            { x.Id, x.Name, x.Mode, x.Enabled, x.Priority, x.StartsAt, x.EndsAt, x.Message, x.BackgroundColor, x.TextColor,
                x.MediaAssetId, mediaFileName = x.MediaAsset != null ? x.MediaAsset.FileName : null, x.TargetTagsCsv, x.CreatedAt }).ToListAsync(ct));

        admin.MapPost("/signage", async (SignageInput input, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Signage name is required." });
            var item = new SignagePlaylist { Name = input.Name.Trim(), Mode = input.Mode is "emergency" or "idle" ? input.Mode : "scheduled",
                Enabled = input.Enabled, Priority = Math.Clamp(input.Priority, 0, 100), StartsAt = input.StartsAt, EndsAt = input.EndsAt,
                Message = input.Message?.Trim() ?? "", BackgroundColor = IsColor(input.BackgroundColor) ? input.BackgroundColor! : "#25302d",
                TextColor = IsColor(input.TextColor) ? input.TextColor! : "#ffffff", MediaAssetId = input.MediaAssetId, TargetTagsCsv = input.TargetTagsCsv?.Trim() ?? "" };
            db.SignagePlaylists.Add(item); Audit(db, "signage.create", item.Id, item.Name); await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, 0, ct); return Results.Created($"/api/v1/signage/{item.Id}", item);
        });

        admin.MapPut("/signage/{id:guid}", async (Guid id, SignageInput input, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.SignagePlaylists.FindAsync([id], ct); if (item is null) return Results.NotFound();
            item.Name = input.Name.Trim(); item.Mode = input.Mode is "emergency" or "idle" ? input.Mode : "scheduled"; item.Enabled = input.Enabled;
            item.Priority = Math.Clamp(input.Priority, 0, 100); item.StartsAt = input.StartsAt; item.EndsAt = input.EndsAt;
            item.Message = input.Message?.Trim() ?? ""; item.MediaAssetId = input.MediaAssetId; item.TargetTagsCsv = input.TargetTagsCsv?.Trim() ?? "";
            if (IsColor(input.BackgroundColor)) item.BackgroundColor = input.BackgroundColor!; if (IsColor(input.TextColor)) item.TextColor = input.TextColor!;
            Audit(db, "signage.update", item.Id, item.Name); await db.SaveChangesAsync(ct); await InvalidateAsync(hub, 0, ct); return Results.Ok(item);
        });

        admin.MapDelete("/signage/{id:guid}", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.SignagePlaylists.FindAsync([id], ct); if (item is null) return Results.NotFound();
            db.SignagePlaylists.Remove(item); Audit(db, "signage.delete", id, item.Name); await db.SaveChangesAsync(ct); await InvalidateAsync(hub, 0, ct);
            return Results.NoContent();
        });

        admin.MapGet("/backups", async (LessonCueDb db, CancellationToken ct) =>
            (await db.BackupRecords.AsNoTracking().ToListAsync(ct)).OrderByDescending(x => x.CreatedAt));
        admin.MapPost("/backups", async (bool? full, LessonCueDb db, BackupService backups, HttpContext context, CancellationToken ct) =>
        {
            if (!IsManager(context.User)) return Results.Forbid();
            var record = await backups.CreateAsync(db, full == true, context.User.Identity?.Name ?? "admin", ct);
            Audit(db, "backup.create", record.Id, record.Kind); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/backups/{record.Id}/file", record);
        });
        admin.MapGet("/backups/{id:guid}/file", async (Guid id, LessonCueDb db, BackupService backups, CancellationToken ct) =>
        {
            var record = await db.BackupRecords.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct); if (record is null) return Results.NotFound();
            var path = backups.Resolve(record.FileName); return path is null ? Results.NotFound() : Results.File(path, "application/zip", record.FileName);
        });

        admin.MapGet("/pairing/status", (PairingCodeService pairing) => Results.Ok(new { pin = pairing.Current, expiresAt = pairing.ExpiresAt }));
    }

    private static bool IsManager(ClaimsPrincipal user) => user.IsInRole("Owner") || user.IsInRole("Administrator");
    private static string NormalizeAdminRole(string role) => role is "Owner" or "Administrator" or "Editor" or "Viewer" ? role : "Viewer";
    private static bool IsColor(string? value) => value is { Length: 7 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit);

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
            new Claim(ClaimTypes.Role, account.Role),
            new Claim("display_name", account.DisplayName)
        ], CookieAuthenticationDefaults.AuthenticationScheme);
        return context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(12) });
    }

    private static void Audit(LessonCueDb db, string action, Guid id, string? summary) =>
        db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = action, Object = id.ToString(), Summary = summary });

    private static Task InvalidateAsync(IHubContext<SyncHub> hub, int version, CancellationToken ct) =>
        hub.Clients.All.SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED", manifestVersion = version }, ct);

    private static IResult StorageExceeded(long requestedBytes) => Results.Json(new
    {
        error = $"Not enough LessonCue storage is available for this upload ({requestedBytes} bytes requested). Ask an administrator to increase the allocation or remove media."
    }, statusCode: StatusCodes.Status507InsufficientStorage);
}
