using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
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

        auth.MapGet("/session", async (HttpContext context, LessonCueDb db, AccountEmailService email,
            CancellationToken ct) =>
        {
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            return new
            {
                setupRequired = !await db.AdminAccounts.AnyAsync(ct),
                authenticated = context.User.Identity?.IsAuthenticated == true,
                username = context.User.Identity?.Name,
                displayName = context.User.FindFirstValue("display_name"),
                role = context.User.FindFirstValue(ClaimTypes.Role),
                permissions = LessonCuePermissions.Effective(context.User),
                registrationMode = organization.RegistrationMode,
                registrationAvailable = organization.RegistrationMode is "open" or "code" && email.Status(organization.EmailProvider).Configured,
                emailConfigured = email.Status(organization.EmailProvider).Configured
            };
        });

        auth.MapPost("/setup", async (AdminSetupInput input, HttpContext context, LessonCueDb db,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            if (await db.AdminAccounts.AnyAsync(ct)) return Results.Conflict(new { error = "Administrator setup is already complete." });
            var validation = ValidateCredentials(input.Username, input.Password);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var setupEmail = NullIfBlank(input.Email)?.ToLowerInvariant();
            if (setupEmail is not null && !IsEmail(setupEmail))
                return Results.BadRequest(new { error = "Enter a valid email address." });

            var account = new AdminAccount { Username = input.Username.Trim().ToLowerInvariant(), PasswordHash = "pending",
                DisplayName = string.IsNullOrWhiteSpace(input.DisplayName) ? "Administrator" : input.DisplayName.Trim(),
                Email = setupEmail, EmailVerified = true, EmailVerifiedAt = setupEmail is null ? null : DateTimeOffset.UtcNow,
                Role = "Owner" };
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
            if (account is null || account.Disabled || !account.EmailVerified ||
                hasher.VerifyHashedPassword(account, account.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
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

        auth.MapPost("/register", async (RegistrationInput input, HttpRequest request, LessonCueDb db,
            AccountEmailService email, IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            var organization = await db.Organizations.FirstAsync(ct);
            if (organization.RegistrationMode is not ("open" or "code"))
                return Results.Json(new { error = "Registration is closed. Ask an administrator to create your account." }, statusCode: 403);
            if (!email.Status(organization.EmailProvider).Configured)
                return Results.Conflict(new { error = "Registration requires administrator-configured email delivery." });
            var validation = ValidateCredentials(input.Username, input.Password);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            if (string.IsNullOrWhiteSpace(input.DisplayName) || input.DisplayName.Trim().Length > 120 || !IsEmail(input.Email))
                return Results.BadRequest(new { error = "A name and valid email address are required." });
            var username = input.Username.Trim().ToLowerInvariant();
            var address = input.Email.Trim().ToLowerInvariant();
            if (await db.AdminAccounts.AnyAsync(x => x.Username == username || x.Email == address, ct))
                return Results.Conflict(new { error = "That username or email address is already registered." });
            RegistrationCode? registrationCode = null;
            if (organization.RegistrationMode == "code")
            {
                var hash = AccountEmailService.Hash(input.Code ?? "");
                var now = DateTimeOffset.UtcNow;
                registrationCode = await db.RegistrationCodes.SingleOrDefaultAsync(x => x.CodeHash == hash && x.RevokedAt == null, ct);
                if (registrationCode is null || registrationCode.ExpiresAt <= now ||
                    registrationCode.MaxUses is int maximum && registrationCode.Uses >= maximum)
                    return Results.BadRequest(new { error = "The registration code is invalid or expired." });
            }
            var account = new AdminAccount
            {
                Username = username, DisplayName = input.DisplayName.Trim(), Email = address, Role = "Viewer",
                PasswordHash = "pending", EmailVerified = false
            };
            account.PasswordHash = hasher.HashPassword(account, input.Password);
            db.AdminAccounts.Add(account);
            var raw = AccountEmailService.NewToken();
            db.AccountTokens.Add(NewAccountToken(account.Id, "verify", raw, TimeSpan.FromHours(24)));
            db.AuditEvents.Add(new AuditEvent { Actor = username, Action = "account.register", Object = account.Id.ToString() });
            await using var registrationTransaction = registrationCode is null
                ? null
                : await db.Database.BeginTransactionAsync(ct);
            if (registrationCode is not null)
            {
                var consumed = await db.RegistrationCodes.Where(x => x.Id == registrationCode.Id && x.RevokedAt == null &&
                    (x.MaxUses == null || x.Uses < x.MaxUses)).ExecuteUpdateAsync(update =>
                    update.SetProperty(x => x.Uses, x => x.Uses + 1), ct);
                if (consumed != 1) return Results.BadRequest(new { error = "The registration code is invalid or expired." });
            }
            await db.SaveChangesAsync(ct);
            if (registrationTransaction is not null) await registrationTransaction.CommitAsync(ct);
            try
            {
                await SendAccountLinkAsync(email, organization, address, "Verify your LessonCue account",
                    "Verify account", AccountUrl(organization, request, "/verify", raw), ct);
            }
            catch (Exception error)
            {
                return Results.Problem($"The account was created, but verification email could not be sent: {error.Message}",
                    statusCode: 503);
            }
            return Results.Accepted(value: new { message = "Check your email to verify the account." });
        }).RequireRateLimiting("account");

        auth.MapPost("/verify", async (VerifyAccountInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var token = await FindTokenAsync(db, input.Token, "verify", ct);
            if (token?.Account is null) return Results.BadRequest(new { error = "This verification link is invalid or expired." });
            token.UsedAt = DateTimeOffset.UtcNow;
            token.Account.EmailVerified = true;
            token.Account.EmailVerifiedAt = DateTimeOffset.UtcNow;
            token.Account.SessionVersion++;
            db.AuditEvents.Add(new AuditEvent { Actor = token.Account.Username, Action = "account.verify", Object = token.AccountId.ToString() });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Email verified. You can now sign in." });
        }).RequireRateLimiting("account");

        auth.MapPost("/verification/resend", async (PasswordRecoveryInput input, HttpRequest request, LessonCueDb db,
            AccountEmailService email, CancellationToken ct) =>
        {
            var address = input.Email.Trim().ToLowerInvariant();
            var account = await db.AdminAccounts.SingleOrDefaultAsync(x => x.Email == address && !x.EmailVerified && !x.Disabled, ct);
            var organization = await db.Organizations.FirstAsync(ct);
            if (account is not null && email.Status(organization.EmailProvider).Configured)
            {
                await InvalidateTokensAsync(db, account.Id, "verify", ct);
                var raw = AccountEmailService.NewToken();
                db.AccountTokens.Add(NewAccountToken(account.Id, "verify", raw, TimeSpan.FromHours(24)));
                await db.SaveChangesAsync(ct);
                try
                {
                    await SendAccountLinkAsync(email, organization, address, "Verify your LessonCue account",
                        "Verify account", AccountUrl(organization, request, "/verify", raw), ct);
                }
                catch
                {
                    db.AuditEvents.Add(new AuditEvent { Actor = "system", Action = "account.verification.delivery", Object = account.Id.ToString(), Result = "failed" });
                    await db.SaveChangesAsync(ct);
                }
            }
            return Results.Accepted(value: new { message = "If that unverified account exists, a new link has been sent." });
        }).RequireRateLimiting("account");

        auth.MapPost("/password/forgot", async (PasswordRecoveryInput input, HttpRequest request, LessonCueDb db,
            AccountEmailService email, CancellationToken ct) =>
        {
            var address = input.Email.Trim().ToLowerInvariant();
            var account = await db.AdminAccounts.SingleOrDefaultAsync(x => x.Email == address && x.EmailVerified && !x.Disabled, ct);
            var organization = await db.Organizations.FirstAsync(ct);
            if (account is not null && email.Status(organization.EmailProvider).Configured)
            {
                await InvalidateTokensAsync(db, account.Id, "reset", ct);
                var raw = AccountEmailService.NewToken();
                db.AccountTokens.Add(NewAccountToken(account.Id, "reset", raw, TimeSpan.FromHours(1)));
                await db.SaveChangesAsync(ct);
                try
                {
                    await SendAccountLinkAsync(email, organization, address, "Reset your LessonCue password",
                        "Reset password", AccountUrl(organization, request, "/reset-password", raw), ct);
                }
                catch
                {
                    db.AuditEvents.Add(new AuditEvent { Actor = "system", Action = "account.recovery.delivery", Object = account.Id.ToString(), Result = "failed" });
                    await db.SaveChangesAsync(ct);
                }
            }
            return Results.Accepted(value: new { message = "If that verified account exists, a reset link has been sent." });
        }).RequireRateLimiting("account");

        auth.MapPost("/password/reset", async (PasswordResetInput input, LessonCueDb db,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            var token = await FindTokenAsync(db, input.Token, "reset", ct);
            if (token?.Account is null) return Results.BadRequest(new { error = "This reset link is invalid or expired." });
            var validation = AdminCredentialPolicy.Validate(token.Account.Username, input.Password);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            token.Account.PasswordHash = hasher.HashPassword(token.Account, input.Password);
            token.Account.SessionVersion++;
            token.UsedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { Actor = token.Account.Username, Action = "account.password.reset", Object = token.AccountId.ToString() });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Password changed. Sign in with the new password." });
        }).RequireRateLimiting("account");

        auth.MapPost("/logout", async (HttpContext context) =>
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).RequireAuthorization();

        auth.MapGet("/profile", async (HttpContext context, LessonCueDb db, CancellationToken ct) =>
        {
            var account = await CurrentAccountAsync(context, db, ct);
            return account is null ? Results.Unauthorized() : Results.Ok(new
            {
                account.Username, account.DisplayName, account.Email, account.EmailVerified, account.Role
            });
        }).RequireAuthorization();

        auth.MapPut("/profile", async (ProfileUpdateInput input, HttpContext context, HttpRequest request,
            LessonCueDb db, AccountEmailService email, IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            var account = await CurrentAccountAsync(context, db, ct);
            if (account is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(input.DisplayName) || input.DisplayName.Trim().Length > 120)
                return Results.BadRequest(new { error = "Name is required and cannot exceed 120 characters." });
            var usernameValidation = AdminCredentialPolicy.ValidateUsername(input.Username);
            if (usernameValidation is not null) return Results.BadRequest(new { error = usernameValidation });
            var username = input.Username.Trim().ToLowerInvariant();
            var address = NullIfBlank(input.Email)?.ToLowerInvariant();
            var sensitive = username != account.Username || address != account.Email || !string.IsNullOrWhiteSpace(input.NewPassword);
            if (sensitive && (string.IsNullOrWhiteSpace(input.CurrentPassword) ||
                hasher.VerifyHashedPassword(account, account.PasswordHash, input.CurrentPassword) == PasswordVerificationResult.Failed))
                return Results.BadRequest(new { error = "Enter your current password to change sign-in details." });
            if (await db.AdminAccounts.AnyAsync(x => x.Id != account.Id && x.Username == username, ct))
                return Results.Conflict(new { error = "That username already exists." });
            account.DisplayName = input.DisplayName.Trim();
            account.Username = username;
            if (!string.IsNullOrWhiteSpace(input.NewPassword))
            {
                var passwordValidation = AdminCredentialPolicy.Validate(username, input.NewPassword);
                if (passwordValidation is not null) return Results.BadRequest(new { error = passwordValidation });
                account.PasswordHash = hasher.HashPassword(account, input.NewPassword);
            }
            var message = "Profile saved.";
            Organization? pendingEmailOrganization = null;
            string? pendingEmailAddress = null;
            string? pendingEmailToken = null;
            if (address != account.Email && address is null)
            {
                account.Email = null;
                account.EmailVerified = true;
                account.EmailVerifiedAt = null;
                await InvalidateTokensAsync(db, account.Id, "email", ct);
            }
            else if (address is not null && address != account.Email)
            {
                if (!IsEmail(address)) return Results.BadRequest(new { error = "Enter a valid email address." });
                if (await db.AdminAccounts.AnyAsync(x => x.Id != account.Id && x.Email == address, ct))
                    return Results.Conflict(new { error = "That email address is already registered." });
                var organization = await db.Organizations.FirstAsync(ct);
                if (!email.Status(organization.EmailProvider).Configured)
                    return Results.Conflict(new { error = "An administrator must configure email before changing your address." });
                await InvalidateTokensAsync(db, account.Id, "email", ct);
                var raw = AccountEmailService.NewToken();
                db.AccountTokens.Add(NewAccountToken(account.Id, "email", raw, TimeSpan.FromHours(2), address));
                pendingEmailOrganization = organization;
                pendingEmailAddress = address;
                pendingEmailToken = raw;
                message = "Profile saved. Confirm the link sent to your new email address.";
            }
            account.SessionVersion++;
            db.AuditEvents.Add(new AuditEvent { Actor = account.Username, Action = "account.profile.update", Object = account.Id.ToString() });
            await db.SaveChangesAsync(ct);
            await SignInAsync(context, account);
            if (pendingEmailOrganization is not null && pendingEmailAddress is not null && pendingEmailToken is not null)
            {
                try
                {
                    await SendAccountLinkAsync(email, pendingEmailOrganization, pendingEmailAddress,
                        "Confirm your new LessonCue email", "Confirm email",
                        AccountUrl(pendingEmailOrganization, request, "/verify-email", pendingEmailToken), ct);
                }
                catch
                {
                    return Results.Problem("The profile was saved, but the confirmation email could not be sent. Retry the email change after the provider is fixed.",
                        statusCode: 503);
                }
            }
            return Results.Ok(new { message });
        }).RequireAuthorization().RequireRateLimiting("account");

        auth.MapPost("/email/verify", async (VerifyAccountInput input, HttpContext context, LessonCueDb db,
            CancellationToken ct) =>
        {
            var token = await FindTokenAsync(db, input.Token, "email", ct);
            if (token?.Account is null || string.IsNullOrWhiteSpace(token.PendingEmail))
                return Results.BadRequest(new { error = "This email confirmation link is invalid or expired." });
            if (await db.AdminAccounts.AnyAsync(x => x.Id != token.AccountId && x.Email == token.PendingEmail, ct))
                return Results.Conflict(new { error = "That email address is no longer available." });
            token.Account.Email = token.PendingEmail;
            token.Account.EmailVerified = true;
            token.Account.EmailVerifiedAt = DateTimeOffset.UtcNow;
            token.Account.SessionVersion++;
            token.UsedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            if (context.User.Identity?.IsAuthenticated == true) await SignInAsync(context, token.Account);
            return Results.Ok(new { message = "Email address confirmed." });
        }).RequireRateLimiting("account");

        var admin = api.MapGroup("").RequireAuthorization();
        var planning = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Planning);
        var uploads = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Uploads);
        var playback = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Playback);
        var screens = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Screens);
        var settings = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Settings);

        admin.MapGet("/admin/bootstrap", async (LessonCueDb db, PairingCodeService pairing, StorageService storage,
            UpdateService updates, LocalAddressService localAddress, HttpPortService httpPort,
            CloudflareTunnelService cloudflareTunnel, HardwareAccelerationService hardwareAcceleration,
            HttpContext context,
            CancellationToken ct) =>
        {
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var storageStatus = await storage.GetSnapshotAsync(organization.StorageLimitBytes, ct);
            var canPair = LessonCuePermissions.Has(context.User, LessonCuePermissions.Screens) ||
                LessonCuePermissions.Has(context.User, LessonCuePermissions.Settings);
            return Results.Ok(new
            {
                serverId,
                serverName,
                organization = organization.Name,
                settings = organization,
                organization.TimeZone,
                pairingPin = canPair ? pairing.Current : null,
                pairingExpiresAt = canPair ? (DateTimeOffset?)pairing.ExpiresAt : null,
                pairingFixed = canPair && pairing.FixedPin is not null,
                controllerPinConfigured = organization.ControllerPinHash is not null,
                storage = storageStatus,
                mediaTaxonomy = MediaTaxonomy.Read(organization),
                update = updates.Status,
                localAddress = localAddress.Status,
                httpPort = httpPort.Status,
                cloudflareTunnel = cloudflareTunnel.Status,
                hardwareAcceleration = hardwareAcceleration.Status,
                accountEmail = emailStatus(organization),
                permissionDefinitions = LessonCuePermissions.All,
                permissionPresets = new
                {
                    owner = LessonCuePermissions.Defaults("Owner"),
                    administrator = LessonCuePermissions.Defaults("Administrator"),
                    editor = LessonCuePermissions.Defaults("Editor"),
                    viewer = LessonCuePermissions.Defaults("Viewer")
                },
                counts = new
                {
                    classes = await db.Classes.CountAsync(ct),
                    lessons = await db.Lessons.CountAsync(ct),
                    media = await db.MediaAssets.CountAsync(ct),
                    screens = await db.Screens.CountAsync(x => !x.Revoked, ct)
                }
            });
            object emailStatus(Organization value)
            {
                var accountEmail = context.RequestServices.GetRequiredService<AccountEmailService>();
                var status = accountEmail.Status(value.EmailProvider);
                return new { status.Configured, status.Provider };
            }
        });

        admin.MapGet("/classes", async (LessonCueDb db, CancellationToken ct) =>
            await db.Classes.AsNoTracking().OrderBy(x => x.Name).Select(x => new
            {
                x.Id,
                x.Name,
                x.Description,
                x.ControllerSlug,
                x.ControllerColor,
                x.ControllerHostname,
                lessonCount = db.Lessons.Count(lesson => lesson.ClassId == x.Id),
                screenCount = db.Screens.Count(screen => screen.AssignedClassId == x.Id && !screen.Revoked)
            }).ToListAsync(ct));

        planning.MapPost("/classes", async (ClassInput input, LessonCueDb db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Class name is required." });
            var slug = NormalizeControllerSlug(input.ControllerSlug ?? input.Name);
            var error = ValidateControllerAddress(slug, input.ControllerColor, input.ControllerHostname);
            if (error is not null) return Results.BadRequest(new { error });
            if (await db.Classes.AnyAsync(x => x.ControllerSlug == slug, ct))
                return Results.Conflict(new { error = "That controller path is already assigned to another class." });
            var hostname = NormalizeHostname(input.ControllerHostname);
            if (hostname is not null && await db.Classes.AnyAsync(x => x.ControllerHostname == hostname, ct))
                return Results.Conflict(new { error = "That controller hostname is already assigned to another class." });
            var item = new LessonClass { Name = input.Name.Trim(), Description = input.Description?.Trim() ?? "",
                ControllerSlug = slug, ControllerColor = input.ControllerColor?.Trim() ?? "#2d6a4f",
                ControllerHostname = hostname };
            db.Classes.Add(item);
            Audit(db, "class.create", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/classes/{item.Id}", item);
        });

        planning.MapPut("/classes/{id:guid}", async (Guid id, ClassInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var item = await db.Classes.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Class name is required." });
            var slug = NormalizeControllerSlug(input.ControllerSlug ??
                (string.IsNullOrWhiteSpace(item.ControllerSlug) ? input.Name : item.ControllerSlug));
            var error = ValidateControllerAddress(slug, input.ControllerColor ?? item.ControllerColor, input.ControllerHostname);
            if (error is not null) return Results.BadRequest(new { error });
            if (await db.Classes.AnyAsync(x => x.Id != id && x.ControllerSlug == slug, ct))
                return Results.Conflict(new { error = "That controller path is already assigned to another class." });
            var hostname = NormalizeHostname(input.ControllerHostname);
            if (hostname is not null && await db.Classes.AnyAsync(x => x.Id != id && x.ControllerHostname == hostname, ct))
                return Results.Conflict(new { error = "That controller hostname is already assigned to another class." });
            item.Name = input.Name.Trim();
            item.Description = input.Description?.Trim() ?? "";
            item.ControllerSlug = slug;
            item.ControllerColor = input.ControllerColor?.Trim() ?? item.ControllerColor;
            item.ControllerHostname = hostname;
            Audit(db, "class.update", id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Ok(item);
        });

        planning.MapDelete("/classes/{id:guid}", async (Guid id, LessonCueDb db, HttpContext context,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.Classes.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var now = DateTimeOffset.UtcNow;
            var actor = context.User.Identity?.Name ?? "admin";
            item.DeletedAt = now; item.DeletedBy = actor;
            var lessons = await db.Lessons.Where(x => x.ClassId == id).ToListAsync(ct);
            foreach (var lesson in lessons) { lesson.DeletedAt = now; lesson.DeletedBy = actor; }
            Audit(db, "class.recycle", id, $"{item.Name}; {lessons.Count} lessons");
            await db.SaveChangesAsync(ct); await InvalidateAsync(hub, 0, ct);
            return Results.NoContent();
        });

        planning.MapPost("/controller/sessions", async (TemporaryControllerSessionInput input,
            ControllerSessionService controllerSessions, LessonCueDb db, CancellationToken ct) =>
        {
            if (input.ExpiresInMinutes is < 5 or > 10_080)
                return Results.BadRequest(new { error = "Temporary controller duration must be from 5 minutes to 7 days." });
            var lessonClass = await db.Classes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == input.ClassId, ct);
            if (lessonClass is null) return Results.BadRequest(new { error = "Choose an existing class." });
            if (input.LessonId is Guid lessonId && !await db.Lessons.AnyAsync(x => x.Id == lessonId && x.ClassId == input.ClassId && !x.Archived, ct))
                return Results.BadRequest(new { error = "The selected lesson is unavailable in that class." });
            var session = controllerSessions.Create(input.ClassId, input.LessonId, input.ExpiresInMinutes);
            Audit(db, "controller.session.create", input.ClassId, $"expires:{session.ExpiresAt:O};lesson:{input.LessonId}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/controller/sessions/{session.Token}", new
            {
                session.Token, session.ClassId, session.LessonId, session.ExpiresAt,
                path = $"/session/{session.Token}"
            });
        });

        playback.MapGet("/controller/sessions/{token}", (string token, ControllerSessionService controllerSessions) =>
        {
            var session = controllerSessions.Get(token);
            return session is null ? Results.NotFound(new { error = "This temporary controller link is invalid or expired." }) : Results.Ok(new
            {
                session.ClassId, session.LessonId, session.ExpiresAt
            });
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
                x.GeneratedByScheduleId,
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
                    item.CuePointsJson,
                    offlineEligible = item.MediaAsset != null && item.MediaAsset.OfflineEligible
                }).ToList()
            }).ToListAsync(ct));
        });

        planning.MapPost("/lessons", async (LessonInput input, LessonCueDb db, CancellationToken ct) =>
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

        planning.MapPut("/lessons/{id:guid}", async (Guid id, LessonUpdateInput input, LessonCueDb db,
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

        planning.MapDelete("/lessons/{id:guid}", async (Guid id, LessonCueDb db, HttpContext context, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.FindAsync([id], ct);
            if (lesson is null) return Results.NotFound();
            lesson.DeletedAt = DateTimeOffset.UtcNow; lesson.DeletedBy = context.User.Identity?.Name ?? "admin";
            Audit(db, "lesson.recycle", id, lesson.Title);
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, 0, ct);
            return Results.NoContent();
        });

        planning.MapPost("/lessons/{id:guid}/duplicate", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
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
                    FadeOutMs = sourceItem.FadeOutMs, NormalizeAudio = sourceItem.NormalizeAudio,
                    CuePointsJson = sourceItem.CuePointsJson
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

        planning.MapPost("/lessons/{id:guid}/archive", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var lesson = await db.Lessons.FindAsync([id], ct);
            if (lesson is null) return Results.NotFound();
            lesson.Archived = !lesson.Archived; lesson.Version++;
            Audit(db, lesson.Archived ? "lesson.archive" : "lesson.restore", id, lesson.Title);
            await db.SaveChangesAsync(ct); await InvalidateAsync(hub, lesson.Version, ct);
            return Results.Ok(new { lesson.Archived });
        });

        planning.MapPost("/lessons/bulk", async (LessonBulkInput input, LessonCueDb db,
            HttpContext context, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            if (input.LessonIds is null || string.IsNullOrWhiteSpace(input.Action))
                return Results.BadRequest(new { error = "Select lessons and choose an action." });
            var ids = input.LessonIds.Distinct().ToList();
            if (input.LessonIds.Count > 500 || ids.Count is 0 or > 500) return Results.BadRequest(new { error = "Select between 1 and 500 lessons." });
            var lessons = await db.Lessons.Include(x => x.Items).Where(x => ids.Contains(x.Id)).ToListAsync(ct);
            if (lessons.Count != ids.Count) return Results.BadRequest(new { error = "One or more selected lessons no longer exist." });
            var action = input.Action.Trim().ToLowerInvariant();
            switch (action)
            {
                case "archive":
                case "restore":
                    foreach (var lesson in lessons) { lesson.Archived = action == "archive"; lesson.Version++; }
                    break;
                case "delete":
                    foreach (var lesson in lessons) { lesson.DeletedAt = DateTimeOffset.UtcNow; lesson.DeletedBy = context.User.Identity?.Name ?? "admin"; }
                    break;
                case "move":
                    if (input.ClassId is not Guid classId || !await db.Classes.AnyAsync(x => x.Id == classId, ct))
                        return Results.BadRequest(new { error = "Choose an existing destination class." });
                    foreach (var lesson in lessons) { lesson.ClassId = classId; lesson.GeneratedByScheduleId = null; lesson.Version++; }
                    break;
                case "shift":
                    if (input.ShiftDays is not int shiftDays || shiftDays is < -3650 or > 3650 || shiftDays == 0)
                        return Results.BadRequest(new { error = "Enter a non-zero date shift between -3650 and 3650 days." });
                    foreach (var lesson in lessons)
                    {
                        lesson.Date = lesson.Date.AddDays(shiftDays);
                        lesson.AvailableFrom = lesson.AvailableFrom?.AddDays(shiftDays);
                        lesson.ExpiresAt = lesson.ExpiresAt?.AddDays(shiftDays);
                        lesson.DesignatedStartAt = lesson.DesignatedStartAt?.AddDays(shiftDays);
                        lesson.PreRollStartsAt = lesson.PreRollStartsAt?.AddDays(shiftDays);
                        lesson.GeneratedByScheduleId = null;
                        lesson.Version++;
                    }
                    var mediaIds = lessons.SelectMany(x => x.Items).Where(x => x.MediaAssetId != null)
                        .Select(x => x.MediaAssetId!.Value).Distinct().ToList();
                    var media = await db.MediaAssets.Where(x => mediaIds.Contains(x.Id) && x.StoragePolicy == MediaRetention.LessonScoped).ToListAsync(ct);
                    foreach (var asset in media)
                        foreach (var lesson in lessons.Where(x => x.Items.Any(item => item.MediaAssetId == asset.Id)))
                            MediaRetention.KeepForLesson(asset, lesson);
                    break;
                case "prefix-title":
                    var prefix = input.TitlePrefix?.Trim();
                    if (string.IsNullOrWhiteSpace(prefix) || prefix.Length > 80)
                        return Results.BadRequest(new { error = "Enter a title prefix of 1 to 80 characters." });
                    foreach (var lesson in lessons)
                    {
                        lesson.Title = (prefix + " " + lesson.Title).Trim();
                        if (lesson.Title.Length > 160) lesson.Title = lesson.Title[..160].TrimEnd();
                        lesson.Version++;
                    }
                    break;
                default:
                    return Results.BadRequest(new { error = "Unsupported bulk lesson action." });
            }
            Audit(db, $"lesson.bulk.{action}", lessons[0].Id, $"{lessons.Count} lessons");
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, lessons.Max(x => x.Version), ct);
            return Results.Ok(new { updated = lessons.Count, action });
        });

        admin.MapGet("/lesson-templates", async (LessonCueDb db, CancellationToken ct) =>
            Results.Ok(await db.LessonTemplates.AsNoTracking().OrderBy(x => x.Name).Select(x => new
            {
                x.Id, x.Name, x.Description, x.DefaultTitle, x.DefaultStartMinutes, x.PreRollLeadMinutes,
                x.AvailableLeadMinutes, x.ExpiresAfterMinutes, x.PreRollEnabled, x.KeepOffline,
                x.DownloadDaysBefore, x.CreatedAt, x.UpdatedAt,
                scheduleCount = x.Schedules.Count,
                items = x.Items.OrderBy(item => item.Position).Select(item => new
                {
                    item.Id, item.Title, item.Type, item.Role, item.Position, item.MediaAssetId,
                    mediaFileName = item.MediaAsset != null ? item.MediaAsset.FileName : null,
                    item.DurationMs, item.StartMs, item.EndMs, item.VolumePercent, item.ImageDurationSeconds,
                    item.EndBehavior, item.AllowSkip, item.Notes, item.FadeInMs, item.FadeOutMs,
                    item.NormalizeAudio, item.CuePointsJson
                })
            }).ToListAsync(ct)));

        planning.MapPost("/lesson-templates/from-lesson", async (LessonTemplateFromLessonInput input,
            LessonCueDb db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Template name is required." });
            var template = await LessonScheduleService.CreateTemplateFromLessonAsync(db, input.LessonId,
                input.Name, input.Description ?? "", ct);
            return template is null ? Results.NotFound(new { error = "The source lesson was not found." }) :
                Results.Created($"/api/v1/lesson-templates/{template.Id}", new { template.Id });
        });

        planning.MapPut("/lesson-templates/{id:guid}", async (Guid id, LessonTemplateUpdateInput input,
            LessonCueDb db, CancellationToken ct) =>
        {
            var template = await db.LessonTemplates.FindAsync([id], ct);
            if (template is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Template name is required." });
            if (input.DefaultStartMinutes is < 0 or > 1439 || input.PreRollLeadMinutes is < 0 or > 1440 ||
                input.DownloadDaysBefore is < 0 or > 365)
                return Results.BadRequest(new { error = "Template timing is outside the supported range." });
            template.Name = input.Name.Trim(); template.Description = input.Description?.Trim() ?? "";
            template.DefaultTitle = string.IsNullOrWhiteSpace(input.DefaultTitle) ? template.Name : input.DefaultTitle.Trim();
            template.DefaultStartMinutes = input.DefaultStartMinutes; template.PreRollLeadMinutes = input.PreRollLeadMinutes;
            template.PreRollEnabled = input.PreRollEnabled; template.KeepOffline = input.KeepOffline;
            template.DownloadDaysBefore = input.DownloadDaysBefore; template.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, "template.update", id, template.Name); await db.SaveChangesAsync(ct);
            return Results.Ok(new { template.Id });
        });

        planning.MapPost("/lesson-templates/{id:guid}/replace-from-lesson", async (Guid id,
            LessonTemplateReplaceInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var replaced = await LessonScheduleService.ReplaceTemplateFromLessonAsync(db, id, input.LessonId, "admin", ct);
            return replaced ? Results.Ok(new { id }) : Results.NotFound(new { error = "The template or source lesson was not found." });
        });

        planning.MapDelete("/lesson-templates/{id:guid}", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var template = await db.LessonTemplates.FindAsync([id], ct);
            if (template is null) return Results.NotFound();
            db.LessonTemplates.Remove(template); Audit(db, "template.delete", id, template.Name);
            await db.SaveChangesAsync(ct); return Results.NoContent();
        });

        planning.MapPost("/lesson-templates/{id:guid}/instantiate", async (Guid id, LessonTemplateInstantiateInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            if (input.StartMinutes is < 0 or > 1439) return Results.BadRequest(new { error = "Start time is invalid." });
            var lesson = await LessonScheduleService.InstantiateAsync(db, id, input.ClassId, input.Date,
                input.Title, input.StartMinutes, null, "admin", ct);
            if (lesson is null) return Results.NotFound(new { error = "The template or class was not found." });
            await InvalidateAsync(hub, lesson.Version, ct);
            return Results.Created($"/api/v1/lessons/{lesson.Id}", new { lesson.Id });
        });

        admin.MapGet("/recurring-schedules", async (LessonCueDb db, CancellationToken ct) =>
            Results.Ok(await db.RecurringLessonSchedules.AsNoTracking().OrderBy(x => x.Name).Select(x => new
            {
                x.Id, x.TemplateId, templateName = x.Template!.Name, x.ClassId, className = x.Class!.Name,
                x.Name, x.Frequency, x.Interval, x.DayOfWeek, x.DayOfMonth, x.StartDate, x.EndDate,
                x.StartMinutes, x.TitlePattern, x.CustomDatesJson, x.ExcludedDatesJson, x.Enabled,
                x.GenerateDaysAhead, x.LastGeneratedAt, x.CreatedAt, x.UpdatedAt,
                generatedCount = db.Lessons.Count(lesson => lesson.GeneratedByScheduleId == x.Id)
            }).ToListAsync(ct)));

        planning.MapPost("/recurring-schedules", async (RecurringScheduleInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var error = ValidateSchedule(input);
            if (error is not null) return Results.BadRequest(new { error });
            if (!await db.LessonTemplates.AnyAsync(x => x.Id == input.TemplateId, ct) ||
                !await db.Classes.AnyAsync(x => x.Id == input.ClassId, ct))
                return Results.BadRequest(new { error = "The selected template or class does not exist." });
            var schedule = new RecurringLessonSchedule { Name = input.Name.Trim() }; ApplySchedule(schedule, input);
            db.RecurringLessonSchedules.Add(schedule); Audit(db, "schedule.create", schedule.Id, schedule.Name);
            await db.SaveChangesAsync(ct);
            var created = schedule.Enabled ? await LessonScheduleService.GenerateAsync(db, schedule.Id, null, "admin", ct) : 0;
            if (created > 0) await InvalidateAsync(hub, created, ct);
            return Results.Created($"/api/v1/recurring-schedules/{schedule.Id}", new { schedule.Id, generated = created });
        });

        planning.MapPut("/recurring-schedules/{id:guid}", async (Guid id, RecurringScheduleInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var error = ValidateSchedule(input);
            if (error is not null) return Results.BadRequest(new { error });
            var schedule = await db.RecurringLessonSchedules.FindAsync([id], ct);
            if (schedule is null) return Results.NotFound();
            if (!await db.LessonTemplates.AnyAsync(x => x.Id == input.TemplateId, ct) ||
                !await db.Classes.AnyAsync(x => x.Id == input.ClassId, ct))
                return Results.BadRequest(new { error = "The selected template or class does not exist." });
            ApplySchedule(schedule, input); Audit(db, "schedule.update", id, schedule.Name); await db.SaveChangesAsync(ct);
            var created = schedule.Enabled ? await LessonScheduleService.GenerateAsync(db, schedule.Id, null, "admin", ct) : 0;
            if (created > 0) await InvalidateAsync(hub, created, ct);
            return Results.Ok(new { schedule.Id, generated = created });
        });

        planning.MapDelete("/recurring-schedules/{id:guid}", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var schedule = await db.RecurringLessonSchedules.FindAsync([id], ct);
            if (schedule is null) return Results.NotFound();
            db.RecurringLessonSchedules.Remove(schedule); Audit(db, "schedule.delete", id, schedule.Name);
            await db.SaveChangesAsync(ct); return Results.NoContent();
        });

        planning.MapPost("/recurring-schedules/{id:guid}/generate", async (Guid id,
            RecurringScheduleGenerateInput input, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var created = await LessonScheduleService.GenerateAsync(db, id, input.ThroughDate, "admin", ct);
            if (created < 0) return Results.NotFound();
            if (created > 0) await InvalidateAsync(hub, created, ct);
            return Results.Ok(new { generated = created });
        });

        planning.MapPost("/recurring-schedules/{id:guid}/exception", async (Guid id,
            RecurringScheduleExceptionInput input, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var schedule = await db.RecurringLessonSchedules.FindAsync([id], ct);
            if (schedule is null) return Results.NotFound();
            var dates = LessonScheduleService.ParseDates(schedule.ExcludedDatesJson);
            if (input.Excluded) dates.Add(input.Date); else dates.Remove(input.Date);
            schedule.ExcludedDatesJson = LessonScheduleService.SerializeDates(dates);
            schedule.UpdatedAt = DateTimeOffset.UtcNow;
            var removed = 0;
            if (input.Excluded)
            {
                var generated = await db.Lessons.SingleOrDefaultAsync(x => x.GeneratedByScheduleId == id && x.Date == input.Date, ct);
                if (generated is not null) { db.Lessons.Remove(generated); removed = 1; }
            }
            Audit(db, input.Excluded ? "schedule.exception.add" : "schedule.exception.remove", id, input.Date.ToString("yyyy-MM-dd"));
            await db.SaveChangesAsync(ct);
            var created = !input.Excluded && schedule.Enabled
                ? await LessonScheduleService.GenerateAsync(db, id, input.Date, "admin", ct) : 0;
            if (removed > 0 || created > 0) await InvalidateAsync(hub, created, ct);
            return Results.Ok(new { schedule.ExcludedDatesJson, removed, generated = created });
        });

        planning.MapPost("/lessons/{lessonId:guid}/items", async (Guid lessonId, PlaylistItemInput input,
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

        planning.MapPatch("/playlist-items/{id:guid}", async (Guid id, PlaylistItemUpdateInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.PlaylistItems.Include(x => x.Lesson).Include(x => x.MediaAsset).SingleOrDefaultAsync(x => x.Id == id, ct);
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
            if (input.CuePoints is not null)
            {
                if (input.CuePoints.Count > 50) return Results.BadRequest(new { error = "A media item can have at most 50 named markers." });
                var minimum = item.StartMs;
                var maximum = item.EndMs ?? item.MediaAsset?.DurationMs ?? item.DurationMs ?? long.MaxValue;
                if (input.CuePoints.Any(x => string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 80 || x.PositionMs < minimum || x.PositionMs > maximum))
                    return Results.BadRequest(new { error = "Every marker needs a name and a position within the playable selection." });
                var normalized = input.CuePoints.Select(x => new CuePointInput(x.Name.Trim(), x.PositionMs))
                    .OrderBy(x => x.PositionMs).ThenBy(x => x.Name).ToList();
                item.CuePointsJson = JsonSerializer.Serialize(normalized);
            }
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

        planning.MapDelete("/playlist-items/{id:guid}", async (Guid id, LessonCueDb db,
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

        planning.MapPost("/lessons/{lessonId:guid}/reorder", async (Guid lessonId, PlaylistReorderInput input,
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

        planning.MapPost("/playlist-items/bulk", async (PlaylistItemBulkInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            if (input.ItemIds is null || string.IsNullOrWhiteSpace(input.Action))
                return Results.BadRequest(new { error = "Select playlist items and choose an action." });
            var ids = input.ItemIds.Distinct().ToList();
            if (input.ItemIds.Count > 500 || ids.Count is 0 or > 500) return Results.BadRequest(new { error = "Select between 1 and 500 playlist items." });
            var items = await db.PlaylistItems.Include(x => x.Lesson).Where(x => ids.Contains(x.Id)).ToListAsync(ct);
            if (items.Count != ids.Count || items.Any(x => x.Lesson is null))
                return Results.BadRequest(new { error = "One or more selected playlist items no longer exist." });
            var action = input.Action.Trim().ToLowerInvariant();
            switch (action)
            {
                case "delete":
                    foreach (var item in items.Where(x => x.Lesson!.CountdownItemId == x.Id)) item.Lesson!.CountdownItemId = null;
                    db.PlaylistItems.RemoveRange(items);
                    break;
                case "role":
                    if (input.Role is not ("lesson" or "preRoll" or "countdown"))
                        return Results.BadRequest(new { error = "Choose main lesson, pre-roll, or countdown." });
                    var role = NormalizeRole(input.Role);
                    if (role == "countdown" && items.Count != 1)
                        return Results.BadRequest(new { error = "A lesson can have only one countdown. Select exactly one item." });
                    foreach (var item in items) item.Role = role;
                    if (role == "countdown")
                    {
                        var item = items[0];
                        var otherCountdowns = await db.PlaylistItems.Where(x => x.LessonId == item.LessonId && x.Id != item.Id && x.Role == "countdown").ToListAsync(ct);
                        foreach (var other in otherCountdowns) other.Role = "lesson";
                        item.Lesson!.CountdownItemId = item.Id;
                    }
                    foreach (var lesson in items.Select(x => x.Lesson!).Distinct())
                    {
                        if (role != "countdown" && items.Any(x => x.LessonId == lesson.Id && lesson.CountdownItemId == x.Id)) lesson.CountdownItemId = null;
                        if (role == "preRoll") lesson.PreRollEnabled = true;
                    }
                    break;
                case "volume":
                    if (input.VolumePercent is not int volume || volume is < 0 or > 150)
                        return Results.BadRequest(new { error = "Volume must be from 0 to 150." });
                    foreach (var item in items) item.VolumePercent = volume;
                    break;
                case "end-behavior":
                    if (input.EndBehavior is not ("advance" or "loop" or "pause" or "menu" or "stop"))
                        return Results.BadRequest(new { error = "Choose a supported end behavior." });
                    foreach (var item in items) item.EndBehavior = input.EndBehavior;
                    break;
                case "allow-skip":
                    if (input.AllowSkip is not bool allowSkip) return Results.BadRequest(new { error = "Choose whether skipping is allowed." });
                    foreach (var item in items) item.AllowSkip = allowSkip;
                    break;
                case "prefix-title":
                    var prefix = input.TitlePrefix?.Trim();
                    if (string.IsNullOrWhiteSpace(prefix) || prefix.Length > 80)
                        return Results.BadRequest(new { error = "Enter a title prefix of 1 to 80 characters." });
                    foreach (var item in items)
                    {
                        item.Title = (prefix + " " + item.Title).Trim();
                        if (item.Title.Length > 160) item.Title = item.Title[..160].TrimEnd();
                    }
                    break;
                default:
                    return Results.BadRequest(new { error = "Unsupported bulk playlist action." });
            }
            var lessons = items.Select(x => x.Lesson!).Distinct().ToList();
            foreach (var lesson in lessons) lesson.Version++;
            Audit(db, $"playlist.bulk.{action}", lessons[0].Id, $"{items.Count} items across {lessons.Count} lessons");
            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, lessons.Max(x => x.Version), ct);
            return Results.Ok(new { updated = items.Count, lessons = lessons.Count, action });
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
                x.CompatibilityStatus,
                x.CompatibilityError,
                x.CompatibilityTranscodedAt,
                x.CompatibilitySizeBytes,
                transcodes = x.TranscodeVariants.OrderBy(v => v.Profile).Select(v => new
                {
                    v.Id, v.Profile, v.Status, v.SizeBytes, v.Width, v.Height, v.VideoBitrateKbps,
                    v.SourceVersion, v.Error, v.QueuedAt, v.StartedAt, v.CompletedAt
                }).ToArray(),
                x.SourceKind,
                x.SourceUrl,
                x.LinkKind,
                x.StoragePolicy,
                x.OriginLessonId,
                x.DeleteAfter,
                x.RetentionDateIsManual,
                x.Folder,
                x.TagsCsv,
                x.Version,
                x.ReplacedAt,
                x.ConversionStatus,
                x.ConversionError,
                x.ConvertedSlidesJson,
                x.ConvertedAt,
                thumbnailUrl = x.ThumbnailPath == null ? null : $"/api/v1/media/{x.Id}/thumbnail",
                filmstripUrl = x.FilmstripPath == null ? null : $"/api/v1/media/{x.Id}/filmstrip",
                waveformUrl = x.WaveformPath == null ? null : $"/api/v1/media/{x.Id}/waveform",
                downloadUrl = $"/api/v1/media/{x.Id}/file",
                playbackUrl = x.SourceKind == "link" ? x.SourceUrl : $"/api/v1/media/{x.Id}/playback"
            }).ToListAsync(ct));

        uploads.MapPost("/media/{id:guid}/transcodes/{profile}", async (Guid id, string profile,
            LessonCueDb db, HttpContext context, CancellationToken ct) =>
        {
            var media = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();
            if (media.SourceKind == "link" || media.ProcessingStatus != "ready" || media.VideoCodec is null)
                return Results.BadRequest(new { error = "Adaptive profiles require a processed local video." });
            var profiles = profile.Equals("all", StringComparison.OrdinalIgnoreCase)
                ? AdaptiveTranscodeProfiles.All.Keys.ToArray() : [profile];
            if (profiles.Any(value => !AdaptiveTranscodeProfiles.All.ContainsKey(value)))
                return Results.BadRequest(new { error = "Choose h264-720, h264-480, or all." });
            foreach (var value in profiles) await AdaptiveTranscodeService.QueueAsync(db, media, value, ct);
            db.AuditEvents.Add(new AuditEvent { Actor = context.User.Identity?.Name ?? "admin", Action = "media.transcode.queue",
                Object = media.Id.ToString(), Summary = string.Join(',', profiles) });
            await db.SaveChangesAsync(ct);
            return Results.Accepted(value: new { queued = profiles });
        });

        admin.MapGet("/media/{id:guid}/impact", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var media = await db.MediaAssets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();
            var lessonItems = await db.PlaylistItems.AsNoTracking().Where(x => x.MediaAssetId == id)
                .Select(x => new { x.Id, itemTitle = x.Title, x.LessonId, lessonTitle = x.Lesson!.Title, x.Lesson.Date })
                .OrderBy(x => x.Date).ToListAsync(ct);
            var signage = await db.SignagePlaylists.AsNoTracking().Where(x => x.MediaAssetId == id)
                .Select(x => new { x.Id, x.Name, x.Mode, x.Enabled }).OrderBy(x => x.Name).ToListAsync(ct);
            var templateItems = await db.LessonTemplateItems.AsNoTracking().Where(x => x.MediaAssetId == id)
                .Select(x => new { x.Id, itemTitle = x.Title, x.TemplateId, templateName = x.Template!.Name })
                .OrderBy(x => x.templateName).ToListAsync(ct);
            var versions = await db.MediaAssetVersions.AsNoTracking().Where(x => x.MediaAssetId == id)
                .OrderByDescending(x => x.VersionNumber).Select(x => new
                {
                    x.Id, x.VersionNumber, x.FileName, x.ContentType, x.SizeBytes, x.DurationMs, x.Sha256,
                    x.ArchivedAt, x.ArchivedBy,
                    downloadUrl = $"/api/v1/media/{id}/versions/{x.Id}/file"
                }).ToListAsync(ct);
            return Results.Ok(new
            {
                media.Id, media.FileName, media.Folder, media.TagsCsv, media.Version, media.ReplacedAt,
                lessons = lessonItems.GroupBy(x => new { x.LessonId, x.lessonTitle, x.Date })
                    .Select(group => new { id = group.Key.LessonId, title = group.Key.lessonTitle, date = group.Key.Date, itemCount = group.Count() }),
                templates = templateItems.GroupBy(x => new { x.TemplateId, x.templateName })
                    .Select(group => new { id = group.Key.TemplateId, name = group.Key.templateName, itemCount = group.Count() }),
                signage,
                versions
            });
        });

        uploads.MapPatch("/media/{id:guid}/organize", async (Guid id, MediaOrganizeInput input, LessonCueDb db,
            HttpContext context, CancellationToken ct) =>
        {
            var media = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var selection = MediaTaxonomy.Validate(organization, input.Folder ?? media.Folder, input.TagsCsv ?? media.TagsCsv);
            if (selection.Error is not null) return Results.BadRequest(new { error = selection.Error });
            if (input.FileName is not null)
            {
                var name = Path.GetFileName(input.FileName.Trim());
                if (string.IsNullOrWhiteSpace(name) || name.Length > 255)
                    return Results.BadRequest(new { error = "The media name must be between 1 and 255 characters." });
                media.FileName = name;
            }
            if (input.Folder is not null) media.Folder = selection.Folder;
            if (input.TagsCsv is not null) media.TagsCsv = selection.TagsCsv;
            db.AuditEvents.Add(new AuditEvent { Actor = context.User.Identity?.Name ?? "admin", Action = "media.organize",
                Object = media.Id.ToString(), Summary = $"{media.FileName}: {media.Folder}; {media.TagsCsv}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(media);
        });

        uploads.MapPost("/media/{id:guid}/reprocess", async (Guid id, LessonCueDb db, MediaStoragePaths paths,
            HttpContext context, CancellationToken ct) =>
        {
            var media = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();
            if (media.SourceKind == "link" || string.IsNullOrWhiteSpace(media.RelativePath))
                return Results.BadRequest(new { error = "Online-only media does not have a local file to reprocess." });
            if (media.ProcessingStatus is "processing" or "downloading")
                return Results.Conflict(new { error = "This media is already being processed." });
            var derivatives = ResetMediaProcessing(media);
            db.AuditEvents.Add(new AuditEvent { Actor = context.User.Identity?.Name ?? "admin", Action = "media.reprocess",
                Object = media.Id.ToString(), Summary = media.FileName });
            await db.SaveChangesAsync(ct);
            DeleteDerivatives(paths, derivatives);
            await DeleteAdaptiveTranscodesAsync(db, paths, media.Id, ct);
            return Results.Accepted($"/api/v1/media/{id}", media);
        });

        uploads.MapPost("/media/{id:guid}/convert", async (Guid id, LessonCueDb db, HttpContext context,
            CancellationToken ct) =>
        {
            var media = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();
            if (!PresentationConversion.IsConvertible(media.RelativePath) || media.SourceKind == "link" || string.IsNullOrWhiteSpace(media.RelativePath))
                return Results.BadRequest(new { error = "Local conversion supports PDF, PowerPoint (.pptx), OpenDocument Presentation (.odp), and Word (.docx) files." });
            if (media.ConversionStatus is "pending" or "converting")
                return Results.Conflict(new { error = "This presentation is already being converted." });
            media.ConversionStatus = "pending";
            media.ConversionError = null;
            db.AuditEvents.Add(new AuditEvent { Actor = context.User.Identity?.Name ?? "admin", Action = "presentation.convert.queue",
                Object = media.Id.ToString(), Summary = media.FileName });
            await db.SaveChangesAsync(ct);
            return Results.Accepted($"/api/v1/media/{id}/impact", new { media.Id, media.ConversionStatus });
        });

        uploads.MapPost("/media/{id:guid}/conversion/add-to-lesson", async (Guid id, PresentationLessonInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, HttpContext context, CancellationToken ct) =>
        {
            var source = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == id, ct);
            var lesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == input.LessonId && !x.Archived, ct);
            if (source is null || lesson is null) return Results.NotFound();
            try
            {
                var count = await PresentationConversion.AddToLessonAsync(db, source, lesson,
                    input.ImageDurationSeconds, context.User.Identity?.Name ?? "admin", ct);
                await InvalidateAsync(hub, lesson.Version, ct);
                return Results.Ok(new { added = count, lesson.Id, lesson.Version });
            }
            catch (InvalidOperationException ex) { return Results.Conflict(new { error = ex.Message }); }
        }).RequireAuthorization(LessonCuePermissions.Planning);

        admin.MapGet("/media/{id:guid}/versions/{versionId:guid}/file", async (Guid id, Guid versionId,
            LessonCueDb db, MediaStoragePaths paths, CancellationToken ct) =>
        {
            var version = await db.MediaAssetVersions.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == versionId && x.MediaAssetId == id, ct);
            if (version is null) return Results.NotFound();
            var path = ResolveStoredFile(paths.Versions, version.RelativePath);
            return path is null ? Results.NotFound() : Results.File(path, version.ContentType, version.FileName, enableRangeProcessing: true);
        });

        uploads.MapPost("/media/{id:guid}/replace", async (Guid id, HttpRequest request, LessonCueDb db,
            StorageService storage, MediaStoragePaths paths, IHubContext<SyncHub> hub, HttpContext context,
            CancellationToken ct) =>
        {
            var media = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();
            if (media.SourceKind == "link" || string.IsNullOrWhiteSpace(media.RelativePath))
                return Results.BadRequest(new { error = "Online-only media cannot be replaced with a local version." });
            if (media.ProcessingStatus is "processing" or "downloading")
                return Results.Conflict(new { error = "Wait for current processing to finish before replacing this media." });
            if (!request.HasFormContentType) return Results.BadRequest(new { error = "Choose a replacement media file." });
            var form = await request.ReadFormAsync(ct);
            var upload = form.Files.GetFile("file");
            if (upload is null || upload.Length == 0) return Results.BadRequest(new { error = "Choose a non-empty replacement file." });
            var extension = Path.GetExtension(upload.FileName);
            if (!IsSupportedMediaExtension(extension)) return Results.BadRequest(new { error = "Unsupported media type." });
            if (await storage.EnsureAvailableAsync(db, SaturatingAdd(upload.Length, media.SizeBytes), ct) is null)
                return StorageExceeded(upload.Length);
            var currentPath = ResolveStoredFile(paths.Originals, media.RelativePath);
            if (currentPath is null) return Results.Conflict(new { error = "The current local media file is missing. Re-upload it as a new library item." });

            var actor = context.User.Identity?.Name ?? "admin";
            var temporaryRoot = Path.Combine(dataPath, "media", "temporary");
            Directory.CreateDirectory(temporaryRoot);
            var temporary = Path.Combine(temporaryRoot, $"replace-{Guid.NewGuid():N}{extension.ToLowerInvariant()}");
            var newRelative = $"{media.Id:N}-v{media.Version + 1}-{Guid.NewGuid().ToString("N")[..8]}{extension.ToLowerInvariant()}";
            var newPath = Path.Combine(paths.Originals, newRelative);
            var archiveRelative = $"{media.Id:N}/v{media.Version:D4}-{Guid.NewGuid().ToString("N")[..8]}{Path.GetExtension(media.RelativePath).ToLowerInvariant()}";
            var archivePath = Path.Combine(paths.Versions, archiveRelative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(archivePath)!);
            try
            {
                await using (var output = File.Create(temporary)) await upload.CopyToAsync(output, ct);
                string sha;
                await using (var source = File.OpenRead(temporary))
                    sha = Convert.ToHexString(await SHA256.HashDataAsync(source, ct)).ToLowerInvariant();
                if (string.Equals(sha, media.Sha256, StringComparison.OrdinalIgnoreCase))
                    return Results.BadRequest(new { error = "This file is identical to the current version." });
                File.Copy(currentPath, archivePath, false);
                File.Move(temporary, newPath);
                var archived = CreateArchivedVersion(media, archiveRelative, actor);
                var derivatives = ResetMediaProcessing(media, clearConversion: true);
                media.FileName = Path.GetFileName(upload.FileName);
                media.ContentType = NormalizeContentType(upload.FileName, upload.ContentType);
                media.RelativePath = newRelative;
                media.Sha256 = sha;
                media.SizeBytes = upload.Length;
                media.SourceKind = "upload";
                media.SourceUrl = null;
                media.LinkKind = null;
                media.Version++;
                media.ReplacedAt = DateTimeOffset.UtcNow;
                db.MediaAssetVersions.Add(archived);
                await IncrementMediaLessonVersionsAsync(db, id, ct);
                db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "media.replace", Object = id.ToString(),
                    Summary = $"Version {archived.VersionNumber} archived; version {media.Version} is {media.FileName}." });
                try { await db.SaveChangesAsync(ct); }
                catch { TryDeleteFile(newPath); TryDeleteFile(archivePath); throw; }
                TryDeleteFile(currentPath);
                DeleteDerivatives(paths, derivatives);
                await DeleteAdaptiveTranscodesAsync(db, paths, media.Id, ct);
                await InvalidateAsync(hub, media.Version, ct);
                return Results.Ok(new { media.Id, media.FileName, media.Version, archivedVersionId = archived.Id });
            }
            catch
            {
                TryDeleteFile(newPath);
                TryDeleteFile(archivePath);
                throw;
            }
            finally { TryDeleteFile(temporary); }
        }).DisableAntiforgery();

        uploads.MapPost("/media/{id:guid}/versions/{versionId:guid}/restore", async (Guid id, Guid versionId,
            LessonCueDb db, StorageService storage, MediaStoragePaths paths, IHubContext<SyncHub> hub,
            HttpContext context, CancellationToken ct) =>
        {
            var media = await db.MediaAssets.SingleOrDefaultAsync(x => x.Id == id, ct);
            var selected = await db.MediaAssetVersions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == versionId && x.MediaAssetId == id, ct);
            if (media is null || selected is null) return Results.NotFound();
            var currentPath = ResolveStoredFile(paths.Originals, media.RelativePath);
            var selectedPath = ResolveStoredFile(paths.Versions, selected.RelativePath);
            if (currentPath is null || selectedPath is null) return Results.Conflict(new { error = "A required version file is missing from local storage." });
            if (await storage.EnsureAvailableAsync(db, SaturatingAdd(selected.SizeBytes, media.SizeBytes), ct) is null)
                return StorageExceeded(selected.SizeBytes);
            var actor = context.User.Identity?.Name ?? "admin";
            var extension = Path.GetExtension(selected.RelativePath);
            var newRelative = $"{media.Id:N}-v{media.Version + 1}-{Guid.NewGuid().ToString("N")[..8]}{extension}";
            var newPath = Path.Combine(paths.Originals, newRelative);
            var archiveRelative = $"{media.Id:N}/v{media.Version:D4}-{Guid.NewGuid().ToString("N")[..8]}{Path.GetExtension(media.RelativePath)}";
            var archivePath = Path.Combine(paths.Versions, archiveRelative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(archivePath)!);
            try
            {
                File.Copy(currentPath, archivePath, false);
                File.Copy(selectedPath, newPath, false);
                var archived = CreateArchivedVersion(media, archiveRelative, actor);
                var derivatives = ResetMediaProcessing(media, clearConversion: true);
                media.FileName = selected.FileName;
                media.ContentType = selected.ContentType;
                media.RelativePath = newRelative;
                media.Sha256 = selected.Sha256;
                media.SizeBytes = selected.SizeBytes;
                media.DurationMs = selected.DurationMs;
                media.SourceKind = selected.SourceKind;
                media.SourceUrl = selected.SourceUrl;
                media.LinkKind = selected.LinkKind;
                media.Version++;
                media.ReplacedAt = DateTimeOffset.UtcNow;
                db.MediaAssetVersions.Add(archived);
                await IncrementMediaLessonVersionsAsync(db, id, ct);
                db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "media.version.restore", Object = id.ToString(),
                    Summary = $"Archived version {selected.VersionNumber} restored as version {media.Version}." });
                try { await db.SaveChangesAsync(ct); }
                catch { TryDeleteFile(newPath); TryDeleteFile(archivePath); throw; }
                TryDeleteFile(currentPath);
                DeleteDerivatives(paths, derivatives);
                await DeleteAdaptiveTranscodesAsync(db, paths, media.Id, ct);
                await InvalidateAsync(hub, media.Version, ct);
                return Results.Ok(new { media.Id, media.FileName, media.Version, restoredFrom = selected.VersionNumber });
            }
            catch
            {
                TryDeleteFile(newPath);
                TryDeleteFile(archivePath);
                throw;
            }
        });

        uploads.MapPost("/media/bulk", async (MediaBulkInput input, LessonCueDb db, MediaStoragePaths paths,
            IHubContext<SyncHub> hub, HttpContext context, CancellationToken ct) =>
        {
            if (input.MediaIds is null || input.MediaIds.Count == 0)
                return Results.BadRequest(new { error = "Select at least one media item." });
            var ids = input.MediaIds.Distinct().ToList();
            if (ids.Count > 500) return Results.BadRequest(new { error = "Bulk actions are limited to 500 media items at a time." });
            var media = await db.MediaAssets.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
            if (media.Count != ids.Count) return Results.NotFound(new { error = "One or more selected media items no longer exist. Refresh the library and try again." });
            var actor = context.User.Identity?.Name ?? "admin";
            var action = input.Action?.Trim().ToLowerInvariant();

            switch (action)
            {
                case "keep":
                    foreach (var item in media)
                    {
                        MediaRetention.KeepPermanently(item);
                        db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "media.retention.keep", Object = item.Id.ToString(), Summary = item.FileName });
                    }
                    break;
                case "expire":
                    if (input.DeleteOn is not DateOnly deleteOn)
                        return Results.BadRequest(new { error = "Choose an expiration date." });
                    if (deleteOn < DateOnly.FromDateTime(DateTime.Today))
                        return Results.BadRequest(new { error = "The expiration date cannot be in the past." });
                    foreach (var item in media)
                    {
                        MediaRetention.ExpireOn(item, deleteOn);
                        db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "media.retention.expire", Object = item.Id.ToString(), Summary = $"{item.FileName} deletes {deleteOn:yyyy-MM-dd}" });
                    }
                    break;
                case "delete":
                    foreach (var item in media)
                    {
                        item.DeletedAt = DateTimeOffset.UtcNow; item.DeletedBy = actor;
                        db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "media.recycle", Object = item.Id.ToString(), Summary = item.FileName });
                    }
                    break;
                case "organize":
                    var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
                    var selection = MediaTaxonomy.Validate(organization, input.Folder, input.TagsCsv);
                    if (selection.Error is not null) return Results.BadRequest(new { error = selection.Error });
                    var folder = selection.Folder;
                    var tags = selection.TagsCsv;
                    foreach (var item in media)
                    {
                        item.Folder = folder;
                        item.TagsCsv = tags;
                        db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "media.organize", Object = item.Id.ToString(), Summary = $"{item.FileName}: {folder}; {tags}" });
                    }
                    break;
                case "prefix-name":
                    var prefix = input.FileNamePrefix?.Trim();
                    if (string.IsNullOrWhiteSpace(prefix))
                        return Results.BadRequest(new { error = "Enter a name prefix." });
                    if (prefix.Length > 80)
                        return Results.BadRequest(new { error = "Name prefixes are limited to 80 characters." });
                    foreach (var item in media)
                    {
                        var extension = item.SourceKind == "link" ? "" : Path.GetExtension(item.FileName);
                        var baseName = extension.Length == 0 ? item.FileName : Path.GetFileNameWithoutExtension(item.FileName);
                        var maximumBaseLength = Math.Max(1, 255 - extension.Length);
                        var prefixed = $"{prefix} {baseName}";
                        item.FileName = (prefixed.Length > maximumBaseLength ? prefixed[..maximumBaseLength].TrimEnd() : prefixed) + extension;
                        db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = "media.rename", Object = item.Id.ToString(), Summary = item.FileName });
                    }
                    break;
                default:
                    return Results.BadRequest(new { error = "Choose delete, expire, keep permanently, organize, or add a name prefix." });
            }

            await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, 0, ct);
            return Results.Ok(new { updated = media.Count, action });
        });

        uploads.MapPost("/media", async (HttpRequest request, LessonCueDb db, StorageService storage, CancellationToken ct) =>
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
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var selection = MediaTaxonomy.Validate(organization, form["folder"], form["tagsCsv"]);
            if (selection.Error is not null) return Results.BadRequest(new { error = selection.Error });
            var extension = Path.GetExtension(upload.FileName);
            if (!IsSupportedMediaExtension(extension)) return Results.BadRequest(new { error = "Unsupported media type." });
            if (await storage.EnsureAvailableAsync(db, upload.Length, ct) is null)
                return StorageExceeded(upload.Length);

            var id = Guid.NewGuid();
            var storedName = id + extension.ToLowerInvariant();
            var destination = Path.Combine(mediaPath, storedName);
            await using (var output = File.Create(destination)) await upload.CopyToAsync(output, ct);
            string sha;
            await using (var stream = File.OpenRead(destination))
                sha = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
            var existing = await db.MediaAssets.FirstOrDefaultAsync(x => x.Sha256 == sha, ct);
            if (existing is not null)
            {
                File.Delete(destination);
                if (persistent) MediaRetention.KeepPermanently(existing);
                else if (existing.StoragePolicy == MediaRetention.LessonScoped) MediaRetention.KeepForLesson(existing, retentionLesson!);
                if (!string.IsNullOrWhiteSpace(form["folder"])) existing.Folder = selection.Folder;
                if (!string.IsNullOrWhiteSpace(form["tagsCsv"])) existing.TagsCsv = selection.TagsCsv;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { duplicate = true, media = existing });
            }
            long? duration = long.TryParse(form["durationMs"], NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
            var media = new MediaAsset
            {
                Id = id,
                FileName = Path.GetFileName(upload.FileName),
                ContentType = NormalizeContentType(upload.FileName, upload.ContentType),
                RelativePath = storedName,
                Sha256 = sha,
                SizeBytes = upload.Length,
                DurationMs = duration,
                Folder = selection.Folder,
                TagsCsv = selection.TagsCsv
            };
            if (persistent) MediaRetention.KeepPermanently(media);
            else MediaRetention.SetNewUploadPolicy(media, retentionLesson!);
            db.MediaAssets.Add(media);
            Audit(db, "media.upload", media.Id, media.FileName);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/media/{media.Id}", media);
        }).DisableAntiforgery();

        uploads.MapPost("/media/link", async (LinkInput input, LessonCueDb db, CancellationToken ct) =>
        {
            if (!Uri.TryCreate(input.Url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
                return Results.BadRequest(new { error = "Enter a complete http or https URL." });
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var selection = MediaTaxonomy.Validate(organization, input.Folder, input.TagsCsv);
            if (selection.Error is not null) return Results.BadRequest(new { error = selection.Error });
            Lesson? retentionLesson = null;
            if (input.Download)
            {
                if (!YouTubeMedia.IsYouTubeUrl(uri))
                    return Results.BadRequest(new { error = "Local download is available only for YouTube URLs." });
                if (!input.Persistent)
                {
                    if (input.LessonId is not Guid lessonId)
                        return Results.BadRequest(new { error = "Choose the lesson this download belongs to, or choose Keep permanently." });
                    retentionLesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId, ct);
                    if (retentionLesson is null) return Results.BadRequest(new { error = "The selected lesson does not exist." });
                }
                var pendingTitle = string.IsNullOrWhiteSpace(input.Title) ? "YouTube video" : input.Title.Trim();
                var pending = new MediaAsset { FileName = pendingTitle, ContentType = "video/mp4", RelativePath = "",
                    SizeBytes = 0, OfflineEligible = false, ProcessingStatus = "downloading", SourceKind = "youtube-download",
                    SourceUrl = uri.ToString(), LinkKind = "youtube-local", Folder = selection.Folder,
                    TagsCsv = selection.TagsCsv };
                if (input.Persistent) MediaRetention.KeepPermanently(pending);
                else MediaRetention.SetNewUploadPolicy(pending, retentionLesson!);
                db.MediaAssets.Add(pending); Audit(db, "media.youtube.queue", pending.Id, uri.Host); await db.SaveChangesAsync(ct);
                return Results.Accepted($"/api/v1/media/{pending.Id}", pending);
            }
            var extension = Path.GetExtension(uri.AbsolutePath).ToLowerInvariant();
            var direct = extension is ".mp4" or ".m4v" or ".mov" or ".mp3" or ".m4a" or ".aac" or ".wav" or ".jpg" or ".jpeg" or ".png" or ".webp";
            var youtube = YouTubeMedia.IsYouTubeUrl(uri);
            var embedded = youtube || uri.Host.Equals("vimeo.com", StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith(".vimeo.com", StringComparison.OrdinalIgnoreCase);
            var kind = direct ? "direct" : youtube ? "youtube" : embedded ? "embedded" : "webpage";
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
                SizeBytes = 0, OfflineEligible = direct, ProcessingStatus = "ready", SourceKind = "link", SourceUrl = uri.ToString(), LinkKind = kind,
                Folder = selection.Folder, TagsCsv = selection.TagsCsv };
            db.MediaAssets.Add(media); Audit(db, "media.link", media.Id, $"{kind}: {uri.Host}"); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/media/{media.Id}", media);
        });

        uploads.MapPost("/uploads", async (string? fileName, long? totalBytes, LessonCueDb db, StorageService storage,
            CancellationToken ct) =>
        {
            if (totalBytes is null or <= 0) return Results.BadRequest(new { error = "The total upload size is required." });
            if (await storage.EnsureAvailableAsync(db, totalBytes.Value, ct) is null) return StorageExceeded(totalBytes.Value);
            return Results.Ok(new { uploadId = Guid.NewGuid(), fileName = Path.GetFileName(fileName ?? "upload.bin"), chunkSize = 8 * 1024 * 1024 });
        });

        uploads.MapPut("/uploads/{uploadId:guid}/chunks/{index:int}", async (Guid uploadId, int index, HttpRequest request,
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

        uploads.MapPost("/uploads/{uploadId:guid}/complete", async (Guid uploadId, UploadCompleteInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var extension = Path.GetExtension(input.FileName); if (!IsSupportedMediaExtension(extension)) return Results.BadRequest(new { error = "Unsupported media type." });
            if (input.TotalChunks is < 1 or > 100000) return Results.BadRequest(new { error = "Invalid chunk count." });
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var selection = MediaTaxonomy.Validate(organization, input.Folder, input.TagsCsv);
            if (selection.Error is not null) return Results.BadRequest(new { error = selection.Error });
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
            string sha;
            await using (var stream = File.OpenRead(destination))
                sha = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
            var existing = await db.MediaAssets.FirstOrDefaultAsync(x => x.Sha256 == sha, ct);
            if (existing is not null)
            {
                File.Delete(destination);
                if (input.Persistent) MediaRetention.KeepPermanently(existing);
                else if (existing.StoragePolicy == MediaRetention.LessonScoped) MediaRetention.KeepForLesson(existing, retentionLesson!);
                if (!string.IsNullOrWhiteSpace(input.Folder)) existing.Folder = selection.Folder;
                if (!string.IsNullOrWhiteSpace(input.TagsCsv)) existing.TagsCsv = selection.TagsCsv;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { duplicate = true, media = existing });
            }
            var media = new MediaAsset { Id = mediaId, FileName = Path.GetFileName(input.FileName), ContentType = NormalizeContentType(input.FileName, input.ContentType),
                RelativePath = storedName, Sha256 = sha, SizeBytes = new FileInfo(destination).Length, DurationMs = input.DurationMs,
                Folder = selection.Folder, TagsCsv = selection.TagsCsv };
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
                x.LastIpAddress,
                x.ControlVersion,
                x.ControlAction,
                x.ControlLessonId,
                x.ControlItemId,
                x.ControlPositionMs,
                x.ControlIssuedAt,
                x.AcknowledgedControlVersion,
                x.PlaybackState,
                x.PlaybackLessonId,
                x.PlaybackItemId,
                x.PlaybackPositionMs,
                x.PlaybackDurationMs,
                x.PlaybackVolumePercent,
                x.PlaybackUpdatedAt,
                x.PlaybackError,
                x.CachedItems,
                x.TotalItems,
                x.DeviceModel,
                x.OsVersion,
                x.CacheInventoryJson,
                x.DownloadQueueJson,
                x.CodecCapabilitiesJson,
                x.RecentErrorsJson,
                x.ClockOffsetMs,
                x.NetworkLatencyMs,
                x.NetworkQuality,
                x.DiagnosticsUpdatedAt,
                x.AllowDiagnosticScreenshots,
                x.ScreenshotRequestId,
                x.ScreenshotRequestedAt,
                x.ScreenshotExpiresAt,
                x.ScreenshotStatus,
                x.ScreenshotCapturedAt,
                screenshotAvailable = x.ScreenshotStatus == "ready" && x.ScreenshotCapturedAt != null &&
                    x.ScreenshotCapturedAt >= DateTimeOffset.UtcNow.AddHours(-24)
            }).ToListAsync(ct);
        });

        screens.MapPost("/screens/{id:guid}/diagnostics/screenshot-request", async (Guid id, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var screen = await db.Screens.SingleOrDefaultAsync(x => x.Id == id && !x.Revoked, ct);
            if (screen is null) return Results.NotFound();
            if (!screen.AllowDiagnosticScreenshots)
                return Results.Conflict(new { error = "Diagnostic screenshots are disabled for this screen. Enable the privacy control first." });
            if (screen.LastSeenAt is null || screen.LastSeenAt < DateTimeOffset.UtcNow.AddMinutes(-2))
                return Results.Conflict(new { error = "This screen is offline. Bring it online before requesting a screenshot." });
            screen.ScreenshotRequestId = Guid.NewGuid();
            screen.ScreenshotRequestedAt = DateTimeOffset.UtcNow;
            screen.ScreenshotExpiresAt = screen.ScreenshotRequestedAt.Value.AddMinutes(1);
            screen.ScreenshotStatus = "pending";
            Audit(db, "screen.screenshot.request", screen.Id, "One-time request; expires in 60 seconds");
            await db.SaveChangesAsync(ct);
            await hub.Clients.Group($"screen:{id}").SendAsync("DiagnosticScreenshotRequested",
                new { screen.ScreenshotRequestId, screen.ScreenshotExpiresAt }, ct);
            return Results.Accepted(value: new { requestId = screen.ScreenshotRequestId, expiresAt = screen.ScreenshotExpiresAt });
        });

        screens.MapGet("/screens/{id:guid}/diagnostics/screenshot", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var screen = await db.Screens.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && !x.Revoked, ct);
            if (screen?.ScreenshotStatus != "ready" || screen.ScreenshotCapturedAt is null ||
                screen.ScreenshotCapturedAt < DateTimeOffset.UtcNow.AddHours(-24) || string.IsNullOrWhiteSpace(screen.ScreenshotRelativePath))
                return Results.NotFound();
            var root = Path.GetFullPath(dataPath) + Path.DirectorySeparatorChar;
            var path = Path.GetFullPath(Path.Combine(dataPath, screen.ScreenshotRelativePath));
            if (!path.StartsWith(root, StringComparison.Ordinal) || !File.Exists(path)) return Results.NotFound();
            var contentType = Path.GetExtension(path).Equals(".png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "image/jpeg";
            return Results.File(path, contentType, enableRangeProcessing: false);
        });

        screens.MapDelete("/screens/{id:guid}/diagnostics/screenshot", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var screen = await db.Screens.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (screen is null) return Results.NotFound();
            DeleteDiagnosticScreenshot(dataPath, screen.ScreenshotRelativePath);
            ClearDiagnosticScreenshot(screen);
            Audit(db, "screen.screenshot.delete", screen.Id, "Diagnostic screenshot deleted");
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        playback.MapPost("/screens/{id:guid}/control", async (Guid id, ScreenControlInput input, HttpContext context, LessonCueDb db,
            IHubContext<SyncHub> hub, ControllerSessionService controllerSessions, CancellationToken ct) =>
        {
            var action = input.Action.Trim().ToLowerInvariant();
            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "play", "pause", "resume", "stop", "next", "previous", "seek" };
            if (!allowed.Contains(action)) return Results.BadRequest(new { error = "Unsupported playback command." });
            var screen = await db.Screens.SingleOrDefaultAsync(x => x.Id == id && !x.Revoked, ct);
            if (screen is null) return Results.NotFound();
            var controllerContext = context.Request.Headers["X-LessonCue-Controller"].ToString();
            if (controllerContext.StartsWith("room:", StringComparison.OrdinalIgnoreCase) ||
                controllerContext.StartsWith("session:", StringComparison.OrdinalIgnoreCase))
            {
                var requireLocal = await db.Organizations.AsNoTracking()
                    .Select(x => x.RequireLocalRoomControllers).FirstAsync(ct);
                if (!ControllerAccessPolicy.CanUseRoomController(requireLocal, context.User, context.Request.Host.Host,
                    context.Connection.RemoteIpAddress))
                    return Results.Json(new
                    {
                        error = "This room controller is restricted to the campus network. Open it from the server's .local address."
                    }, statusCode: StatusCodes.Status403Forbidden);
            }
            if (controllerContext.Equals("universal", StringComparison.OrdinalIgnoreCase))
            {
                var grant = context.Request.Headers["X-LessonCue-Controller-Grant"].ToString();
                if (!controllerSessions.IsUniversalGrantValid(grant))
                    return Results.Json(new { error = "Enter the current universal controller PIN." }, statusCode: StatusCodes.Status403Forbidden);
            }
            if (controllerContext.StartsWith("room:", StringComparison.OrdinalIgnoreCase))
            {
                if (!Guid.TryParse(controllerContext[5..], out var roomId) || screen.AssignedClassId != roomId)
                    return Results.Forbid();
                if (input.LessonId is Guid scopedLessonId && !await db.Lessons.AnyAsync(x => x.Id == scopedLessonId && x.ClassId == roomId, ct))
                    return Results.Forbid();
            }
            if (controllerContext.StartsWith("session:", StringComparison.OrdinalIgnoreCase))
            {
                var session = controllerSessions.Get(controllerContext[8..]);
                if (session is null || screen.AssignedClassId != session.ClassId ||
                    session.LessonId is Guid restrictedCurrentLessonId && action != "play" && screen.PlaybackLessonId != restrictedCurrentLessonId ||
                    input.LessonId is Guid sessionLessonId &&
                    (session.LessonId is Guid restrictedLessonId && sessionLessonId != restrictedLessonId ||
                     !await db.Lessons.AnyAsync(x => x.Id == sessionLessonId && x.ClassId == session.ClassId, ct)))
                    return Results.Forbid();
            }
            if (action == "play")
            {
                if (input.LessonId is not Guid lessonId)
                    return Results.BadRequest(new { error = "Choose a lesson to play." });
                var lesson = await db.Lessons.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == lessonId && !x.Archived, ct);
                if (lesson is null) return Results.BadRequest(new { error = "The selected lesson is unavailable." });
                if (input.ItemId is Guid itemId && lesson.Items.All(x => x.Id != itemId))
                    return Results.BadRequest(new { error = "The selected item is not in that lesson." });
            }
            screen.ControlVersion = screen.ControlVersion == int.MaxValue ? 1 : screen.ControlVersion + 1;
            screen.ControlAction = action;
            screen.ControlLessonId = input.LessonId;
            screen.ControlItemId = input.ItemId;
            screen.ControlPositionMs = input.PositionMs is null ? null : Math.Max(0, input.PositionMs.Value);
            screen.ControlIssuedAt = DateTimeOffset.UtcNow;
            db.PlaybackCommands.Add(new PlaybackCommandRecord
            {
                ScreenId = screen.Id,
                Version = screen.ControlVersion,
                Action = action,
                LessonId = input.LessonId,
                ItemId = input.ItemId,
                PositionMs = screen.ControlPositionMs,
                IssuedAt = screen.ControlIssuedAt.Value
            });
            var oldestRetainedVersion = Math.Max(0, screen.ControlVersion - 1000);
            var staleCommands = await db.PlaybackCommands.Where(x => x.ScreenId == id && x.Version < oldestRetainedVersion).ToListAsync(ct);
            db.PlaybackCommands.RemoveRange(staleCommands);
            Audit(db, "screen.control", screen.Id, $"{action}:{screen.ControlVersion}");
            await db.SaveChangesAsync(ct);
            await hub.Clients.Group($"screen:{id}").SendAsync("PlaybackCommand", new { screen.ControlVersion }, ct);
            return Results.Accepted(value: new { version = screen.ControlVersion, action, lessonId = input.LessonId,
                itemId = input.ItemId, positionMs = screen.ControlPositionMs, issuedAt = screen.ControlIssuedAt, state = screen.PlaybackState });
        });

        screens.MapPatch("/screens/{id:guid}", async (Guid id, ScreenUpdateInput input, LessonCueDb db,
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
            if (input.AllowDiagnosticScreenshots is bool allowScreenshots)
            {
                screen.AllowDiagnosticScreenshots = allowScreenshots;
                if (!allowScreenshots)
                {
                    DeleteDiagnosticScreenshot(dataPath, screen.ScreenshotRelativePath);
                    ClearDiagnosticScreenshot(screen);
                }
            }
            Audit(db, "screen.update", screen.Id, screen.Name);
            await db.SaveChangesAsync(ct);
            await hub.Clients.Group($"screen:{id}").SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED" }, ct);
            return Results.Ok(screen);
        });

        screens.MapDelete("/screens/{id:guid}", async (Guid id, LessonCueDb db, CancellationToken ct) =>
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

        settings.MapGet("/audit", async (LessonCueDb db, CancellationToken ct) =>
            (await db.AuditEvents.AsNoTracking().OrderByDescending(x => x.Id).Take(250).ToListAsync(ct)).OrderByDescending(x => x.Timestamp));

        MapOperations(admin, dataPath);
    }

    private static void MapOperations(RouteGroupBuilder admin, string dataPath)
    {
        var planning = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Planning);
        var playback = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Playback);
        var userAdmin = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Users);
        var settings = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Settings);
        var backupsAdmin = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Backups);
        var updatesAdmin = admin.MapGroup("").RequireAuthorization(LessonCuePermissions.Updates);

        settings.MapGet("/organization", async (LessonCueDb db, CancellationToken ct) =>
            await db.Organizations.AsNoTracking().FirstAsync(ct));

        settings.MapGet("/registration/settings", async (LessonCueDb db, AccountEmailService email,
            CancellationToken ct) =>
        {
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            return Results.Ok(new
            {
                mode = organization.RegistrationMode,
                organization.PublicBaseUrl,
                organization.EmailProvider,
                organization.EmailFromAddress,
                organization.EmailFromName,
                emailConfigured = email.Status(organization.EmailProvider).Configured
            });
        });

        settings.MapPut("/registration/settings", async (RegistrationSettingsInput input, LessonCueDb db,
            AccountEmailService email, CancellationToken ct) =>
        {
            var mode = input.Mode.Trim().ToLowerInvariant();
            var provider = input.EmailProvider.Trim().ToLowerInvariant();
            if (mode is not ("closed" or "open" or "code"))
                return Results.BadRequest(new { error = "Registration mode must be closed, open, or code." });
            if (provider is not ("none" or "resend" or "brevo"))
                return Results.BadRequest(new { error = "Email provider must be none, Resend, or Brevo." });
            if (mode != "closed" && provider == "none")
                return Results.BadRequest(new { error = "Open or code registration requires Resend or Brevo email delivery." });
            if (provider != "none" && (!IsEmail(input.EmailFromAddress) ||
                string.IsNullOrWhiteSpace(input.EmailFromName) || input.EmailFromName.Trim().Length > 120))
                return Results.BadRequest(new { error = "A valid sender address and name are required." });
            if (input.PublicBaseUrl.Trim().Length > 253 || input.ApiKey?.Length > 2048)
                return Results.BadRequest(new { error = "The public address or provider key is too long." });
            if (!string.IsNullOrWhiteSpace(input.PublicBaseUrl) &&
                (!Uri.TryCreate(input.PublicBaseUrl.Trim(), UriKind.Absolute, out var publicUrl) ||
                 publicUrl.Scheme != Uri.UriSchemeHttps && !publicUrl.IsLoopback))
                return Results.BadRequest(new { error = "Public account URL must use HTTPS, except for a loopback development address." });
            try { await email.ConfigureAsync(provider, input.ApiKey, ct); }
            catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
            if (mode != "closed" && !email.Status(provider).Configured)
                return Results.BadRequest(new { error = "Configure the email provider API key before enabling registration." });
            var organization = await db.Organizations.FirstAsync(ct);
            organization.RegistrationMode = mode;
            organization.PublicBaseUrl = input.PublicBaseUrl.Trim().TrimEnd('/');
            organization.EmailProvider = provider;
            organization.EmailFromAddress = input.EmailFromAddress.Trim().ToLowerInvariant();
            organization.EmailFromName = input.EmailFromName.Trim();
            Audit(db, "registration.settings.update", organization.Id, $"{mode}:{provider}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { emailConfigured = email.Status(provider).Configured });
        });

        settings.MapGet("/registration/codes", async (LessonCueDb db, CancellationToken ct) =>
        {
            var now = DateTimeOffset.UtcNow;
            var codes = await db.RegistrationCodes.AsNoTracking().ToListAsync(ct);
            return Results.Ok(codes.OrderByDescending(x => x.CreatedAt).Select(x => new
            {
                x.Id, x.Label, x.Hint, x.CreatedAt, x.ExpiresAt, x.RevokedAt, x.Uses, x.MaxUses,
                active = x.RevokedAt == null && (x.ExpiresAt == null || x.ExpiresAt > now) &&
                    (x.MaxUses == null || x.Uses < x.MaxUses)
            }));
        });

        settings.MapPost("/registration/codes", async (RegistrationCodeInput input, LessonCueDb db,
            CancellationToken ct) =>
        {
            if (input.Label.Trim().Length > 120) return Results.BadRequest(new { error = "Label cannot exceed 120 characters." });
            if (input.ExpiresAt <= DateTimeOffset.UtcNow) return Results.BadRequest(new { error = "Expiration must be in the future." });
            if (input.MaxUses is <= 0 or > 100000) return Results.BadRequest(new { error = "Maximum uses must be between 1 and 100,000." });
            var raw = AccountEmailService.NewRegistrationCode();
            var code = new RegistrationCode
            {
                CodeHash = AccountEmailService.Hash(raw), Hint = raw[^4..],
                Label = string.IsNullOrWhiteSpace(input.Label) ? "Registration code" : input.Label.Trim(),
                ExpiresAt = input.ExpiresAt, MaxUses = input.MaxUses
            };
            db.RegistrationCodes.Add(code);
            Audit(db, "registration.code.create", code.Id, code.Label);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/registration/codes/{code.Id}", new { code.Id, code = raw, code.Hint });
        });

        settings.MapPut("/registration/codes/{id:guid}", async (Guid id, RegistrationCodeInput input,
            LessonCueDb db, CancellationToken ct) =>
        {
            var code = await db.RegistrationCodes.FindAsync([id], ct);
            if (code is null) return Results.NotFound();
            if (input.Label.Trim().Length > 120) return Results.BadRequest(new { error = "Label cannot exceed 120 characters." });
            if (input.ExpiresAt <= DateTimeOffset.UtcNow) return Results.BadRequest(new { error = "Expiration must be in the future." });
            if (input.MaxUses is <= 0 or > 100000) return Results.BadRequest(new { error = "Maximum uses must be between 1 and 100,000." });
            code.Label = string.IsNullOrWhiteSpace(input.Label) ? code.Label : input.Label.Trim();
            code.ExpiresAt = input.ExpiresAt;
            code.MaxUses = input.MaxUses;
            Audit(db, "registration.code.update", code.Id, code.Label);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        settings.MapPost("/registration/codes/{id:guid}/rotate", async (Guid id, LessonCueDb db,
            CancellationToken ct) =>
        {
            var existing = await db.RegistrationCodes.FindAsync([id], ct);
            if (existing is null) return Results.NotFound();
            existing.RevokedAt = DateTimeOffset.UtcNow;
            var raw = AccountEmailService.NewRegistrationCode();
            var replacement = new RegistrationCode
            {
                CodeHash = AccountEmailService.Hash(raw), Hint = raw[^4..], Label = existing.Label,
                ExpiresAt = existing.ExpiresAt, MaxUses = existing.MaxUses
            };
            db.RegistrationCodes.Add(replacement);
            Audit(db, "registration.code.rotate", existing.Id, replacement.Id.ToString());
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { replacement.Id, code = raw, replacement.Hint });
        });

        settings.MapDelete("/registration/codes/{id:guid}", async (Guid id, LessonCueDb db,
            CancellationToken ct) =>
        {
            var code = await db.RegistrationCodes.FindAsync([id], ct);
            if (code is null) return Results.NotFound();
            code.RevokedAt = DateTimeOffset.UtcNow;
            Audit(db, "registration.code.revoke", code.Id, code.Label);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        settings.MapPut("/organization", async (OrganizationInput input, LessonCueDb db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.TimeZone))
                return Results.BadRequest(new { error = "Organization name and time zone are required." });
            try { _ = TimeZoneInfo.FindSystemTimeZoneById(input.TimeZone); }
            catch { return Results.BadRequest(new { error = "The server does not recognize that IANA time zone." }); }
            if (!IsColor(input.PrimaryColor) || !IsColor(input.AccentColor) ||
                input.NavigationTextColor is not null && !IsColor(input.NavigationTextColor) ||
                input.SelectedTabColor is not null && !IsColor(input.SelectedTabColor))
                return Results.BadRequest(new { error = "Brand colors must use six-digit hex notation." });
            var organization = await db.Organizations.FirstAsync(ct);
            organization.Name = input.Name.Trim(); organization.SiteName = input.SiteName.Trim();
            organization.TimeZone = input.TimeZone.Trim(); organization.WeekStartsOn = input.WeekStartsOn == "Monday" ? "Monday" : "Sunday";
            organization.DefaultLessonDurationMinutes = Math.Clamp(input.DefaultLessonDurationMinutes, 5, 480);
            organization.DefaultRetentionDays = Math.Clamp(input.DefaultRetentionDays, 1, 3650);
            organization.PrimaryColor = input.PrimaryColor; organization.AccentColor = input.AccentColor;
            if (input.NavigationTextColor is not null) organization.NavigationTextColor = input.NavigationTextColor;
            if (input.SelectedTabColor is not null) organization.SelectedTabColor = input.SelectedTabColor;
            organization.WelcomeMessage = input.WelcomeMessage.Trim();
            if (input.AdaptiveTranscodingEnabled is not null) organization.AdaptiveTranscodingEnabled = input.AdaptiveTranscodingEnabled.Value;
            if (input.TranscodeLeadDays is not null) organization.TranscodeLeadDays = Math.Clamp(input.TranscodeLeadDays.Value, 1, 30);
            if (input.HardwareAccelerationEnabled is not null) organization.HardwareAccelerationEnabled = input.HardwareAccelerationEnabled.Value;
            if (input.RequireLocalRoomControllers is not null) organization.RequireLocalRoomControllers = input.RequireLocalRoomControllers.Value;
            Audit(db, "organization.update", organization.Id, organization.Name); await db.SaveChangesAsync(ct);
            return Results.Ok(organization);
        });

        settings.MapPost("/hardware-acceleration/check", async (HardwareAccelerationService hardware,
            CancellationToken ct) => Results.Ok(await hardware.RefreshAsync(ct)));

        settings.MapPut("/media-taxonomy", async (MediaTaxonomyInput input, LessonCueDb db,
            HttpContext context, CancellationToken ct) =>
        {
            if (!MediaTaxonomy.TryCreate(input.Folders, input.Tags, out var taxonomy, out var error))
                return Results.BadRequest(new { error });

            var media = await db.MediaAssets.IgnoreQueryFilters().AsNoTracking()
                .Select(item => new { item.Folder, item.TagsCsv }).ToListAsync(ct);
            var missingFolders = media.Select(item => MediaTaxonomy.NormalizeFolder(item.Folder))
                .Where(folder => folder.Length > 0 && !taxonomy.Folders.Contains(folder, StringComparer.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(folder => folder).ToArray();
            var missingTags = media.SelectMany(item => MediaTaxonomy.SplitTags(item.TagsCsv))
                .Where(tag => !taxonomy.Tags.Contains(tag, StringComparer.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(tag => tag).ToArray();
            if (missingFolders.Length > 0 || missingTags.Length > 0)
            {
                var details = string.Join("; ", new[]
                {
                    missingFolders.Length > 0 ? $"folders in use: {string.Join(", ", missingFolders)}" : null,
                    missingTags.Length > 0 ? $"tags in use: {string.Join(", ", missingTags)}" : null
                }.Where(value => value is not null));
                return Results.Conflict(new { error = $"Reassign existing media before removing approved {details}." });
            }

            var organization = await db.Organizations.FirstAsync(ct);
            MediaTaxonomy.Store(organization, taxonomy);
            db.AuditEvents.Add(new AuditEvent
            {
                Actor = context.User.Identity?.Name ?? "admin", Action = "media.taxonomy.update",
                Object = organization.Id.ToString(), Summary = $"{taxonomy.Folders.Count} folders; {taxonomy.Tags.Count} tags"
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(taxonomy);
        });

        settings.MapPut("/controller-pin", async (ControllerPinInput input, LessonCueDb db,
            IPasswordHasher<Organization> hasher, ControllerSessionService controllerSessions, CancellationToken ct) =>
        {
            if (input.Pin.Length != 6 || input.Pin.Any(character => !char.IsAsciiDigit(character)))
                return Results.BadRequest(new { error = "Universal controller PIN must be exactly six digits." });
            var organization = await db.Organizations.SingleAsync(ct);
            organization.ControllerPinHash = hasher.HashPassword(organization, input.Pin);
            controllerSessions.RevokeUniversalGrants();
            Audit(db, "controller.pin.update", organization.Id, "Universal controller PIN changed");
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        settings.MapGet("/recycle-bin", async (LessonCueDb db, CancellationToken ct) =>
        {
            var classes = await db.Classes.IgnoreQueryFilters().AsNoTracking().Where(x => x.DeletedAt != null)
                .Select(x => new { kind = "class", x.Id, title = x.Name, detail = x.Description, x.DeletedAt, x.DeletedBy }).ToListAsync(ct);
            var classNames = await db.Classes.IgnoreQueryFilters().AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, ct);
            var lessons = await db.Lessons.IgnoreQueryFilters().AsNoTracking().Where(x => x.DeletedAt != null)
                .Select(x => new { x.Id, x.Title, x.ClassId, x.Date, x.DeletedAt, x.DeletedBy }).ToListAsync(ct);
            var media = await db.MediaAssets.IgnoreQueryFilters().AsNoTracking().Where(x => x.DeletedAt != null)
                .Select(x => new { x.Id, x.FileName, x.SizeBytes, x.DeletedAt, x.DeletedBy }).ToListAsync(ct);
            var results = classes.Select(x => new RecycleBinItem(x.kind, x.Id, x.title, x.detail, x.DeletedAt!.Value, x.DeletedBy))
                .Concat(lessons.Select(x => new RecycleBinItem("lesson", x.Id, x.Title,
                    $"{classNames.GetValueOrDefault(x.ClassId, "Deleted class")} · {x.Date:yyyy-MM-dd}", x.DeletedAt!.Value, x.DeletedBy)))
                .Concat(media.Select(x => new RecycleBinItem("media", x.Id, x.FileName, $"{x.SizeBytes} bytes", x.DeletedAt!.Value, x.DeletedBy)))
                .OrderByDescending(x => x.DeletedAt);
            return Results.Ok(results);
        });

        settings.MapPost("/recycle-bin/{kind}/{id:guid}/restore", async (string kind, Guid id, LessonCueDb db,
            HttpContext context, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var actor = context.User.Identity?.Name ?? "admin";
            switch (kind.ToLowerInvariant())
            {
                case "class":
                    var lessonClass = await db.Classes.IgnoreQueryFilters().SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt != null, ct);
                    if (lessonClass is null) return Results.NotFound();
                    var deletedAt = lessonClass.DeletedAt;
                    lessonClass.DeletedAt = null; lessonClass.DeletedBy = null;
                    var childLessons = await db.Lessons.IgnoreQueryFilters().Where(x => x.ClassId == id && x.DeletedAt == deletedAt).ToListAsync(ct);
                    foreach (var lesson in childLessons) { lesson.DeletedAt = null; lesson.DeletedBy = null; }
                    break;
                case "lesson":
                    var deletedLesson = await db.Lessons.IgnoreQueryFilters().SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt != null, ct);
                    if (deletedLesson is null) return Results.NotFound();
                    if (!await db.Classes.AnyAsync(x => x.Id == deletedLesson.ClassId, ct))
                        return Results.Conflict(new { error = "Restore the lesson's class first." });
                    deletedLesson.DeletedAt = null; deletedLesson.DeletedBy = null;
                    break;
                case "media":
                    var deletedMedia = await db.MediaAssets.IgnoreQueryFilters().SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt != null, ct);
                    if (deletedMedia is null) return Results.NotFound();
                    deletedMedia.DeletedAt = null; deletedMedia.DeletedBy = null;
                    break;
                default: return Results.BadRequest(new { error = "Unknown recycling-bin item type." });
            }
            db.AuditEvents.Add(new AuditEvent { Actor = actor, Action = $"recycle.{kind}.restore", Object = id.ToString() });
            await db.SaveChangesAsync(ct); await InvalidateAsync(hub, 0, ct);
            return Results.NoContent();
        });

        settings.MapDelete("/recycle-bin", async (LessonCueDb db, MediaStoragePaths paths, HttpContext context,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var purged = await RecycleBinService.PurgeAsync(db, paths, DateTimeOffset.MaxValue, context.User.Identity?.Name ?? "admin", ct);
            await InvalidateAsync(hub, 0, ct);
            return Results.Ok(new { purged });
        });

        playback.MapPost("/controller/unlock", async (ControllerPinInput input, LessonCueDb db,
            IPasswordHasher<Organization> hasher, ControllerSessionService controllerSessions, CancellationToken ct) =>
        {
            var organization = await db.Organizations.AsNoTracking().SingleAsync(ct);
            if (organization.ControllerPinHash is null)
                return Results.Conflict(new { error = "An administrator must configure the universal controller PIN in Settings." });
            return hasher.VerifyHashedPassword(organization, organization.ControllerPinHash, input.Pin) == PasswordVerificationResult.Failed
                ? Results.Json(new { error = "That controller PIN was not accepted." }, statusCode: StatusCodes.Status403Forbidden)
                : Results.Ok(new { grant = controllerSessions.CreateUniversalGrant(), expiresAt = DateTimeOffset.UtcNow.AddHours(12) });
        }).RequireRateLimiting("login");

        settings.MapGet("/storage", async (LessonCueDb db, StorageService storage, CancellationToken ct) =>
            Results.Ok(await storage.GetSnapshotAsync(db, ct)));

        settings.MapPut("/storage", async (StorageLimitInput input, LessonCueDb db, StorageService storage,
            CancellationToken ct) =>
        {
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

        settings.MapGet("/local-address", (LocalAddressService localAddress) => Results.Ok(localAddress.Status));

        settings.MapPut("/local-address", async (LocalHostnameInput input, LocalAddressService localAddress,
            LessonCueDb db, CancellationToken ct) =>
        {
            try
            {
                var status = await localAddress.SetAsync(input.Hostname, ct);
                Audit(db, "server.local-address.update", Guid.Empty, status.Address);
                await db.SaveChangesAsync(ct);
                return Results.Ok(status);
            }
            catch (ArgumentException ex) { return Results.BadRequest(new { error = ex.Message }); }
        });

        settings.MapGet("/http-port", (HttpPortService httpPort) => Results.Ok(httpPort.Status));

        settings.MapPut("/http-port", async (HttpPortInput input, HttpPortService httpPort,
            LessonCueDb db, CancellationToken ct) =>
        {
            try
            {
                var status = await httpPort.SetAsync(input.Port, ct);
                Audit(db, "server.http-port.update", Guid.Empty, input.Port.ToString(CultureInfo.InvariantCulture));
                await db.SaveChangesAsync(ct);
                return Results.Ok(status);
            }
            catch (ArgumentException ex) { return Results.BadRequest(new { error = ex.Message }); }
        });

        settings.MapGet("/cloudflare-tunnel", (CloudflareTunnelService tunnel) => Results.Ok(tunnel.Status));

        settings.MapPut("/cloudflare-tunnel", async (CloudflareTunnelInput input, CloudflareTunnelService tunnel,
            LessonCueDb db, CancellationToken ct) =>
        {
            try
            {
                var status = await tunnel.SetAsync(input.Enabled, input.PublicHostname, input.Token,
                    input.AcknowledgedRemoteExposure, ct);
                Audit(db, input.Enabled ? "server.cloudflare-tunnel.enable" : "server.cloudflare-tunnel.disable",
                    Guid.Empty, input.Enabled ? status.PublicHostname ?? "configured" : "disabled");
                await db.SaveChangesAsync(ct);
                return Results.Accepted(value: status);
            }
            catch (ArgumentException ex) { return Results.BadRequest(new { error = ex.Message }); }
        });

        updatesAdmin.MapGet("/updates", (UpdateService updates) => Results.Ok(updates.Status));

        updatesAdmin.MapPost("/updates/check", async (UpdateService updates, CancellationToken ct) =>
            Results.Ok(await updates.CheckAsync(true, ct)));

        updatesAdmin.MapPost("/updates/install", async (UpdateService updates, LessonCueDb db, HttpContext context,
            CancellationToken ct) =>
        {
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

        userAdmin.MapGet("/users", async (LessonCueDb db, CancellationToken ct) =>
        {
            var accounts = await db.AdminAccounts.AsNoTracking().OrderBy(x => x.DisplayName).ToListAsync(ct);
            return Results.Ok(accounts.Select(x => new
            {
                x.Id, x.Username, x.DisplayName, x.Email, x.EmailVerified, x.Role, x.Disabled, x.CreatedAt, x.LastLoginAt,
                permissions = LessonCuePermissions.Effective(x),
                customPermissions = x.PermissionsCsv is null ? null : LessonCuePermissions.Parse(x.PermissionsCsv)
            }));
        });

        userAdmin.MapPost("/users", async (UserInput input, LessonCueDb db, HttpContext context,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            var validation = ValidateCredentials(input.Username, input.Password ?? "");
            if (validation is not null) return Results.BadRequest(new { error = validation });
            if (string.IsNullOrWhiteSpace(input.DisplayName)) return Results.BadRequest(new { error = "Name is required." });
            var username = input.Username.Trim().ToLowerInvariant();
            var address = NullIfBlank(input.Email)?.ToLowerInvariant();
            if (address is not null && !IsEmail(address)) return Results.BadRequest(new { error = "Enter a valid email address." });
            if (await db.AdminAccounts.AnyAsync(x => x.Username == username, ct)) return Results.Conflict(new { error = "That username already exists." });
            if (address is not null && await db.AdminAccounts.AnyAsync(x => x.Email == address, ct))
                return Results.Conflict(new { error = "That email address is already registered." });
            var role = NormalizeAdminRole(input.Role);
            if (role == "Owner" && !context.User.IsInRole("Owner")) return Results.Forbid();
            var account = new AdminAccount { Username = username, DisplayName = input.DisplayName.Trim(), Email = address,
                EmailVerified = true, EmailVerifiedAt = address is null ? null : DateTimeOffset.UtcNow,
                Role = role, PermissionsCsv = LessonCuePermissions.NormalizeCustom(input.Permissions, role),
                Disabled = input.Disabled, PasswordHash = "pending" };
            if (!context.User.IsInRole("Owner") && LessonCuePermissions.Effective(account)
                .Except(LessonCuePermissions.Effective(context.User)).Any()) return Results.Forbid();
            account.PasswordHash = hasher.HashPassword(account, input.Password!);
            db.AdminAccounts.Add(account); Audit(db, "user.create", account.Id, account.Username); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/users/{account.Id}", new { account.Id });
        });

        userAdmin.MapPut("/users/{id:guid}", async (Guid id, UserInput input, LessonCueDb db, HttpContext context,
            IPasswordHasher<AdminAccount> hasher, CancellationToken ct) =>
        {
            var account = await db.AdminAccounts.FindAsync([id], ct); if (account is null) return Results.NotFound();
            if (account.Role == "Owner" && !context.User.IsInRole("Owner")) return Results.Forbid();
            var currentAccountId = Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var currentId) ? currentId : Guid.Empty;
            if (account.Id == currentAccountId && input.Disabled)
                return Results.BadRequest(new { error = "You cannot pause your own account." });
            var usernameValidation = AdminCredentialPolicy.ValidateUsername(input.Username);
            if (usernameValidation is not null) return Results.BadRequest(new { error = usernameValidation });
            if (string.IsNullOrWhiteSpace(input.DisplayName)) return Results.BadRequest(new { error = "Name is required." });
            var username = input.Username.Trim().ToLowerInvariant();
            var address = NullIfBlank(input.Email)?.ToLowerInvariant();
            if (address is not null && !IsEmail(address)) return Results.BadRequest(new { error = "Enter a valid email address." });
            if (await db.AdminAccounts.AnyAsync(x => x.Username == username && x.Id != id, ct))
                return Results.Conflict(new { error = "That username already exists." });
            if (address is not null && await db.AdminAccounts.AnyAsync(x => x.Email == address && x.Id != id, ct))
                return Results.Conflict(new { error = "That email address is already registered." });
            var role = NormalizeAdminRole(input.Role);
            if (role == "Owner" && !context.User.IsInRole("Owner")) return Results.Forbid();
            if (account.Role == "Owner" && (role != "Owner" || input.Disabled) && await db.AdminAccounts.CountAsync(x => x.Role == "Owner" && !x.Disabled, ct) <= 1)
                return Results.BadRequest(new { error = "At least one active owner is required." });
            var permissionsCsv = LessonCuePermissions.NormalizeCustom(input.Permissions, role);
            if (account.Id == currentAccountId && (account.Role != role || account.PermissionsCsv != permissionsCsv))
                return Results.BadRequest(new { error = "Another user administrator must change your role or permissions." });
            var requestedAccess = new AdminAccount
            {
                Username = account.Username, PasswordHash = account.PasswordHash, Role = role, PermissionsCsv = permissionsCsv
            };
            if (!context.User.IsInRole("Owner") && LessonCuePermissions.Effective(requestedAccess)
                .Except(LessonCuePermissions.Effective(context.User)).Any()) return Results.Forbid();
            var identityChanged = account.Username != username || account.DisplayName != input.DisplayName.Trim() ||
                account.Email != address || account.Role != role || account.PermissionsCsv != permissionsCsv ||
                account.Disabled != input.Disabled;
            var emailChanged = account.Email != address;
            account.Username = username; account.DisplayName = input.DisplayName.Trim(); account.Email = address;
            if (emailChanged) { account.EmailVerified = true; account.EmailVerifiedAt = address is null ? null : DateTimeOffset.UtcNow; }
            account.Role = role; account.PermissionsCsv = permissionsCsv; account.Disabled = input.Disabled;
            if (!string.IsNullOrWhiteSpace(input.Password))
            {
                var validation = ValidateCredentials(account.Username, input.Password); if (validation is not null) return Results.BadRequest(new { error = validation });
                account.PasswordHash = hasher.HashPassword(account, input.Password);
                identityChanged = true;
            }
            if (identityChanged) account.SessionVersion++;
            Audit(db, "user.update", account.Id, account.Username);
            await db.SaveChangesAsync(ct);
            if (account.Id == currentAccountId) await SignInAsync(context, account);
            return Results.NoContent();
        });

        userAdmin.MapDelete("/users/{id:guid}", async (Guid id, LessonCueDb db, HttpContext context, CancellationToken ct) =>
        {
            var currentAccountId = Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var currentId) ? currentId : Guid.Empty;
            if (id == currentAccountId) return Results.BadRequest(new { error = "You cannot delete your own account." });
            var account = await db.AdminAccounts.FindAsync([id], ct); if (account is null) return Results.NotFound();
            if (account.Role == "Owner" && !context.User.IsInRole("Owner")) return Results.Forbid();
            if (account.Role == "Owner" && !account.Disabled && await db.AdminAccounts.CountAsync(x => x.Role == "Owner" && !x.Disabled, ct) <= 1)
                return Results.BadRequest(new { error = "At least one active owner is required." });
            db.AdminAccounts.Remove(account);
            Audit(db, "user.delete", account.Id, account.Username);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        admin.MapGet("/signage", async (LessonCueDb db, CancellationToken ct) =>
        {
            var now = DateTimeOffset.UtcNow;
            var timeZone = await db.Organizations.AsNoTracking().Select(x => x.TimeZone).FirstOrDefaultAsync(ct) ?? "UTC";
            var screens = await db.Screens.AsNoTracking().Where(x => !x.Revoked).ToListAsync(ct);
            var screenNames = screens.ToDictionary(x => x.Id, x => x.Name);
            var items = await db.SignagePlaylists.AsNoTracking().Include(x => x.MediaAsset)
                .OrderBy(x => x.Mode == "emergency" ? 0 : x.Mode == "scheduled" ? 1 : 2)
                .ThenByDescending(x => x.Priority).ThenBy(x => x.Name).ToListAsync(ct);
            return items.Select(item =>
            {
                var state = SignageSchedule.Evaluate(item, now, timeZone);
                var targetScreenIds = SignageSchedule.ParseScreenIds(item.TargetScreenIdsJson);
                var targetedScreens = screens.Where(screen => SignageSchedule.TargetsScreen(item, screen)).ToArray();
                var cacheStates = item.MediaAssetId is null
                    ? targetedScreens.Select(_ => "cached").ToArray()
                    : targetedScreens.Select(screen => SignageCacheState(screen, item.Id)).ToArray();
                return new
                {
                    item.Id, item.Name, item.Mode, item.Enabled, item.Priority, item.StartsAt, item.EndsAt,
                    item.Message, item.BackgroundColor, item.TextColor, item.MediaAssetId,
                    mediaFileName = item.MediaAsset?.FileName, item.TargetTagsCsv,
                    recurrence = SignageSchedule.NormalizeRecurrence(item.Recurrence),
                    item.ScheduleStartDate, item.ScheduleEndDate, item.StartMinutes, item.EndMinutes,
                    daysOfWeek = SignageSchedule.ParseDays(item.DaysOfWeekCsv),
                    excludedDates = SignageSchedule.ParseDates(item.ExcludedDatesJson),
                    targetScreenIds,
                    targetScreenNames = targetScreenIds.Where(screenNames.ContainsKey).Select(id => screenNames[id]).ToArray(),
                    activeNow = state.Active,
                    state.NextChangeAt,
                    readiness = SignageReadiness(item.MediaAsset),
                    ready = SignageReadiness(item.MediaAsset) == "ready",
                    targetScreenCount = targetedScreens.Length,
                    cachedScreenCount = cacheStates.Count(value => value == "cached"),
                    failedScreenCount = cacheStates.Count(value => value == "failed"),
                    item.CreatedAt, item.UpdatedAt
                };
            }).ToArray();
        });

        planning.MapPost("/signage", async (SignageInput input, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var validation = await ValidateSignageAsync(input, db, ct);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var item = new SignagePlaylist { Name = input.Name.Trim() };
            ApplySignage(item, input);
            db.SignagePlaylists.Add(item); Audit(db, "signage.create", item.Id, item.Name); await db.SaveChangesAsync(ct);
            await InvalidateAsync(hub, 0, ct); return Results.Created($"/api/v1/signage/{item.Id}", item);
        });

        planning.MapPut("/signage/{id:guid}", async (Guid id, SignageInput input, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.SignagePlaylists.FindAsync([id], ct); if (item is null) return Results.NotFound();
            var validation = await ValidateSignageAsync(input, db, ct);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            ApplySignage(item, input);
            Audit(db, "signage.update", item.Id, item.Name); await db.SaveChangesAsync(ct); await InvalidateAsync(hub, 0, ct); return Results.Ok(item);
        });

        planning.MapDelete("/signage/{id:guid}", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.SignagePlaylists.FindAsync([id], ct); if (item is null) return Results.NotFound();
            db.SignagePlaylists.Remove(item); Audit(db, "signage.delete", id, item.Name); await db.SaveChangesAsync(ct); await InvalidateAsync(hub, 0, ct);
            return Results.NoContent();
        });

        backupsAdmin.MapGet("/backups", async (LessonCueDb db, CancellationToken ct) =>
            (await db.BackupRecords.AsNoTracking().ToListAsync(ct)).OrderByDescending(x => x.CreatedAt));
        backupsAdmin.MapPost("/backups", async (bool? full, LessonCueDb db, BackupService backups, HttpContext context, CancellationToken ct) =>
        {
            var record = await backups.CreateAsync(db, full == true, context.User.Identity?.Name ?? "admin", ct);
            Audit(db, "backup.create", record.Id, record.Kind); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/backups/{record.Id}/file", record);
        });
        backupsAdmin.MapGet("/backups/{id:guid}/file", async (Guid id, LessonCueDb db, BackupService backups, CancellationToken ct) =>
        {
            var record = await db.BackupRecords.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct); if (record is null) return Results.NotFound();
            var path = backups.Resolve(record.FileName); return path is null ? Results.NotFound() : Results.File(path, "application/zip", record.FileName);
        });
        backupsAdmin.MapPost("/backups/restore/preview", async (HttpRequest request, BackupService backups,
            CancellationToken ct) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest(new { error = "Choose a LessonCue ZIP backup." });
            var form = await request.ReadFormAsync(ct);
            var upload = form.Files.GetFile("file");
            if (upload is null || upload.Length == 0) return Results.BadRequest(new { error = "Choose a non-empty LessonCue ZIP backup." });
            try { await using var stream = upload.OpenReadStream(); return Results.Ok(await backups.StageAsync(stream, upload.FileName, upload.Length, ct)); }
            catch (InvalidDataException ex) { return Results.BadRequest(new { error = ex.Message }); }
            catch (IOException ex) { return Results.BadRequest(new { error = ex.Message }); }
        });
        backupsAdmin.MapPost("/backups/restore", async (BackupRestoreInput input, LessonCueDb db, BackupService backups,
            IHubContext<SyncHub> hub, HttpContext context, CancellationToken ct) =>
        {
            if (!string.Equals(input.Confirmation?.Trim(), "RESTORE", StringComparison.Ordinal))
                return Results.BadRequest(new { error = "Type RESTORE to confirm this replacement." });
            try
            {
                var result = await backups.RestoreAsync(db, input.RestoreId, context.User.Identity?.Name ?? "admin", ct);
                await InvalidateAsync(hub, 0, ct);
                return Results.Ok(result);
            }
            catch (FileNotFoundException ex) { return Results.BadRequest(new { error = ex.Message }); }
            catch (InvalidDataException ex) { return Results.BadRequest(new { error = ex.Message }); }
            catch (InvalidOperationException ex) { return Results.Conflict(new { error = ex.Message }); }
        });

        settings.MapGet("/pairing/status", (PairingCodeService pairing) => Results.Ok(new
        {
            pin = pairing.Current,
            expiresAt = pairing.ExpiresAt,
            fixedPin = pairing.FixedPin is not null
        }));
        settings.MapPut("/pairing/pin", async (PairingPinInput input, PairingCodeService pairing, LessonCueDb db,
            CancellationToken ct) =>
        {
            try { pairing.SetFixedPin(input.Automatic ? null : input.Pin); }
            catch (ArgumentException ex) { return Results.BadRequest(new { error = ex.Message }); }
            Audit(db, "pairing.pin.update", Guid.Empty, input.Automatic ? "automatic" : "fixed");
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { pin = pairing.Current, expiresAt = pairing.ExpiresAt, fixedPin = pairing.FixedPin is not null });
        });
    }

    private static string NormalizeAdminRole(string role) => role is "Owner" or "Administrator" or "Editor" or "Viewer" ? role : "Viewer";
    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static bool IsColor(string? value) => value is { Length: 7 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit);

    private static async Task<string?> ValidateSignageAsync(SignageInput input, LessonCueDb db, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "Signage name is required.";
        if (input.Name.Trim().Length > 160) return "Signage name must be 160 characters or fewer.";
        if ((input.Message?.Trim().Length ?? 0) > 2000) return "Signage message must be 2,000 characters or fewer.";
        if ((input.TargetTagsCsv?.Trim().Length ?? 0) > 2000) return "Screen tags must be 2,000 characters or fewer.";
        if (input.Priority is < 0 or > 100) return "Priority must be from 0 to 100.";
        if (input.BackgroundColor is not null && !IsColor(input.BackgroundColor) ||
            input.TextColor is not null && !IsColor(input.TextColor))
            return "Signage colors must use six-digit hex values.";
        var recurrence = SignageSchedule.NormalizeRecurrence(input.Recurrence);
        if (recurrence == "once" && input.StartsAt is { } starts && input.EndsAt is { } ends && ends <= starts)
            return "The ending time must be after the starting time.";
        if (recurrence != "once")
        {
            if (input.ScheduleEndDate is { } endDate && input.ScheduleStartDate is { } startDate && endDate < startDate)
                return "The ending date must be on or after the starting date.";
            if (input.StartMinutes is < 0 or > 1439 || input.EndMinutes is < 1 or > 1440)
                return "Recurring start and end times are invalid.";
            if (recurrence == "weekly" && !(input.DaysOfWeek?.Any(day => day is >= 0 and <= 6) ?? false))
                return "Choose at least one weekday for weekly signage.";
            if ((input.ExcludedDates?.Count ?? 0) > 366) return "Signage supports at most 366 excluded dates.";
        }
        if ((input.TargetScreenIds?.Count ?? 0) > 500) return "Signage supports at most 500 explicitly selected screens.";
        if (input.MediaAssetId is { } mediaId && !await db.MediaAssets.AnyAsync(x => x.Id == mediaId, ct))
            return "The selected media no longer exists.";
        var targetIds = (input.TargetScreenIds ?? []).Where(id => id != Guid.Empty).Distinct().ToArray();
        if (targetIds.Length > 0 && await db.Screens.CountAsync(x => targetIds.Contains(x.Id), ct) != targetIds.Length)
            return "One or more selected screens no longer exist.";
        return null;
    }

    private static void ApplySignage(SignagePlaylist item, SignageInput input)
    {
        var recurrence = SignageSchedule.NormalizeRecurrence(input.Recurrence);
        item.Name = input.Name.Trim();
        item.Mode = input.Mode is "emergency" or "idle" ? input.Mode : "scheduled";
        item.Enabled = input.Enabled;
        item.Priority = input.Priority;
        item.Message = input.Message?.Trim() ?? "";
        item.BackgroundColor = IsColor(input.BackgroundColor) ? input.BackgroundColor! : "#25302d";
        item.TextColor = IsColor(input.TextColor) ? input.TextColor! : "#ffffff";
        item.MediaAssetId = input.MediaAssetId;
        item.TargetTagsCsv = input.TargetTagsCsv?.Trim() ?? "";
        item.Recurrence = recurrence;
        item.StartsAt = recurrence == "once" ? input.StartsAt : null;
        item.EndsAt = recurrence == "once" ? input.EndsAt : null;
        item.ScheduleStartDate = recurrence == "once" ? null : input.ScheduleStartDate;
        item.ScheduleEndDate = recurrence == "once" ? null : input.ScheduleEndDate;
        item.StartMinutes = recurrence == "once" ? null : input.StartMinutes ?? 0;
        item.EndMinutes = recurrence == "once" ? null : input.EndMinutes ?? 1440;
        item.DaysOfWeekCsv = recurrence == "weekly" ? SignageSchedule.NormalizeDays(input.DaysOfWeek) : "";
        item.ExcludedDatesJson = recurrence == "once" ? "[]" : SignageSchedule.StoreDates(input.ExcludedDates);
        item.TargetScreenIdsJson = SignageSchedule.StoreScreenIds(input.TargetScreenIds);
        item.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static string SignageReadiness(MediaAsset? media)
    {
        if (media is null) return "ready";
        if (media.ProcessingStatus is "pending" or "processing" || media.CompatibilityStatus is "pending" or "processing")
            return "preparing";
        if (media.ProcessingStatus == "failed" || media.CompatibilityStatus == "failed") return "failed";
        if (media.SourceKind != "link" && string.IsNullOrWhiteSpace(media.RelativePath)) return "missing";
        return "ready";
    }

    private static string SignageCacheState(Screen screen, Guid signageId)
    {
        try
        {
            using var document = JsonDocument.Parse(screen.CacheInventoryJson);
            if (document.RootElement.ValueKind != JsonValueKind.Array) return "unknown";
            var itemId = $"signage-{signageId}";
            foreach (var entry in document.RootElement.EnumerateArray())
            {
                if (!entry.TryGetProperty("itemId", out var id) || id.GetString() != itemId) continue;
                return entry.TryGetProperty("state", out var state) ? state.GetString() ?? "unknown" : "unknown";
            }
        }
        catch (JsonException) { }
        return "unknown";
    }

    private static bool IsEmail(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 200) return false;
        try { return new System.Net.Mail.MailAddress(value.Trim()).Address.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }

    private static AccountToken NewAccountToken(Guid accountId, string purpose, string raw, TimeSpan lifetime,
        string? pendingEmail = null) => new()
    {
        AccountId = accountId, Purpose = purpose, TokenHash = AccountEmailService.Hash(raw),
        PendingEmail = pendingEmail, ExpiresAt = DateTimeOffset.UtcNow.Add(lifetime)
    };

    private static Task<AdminAccount?> CurrentAccountAsync(HttpContext context, LessonCueDb db, CancellationToken ct) =>
        Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? db.AdminAccounts.SingleOrDefaultAsync(x => x.Id == id, ct)
            : Task.FromResult<AdminAccount?>(null);

    private static Task<AccountToken?> FindTokenAsync(LessonCueDb db, string raw, string purpose, CancellationToken ct)
    {
        var hash = AccountEmailService.Hash(raw);
        var now = DateTimeOffset.UtcNow;
        return db.AccountTokens.Include(x => x.Account).SingleOrDefaultAsync(x =>
            x.TokenHash == hash && x.Purpose == purpose && x.UsedAt == null && x.ExpiresAt > now, ct);
    }

    private static async Task InvalidateTokensAsync(LessonCueDb db, Guid accountId, string purpose, CancellationToken ct)
    {
        var tokens = await db.AccountTokens.Where(x => x.AccountId == accountId && x.Purpose == purpose && x.UsedAt == null)
            .ToListAsync(ct);
        foreach (var token in tokens) token.UsedAt = DateTimeOffset.UtcNow;
    }

    private static string AccountUrl(Organization organization, HttpRequest request, string path, string token)
    {
        var origin = string.IsNullOrWhiteSpace(organization.PublicBaseUrl)
            ? $"{request.Scheme}://{request.Host}"
            : organization.PublicBaseUrl;
        return $"{origin.TrimEnd('/')}{path}?token={Uri.EscapeDataString(token)}";
    }

    private static Task SendAccountLinkAsync(AccountEmailService email, Organization organization,
        string recipient, string subject, string action, string url, CancellationToken ct)
    {
        var safeUrl = System.Net.WebUtility.HtmlEncode(url);
        var safeAction = System.Net.WebUtility.HtmlEncode(action);
        return email.SendAsync(organization, recipient, subject,
            $"<p>{System.Net.WebUtility.HtmlEncode(organization.Name)} received an account request.</p>" +
            $"<p><a href=\"{safeUrl}\">{safeAction}</a></p>" +
            "<p>If you did not request this, ignore this message.</p>", ct);
    }

    private static bool IsSupportedMediaExtension(string extension) => extension.ToLowerInvariant() is
        ".mp4" or ".m4v" or ".mov" or ".mkv" or ".webm" or ".avi" or ".wmv" or ".asf" or
        ".mpeg" or ".mpg" or ".mpe" or ".ts" or ".mts" or ".m2ts" or ".flv" or ".f4v" or
        ".ogv" or ".3gp" or ".3g2" or ".vob" or ".mp3" or ".m4a" or ".aac" or ".wav" or
        ".jpg" or ".jpeg" or ".png" or ".webp" or ".pdf" or ".pptx" or ".odp" or ".docx";

    private static string NormalizeContentType(string fileName, string? provided)
    {
        if (!string.IsNullOrWhiteSpace(provided) && !provided.Equals("application/octet-stream", StringComparison.OrdinalIgnoreCase))
            return provided;
        return Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".mp4" or ".m4v" or ".mov" or ".f4v" => "video/mp4",
            ".mkv" => "video/x-matroska", ".webm" => "video/webm", ".avi" => "video/x-msvideo",
            ".wmv" or ".asf" => "video/x-ms-wmv", ".mpeg" or ".mpg" or ".mpe" or ".vob" => "video/mpeg",
            ".ts" or ".mts" or ".m2ts" => "video/mp2t", ".flv" => "video/x-flv", ".ogv" => "video/ogg",
            ".3gp" or ".3g2" => "video/3gpp", ".mp3" => "audio/mpeg", ".m4a" or ".aac" => "audio/aac",
            ".wav" => "audio/wav", ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png",
            ".webp" => "image/webp", ".pdf" => "application/pdf",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".odp" => "application/vnd.oasis.opendocument.presentation",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            _ => "application/octet-stream"
        };
    }

    private static MediaAssetVersion CreateArchivedVersion(MediaAsset media, string relativePath, string actor) => new()
    {
        MediaAssetId = media.Id,
        VersionNumber = media.Version,
        FileName = media.FileName,
        ContentType = media.ContentType,
        RelativePath = relativePath,
        Sha256 = media.Sha256,
        SizeBytes = media.SizeBytes,
        DurationMs = media.DurationMs,
        SourceKind = media.SourceKind,
        SourceUrl = media.SourceUrl,
        LinkKind = media.LinkKind,
        ArchivedBy = actor
    };

    private static (string? Thumbnail, string? Filmstrip, string? Waveform, string? Compatibility) ResetMediaProcessing(MediaAsset media,
        bool clearConversion = false)
    {
        var derivatives = (media.ThumbnailPath, media.FilmstripPath, media.WaveformPath, media.CompatibilityPath);
        media.DurationMs = null;
        media.OfflineEligible = false;
        media.ProcessingStatus = "pending";
        media.ProcessingError = null;
        media.VideoCodec = null;
        media.AudioCodec = null;
        media.Width = null;
        media.Height = null;
        media.LoudnessLufs = null;
        media.ThumbnailPath = null;
        media.FilmstripPath = null;
        media.WaveformPath = null;
        media.CompatibilityPath = null;
        media.CompatibilitySha256 = null;
        media.CompatibilitySizeBytes = null;
        media.CompatibilityStatus = "pending";
        media.CompatibilityError = null;
        media.CompatibilityTranscodedAt = null;
        media.CompatibilityTranscodeEngine = null;
        if (clearConversion)
        {
            media.ConversionStatus = "none";
            media.ConversionError = null;
            media.ConvertedSlidesJson = "[]";
            media.ConvertedAt = null;
        }
        return derivatives;
    }

    private static void DeleteDerivatives(MediaStoragePaths paths,
        (string? Thumbnail, string? Filmstrip, string? Waveform, string? Compatibility) derivatives)
    {
        foreach (var relative in new[] { derivatives.Thumbnail, derivatives.Filmstrip, derivatives.Waveform })
        {
            var path = relative is null ? null : ResolveStoredFile(paths.Thumbnails, relative);
            if (path is not null) TryDeleteFile(path);
        }
        var compatibility = derivatives.Compatibility is null ? null : ResolveStoredFile(paths.Compatibility, derivatives.Compatibility);
        if (compatibility is not null) TryDeleteFile(compatibility);
    }

    private static async Task DeleteAdaptiveTranscodesAsync(LessonCueDb db, MediaStoragePaths paths, Guid mediaId, CancellationToken ct)
    {
        var variants = await db.MediaTranscodeVariants.Where(x => x.MediaAssetId == mediaId).ToListAsync(ct);
        var storedFiles = variants.Where(x => x.RelativePath is not null).Select(x => x.RelativePath!).ToArray();
        db.MediaTranscodeVariants.RemoveRange(variants);
        await db.SaveChangesAsync(ct);
        foreach (var relativePath in storedFiles)
        {
            var path = ResolveStoredFile(paths.Transcodes, relativePath);
            if (path is not null) TryDeleteFile(path);
        }
    }

    private static string? ResolveStoredFile(string root, string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return null;
        var normalizedRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(root, relativePath));
        return path.StartsWith(normalizedRoot, StringComparison.Ordinal) && File.Exists(path) ? path : null;
    }

    private static void TryDeleteFile(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }
    private static long SaturatingAdd(long left, long right) => left > long.MaxValue - right ? long.MaxValue : left + right;

    private static async Task IncrementMediaLessonVersionsAsync(LessonCueDb db, Guid mediaId, CancellationToken ct)
    {
        var lessonIds = await db.PlaylistItems.Where(x => x.MediaAssetId == mediaId).Select(x => x.LessonId).Distinct().ToListAsync(ct);
        var lessons = await db.Lessons.Where(x => lessonIds.Contains(x.Id)).ToListAsync(ct);
        foreach (var lesson in lessons) lesson.Version++;
    }

    private static string NormalizeRole(string? role) => role is "preRoll" or "countdown" ? role : "lesson";

    private static string? ValidateSchedule(RecurringScheduleInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "Schedule name is required.";
        if (input.Frequency is not ("weekly" or "monthly" or "custom")) return "Choose a weekly, monthly, or custom schedule.";
        if (input.Interval is < 1 or > 52) return "Recurrence interval must be from 1 to 52.";
        if (input.DayOfWeek is < 0 or > 6) return "Day of week is invalid.";
        if (input.DayOfMonth is < 1 or > 31) return "Day of month is invalid.";
        if (input.StartMinutes is < 0 or > 1439) return "Start time is invalid.";
        if (input.EndDate is DateOnly end && end < input.StartDate) return "End date must be on or after the start date.";
        if (input.GenerateDaysAhead is < 1 or > 730) return "Generation window must be from 1 to 730 days.";
        if (input.Frequency == "weekly" && input.DayOfWeek is null) return "Choose a weekday for a weekly schedule.";
        if (input.Frequency == "monthly" && input.DayOfMonth is null) return "Choose a day of month for a monthly schedule.";
        if (input.Frequency == "custom" && (input.CustomDates is null || input.CustomDates.Count == 0)) return "Add at least one custom date.";
        if ((input.CustomDates?.Count ?? 0) > 500 || (input.ExcludedDates?.Count ?? 0) > 500) return "A schedule supports at most 500 custom or excluded dates.";
        return null;
    }

    private static void ApplySchedule(RecurringLessonSchedule schedule, RecurringScheduleInput input)
    {
        schedule.TemplateId = input.TemplateId; schedule.ClassId = input.ClassId; schedule.Name = input.Name.Trim();
        schedule.Frequency = input.Frequency; schedule.Interval = input.Interval; schedule.DayOfWeek = input.DayOfWeek;
        schedule.DayOfMonth = input.DayOfMonth; schedule.StartDate = input.StartDate; schedule.EndDate = input.EndDate;
        schedule.StartMinutes = input.StartMinutes;
        schedule.TitlePattern = string.IsNullOrWhiteSpace(input.TitlePattern) ? "{template} — {date}" : input.TitlePattern.Trim();
        schedule.CustomDatesJson = LessonScheduleService.SerializeDates(input.CustomDates ?? []);
        schedule.ExcludedDatesJson = LessonScheduleService.SerializeDates(input.ExcludedDates ?? []);
        schedule.Enabled = input.Enabled; schedule.GenerateDaysAhead = input.GenerateDaysAhead;
        schedule.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static string? ValidateCredentials(string username, string password)
    {
        return AdminCredentialPolicy.Validate(username, password);
    }

    private static string NormalizeControllerSlug(string? value)
    {
        var source = (value ?? "").Trim().ToLowerInvariant();
        var joined = string.Join('-', source.Split([' ', '_', '/', '\\'], StringSplitOptions.RemoveEmptyEntries));
        var result = new string(joined.Where(character => char.IsAsciiLetterOrDigit(character) || character == '-').ToArray());
        while (result.Contains("--", StringComparison.Ordinal)) result = result.Replace("--", "-", StringComparison.Ordinal);
        return result.Trim('-');
    }

    private static string? NormalizeHostname(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().TrimEnd('.').ToLowerInvariant();

    private static string? ValidateControllerAddress(string slug, string? color, string? hostname)
    {
        if (slug.Length is < 1 or > 63 || slug.StartsWith('-') || slug.EndsWith('-'))
            return "Controller path must be 1–63 lowercase letters, numbers, or hyphens.";
        var selectedColor = color?.Trim() ?? "#2d6a4f";
        if (selectedColor.Length != 7 || selectedColor[0] != '#' || selectedColor[1..].Any(character => !Uri.IsHexDigit(character)))
            return "Controller color must be a six-digit hex color.";
        var normalizedHost = NormalizeHostname(hostname);
        if (normalizedHost is not null && (normalizedHost.Length > 253 || normalizedHost.Contains('/') || normalizedHost.Contains(':') ||
            normalizedHost.Split('.').Any(label => label.Length is < 1 or > 63 || label.StartsWith('-') || label.EndsWith('-') || label.Any(character => !char.IsAsciiLetterOrDigit(character) && character != '-'))))
            return "Controller hostname must be a hostname only, without https://, a port, or a path.";
        return null;
    }

    private static Task SignInAsync(HttpContext context, AdminAccount account)
    {
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new Claim(ClaimTypes.Name, account.Username),
            new Claim(ClaimTypes.Role, account.Role),
            new Claim("display_name", account.DisplayName),
            new Claim("session_version", account.SessionVersion.ToString(CultureInfo.InvariantCulture)),
            new Claim("lessoncue_permissions_version", "1")
        };
        claims.AddRange(LessonCuePermissions.Effective(account).Select(permission =>
            new Claim(LessonCuePermissions.ClaimType, permission)));
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        return context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(12) });
    }

    private static void Audit(LessonCueDb db, string action, Guid id, string? summary) =>
        db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = action, Object = id.ToString(), Summary = summary });

    private static void DeleteDiagnosticScreenshot(string dataPath, string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return;
        var root = Path.GetFullPath(dataPath) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(dataPath, relativePath));
        if (path.StartsWith(root, StringComparison.Ordinal)) try { File.Delete(path); } catch { }
    }

    private static void ClearDiagnosticScreenshot(Screen screen)
    {
        screen.ScreenshotRequestId = null;
        screen.ScreenshotRequestedAt = null;
        screen.ScreenshotExpiresAt = null;
        screen.ScreenshotStatus = "none";
        screen.ScreenshotCapturedAt = null;
        screen.ScreenshotRelativePath = null;
    }

    private static Task InvalidateAsync(IHubContext<SyncHub> hub, int version, CancellationToken ct) =>
        hub.Clients.All.SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED", manifestVersion = version }, ct);

    private static IResult StorageExceeded(long requestedBytes) => Results.Json(new
    {
        error = $"Not enough LessonCue storage is available for this upload ({requestedBytes} bytes requested). Ask an administrator to increase the allocation or remove media."
    }, statusCode: StatusCodes.Status507InsufficientStorage);
}
