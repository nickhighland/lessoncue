using System.Collections.Concurrent;
using System.Text.Json;
using LessonCue.Server.Activities.Types;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server.Activities;

public sealed class ActivityService(
    LessonCueDb db,
    IActivityRandomSource random,
    IHubContext<ActivityHub> hub)
{
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> RunLocks = new();

    public static object CreateDefaultConfig(string type) => type switch
    {
        ActivityTypes.Wheel => WheelActivity.CreateDefaultConfig(),
        ActivityTypes.Picker => PickerActivity.CreateDefaultConfig(),
        ActivityTypes.Scoreboard => ScoreboardActivity.CreateDefaultConfig(),
        ActivityTypes.Countdown => CountdownActivity.CreateDefaultConfig(),
        ActivityTypes.PrizeGrid => PrizeGridActivity.CreateDefaultConfig(),
        ActivityTypes.Trivia => TriviaActivity.CreateDefaultConfig(),
        ActivityTypes.SurveyBoard => SurveyBoardActivity.CreateDefaultConfig(),
        ActivityTypes.ImageReveal => ImageRevealActivity.CreateDefaultConfig(),
        ActivityTypes.ImageShuffle => ImageShuffleActivity.CreateDefaultConfig(),
        ActivityTypes.Poll => AudienceActivities.Poll.CreateDefaultConfig(),
        ActivityTypes.Ranking => AudienceActivities.Ranking.CreateDefaultConfig(),
        ActivityTypes.Responses => AudienceActivities.Responses.CreateDefaultConfig(),
        ActivityTypes.RapidFire => RapidFireActivity.CreateDefaultConfig(),
        ActivityTypes.EmojiPrompt => EmojiPromptActivity.CreateDefaultConfig(),
        ActivityTypes.RankIt => RankItActivity.CreateDefaultConfig(),
        ActivityTypes.WordScramble => WordScrambleActivity.CreateDefaultConfig(),
        ActivityTypes.Prediction => PredictionActivity.CreateDefaultConfig(),
        ActivityTypes.Buzzer or ActivityTypes.Punchline or ActivityTypes.FakeOut or ActivityTypes.Drawing or ActivityTypes.Ordering or ActivityTypes.Word or ActivityTypes.MatchPlayer or ActivityTypes.StageChallenge or ActivityTypes.Bracket or ActivityTypes.PhysicalRoom or ActivityTypes.Utility => InteractiveActivityDefaults.CreateDefaultConfig(type),
        _ => new { }
    };

    public static object CreateInitialState(string type, string configJson) => type switch
    {
        ActivityTypes.Wheel => WheelActivity.CreateInitialState(configJson),
        ActivityTypes.Picker => PickerActivity.CreateInitialState(configJson),
        ActivityTypes.Scoreboard => ScoreboardActivity.CreateInitialState(configJson),
        ActivityTypes.Countdown => CountdownActivity.CreateInitialState(configJson),
        ActivityTypes.PrizeGrid => PrizeGridActivity.CreateInitialState(configJson),
        ActivityTypes.Trivia => TriviaActivity.CreateInitialState(configJson),
        ActivityTypes.SurveyBoard => SurveyBoardActivity.CreateInitialState(configJson),
        ActivityTypes.ImageReveal => ImageRevealActivity.CreateInitialState(configJson),
        ActivityTypes.ImageShuffle => ImageShuffleActivity.CreateInitialState(configJson),
        ActivityTypes.Poll => AudienceActivities.Poll.CreateInitialState(configJson),
        ActivityTypes.Ranking => AudienceActivities.Ranking.CreateInitialState(configJson),
        ActivityTypes.Responses => AudienceActivities.Responses.CreateInitialState(configJson),
        ActivityTypes.RapidFire => RapidFireActivity.CreateInitialState(configJson),
        ActivityTypes.EmojiPrompt => EmojiPromptActivity.CreateInitialState(configJson),
        ActivityTypes.RankIt => RankItActivity.CreateInitialState(configJson),
        ActivityTypes.WordScramble => WordScrambleActivity.CreateInitialState(configJson),
        ActivityTypes.Prediction => PredictionActivity.CreateInitialState(configJson),
        ActivityTypes.Buzzer or ActivityTypes.Punchline or ActivityTypes.FakeOut or ActivityTypes.Drawing or ActivityTypes.Ordering or ActivityTypes.Word or ActivityTypes.MatchPlayer or ActivityTypes.StageChallenge or ActivityTypes.Utility => new { phase = ActivityPhases.Lobby, actionNonce = 0L },
        _ => new { }
    };

    public (bool Success, string? Error, object NewState) ReduceState(
        string type,
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload) => type switch
    {
        ActivityTypes.Wheel => WheelActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.Picker => PickerActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.Scoreboard => ScoreboardActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.Countdown => CountdownActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.PrizeGrid => PrizeGridActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.Trivia => TriviaActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.SurveyBoard => SurveyBoardActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.ImageReveal => ImageRevealActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.ImageShuffle => ImageShuffleActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.Poll => AudienceActivities.Poll.Reduce(configJson, stateJson, action, payload),
        ActivityTypes.Ranking => AudienceActivities.Ranking.Reduce(configJson, stateJson, action, payload),
        ActivityTypes.Responses => AudienceActivities.Responses.Reduce(configJson, stateJson, action, payload),
        ActivityTypes.RapidFire => RapidFireActivity.Reduce(configJson, stateJson, action, payload, random),
        ActivityTypes.EmojiPrompt => EmojiPromptActivity.Reduce(configJson, stateJson, action, payload),
        ActivityTypes.RankIt => RankItActivity.Reduce(configJson, stateJson, action, payload),
        ActivityTypes.WordScramble => WordScrambleActivity.Reduce(configJson, stateJson, action, payload),
        ActivityTypes.Prediction => PredictionActivity.Reduce(configJson, stateJson, action, payload),
        _ => (false, $"Unsupported activity type '{type}'.", new { })
    };

    public async Task<List<ActivityDefinition>> ListDefinitionsAsync(
        string? type = null,
        string? search = null,
        bool includeArchived = false,
        CancellationToken ct = default)
    {
        var query = db.ActivityDefinitions
            .Include(x => x.Assets)
            .Include(x => x.ThumbnailMedia)
            .AsNoTracking();

        if (!includeArchived)
        {
            query = query.Where(x => x.ArchivedAt == null);
        }

        if (!string.IsNullOrWhiteSpace(type))
        {
            query = query.Where(x => x.Type == type);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(term) || x.Description.ToLower().Contains(term));
        }

        var list = await query.ToListAsync(ct);
        return list
            .OrderBy(x => x.LibraryPosition)
            .ThenByDescending(x => x.UpdatedAt)
            .ThenBy(x => x.Name)
            .ToList();
    }

    public async Task<ActivityDefinition?> GetDefinitionAsync(Guid id, CancellationToken ct = default)
    {
        return await db.ActivityDefinitions
            .Include(x => x.Assets).ThenInclude(a => a.Media)
            .Include(x => x.ThumbnailMedia)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
    }

    public async Task<ActivityDefinition> CreateDefinitionAsync(
        ActivityDefinitionInput input,
        string createdBy,
        CancellationToken ct = default)
    {
        var configJson = input.Config.HasValue
            ? input.Config.Value.GetRawText()
            : JsonSerializer.Serialize(CreateDefaultConfig(input.Type), ActivityJsonDefaults.Options);

        var themeJson = input.Theme.HasValue
            ? input.Theme.Value.GetRawText()
            : "{}";

        var nextLibraryPosition = (await db.ActivityDefinitions
            .Select(x => (int?)x.LibraryPosition)
            .MaxAsync(ct) ?? -1) + 1;

        var definition = new ActivityDefinition
        {
            Id = Guid.NewGuid(),
            Name = input.Name.Trim(),
            Type = input.Type,
            EngineType = ActivityEngineCatalog.EngineFor(input.Type, input.EngineType),
            PresetType = ActivityEngineCatalog.PresetFor(input.Type, input.PresetType),
            SchemaVersion = Math.Max(1, input.SchemaVersion ?? 1),
            Description = input.Description?.Trim() ?? "",
            ConfigJson = configJson,
            ThemeJson = themeJson,
            SettingsJson = input.Settings?.GetRawText() ?? "{}",
            ModifiersJson = input.Modifiers?.GetRawText() ?? "{}",
            PresentationJson = input.Presentation?.GetRawText() ?? "{}",
            ThumbnailMediaId = input.ThumbnailMediaId,
            CreatedBy = createdBy,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            LibraryPosition = nextLibraryPosition,
            Version = 1
        };

        if (input.Assets != null)
        {
            foreach (var assetInput in input.Assets)
            {
                definition.Assets.Add(new ActivityAsset
                {
                    ActivityDefinitionId = definition.Id,
                    MediaId = assetInput.MediaId,
                    Role = assetInput.Role,
                    Position = assetInput.Position,
                    MetadataJson = assetInput.Metadata?.GetRawText() ?? "{}"
                });
            }
        }

        db.ActivityDefinitions.Add(definition);
        await db.SaveChangesAsync(ct);
        return definition;
    }

    public async Task<ActivityDefinition?> UpdateDefinitionAsync(
        Guid id,
        ActivityDefinitionInput input,
        CancellationToken ct = default)
    {
        var definition = await db.ActivityDefinitions
            .Include(x => x.Assets)
            .SingleOrDefaultAsync(x => x.Id == id, ct);

        if (definition is null) return null;

        definition.Name = input.Name.Trim();
        definition.Description = input.Description?.Trim() ?? "";
        if (input.Config.HasValue)
        {
            definition.ConfigJson = input.Config.Value.GetRawText();
        }
        if (!string.IsNullOrWhiteSpace(input.EngineType)) definition.EngineType = input.EngineType.Trim();
        if (!string.IsNullOrWhiteSpace(input.PresetType)) definition.PresetType = input.PresetType.Trim();
        if (input.SchemaVersion.HasValue) definition.SchemaVersion = Math.Max(1, input.SchemaVersion.Value);
        if (input.Settings.HasValue) definition.SettingsJson = input.Settings.Value.GetRawText();
        if (input.Modifiers.HasValue) definition.ModifiersJson = input.Modifiers.Value.GetRawText();
        if (input.Presentation.HasValue) definition.PresentationJson = input.Presentation.Value.GetRawText();
        if (input.Theme.HasValue)
        {
            definition.ThemeJson = input.Theme.Value.GetRawText();
        }
        definition.ThumbnailMediaId = input.ThumbnailMediaId;
        definition.UpdatedAt = DateTimeOffset.UtcNow;
        definition.Version++;

        if (input.Assets != null)
        {
            db.ActivityAssets.RemoveRange(definition.Assets);
            definition.Assets.Clear();
            foreach (var assetInput in input.Assets)
            {
                definition.Assets.Add(new ActivityAsset
                {
                    ActivityDefinitionId = definition.Id,
                    MediaId = assetInput.MediaId,
                    Role = assetInput.Role,
                    Position = assetInput.Position,
                    MetadataJson = assetInput.Metadata?.GetRawText() ?? "{}"
                });
            }
        }

        await db.SaveChangesAsync(ct);
        return definition;
    }

    public async Task<ActivityDefinition?> DuplicateDefinitionAsync(
        Guid id,
        string? newName,
        string createdBy,
        CancellationToken ct = default)
    {
        var source = await db.ActivityDefinitions
            .Include(x => x.Assets)
            .SingleOrDefaultAsync(x => x.Id == id, ct);

        if (source is null) return null;

        var name = !string.IsNullOrWhiteSpace(newName)
            ? newName.Trim()
            : $"{source.Name} (Copy)";

        var nextLibraryPosition = (await db.ActivityDefinitions
            .Select(x => (int?)x.LibraryPosition)
            .MaxAsync(ct) ?? -1) + 1;

        var copy = new ActivityDefinition
        {
            Id = Guid.NewGuid(),
            Name = name,
            Type = source.Type,
            EngineType = source.EngineType,
            PresetType = source.PresetType,
            SchemaVersion = source.SchemaVersion,
            Description = source.Description,
            ConfigJson = source.ConfigJson,
            ThemeJson = source.ThemeJson,
            SettingsJson = source.SettingsJson,
            ModifiersJson = source.ModifiersJson,
            PresentationJson = source.PresentationJson,
            ThumbnailMediaId = source.ThumbnailMediaId,
            CreatedBy = createdBy,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            LibraryPosition = nextLibraryPosition,
            Version = 1
        };

        foreach (var asset in source.Assets)
        {
            copy.Assets.Add(new ActivityAsset
            {
                ActivityDefinitionId = copy.Id,
                MediaId = asset.MediaId,
                Role = asset.Role,
                Position = asset.Position,
                MetadataJson = asset.MetadataJson
            });
        }

        db.ActivityDefinitions.Add(copy);
        await db.SaveChangesAsync(ct);
        return copy;
    }

    public async Task<bool> DeleteOrArchiveDefinitionAsync(Guid id, CancellationToken ct = default)
    {
        var result = await DeleteOrArchiveDefinitionsAsync([id], ct);
        return result.DeletedIds.Contains(id) || result.ArchivedIds.Contains(id);
    }

    public async Task<ActivityBulkMutationResult> DeleteOrArchiveDefinitionsAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct = default)
    {
        var requested = ids.Where(id => id != Guid.Empty).Distinct().Take(500).ToArray();
        if (requested.Length == 0) return new ActivityBulkMutationResult([], [], []);

        var definitions = await db.ActivityDefinitions
            .Where(x => requested.Contains(x.Id) && x.ArchivedAt == null)
            .ToListAsync(ct);
        var knownIds = definitions.Select(x => x.Id).ToHashSet();
        var missingIds = requested.Where(id => !knownIds.Contains(id)).ToArray();

        var playlistReferences = await db.PlaylistItems
            .Where(x => x.ActivityDefinitionId.HasValue && requested.Contains(x.ActivityDefinitionId.Value))
            .Select(x => x.ActivityDefinitionId!.Value)
            .Distinct()
            .ToListAsync(ct);
        var templateReferences = await db.LessonTemplateItems
            .Where(x => x.ActivityDefinitionId.HasValue && requested.Contains(x.ActivityDefinitionId.Value))
            .Select(x => x.ActivityDefinitionId!.Value)
            .Distinct()
            .ToListAsync(ct);
        var runReferences = await db.ActivityRuns
            .Where(x => requested.Contains(x.ActivityDefinitionId))
            .Select(x => x.ActivityDefinitionId)
            .Distinct()
            .ToListAsync(ct);
        var referencedIds = playlistReferences
            .Concat(templateReferences)
            .Concat(runReferences)
            .ToHashSet();

        var deletedIds = new List<Guid>();
        var archivedIds = new List<Guid>();
        var now = DateTimeOffset.UtcNow;
        foreach (var definition in definitions)
        {
            if (referencedIds.Contains(definition.Id))
            {
                // Preserve lesson references and historical runs. The library
                // calls this delete, but the safe result is an archived item.
                definition.ArchivedAt = now;
                definition.UpdatedAt = now;
                archivedIds.Add(definition.Id);
            }
            else
            {
                db.ActivityDefinitions.Remove(definition);
                deletedIds.Add(definition.Id);
            }
        }

        await db.SaveChangesAsync(ct);
        return new ActivityBulkMutationResult(deletedIds, archivedIds, missingIds);
    }

    public async Task<bool> RestoreDefinitionAsync(Guid id, CancellationToken ct = default)
    {
        var definition = await db.ActivityDefinitions.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (definition is null || definition.ArchivedAt is null) return false;
        definition.ArchivedAt = null;
        definition.UpdatedAt = DateTimeOffset.UtcNow;
        definition.Version++;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> ReorderDefinitionsAsync(
        IReadOnlyList<Guid> requestedOrder,
        CancellationToken ct = default)
    {
        if (requestedOrder.Count > 500) return false;

        var active = await db.ActivityDefinitions
            .Where(x => x.ArchivedAt == null)
            .OrderBy(x => x.LibraryPosition)
            .ThenBy(x => x.Name)
            .ToListAsync(ct);
        var byId = active.ToDictionary(x => x.Id);
        var orderedIds = requestedOrder
            .Where(id => byId.ContainsKey(id))
            .Distinct()
            .Concat(active.Where(x => !requestedOrder.Contains(x.Id)).Select(x => x.Id))
            .ToArray();

        for (var index = 0; index < orderedIds.Length; index++)
        {
            byId[orderedIds[index]].LibraryPosition = index;
        }

        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<ActivityRun> GetOrCreateRunAsync(
        Guid definitionId,
        Guid? lessonId = null,
        Guid? lessonItemId = null,
        string? scope = null,
        CancellationToken ct = default)
    {
        var definition = await db.ActivityDefinitions.SingleOrDefaultAsync(x => x.Id == definitionId, ct)
            ?? throw new InvalidOperationException($"Activity definition '{definitionId}' does not exist.");

        var query = db.ActivityRuns.Include(x => x.ActivityDefinition).AsQueryable();
        if (lessonItemId.HasValue)
        {
            query = query.Where(x => x.LessonItemId == lessonItemId.Value);
        }
        else if (lessonId.HasValue)
        {
            query = query.Where(x => x.LessonId == lessonId.Value && x.ActivityDefinitionId == definitionId);
        }
        else
        {
            query = query.Where(x => x.ActivityDefinitionId == definitionId && x.LessonId == null);
        }

        var existingRuns = await query.ToListAsync(ct);
        var run = existingRuns.OrderByDescending(x => x.UpdatedAt).FirstOrDefault();
        if (run != null) return run;

        var initialState = ActivityEngineCatalog.IsInteractive(definition)
            ? InteractiveActivityDefaults.CreateInitialState(definition)
            : CreateInitialState(definition.Type, definition.ConfigJson);
        var initialStateJson = JsonSerializer.Serialize(initialState, ActivityJsonDefaults.Options);

        run = new ActivityRun
        {
            Id = Guid.NewGuid(),
            ActivityDefinitionId = definitionId,
            ActivityDefinition = definition,
            LessonId = lessonId,
            LessonItemId = lessonItemId,
            Scope = scope,
            Status = ActivityRunStatuses.Prepared,
            StateJson = initialStateJson,
            DefinitionSnapshotJson = JsonSerializer.Serialize(new
            {
                definition.Id,
                definition.Name,
                definition.Type,
                definition.EngineType,
                definition.PresetType,
                definition.SchemaVersion,
                definition.Description,
                definition.ConfigJson,
                definition.ThemeJson,
                definition.SettingsJson,
                definition.ModifiersJson,
                definition.PresentationJson,
                definition.Version
            }, ActivityJsonDefaults.Options),
            Revision = 1,
            StartedAt = null,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.ActivityRuns.Add(run);
        await db.SaveChangesAsync(ct);
        return run;
    }

    public async Task<ActivityRun?> GetRunAsync(Guid runId, CancellationToken ct = default)
    {
        return await db.ActivityRuns
            .Include(x => x.ActivityDefinition)
            .SingleOrDefaultAsync(x => x.Id == runId, ct);
    }

    public async Task<ActivityCommandResult> ExecuteCommandAsync(
        Guid runId,
        ActivityCommandEnvelope command,
        CancellationToken ct = default)
    {
        var gate = RunLocks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await db.ActivityRuns
                .Include(x => x.ActivityDefinition)
                .SingleOrDefaultAsync(x => x.Id == runId, ct);

            if (run is null || run.ActivityDefinition is null)
            {
                return new ActivityCommandResult(false, "Activity run not found.", 0, "", null, DateTimeOffset.UtcNow);
            }

            // Only enforce revision check if expectedRevision is explicitly provided and > 0
            if (command.ExpectedRevision.HasValue && command.ExpectedRevision.Value > 0 && command.ExpectedRevision.Value != run.Revision)
            {
                var parsedCurrent = JsonSerializer.Deserialize<object>(run.StateJson, ActivityJsonDefaults.Options);
                return new ActivityCommandResult(
                    false,
                    $"Revision mismatch. Server revision is {run.Revision}, expected {command.ExpectedRevision.Value}.",
                    run.Revision,
                    run.Status,
                    parsedCurrent,
                    DateTimeOffset.UtcNow
                );
            }

            var (success, error, newState) = ReduceState(
                run.ActivityDefinition.Type,
                run.ActivityDefinition.ConfigJson,
                run.StateJson,
                command.Action,
                command.Payload
            );

            if (!success)
            {
                var currentParsed = JsonSerializer.Deserialize<object>(run.StateJson, ActivityJsonDefaults.Options);
                return new ActivityCommandResult(false, error, run.Revision, run.Status, currentParsed, DateTimeOffset.UtcNow);
            }

            run.StateJson = JsonSerializer.Serialize(newState, ActivityJsonDefaults.Options);
            run.Revision++;
            run.UpdatedAt = DateTimeOffset.UtcNow;
            if (run.Status == ActivityRunStatuses.Prepared)
            {
                run.Status = ActivityRunStatuses.Live;
                run.StartedAt = DateTimeOffset.UtcNow;
            }

            await db.SaveChangesAsync(ct);

            var theme = !string.IsNullOrWhiteSpace(run.ActivityDefinition.ThemeJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ThemeJson, ActivityJsonDefaults.Options)
                : null;
            var config = !string.IsNullOrWhiteSpace(run.ActivityDefinition.ConfigJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ConfigJson, ActivityJsonDefaults.Options)
                : null;

            var envelope = new ActivityStateEnvelope(
                RunId: run.Id,
                DefinitionId: run.ActivityDefinitionId,
                Type: run.ActivityDefinition.Type,
                Revision: run.Revision,
                Status: run.Status,
                State: newState,
                ServerTime: DateTimeOffset.UtcNow,
                Name: run.ActivityDefinition.Name,
                Theme: theme,
                Config: config
            );

            await BroadcastRunStateAsync(run.Id, envelope);

            return new ActivityCommandResult(true, null, run.Revision, run.Status, newState, DateTimeOffset.UtcNow);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<ActivityRun?> ResetRunAsync(Guid runId, CancellationToken ct = default)
    {
        var gate = RunLocks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await db.ActivityRuns
                .Include(x => x.ActivityDefinition)
                .SingleOrDefaultAsync(x => x.Id == runId, ct);

            if (run is null || run.ActivityDefinition is null) return null;

            var initialState = CreateInitialState(run.ActivityDefinition.Type, run.ActivityDefinition.ConfigJson);
            run.StateJson = JsonSerializer.Serialize(initialState, ActivityJsonDefaults.Options);
            run.Revision++;
            run.Status = ActivityRunStatuses.Prepared;
            run.StartedAt = null;
            run.EndedAt = null;
            run.UpdatedAt = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync(ct);

            var theme = !string.IsNullOrWhiteSpace(run.ActivityDefinition.ThemeJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ThemeJson, ActivityJsonDefaults.Options)
                : null;

            var envelope = new ActivityStateEnvelope(
                RunId: run.Id,
                DefinitionId: run.ActivityDefinitionId,
                Type: run.ActivityDefinition.Type,
                Revision: run.Revision,
                Status: run.Status,
                State: initialState,
                ServerTime: DateTimeOffset.UtcNow,
                Name: run.ActivityDefinition.Name,
                Theme: theme,
                Config: JsonSerializer.Deserialize<object>(run.ActivityDefinition.ConfigJson, ActivityJsonDefaults.Options)
            );

            await BroadcastRunStateAsync(run.Id, envelope);
            return run;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<ActivityRun?> EndRunAsync(Guid runId, CancellationToken ct = default)
    {
        var gate = RunLocks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await db.ActivityRuns
                .Include(x => x.ActivityDefinition)
                .SingleOrDefaultAsync(x => x.Id == runId, ct);

            if (run is null || run.ActivityDefinition is null) return null;

            run.Status = ActivityRunStatuses.Ended;
            run.EndedAt = DateTimeOffset.UtcNow;
            run.Revision++;
            run.UpdatedAt = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync(ct);

            var state = JsonSerializer.Deserialize<object>(run.StateJson, ActivityJsonDefaults.Options);
            var theme = !string.IsNullOrWhiteSpace(run.ActivityDefinition.ThemeJson)
                ? JsonSerializer.Deserialize<object>(run.ActivityDefinition.ThemeJson, ActivityJsonDefaults.Options)
                : null;

            var envelope = new ActivityStateEnvelope(
                RunId: run.Id,
                DefinitionId: run.ActivityDefinitionId,
                Type: run.ActivityDefinition.Type,
                Revision: run.Revision,
                Status: run.Status,
                State: state ?? new { },
                ServerTime: DateTimeOffset.UtcNow,
                Name: run.ActivityDefinition.Name,
                Theme: theme,
                Config: JsonSerializer.Deserialize<object>(run.ActivityDefinition.ConfigJson, ActivityJsonDefaults.Options)
            );

            await BroadcastRunStateAsync(run.Id, envelope);
            return run;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task BroadcastRunStateAsync(Guid runId, ActivityStateEnvelope stateEnvelope)
    {
        await hub.Clients.Group($"run:{runId}").SendAsync("ReceiveState", stateEnvelope);
    }
}
