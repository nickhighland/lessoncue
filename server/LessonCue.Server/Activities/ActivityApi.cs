using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LessonCue.Server.Activities;

public static class ActivityApi
{
    public static void Map(IEndpointRouteBuilder routes)
    {
        var api = routes.MapGroup("/api/v1");

        // Public/Authenticated Display & Studio access for Activity Runs
        api.MapGet("/activity-runs/{id:guid}", async (Guid id, ActivityService service, ActivitySessionService sessions, CancellationToken ct) =>
        {
            var interactive = await sessions.GetDisplayEnvelopeAsync(id, ct);
            if (interactive is not null) return Results.Ok(interactive);
            var run = await service.GetRunAsync(id, ct);
            if (run is null) return Results.NotFound();

            var state = JsonSerializer.Deserialize<object>(run.StateJson, ActivityJsonDefaults.Options);
            var theme = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ThemeJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ThemeJson, ActivityJsonDefaults.Options)
                : null;
            var config = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ConfigJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ConfigJson, ActivityJsonDefaults.Options)
                : null;

            return Results.Ok(new ActivityStateEnvelope(
                RunId: run.Id,
                DefinitionId: run.ActivityDefinitionId,
                Type: run.ActivityDefinition?.Type ?? "",
                Revision: run.Revision,
                Status: run.Status,
                State: state ?? new { },
                ServerTime: DateTimeOffset.UtcNow,
                Name: run.ActivityDefinition?.Name ?? "",
                Theme: theme,
                Config: config
            ));
        });

        // Activity Definitions CRUD
        api.MapGet("/activities", async (
            string? type,
            string? search,
            bool? includeArchived,
            ActivityService service,
            CancellationToken ct) =>
        {
            var definitions = await service.ListDefinitionsAsync(type, search, includeArchived ?? false, ct);
            return Results.Ok(definitions.Select(MapDefinitionSummary));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapGet("/activities/{id:guid}", async (Guid id, ActivityService service, CancellationToken ct) =>
        {
            var definition = await service.GetDefinitionAsync(id, ct);
            if (definition is null) return Results.NotFound();
            return Results.Ok(MapDefinitionDetail(definition));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activities", async (
            ActivityDefinitionInput input,
            ClaimsPrincipal user,
            ActivityService service,
            CancellationToken ct) =>
        {
            var configJson = input.Config.HasValue
                ? input.Config.Value.GetRawText()
                : JsonSerializer.Serialize(ActivityService.CreateDefaultConfig(input.Type), ActivityJsonDefaults.Options);

            var validationError = ActivityValidation.ValidateDefinition(input.Type, input.Name, configJson);
            if (validationError != null)
            {
                return Results.BadRequest(new { error = validationError });
            }

            var username = user.FindFirstValue(ClaimTypes.Name) ?? "admin";
            var created = await service.CreateDefinitionAsync(input, username, ct);
            return Results.Created($"/api/v1/activities/{created.Id}", MapDefinitionDetail(created));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activities/bulk-delete", async (
            ActivityBulkDeleteInput input,
            ActivityService service,
            CancellationToken ct) =>
        {
            if (input.Ids is null || input.Ids.Count == 0 || input.Ids.Count > 500)
                return Results.BadRequest(new { error = "Select between 1 and 500 activities." });
            var result = await service.DeleteOrArchiveDefinitionsAsync(input.Ids, ct);
            return Results.Ok(result);
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activities/bulk-archive", async (
            ActivityBulkDeleteInput input,
            ActivityService service,
            CancellationToken ct) =>
        {
            if (input.Ids is null || input.Ids.Count == 0 || input.Ids.Count > 500)
                return Results.BadRequest(new { error = "Select between 1 and 500 activities." });
            var result = await service.ArchiveDefinitionsAsync(input.Ids, ct);
            return Results.Ok(result);
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activities/bulk-restore", async (
            ActivityBulkDeleteInput input,
            ActivityService service,
            CancellationToken ct) =>
        {
            if (input.Ids is null || input.Ids.Count == 0 || input.Ids.Count > 500)
                return Results.BadRequest(new { error = "Select between 1 and 500 activities." });
            var result = await service.RestoreDefinitionsAsync(input.Ids, ct);
            return Results.Ok(result);
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activities/bulk-duplicate", async (
            ActivityBulkDuplicateInput input,
            ClaimsPrincipal user,
            ActivityService service,
            CancellationToken ct) =>
        {
            if (input.Ids is null || input.Ids.Count == 0 || input.Ids.Count > 500)
                return Results.BadRequest(new { error = "Select between 1 and 500 activities." });
            var username = user.FindFirstValue(ClaimTypes.Name) ?? "admin";
            var copies = await service.DuplicateDefinitionsAsync(input.Ids, input.NameSuffix, username, ct);
            return Results.Ok(copies.Select(MapDefinitionDetail));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPut("/activities/library-order", async (
            ActivityLibraryOrderInput input,
            ActivityService service,
            CancellationToken ct) =>
        {
            if (input.Ids is null || input.Ids.Count > 500)
                return Results.BadRequest(new { error = "The library order cannot contain more than 500 activities." });
            return await service.ReorderDefinitionsAsync(input.Ids, ct)
                ? Results.NoContent()
                : Results.BadRequest(new { error = "The library order could not be saved." });
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPut("/activities/{id:guid}", async (
            Guid id,
            ActivityDefinitionInput input,
            ActivityService service,
            CancellationToken ct) =>
        {
            var configJson = input.Config.HasValue
                ? input.Config.Value.GetRawText()
                : "{}";

            var validationError = ActivityValidation.ValidateDefinition(input.Type, input.Name, configJson);
            if (validationError != null)
            {
                return Results.BadRequest(new { error = validationError });
            }

            var updated = await service.UpdateDefinitionAsync(id, input, ct);
            if (updated is null) return Results.NotFound();
            return Results.Ok(MapDefinitionDetail(updated));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapDelete("/activities/{id:guid}", async (
            Guid id,
            ActivityService service,
            CancellationToken ct) =>
        {
            var success = await service.DeleteOrArchiveDefinitionAsync(id, ct);
            if (!success) return Results.NotFound();
            return Results.NoContent();
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activities/{id:guid}/restore", async (
            Guid id,
            ActivityService service,
            CancellationToken ct) =>
        {
            return await service.RestoreDefinitionAsync(id, ct)
                ? Results.NoContent()
                : Results.NotFound();
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activities/{id:guid}/duplicate", async (
            Guid id,
            ActivityDuplicateInput? input,
            ClaimsPrincipal user,
            ActivityService service,
            CancellationToken ct) =>
        {
            var username = user.FindFirstValue(ClaimTypes.Name) ?? "admin";
            var copy = await service.DuplicateDefinitionAsync(id, input?.Name, username, ct);
            if (copy is null) return Results.NotFound();
            return Results.Created($"/api/v1/activities/{copy.Id}", MapDefinitionDetail(copy));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        // Activity Runs
        api.MapPost("/activity-runs", async (
            ActivityRunCreateInput input,
            ActivityService service,
            ActivitySessionService sessions,
            CancellationToken ct) =>
        {
            var run = await service.GetOrCreateRunAsync(
                input.ActivityDefinitionId,
                input.LessonId,
                input.LessonItemId,
                input.Scope,
                ct);

            run = await sessions.EnsureInteractiveRunAsync(run, ct);

            if (run.ActivityDefinition is not null && ActivityEngineCatalog.IsInteractive(run.ActivityDefinition))
            {
                var interactiveEnvelope = await sessions.GetDisplayEnvelopeAsync(run.Id, ct);
                if (interactiveEnvelope is not null) return Results.Ok(interactiveEnvelope);
            }

            var state = JsonSerializer.Deserialize<object>(run.StateJson, ActivityJsonDefaults.Options);
            var theme = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ThemeJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ThemeJson, ActivityJsonDefaults.Options)
                : null;
            var config = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ConfigJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ConfigJson, ActivityJsonDefaults.Options)
                : null;

            return Results.Ok(new ActivityStateEnvelope(
                RunId: run.Id,
                DefinitionId: run.ActivityDefinitionId,
                Type: run.ActivityDefinition?.Type ?? "",
                Revision: run.Revision,
                Status: run.Status,
                State: state ?? new { },
                ServerTime: DateTimeOffset.UtcNow,
                Name: run.ActivityDefinition?.Name ?? "",
                Theme: theme,
                Config: config
            ));
        });

        api.MapPost("/activity-runs/{id:guid}/command", async (
            Guid id,
            ActivityCommandEnvelope command,
            ActivityService service,
            ActivitySessionService sessions,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(command.Action))
            {
                return Results.BadRequest(new { error = "Action name is required." });
            }

            var run = await service.GetRunAsync(id, ct);
            var result = run?.ActivityDefinition is not null && ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)
                ? await sessions.ExecuteHostActionAsync(id, command, ct)
                : await service.ExecuteCommandAsync(id, command, ct);
            if (!result.Success && result.Error?.Contains("mismatch", StringComparison.OrdinalIgnoreCase) == true)
            {
                return Results.Conflict(result);
            }
            if (!result.Success)
            {
                return Results.BadRequest(result);
            }

            return Results.Ok(result);
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activity-runs/{id:guid}/reset", async (
            Guid id,
            ActivityService service,
            ActivitySessionService sessions,
            CancellationToken ct) =>
        {
            var existing = await service.GetRunAsync(id, ct);
            var run = existing?.ActivityDefinition is not null && ActivityEngineCatalog.IsInteractive(existing.ActivityDefinition)
                ? await sessions.ResetAsync(id, ct)
                : await service.ResetRunAsync(id, ct);
            if (run is null) return Results.NotFound();

            if (run.ActivityDefinition is not null && ActivityEngineCatalog.IsInteractive(run.ActivityDefinition))
            {
                var interactiveEnvelope = await sessions.GetDisplayEnvelopeAsync(run.Id, ct);
                if (interactiveEnvelope is not null) return Results.Ok(interactiveEnvelope);
            }

            var state = JsonSerializer.Deserialize<object>(run.StateJson, ActivityJsonDefaults.Options);
            var theme = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ThemeJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ThemeJson, ActivityJsonDefaults.Options)
                : null;
            var config = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ConfigJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ConfigJson, ActivityJsonDefaults.Options)
                : null;

            return Results.Ok(new ActivityStateEnvelope(
                RunId: run.Id,
                DefinitionId: run.ActivityDefinitionId,
                Type: run.ActivityDefinition?.Type ?? "",
                Revision: run.Revision,
                Status: run.Status,
                State: state ?? new { },
                ServerTime: DateTimeOffset.UtcNow,
                Name: run.ActivityDefinition?.Name ?? "",
                Theme: theme,
                Config: config
            ));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        api.MapPost("/activity-runs/{id:guid}/end", async (
            Guid id,
            ActivityService service,
            ActivitySessionService sessions,
            CancellationToken ct) =>
        {
            var existing = await service.GetRunAsync(id, ct);
            var run = existing?.ActivityDefinition is not null && ActivityEngineCatalog.IsInteractive(existing.ActivityDefinition)
                ? await sessions.EndAsync(id, ct)
                : await service.EndRunAsync(id, ct);
            if (run is null) return Results.NotFound();

            if (run.ActivityDefinition is not null && ActivityEngineCatalog.IsInteractive(run.ActivityDefinition))
            {
                var interactiveEnvelope = await sessions.GetDisplayEnvelopeAsync(run.Id, ct);
                if (interactiveEnvelope is not null) return Results.Ok(interactiveEnvelope);
            }

            var state = JsonSerializer.Deserialize<object>(run.StateJson, ActivityJsonDefaults.Options);
            var theme = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ThemeJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ThemeJson, ActivityJsonDefaults.Options)
                : null;
            var config = !string.IsNullOrWhiteSpace(run.ActivityDefinition?.ConfigJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ConfigJson, ActivityJsonDefaults.Options)
                : null;

            return Results.Ok(new ActivityStateEnvelope(
                RunId: run.Id,
                DefinitionId: run.ActivityDefinitionId,
                Type: run.ActivityDefinition?.Type ?? "",
                Revision: run.Revision,
                Status: run.Status,
                State: state ?? new { },
                ServerTime: DateTimeOffset.UtcNow,
                Name: run.ActivityDefinition?.Name ?? "",
                Theme: theme,
                Config: config
            ));
        }).RequireAuthorization(LessonCuePermissions.Planning);

        // Phone participation stays anonymous and session-scoped. Host state and
        // team management are protected below; display state is public by run ID.
        var publicSessions = api.MapGroup("/activity-sessions");
        publicSessions.MapGet("/join/{code}", async (string code, ActivitySessionService sessions, CancellationToken ct) =>
        {
            var run = await sessions.FindByJoinCodeAsync(code, ct);
            if (run is null) return Results.NotFound(new { error = "That game code was not found." });
            var view = await sessions.GetPublicViewAsync(run.Id, ct);
            return view is null ? Results.NotFound() : Results.Ok(view);
        }).RequireRateLimiting("activity-public");

        publicSessions.MapPost("/join/{code}", async (string code, ActivityParticipantJoinInput input, ActivitySessionService sessions, CancellationToken ct) =>
        {
            var joined = await sessions.JoinAsync(code, input, ct);
            if (joined.Participant is null || joined.Run is null) return Results.Conflict(new { error = joined.Error ?? "Could not join this game." });
            var state = await sessions.GetParticipantViewAsync(joined.Run.Id, joined.Token, ct);
            return state is null ? Results.Conflict(new { error = "The game session could not be restored." }) : Results.Ok(new { token = joined.Token, participant = state });
        }).RequireRateLimiting("activity-submit");

        publicSessions.MapGet("/{id:guid}/participant-state", async (Guid id, string? participantToken, ActivitySessionService sessions, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(participantToken)) return Results.BadRequest(new { error = "Participant token is required." });
            var view = await sessions.GetParticipantViewAsync(id, participantToken, ct);
            return view is null ? Results.NotFound(new { error = "Participant session not found." }) : Results.Ok(view);
        }).RequireRateLimiting("activity-public");

        publicSessions.MapPost("/{id:guid}/participant-action", async (Guid id, ActivityParticipantActionInput input, ActivitySessionService sessions, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.ParticipantToken) || string.IsNullOrWhiteSpace(input.Action)) return Results.BadRequest(new { error = "Participant token and action are required." });
            var result = await sessions.ExecuteParticipantActionAsync(id, input, ct);
            if (!result.Success) return Results.BadRequest(result);
            return Results.Ok(result);
        }).RequireRateLimiting("activity-submit");

        var hostSessions = api.MapGroup("/activity-sessions").RequireAuthorization(LessonCuePermissions.Planning);
        hostSessions.MapGet("/{id:guid}/host-state", async (Guid id, ActivitySessionService sessions, CancellationToken ct) =>
        {
            var view = await sessions.GetHostViewAsync(id, ct);
            return view is null ? Results.NotFound() : Results.Ok(view);
        });
        hostSessions.MapPut("/{id:guid}/teams", async (Guid id, List<ActivityTeamInput> input, ActivitySessionService sessions, CancellationToken ct) =>
        {
            if (input.Count > 12) return Results.BadRequest(new { error = "A game can have at most 12 teams." });
            return await sessions.SetTeamsAsync(id, input, ct) ? Results.NoContent() : Results.NotFound();
        });
        hostSessions.MapPut("/{id:guid}/teams/{teamId:guid}", async (Guid id, Guid teamId, ActivityTeamRenameInput input, ActivitySessionService sessions, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "Team name is required." });
            return await sessions.RenameTeamAsync(id, teamId, input.Name, ct) ? Results.NoContent() : Results.BadRequest(new { error = "Team not found or name is invalid." });
        });
        hostSessions.MapPost("/{id:guid}/participants/team", async (Guid id, ActivityParticipantTeamInput input, ActivitySessionService sessions, CancellationToken ct) =>
        {
            return await sessions.AssignParticipantAsync(id, input.ParticipantId, input.TeamId, ct) ? Results.NoContent() : Results.BadRequest(new { error = "Participant or team not found." });
        });
    }

    private static object MapDefinitionSummary(ActivityDefinition item)
    {
        var config = JsonSerializer.Deserialize<object>(item.ConfigJson, ActivityJsonDefaults.Options);
        var theme = !string.IsNullOrWhiteSpace(item.ThemeJson)
            ? JsonSerializer.Deserialize<object>(item.ThemeJson, ActivityJsonDefaults.Options)
            : null;

        return new
        {
            item.Id,
            item.Name,
            item.Type,
            item.EngineType,
            item.PresetType,
            item.SchemaVersion,
            item.Description,
            Config = config,
            Theme = theme,
            Settings = JsonSerializer.Deserialize<object>(item.SettingsJson, ActivityJsonDefaults.Options),
            Modifiers = JsonSerializer.Deserialize<object>(item.ModifiersJson, ActivityJsonDefaults.Options),
            Presentation = JsonSerializer.Deserialize<object>(item.PresentationJson, ActivityJsonDefaults.Options),
            item.ThumbnailMediaId,
            ThumbnailUrl = item.ThumbnailMediaId.HasValue ? $"/api/v1/media/{item.ThumbnailMediaId.Value}/playback" : null,
            item.CreatedBy,
            item.CreatedAt,
            item.UpdatedAt,
            item.ArchivedAt,
            item.LibraryPosition,
            item.Version,
            AssetCount = item.Assets.Count,
            Usage = item.Usage
        };
    }

    private static object MapDefinitionDetail(ActivityDefinition item)
    {
        var config = JsonSerializer.Deserialize<object>(item.ConfigJson, ActivityJsonDefaults.Options);
        var theme = !string.IsNullOrWhiteSpace(item.ThemeJson)
            ? JsonSerializer.Deserialize<object>(item.ThemeJson, ActivityJsonDefaults.Options)
            : null;

        return new
        {
            item.Id,
            item.Name,
            item.Type,
            item.EngineType,
            item.PresetType,
            item.SchemaVersion,
            item.Description,
            Config = config,
            Theme = theme,
            Settings = JsonSerializer.Deserialize<object>(item.SettingsJson, ActivityJsonDefaults.Options),
            Modifiers = JsonSerializer.Deserialize<object>(item.ModifiersJson, ActivityJsonDefaults.Options),
            Presentation = JsonSerializer.Deserialize<object>(item.PresentationJson, ActivityJsonDefaults.Options),
            item.ThumbnailMediaId,
            ThumbnailUrl = item.ThumbnailMediaId.HasValue ? $"/api/v1/media/{item.ThumbnailMediaId.Value}/playback" : null,
            item.CreatedBy,
            item.CreatedAt,
            item.UpdatedAt,
            item.ArchivedAt,
            item.LibraryPosition,
            item.Version,
            Usage = item.Usage,
            Assets = item.Assets.OrderBy(a => a.Position).Select(a => new
            {
                a.Id,
                a.MediaId,
                a.Role,
                a.Position,
                Metadata = JsonSerializer.Deserialize<object>(a.MetadataJson, ActivityJsonDefaults.Options),
                Media = a.Media != null ? new
                {
                    a.Media.Id,
                    a.Media.FileName,
                    a.Media.ContentType,
                    PlaybackUrl = $"/api/v1/media/{a.Media.Id}/playback",
                    ThumbnailUrl = a.Media.ThumbnailPath != null ? $"/api/v1/media/{a.Media.Id}/thumbnail" : null
                } : null
            }).ToArray()
        };
    }
}
