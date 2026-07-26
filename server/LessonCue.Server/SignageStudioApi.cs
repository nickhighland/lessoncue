using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class SignageStudioApi
{
    public static void MapSignageStudio(this IEndpointRouteBuilder routes)
    {
        var api = routes.MapGroup("/api/v1/signage-studio").RequireAuthorization();
        var planning = api.MapGroup("").RequireAuthorization(LessonCuePermissions.Planning);
        var operations = api.MapGroup("").RequireAuthorization(LessonCuePermissions.Screens);

        api.MapGet("/catalog", async (LessonCueDb db, CancellationToken ct) => Results.Ok(new
        {
            resolutions = SignageStudio.Resolutions.Select(value => new { value.Key, value.Name, value.Width, value.Height }),
            zoneTypes = SignageLayout.ZoneTypes,
            layoutFolders = await db.SignageLayouts.AsNoTracking().Select(x => x.Folder).Distinct().Order().ToArrayAsync(ct),
            playlistFolders = await db.SignageContentPlaylists.AsNoTracking().Select(x => x.Folder).Distinct().Order().ToArrayAsync(ct)
        }));

        api.MapGet("/credentials", (SignageCredentialStore credentials) => Results.Ok(credentials.List()));
        planning.MapPut("/credentials/{key}", async (string key, SignageCredentialInput input,
            SignageCredentialStore credentials, CancellationToken ct) =>
        {
            if (!string.Equals(key, input.Key, StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Credential key in the address and form must match." });
            try { await credentials.PutAsync(input.Key, input.Kind, input.Username, input.HeaderName, input.Secret, ct); }
            catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
            return Results.Ok(new { saved = true, key = input.Key.Trim().ToLowerInvariant() });
        });
        planning.MapDelete("/credentials/{key}", async (string key, SignageCredentialStore credentials,
            CancellationToken ct) => await credentials.DeleteAsync(key, ct) ? Results.NoContent() : Results.NotFound());

        api.MapGet("/layouts", async (LessonCueDb db, CancellationToken ct) =>
            Results.Ok((await db.SignageLayouts.AsNoTracking().OrderBy(x => x.Folder).ThenBy(x => x.Name).ToListAsync(ct))
                .Select(item => SignageStudio.MapLayout(item))));

        planning.MapPost("/layouts", async (SignageLayoutResourceInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var error = SignageStudio.ValidateLayout(input, SignageLayout.ParseAllowlist(organization.SignageSourceAllowlistJson));
            if (error is not null) return Results.BadRequest(new { error });
            if (input.BackgroundAudioAssetId is { } audioId && !await db.MediaAssets.AnyAsync(x => x.Id == audioId, ct))
                return Results.BadRequest(new { error = "The selected background audio no longer exists." });
            var item = new SignageLayoutResource { Name = input.Name.Trim(), Version = 0 };
            SignageStudio.ApplyLayout(item, input);
            db.SignageLayouts.Add(item);
            Audit(db, "signage.layout.create", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/signage-studio/layouts/{item.Id}", SignageStudio.MapLayout(item));
        });

        planning.MapPut("/layouts/{id:guid}", async (Guid id, SignageLayoutResourceInput input, LessonCueDb db,
            CancellationToken ct) =>
        {
            var item = await db.SignageLayouts.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            var organization = await db.Organizations.AsNoTracking().FirstAsync(ct);
            var error = SignageStudio.ValidateLayout(input, SignageLayout.ParseAllowlist(organization.SignageSourceAllowlistJson));
            if (error is not null) return Results.BadRequest(new { error });
            SignageStudio.ApplyLayout(item, input);
            Audit(db, "signage.layout.save-draft", item.Id, $"{item.Name} v{item.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(SignageStudio.MapLayout(item));
        });

        planning.MapPost("/layouts/{id:guid}/publish", async (Guid id, SignagePublishInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.SignageLayouts.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            SignageStudio.Publish(item);
            Audit(db, "signage.layout.publish", item.Id, $"{item.Name} v{item.PublishedVersion}");
            await db.SaveChangesAsync(ct);
            if (input.PushToScreens) await Invalidate(hub, item.PublishedVersion, ct);
            return Results.Ok(SignageStudio.MapLayout(item));
        });

        planning.MapPost("/layouts/{id:guid}/duplicate", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var source = await db.SignageLayouts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (source is null) return Results.NotFound();
            var copy = new SignageLayoutResource
            {
                Name = $"{source.Name} copy", Folder = source.Folder, Description = source.Description,
                BackgroundColor = source.BackgroundColor, CanvasWidth = source.CanvasWidth, CanvasHeight = source.CanvasHeight,
                Orientation = source.Orientation, SafeAreaPercent = source.SafeAreaPercent,
                DraftZonesJson = source.DraftZonesJson, BackgroundAudioAssetId = source.BackgroundAudioAssetId,
                ThumbnailDataUrl = source.ThumbnailDataUrl, IsTemplate = source.IsTemplate,
                Version = 1, PublishedVersion = 0, PublishState = "draft"
            };
            db.SignageLayouts.Add(copy);
            Audit(db, "signage.layout.duplicate", copy.Id, source.Name);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/signage-studio/layouts/{copy.Id}", SignageStudio.MapLayout(copy));
        });

        planning.MapPost("/layouts/{id:guid}/replace-from-template/{templateId:guid}", async (Guid id, Guid templateId,
            LessonCueDb db, CancellationToken ct) =>
        {
            var item = await db.SignageLayouts.FindAsync([id], ct);
            var template = await db.SignageLayouts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == templateId && x.IsTemplate, ct);
            if (item is null || template is null) return Results.NotFound();
            item.DraftZonesJson = string.IsNullOrWhiteSpace(template.PublishedZonesJson) ? template.DraftZonesJson : template.PublishedZonesJson;
            item.BackgroundColor = template.BackgroundColor;
            item.CanvasWidth = template.CanvasWidth;
            item.CanvasHeight = template.CanvasHeight;
            item.Orientation = template.Orientation;
            item.SafeAreaPercent = template.SafeAreaPercent;
            item.Version++;
            item.PublishState = item.PublishedVersion == 0 ? "draft" : "changes";
            item.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, "signage.layout.replace-draft", item.Id, template.Name);
            await db.SaveChangesAsync(ct);
            return Results.Ok(SignageStudio.MapLayout(item));
        });

        planning.MapDelete("/layouts/{id:guid}", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var item = await db.SignageLayouts.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            if (item.IsStarter) return Results.BadRequest(new { error = "Built-in starter templates cannot be deleted. Duplicate one and edit the copy." });
            if (await db.SignagePlaylists.AnyAsync(x => x.LayoutId == id, ct) ||
                (await db.SignageContentPlaylists.AsNoTracking().Select(x => x.DraftItemsJson + x.PublishedItemsJson).ToListAsync(ct))
                .Any(json => SignageStudio.ParseItems(json).Any(entry => entry.LayoutId == id)))
                return Results.Conflict(new { error = "This layout is assigned to signage or a playlist. Replace those references before deleting it." });
            db.SignageLayouts.Remove(item);
            Audit(db, "signage.layout.delete", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        api.MapGet("/playlists", async (LessonCueDb db, CancellationToken ct) =>
            Results.Ok((await db.SignageContentPlaylists.AsNoTracking().OrderBy(x => x.Folder).ThenBy(x => x.Name).ToListAsync(ct))
                .Select(item => SignageStudio.MapPlaylist(item))));

        planning.MapPost("/playlists", async (SignageContentPlaylistInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var error = await ValidatePlaylistAsync(input, null, db, ct);
            if (error is not null) return Results.BadRequest(new { error });
            var item = new SignageContentPlaylist { Name = input.Name.Trim(), Version = 0 };
            SignageStudio.ApplyPlaylist(item, input);
            db.SignageContentPlaylists.Add(item);
            Audit(db, "signage.content-playlist.create", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/signage-studio/playlists/{item.Id}", SignageStudio.MapPlaylist(item));
        });

        planning.MapPut("/playlists/{id:guid}", async (Guid id, SignageContentPlaylistInput input, LessonCueDb db,
            CancellationToken ct) =>
        {
            var item = await db.SignageContentPlaylists.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            var error = await ValidatePlaylistAsync(input, id, db, ct);
            if (error is not null) return Results.BadRequest(new { error });
            SignageStudio.ApplyPlaylist(item, input);
            Audit(db, "signage.content-playlist.save-draft", item.Id, $"{item.Name} v{item.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(SignageStudio.MapPlaylist(item));
        });

        planning.MapPost("/playlists/{id:guid}/publish", async (Guid id, SignagePublishInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var item = await db.SignageContentPlaylists.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            SignageStudio.Publish(item);
            Audit(db, "signage.content-playlist.publish", item.Id, $"{item.Name} v{item.PublishedVersion}");
            await db.SaveChangesAsync(ct);
            if (input.PushToScreens) await Invalidate(hub, item.PublishedVersion, ct);
            return Results.Ok(SignageStudio.MapPlaylist(item));
        });

        planning.MapPost("/playlists/{id:guid}/duplicate", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var source = await db.SignageContentPlaylists.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (source is null) return Results.NotFound();
            var copy = new SignageContentPlaylist
            {
                Name = $"{source.Name} copy", Folder = source.Folder, PlaybackMode = source.PlaybackMode,
                Synchronization = source.Synchronization, DraftItemsJson = source.DraftItemsJson,
                Version = 1, PublishState = "draft"
            };
            db.SignageContentPlaylists.Add(copy);
            Audit(db, "signage.content-playlist.duplicate", copy.Id, source.Name);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/signage-studio/playlists/{copy.Id}", SignageStudio.MapPlaylist(copy));
        });

        planning.MapDelete("/playlists/{id:guid}", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var item = await db.SignageContentPlaylists.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            if (await db.SignagePlaylists.AnyAsync(x => x.ContentPlaylistId == id, ct))
                return Results.Conflict(new { error = "This playlist is assigned to a signage schedule." });
            db.SignageContentPlaylists.Remove(item);
            Audit(db, "signage.content-playlist.delete", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        planning.MapPost("/assignments/bulk", async (SignageBulkAssignmentInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var ids = (input.SignageIds ?? []).Distinct().ToArray();
            var screenIds = (input.ScreenIds ?? []).Distinct().ToArray();
            if (ids.Length == 0) return Results.BadRequest(new { error = "Choose at least one signage schedule." });
            if (screenIds.Length > 0 && await db.Screens.CountAsync(x => screenIds.Contains(x.Id) && !x.Revoked, ct) != screenIds.Length)
                return Results.BadRequest(new { error = "One or more selected screens no longer exists." });
            var schedules = await db.SignagePlaylists.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
            if (schedules.Count != ids.Length) return Results.BadRequest(new { error = "One or more selected schedules no longer exists." });
            foreach (var schedule in schedules)
            {
                schedule.TargetScreenIdsJson = SignageSchedule.StoreScreenIds(screenIds);
                schedule.TargetTagsCsv = input.TargetTagsCsv?.Trim() ?? "";
                schedule.Version++;
                schedule.PublishState = input.Publish ? "published" : "changes";
                if (input.Publish)
                {
                    schedule.PublishedVersion = schedule.Version;
                    schedule.PublishedAt = DateTimeOffset.UtcNow;
                    schedule.LastPushedAt = DateTimeOffset.UtcNow;
                }
                schedule.UpdatedAt = DateTimeOffset.UtcNow;
            }
            Audit(db, "signage.assignment.bulk", Guid.Empty, $"{schedules.Count} schedules · {screenIds.Length} screens");
            await db.SaveChangesAsync(ct);
            if (input.Publish) await Invalidate(hub, schedules.Max(x => x.Version), ct);
            return Results.Ok(new { updated = schedules.Count, pushed = input.Publish });
        });

        planning.MapPost("/schedules/{id:guid}/series-edit", async (Guid id, SignageSeriesEditInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var schedule = await db.SignagePlaylists.FindAsync([id], ct);
            if (schedule is null) return Results.NotFound();
            if (SignageSchedule.NormalizeRecurrence(schedule.Recurrence) == "once")
                return Results.BadRequest(new { error = "Edit scope is only available for recurring schedules." });

            var scope = input.Scope?.Trim().ToLowerInvariant();
            if (scope is not ("event" or "future" or "series"))
                return Results.BadRequest(new { error = "Choose this event, this and future events, or the entire series." });
            if (schedule.ScheduleStartDate is { } first && input.EffectiveDate < first ||
                schedule.ScheduleEndDate is { } last && input.EffectiveDate > last)
                return Results.BadRequest(new { error = "The selected occurrence is outside this series." });
            if (schedule.Recurrence == "weekly" &&
                !SignageSchedule.ParseDays(schedule.DaysOfWeekCsv).Contains((int)input.EffectiveDate.DayOfWeek))
                return Results.BadRequest(new { error = "The selected date is not one of this series' weekdays." });
            if (scope == "event" && SignageSchedule.ParseDates(schedule.ExcludedDatesJson).Contains(input.EffectiveDate))
                return Results.BadRequest(new { error = "That occurrence is already excluded from this series." });

            if (scope == "series")
            {
                var validation = await AdminApi.ValidateSignageAsync(input.Changes, db, ct);
                if (validation is not null) return Results.BadRequest(new { error = validation });
                AdminApi.ApplySignage(schedule, input.Changes);
                Audit(db, "signage.series.update", schedule.Id, $"{schedule.Name}: entire series");
                await db.SaveChangesAsync(ct);
                await Invalidate(hub, schedule.PublishedVersion, ct);
                return Results.Ok(new { scheduleId = schedule.Id, scope });
            }

            var timeZone = await db.Organizations.AsNoTracking().Select(x => x.TimeZone).FirstOrDefaultAsync(ct) ?? "UTC";
            SignageInput derived;
            if (scope == "event")
            {
                var startMinutes = input.Changes.StartMinutes ?? schedule.StartMinutes ?? 0;
                var endMinutes = input.Changes.EndMinutes ?? schedule.EndMinutes ?? 1440;
                var startsAt = SeriesBoundary(input.EffectiveDate, startMinutes, timeZone);
                var endDate = endMinutes <= startMinutes ? input.EffectiveDate.AddDays(1) : input.EffectiveDate;
                var endsAt = SeriesBoundary(endMinutes == 1440 ? input.EffectiveDate.AddDays(1) : endDate,
                    endMinutes == 1440 ? 0 : endMinutes, timeZone);
                derived = input.Changes with
                {
                    Recurrence = "once", StartsAt = startsAt, EndsAt = endsAt,
                    ScheduleStartDate = null, ScheduleEndDate = null, StartMinutes = null, EndMinutes = null,
                    DaysOfWeek = [], ExcludedDates = []
                };
            }
            else
            {
                derived = input.Changes with
                {
                    ScheduleStartDate = input.EffectiveDate,
                    ExcludedDates = (input.Changes.ExcludedDates ?? []).Where(date => date >= input.EffectiveDate).ToList()
                };
            }

            var error = await AdminApi.ValidateSignageAsync(derived, db, ct);
            if (error is not null) return Results.BadRequest(new { error });

            if (scope == "future" && schedule.ScheduleStartDate == input.EffectiveDate)
            {
                AdminApi.ApplySignage(schedule, derived);
                Audit(db, "signage.series.update", schedule.Id, $"{schedule.Name}: this and future from first occurrence");
                await db.SaveChangesAsync(ct);
                await Invalidate(hub, schedule.PublishedVersion, ct);
                return Results.Ok(new { scheduleId = schedule.Id, scope });
            }

            var replacement = new SignagePlaylist { Name = derived.Name.Trim() };
            AdminApi.ApplySignage(replacement, derived);
            db.SignagePlaylists.Add(replacement);
            if (scope == "event")
            {
                var exclusions = SignageSchedule.ParseDates(schedule.ExcludedDatesJson);
                exclusions.Add(input.EffectiveDate);
                schedule.ExcludedDatesJson = SignageSchedule.StoreDates(exclusions);
            }
            else
            {
                schedule.ScheduleEndDate = input.EffectiveDate.AddDays(-1);
            }
            PublishSeriesMutation(schedule);
            Audit(db, scope == "event" ? "signage.series.event-update" : "signage.series.split",
                schedule.Id, $"{schedule.Name}: {input.EffectiveDate:yyyy-MM-dd}");
            await db.SaveChangesAsync(ct);
            await Invalidate(hub, Math.Max(schedule.PublishedVersion, replacement.PublishedVersion), ct);
            return Results.Ok(new { scheduleId = replacement.Id, sourceScheduleId = schedule.Id, scope });
        });

        planning.MapPost("/schedules/{id:guid}/publish", async (Guid id, SignagePublishInput input, LessonCueDb db,
            IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var schedule = await db.SignagePlaylists.FindAsync([id], ct);
            if (schedule is null) return Results.NotFound();
            schedule.PublishedVersion = schedule.Version;
            schedule.PublishState = "published";
            schedule.PublishedAt = DateTimeOffset.UtcNow;
            if (input.PushToScreens) schedule.LastPushedAt = DateTimeOffset.UtcNow;
            Audit(db, "signage.schedule.publish", schedule.Id, $"{schedule.Name} v{schedule.PublishedVersion}");
            await db.SaveChangesAsync(ct);
            if (input.PushToScreens) await Invalidate(hub, schedule.PublishedVersion, ct);
            return Results.Ok(new { schedule.Id, schedule.Version, schedule.PublishedVersion, schedule.PublishState, schedule.PublishedAt, schedule.LastPushedAt });
        });

        planning.MapGet("/preview/{screenId:guid}", async (Guid screenId, ManifestService manifests, CancellationToken ct) =>
        {
            var manifest = await manifests.BuildAsync(screenId, ct);
            return manifest is null ? Results.NotFound() : Results.Ok(manifest);
        });

        api.MapGet("/emergencies", async (LessonCueDb db, CancellationToken ct) =>
            Results.Ok(await db.SignageEmergencyTemplates.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct)));

        planning.MapPost("/emergencies", async (SignageEmergencyTemplateInput input, LessonCueDb db, CancellationToken ct) =>
        {
            var error = ValidateEmergency(input);
            if (error is not null) return Results.BadRequest(new { error });
            var item = new SignageEmergencyTemplate { Name = input.Name.Trim() };
            ApplyEmergency(item, input);
            db.SignageEmergencyTemplates.Add(item);
            Audit(db, "signage.emergency-template.create", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/signage-studio/emergencies/{item.Id}", item);
        });

        planning.MapPut("/emergencies/{id:guid}", async (Guid id, SignageEmergencyTemplateInput input, LessonCueDb db,
            CancellationToken ct) =>
        {
            var item = await db.SignageEmergencyTemplates.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            var error = ValidateEmergency(input);
            if (error is not null) return Results.BadRequest(new { error });
            ApplyEmergency(item, input);
            Audit(db, "signage.emergency-template.update", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.Ok(item);
        });

        planning.MapPost("/emergencies/{id:guid}/activate", async (Guid id, SignageEmergencyActivateInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var template = await db.SignageEmergencyTemplates.FindAsync([id], ct);
            if (template is null) return Results.NotFound();
            if (template.ActiveSignageId is { } currentId)
            {
                var current = await db.SignagePlaylists.FindAsync([currentId], ct);
                if (current is not null) db.SignagePlaylists.Remove(current);
            }
            var duration = Math.Clamp(input.DurationMinutes ?? template.DefaultDurationMinutes, 1, 1440);
            var now = DateTimeOffset.UtcNow;
            var signage = new SignagePlaylist
            {
                Name = template.Name, Mode = "emergency", Priority = 100, Enabled = true,
                Message = template.Message, BackgroundColor = template.BackgroundColor, TextColor = template.TextColor,
                MediaAssetId = template.MediaAssetId, TargetTagsCsv = input.TargetTagsCsv?.Trim() ?? template.TargetTagsCsv,
                TargetScreenIdsJson = SignageSchedule.StoreScreenIds(input.ScreenIds),
                StartsAt = now, EndsAt = now.AddMinutes(duration), PublishState = "published",
                PublishedAt = now, LastPushedAt = now
            };
            db.SignagePlaylists.Add(signage);
            template.ActiveSignageId = signage.Id;
            template.ActivatedAt = now;
            template.ExpiresAt = signage.EndsAt;
            template.UpdatedAt = now;
            Audit(db, "signage.emergency.activate", template.Id, $"{template.Name} · {duration} minutes");
            await db.SaveChangesAsync(ct);
            await Invalidate(hub, signage.Version, ct);
            return Results.Ok(new { template.Id, signageId = signage.Id, template.ActivatedAt, template.ExpiresAt });
        });

        planning.MapPost("/emergencies/{id:guid}/cancel", async (Guid id, LessonCueDb db, IHubContext<SyncHub> hub,
            CancellationToken ct) =>
        {
            var template = await db.SignageEmergencyTemplates.FindAsync([id], ct);
            if (template is null) return Results.NotFound();
            if (template.ActiveSignageId is { } signageId)
            {
                var signage = await db.SignagePlaylists.FindAsync([signageId], ct);
                if (signage is not null) db.SignagePlaylists.Remove(signage);
            }
            template.ActiveSignageId = null;
            template.ActivatedAt = null;
            template.ExpiresAt = null;
            template.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, "signage.emergency.cancel", template.Id, template.Name);
            await db.SaveChangesAsync(ct);
            await Invalidate(hub, 0, ct);
            return Results.Ok(new { cancelled = true });
        });

        planning.MapDelete("/emergencies/{id:guid}", async (Guid id, LessonCueDb db, CancellationToken ct) =>
        {
            var item = await db.SignageEmergencyTemplates.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            if (item.ActiveSignageId is not null) return Results.Conflict(new { error = "Cancel this active alert before deleting it." });
            db.SignageEmergencyTemplates.Remove(item);
            Audit(db, "signage.emergency-template.delete", item.Id, item.Name);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        operations.MapGet("/operations", async (LessonCueDb db, LiveStreamRelayService streams, CancellationToken ct) =>
        {
            var now = DateTimeOffset.UtcNow;
            var screens = await db.Screens.AsNoTracking().Where(x => !x.Revoked).OrderBy(x => x.Name).ToListAsync(ct);
            var schedules = await db.SignagePlaylists.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);
            var recentProofRecords = (await db.SignageProofRecords.AsNoTracking().OrderByDescending(x => x.Id)
                .Take(100000).ToListAsync(ct)).Where(x => x.StartedAt >= now.AddHours(-24)).ToArray();
            var proofMap = recentProofRecords.GroupBy(x => x.ScreenId).ToDictionary(group => group.Key,
                group => new { Count = group.Count(), LastAt = group.Max(x => x.StartedAt) });
            return Results.Ok(new
            {
                generatedAt = now,
                screens = screens.Select(screen => new
                {
                    screen.Id, screen.Name, screen.Site, screen.TagsCsv, online = screen.LastSeenAt >= now.AddMinutes(-2),
                    screen.LastSeenAt, screen.AppVersion, screen.ManifestVersion, screen.PlaybackState, screen.PlaybackError,
                    screen.NetworkQuality, screen.NetworkLatencyMs, screen.CachedItems, screen.TotalItems,
                    screen.ScreenshotStatus, proofCount = proofMap.GetValueOrDefault(screen.Id)?.Count ?? 0,
                    lastProofAt = proofMap.GetValueOrDefault(screen.Id)?.LastAt
                }),
                schedules = schedules.Select(schedule => new
                {
                    schedule.Id, schedule.Name, schedule.Enabled, schedule.Mode, schedule.Version, schedule.PublishedVersion,
                    schedule.PublishState, schedule.PublishedAt, schedule.LastPushedAt,
                    targets = SignageSchedule.ParseScreenIds(schedule.TargetScreenIdsJson).Count,
                    schedule.WidgetCacheError
                }),
                streams = streams.Status(),
                alerts = screens.Where(screen => screen.PlaybackError is not null || screen.LastSeenAt < now.AddMinutes(-5))
                    .Select(screen => new { screen.Id, screen.Name, severity = screen.LastSeenAt < now.AddMinutes(-5) ? "offline" : "error",
                        message = screen.LastSeenAt < now.AddMinutes(-5) ? "Screen has not checked in for five minutes." : screen.PlaybackError })
                    .Concat(streams.Status().Where(stream => stream.Error is not null || stream.SegmentLatencyMs > 10000)
                        .Select(stream => new { Id = stream.SignageId, Name = $"Stream {stream.ZoneId}", severity = "stream",
                            message = (string?)(stream.Error ?? $"Stream segment is {stream.SegmentLatencyMs} ms old.") }))
            });
        });

        operations.MapPost("/streams/{signageId:guid}/{zoneId}/restart", (Guid signageId, string zoneId,
            LiveStreamRelayService streams) =>
            streams.Restart(signageId, zoneId) ? Results.Accepted() : Results.NotFound());

        operations.MapPut("/screens/{id:guid}/format", async (Guid id, SignageScreenFormatInput input,
            LessonCueDb db, IHubContext<SyncHub> hub, CancellationToken ct) =>
        {
            var screen = await db.Screens.FindAsync([id], ct);
            if (screen is null || screen.Revoked) return Results.NotFound();
            if (input.Width is not null || input.Height is not null)
            {
                if (input.Width is < 240 or > 7680 || input.Height is < 240 or > 7680)
                    return Results.BadRequest(new { error = "Custom signage dimensions must be from 240 to 7,680 pixels." });
                screen.SignageWidth = input.Width;
                screen.SignageHeight = input.Height;
            }
            screen.SignageOrientation = input.Orientation is "landscape" or "portrait" ? input.Orientation : "auto";
            Audit(db, "signage.screen-format.update", screen.Id,
                $"{screen.SignageOrientation}:{screen.SignageWidth}x{screen.SignageHeight}");
            await db.SaveChangesAsync(ct);
            await hub.Clients.Group($"screen:{id}").SendAsync("ManifestInvalidated",
                new { type = "MANIFEST_INVALIDATED" }, ct);
            return Results.Ok(new { screen.Id, screen.SignageOrientation, screen.SignageWidth, screen.SignageHeight });
        });

        operations.MapGet("/proof", async (DateTimeOffset? from, DateTimeOffset? to, Guid? screenId, Guid? signageId,
            LessonCueDb db, CancellationToken ct) =>
        {
            var start = from ?? DateTimeOffset.UtcNow.AddDays(-7);
            var end = to ?? DateTimeOffset.UtcNow;
            var records = (await db.SignageProofRecords.AsNoTracking().OrderByDescending(x => x.Id).Take(100000).ToListAsync(ct))
                .Where(x => x.StartedAt >= start && x.StartedAt <= end);
            if (screenId is { } selectedScreen) records = records.Where(x => x.ScreenId == selectedScreen);
            if (signageId is { } selectedSignage) records = records.Where(x => x.SignageId == selectedSignage);
            return Results.Ok(records.OrderByDescending(x => x.StartedAt).Take(10000).ToArray());
        });

        operations.MapGet("/proof.csv", async (DateTimeOffset? from, DateTimeOffset? to, LessonCueDb db,
            CancellationToken ct) =>
        {
            var start = from ?? DateTimeOffset.UtcNow.AddDays(-7);
            var end = to ?? DateTimeOffset.UtcNow;
            var screens = await db.Screens.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, ct);
            var records = (await db.SignageProofRecords.AsNoTracking().OrderByDescending(x => x.Id).Take(100000).ToListAsync(ct))
                .Where(x => x.StartedAt >= start && x.StartedAt <= end).OrderBy(x => x.StartedAt).Take(50000).ToArray();
            var csv = new StringBuilder("Started,Ended,Duration ms,Screen,Signage,Version,Event,Error\r\n");
            foreach (var record in records)
                csv.Append(Csv(record.StartedAt.ToString("O", CultureInfo.InvariantCulture))).Append(',')
                    .Append(Csv(record.EndedAt?.ToString("O", CultureInfo.InvariantCulture))).Append(',')
                    .Append(record.DurationMs).Append(',').Append(Csv(screens.GetValueOrDefault(record.ScreenId, record.ScreenId.ToString())))
                    .Append(',').Append(Csv(record.SignageName)).Append(',').Append(record.Version).Append(',')
                    .Append(Csv(record.Event)).Append(',').Append(Csv(record.Error)).Append("\r\n");
            return Results.Text(csv.ToString(), "text/csv; charset=utf-8");
        });
    }

    private static async Task<string?> ValidatePlaylistAsync(SignageContentPlaylistInput input, Guid? currentId,
        LessonCueDb db, CancellationToken ct)
    {
        var error = SignageStudio.ValidatePlaylist(input);
        if (error is not null) return error;
        var items = (input.Items ?? []).Select(SignageStudio.NormalizeItem).ToArray();
        var layoutIds = items.Where(x => x.LayoutId is not null).Select(x => x.LayoutId!.Value).Distinct().ToArray();
        if (layoutIds.Length > 0 && await db.SignageLayouts.CountAsync(x => layoutIds.Contains(x.Id), ct) != layoutIds.Length)
            return "One or more selected layouts no longer exists.";
        var mediaIds = items.Where(x => x.MediaAssetId is not null).Select(x => x.MediaAssetId!.Value).Distinct().ToArray();
        if (mediaIds.Length > 0 && await db.MediaAssets.CountAsync(x => mediaIds.Contains(x.Id), ct) != mediaIds.Length)
            return "One or more selected media items no longer exists.";
        var nestedIds = items.Where(x => x.NestedPlaylistId is not null).Select(x => x.NestedPlaylistId!.Value).Distinct().ToArray();
        if (currentId is { } id && nestedIds.Contains(id)) return "A playlist cannot contain itself.";
        if (nestedIds.Length > 0 && await db.SignageContentPlaylists.CountAsync(x => nestedIds.Contains(x.Id), ct) != nestedIds.Length)
            return "One or more nested playlists no longer exists.";
        return null;
    }

    private static string? ValidateEmergency(SignageEmergencyTemplateInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "Alert type name is required.";
        if ((input.Message?.Trim().Length ?? 0) > 2000) return "Alert message must be 2,000 characters or fewer.";
        if (input.DefaultDurationMinutes is < 1 or > 1440) return "Default duration must be from 1 minute to 24 hours.";
        if (!Color(input.BackgroundColor) || !Color(input.TextColor)) return "Alert colors must use six-digit hex values.";
        return null;
    }

    private static void ApplyEmergency(SignageEmergencyTemplate item, SignageEmergencyTemplateInput input)
    {
        item.Name = input.Name.Trim();
        item.Severity = input.Severity is "info" or "warning" or "critical" ? input.Severity : "urgent";
        item.Message = input.Message?.Trim() ?? "";
        item.BackgroundColor = input.BackgroundColor!;
        item.TextColor = input.TextColor!;
        item.MediaAssetId = input.MediaAssetId;
        item.TargetTagsCsv = input.TargetTagsCsv?.Trim() ?? "";
        item.DefaultDurationMinutes = Math.Clamp(input.DefaultDurationMinutes, 1, 1440);
        item.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static bool Color(string? value) => value is { Length: 7 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit);
    private static DateTimeOffset SeriesBoundary(DateOnly date, int minutes, string timeZoneId)
    {
        TimeZoneInfo zone;
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId); }
        catch { zone = TimeZoneInfo.Local; }
        var local = date.ToDateTime(TimeOnly.MinValue).AddMinutes(minutes);
        if (zone.IsInvalidTime(local)) local = local.AddHours(1);
        return new DateTimeOffset(local, zone.GetUtcOffset(local));
    }
    private static void PublishSeriesMutation(SignagePlaylist schedule)
    {
        schedule.Version++;
        schedule.PublishedVersion = schedule.Version;
        schedule.PublishState = "published";
        schedule.PublishedAt = DateTimeOffset.UtcNow;
        schedule.LastPushedAt = DateTimeOffset.UtcNow;
        schedule.UpdatedAt = DateTimeOffset.UtcNow;
    }
    private static string Csv(string? value) => $"\"{(value ?? "").Replace("\"", "\"\"")}\"";
    private static void Audit(LessonCueDb db, string action, Guid id, string? summary) =>
        db.AuditEvents.Add(new AuditEvent { Actor = "admin", Action = action, Object = id.ToString(), Summary = summary });
    private static Task Invalidate(IHubContext<SyncHub> hub, int version, CancellationToken ct) =>
        hub.Clients.All.SendAsync("ManifestInvalidated", new { type = "MANIFEST_INVALIDATED", manifestVersion = version }, ct);
}
