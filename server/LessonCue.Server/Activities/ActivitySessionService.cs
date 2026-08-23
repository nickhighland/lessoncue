using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server.Activities;

/// <summary>
/// Shared live-session infrastructure for phone-enabled activities. The older
/// ActivityService remains responsible for legacy reducers; this service owns
/// only the reusable participant/session concerns and the first interactive
/// engines.
/// </summary>
public sealed class ActivitySessionService(
    LessonCueDb db,
    IHubContext<ActivityHub> hub,
    IActivityRandomSource random,
    ActivityJoinAddressService joinAddress)
{
    private const string CodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Locks = new();

    public async Task<ActivityRun> EnsureInteractiveRunAsync(ActivityRun run, CancellationToken ct = default)
    {
        if (run.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)) return run;

        var gate = Locks.GetOrAdd(run.Id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var current = await db.ActivityRuns.Include(x => x.ActivityDefinition)
                .SingleOrDefaultAsync(x => x.Id == run.Id, ct);
            if (current?.ActivityDefinition is null) return run;

            var changed = false;
            if (string.IsNullOrWhiteSpace(current.DefinitionSnapshotJson) || current.DefinitionSnapshotJson == "{}")
            {
                current.DefinitionSnapshotJson = Snapshot(current.ActivityDefinition);
                changed = true;
            }

            if (await AttachSessionGroupAsync(current, ct)) changed = true;

            var state = ParseObject(current.StateJson);
            if (!state.ContainsKey("phase"))
            {
                state["phase"] = ActivityPhases.Lobby;
                current.StateJson = Serialize(state);
                changed = true;
            }

            var phase = StringValue(state, "phase") ?? ActivityPhases.Lobby;
            if (!string.Equals(current.CurrentPhase, phase, StringComparison.Ordinal))
            {
                current.CurrentPhase = phase;
                changed = true;
            }

            if (changed)
            {
                current.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
            }

            return current;
        }
        finally
        {
            gate.Release();
        }
    }


    /// <summary>
    /// Put this run into the lobby its room joins, creating or adopting one.
    ///
    /// A lesson gets a single group, so every activity in it shares one join
    /// code, one roster and one running score. A run with no lesson gets its own
    /// group, which keeps ad-hoc launches working exactly as before.
    ///
    /// Existing runs are adopted rather than reset: the group takes over the
    /// run's current join code where it has one, and the run's people, teams and
    /// score history are backfilled into the group so nothing in flight breaks
    /// and no history is lost.
    /// </summary>
    private async Task<bool> AttachSessionGroupAsync(ActivityRun run, CancellationToken ct)
    {
        if (run.SessionGroupId.HasValue)
        {
            var existing = await db.ActivitySessionGroups.SingleOrDefaultAsync(x => x.Id == run.SessionGroupId.Value, ct);
            if (existing is not null)
            {
                var moved = existing.CurrentRunId != run.Id;
                if (moved)
                {
                    existing.CurrentRunId = run.Id;
                    existing.UpdatedAt = DateTimeOffset.UtcNow;
                }
                return moved;
            }
            run.SessionGroupId = null;
        }

        var group = run.LessonId.HasValue
            ? await db.ActivitySessionGroups.SingleOrDefaultAsync(x => x.LessonId == run.LessonId.Value, ct)
            : null;

        if (group is null)
        {
            group = new ActivitySessionGroup
            {
                Id = Guid.NewGuid(),
                LessonId = run.LessonId,
                // Adopt the code the room may already be looking at.
                JoinCode = string.IsNullOrWhiteSpace(run.JoinCode) ? await NewJoinCodeAsync(ct) : run.JoinCode!,
                CurrentRunId = run.Id,
            };
            db.ActivitySessionGroups.Add(group);
        }

        run.SessionGroupId = group.Id;
        // Runs still carry the code so older clients and the legacy envelope
        // keep working; the group is the authority.
        run.JoinCode = group.JoinCode;
        group.CurrentRunId = run.Id;
        group.UpdatedAt = DateTimeOffset.UtcNow;

        await BackfillGroupOwnershipAsync(run.Id, group.Id, ct);
        return true;
    }

    /// <summary>Move a run's existing people, teams and points into its group.</summary>
    private async Task BackfillGroupOwnershipAsync(Guid runId, Guid groupId, CancellationToken ct)
    {
        await db.ActivityParticipants
            .Where(x => x.ActivityRunId == runId && x.SessionGroupId == null)
            .ExecuteUpdateAsync(x => x.SetProperty(item => item.SessionGroupId, groupId), ct);
        await db.ActivityTeams
            .Where(x => x.ActivityRunId == runId && x.SessionGroupId == null)
            .ExecuteUpdateAsync(x => x.SetProperty(item => item.SessionGroupId, groupId), ct);
        await db.ActivityScoreEvents
            .Where(x => x.ActivityRunId == runId && x.SessionGroupId == null)
            .ExecuteUpdateAsync(x => x.SetProperty(item => item.SessionGroupId, groupId), ct);
    }

    /// <summary>
    /// Resolve a join code to the game the room should currently be in.
    ///
    /// The code belongs to the lobby, not to one game, so a phone that joined
    /// during the first activity follows the lesson into the next one without
    /// re-scanning. Falls back to the legacy per-run code so a session that was
    /// already live before groups existed keeps working.
    /// </summary>
    public async Task<ActivityRun?> FindByJoinCodeAsync(string code, CancellationToken ct = default)
    {
        var normalized = NormalizeCode(code);
        if (normalized.Length == 0) return null;

        var group = await db.ActivitySessionGroups.SingleOrDefaultAsync(x => x.JoinCode == normalized, ct);
        if (group is not null)
        {
            var current = await ResolveGroupRunAsync(group, ct);
            if (current is not null) return await EnsureInteractiveRunAsync(current, ct);
        }

        var run = await db.ActivityRuns.Include(x => x.ActivityDefinition)
            .SingleOrDefaultAsync(x => x.JoinCode == normalized, ct);
        if (run is null || run.ActivityDefinition is null || run.Status == ActivityRunStatuses.Ended) return null;
        return await EnsureInteractiveRunAsync(run, ct);
    }

    /// <summary>
    /// The live run for a lobby: the one the host is driving, or the most
    /// recently touched one that has not ended.
    /// </summary>
    private async Task<ActivityRun?> ResolveGroupRunAsync(ActivitySessionGroup group, CancellationToken ct)
    {
        if (group.CurrentRunId.HasValue)
        {
            var current = await db.ActivityRuns.Include(x => x.ActivityDefinition)
                .SingleOrDefaultAsync(x => x.Id == group.CurrentRunId.Value, ct);
            if (current?.ActivityDefinition is not null && current.Status != ActivityRunStatuses.Ended) return current;
        }

        return await db.ActivityRuns.Include(x => x.ActivityDefinition)
            .Where(x => x.SessionGroupId == group.Id && x.Status != ActivityRunStatuses.Ended)
            .OrderByDescending(x => x.UpdatedAt)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<(ActivityRun? Run, ActivityParticipant? Participant, string Token, string? Error)> JoinAsync(
        string code,
        ActivityParticipantJoinInput input,
        CancellationToken ct = default)
    {
        var run = await FindByJoinCodeAsync(code, ct);
        if (run?.ActivityDefinition is null) return (null, null, "", "That game code is not active.");

        var token = (input.ParticipantToken ?? "").Trim();
        if (token.Length is < 20 or > 200) token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();

        // Identity belongs to the lobby, so a phone that joined an earlier game
        // in this lesson is recognised rather than signed up again.
        var groupId = run.SessionGroupId;
        var hash = TokenHash(groupId ?? run.Id, token);
        var participant = await FindParticipantAsync(run.Id, token, ct);
        var isNewParticipant = participant is null;

        var displayName = NormalizeDisplayName(input.DisplayName);
        if (participant is null)
        {
            var count = groupId.HasValue
                ? await db.ActivityParticipants.CountAsync(x => x.SessionGroupId == groupId.Value && x.Status != "removed", ct)
                : await db.ActivityParticipants.CountAsync(x => x.ActivityRunId == run.Id && x.Status != "removed", ct);
            // Unclaimed identities are spread by join order so a room that
            // never touches the picker still looks varied on the stage.
            var (defaultAvatar, defaultColor) = ActivityIdentity.ForIndex(count);
            participant = new ActivityParticipant
            {
                Id = Guid.NewGuid(),
                ActivityRunId = run.Id,
                SessionGroupId = groupId,
                ParticipantTokenHash = hash,
                DisplayName = string.IsNullOrWhiteSpace(displayName) ? $"Player {count + 1}" : displayName,
                Avatar = string.IsNullOrWhiteSpace(input.Avatar) ? defaultAvatar : ActivityIdentity.NormalizeAvatar(input.Avatar),
                Color = string.IsNullOrWhiteSpace(input.Color) ? defaultColor : ActivityIdentity.NormalizeColor(input.Color),
                IsAnonymous = string.IsNullOrWhiteSpace(displayName),
                JoinedAt = DateTimeOffset.UtcNow,
                LastSeenAt = DateTimeOffset.UtcNow
            };
            db.ActivityParticipants.Add(participant);
        }
        else
        {
            if (participant.Status == "removed") return (run, null, token, "The host removed this player from the game.");
            if (!string.IsNullOrWhiteSpace(displayName))
            {
                participant.DisplayName = displayName;
                participant.IsAnonymous = false;
            }
            // A reconnecting player may also be changing their look.
            if (!string.IsNullOrWhiteSpace(input.Avatar)) participant.Avatar = ActivityIdentity.NormalizeAvatar(input.Avatar);
            if (!string.IsNullOrWhiteSpace(input.Color)) participant.Color = ActivityIdentity.NormalizeColor(input.Color);
            participant.LastSeenAt = DateTimeOffset.UtcNow;
        }

        if (isNewParticipant && run.ActivityDefinition.Type is (ActivityTypes.Trivia or ActivityTypes.RapidFire))
        {
            var quizModifiers = QuizModifierSettings.FromConfig(ParseConfig(run));
            if (quizModifiers.LivesEnabled && StringValue(ParseObject(run.StateJson), "phase") != ActivityPhases.Lobby)
                participant.Lives = quizModifiers.StartingLives;
        }

        await db.SaveChangesAsync(ct);
        await BroadcastDisplayAsync(run.Id, ct);
        return (run, participant, token, null);
    }

    public async Task<ActivitySessionPublicView?> GetPublicViewAsync(Guid runId, CancellationToken ct = default)
    {
        var run = await LoadRunAsync(runId, ct);
        if (run?.ActivityDefinition is null) return null;
        run = await EnsureInteractiveRunAsync(run, ct);
        run = await LoadRunAsync(run.Id, ct) ?? run;
        var envelope = await BuildEnvelopeAsync(run, ProjectionRole.Display, ct);
        var participants = (await db.ActivityParticipants.AsNoTracking()
            .Where(x => x.ActivityRunId == run.Id && x.Status != "removed")
            .Select(x => new { id = x.Id, displayName = x.DisplayName, avatar = x.Avatar, color = x.Color, teamId = x.TeamId, joinedAt = x.JoinedAt })
            .ToListAsync(ct))
            .OrderBy(x => x.joinedAt)
            .Select(x => (object)new { id = x.id, displayName = x.displayName, teamId = x.teamId })
            .ToList();
        var teams = await db.ActivityTeams.AsNoTracking().Where(x => x.ActivityRunId == run.Id && x.Active)
            .OrderBy(x => x.Position)
            .Select(x => (object)new { id = x.Id, name = x.Name, color = x.Color, icon = x.Icon, score = x.Score })
            .ToListAsync(ct);
        return new ActivitySessionPublicView(envelope, run.JoinCode ?? "", participants.Count, participants, teams);
    }

    public async Task<ActivityStateEnvelope?> GetDisplayEnvelopeAsync(Guid runId, CancellationToken ct = default)
    {
        var run = await LoadRunAsync(runId, ct);
        if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)) return null;
        run = await EnsureInteractiveRunAsync(run, ct);
        run = await LoadRunAsync(run.Id, ct) ?? run;
        return await BuildEnvelopeAsync(run, ProjectionRole.Display, ct);
    }

    public async Task<ActivityParticipantView?> GetParticipantViewAsync(
        Guid runId,
        string token,
        CancellationToken ct = default)
    {
        var run = await LoadRunAsync(runId, ct);
        if (run?.ActivityDefinition is null) return null;
        var participant = await FindParticipantAsync(runId, token, ct);
        if (participant is null || participant.Status == "removed") return null;
        participant.LastSeenAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        var envelope = await BuildEnvelopeAsync(run, ProjectionRole.Participant, ct, participant.Id);
        var roundId = CurrentRoundId(run, ParseConfig(run));
        var phase = GetPhase(run);
        var currentConfig = ParseConfig(run);
        var rawState = ParseObject(run.StateJson);
        var isTurnBasedWord = run.ActivityDefinition.Type == ActivityTypes.Word && BoolValue(currentConfig, "turnBased");
        var quizModifiers = QuizModifierSettings.FromConfig(currentConfig);
        var isQuizEliminated = run.ActivityDefinition.Type is ActivityTypes.Trivia or ActivityTypes.RapidFire
            && quizModifiers.LivesEnabled
            && quizModifiers.EliminateAtZeroLives
            && (participant.Status == "eliminated" || participant.Lives <= 0);
        var isEliminated = isTurnBasedWord && ReadStringArray(rawState, "eliminatedParticipantIds").Contains(participant.Id.ToString(), StringComparer.OrdinalIgnoreCase)
            || isQuizEliminated;
        var isCurrentTurn = isTurnBasedWord && StringValue(rawState, "turnParticipantId") == participant.Id.ToString();
        var hasSubmission = await db.ActivitySubmissions.AnyAsync(x => x.ActivityRunId == runId && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var voteRoundId = run.ActivityDefinition.Type == ActivityTypes.Punchline
            ? CreativeVoteRoundId(run, currentConfig, rawState)
            : roundId;
        var hasVote = await db.ActivityVotes.AnyAsync(x => x.ActivityRunId == runId && x.VoterParticipantId == participant.Id && x.RoundId == voteRoundId, ct);
        // Creative and bluffing rounds intentionally have two separate inputs:
        // submit a response first, then vote in a later phase. Do not let the
        // first input disable the second one on the participant phone.
        var hasSubmitted = isTurnBasedWord ? false : phase == ActivityPhases.Voting ? hasVote : hasSubmission || hasVote;
        var canRespond = phase is ActivityPhases.AcceptingResponses or ActivityPhases.Voting or ActivityPhases.Prompt;
        if (isTurnBasedWord) canRespond = canRespond && isCurrentTurn && !isEliminated;
        return new ActivityParticipantView(envelope, participant.Id, participant.DisplayName, participant.TeamId?.ToString(), hasSubmitted, canRespond, participant.Avatar, participant.Color);
    }

    public async Task<ActivityHostView?> GetHostViewAsync(Guid runId, CancellationToken ct = default)
    {
        var run = await LoadRunAsync(runId, ct);
        if (run?.ActivityDefinition is null) return null;
        run = await EnsureInteractiveRunAsync(run, ct);
        run = await LoadRunAsync(run.Id, ct) ?? run;
        var envelope = await BuildEnvelopeAsync(run, ProjectionRole.Host, ct);
        var participants = run.Participants.Where(x => x.Status != "removed").OrderBy(x => x.JoinedAt)
            .Select(x => (object)new { id = x.Id, displayName = x.DisplayName, avatar = x.Avatar, color = x.Color, status = x.Status, teamId = x.TeamId, lives = x.Lives, joinedAt = x.JoinedAt, lastSeenAt = x.LastSeenAt })
            .ToArray();
        var teams = run.Teams.OrderBy(x => x.Position)
            .Select(x => (object)new { id = x.Id, name = x.Name, color = x.Color, icon = x.Icon, score = x.Score, active = x.Active })
            .ToArray();
        var submissions = run.Submissions.OrderByDescending(x => x.UpdatedAt)
            .Select(x => (object)new { id = x.Id, participantId = x.ParticipantId, participantName = x.Participant?.DisplayName, roundId = x.RoundId, kind = x.Kind, payload = ParseUntyped(x.PayloadJson), moderationStatus = x.ModerationStatus, hidden = x.Hidden, submittedAt = x.SubmittedAt, updatedAt = x.UpdatedAt })
            .ToArray();
        var votes = run.Votes.OrderByDescending(x => x.CreatedAt)
            .Select(x => (object)new { id = x.Id, voterParticipantId = x.VoterParticipantId, voterName = x.VoterParticipant?.DisplayName, roundId = x.RoundId, targetId = x.TargetId, payload = ParseUntyped(x.PayloadJson), createdAt = x.CreatedAt })
            .ToArray();
        var scoreEvents = run.ScoreEvents.OrderByDescending(x => x.CreatedAt)
            .Select(x => (object)new { id = x.Id, participantId = x.ParticipantId, teamId = x.TeamId, roundId = x.RoundId, amount = x.Amount, reason = x.Reason, createdAt = x.CreatedAt, isUndone = x.IsUndone, undoneAt = x.UndoneAt })
            .ToArray();
        return new ActivityHostView(envelope, run.JoinCode, joinAddress.ResolveJoinUrl(run.JoinCode), participants, teams, submissions, votes, scoreEvents);
    }

    public async Task<ActivityCommandResult> ExecuteParticipantActionAsync(
        Guid runId,
        ActivityParticipantActionInput input,
        CancellationToken ct = default)
    {
        var gate = Locks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await LoadRunAsync(runId, ct);
            if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition))
                return Fail("Interactive game session not found.", run);
            var participant = await FindParticipantAsync(runId, input.ParticipantToken, ct);
            if (participant is null || participant.Status == "removed") return Fail("Participant session not found.", run);
            participant.LastSeenAt = DateTimeOffset.UtcNow;
            var config = ParseConfig(run);
            var state = ParseObject(run.StateJson);
            var action = input.Action.Trim().ToLowerInvariant();
            var result = await HandleParticipantActionAsync(run, participant, config, state, action, input.Payload, ct);
            if (!result.Success) return new ActivityCommandResult(false, result.Error, run.Revision, run.Status, ParseUntyped(run.StateJson), DateTimeOffset.UtcNow);
            await ApplyAutoAdvanceAsync(run, config, state, ct);
            await CommitAsync(run, state, ct);
            var display = await BuildEnvelopeAsync(run, ProjectionRole.Display, ct);
            return new ActivityCommandResult(true, null, run.Revision, run.Status, display.State, DateTimeOffset.UtcNow);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<ActivityCommandResult> ExecuteHostActionAsync(
        Guid runId,
        ActivityCommandEnvelope command,
        CancellationToken ct = default)
    {
        var gate = Locks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await LoadRunAsync(runId, ct);
            if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition))
                return Fail("Interactive game session not found.", run);
            var config = ParseConfig(run);
            var state = ParseObject(run.StateJson);
            var action = command.Action.Trim().ToLowerInvariant();
            if (command.ExpectedRevision is > 0 && command.ExpectedRevision != run.Revision)
                return new ActivityCommandResult(false, $"Revision mismatch. Server revision is {run.Revision}, expected {command.ExpectedRevision}.", run.Revision, run.Status, ParseUntyped(run.StateJson), DateTimeOffset.UtcNow);

            var result = await HandleHostActionAsync(run, config, state, action, command.Payload, ct);
            if (!result.Success) return new ActivityCommandResult(false, result.Error, run.Revision, run.Status, ParseUntyped(run.StateJson), DateTimeOffset.UtcNow);
            await CommitAsync(run, state, ct);
            var display = await BuildEnvelopeAsync(run, ProjectionRole.Display, ct);
            return new ActivityCommandResult(true, null, run.Revision, run.Status, display.State, DateTimeOffset.UtcNow);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<ActivityRun?> ResetAsync(Guid runId, CancellationToken ct = default)
    {
        var gate = Locks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await LoadRunAsync(runId, ct);
            if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)) return null;
            run.StateJson = Serialize((JsonObject)JsonNode.Parse(JsonSerializer.Serialize(InteractiveActivityDefaults.CreateInitialState(run.ActivityDefinition), ActivityJsonDefaults.Options))!);
            run.CurrentPhase = ActivityPhases.Lobby;
            run.Status = ActivityRunStatuses.Prepared;
            run.StartedAt = null;
            run.EndedAt = null;
            run.TimerStartedAt = null;
            run.TimerPausedAt = null;
            run.TimerDurationMs = null;
            foreach (var participant in run.Participants) participant.Status = "active";
            if (run.ActivityDefinition.Type is ActivityTypes.Trivia or ActivityTypes.RapidFire)
            {
                var resetConfig = ParseConfig(run);
                var resetQuizModifiers = QuizModifierSettings.FromConfig(resetConfig);
                foreach (var participant in run.Participants.Where(item => item.Status != "removed"))
                    participant.Lives = resetQuizModifiers.StartingLives;
            }
            db.ActivitySubmissions.RemoveRange(run.Submissions);
            db.ActivityVotes.RemoveRange(run.Votes);
            db.ActivityScoreEvents.RemoveRange(run.ScoreEvents);
            foreach (var team in run.Teams) team.Score = 0;
            await CommitAsync(run, ParseObject(run.StateJson), ct, incrementRevision: true);
            return run;
        }
        finally { gate.Release(); }
    }

    public async Task<ActivityRun?> EndAsync(Guid runId, CancellationToken ct = default)
    {
        var gate = Locks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await LoadRunAsync(runId, ct);
            if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)) return null;
            run.Status = ActivityRunStatuses.Ended;
            run.CurrentPhase = ActivityPhases.Complete;
            run.EndedAt = DateTimeOffset.UtcNow;
            var state = ParseObject(run.StateJson);
            state["phase"] = ActivityPhases.Complete;
            await CommitAsync(run, state, ct, incrementRevision: true);
            return run;
        }
        finally { gate.Release(); }
    }

    public async Task<bool> SetTeamsAsync(Guid runId, IReadOnlyList<ActivityTeamInput> inputs, CancellationToken ct = default)
    {
        var gate = Locks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await LoadRunAsync(runId, ct);
            if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)) return false;
            var existingTeams = run.Teams.ToArray();
            foreach (var participant in run.Participants)
            {
                if (participant.TeamId.HasValue && existingTeams.Any(team => team.Id == participant.TeamId.Value)) participant.TeamId = null;
            }
            db.ActivityTeams.RemoveRange(existingTeams);
            if (existingTeams.Length > 0) await db.SaveChangesAsync(ct);

            var replacementTeams = new List<ActivityTeam>();
            foreach (var (input, index) in inputs.Take(12).Select((value, index) => (value, index)))
            {
                var name = NormalizeDisplayName(input.Name);
                if (string.IsNullOrWhiteSpace(name)) name = $"Team {index + 1}";
                replacementTeams.Add(new ActivityTeam { ActivityRunId = run.Id, SessionGroupId = run.SessionGroupId, Name = name, Position = index, Color = input.Color ?? TeamColors[index % TeamColors.Length], Icon = input.Icon ?? TeamIcons[index % TeamIcons.Length] });
            }
            db.ActivityTeams.AddRange(replacementTeams);
            await db.SaveChangesAsync(ct);
            await BroadcastDisplayAsync(run.Id, ct);
            return true;
        }
        finally { gate.Release(); }
    }

    public async Task<bool> AssignParticipantAsync(Guid runId, Guid participantId, Guid? teamId, CancellationToken ct = default)
    {
        var participant = await db.ActivityParticipants.SingleOrDefaultAsync(x => x.ActivityRunId == runId && x.Id == participantId, ct);
        if (participant is null) return false;
        if (teamId.HasValue && !await db.ActivityTeams.AnyAsync(x => x.ActivityRunId == runId && x.Id == teamId.Value, ct)) return false;
        participant.TeamId = teamId;
        await db.SaveChangesAsync(ct);
        await BroadcastDisplayAsync(runId, ct);
        return true;
    }

    public async Task<bool> RenameTeamAsync(Guid runId, Guid teamId, string? name, CancellationToken ct = default)
    {
        var gate = Locks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var run = await LoadRunAsync(runId, ct);
            if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)) return false;
            var team = run.Teams.FirstOrDefault(item => item.Id == teamId && item.Active);
            var normalized = NormalizeDisplayName(name);
            if (team is null || string.IsNullOrWhiteSpace(normalized)) return false;
            team.Name = normalized;
            await db.SaveChangesAsync(ct);
            await BroadcastDisplayAsync(runId, ct);
            return true;
        }
        finally { gate.Release(); }
    }

    private async Task<(bool Success, string? Error)> HandleHostActionAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action.StartsWith("utility.", StringComparison.OrdinalIgnoreCase) || action.StartsWith("embeddedutility.", StringComparison.OrdinalIgnoreCase))
            return await HandleEmbeddedUtilityHostAsync(run, config, state, action, payload, ct);
        if (action is "start" or "startgame")
        {
            var activityType = run.ActivityDefinition!.Type;
            if (run.ActivityDefinition!.Type == ActivityTypes.Bracket)
            {
                await EnsureBracketEntrantsAsync(run, config, state, ct);
                if (BracketEntrants(config, state).Count < 2)
                    return (false, "Add at least two active participants or teams before starting the bracket.");
                EnsureBracketState(config, state);
            }
            else if (run.ActivityDefinition.Type == ActivityTypes.PhysicalRoom)
            {
                EnsurePhysicalRoomState(config, state);
            }
            else if (run.ActivityDefinition.Type == ActivityTypes.Utility)
            {
                EnsureUtilityState(config, state);
            }
            state["phase"] = FirstPlayPhase(activityType);
            state["actionNonce"] = LongValue(state, "actionNonce") + 1;
            if (activityType is ActivityTypes.Trivia or ActivityTypes.RapidFire)
            {
                InitializeQuizParticipants(run, config, state);
                if (activityType == ActivityTypes.RapidFire)
                {
                    var now = DateTimeOffset.UtcNow;
                    var durationMs = RapidFireDurationMs(config, state);
                    state["phase"] = ActivityPhases.AcceptingResponses;
                    state["responsesOpen"] = true;
                    state["responsesLocked"] = false;
                    state["isRunning"] = true;
                    state["remainingMs"] = durationMs;
                    state["targetAt"] = now.AddMilliseconds(durationMs).ToString("O");
                    state["responseWindowStartedAt"] = now.ToString("O");
                }
            }
            if (activityType == ActivityTypes.Drawing && BoolValue(config, "telephoneChain"))
            {
                state["telephoneStepIndex"] = 0;
                state["telephoneStepKind"] = "drawing";
                state["telephoneChainStarted"] = true;
            }
            run.Status = ActivityRunStatuses.Live;
            run.StartedAt ??= DateTimeOffset.UtcNow;
            return (true, null);
        }
        if (action is "pause")
        {
            run.Status = ActivityRunStatuses.Paused;
            run.TimerPausedAt = DateTimeOffset.UtcNow;
            if (run.ActivityDefinition?.Type == ActivityTypes.RapidFire)
            {
                state["remainingMs"] = RapidFireRemainingMs(state);
                state["targetAt"] = null;
                state["isRunning"] = false;
            }
            return (true, null);
        }
        if (action is "resume")
        {
            run.Status = ActivityRunStatuses.Live;
            run.TimerPausedAt = null;
            if (run.ActivityDefinition?.Type == ActivityTypes.RapidFire)
            {
                var remainingMs = Math.Max(0, IntValue(state, "remainingMs"));
                if (remainingMs <= 0) return (false, "This rapid-fire question has no time remaining.");
                state["targetAt"] = DateTimeOffset.UtcNow.AddMilliseconds(remainingMs).ToString("O");
                state["isRunning"] = true;
            }
            return (true, null);
        }
        if (action is "awardpoints" or "score" or "award") return await AwardFromPayloadAsync(run, state, payload, ct);
        if (action is "undoscore" or "undoscoreevent") return await UndoScoreAsync(run, payload, ct);
        if (action is "autoadvance" or "setautoadvance")
        {
            if (!SupportsAutoAdvance(run)) return (false, "This game does not close its window on a head count.");
            state["autoAdvanceEnabled"] = payload.HasValue && payload.Value.TryGetProperty("enabled", out var toggle)
                ? toggle.ValueKind == System.Text.Json.JsonValueKind.True
                : !BoolValue(state, "autoAdvanceEnabled");
            return (true, null);
        }
        if (action is "removeparticipant") return RemoveParticipant(run, payload);
        if (action is "renameparticipant") return RenameParticipant(run, payload);
        if (action is "moderate" or "moderateresponse") return await ModerateAsync(run, payload, ct);

        return run.ActivityDefinition!.Type switch
        {
            ActivityTypes.Trivia or ActivityTypes.RapidFire => await HandleQuizHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Poll or ActivityTypes.Prediction => await HandlePollHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Buzzer => await HandleBuzzerHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Punchline => await HandleCreativeHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.FakeOut => await HandleBluffHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.SurveyBoard => await HandleSurveyHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.ImageReveal => await HandleMediaRevealHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Drawing => await HandleDrawingHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Ordering => await HandleOrderingHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Word => await HandleWordHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.MatchPlayer => await HandleMatchPlayerHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.StageChallenge => await HandleStageChallengeHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Bracket => await HandleBracketHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.PhysicalRoom => await HandlePhysicalRoomHostAsync(run, config, state, action, payload, ct),
            ActivityTypes.Utility => await HandleUtilityHostAsync(run, config, state, action, payload, ct),
            _ => (false, $"Unsupported interactive activity '{run.ActivityDefinition!.Type}'.")
        };
    }

    private async Task<(bool Success, string? Error)> HandleParticipantActionAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (run.Status == ActivityRunStatuses.Paused) return (false, "The host has paused this game.");
        return run.ActivityDefinition!.Type switch
        {
            ActivityTypes.Trivia or ActivityTypes.RapidFire => await HandleQuizParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.Poll or ActivityTypes.Prediction => await HandlePollParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.Buzzer => await HandleBuzzerParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.Punchline => await HandleCreativeParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.FakeOut => await HandleBluffParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.SurveyBoard => await HandleSurveyParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.Drawing => await HandleDrawingParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.Ordering => await HandleOrderingParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.Word => await HandleWordParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.MatchPlayer => await HandleMatchPlayerParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.StageChallenge => await HandleStageChallengeParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.Bracket => await HandleBracketParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.PhysicalRoom when BoolValue(config, "adventure") => await HandleAdventureParticipantAsync(run, participant, config, state, action, payload, ct),
            ActivityTypes.PhysicalRoom => (false, "This is a host-controlled room activity."),
            _ => (false, "This activity does not accept phone responses.")
        };
    }

    private async Task<(bool Success, string? Error)> HandleQuizHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var questions = ArrayValue(config, "questions");
        var index = Math.Clamp(IntValue(state, "currentQuestionIndex"), 0, Math.Max(0, questions.Count - 1));
        switch (action)
        {
            case "openresponses":
            case "open":
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["responsesOpen"] = true;
                state["responsesLocked"] = false;
                state["responseWindowStartedAt"] = DateTimeOffset.UtcNow.ToString("O");
                return (true, null);
            case "closeresponses":
            case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "revealanswer":
            case "reveal":
                if (run.ActivityDefinition!.Type == ActivityTypes.RapidFire)
                {
                    state["remainingMs"] = RapidFireRemainingMs(state);
                    state["targetAt"] = null;
                    state["isRunning"] = false;
                }
                state["phase"] = ActivityPhases.Reveal; state["responsesOpen"] = false; state["responsesLocked"] = true; state["answerRevealed"] = true;
                var question = questions.Count == 0 ? null : questions[index] as JsonObject;
                var answerMode = QuizAnswerMode(question);
                if (answerMode == "choice") state["revealedCorrectIndex"] = IntValue(question, "correctIndex");
                else state.Remove("revealedCorrectIndex");
                var revealedAnswer = QuizAnswerText(question);
                if (!string.IsNullOrWhiteSpace(revealedAnswer)) state["revealedAnswer"] = revealedAnswer;
                else state.Remove("revealedAnswer");
                var explanation = StringValue(question, "explanation");
                if (!string.IsNullOrWhiteSpace(explanation)) state["revealedExplanation"] = explanation;
                if (!BoolValue(state, "scoresApplied"))
                {
                    await ScoreQuizAsync(run, questions, index, state, ct);
                    state["scoresApplied"] = true;
                }
                return (true, null);
            case "hideanswer":
                state["answerRevealed"] = false; state.Remove("revealedCorrectIndex"); state.Remove("revealedAnswer"); return (true, null);
            case "revealexplanation":
                state["explanationRevealed"] = true; return (true, null);
            case "nextquestion":
            case "nextround":
            case "next":
                if (index >= Math.Max(0, questions.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentQuestionIndex"] = index + 1; state["roundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro;
                state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; state.Remove("revealedCorrectIndex"); state.Remove("revealedAnswer"); state.Remove("revealedExplanation"); state["scoresApplied"] = false; state.Remove("responseWindowStartedAt"); state["targetAt"] = null; state["remainingMs"] = null; state["isRunning"] = false; return (true, null);
            case "prevquestion":
            case "previous":
                state["currentQuestionIndex"] = Math.Max(0, index - 1); state["roundIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; state.Remove("revealedCorrectIndex"); state.Remove("revealedAnswer"); state.Remove("responseWindowStartedAt"); state["targetAt"] = null; state["remainingMs"] = null; state["isRunning"] = false; return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            case "finish": state["phase"] = ActivityPhases.FinalResults; return (true, null);
            default: return (false, $"Unrecognized quiz action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleQuizParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("answer" or "submit" or "choose")) return (false, "Choose an answer while answers are open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Answers are not open.");
        if (run.ActivityDefinition!.Type == ActivityTypes.RapidFire && RapidFireRemainingMs(state) <= 0)
            return (false, "This rapid-fire question has ended.");
        var modifiers = QuizModifierSettings.FromConfig(config);
        if (modifiers.LivesEnabled && modifiers.EliminateAtZeroLives && (participant.Status == "eliminated" || participant.Lives <= 0))
            return (false, "You are out of lives for this game.");
        var questions = ArrayValue(config, "questions");
        var index = Math.Clamp(IntValue(state, "currentQuestionIndex"), 0, Math.Max(0, questions.Count - 1));
        var question = questions.Count > index ? questions[index] as JsonObject : null;
        var answerMode = QuizAnswerMode(question);
        JsonObject answerPayload;
        if (answerMode == "choice")
        {
            var optionIndex = ReadInt(payload, "optionIndex", ReadInt(payload, "answerIndex", -1));
            var options = question is null ? [] : ArrayValue(question, "options");
            if (optionIndex < 0 || optionIndex >= options.Count) return (false, "That answer is not available.");
            answerPayload = new JsonObject { ["optionIndex"] = optionIndex };
        }
        else if (answerMode is "text" or "shorttext")
        {
            var text = ReadString(payload, "text").Trim();
            if (text.Length is < 1 or > 1000) return (false, "Short answers must be between 1 and 1,000 characters.");
            answerPayload = new JsonObject { ["text"] = text };
        }
        else if (answerMode == "number")
        {
            if (!TryReadDouble(payload, "number", out var number) && !TryReadDouble(payload, "text", out number))
                return (false, "Enter a valid number.");
            if (!double.IsFinite(number) || Math.Abs(number) > 1_000_000_000_000d) return (false, "That number is outside the allowed range.");
            answerPayload = new JsonObject { ["number"] = number };
        }
        else return (false, "That answer format is not available.");

        if (modifiers.WagerEnabled)
        {
            var wager = ReadInt(payload, "wager", modifiers.WagerDefaultPoints);
            if (wager < 0 || wager > modifiers.WagerMaxPoints) return (false, $"Your wager must be between 0 and {modifiers.WagerMaxPoints} points.");
            answerPayload["wager"] = wager;
        }
        if (modifiers.DoubleOrNothingEnabled)
            answerPayload["doubleOrNothing"] = ReadBool(payload, "doubleOrNothing");
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var payloadJson = Serialize(answerPayload);
        if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "quizAnswer", PayloadJson = payloadJson });
        else { existing.PayloadJson = payloadJson; existing.UpdatedAt = DateTimeOffset.UtcNow; }
        state["responseCount"] = await db.ActivitySubmissions.CountAsync(x => x.ActivityRunId == run.Id && x.RoundId == roundId, ct) + (existing is null ? 1 : 0);
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandlePollHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var rounds = ArrayValue(config, "rounds");
        if (rounds.Count == 0) rounds = [config];
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        switch (action)
        {
            case "open": case "openresponses": state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "close": case "closeresponses": case "lock": state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "showresults": case "reveal":
                var pollMode = PollScoringMode(config);
                state["phase"] = ActivityPhases.Reveal; state["resultsVisible"] = true; state["answerRevealed"] = run.ActivityDefinition!.Type == ActivityTypes.Prediction || pollMode.Length > 0; state["responsesOpen"] = false;
                if (run.ActivityDefinition!.Type == ActivityTypes.Prediction && !BoolValue(state, "scoresApplied"))
                {
                    var correct = IntValue(rounds[index] as JsonObject, "correctIndex");
                    state["revealedCorrectIndex"] = correct;
                    state["revealedExplanation"] = StringValue(rounds[index] as JsonObject, "explanation");
                    await ScorePredictionAsync(run, CurrentRoundId(run, config), correct, ct);
                    state["scoresApplied"] = true;
                }
                else if (run.ActivityDefinition!.Type == ActivityTypes.Poll && pollMode.Length > 0 && !BoolValue(state, "scoresApplied"))
                {
                    await ScorePollOutcomeAsync(run, config, state, rounds[index] as JsonObject ?? config, CurrentRoundId(run, config), pollMode, ct);
                    state["scoresApplied"] = true;
                }
                return (true, null);
            case "hideresults": state["resultsVisible"] = false; return (true, null);
            case "hideanswer": state["answerRevealed"] = false; state["resultsVisible"] = false; state.Remove("revealedCorrectIndex"); return (true, null);
            case "showexplanation": state["explanationRevealed"] = true; return (true, null);
            case "hideexplanation": state["explanationRevealed"] = false; return (true, null);
            case "next": case "nextround":
                if (index >= rounds.Count - 1) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["resultsVisible"] = false; state["votes"] = new JsonObject(); state["totalVotes"] = 0; state["scoresApplied"] = false; return (true, null);
            case "prev": case "previous":
                state["currentRoundIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["resultsVisible"] = false; state["answerRevealed"] = false; return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            default: return (false, $"Unrecognized poll action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandlePollParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("vote" or "choose" or "predict")) return (false, "Choose an option while the poll is open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Voting is closed.");
        var rounds = ArrayValue(config, "rounds");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        var round = rounds.Count > index ? rounds[index] as JsonObject : config;
        var options = ArrayValue(round, "options");
        if (options.Count == 0) options = ArrayValue(config, "options");
        var optionIndex = ReadInt(payload, "optionIndex", -1);
        if (optionIndex < 0 || optionIndex >= options.Count) return (false, "That option is not available.");
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivityVotes.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.VoterParticipantId == participant.Id && x.RoundId == roundId, ct);
        var voteJson = JsonSerializer.Serialize(new { optionIndex }, ActivityJsonDefaults.Options);
        if (existing is null) db.ActivityVotes.Add(new ActivityVote { ActivityRunId = run.Id, VoterParticipantId = participant.Id, RoundId = roundId, TargetId = optionIndex.ToString(), PayloadJson = voteJson });
        else { existing.TargetId = optionIndex.ToString(); existing.PayloadJson = voteJson; existing.CreatedAt = DateTimeOffset.UtcNow; }
        var votes = new JsonObject();
        foreach (var group in db.ActivityVotes.Local.Where(x => x.ActivityRunId == run.Id && x.RoundId == roundId).GroupBy(x => x.TargetId)) votes[group.Key] = group.Count();
        state["votes"] = votes;
        state["totalVotes"] = await db.ActivityVotes.CountAsync(x => x.ActivityRunId == run.Id && x.RoundId == roundId, ct) + (existing is null ? 1 : 0);
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandleBuzzerHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var clues = ArrayValue(config, "clues");
        if (clues.Count == 0) return (false, "Add at least one clue before starting this buzzer game.");
        var index = Math.Clamp(IntValue(state, "currentClueIndex"), 0, Math.Max(0, clues.Count - 1));
        switch (action)
        {
            case "open": case "openbuzzers":
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["responsesOpen"] = true;
                state["buzzLocked"] = false;
                state["stealOpen"] = false;
                state["buzzWinnerParticipantId"] = null;
                state["buzzWinnerName"] = null;
                state["answerRevealed"] = false;
                state.Remove("revealedAnswer");
                return (true, null);
            case "reopen": case "resetbuzzers":
                if (StringValue(state, "phase") is not (ActivityPhases.Judging or ActivityPhases.AcceptingResponses or ActivityPhases.Reveal))
                    return (false, "Open the buzzers before resetting them.");
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["responsesOpen"] = true;
                state["buzzLocked"] = false;
                state["stealOpen"] = false;
                state["buzzWinnerParticipantId"] = null;
                state["buzzWinnerName"] = null;
                state.Remove("lockedOutParticipantId");
                state["answerRevealed"] = false;
                state.Remove("revealedAnswer");
                return (true, null);
            case "opensteal":
                if (StringValue(state, "phase") is not (ActivityPhases.Reveal or ActivityPhases.Judging))
                    return (false, "There is no missed answer to steal right now.");
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["responsesOpen"] = true;
                state["buzzLocked"] = false;
                state["stealOpen"] = true;
                state["answerRevealed"] = false;
                state.Remove("revealedAnswer");
                return (true, null);
            case "revealclue": case "nextclue":
                if (StringValue(state, "phase") is ActivityPhases.Lobby or ActivityPhases.RoundIntro or ActivityPhases.AcceptingResponses or ActivityPhases.Judging or ActivityPhases.Reveal)
                {
                    state["cluesRevealed"] = Math.Min(clues.Count, IntValue(state, "cluesRevealed") + 1);
                    state["phase"] = ActivityPhases.AcceptingResponses;
                    state["responsesOpen"] = true;
                    state["buzzLocked"] = false;
                    state["stealOpen"] = false;
                    state["buzzWinnerParticipantId"] = null;
                    state["buzzWinnerName"] = null;
                    state.Remove("lockedOutParticipantId");
                    state["answerRevealed"] = false;
                    state.Remove("revealedAnswer");
                    return (true, null);
                }
                return (false, "Reveal the next clue after the current buzzer result.");
            case "correct":
                if (!Guid.TryParse(StringValue(state, "buzzWinnerParticipantId"), out var correctWinnerId)) return (false, "A player must buzz before marking an answer correct.");
                state["phase"] = ActivityPhases.Reveal; state["answerRevealed"] = true;
                state["responsesOpen"] = false;
                state["stealOpen"] = false;
                state["buzzLocked"] = true;
                if (!BoolValue(state, "scoresApplied")) { var points = IntValue(clues.Count > index ? clues[index] as JsonObject : null, "points", 100); await AwardScoreAsync(run, correctWinnerId, null, points, "Correct buzzer answer", CurrentRoundId(run, config), ct); state["scoresApplied"] = true; state["pointsAwarded"] = points; }
                state["revealedAnswer"] = StringValue(clues.Count > index ? clues[index] as JsonObject : null, "answer"); return (true, null);
            case "incorrect":
                var loser = StringValue(state, "buzzWinnerParticipantId");
                if (!Guid.TryParse(loser, out var loserId)) return (false, "A player must buzz before marking an answer incorrect.");
                if (BoolValue(config, "lockOutOnMiss", true)) state["lockedOutParticipantId"] = loserId.ToString();
                var penalty = IntValue(config, "wrongPenalty");
                if (penalty != 0) await AwardScoreAsync(run, loserId, null, -Math.Abs(penalty), "Incorrect buzzer answer", CurrentRoundId(run, config), ct);
                var stealOnMiss = BoolValue(config, "stealOnMiss", true);
                state["buzzWinnerParticipantId"] = null;
                state["buzzWinnerName"] = null;
                state["stealOpen"] = stealOnMiss;
                state["buzzLocked"] = !stealOnMiss;
                state["responsesOpen"] = stealOnMiss;
                state["phase"] = stealOnMiss ? ActivityPhases.AcceptingResponses : ActivityPhases.Reveal;
                state["answerRevealed"] = false;
                return (true, null);
            case "revealanswer": case "showanswer":
                if (StringValue(state, "phase") is not (ActivityPhases.AcceptingResponses or ActivityPhases.Reveal or ActivityPhases.Judging))
                    return (false, "Reveal the answer after a buzzer attempt.");
                state["phase"] = ActivityPhases.Reveal;
                state["responsesOpen"] = false;
                state["buzzLocked"] = true;
                state["stealOpen"] = false;
                state["answerRevealed"] = true;
                state["revealedAnswer"] = StringValue(clues.Count > index ? clues[index] as JsonObject : null, "answer");
                return (true, null);
            case "next": case "nextround":
                if (index >= Math.Max(0, clues.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentClueIndex"] = index + 1; state["cluesRevealed"] = 0; state["buzzWinnerParticipantId"] = null; state["buzzWinnerName"] = null; state["buzzLocked"] = false; state["stealOpen"] = false; state["responsesOpen"] = false; state["answerRevealed"] = false; state.Remove("revealedAnswer"); state.Remove("lockedOutParticipantId"); state["scoresApplied"] = false; state.Remove("pointsAwarded"); state["phase"] = ActivityPhases.RoundIntro; return (true, null);
            default: return (false, $"Unrecognized buzzer action '{action}'.");
        }
    }

    private Task<(bool Success, string? Error)> HandleBuzzerParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("buzz" or "answer")) return Task.FromResult((Success: false, Error: (string?)"Press the buzzer when it opens."));
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen", true) || BoolValue(state, "buzzLocked")) return Task.FromResult((Success: false, Error: (string?)"The buzzer is closed."));
        if (StringValue(state, "lockedOutParticipantId") == participant.Id.ToString()) return Task.FromResult((Success: false, Error: (string?)"You are locked out for this clue."));
        state["buzzWinnerParticipantId"] = participant.Id.ToString(); state["buzzWinnerName"] = participant.DisplayName; state["buzzLocked"] = true; state["phase"] = ActivityPhases.Judging;
        return Task.FromResult((true, (string?)null));
    }

    private async Task<(bool Success, string? Error)> HandleCreativeHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        switch (action)
        {
            case "open": case "openresponses": state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "close": case "closeresponses": case "lock": state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "openvoting":
                if (CreativeVotingStyle(config) == "headToHead")
                {
                    await EnsureCreativeHeadToHeadStateAsync(run, config, state, ct);
                    if (StringValue(state, "creativeCurrentMatchId") is null) return (false, "Approve at least two creative responses before opening head-to-head voting.");
                    var currentMatch = CreativeMatch(state, StringValue(state, "creativeCurrentMatchId")!);
                    if (currentMatch is not null) currentMatch["status"] = "open";
                }
                state["phase"] = ActivityPhases.Voting; state["votingOpen"] = true; return (true, null);
            case "nextmatchup":
                if (CreativeVotingStyle(config) != "headToHead") return (false, "This creative round uses gallery voting.");
                await EnsureCreativeHeadToHeadStateAsync(run, config, state, ct);
                if (StringValue(state, "creativeCurrentMatchId") is { } completedId && CreativeMatch(state, completedId) is { } completedMatch && StringValue(completedMatch, "status") == "complete")
                    return AdvanceCreativeHeadToHead(state);
                return await ResolveCreativeHeadToHeadAsync(run, config, state, payload, advance: true, ct);
            case "closevoting": case "reveal":
                if (CreativeVotingStyle(config) == "headToHead")
                    return await ResolveCreativeHeadToHeadAsync(run, config, state, payload, advance: false, ct);
                state["phase"] = ActivityPhases.Reveal; state["votingOpen"] = false; state["resultsVisible"] = true; await ScoreCreativeAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                var prompts = ArrayValue(config, "prompts"); var promptIndex = IntValue(state, "currentPromptIndex");
                if (promptIndex >= Math.Max(0, prompts.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
            state["currentPromptIndex"] = promptIndex + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["votingOpen"] = false; state["resultsVisible"] = false; state.Remove("creativeMatches"); state.Remove("creativeCurrentMatchId"); state.Remove("creativeChampionId"); state.Remove("creativeChampionScoreApplied"); state.Remove("winningSubmissionId"); state.Remove("winningPoints"); state.Remove("revealedWinnerId"); return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            default: return (false, $"Unrecognized creative action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleCreativeParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        if (action is "submit" or "response")
        {
            if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Responses are closed.");
            var text = ReadString(payload, "text").Trim(); if (text.Length is < 1 or > 1000) return (false, "Responses must be between 1 and 1,000 characters.");
            var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
            var status = BoolValue(config, "requireModeration", true) ? "pending" : "approved";
            var json = JsonSerializer.Serialize(new { text }, ActivityJsonDefaults.Options);
            if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "creative", PayloadJson = json, ModerationStatus = status });
            else { existing.PayloadJson = json; existing.ModerationStatus = status; existing.Hidden = false; existing.UpdatedAt = DateTimeOffset.UtcNow; }
            state["submissionCount"] = await db.ActivitySubmissions.CountAsync(x => x.ActivityRunId == run.Id && x.RoundId == roundId, ct) + (existing is null ? 1 : 0);
            return (true, null);
        }
        if (action is "vote" or "choose") return await SaveVoteAsync(run, participant, state, payload, CreativeVoteRoundId(run, config, state), ct, "creative");
        return (false, "Submit a response or vote when the host opens that phase.");
    }

    private async Task<(bool Success, string? Error)> HandleBluffHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        switch (action)
        {
            case "open": case "openresponses": state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "close": case "closeresponses": case "lock": state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "openvoting": state["phase"] = ActivityPhases.Voting; state["votingOpen"] = true; return (true, null);
            case "favorite": case "hostfavorite":
                var favoriteId = ReadString(payload, "submissionId").Trim();
                var favorite = run.Submissions.FirstOrDefault(item => item.Id.ToString() == favoriteId && item.RoundId == CurrentRoundId(run, config) && item.Kind == "bluff" && item.ModerationStatus == "approved" && !item.Hidden);
                if (favorite is null) return (false, "Choose an approved bluff from this round.");
                state["hostFavoriteSubmissionId"] = favorite.Id.ToString();
                if (BoolValue(state, "scoresApplied") && !BoolValue(state, "hostFavoriteScoreApplied") && IntValue(config, "hostFavoritePoints", 0) > 0)
                {
                    await AwardScoreAsync(run, favorite.ParticipantId, null, IntValue(config, "hostFavoritePoints", 0), "Host favorite bluff", CurrentRoundId(run, config), ct);
                    state["hostFavoriteScoreApplied"] = true;
                }
                return (true, null);
            case "closevoting": case "reveal":
                state["phase"] = ActivityPhases.Reveal; state["votingOpen"] = false; state["resultsVisible"] = true; state["answerRevealed"] = true; await ScoreBluffAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                var rounds = ArrayValue(config, "rounds"); var index = IntValue(state, "currentRoundIndex");
                if (index >= Math.Max(0, rounds.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["votingOpen"] = false; state["resultsVisible"] = false; state["answerRevealed"] = false; state["scoresApplied"] = false; state["hostFavoriteScoreApplied"] = false; state.Remove("hostFavoriteSubmissionId"); return (true, null);
            default: return (false, $"Unrecognized bluff action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleBluffParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        if (action is "submit" or "response")
        {
            if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Responses are closed.");
            var text = ReadString(payload, "text").Trim(); if (text.Length is < 1 or > 1000) return (false, "Responses must be between 1 and 1,000 characters.");
            var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
            var status = BoolValue(config, "requireModeration", true) ? "pending" : "approved";
            var json = JsonSerializer.Serialize(new { text }, ActivityJsonDefaults.Options);
            if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "bluff", PayloadJson = json, ModerationStatus = status });
            else { existing.PayloadJson = json; existing.ModerationStatus = status; existing.Hidden = false; existing.UpdatedAt = DateTimeOffset.UtcNow; }
            return (true, null);
        }
        if (action is "vote" or "choose") return await SaveVoteAsync(run, participant, state, payload, roundId, ct, "bluff", allowTruth: true, preventSelfVote: true);
        return (false, "Submit a fake answer or vote when the host opens that phase.");
    }

    private Task<(bool Success, string? Error)> HandleMediaRevealHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var mediaMode = (StringValue(config, "mediaMode") ?? "image").Trim().ToLowerInvariant();
        var totalStages = Math.Clamp(IntValue(config, "totalStages", IntValue(config, "stages", 5)), 1, 50);
        var currentStage = Math.Clamp(IntValue(state, "currentStage"), 0, totalStages);
        switch (action)
        {
            case "playaudio":
                if (mediaMode != "audio") return Task.FromResult((false, (string?)"Audio playback is only available for audio rounds."));
                state["audioNonce"] = LongValue(state, "audioNonce") + 1;
                state["phase"] = ActivityPhases.AcceptingResponses;
                return Task.FromResult((true, (string?)null));
            case "showallcards":
                if (mediaMode != "memorygrid") return Task.FromResult((false, (string?)"Memory cards are only available for Memory Grid rounds."));
                state["memoryCardsVisible"] = true;
                state["memoryTimerRunning"] = true;
                state["memoryStartedAt"] = DateTimeOffset.UtcNow.ToString("O");
                state["memoryDurationMs"] = Math.Clamp(IntValue(config, "memorySeconds", 8), 3, 60) * 1000L;
                state["phase"] = ActivityPhases.AcceptingResponses;
                return Task.FromResult((true, (string?)null));
            case "hidecards":
                if (mediaMode != "memorygrid") return Task.FromResult((false, (string?)"Memory cards are only available for Memory Grid rounds."));
                state["memoryCardsVisible"] = false;
                state["memoryTimerRunning"] = false;
                state.Remove("memoryStartedAt");
                state["phase"] = ActivityPhases.AcceptingResponses;
                return Task.FromResult((true, (string?)null));
            case "revealcard":
                if (mediaMode != "memorygrid") return Task.FromResult((false, (string?)"Memory cards are only available for Memory Grid rounds."));
                var cardId = ReadString(payload, "cardId").Trim();
                var configuredCardIds = ArrayValue(config, "memoryCards").OfType<JsonObject>().Select(card => StringValue(card, "id") ?? "").Where(id => id.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase);
                if (!configuredCardIds.Contains(cardId)) return Task.FromResult((false, (string?)"That memory card is not part of this round."));
                var revealedCardIds = new HashSet<string>(ReadStringArray(state, "revealedCardIds"), StringComparer.OrdinalIgnoreCase);
                revealedCardIds.Add(cardId);
                state["revealedCardIds"] = new JsonArray(revealedCardIds.Select(id => (JsonNode)id).ToArray());
                state["memoryCardsVisible"] = false;
                state["memoryTimerRunning"] = false;
                state["phase"] = ActivityPhases.Reveal;
                return Task.FromResult((true, (string?)null));
            case "clearcards":
                state["revealedCardIds"] = new JsonArray();
                state["memoryCardsVisible"] = false;
                state["memoryTimerRunning"] = false;
                return Task.FromResult((true, (string?)null));
            case "revealstage":
            case "nextstage":
            case "revealstep":
                currentStage = Math.Min(totalStages, currentStage + 1);
                state["currentStage"] = currentStage;
                state["revealed"] = currentStage >= totalStages;
                state["phase"] = currentStage >= totalStages ? ActivityPhases.Reveal : ActivityPhases.AcceptingResponses;
                state["actionNonce"] = LongValue(state, "actionNonce") + 1;
                return Task.FromResult((true, (string?)null));
            case "prevstage":
                state["currentStage"] = Math.Max(0, currentStage - 1);
                state["revealed"] = false;
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["actionNonce"] = LongValue(state, "actionNonce") + 1;
                return Task.FromResult((true, (string?)null));
            case "revealall":
                state["currentStage"] = totalStages;
                state["revealed"] = true;
                state["isAutoPlaying"] = false;
                state["phase"] = ActivityPhases.Reveal;
                state["actionNonce"] = LongValue(state, "actionNonce") + 1;
                return Task.FromResult((true, (string?)null));
            case "startauto":
                state["isAutoPlaying"] = true;
                state["actionNonce"] = LongValue(state, "actionNonce") + 1;
                return Task.FromResult((true, (string?)null));
            case "pauseauto":
                state["isAutoPlaying"] = false;
                state["actionNonce"] = LongValue(state, "actionNonce") + 1;
                return Task.FromResult((true, (string?)null));
            case "reset":
                state["currentStage"] = 0;
                state["isAutoPlaying"] = false;
                state["revealed"] = false;
                state["revealedCardIds"] = new JsonArray();
                state["memoryCardsVisible"] = false;
                state["memoryTimerRunning"] = false;
                state["audioNonce"] = 0L;
                state["phase"] = ActivityPhases.Lobby;
                state["actionNonce"] = LongValue(state, "actionNonce") + 1;
                return Task.FromResult((true, (string?)null));
            default: return Task.FromResult((false, (string?)$"Unrecognized image reveal action '{action}'."));
        }
    }

    private async Task<(bool Success, string? Error)> HandleDrawingHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var telephone = BoolValue(config, "telephoneChain");
        var chainSteps = ArrayValue(config, "chainSteps");
        switch (action)
        {
            case "open": case "openresponses": case "startdrawing":
                state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false;
                if (telephone) UpdateTelephoneStepState(config, state);
                return (true, null);
            case "close": case "closeresponses": case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "openvoting":
                var votingSeconds = Math.Clamp(IntValue(config, "votingSeconds", 30), 5, 600);
                state["phase"] = ActivityPhases.Voting;
                state["votingOpen"] = true;
                state["votingDurationMs"] = votingSeconds * 1000L;
                state["votingStartedAt"] = DateTimeOffset.UtcNow.ToString("O");
                state["votingTimerRunning"] = true;
                return (true, null);
            case "closevoting": case "reveal":
                state["phase"] = ActivityPhases.Reveal; state["votingOpen"] = false; state["votingTimerRunning"] = false; state["resultsVisible"] = true; await ScoreDrawingAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                if (telephone) action = "nextstep";
                else
                {
                var prompts = ArrayValue(config, "prompts"); var index = IntValue(state, "currentPromptIndex");
                if (index >= Math.Max(0, prompts.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentPromptIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["votingOpen"] = false; state["votingTimerRunning"] = false; state["resultsVisible"] = false; return (true, null);
                }
                goto case "nextstep";
            case "nextstep":
                if (!telephone) return (false, "This drawing does not use a telephone chain.");
                var stepIndex = IntValue(state, "telephoneStepIndex");
                if (stepIndex >= Math.Max(0, chainSteps.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["telephoneStepIndex"] = stepIndex + 1;
                state["phase"] = ActivityPhases.RoundIntro;
                state["responsesOpen"] = false;
                state["responsesLocked"] = false;
                state["resultsVisible"] = false;
                state["telephoneChainRevealed"] = false;
                UpdateTelephoneStepState(config, state);
                return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            default: return (false, $"Unrecognized drawing action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleDrawingParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        if (action is "submit" or "draw" or "response")
        {
            if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Drawing is closed.");
            var telephone = BoolValue(config, "telephoneChain");
            var telephoneKind = StringValue(state, "telephoneStepKind", "drawing");
            if (telephone && telephoneKind == "description")
            {
                var text = ReadString(payload, "text").Trim();
                if (text.Length is < 1 or > 1000) return (false, "Descriptions must be between 1 and 1,000 characters.");
            }
            else if (!ValidateDrawingPayload(payload, config, out var error)) return (false, error);
            var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
            var status = BoolValue(config, "requireModeration", true) ? "pending" : "approved";
            var payloadObject = JsonNode.Parse(payload!.Value.GetRawText()) as JsonObject ?? new JsonObject();
            if (telephone) { payloadObject["stepIndex"] = IntValue(state, "telephoneStepIndex"); payloadObject["kind"] = telephoneKind; }
            var json = payloadObject.ToJsonString(ActivityJsonDefaults.Options);
            if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = telephone ? "telephone" : "drawing", PayloadJson = json, ModerationStatus = status });
            else { existing.PayloadJson = json; existing.ModerationStatus = status; existing.Hidden = false; existing.UpdatedAt = DateTimeOffset.UtcNow; }
            state["submissionCount"] = await db.ActivitySubmissions.CountAsync(x => x.ActivityRunId == run.Id && x.RoundId == roundId, ct) + (existing is null ? 1 : 0);
            return (true, null);
        }
        if (action is "vote" or "choose") return await SaveVoteAsync(run, participant, state, payload, roundId, ct, "drawing", preventSelfVote: true);
        return (false, "Draw or vote when the host opens that phase.");
    }

    private static void UpdateTelephoneStepState(JsonObject config, JsonObject state)
    {
        var steps = ArrayValue(config, "chainSteps");
        var index = Math.Clamp(IntValue(state, "telephoneStepIndex"), 0, Math.Max(0, steps.Count - 1));
        var step = steps.Count > index ? steps[index] as JsonObject : null;
        state["telephoneStepKind"] = StringValue(step, "kind", "drawing");
        state["telephoneStepLabel"] = StringValue(step, "label", $"Step {index + 1}");
        state["telephoneStepPrompt"] = StringValue(step, "prompt", "Continue the chain.");
        state["telephoneStepPhrase"] = StringValue(step, "phrase", "");
        state["telephoneStepCount"] = steps.Count;
    }

    private async Task<(bool Success, string? Error)> HandleOrderingHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var rounds = ArrayValue(config, "rounds");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        var round = rounds.Count > index ? rounds[index] as JsonObject : null;
        var interactionMode = OrderingInteractionMode(config, round);
        switch (action)
        {
            case "open": case "openresponses": case "startsorting":
                state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "close": case "closeresponses": case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "reveal": case "showanswer":
                state["phase"] = ActivityPhases.Reveal; state["responsesOpen"] = false; state["responsesLocked"] = true; state["answerRevealed"] = true;
                state["orderingInteractionMode"] = interactionMode;
                if (interactionMode == "matching")
                {
                    state["correctPairs"] = ArrayValue(round, "pairs").DeepClone();
                    state.Remove("correctOrder");
                    state.Remove("correctGroups");
                }
                else if (interactionMode == "grouping")
                {
                    state["correctGroups"] = ArrayValue(round, "groups").DeepClone();
                    state.Remove("correctOrder");
                    state.Remove("correctPairs");
                }
                else
                {
                    state["correctOrder"] = new JsonArray(ReadStringArray(round, "correctOrder").Select(item => (JsonNode)item).ToArray());
                    state.Remove("correctPairs");
                    state.Remove("correctGroups");
                }
                if (!BoolValue(state, "scoresApplied")) { await ScoreOrderingAsync(run, config, state, ct); state["scoresApplied"] = true; }
                return (true, null);
            case "next": case "nextround":
                if (index >= Math.Max(0, rounds.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; state.Remove("correctOrder"); state.Remove("correctPairs"); state.Remove("correctGroups"); state["scoresApplied"] = false; return (true, null);
            case "previous": case "prev":
                state["currentRoundIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; state.Remove("correctOrder"); state.Remove("correctPairs"); state.Remove("correctGroups"); return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            default: return (false, $"Unrecognized ordering action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleOrderingParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("submit" or "sort" or "answer" or "match" or "group")) return (false, "Arrange the items while the round is open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Sorting is closed.");
        var rounds = ArrayValue(config, "rounds"); var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        var round = rounds.Count > index ? rounds[index] as JsonObject : null;
        var interactionMode = OrderingInteractionMode(config, round);
        JsonObject answerPayload;
        if (interactionMode == "matching")
        {
            if (payload?.TryGetProperty("matches", out var matchesElement) != true || matchesElement.ValueKind != JsonValueKind.Array)
                return (false, "Match every item before submitting.");
            var expectedPairs = ArrayValue(round, "pairs").OfType<JsonObject>().ToArray();
            var leftIds = expectedPairs.Select(item => StringValue(item, "id") ?? "").Where(item => item.Length > 0).ToHashSet(StringComparer.Ordinal);
            var submittedLeft = new HashSet<string>(StringComparer.Ordinal);
            var submittedRight = new HashSet<string>(StringComparer.Ordinal);
            var normalized = new JsonArray();
            foreach (var match in matchesElement.EnumerateArray())
            {
                var leftId = match.TryGetProperty("leftId", out var leftValue) ? leftValue.GetString()?.Trim() ?? "" : "";
                var rightId = match.TryGetProperty("rightId", out var rightValue) ? rightValue.GetString()?.Trim() ?? "" : "";
                if (leftId.Length == 0 || rightId.Length == 0 || !leftIds.Contains(leftId) || !submittedLeft.Add(leftId) || !submittedRight.Add(rightId))
                    return (false, "Each match must use every left item once.");
                normalized.Add(new JsonObject { ["leftId"] = leftId, ["rightId"] = rightId });
            }
            if (normalized.Count != expectedPairs.Length) return (false, "Match every item before submitting.");
            answerPayload = new JsonObject { ["matches"] = normalized };
        }
        else if (interactionMode == "grouping")
        {
            if (payload?.TryGetProperty("groups", out var groupsElement) != true || groupsElement.ValueKind != JsonValueKind.Array)
                return (false, "Place every item into a group before submitting.");
            var expectedItems = ArrayValue(round, "items").OfType<JsonObject>().Select(item => StringValue(item, "id") ?? "").Where(item => item.Length > 0).ToHashSet(StringComparer.Ordinal);
            var submittedItems = new HashSet<string>(StringComparer.Ordinal);
            var normalized = new JsonArray();
            foreach (var group in groupsElement.EnumerateArray())
            {
                var groupId = group.TryGetProperty("groupId", out var groupValue) ? groupValue.GetString()?.Trim() ?? "" : "";
                if (groupId.Length == 0 || group.TryGetProperty("itemIds", out var itemIdsElement) != true || itemIdsElement.ValueKind != JsonValueKind.Array)
                    return (false, "Every group needs a name and its selected items.");
                var itemIds = new JsonArray();
                foreach (var item in itemIdsElement.EnumerateArray())
                {
                    var itemId = item.GetString()?.Trim() ?? "";
                    if (itemId.Length == 0 || !expectedItems.Contains(itemId) || !submittedItems.Add(itemId)) return (false, "Place each item into one group only.");
                    itemIds.Add(itemId);
                }
                if (itemIds.Count == 0) return (false, "Every group needs at least one item.");
                normalized.Add(new JsonObject { ["groupId"] = groupId, ["itemIds"] = itemIds });
            }
            if (submittedItems.Count != expectedItems.Count) return (false, "Place every item into a group before submitting.");
            answerPayload = new JsonObject { ["groups"] = normalized };
        }
        else
        {
            var order = ReadStringArray(payload, "order");
            if (order.Count < 1 || order.Count > 50 || order.Distinct(StringComparer.Ordinal).Count() != order.Count) return (false, "Your order must contain each item once.");
            var items = ArrayValue(round, "items").Select(item => StringValue(item as JsonObject, "id") ?? "").Where(item => item.Length > 0).ToHashSet(StringComparer.Ordinal);
            if (items.Count > 0 && (order.Count != items.Count || order.Any(item => !items.Contains(item)) || items.Any(item => !order.Contains(item, StringComparer.Ordinal))))
                return (false, "Your order must include every item exactly once.");
            answerPayload = new JsonObject { ["order"] = new JsonArray(order.Select(item => (JsonNode)item).ToArray()) };
        }
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var json = answerPayload.ToJsonString(ActivityJsonDefaults.Options);
        if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "ordering", PayloadJson = json });
        else { existing.PayloadJson = json; existing.UpdatedAt = DateTimeOffset.UtcNow; }
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandleWordHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var rounds = ArrayValue(config, "rounds");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        switch (action)
        {
            case "open": case "openresponses": case "startwords":
                state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false;
                var round = rounds.Count > index ? rounds[index] as JsonObject : null;
                var seconds = Math.Clamp(IntValue(round, "seconds", IntValue(config, "seconds", 45)), 5, 600);
                state["timerDurationMs"] = seconds * 1000L;
                state["timerStartedAt"] = DateTimeOffset.UtcNow.ToString("O");
                state["timerRunning"] = true;
                state.Remove("timerPausedAt");
                if (BoolValue(config, "turnBased")) InitializeWordTurn(run, state);
                return (true, null);
            case "close": case "closeresponses": case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; state["timerRunning"] = false; return (true, null);
            case "reveal": case "showwords":
                state["phase"] = ActivityPhases.Reveal; state["responsesOpen"] = false; state["responsesLocked"] = true; state["resultsVisible"] = true; state["timerRunning"] = false; await ScoreWordAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                if (index >= Math.Max(0, rounds.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["resultsVisible"] = false; state["timerRunning"] = false; state.Remove("wordCloud");
                if (BoolValue(config, "turnBased")) InitializeWordTurn(run, state); else ClearWordTurn(state);
                return (true, null);
            case "previous": case "prev":
                state["currentRoundIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["timerRunning"] = false; state.Remove("wordCloud");
                if (BoolValue(config, "turnBased")) InitializeWordTurn(run, state); else ClearWordTurn(state);
                return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            default: return (false, $"Unrecognized word action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleWordParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("submit" or "response" or "words")) return (false, "Send words while the round is open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Word responses are closed.");
        if (BoolValue(state, "timerRunning") && WordTimerRemainingMs(state) <= 0) return (false, "Time is up for this word round.");
        var words = ReadWords(payload);
        if (words.Count is < 1 or > 30) return (false, "Send between 1 and 30 short words.");
        var roundId = CurrentRoundId(run, config);
        var turnBased = BoolValue(config, "turnBased");
        if (turnBased)
        {
            if (StringValue(state, "turnParticipantId") != participant.Id.ToString()) return (false, $"Wait for your turn. {StringValue(state, "turnParticipantName") ?? "Another player"} is up next.");
            var maxWords = Math.Clamp(IntValue(config, "maxWords", 1), 1, 30);
            if (words.Count > maxWords) return (false, $"This round accepts at most {maxWords} word{(maxWords == 1 ? "" : "s")} per turn.");
            var usedWords = ReadStringArray(state, "usedWords");
            var duplicate = words.FirstOrDefault(word => usedWords.Contains(word, StringComparer.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(duplicate) && BoolValue(config, "eliminateOnDuplicate"))
            {
                AddWordTurnElimination(state, participant);
                state["lastTurnMessage"] = $"{participant.DisplayName} repeated “{duplicate}” and is out.";
                AdvanceWordTurn(run, state);
                return (true, null);
            }
            if (!string.IsNullOrWhiteSpace(duplicate)) return (false, $"“{duplicate}” was already used. Try another word.");
            AppendWordTurnWords(state, words);
            var turnStatus = BoolValue(config, "requireModeration", true) ? "pending" : "approved";
            var existingTurn = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
            var existingWords = existingTurn is null ? [] : ReadStringArray(ParseObject(existingTurn.PayloadJson), "words").Select(NormalizeWord).ToList();
            var combinedWords = existingWords.Concat(words).Distinct(StringComparer.OrdinalIgnoreCase).Take(200).ToArray();
            var turnJson = JsonSerializer.Serialize(new { words = combinedWords }, ActivityJsonDefaults.Options);
            if (existingTurn is null)
            {
                db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "word", PayloadJson = turnJson, ModerationStatus = turnStatus });
            }
            else
            {
                existingTurn.Kind = "word";
                existingTurn.PayloadJson = turnJson;
                existingTurn.ModerationStatus = turnStatus;
                existingTurn.Hidden = false;
                existingTurn.UpdatedAt = DateTimeOffset.UtcNow;
            }
            state["submissionCount"] = await db.ActivitySubmissions.CountAsync(x => x.ActivityRunId == run.Id && x.RoundId == roundId, ct) + (existingTurn is null ? 1 : 0);
            state["lastTurnMessage"] = $"{participant.DisplayName} added {words.Count} word{(words.Count == 1 ? "" : "s")} to the chain.";
            AdvanceWordTurn(run, state);
            return (true, null);
        }
        var configuredMaxWords = Math.Clamp(IntValue(config, "maxWords", 30), 1, 30);
        if (words.Count > configuredMaxWords) return (false, $"This round accepts at most {configuredMaxWords} word{(configuredMaxWords == 1 ? "" : "s")} per response.");
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var status = BoolValue(config, "requireModeration", true) ? "pending" : "approved";
        var json = JsonSerializer.Serialize(new { words }, ActivityJsonDefaults.Options);
        if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "word", PayloadJson = json, ModerationStatus = status });
        else { existing.PayloadJson = json; existing.ModerationStatus = status; existing.Hidden = false; existing.UpdatedAt = DateTimeOffset.UtcNow; }
        state["submissionCount"] = await db.ActivitySubmissions.CountAsync(x => x.ActivityRunId == run.Id && x.RoundId == roundId, ct) + (existing is null ? 1 : 0);
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandleMatchPlayerHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var rounds = ArrayValue(config, "rounds");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        switch (action)
        {
            case "selecttarget":
            case "settarget":
                var targetId = ReadGuid(payload, "participantId");
                var target = targetId.HasValue ? run.Participants.FirstOrDefault(item => item.Id == targetId.Value && item.Status != "removed") : null;
                if (target is null) return (false, "Choose an active participant as the target.");
                state["targetParticipantId"] = target.Id.ToString();
                state["targetName"] = target.DisplayName;
                state.Remove("revealedOptionIndex");
                state["answerRevealed"] = false;
                state["scoresApplied"] = false;
                state["phase"] = ActivityPhases.Prompt;
                return (true, null);
            case "open":
            case "openresponses":
                if (!Guid.TryParse(StringValue(state, "targetParticipantId"), out _)) return (false, "Select a target participant before opening the round.");
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["responsesOpen"] = true;
                state["responsesLocked"] = false;
                state["answerRevealed"] = false;
                state.Remove("revealedOptionIndex");
                return (true, null);
            case "close":
            case "closeresponses":
            case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked;
                state["responsesOpen"] = false;
                state["responsesLocked"] = true;
                return (true, null);
            case "reveal":
            case "showmatch":
                var targetParticipantId = StringValue(state, "targetParticipantId");
                var targetSubmission = run.Submissions.FirstOrDefault(item => item.RoundId == CurrentRoundId(run, config) && item.Kind == "matchTarget" && item.ParticipantId.ToString() == targetParticipantId);
                var currentRound = rounds.Count > index ? rounds[index] as JsonObject : null;
                var answerMode = (StringValue(currentRound, "answerMode") ?? "choice").Trim().ToLowerInvariant();
                var targetPayload = targetSubmission is null ? null : ParseObject(targetSubmission.PayloadJson);
                var targetAnswer = answerMode == "choice" && targetPayload is not null ? IntValue(targetPayload, "optionIndex", -1) : -1;
                var targetText = answerMode == "text" ? StringValue(targetPayload, "text")?.Trim() : null;
                if ((answerMode == "choice" && targetAnswer < 0) || (answerMode == "text" && string.IsNullOrWhiteSpace(targetText))) return (false, "The target has not answered yet.");
                state["phase"] = ActivityPhases.Reveal;
                state["responsesOpen"] = false;
                state["responsesLocked"] = true;
                state["answerRevealed"] = true;
                if (answerMode == "choice") { state["revealedOptionIndex"] = targetAnswer; state.Remove("revealedMatchAnswer"); }
                else { state.Remove("revealedOptionIndex"); state["revealedMatchAnswer"] = targetText; }
                await ScoreMatchPlayerAsync(run, config, state, ct);
                return (true, null);
            case "next":
            case "nextround":
                if (index >= Math.Max(0, rounds.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1;
                state["phase"] = ActivityPhases.RoundIntro;
                state["responsesOpen"] = false;
                state["responsesLocked"] = false;
                state["answerRevealed"] = false;
                state["scoresApplied"] = false;
                state.Remove("targetParticipantId");
                state.Remove("targetName");
                state.Remove("revealedOptionIndex");
                return (true, null);
            case "previous":
            case "prev":
                state["currentRoundIndex"] = Math.Max(0, index - 1);
                state["phase"] = ActivityPhases.RoundIntro;
                state["responsesOpen"] = false;
                state["responsesLocked"] = false;
                state["answerRevealed"] = false;
                state["scoresApplied"] = false;
                state.Remove("targetParticipantId");
                state.Remove("targetName");
                state.Remove("revealedOptionIndex");
                return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            default: return (false, $"Unrecognized match action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleMatchPlayerParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "This match round is closed.");
        var rounds = ArrayValue(config, "rounds");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        var round = rounds.Count > index ? rounds[index] as JsonObject : null;
        var options = ArrayValue(round, "options");
        var targetId = StringValue(state, "targetParticipantId");
        var isTarget = targetId == participant.Id.ToString();
        if (isTarget && action is not ("answer" or "submit")) return (false, "The selected player should answer the prompt.");
        if (!isTarget && action is not ("predict" or "choose")) return (false, "Predict the target's answer.");
        var answerMode = (StringValue(round, "answerMode") ?? "choice").Trim().ToLowerInvariant();
        JsonObject answerPayload;
        if (answerMode == "text")
        {
            var text = ReadString(payload, "text").Trim();
            if (text.Length is < 1 or > 200) return (false, "Text answers must be between 1 and 200 characters.");
            answerPayload = new JsonObject { ["text"] = text };
        }
        else
        {
            var optionIndex = ReadInt(payload, "optionIndex", -1);
            if (optionIndex < 0 || optionIndex >= options.Count) return (false, "That choice is not available.");
            answerPayload = new JsonObject { ["optionIndex"] = optionIndex };
        }
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(item => item.ActivityRunId == run.Id && item.ParticipantId == participant.Id && item.RoundId == roundId, ct);
        var kind = isTarget ? "matchTarget" : "matchPrediction";
        var json = answerPayload.ToJsonString(ActivityJsonDefaults.Options);
        if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = kind, PayloadJson = json });
        else { existing.Kind = kind; existing.PayloadJson = json; existing.UpdatedAt = DateTimeOffset.UtcNow; }
        state["responseCount"] = await db.ActivitySubmissions.CountAsync(item => item.ActivityRunId == run.Id && item.RoundId == roundId, ct) + (existing is null ? 1 : 0);
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandleStageChallengeHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var challenges = ArrayValue(config, "challenges");
        var index = Math.Clamp(IntValue(state, "currentChallengeIndex"), 0, Math.Max(0, challenges.Count - 1));
        var challenge = challenges.Count > index ? challenges[index] as JsonObject : null;
        switch (action)
        {
            case "selectcontestant":
            case "selectparticipant":
                var participantId = ReadGuid(payload, "participantId");
                var participant = participantId.HasValue ? run.Participants.FirstOrDefault(item => item.Id == participantId.Value && item.Status != "removed") : null;
                var teamId = ReadGuid(payload, "teamId");
                var team = teamId.HasValue ? run.Teams.FirstOrDefault(item => item.Id == teamId.Value && item.Active) : null;
                if (participant is null && team is null) return (false, "Choose an active contestant or team.");
                state["selectedParticipantId"] = participant?.Id.ToString();
                state["selectedParticipantName"] = participant?.DisplayName ?? team?.Name ?? "Contestant";
                state["selectedTeamId"] = team?.Id.ToString() ?? participant?.TeamId?.ToString();
                state["phase"] = ActivityPhases.Prompt;
                return (true, null);
            case "starttimer":
            case "startchallenge":
                var seconds = Math.Clamp(IntValue(challenge, "seconds", 60), 5, 3600);
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["challengeStatus"] = "running";
                state["timerDurationMs"] = seconds * 1000L;
                state["timerStartedAt"] = DateTimeOffset.UtcNow;
                state.Remove("timerPausedAt");
                state.Remove("outcome");
                state["scoresApplied"] = false;
                state["audienceVotingOpen"] = false;
                state["audienceVoteCounts"] = new JsonObject();
                state["audienceVoteScoreApplied"] = false;
                return (true, null);
            case "pausetimer":
            case "pausechallenge":
                if (DateTimeOffsetValue(state, "timerStartedAt") is null) return (false, "Start the challenge timer first.");
                state["timerPausedAt"] = DateTimeOffset.UtcNow;
                state["challengeStatus"] = "paused";
                return (true, null);
            case "resumetimer":
            case "resumechallenge":
                var startedAt = DateTimeOffsetValue(state, "timerStartedAt");
                var pausedAt = DateTimeOffsetValue(state, "timerPausedAt");
                if (startedAt is null || pausedAt is null) return (false, "The challenge timer is not paused.");
                state["timerStartedAt"] = DateTimeOffset.UtcNow - (pausedAt.Value - startedAt.Value);
                state.Remove("timerPausedAt");
                state["challengeStatus"] = "running";
                return (true, null);
            case "openaudiencevote":
            case "openvote":
                if (!BoolValue(config, "audienceVoting")) return (false, "Enable audience voting in the activity settings first.");
                if (string.IsNullOrWhiteSpace(StringValue(state, "selectedParticipantId"))) return (false, "Choose a contestant before opening the audience vote.");
                if (StringValue(state, "challengeStatus") == "running") return (false, "Pause or finish the timer before opening the audience vote.");
                state["phase"] = ActivityPhases.Voting;
                state["audienceVotingOpen"] = true;
                state["votingOpen"] = true;
                return (true, null);
            case "closeaudiencevote":
            case "closevote":
                if (StringValue(state, "phase") != ActivityPhases.Voting || !BoolValue(state, "audienceVotingOpen")) return (false, "The audience vote is not open.");
                state["phase"] = ActivityPhases.Judging;
                state["audienceVotingOpen"] = false;
                state["votingOpen"] = false;
                state["audienceVoteCounts"] = await GetStageAudienceVoteCountsAsync(run, config, ct);
                return (true, null);
            case "useaudiencevote":
            case "resolveaudiencevote":
                if (StringValue(state, "phase") == ActivityPhases.Voting)
                {
                    state["audienceVotingOpen"] = false;
                    state["votingOpen"] = false;
                }
                if (StringValue(state, "phase") is not (ActivityPhases.Voting or ActivityPhases.Judging)) return (false, "Close the audience vote before using its result.");
                var audienceCounts = await GetStageAudienceVoteCountsAsync(run, config, ct);
                var audienceSuccess = IntValue(audienceCounts, "success");
                var audienceFail = IntValue(audienceCounts, "fail");
                if (audienceSuccess == audienceFail) return (false, audienceSuccess == 0 ? "The audience has not voted yet." : "The audience vote is tied; choose success or fail.");
                state["audienceVoteCounts"] = audienceCounts;
                return await ResolveStageChallengeAsync(run, config, state, challenge, audienceSuccess > audienceFail, ct);
            case "success":
            case "succeed":
            case "fail":
                return await ResolveStageChallengeAsync(run, config, state, challenge, action is "success" or "succeed", ct);
            case "next":
            case "nextchallenge":
                if (index >= Math.Max(0, challenges.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentChallengeIndex"] = index + 1;
                state["phase"] = ActivityPhases.RoundIntro;
                state["challengeStatus"] = "ready";
                state["timerDurationMs"] = 0L;
                state.Remove("timerStartedAt"); state.Remove("timerPausedAt"); state.Remove("outcome"); state.Remove("selectedParticipantId"); state.Remove("selectedParticipantName"); state.Remove("selectedTeamId"); state["audienceVotingOpen"] = false; state["votingOpen"] = false; state["audienceVoteCounts"] = new JsonObject(); state["audienceVoteScoreApplied"] = false;
                return (true, null);
            case "previous":
            case "prevchallenge":
                state["currentChallengeIndex"] = Math.Max(0, index - 1);
                state["phase"] = ActivityPhases.RoundIntro;
                state["challengeStatus"] = "ready";
                state["timerDurationMs"] = 0L;
                state.Remove("timerStartedAt"); state.Remove("timerPausedAt"); state.Remove("outcome");
                return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            case "finish": state["phase"] = ActivityPhases.FinalResults; return (true, null);
            default: return (false, $"Unrecognized stage challenge action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleStageChallengeParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (!BoolValue(config, "audienceVoting")) return (false, "This stage challenge is host-judged without audience voting.");
        if (StringValue(state, "phase") != ActivityPhases.Voting || !BoolValue(state, "audienceVotingOpen")) return (false, "The audience vote is closed.");
        if (action is not ("vote" or "choose" or "submit")) return (false, "Choose whether the contestant succeeds.");
        var outcome = ReadString(payload, "outcome").Trim().ToLowerInvariant();
        if (outcome.Length == 0) outcome = ReadString(payload, "targetId").Trim().ToLowerInvariant();
        if (outcome is not ("success" or "fail")) return (false, "Choose success or fail.");

        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivityVotes.SingleOrDefaultAsync(vote => vote.ActivityRunId == run.Id && vote.VoterParticipantId == participant.Id && vote.RoundId == roundId, ct);
        var voteJson = JsonSerializer.Serialize(new { outcome }, ActivityJsonDefaults.Options);
        if (existing is null)
            db.ActivityVotes.Add(new ActivityVote { ActivityRunId = run.Id, VoterParticipantId = participant.Id, RoundId = roundId, TargetId = outcome, PayloadJson = voteJson });
        else
        {
            existing.TargetId = outcome;
            existing.PayloadJson = voteJson;
            existing.CreatedAt = DateTimeOffset.UtcNow;
        }
        return (true, null);
    }

    private async Task<JsonObject> GetStageAudienceVoteCountsAsync(ActivityRun run, JsonObject config, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        var outcomes = await db.ActivityVotes
            .Where(vote => vote.ActivityRunId == run.Id && vote.RoundId == roundId && (vote.TargetId == "success" || vote.TargetId == "fail"))
            .Select(vote => vote.TargetId)
            .ToListAsync(ct);
        return new JsonObject
        {
            ["success"] = outcomes.Count(outcome => outcome == "success"),
            ["fail"] = outcomes.Count(outcome => outcome == "fail"),
            ["total"] = outcomes.Count
        };
    }

    private async Task<(bool Success, string? Error)> ResolveStageChallengeAsync(ActivityRun run, JsonObject config, JsonObject state, JsonObject? challenge, bool succeeded, CancellationToken ct)
    {
        state["phase"] = ActivityPhases.Reveal;
        state["challengeStatus"] = succeeded ? "success" : "failure";
        state["outcome"] = succeeded ? "success" : "failure";
        state["timerPausedAt"] = DateTimeOffset.UtcNow;
        state["audienceVotingOpen"] = false;
        state["votingOpen"] = false;
        if (!BoolValue(state, "scoresApplied"))
        {
            var selectedParticipantId = Guid.TryParse(StringValue(state, "selectedParticipantId"), out var participantGuid) ? participantGuid : (Guid?)null;
            var selectedTeamId = Guid.TryParse(StringValue(state, "selectedTeamId"), out var teamGuid) ? teamGuid : (Guid?)null;
            var amount = succeeded ? IntValue(challenge, "points", 100) : IntValue(challenge, "failPoints", 0);
            if (amount != 0 && (selectedParticipantId.HasValue || selectedTeamId.HasValue)) await AwardScoreAsync(run, selectedParticipantId, selectedTeamId, amount, succeeded ? "Stage challenge success" : "Stage challenge result", CurrentRoundId(run, config), ct);
            state["scoresApplied"] = true;
        }
        if (BoolValue(config, "audienceVoting") && !BoolValue(state, "audienceVoteScoreApplied"))
        {
            var counts = await GetStageAudienceVoteCountsAsync(run, config, ct);
            state["audienceVoteCounts"] = counts;
            var selectedOutcome = succeeded ? "success" : "fail";
            var audiencePoints = Math.Clamp(IntValue(config, "audienceVotePoints", 25), 0, 1000);
            if (audiencePoints > 0)
            {
                var matchingVoters = await db.ActivityVotes
                    .Where(vote => vote.ActivityRunId == run.Id && vote.RoundId == CurrentRoundId(run, config) && vote.TargetId == selectedOutcome)
                    .Select(vote => vote.VoterParticipantId)
                    .ToListAsync(ct);
                foreach (var voterId in matchingVoters) await AwardScoreAsync(run, voterId, null, audiencePoints, "Audience call bonus", CurrentRoundId(run, config), ct);
            }
            state["audienceVoteScoreApplied"] = true;
        }
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandlePhysicalRoomHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var rounds = ArrayValue(config, "rounds");
        if (rounds.Count == 0) return (false, "Add at least one room round before starting.");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, rounds.Count - 1);
        var round = rounds[index] as JsonObject;
        var seconds = Math.Clamp(IntValue(round, "seconds", 30), 5, 3600);
        var phase = StringValue(state, "phase", ActivityPhases.Lobby);
        var status = StringValue(state, "challengeStatus", "ready");
        var adventure = BoolValue(config, "adventure");

        switch (action)
        {
            case "openchoices":
            case "choosepath":
            {
                if (!adventure) return (false, "Choice branches are only available for Adventure activities.");
                if (phase != ActivityPhases.RoundIntro) return (false, "Open choices from the story intro.");
                var nodeType = AdventureNodeType(round);
                var storyChoices = ReadStringArray(round, "choices");
                if (nodeType == ActivityAdventureNodeTypes.Random)
                    return await ResolveAdventureNodeAsync(run, config, state, round, index, null, rounds, payload, ct);
                if (nodeType == ActivityAdventureNodeTypes.End || (storyChoices.Count == 0 && nodeType == ActivityAdventureNodeTypes.Choice))
                    return await ResolveAdventureNodeAsync(run, config, state, round, index, null, rounds, payload, ct);
                if (storyChoices.Count == 0)
                    return (false, "This story node has no choices. Use Resolve node to continue it.");
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["responsesOpen"] = true;
                state["challengeStatus"] = "choicesOpen";
                state["revealed"] = false;
                return (true, null);
            }
            case "resolvenode":
            case "resolveadventure":
            {
                if (!adventure || phase != ActivityPhases.RoundIntro) return (false, "Resolve story nodes from the story intro.");
                var nodeType = AdventureNodeType(round);
                var nodeChoices = ReadStringArray(round, "choices");
                if (nodeType is ActivityAdventureNodeTypes.Choice or ActivityAdventureNodeTypes.Poll or ActivityAdventureNodeTypes.Quiz && nodeChoices.Count > 0)
                    return (false, "Open the visible story choices before resolving this node.");
                return await ResolveAdventureNodeAsync(run, config, state, round, index, null, rounds, payload, ct);
            }
            case "resolvechoice":
            case "nextbranch":
            {
                if (!adventure || phase != ActivityPhases.AcceptingResponses) return (false, "Open the story choices before resolving the branch.");
                var choiceIndex = ReadInt(payload, "choiceIndex", ReadInt(payload, "optionIndex", -1));
                var storyChoices = ReadStringArray(round, "choices");
                if (choiceIndex < 0 || choiceIndex >= storyChoices.Count) return (false, "Choose one of the visible story paths.");
                return await ResolveAdventureNodeAsync(run, config, state, round, index, choiceIndex, rounds, payload, ct);
            }
            case "next":
            case "nextround":
            {
                if (phase is not (ActivityPhases.Reveal or ActivityPhases.Leaderboard)) return (false, "Reveal the room round before advancing.");
                if (adventure && (BoolValue(state, "adventureTerminal") || IsAdventureTerminalNode(round)))
                {
                    state["phase"] = ActivityPhases.FinalResults;
                    return (true, null);
                }
                if (index >= rounds.Count - 1) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1;
                ResetPhysicalRoomRound(state);
                return (true, null);
            }
            case "previous":
            case "prev":
                if (phase is ActivityPhases.Lobby or ActivityPhases.Complete) return (false, "The room has not started.");
                state["currentRoundIndex"] = Math.Max(0, index - 1);
                ResetPhysicalRoomRound(state);
                return (true, null);
            case "starttimer":
            case "startchallenge":
            case "timer":
                if (phase != ActivityPhases.RoundIntro) return (false, "Start the room timer from the round intro.");
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["challengeStatus"] = "running";
                state["timerDurationMs"] = seconds * 1000L;
                state["timerStartedAt"] = DateTimeOffset.UtcNow;
                state.Remove("timerPausedAt");
                state["revealed"] = false;
                return (true, null);
            case "pausetimer":
            case "pausechallenge":
                if (phase != ActivityPhases.AcceptingResponses || status != "running" || DateTimeOffsetValue(state, "timerStartedAt") is null) return (false, "The room timer is not running.");
                state["timerPausedAt"] = DateTimeOffset.UtcNow;
                state["challengeStatus"] = "paused";
                return (true, null);
            case "resumetimer":
            case "resumechallenge":
                if (phase != ActivityPhases.AcceptingResponses || status != "paused") return (false, "The room timer is not paused.");
                var startedAt = DateTimeOffsetValue(state, "timerStartedAt");
                var pausedAt = DateTimeOffsetValue(state, "timerPausedAt");
                if (startedAt is null || pausedAt is null) return (false, "The room timer is not paused.");
                state["timerStartedAt"] = DateTimeOffset.UtcNow - (pausedAt.Value - startedAt.Value);
                state.Remove("timerPausedAt");
                state["challengeStatus"] = "running";
                return (true, null);
            case "reset":
            case "resetround":
                if (phase is ActivityPhases.Lobby or ActivityPhases.FinalResults or ActivityPhases.Complete) return (false, "There is no active room round to reset.");
                ResetPhysicalRoomRound(state);
                return (true, null);
            case "randomize":
                if (phase != ActivityPhases.RoundIntro) return (false, "Randomize room choices before starting the timer.");
                var choices = ReadStringArray(round, "choices");
                random.Shuffle(choices);
                state["randomizedChoices"] = new JsonArray(choices.Select(choice => (JsonNode)choice).ToArray());
                return (true, null);
            case "reveal":
            case "show":
                if (phase != ActivityPhases.AcceptingResponses || status is not ("running" or "paused")) return (false, "Run the room timer before revealing the round.");
                state["phase"] = ActivityPhases.Reveal;
                state["challengeStatus"] = "revealed";
                state["revealed"] = true;
                state["timerPausedAt"] = DateTimeOffset.UtcNow;
                return (true, null);
            case "showleaderboard":
            case "leaderboard":
                if (phase != ActivityPhases.Reveal) return (false, "Reveal the room round before showing the leaderboard.");
                state["phase"] = ActivityPhases.Leaderboard;
                return (true, null);
            case "finish":
            case "end":
                state["phase"] = ActivityPhases.FinalResults;
                return (true, null);
            default:
                return (false, $"Unrecognized Physical Room action '{action}'.");
        }
    }

    private static void ResetPhysicalRoomRound(JsonObject state)
    {
        state["phase"] = ActivityPhases.RoundIntro;
        state["challengeStatus"] = "ready";
        state["timerDurationMs"] = 0L;
        state.Remove("timerStartedAt");
        state.Remove("timerPausedAt");
        state["revealed"] = false;
        state["adventureTerminal"] = false;
        state["randomizedChoices"] = new JsonArray();
        state["responsesOpen"] = false;
        state.Remove("adventureAnswerCorrect");
        state.Remove("adventureCorrectIndex");
        state.Remove("adventureConditionResult");
        state.Remove("adventureRandomChoice");
    }

    private static void EnsurePhysicalRoomState(JsonObject config, JsonObject state)
    {
        var rounds = ArrayValue(config, "rounds");
        if (rounds.Count == 0) return;
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, rounds.Count - 1);
        state["currentRoundIndex"] = index;
        state["challengeStatus"] = StringValue(state, "challengeStatus", "ready");
        state["timerDurationMs"] = LongValue(state, "timerDurationMs");
        state["revealed"] = BoolValue(state, "revealed");
        state["responsesOpen"] = BoolValue(state, "responsesOpen");
        state["adventureTerminal"] = BoolValue(state, "adventureTerminal");
        if (!state.ContainsKey("adventureHistory")) state["adventureHistory"] = new JsonArray();
    }

    private static int ResolveAdventureBranchIndex(JsonObject? round, int choiceIndex, JsonArray rounds, int fallback)
    {
        var branches = round?["branches"] as JsonObject;
        if (branches is null || !branches.TryGetPropertyValue(choiceIndex.ToString(CultureInfo.InvariantCulture), out var branch) || branch is null)
            return fallback;

        return ResolveAdventureTargetIndex(branch, rounds, fallback);
    }

    private static string AdventureNodeType(JsonObject? round)
    {
        var value = (StringValue(round, "nodeType", ActivityAdventureNodeTypes.Choice) ?? ActivityAdventureNodeTypes.Choice).Trim().ToLowerInvariant();
        return ActivityAdventureNodeTypes.IsValid(value) ? value : ActivityAdventureNodeTypes.Choice;
    }

    private static bool IsAdventureTerminalNode(JsonObject? round)
    {
        if (round is null) return true;
        var nodeType = AdventureNodeType(round);
        return nodeType == ActivityAdventureNodeTypes.End || (nodeType == ActivityAdventureNodeTypes.Choice && ReadStringArray(round, "choices").Count == 0);
    }

    private static int ResolveAdventureTargetIndex(JsonNode? target, JsonArray rounds, int fallback)
    {
        if (target is not JsonValue value) return fallback;
        try
        {
            if (value.TryGetValue<int>(out var numericIndex)) return numericIndex >= 0 && numericIndex < rounds.Count ? numericIndex : fallback;
            if (value.TryGetValue<string>(out var targetId))
            {
                if (string.Equals(targetId, "__end__", StringComparison.OrdinalIgnoreCase)) return -1;
                for (var index = 0; index < rounds.Count; index++)
                    if (string.Equals(StringValue(rounds[index] as JsonObject, "id"), targetId, StringComparison.OrdinalIgnoreCase)) return index;
            }
        }
        catch (InvalidOperationException) { }
        return fallback;
    }

    private static JsonNode? AdventureTarget(JsonObject? round, string key)
        => round?.TryGetPropertyValue(key, out var target) == true ? target : null;

    private static int AdventureSequentialTarget(int index, JsonArray rounds) => index + 1 < rounds.Count ? index + 1 : -1;

    private static int ResolveAdventureNextIndex(JsonObject? round, string nodeType, int index, JsonArray rounds, bool? conditionResult = null)
    {
        var fallback = AdventureSequentialTarget(index, rounds);
        if (nodeType == ActivityAdventureNodeTypes.Condition)
        {
            var targetKey = conditionResult == true ? "trueTarget" : "falseTarget";
            var target = AdventureTarget(round, targetKey) ?? (round?["branches"] as JsonObject)?[conditionResult == true ? "true" : "false"];
            return ResolveAdventureTargetIndex(target, rounds, fallback);
        }
        var next = AdventureTarget(round, "nextTarget") ?? AdventureTarget(round, "next") ?? (round?["branches"] as JsonObject)?["next"];
        return ResolveAdventureTargetIndex(next, rounds, fallback);
    }

    private async Task<(bool Success, string? Error)> ResolveAdventureNodeAsync(
        ActivityRun run,
        JsonObject config,
        JsonObject state,
        JsonObject? round,
        int index,
        int? choiceIndex,
        JsonArray rounds,
        JsonElement? payload,
        CancellationToken ct)
    {
        if (round is null) return (false, "The Adventure node is missing.");
        var nodeType = AdventureNodeType(round);
        var choices = ReadStringArray(round, "choices");
        string? selectedChoice = null;
        if (choiceIndex.HasValue)
        {
            if (choiceIndex.Value < 0 || choiceIndex.Value >= choices.Count) return (false, "Choose one of the visible story paths.");
            selectedChoice = choices[choiceIndex.Value];
        }

        bool? conditionResult = null;
        var effectText = StringValue(round, "revealText", "");
        if (nodeType == ActivityAdventureNodeTypes.Quiz && choiceIndex.HasValue)
        {
            var correctIndex = IntValue(round, "correctIndex", -1);
            conditionResult = correctIndex >= 0 && choiceIndex.Value == correctIndex;
            state["adventureAnswerCorrect"] = conditionResult.Value;
            if (correctIndex >= 0) state["adventureCorrectIndex"] = correctIndex;
            effectText = conditionResult.Value ? "Correct path! The adventure team earns the clue." : "Not quite—the trail takes a different turn.";
        }
        else if (nodeType == ActivityAdventureNodeTypes.Condition)
        {
            var conditionKey = StringValue(round, "conditionKey", "") ?? "";
            var inventory = state["adventureInventory"] as JsonObject;
            var actual = inventory?[conditionKey]?.ToString() ?? StringValue(state, conditionKey, "");
            var expected = StringValue(round, "conditionEquals", "");
            conditionResult = string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
            state["adventureConditionResult"] = conditionResult.Value;
            effectText = conditionResult.Value ? "The team has the item it needs." : "The team needs another clue before this route opens.";
        }
        else if (nodeType == ActivityAdventureNodeTypes.Random)
        {
            var targets = ArrayValue(round, "randomTargets");
            if (targets.Count == 0 && round?["branches"] is JsonObject randomBranches)
                targets = new JsonArray(randomBranches.Select(item => item.Value?.DeepClone()).Where(item => item is not null).ToArray());
            if (targets.Count == 0) return (false, "Random Adventure nodes need at least one destination.");
            var picked = random.NextInt(0, targets.Count);
            state["adventureRandomChoice"] = picked;
            effectText = StringValue(round, "revealText", "The trail chooses a new direction.");
        }

        if (nodeType == ActivityAdventureNodeTypes.Score)
        {
            var delta = IntValue(round, "scoreDelta");
            var target = (StringValue(round, "scoreTarget", "team") ?? "team").Trim().ToLowerInvariant();
            if (delta != 0 && target != "none")
            {
                if (target == "allteams")
                {
                    foreach (var team in run.Teams.Where(item => item.Active)) await AwardScoreAsync(run, null, team.Id, delta, "Adventure story effect", CurrentRoundId(run, config), ct);
                }
                else if (target == "participant")
                {
                    var participantId = ReadGuid(payload, "participantId");
                    if (participantId.HasValue) await AwardScoreAsync(run, participantId, null, delta, "Adventure story effect", CurrentRoundId(run, config), ct);
                }
                else
                {
                    Guid? teamId = ReadGuid(payload, "teamId");
                    if (!teamId.HasValue && Guid.TryParse(StringValue(state, "currentTeamId"), out var currentTeamId)) teamId = currentTeamId;
                    teamId ??= run.Teams.FirstOrDefault(item => item.Active)?.Id;
                    if (teamId.HasValue) await AwardScoreAsync(run, null, teamId, delta, "Adventure story effect", CurrentRoundId(run, config), ct);
                }
            }
            state["adventureScoreDelta"] = delta;
            effectText = delta >= 0 ? $"The team found a bonus worth {delta} points." : $"The trail costs the team {Math.Abs(delta)} points.";
        }
        else if (nodeType == ActivityAdventureNodeTypes.Inventory)
        {
            var key = StringValue(round, "inventoryKey", "item") ?? "item";
            var value = StringValue(round, "inventoryValue", "true") ?? "true";
            var inventory = state["adventureInventory"] as JsonObject ?? new JsonObject();
            inventory[key] = value;
            state["adventureInventory"] = inventory;
            state["adventureInventoryLastKey"] = key;
            state["adventureInventoryLastValue"] = value;
            effectText = StringValue(round, "revealText", $"The team added {value} to its pack.");
        }

        var nextIndex = -1;
        if (nodeType == ActivityAdventureNodeTypes.End)
        {
            nextIndex = -1;
        }
        else if (nodeType == ActivityAdventureNodeTypes.Random)
        {
            var targets = ArrayValue(round, "randomTargets");
            if (targets.Count == 0 && round?["branches"] is JsonObject randomBranches)
                targets = new JsonArray(randomBranches.Select(item => item.Value?.DeepClone()).Where(item => item is not null).ToArray());
            var picked = Math.Clamp(IntValue(state, "adventureRandomChoice"), 0, Math.Max(0, targets.Count - 1));
            nextIndex = ResolveAdventureTargetIndex(targets[picked], rounds, AdventureSequentialTarget(index, rounds));
        }
        else if (choiceIndex.HasValue)
        {
            nextIndex = ResolveAdventureBranchIndex(round, choiceIndex.Value, rounds, AdventureSequentialTarget(index, rounds));
        }
        else
        {
            nextIndex = ResolveAdventureNextIndex(round, nodeType, index, rounds, conditionResult);
        }

        var history = ArrayValue(state, "adventureHistory");
        var historyEntry = new JsonObject
        {
            ["roundIndex"] = index,
            ["nodeType"] = nodeType,
            ["title"] = StringValue(round, "title") ?? $"Node {index + 1}",
            ["effectText"] = effectText ?? ""
        };
        if (choiceIndex.HasValue) { historyEntry["choiceIndex"] = choiceIndex.Value; historyEntry["choice"] = selectedChoice ?? ""; }
        history.Add(historyEntry);
        state["adventureHistory"] = history;
        state["adventureLastChoice"] = selectedChoice ?? (nodeType == ActivityAdventureNodeTypes.Random ? "The story chose a path" : "");
        state["adventureEffectText"] = effectText ?? "";
        state["responsesOpen"] = false;
        if (nextIndex < 0)
        {
            state["adventureTerminal"] = true;
            state["phase"] = ActivityPhases.Reveal;
            state["challengeStatus"] = "revealed";
            state["revealed"] = true;
        }
        else
        {
            nextIndex = Math.Clamp(nextIndex, 0, rounds.Count - 1);
            state["currentRoundIndex"] = nextIndex;
            state["adventureTerminal"] = IsAdventureTerminalNode(rounds[nextIndex] as JsonObject);
            if (BoolValue(state, "adventureTerminal"))
            {
                state["phase"] = ActivityPhases.Reveal;
                state["challengeStatus"] = "revealed";
                state["revealed"] = true;
            }
            else ResetPhysicalRoomRound(state);
        }
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandleAdventureParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("choose" or "vote" or "answer" or "submit")) return (false, "Choose a story path while the adventure is open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "The story choices are closed.");
        var rounds = ArrayValue(config, "rounds");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        var round = rounds.Count > index ? rounds[index] as JsonObject : null;
        var choices = ReadStringArray(round, "choices");
        var choiceIndex = ReadInt(payload, "choiceIndex", ReadInt(payload, "optionIndex", -1));
        if (choiceIndex < 0 || choiceIndex >= choices.Count) return (false, "That story path is not available.");
        var roundId = CurrentRoundId(run, config);
        var voteJson = JsonSerializer.Serialize(new { choiceIndex, choice = choices[choiceIndex] }, ActivityJsonDefaults.Options);
        var existing = await db.ActivityVotes.SingleOrDefaultAsync(vote => vote.ActivityRunId == run.Id && vote.VoterParticipantId == participant.Id && vote.RoundId == roundId, ct);
        if (existing is null) db.ActivityVotes.Add(new ActivityVote { ActivityRunId = run.Id, VoterParticipantId = participant.Id, RoundId = roundId, TargetId = choiceIndex.ToString(CultureInfo.InvariantCulture), PayloadJson = voteJson });
        else { existing.TargetId = choiceIndex.ToString(CultureInfo.InvariantCulture); existing.PayloadJson = voteJson; existing.CreatedAt = DateTimeOffset.UtcNow; }
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandleUtilityHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var utilityType = UtilityType(config);
        switch (action)
        {
            case "flip":
            case "roll":
            case "draw":
            case "pick":
            case "execute":
                return ExecuteUtilityRandomAction(run, config, state, utilityType);
            case "pickperson":
                return ExecuteUtilityRandomAction(run, config, state, ActivityUtilityTypes.RandomPerson);
            case "pickteam":
                return ExecuteUtilityRandomAction(run, config, state, ActivityUtilityTypes.RandomTeam);
            case "revealbox":
            case "openbox":
                return ExecuteUtilityMysteryBox(config, state, payload);
            case "generate":
            case "generateteams":
                return await GenerateUtilityTeamsAsync(run, config, state, payload, ct);
            case "starttimer":
            case "startcountdown":
                return StartUtilityCountdown(config, state);
            case "pausetimer":
            case "pausecountdown":
                return PauseUtilityCountdown(config, state);
            case "resumetimer":
            case "resumecountdown":
                return ResumeUtilityCountdown(config, state);
            case "adjusttime":
                return AdjustUtilityCountdown(config, state, payload);
            case "settime":
                return SetUtilityCountdown(config, state, payload);
            case "retry":
                if (utilityType == ActivityUtilityTypes.MysteryBoxes) return ExecuteUtilityMysteryBox(config, state, null);
                if (utilityType == ActivityUtilityTypes.TeamGenerator) return await GenerateUtilityTeamsAsync(run, config, state, payload, ct);
                if (utilityType == ActivityUtilityTypes.Countdown) return StartUtilityCountdown(config, state);
                return ExecuteUtilityRandomAction(run, config, state, utilityType);
            case "skip":
                state["phase"] = ActivityPhases.RoundComplete;
                state["result"] = null;
                state["skipped"] = true;
                return (true, null);
            case "clear":
            case "resetutility":
                return ResetUtilityState(config, state);
            case "next":
            case "nextround":
                ResetUtilityState(config, state);
                state["roundIndex"] = IntValue(state, "roundIndex") + 1;
                return (true, null);
            case "showleaderboard":
                state["phase"] = ActivityPhases.Leaderboard;
                return (true, null);
            case "finish":
            case "end":
                state["phase"] = ActivityPhases.FinalResults;
                return (true, null);
            default:
                return (false, $"Unrecognized utility action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleEmbeddedUtilityHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (config["embeddedUtility"] is not JsonObject embeddedConfig)
            return (false, "This activity has no embedded utility configured.");

        var embeddedState = state["embeddedUtilityState"] as JsonObject ?? new JsonObject
        {
            ["phase"] = ActivityPhases.RoundIntro,
            ["history"] = new JsonArray(),
            ["revealedBoxIds"] = new JsonArray()
        };
        var prefixLength = action.StartsWith("embeddedutility.", StringComparison.OrdinalIgnoreCase) ? "embeddedutility.".Length : "utility.".Length;
        var embeddedAction = action[prefixLength..].Trim().ToLowerInvariant();
        (bool Success, string? Error) result;
        var utilityType = UtilityType(embeddedConfig);
        switch (embeddedAction)
        {
            case "flip":
            case "roll":
            case "draw":
            case "pick":
            case "execute":
                result = ExecuteUtilityRandomAction(run, embeddedConfig, embeddedState, utilityType);
                break;
            case "pickperson":
                result = ExecuteUtilityRandomAction(run, embeddedConfig, embeddedState, ActivityUtilityTypes.RandomPerson);
                break;
            case "pickteam":
                result = ExecuteUtilityRandomAction(run, embeddedConfig, embeddedState, ActivityUtilityTypes.RandomTeam);
                break;
            case "revealbox":
            case "openbox":
                result = ExecuteUtilityMysteryBox(embeddedConfig, embeddedState, payload);
                break;
            case "starttimer":
            case "startcountdown":
                result = StartUtilityCountdown(embeddedConfig, embeddedState);
                break;
            case "pausetimer":
            case "pausecountdown":
                result = PauseUtilityCountdown(embeddedConfig, embeddedState);
                break;
            case "resumetimer":
            case "resumecountdown":
                result = ResumeUtilityCountdown(embeddedConfig, embeddedState);
                break;
            case "adjusttime":
                result = AdjustUtilityCountdown(embeddedConfig, embeddedState, payload);
                break;
            case "settime":
                result = SetUtilityCountdown(embeddedConfig, embeddedState, payload);
                break;
            case "clear":
            case "reset":
                result = ResetUtilityState(embeddedConfig, embeddedState);
                break;
            default:
                return (false, $"Embedded utility action '{embeddedAction}' is not supported.");
        }

        if (result.Success)
        {
            embeddedState["actionNonce"] = LongValue(embeddedState, "actionNonce") + 1;
            if (state["embeddedUtilityState"] is null) state["embeddedUtilityState"] = embeddedState;
        }
        await Task.CompletedTask;
        return result;
    }

    private (bool Success, string? Error) ExecuteUtilityRandomAction(ActivityRun run, JsonObject config, JsonObject state, string utilityType)
    {
        JsonObject result;
        switch (utilityType)
        {
            case ActivityUtilityTypes.CoinFlip:
            {
                var choices = ReadStringArray(config, "choices");
                if (choices.Count < 2) return (false, "Coin Flip needs at least two choices.");
                var label = choices[random.NextInt(0, choices.Count)];
                result = new JsonObject { ["kind"] = utilityType, ["label"] = label, ["value"] = label };
                break;
            }
            case ActivityUtilityTypes.Dice:
            {
                var sides = Math.Clamp(IntValue(config, "diceSides", 6), 2, 1000);
                var roll = random.NextInt(1, sides + 1);
                result = new JsonObject { ["kind"] = utilityType, ["label"] = $"{roll}", ["value"] = roll, ["sides"] = sides };
                break;
            }
            case ActivityUtilityTypes.RandomNumber:
            {
                var minimum = IntValue(config, "minimum", 1);
                var maximum = Math.Max(minimum, IntValue(config, "maximum", 100));
                var maximumExclusive = maximum == int.MaxValue ? int.MaxValue : maximum + 1;
                var value = random.NextInt(minimum, maximumExclusive);
                result = new JsonObject { ["kind"] = utilityType, ["label"] = $"{value}", ["value"] = value, ["minimum"] = minimum, ["maximum"] = maximum };
                break;
            }
            case ActivityUtilityTypes.ChallengePicker:
            {
                var challenges = ArrayValue(config, "challenges");
                if (challenges.Count == 0) return (false, "Challenge Picker needs at least one challenge.");
                var chosen = challenges[random.NextInt(0, challenges.Count)];
                if (chosen is JsonObject challenge)
                {
                    result = new JsonObject
                    {
                        ["kind"] = utilityType,
                        ["id"] = StringValue(challenge, "id"),
                        ["label"] = StringValue(challenge, "label") ?? StringValue(challenge, "title") ?? "Challenge",
                        ["instructions"] = StringValue(challenge, "instructions") ?? "Complete the challenge.",
                        ["points"] = IntValue(challenge, "points")
                    };
                }
                else
                {
                    result = new JsonObject { ["kind"] = utilityType, ["label"] = chosen?.GetValue<string>() ?? "Challenge" };
                }
                break;
            }
            case ActivityUtilityTypes.RandomPerson:
            {
                var participants = run.Participants
                    .Where(participant => participant.Status != "removed")
                    .OrderBy(participant => participant.JoinedAt)
                    .ToArray();
                if (participants.Length == 0) return (false, "At least one active participant is required to pick a person.");
                var participant = participants[random.NextInt(0, participants.Length)];
                result = new JsonObject
                {
                    ["kind"] = utilityType,
                    ["participantId"] = participant.Id.ToString(),
                    ["label"] = participant.DisplayName,
                    ["value"] = participant.DisplayName
                };
                break;
            }
            case ActivityUtilityTypes.RandomTeam:
            {
                var teams = run.Teams.Where(team => team.Active).OrderBy(team => team.Position).ToArray();
                if (teams.Length == 0) return (false, "Create teams before picking a random team.");
                var team = teams[random.NextInt(0, teams.Length)];
                result = new JsonObject
                {
                    ["kind"] = utilityType,
                    ["teamId"] = team.Id.ToString(),
                    ["label"] = team.Name,
                    ["value"] = team.Name,
                    ["icon"] = team.Icon
                };
                break;
            }
            case ActivityUtilityTypes.Countdown:
                return (false, "Use the countdown timer controls for this utility.");
            default:
                return (false, $"Utility preset '{utilityType}' requires a different host action.");
        }

        RecordUtilityResult(state, result);
        return (true, null);
    }

    private static (bool Success, string? Error) ExecuteUtilityMysteryBox(JsonObject config, JsonObject state, JsonElement? payload)
    {
        var boxes = ArrayValue(config, "boxes").OfType<JsonObject>().ToArray();
        if (boxes.Length < 2) return (false, "Mystery Boxes needs at least two boxes.");
        var revealedIds = ReadStringArray(state, "revealedBoxIds");
        var requestedId = ReadString(payload, "boxId").Trim();
        var requestedIndex = ReadInt(payload, "boxIndex", -1);
        var box = requestedId.Length > 0
            ? boxes.FirstOrDefault(item => StringValue(item, "id") == requestedId)
            : requestedIndex >= 0 && requestedIndex < boxes.Length ? boxes[requestedIndex] : null;
        box ??= boxes.FirstOrDefault(item => !revealedIds.Contains(StringValue(item, "id") ?? "", StringComparer.OrdinalIgnoreCase));
        if (box is null) return (false, "Every mystery box has already been revealed.");

        var id = StringValue(box, "id") ?? $"box-{Array.IndexOf(boxes, box) + 1}";
        if (revealedIds.Contains(id, StringComparer.OrdinalIgnoreCase)) return (false, "That mystery box is already open.");
        var result = new JsonObject
        {
            ["kind"] = ActivityUtilityTypes.MysteryBoxes,
            ["id"] = id,
            ["label"] = StringValue(box, "label") ?? "Mystery Box",
            ["revealed"] = true
        };
        if (box.TryGetPropertyValue("value", out var value) && value is not null) result["value"] = value.DeepClone();
        if (box.TryGetPropertyValue("prize", out var prize) && prize is not null) result["prize"] = prize.DeepClone();
        if (box.TryGetPropertyValue("points", out var points) && points is not null) result["points"] = points.DeepClone();

        var nextRevealedIds = new JsonArray();
        foreach (var existing in revealedIds) nextRevealedIds.Add(existing);
        nextRevealedIds.Add(id);
        state["revealedBoxIds"] = nextRevealedIds;
        RecordUtilityResult(state, result);
        return (true, null);
    }

    private static (bool Success, string? Error) StartUtilityCountdown(JsonObject config, JsonObject state)
    {
        if (UtilityType(config) != ActivityUtilityTypes.Countdown) return (false, "This utility is not a countdown.");
        var durationMs = UtilityDurationMs(config);
        var remainingMs = UtilityCountdownRemainingMs(config, state);
        if (remainingMs <= 0) remainingMs = durationMs;
        state["timerDurationMs"] = durationMs;
        state["timerRemainingMs"] = remainingMs;
        state["timerRunning"] = true;
        state["timerStartedAt"] = DateTimeOffset.UtcNow;
        state.Remove("timerPausedAt");
        state["timerCompleted"] = false;
        state["phase"] = ActivityPhases.AcceptingResponses;
        state["result"] = null;
        state["skipped"] = false;
        return (true, null);
    }

    private static (bool Success, string? Error) PauseUtilityCountdown(JsonObject config, JsonObject state)
    {
        if (UtilityType(config) != ActivityUtilityTypes.Countdown) return (false, "This utility is not a countdown.");
        if (!BoolValue(state, "timerRunning")) return (true, null);
        state["timerRemainingMs"] = UtilityCountdownRemainingMs(config, state);
        state["timerRunning"] = false;
        state.Remove("timerStartedAt");
        state["timerPausedAt"] = DateTimeOffset.UtcNow;
        return (true, null);
    }

    private static (bool Success, string? Error) ResumeUtilityCountdown(JsonObject config, JsonObject state)
    {
        if (UtilityType(config) != ActivityUtilityTypes.Countdown) return (false, "This utility is not a countdown.");
        var remainingMs = UtilityCountdownRemainingMs(config, state);
        if (remainingMs <= 0) return (false, "The countdown is complete. Reset it before resuming.");
        state["timerRemainingMs"] = remainingMs;
        state["timerRunning"] = true;
        state["timerStartedAt"] = DateTimeOffset.UtcNow;
        state.Remove("timerPausedAt");
        state["timerCompleted"] = false;
        state["phase"] = ActivityPhases.AcceptingResponses;
        return (true, null);
    }

    private static (bool Success, string? Error) AdjustUtilityCountdown(JsonObject config, JsonObject state, JsonElement? payload)
    {
        if (UtilityType(config) != ActivityUtilityTypes.Countdown) return (false, "This utility is not a countdown.");
        var deltaSeconds = ReadInt(payload, "deltaSeconds", 0);
        var remainingMs = Math.Clamp(UtilityCountdownRemainingMs(config, state) + (deltaSeconds * 1000L), 0L, 3_600_000L);
        state["timerRemainingMs"] = remainingMs;
        state["timerCompleted"] = remainingMs == 0;
        if (BoolValue(state, "timerRunning")) state["timerStartedAt"] = DateTimeOffset.UtcNow;
        return (true, null);
    }

    private static (bool Success, string? Error) SetUtilityCountdown(JsonObject config, JsonObject state, JsonElement? payload)
    {
        if (UtilityType(config) != ActivityUtilityTypes.Countdown) return (false, "This utility is not a countdown.");
        var seconds = Math.Clamp(ReadInt(payload, "seconds", IntValue(config, "durationSeconds", 60)), 0, 3600);
        var remainingMs = seconds * 1000L;
        state["timerDurationMs"] = Math.Max(1000L, UtilityDurationMs(config));
        state["timerRemainingMs"] = remainingMs;
        state["timerCompleted"] = remainingMs == 0;
        if (BoolValue(state, "timerRunning")) state["timerStartedAt"] = DateTimeOffset.UtcNow;
        return (true, null);
    }

    private static (bool Success, string? Error) ResetUtilityState(JsonObject config, JsonObject state)
    {
        state["phase"] = ActivityPhases.RoundIntro;
        state["result"] = null;
        state["skipped"] = false;
        if (UtilityType(config) == ActivityUtilityTypes.Countdown)
        {
            var durationMs = UtilityDurationMs(config);
            state["timerDurationMs"] = durationMs;
            state["timerRemainingMs"] = durationMs;
            state["timerRunning"] = false;
            state["timerCompleted"] = false;
            state.Remove("timerStartedAt");
            state.Remove("timerPausedAt");
        }
        return (true, null);
    }

    private static long UtilityDurationMs(JsonObject config)
    {
        var seconds = Math.Clamp(IntValue(config, "durationSeconds", 60), 1, 3600);
        return seconds * 1000L;
    }

    private static long UtilityCountdownRemainingMs(JsonObject config, JsonObject state)
    {
        var durationMs = Math.Max(1000L, LongValue(state, "timerDurationMs", UtilityDurationMs(config)));
        if (!BoolValue(state, "timerRunning")) return Math.Clamp(LongValue(state, "timerRemainingMs", durationMs), 0L, durationMs);
        var startedAt = DateTimeOffsetValue(state, "timerStartedAt");
        if (startedAt is null) return Math.Clamp(LongValue(state, "timerRemainingMs", durationMs), 0L, durationMs);
        return Math.Clamp((long)Math.Ceiling((startedAt.Value.AddMilliseconds(LongValue(state, "timerRemainingMs", durationMs)) - DateTimeOffset.UtcNow).TotalMilliseconds), 0L, durationMs);
    }

    private async Task<(bool Success, string? Error)> GenerateUtilityTeamsAsync(ActivityRun run, JsonObject config, JsonObject state, JsonElement? payload, CancellationToken ct)
    {
        var participants = run.Participants
            .Where(participant => participant.Status != "removed")
            .OrderBy(participant => participant.JoinedAt)
            .ToList();
        if (participants.Count < 2) return (false, "Join at least two participants before generating teams.");
        var requestedCount = ReadInt(payload, "teamCount", IntValue(config, "teamCount", 2));
        var teamCount = Math.Clamp(Math.Min(requestedCount, participants.Count), 2, 12);
        var assignmentMode = ReadString(payload, "assignmentMode");
        if (string.IsNullOrWhiteSpace(assignmentMode)) assignmentMode = StringValue(config, "teamAssignmentMode", ActivityUtilityAssignmentModes.Balanced);
        var resolvedAssignmentMode = assignmentMode ?? ActivityUtilityAssignmentModes.Balanced;
        if (!ActivityUtilityAssignmentModes.IsValid(resolvedAssignmentMode)) return (false, "Team assignment mode must be manual, balanced, or random.");

        foreach (var participant in participants) participant.TeamId = null;
        db.ActivityTeams.RemoveRange(run.Teams);
        run.Teams.Clear();
        var teams = new List<ActivityTeam>();
        for (var index = 0; index < teamCount; index++)
        {
            var team = new ActivityTeam
            {
                ActivityRunId = run.Id,
                SessionGroupId = run.SessionGroupId,
                Name = $"Team {index + 1}",
                Position = index,
                Color = TeamColors[index % TeamColors.Length],
                Icon = TeamIcons[index % TeamIcons.Length]
            };
            teams.Add(team);
            run.RunTeams.Add(team);
            run.Teams.Add(team);
        }
        db.ActivityTeams.AddRange(teams);

        if (!resolvedAssignmentMode.Equals(ActivityUtilityAssignmentModes.Manual, StringComparison.OrdinalIgnoreCase))
        {
            random.Shuffle(participants);
            for (var index = 0; index < participants.Count; index++)
            {
                var teamIndex = resolvedAssignmentMode.Equals(ActivityUtilityAssignmentModes.Random, StringComparison.OrdinalIgnoreCase)
                    ? random.NextInt(0, teams.Count)
                    : index % teams.Count;
                participants[index].TeamId = teams[teamIndex].Id;
            }
        }
        var assignmentSummary = new JsonArray(participants.Select(participant => (JsonNode)new JsonObject
        {
            ["participantId"] = participant.Id.ToString(),
            ["name"] = participant.DisplayName,
            ["teamId"] = participant.TeamId?.ToString()
        }).ToArray());
        var result = new JsonObject
        {
            ["kind"] = ActivityUtilityTypes.TeamGenerator,
            ["label"] = resolvedAssignmentMode.Equals(ActivityUtilityAssignmentModes.Manual, StringComparison.OrdinalIgnoreCase)
                ? $"{teamCount} teams ready for manual assignment"
                : $"{teamCount} teams generated",
            ["teamCount"] = teamCount,
            ["assignmentMode"] = resolvedAssignmentMode.ToLowerInvariant(),
            ["assignments"] = assignmentSummary
        };
        RecordUtilityResult(state, result);
        await Task.CompletedTask;
        return (true, null);
    }

    private static void EnsureUtilityState(JsonObject config, JsonObject state)
    {
        var utilityType = UtilityType(config);
        state["utilityType"] = utilityType;
        if (state["revealedBoxIds"] is not JsonArray) state["revealedBoxIds"] = new JsonArray();
        if (state["history"] is not JsonArray) state["history"] = new JsonArray();
        if (utilityType == ActivityUtilityTypes.Countdown)
        {
            var durationMs = UtilityDurationMs(config);
            if (LongValue(state, "timerDurationMs") <= 0) state["timerDurationMs"] = durationMs;
            if (!state.ContainsKey("timerRemainingMs")) state["timerRemainingMs"] = durationMs;
            state["timerRunning"] = BoolValue(state, "timerRunning");
            state["timerCompleted"] = BoolValue(state, "timerCompleted");
        }
    }

    private static void RecordUtilityResult(JsonObject state, JsonObject result)
    {
        state["result"] = result;
        state["phase"] = ActivityPhases.Reveal;
        state["skipped"] = false;
        var history = ArrayValue(state, "history");
        var nextHistory = new JsonArray();
        foreach (var item in history.TakeLast(30)) nextHistory.Add(item?.DeepClone());
        nextHistory.Add(result.DeepClone());
        state["history"] = nextHistory;
    }

    private async Task<(bool Success, string? Error)> HandleBracketHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var entrants = BracketEntrants(config, state);
        if (entrants.Count < 2) return (false, "Add at least two bracket entrants before starting.");
        EnsureBracketState(config, state);
        var currentId = StringValue(state, "currentMatchId");
        var current = currentId is null ? null : BracketMatch(state, currentId);

        switch (action)
        {
            case "open":
            case "openvoting":
            case "openmatchup":
                if (current is null) return (false, "There is no pending matchup to open.");
                if (StringValue(current, "status") == "complete") return (false, "Advance to the next matchup first.");
                current["status"] = "open";
                state["phase"] = ActivityPhases.Voting;
                state["votingOpen"] = true;
                return (true, null);
            case "close":
            case "closevoting":
                if (current is null || StringValue(current, "status") != "open") return (false, "Open a matchup before closing its vote.");
                current["status"] = "closed";
                state["phase"] = ActivityPhases.ResponsesLocked;
                state["votingOpen"] = false;
                return (true, null);
            case "reveal":
            case "choosewinner":
                if (current is null || StringValue(current, "status") is not ("open" or "closed")) return (false, "Open a matchup before choosing its winner.");
                var winnerId = ReadString(payload, "winnerId").Trim();
                var entrantAId = StringValue(current, "entrantAId") ?? "";
                var entrantBId = StringValue(current, "entrantBId") ?? "";
                if (winnerId.Length == 0)
                {
                    var counts = run.Votes.Where(vote => vote.RoundId == currentId && (vote.TargetId == entrantAId || vote.TargetId == entrantBId))
                        .GroupBy(vote => vote.TargetId)
                        .Select(group => new { Id = group.Key, Count = group.Count() })
                        .OrderByDescending(group => group.Count)
                        .ThenBy(group => group.Id, StringComparer.Ordinal)
                        .ToArray();
                    if (counts.Length == 0 || (counts.Length > 1 && counts[0].Count == counts[1].Count)) return (false, "Choose the winner when the vote is tied or empty.");
                    winnerId = counts[0].Id;
                }
                if (winnerId != entrantAId && winnerId != entrantBId) return (false, "The winner must be one of the two matchup entrants.");
                current["winnerId"] = winnerId;
                current["status"] = "complete";
                state["revealedWinnerId"] = winnerId;
                state["votingOpen"] = false;
                state["phase"] = ActivityPhases.Reveal;
                await AwardBracketWinAsync(run, config, current, winnerId, currentId, ct);
                return (true, null);
            case "removeentrant":
                if (current is null || StringValue(current, "status") is not ("open" or "closed")) return (false, "Open a matchup before removing an entrant.");
                var removedId = ReadString(payload, "entrantId").Trim();
                var activeAId = StringValue(current, "entrantAId") ?? "";
                var activeBId = StringValue(current, "entrantBId") ?? "";
                var survivingId = removedId == activeAId ? activeBId : removedId == activeBId ? activeAId : "";
                if (removedId.Length == 0 || survivingId.Length == 0) return (false, "Choose one of the active matchup entrants to remove.");
                current["removedEntrantId"] = removedId;
                current["winnerId"] = survivingId;
                current["status"] = "complete";
                state["revealedWinnerId"] = survivingId;
                state["votingOpen"] = false;
                state["phase"] = ActivityPhases.Reveal;
                await AwardBracketWinAsync(run, config, current, survivingId, currentId, ct);
                return (true, null);
            case "skip":
            case "skipmatchup":
                if (current is null || StringValue(current, "status") is not ("open" or "closed" or "pending")) return (false, "There is no active matchup to skip.");
                var skipWinner = ReadString(payload, "winnerId").Trim();
                var skipA = StringValue(current, "entrantAId") ?? "";
                var skipB = StringValue(current, "entrantBId") ?? "";
                if (skipWinner.Length == 0) skipWinner = skipA.Length > 0 ? skipA : skipB;
                if (skipWinner != skipA && skipWinner != skipB) return (false, "Choose a valid entrant when skipping a matchup.");
                current["winnerId"] = skipWinner;
                current["status"] = "complete";
                current["skipped"] = true;
                state["revealedWinnerId"] = skipWinner;
                state["votingOpen"] = false;
                state["phase"] = ActivityPhases.Reveal;
                await AwardBracketWinAsync(run, config, current, skipWinner, currentId, ct);
                return (true, null);
            case "next":
            case "advance":
            case "nextmatchup":
                if (current is not null && StringValue(current, "status") != "complete") return (false, "Reveal a matchup winner before advancing.");
                return AdvanceBracket(state);
            case "resetmatchup":
            case "resetmatch":
                if (current is null) return (false, "There is no active matchup to reset.");
                current["status"] = "pending";
                current.Remove("winnerId");
                current.Remove("removedEntrantId");
                current.Remove("skipped");
                current.Remove("scoreApplied");
                state["phase"] = ActivityPhases.RoundIntro;
                state["votingOpen"] = false;
                state.Remove("revealedWinnerId");
                return (true, null);
            case "showleaderboard":
            case "showbracket":
                state["phase"] = ActivityPhases.Leaderboard;
                return (true, null);
            case "finish":
            case "end":
                state["phase"] = ActivityPhases.FinalResults;
                return (true, null);
            default:
                return (false, $"Unrecognized bracket action '{action}'.");
        }
    }

    private async Task AwardBracketWinAsync(ActivityRun run, JsonObject config, JsonObject current, string winnerId, string? roundId, CancellationToken ct)
    {
        var points = IntValue(config, "pointsPerWin", 0);
        if (points == 0 || BoolValue(current, "scoreApplied")) return;
        if (Guid.TryParse(winnerId, out var winnerGuid))
        {
            if (run.Participants.Any(participant => participant.Id == winnerGuid && participant.Status != "removed"))
                await AwardScoreAsync(run, winnerGuid, null, points, "Bracket win", roundId ?? "bracket", ct);
            else if (run.Teams.Any(team => team.Id == winnerGuid && team.Active))
                await AwardScoreAsync(run, null, winnerGuid, points, "Bracket win", roundId ?? "bracket", ct);
        }
        current["scoreApplied"] = true;
    }

    private async Task<(bool Success, string? Error)> HandleBracketParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (StringValue(state, "phase") != ActivityPhases.Voting || !BoolValue(state, "votingOpen")) return (false, "This matchup is not accepting votes.");
        var currentId = StringValue(state, "currentMatchId");
        var current = currentId is null ? null : BracketMatch(state, currentId);
        if (current is null) return (false, "There is no active matchup.");
        if (action is not ("vote" or "choose" or "submit")) return (false, "Choose the entrant you think should advance.");
        var entrantId = ReadString(payload, "entrantId").Trim();
        if (entrantId.Length == 0) entrantId = ReadString(payload, "targetId").Trim();
        var entrantAId = StringValue(current, "entrantAId") ?? "";
        var entrantBId = StringValue(current, "entrantBId") ?? "";
        if (entrantId is not { Length: > 0 } || (entrantId != entrantAId && entrantId != entrantBId)) return (false, "Choose one of the two active entrants.");

        var bracketRoundId = currentId ?? "bracket-lobby";
        var existing = await db.ActivityVotes.SingleOrDefaultAsync(vote => vote.ActivityRunId == run.Id && vote.VoterParticipantId == participant.Id && vote.RoundId == bracketRoundId, ct);
        var voteJson = JsonSerializer.Serialize(new { entrantId }, ActivityJsonDefaults.Options);
        if (existing is null)
        {
            db.ActivityVotes.Add(new ActivityVote { ActivityRunId = run.Id, VoterParticipantId = participant.Id, RoundId = bracketRoundId, TargetId = entrantId, PayloadJson = voteJson });
        }
        else
        {
            existing.TargetId = entrantId;
            existing.PayloadJson = voteJson;
            existing.CreatedAt = DateTimeOffset.UtcNow;
        }
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> HandleSurveyHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var questions = ArrayValue(config, "questions");
        var index = Math.Clamp(IntValue(state, "currentQuestionIndex"), 0, Math.Max(0, questions.Count - 1));
        switch (action)
        {
            case "open":
            case "openbuzzers":
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["responsesOpen"] = true;
                state["buzzLocked"] = false;
                state["buzzWinnerParticipantId"] = null;
                state["buzzWinnerName"] = null;
                state["buzzWinnerTeamId"] = null;
                state["stealOpen"] = false;
                state.Remove("stealTeamId");
                state.Remove("stealTeamName");
                state["strikeLimit"] = SurveyStrikeLimit(config);
                state.Remove("surveyMatchInput");
                state.Remove("surveyMatchSuggestions");
                if (SurveyTeamMode(config)) EnsureSurveyTeamTurn(run, state, false);
                return (true, null);
            case "resetbuzzers":
            case "reopen":
                state["buzzLocked"] = false;
                state["responsesOpen"] = true;
                state["buzzWinnerParticipantId"] = null;
                state["buzzWinnerName"] = null;
                state["buzzWinnerTeamId"] = null;
                state.Remove("surveyMatchInput");
                state.Remove("surveyMatchSuggestions");
                state["phase"] = ActivityPhases.AcceptingResponses;
                return (true, null);
            case "suggestmatch":
            {
                var suggestions = SurveyMatchSuggestions(config, state);
                state["surveyMatchSuggestions"] = suggestions;
                return (true, null);
            }
            case "matchanswer": case "revealitem":
                var rank = ReadInt(payload, "rank", 0); var answers = AnswersFor(questions.Count > index ? questions[index] as JsonObject : null, config);
                var answer = answers.FirstOrDefault(x => IntValue(x, "rank") == rank); if (answer is null) return (false, "That survey answer was not found.");
                state["phase"] = ActivityPhases.Reveal; state["revealedRank"] = rank; state["revealedAnswer"] = StringValue(answer, "text"); state["revealedPoints"] = IntValue(answer, "points", IntValue(answer, "count")); state["buzzLocked"] = true;
                var revealedRanks = ArrayValue(state, "revealedRanks").Select(item => item?.GetValue<int>() ?? 0).Where(value => value > 0).ToHashSet();
                var newlyRevealed = revealedRanks.Add(rank);
                state["revealedRanks"] = new JsonArray(revealedRanks.OrderBy(value => value).Select(value => (JsonNode)value).ToArray());
                var points = IntValue(answer, "points", IntValue(answer, "count"));
                if (newlyRevealed) state["revealedScore"] = IntValue(state, "revealedScore") + points;
                var winner = StringValue(state, "buzzWinnerParticipantId");
                var winnerTeamId = BoolValue(state, "stealOpen") ? StringValue(state, "stealTeamId") : StringValue(state, "buzzWinnerTeamId");
                if (newlyRevealed)
                {
                    if (Guid.TryParse(winnerTeamId, out var scoreTeamId) && run.Teams.Any(team => team.Id == scoreTeamId && team.Active))
                        await AwardScoreAsync(run, null, scoreTeamId, points, BoolValue(state, "stealOpen") ? "Steal survey answer" : "Matched survey answer", CurrentRoundId(run, config), ct);
                    else if (Guid.TryParse(winner, out var winnerId))
                        await AwardScoreAsync(run, winnerId, null, points, "Matched survey answer", CurrentRoundId(run, config), ct);
                }
                state["stealOpen"] = false;
                state.Remove("stealTeamId");
                state.Remove("stealTeamName");
                state.Remove("surveyMatchInput");
                state.Remove("surveyMatchSuggestions");
                return (true, null);
            case "revealall":
                var allAnswers = AnswersFor(questions.Count > index ? questions[index] as JsonObject : null, config);
                state["phase"] = ActivityPhases.Reveal;
                state["buzzLocked"] = true;
                state["responsesOpen"] = false;
                state["stealOpen"] = false;
                state.Remove("stealTeamId");
                state.Remove("stealTeamName");
                state.Remove("surveyMatchInput");
                state.Remove("surveyMatchSuggestions");
                state["revealedRanks"] = new JsonArray(allAnswers.Select(item => (JsonNode)IntValue(item, "rank")).Where(item => item.GetValue<int>() > 0).ToArray());
                state.Remove("revealedRank"); state.Remove("revealedAnswer"); state.Remove("revealedPoints");
                return (true, null);
            case "addstrike":
            case "strike":
                var strikes = Math.Clamp(IntValue(state, "strikes") + 1, 0, SurveyStrikeLimit(config));
                state["strikes"] = strikes;
                if (strikes >= SurveyStrikeLimit(config) && BoolValue(config, "stealEnabled") && OpenSurveySteal(run, state)) return (true, null);
                return (true, null);
            case "clearstrikes": state["strikes"] = 0; return (true, null);
            case "closesteeal":
            case "endsteal":
                if (!BoolValue(state, "stealOpen")) return (false, "There is no steal attempt open.");
                state["stealOpen"] = false;
                state.Remove("stealTeamId");
                state.Remove("stealTeamName");
                state["responsesOpen"] = false;
                state["buzzLocked"] = true;
                state["phase"] = ActivityPhases.ResponsesLocked;
                return (true, null);
            case "showleaderboard":
            case "leaderboard":
                state["phase"] = ActivityPhases.Leaderboard;
                state["responsesOpen"] = false;
                return (true, null);
            case "next": case "nextquestion":
                if (index >= Math.Max(0, questions.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentQuestionIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["strikes"] = 0; state.Remove("revealedRank"); state.Remove("revealedRanks"); state.Remove("revealedAnswer"); state.Remove("revealedPoints"); state["buzzLocked"] = false; state["responsesOpen"] = false; state["stealOpen"] = false; state.Remove("stealTeamId"); state.Remove("stealTeamName"); state.Remove("surveyMatchInput"); state.Remove("surveyMatchSuggestions"); if (SurveyTeamMode(config)) EnsureSurveyTeamTurn(run, state, true); return (true, null);
            case "prev": case "prevquestion": case "previous":
                state["currentQuestionIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["strikes"] = 0; state.Remove("revealedRank"); state.Remove("revealedRanks"); state.Remove("revealedAnswer"); state.Remove("revealedPoints"); state["buzzLocked"] = false; state["responsesOpen"] = false; state["stealOpen"] = false; state.Remove("stealTeamId"); state.Remove("stealTeamName"); state.Remove("surveyMatchInput"); state.Remove("surveyMatchSuggestions"); return (true, null);
            default: return (false, $"Unrecognized survey action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleSurveyParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("answer" or "submit" or "buzz")) return (false, "Send an answer when the survey round is open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || BoolValue(state, "buzzLocked") || !BoolValue(state, "responsesOpen", true)) return (false, "The survey board is not accepting answers.");
        var targetTeamId = BoolValue(state, "stealOpen") ? StringValue(state, "stealTeamId") : StringValue(state, "currentTeamId");
        if (SurveyTeamMode(config) && !string.IsNullOrWhiteSpace(targetTeamId) && participant.TeamId?.ToString() != targetTeamId)
            return (false, BoolValue(state, "stealOpen") ? $"Only {StringValue(state, "stealTeamName", "the steal team")} can answer the steal." : $"It is {StringValue(state, "currentTeamName", "the active team")}’s turn.");
        var text = ReadString(payload, "text").Trim(); if (text.Length is < 1 or > 300) return (false, "Answers must be between 1 and 300 characters.");
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var json = JsonSerializer.Serialize(new { text }, ActivityJsonDefaults.Options);
        if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "surveyAnswer", PayloadJson = json });
        else { existing.PayloadJson = json; existing.UpdatedAt = DateTimeOffset.UtcNow; }
        state["surveyMatchInput"] = text;
        state.Remove("surveyMatchSuggestions");
        state["buzzWinnerParticipantId"] = participant.Id.ToString(); state["buzzWinnerName"] = participant.DisplayName; state["buzzWinnerTeamId"] = participant.TeamId?.ToString(); state["buzzLocked"] = true; state["responsesOpen"] = false; state["phase"] = ActivityPhases.Judging;
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> SaveVoteAsync(ActivityRun run, ActivityParticipant participant, JsonObject state, JsonElement? payload, string roundId, CancellationToken ct, string? submissionKind = null, bool allowTruth = false, bool preventSelfVote = false)
    {
        var target = ReadString(payload, "targetId").Trim(); if (target.Length is < 1 or > 80) return (false, "Choose a response to vote for.");
        if (StringValue(state, "phase") != ActivityPhases.Voting || !BoolValue(state, "votingOpen")) return (false, "Voting is closed.");
        if (submissionKind == "drawing" && BoolValue(state, "votingTimerRunning") && DrawingVotingRemainingMs(state) <= 0)
            return (false, "Voting time is up.");
        if (submissionKind is not null)
        {
            if (allowTruth && string.Equals(target, "truth", StringComparison.OrdinalIgnoreCase))
            {
                // The truth is a valid anonymous option for bluffing rounds.
            }
            else if (!Guid.TryParse(target, out var submissionId))
            {
                return (false, "That response is not available for voting.");
            }
            else
            {
                var submissionRoundId = submissionKind == "creative" && roundId.LastIndexOf(':') is var separatorIndex and > 0
                    ? roundId[..separatorIndex]
                    : roundId;
                var submission = run.Submissions.FirstOrDefault(item => item.Id == submissionId && item.RoundId == submissionRoundId && item.Kind == submissionKind && item.ModerationStatus == "approved" && !item.Hidden);
                if (submission is null) return (false, "That response is not available for voting.");
                if (preventSelfVote && submission.ParticipantId == participant.Id) return (false, "Choose another player's response.");
            }
        }
        var existing = await db.ActivityVotes.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.VoterParticipantId == participant.Id && x.RoundId == roundId, ct);
        var voteJson = JsonSerializer.Serialize(new { targetId = target }, ActivityJsonDefaults.Options);
        if (existing is null) db.ActivityVotes.Add(new ActivityVote { ActivityRunId = run.Id, VoterParticipantId = participant.Id, RoundId = roundId, TargetId = target, PayloadJson = voteJson });
        else { existing.TargetId = target; existing.PayloadJson = voteJson; existing.CreatedAt = DateTimeOffset.UtcNow; }
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> AwardFromPayloadAsync(ActivityRun run, JsonObject state, JsonElement? payload, CancellationToken ct)
    {
        var amount = ReadInt(payload, "amount", 0); if (amount is < -100000 or > 100000) return (false, "Point adjustment is out of range.");
        var participantId = ReadGuid(payload, "participantId"); var teamId = ReadGuid(payload, "teamId"); if (participantId is null && teamId is null) return (false, "Choose a player or team.");
        await AwardScoreAsync(run, participantId, teamId, amount, ReadString(payload, "reason").Trim() is { Length: > 0 } reason ? reason : "Host-awarded points", ReadString(payload, "roundId"), ct);
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> UndoScoreAsync(ActivityRun run, JsonElement? payload, CancellationToken ct)
    {
        var eventId = ReadGuid(payload, "scoreEventId");
        var score = eventId.HasValue
            ? run.ScoreEvents.FirstOrDefault(x => x.Id == eventId.Value && !x.IsUndone)
            : run.ScoreEvents.Where(x => !x.IsUndone).OrderByDescending(x => x.CreatedAt).FirstOrDefault();
        if (score is null) return (false, "There is no score event to undo.");
        score.IsUndone = true; score.UndoneAt = DateTimeOffset.UtcNow;
        if (score.TeamId is { } teamId) { var team = run.Teams.FirstOrDefault(x => x.Id == teamId); if (team is not null) team.Score -= score.Amount; }
        return (true, null);
    }

    private static (bool Success, string? Error) RemoveParticipant(ActivityRun run, JsonElement? payload)
    {
        var id = ReadGuid(payload, "participantId"); var participant = id.HasValue ? run.Participants.FirstOrDefault(x => x.Id == id.Value) : null;
        if (participant is null) return (false, "Participant not found."); participant.Status = "removed"; participant.TeamId = null; return (true, null);
    }

    private static (bool Success, string? Error) RenameParticipant(ActivityRun run, JsonElement? payload)
    {
        var id = ReadGuid(payload, "participantId"); var participant = id.HasValue ? run.Participants.FirstOrDefault(x => x.Id == id.Value) : null;
        var name = NormalizeDisplayName(ReadString(payload, "displayName")); if (participant is null || string.IsNullOrWhiteSpace(name)) return (false, "Participant or display name not found."); participant.DisplayName = name; participant.IsAnonymous = false; return (true, null);
    }

    private async Task<(bool Success, string? Error)> ModerateAsync(ActivityRun run, JsonElement? payload, CancellationToken ct)
    {
        var id = ReadGuid(payload, "submissionId"); var submission = id.HasValue ? run.Submissions.FirstOrDefault(x => x.Id == id.Value) : null;
        if (submission is null) return (false, "Submission not found.");
        var status = ReadString(payload, "status").Trim().ToLowerInvariant(); if (status is not ("approved" or "rejected" or "pending")) return (false, "Moderation status is invalid.");
        submission.ModerationStatus = status; submission.Hidden = status == "rejected"; submission.UpdatedAt = DateTimeOffset.UtcNow; await Task.CompletedTask; return (true, null);
    }

    private async Task ScoreQuizAsync(ActivityRun run, JsonArray questions, int index, JsonObject state, CancellationToken ct)
    {
        var config = ParseConfig(run);
        var modifiers = QuizModifierSettings.FromConfig(config);
        var question = questions.Count > index ? questions[index] as JsonObject : null;
        var answerMode = QuizAnswerMode(question);
        var correctIndex = IntValue(question, "correctIndex", -1);
        var points = Math.Max(0, IntValue(question, "points", 100));
        var roundId = CurrentRoundId(run, config);
        var submissions = run.Submissions
            .Where(x => x.RoundId == roundId && x.Kind == "quizAnswer" && x.ModerationStatus == "approved" && !x.Hidden)
            .ToArray();
        var correctSubmissions = new HashSet<Guid>();

        if (answerMode == "choice")
        {
            foreach (var submission in submissions)
                if (IntValue(ParseObject(submission.PayloadJson), "optionIndex", -1) == correctIndex)
                    correctSubmissions.Add(submission.Id);
        }
        else if (answerMode is "text" or "shorttext")
        {
            var accepted = ReadStringArray(question, "acceptedAnswers");
            var correctText = StringValue(question, "correctText");
            if (!string.IsNullOrWhiteSpace(correctText)) accepted.Add(correctText);
            var normalizedAnswers = accepted.Select(NormalizeSurveyText).Where(value => value.Length > 0).ToHashSet(StringComparer.Ordinal);
            foreach (var submission in submissions)
            {
                var answer = NormalizeSurveyText(StringValue(ParseObject(submission.PayloadJson), "text") ?? "");
                if (answer.Length > 0 && normalizedAnswers.Contains(answer)) correctSubmissions.Add(submission.Id);
            }
        }
        else if (answerMode == "number" && DoubleValue(question, "targetNumber") is double target)
        {
            var numericAnswers = submissions
                .Select(submission => (Submission: submission, Number: DoubleValue(ParseObject(submission.PayloadJson), "number")))
                .Where(item => item.Number.HasValue && double.IsFinite(item.Number.Value))
                .Select(item => (item.Submission, Number: item.Number!.Value))
                .ToArray();
            var tolerance = Math.Max(0, DoubleValue(question, "tolerance") ?? 0);
            var scoringMode = (StringValue(question, "scoringMode") ?? "exact").Trim().ToLowerInvariant();
            IEnumerable<(ActivitySubmission Submission, double Number)> winners = scoringMode switch
            {
                "closest" => numericAnswers.Length == 0
                    ? []
                    : numericAnswers.Where(item => Math.Abs(item.Number - target) == numericAnswers.Min(candidate => Math.Abs(candidate.Number - target))),
                "closestwithoutgoingover" => numericAnswers.Where(item => item.Number <= target).OrderByDescending(item => item.Number).Take(1),
                _ => numericAnswers.Where(item => Math.Abs(item.Number - target) <= tolerance)
            };
            foreach (var winner in winners) correctSubmissions.Add(winner.Submission.Id);
        }

        var responseStartedAt = DateTimeOffsetValue(state, "responseWindowStartedAt");
        foreach (var submission in submissions)
        {
            var participant = run.Participants.FirstOrDefault(item => item.Id == submission.ParticipantId && item.Status != "removed");
            if (participant is null) continue;
            var answer = ParseObject(submission.PayloadJson);
            var isCorrect = correctSubmissions.Contains(submission.Id);
            var wager = modifiers.WagerEnabled
                ? Math.Clamp(IntValue(answer, "wager", modifiers.WagerDefaultPoints), 0, modifiers.WagerMaxPoints)
                : 0;
            var doubleOrNothing = modifiers.DoubleOrNothingEnabled && BoolValue(answer, "doubleOrNothing");
            var earned = isCorrect ? points : 0;

            if (isCorrect && modifiers.SpeedBonusEnabled && responseStartedAt.HasValue)
            {
                var elapsedSeconds = Math.Max(0, (submission.SubmittedAt - responseStartedAt.Value).TotalSeconds);
                var remainingRatio = Math.Clamp(1d - elapsedSeconds / modifiers.SpeedBonusWindowSeconds, 0d, 1d);
                earned += (int)Math.Round(modifiers.SpeedBonusMaxPoints * remainingRatio, MidpointRounding.AwayFromZero);
            }

            if (isCorrect && modifiers.WagerEnabled) earned += wager;
            if (doubleOrNothing)
            {
                if (isCorrect) earned *= 2;
                else if (points > 0) await AwardScoreAsync(run, participant.Id, null, -points, "Double or nothing", roundId, ct);
            }

            if (isCorrect && earned != 0)
            {
                var reason = answerMode switch
                {
                    "text" or "shorttext" => "Correct short answer",
                    "number" => "Correct number",
                    _ => "Correct answer"
                };
                await AwardScoreAsync(run, participant.Id, null, earned, reason, roundId, ct);
            }
            else if (!isCorrect && modifiers.WagerEnabled && wager > 0)
            {
                await AwardScoreAsync(run, participant.Id, null, -wager, "Quiz wager", roundId, ct);
            }

            if (!isCorrect && modifiers.LivesEnabled)
            {
                participant.Lives = Math.Max(0, participant.Lives - 1);
                if (modifiers.EliminateAtZeroLives && participant.Lives == 0) participant.Status = "eliminated";
            }
        }
    }

    private async Task ScorePredictionAsync(ActivityRun run, string roundId, int correct, CancellationToken ct)
    {
        foreach (var vote in run.Votes.Where(x => x.RoundId == roundId))
        {
            if (int.TryParse(vote.TargetId, out var option) && option == correct) await AwardScoreAsync(run, vote.VoterParticipantId, null, 100, "Accurate prediction", roundId, ct);
        }
    }

    private async Task ScorePollOutcomeAsync(ActivityRun run, JsonObject config, JsonObject state, JsonObject round, string roundId, string mode, CancellationToken ct)
    {
        var options = ArrayValue(round, "options");
        if (options.Count == 0) options = ArrayValue(config, "options");
        if (options.Count == 0) return;

        var counts = run.Votes
            .Where(vote => vote.RoundId == roundId && int.TryParse(vote.TargetId, out var option) && option >= 0 && option < options.Count)
            .GroupBy(vote => int.Parse(vote.TargetId))
            .ToDictionary(group => group.Key, group => group.Count());
        if (counts.Count == 0) return;

        var optionCounts = Enumerable.Range(0, options.Count).Select(index => new { Index = index, Count = counts.GetValueOrDefault(index) }).ToArray();
        var targetCount = mode == "minority" ? optionCounts.Min(item => item.Count) : optionCounts.Max(item => item.Count);
        var winners = optionCounts.Where(item => item.Count == targetCount).Select(item => item.Index).ToArray();
        state["scoringMode"] = mode;
        state["winningOptionIndices"] = new JsonArray(winners.Select(item => (JsonNode)item).ToArray());
        state["winningOptionIndex"] = winners[0];
        state["winningVoteCount"] = targetCount;

        var points = IntValue(round, "points", IntValue(config, "points", 100));
        if (points == 0) return;
        var reason = mode switch
        {
            "minority" => "Minority prediction",
            "prediction" => "Room prediction",
            _ => "Majority prediction"
        };
        foreach (var vote in run.Votes.Where(vote => vote.RoundId == roundId && int.TryParse(vote.TargetId, out var option) && winners.Contains(option)))
            await AwardScoreAsync(run, vote.VoterParticipantId, null, points, reason, roundId, ct);
    }

    private async Task ScoreCreativeAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        var counts = run.Votes.Where(x => x.RoundId == roundId).GroupBy(x => x.TargetId).OrderByDescending(x => x.Count()).ThenBy(x => x.Key, StringComparer.Ordinal).ToList();
        if (counts.Count == 0) return;
        var winner = run.Submissions.FirstOrDefault(x => x.Id.ToString() == counts[0].Key);
        if (winner is null) return;
        var points = IntValue(ArrayValue(config, "prompts").Count > IntValue(state, "currentPromptIndex") ? ArrayValue(config, "prompts")[IntValue(state, "currentPromptIndex")] as JsonObject : null, "points", 100);
        await AwardScoreAsync(run, winner.ParticipantId, null, points, "Audience favorite", roundId, ct);
        state["winningSubmissionId"] = winner.Id.ToString(); state["winningVoteCount"] = counts[0].Count();
    }

    private async Task EnsureCreativeHeadToHeadStateAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        if (ArrayValue(state, "creativeMatches").Count > 0) return;
        var roundId = CurrentRoundId(run, config);
        var submissions = await db.ActivitySubmissions
            .Where(item => item.ActivityRunId == run.Id && item.RoundId == roundId && item.Kind == "creative" && item.ModerationStatus == "approved" && !item.Hidden)
            .ToListAsync(ct);
        submissions = submissions.OrderBy(item => item.SubmittedAt).ThenBy(item => item.Id).ToList();
        var matches = new JsonArray();
        for (var index = 0; index < submissions.Count; index += 2)
        {
            var first = submissions[index].Id.ToString();
            var second = index + 1 < submissions.Count ? submissions[index + 1].Id.ToString() : null;
            var match = new JsonObject
            {
                ["id"] = $"creative-match-1-{(index / 2) + 1}",
                ["round"] = 1,
                ["entrantAId"] = first,
                ["entrantBId"] = second,
                ["status"] = second is null ? "complete" : "pending"
            };
            if (second is null) match["winnerId"] = first;
            matches.Add(match);
        }
        state["creativeMatches"] = matches;
        AdvanceCreativeHeadToHead(state);
    }

    private async Task<(bool Success, string? Error)> ResolveCreativeHeadToHeadAsync(ActivityRun run, JsonObject config, JsonObject state, JsonElement? payload, bool advance, CancellationToken ct)
    {
        await EnsureCreativeHeadToHeadStateAsync(run, config, state, ct);
        var currentId = StringValue(state, "creativeCurrentMatchId");
        var current = currentId is null ? null : CreativeMatch(state, currentId);
        if (current is null) return (false, "There is no creative matchup to resolve.");
        if (StringValue(current, "status") is not ("open" or "closed"))
            return (false, "Open a creative matchup before resolving it.");

        var firstId = StringValue(current, "entrantAId") ?? "";
        var secondId = StringValue(current, "entrantBId") ?? "";
        var winnerId = ReadString(payload, "winnerId").Trim();
        if (winnerId.Length == 0)
        {
            var counts = run.Votes
                .Where(vote => vote.RoundId == currentId && (vote.TargetId == firstId || vote.TargetId == secondId))
                .GroupBy(vote => vote.TargetId)
                .Select(group => new { Id = group.Key, Count = group.Count() })
                .OrderByDescending(group => group.Count)
                .ThenBy(group => group.Id, StringComparer.Ordinal)
                .ToArray();
            if (counts.Length == 0 || (counts.Length > 1 && counts[0].Count == counts[1].Count))
                return (false, "Choose the winner when the head-to-head vote is tied or empty.");
            winnerId = counts[0].Id;
        }
        if (winnerId != firstId && winnerId != secondId) return (false, "The winner must be one of the two creative responses.");

        current["winnerId"] = winnerId;
        current["status"] = "complete";
        state["revealedWinnerId"] = winnerId;
        state["votingOpen"] = false;
        state["phase"] = ActivityPhases.Reveal;
        await AwardCreativeMatchAsync(run, config, current, winnerId, currentId!, ct);

        if (advance) AdvanceCreativeHeadToHead(state);
        else
        {
            var allComplete = ArrayValue(state, "creativeMatches").OfType<JsonObject>().All(match => StringValue(match, "status") == "complete");
            if (allComplete) AdvanceCreativeHeadToHead(state);
        }
        if (StringValue(state, "creativeChampionId") is { } championId)
            await AwardCreativeChampionAsync(run, config, state, championId, ct);
        return (true, null);
    }

    private async Task AwardCreativeMatchAsync(ActivityRun run, JsonObject config, JsonObject match, string winnerId, string roundId, CancellationToken ct)
    {
        if (BoolValue(match, "scoreApplied")) return;
        var points = IntValue(config, "headToHeadMatchPoints", 0);
        if (points > 0 && Guid.TryParse(winnerId, out var submissionId))
        {
            var submission = run.Submissions.FirstOrDefault(item => item.Id == submissionId && item.Kind == "creative");
            if (submission is not null) await AwardScoreAsync(run, submission.ParticipantId, null, points, "Creative matchup win", roundId, ct);
        }
        match["scoreApplied"] = true;
    }

    private async Task AwardCreativeChampionAsync(ActivityRun run, JsonObject config, JsonObject state, string championId, CancellationToken ct)
    {
        if (BoolValue(state, "creativeChampionScoreApplied")) return;
        if (!Guid.TryParse(championId, out var submissionId)) return;
        var submission = run.Submissions.FirstOrDefault(item => item.Id == submissionId && item.Kind == "creative");
        if (submission is null) return;
        var prompts = ArrayValue(config, "prompts");
        var index = Math.Clamp(IntValue(state, "currentPromptIndex"), 0, Math.Max(0, prompts.Count - 1));
        var points = IntValue(prompts.Count > index ? prompts[index] as JsonObject : null, "points", 100);
        if (points > 0) await AwardScoreAsync(run, submission.ParticipantId, null, points, "Creative champion", CurrentRoundId(run, config), ct);
        state["winningPoints"] = points;
        state["creativeChampionScoreApplied"] = true;
    }

    private static (bool Success, string? Error) AdvanceCreativeHeadToHead(JsonObject state)
    {
        var matches = ArrayValue(state, "creativeMatches");
        var currentRound = matches.OfType<JsonObject>().Select(match => IntValue(match, "round", 1)).DefaultIfEmpty(1).Max();
        var pending = matches.OfType<JsonObject>().FirstOrDefault(match => StringValue(match, "status") == "pending" && IntValue(match, "round", 1) == currentRound);
        if (pending is not null)
        {
            state["creativeCurrentMatchId"] = StringValue(pending, "id");
            state["creativeCurrentRound"] = currentRound;
            state["phase"] = ActivityPhases.RoundIntro;
            state["votingOpen"] = false;
            return (true, null);
        }

        var roundMatches = matches.OfType<JsonObject>().Where(match => IntValue(match, "round", 1) == currentRound).ToArray();
        if (roundMatches.Length == 0) return (false, "There are no creative responses to match.");
        var winners = roundMatches.Select(match => StringValue(match, "winnerId")).Where(value => !string.IsNullOrWhiteSpace(value)).Cast<string>().ToArray();
        if (winners.Length <= 1)
        {
            state["creativeChampionId"] = winners.FirstOrDefault();
            state.Remove("creativeCurrentMatchId");
            state["phase"] = ActivityPhases.FinalResults;
            state["votingOpen"] = false;
            state["resultsVisible"] = true;
            state["winningSubmissionId"] = winners.FirstOrDefault();
            return (true, null);
        }

        var nextRound = currentRound + 1;
        var nextMatches = new List<JsonObject>();
        for (var index = 0; index < winners.Length; index += 2)
        {
            var first = winners[index];
            var second = index + 1 < winners.Length ? winners[index + 1] : null;
            var match = new JsonObject
            {
                ["id"] = $"creative-match-{nextRound}-{(index / 2) + 1}",
                ["round"] = nextRound,
                ["entrantAId"] = first,
                ["entrantBId"] = second,
                ["status"] = second is null ? "complete" : "pending"
            };
            if (second is null) match["winnerId"] = first;
            nextMatches.Add(match);
            matches.Add(match);
        }
        var nextPending = nextMatches.FirstOrDefault(match => StringValue(match, "status") == "pending");
        if (nextPending is null) return AdvanceCreativeHeadToHead(state);
        state["creativeCurrentRound"] = nextRound;
        state["creativeCurrentMatchId"] = StringValue(nextPending, "id");
        state["phase"] = ActivityPhases.RoundIntro;
        state["votingOpen"] = false;
        state.Remove("revealedWinnerId");
        return (true, null);
    }

    private static JsonObject? CreativeMatch(JsonObject state, string id) => ArrayValue(state, "creativeMatches")
        .OfType<JsonObject>()
        .FirstOrDefault(match => StringValue(match, "id") == id);

    private async Task ScoreBluffAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        if (BoolValue(state, "scoresApplied")) return;
        var roundId = CurrentRoundId(run, config); var rounds = ArrayValue(config, "rounds"); var index = IntValue(state, "currentRoundIndex"); var truth = StringValue(rounds.Count > index ? rounds[index] as JsonObject : null, "truth") ?? "";
        var truthPoints = IntValue(config, "truthPoints", 100); var bluffPoints = IntValue(config, "bluffPoints", 50);
        foreach (var vote in run.Votes.Where(x => x.RoundId == roundId))
        {
            if (vote.TargetId == "truth") await AwardScoreAsync(run, vote.VoterParticipantId, null, truthPoints, "Found the truth", roundId, ct);
            else if (Guid.TryParse(vote.TargetId, out var submissionId))
            {
                var submission = run.Submissions.FirstOrDefault(x => x.Id == submissionId); if (submission is not null) await AwardScoreAsync(run, submission.ParticipantId, null, bluffPoints, "A player chose your bluff", roundId, ct);
            }
        }
        var favoriteId = StringValue(state, "hostFavoriteSubmissionId");
        var favorite = run.Submissions.FirstOrDefault(item => item.Id.ToString() == favoriteId && item.RoundId == roundId && item.Kind == "bluff" && item.ModerationStatus == "approved" && !item.Hidden);
        var favoritePoints = IntValue(config, "hostFavoritePoints", 0);
        if (favorite is not null && favoritePoints > 0)
        {
            await AwardScoreAsync(run, favorite.ParticipantId, null, favoritePoints, "Host favorite bluff", roundId, ct);
            state["hostFavoriteScoreApplied"] = true;
        }
        state["scoresApplied"] = true;
        state["truth"] = truth;
    }

    private async Task ScoreDrawingAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        var counts = run.Votes.Where(x => x.RoundId == roundId).GroupBy(x => x.TargetId).OrderByDescending(x => x.Count()).ThenBy(x => x.Key, StringComparer.Ordinal).ToList();
        state["drawingVoteCounts"] = new JsonArray(counts.Select(item => (JsonNode)new JsonObject { ["submissionId"] = item.Key, ["votes"] = item.Count() }).ToArray());
        if (counts.Count == 0) return;
        var winner = run.Submissions.FirstOrDefault(x => x.Id.ToString() == counts[0].Key && x.Kind == "drawing" && x.ModerationStatus == "approved" && !x.Hidden);
        if (winner is null) return;
        var prompts = ArrayValue(config, "prompts"); var index = IntValue(state, "currentPromptIndex");
        var points = IntValue(prompts.Count > index ? prompts[index] as JsonObject : null, "points", 100);
        await AwardScoreAsync(run, winner.ParticipantId, null, points, "Audience drawing favorite", roundId, ct);
        state["winningSubmissionId"] = winner.Id.ToString(); state["winningVoteCount"] = counts[0].Count();
    }

    private async Task ScoreOrderingAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config); var rounds = ArrayValue(config, "rounds"); var index = IntValue(state, "currentRoundIndex");
        var round = rounds.Count > index ? rounds[index] as JsonObject : null;
        var interactionMode = OrderingInteractionMode(config, round);
        var points = IntValue(round, "points", 100);
        var scoringMode = (StringValue(config, "scoringMode") ?? "partial").Trim().ToLowerInvariant();
        var results = new JsonArray();

        if (interactionMode == "matching")
        {
            var expected = ArrayValue(round, "pairs").OfType<JsonObject>()
                .Where(item => !string.IsNullOrWhiteSpace(StringValue(item, "left")) && !string.IsNullOrWhiteSpace(StringValue(item, "right")))
                .ToDictionary(item => StringValue(item, "id") ?? StringValue(item, "left")!, item => StringValue(item, "right")!, StringComparer.OrdinalIgnoreCase);
            foreach (var submission in run.Submissions.Where(x => x.RoundId == roundId && x.Kind == "ordering" && x.ModerationStatus == "approved" && !x.Hidden))
            {
                var submitted = ArrayValue(ParseObject(submission.PayloadJson), "matches").OfType<JsonObject>();
                var pairCorrect = submitted.Count(item => StringValue(item, "rightId") is { } right && expected.TryGetValue(StringValue(item, "leftId") ?? "", out var expectedRight) && string.Equals(expectedRight, right, StringComparison.OrdinalIgnoreCase));
                var earned = scoringMode == "exact" && pairCorrect != expected.Count ? 0 : (int)Math.Round(points * (pairCorrect / (double)Math.Max(1, expected.Count)), MidpointRounding.AwayFromZero);
                results.Add(new JsonObject { ["participantId"] = submission.ParticipantId.ToString(), ["correctPairs"] = pairCorrect, ["totalPairs"] = expected.Count, ["earned"] = earned });
                if (earned > 0) await AwardScoreAsync(run, submission.ParticipantId, null, earned, "Matching accuracy", roundId, ct);
            }
            state["orderingResults"] = results;
            state["orderingScoringMode"] = scoringMode;
            return;
        }

        if (interactionMode == "grouping")
        {
            var expected = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var group in ArrayValue(round, "groups").OfType<JsonObject>())
            {
                var groupId = StringValue(group, "id") ?? "";
                foreach (var itemId in ReadStringArray(group, "itemIds"))
                    if (groupId.Length > 0) expected[itemId] = groupId;
            }
            foreach (var submission in run.Submissions.Where(x => x.RoundId == roundId && x.Kind == "ordering" && x.ModerationStatus == "approved" && !x.Hidden))
            {
                var submitted = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var group in ArrayValue(ParseObject(submission.PayloadJson), "groups").OfType<JsonObject>())
                {
                    var groupId = StringValue(group, "groupId") ?? "";
                    foreach (var itemId in ReadStringArray(group, "itemIds")) submitted[itemId] = groupId;
                }
                var groupCorrect = expected.Count(item => submitted.TryGetValue(item.Key, out var groupId) && string.Equals(groupId, item.Value, StringComparison.OrdinalIgnoreCase));
                var earned = scoringMode == "exact" && groupCorrect != expected.Count ? 0 : (int)Math.Round(points * (groupCorrect / (double)Math.Max(1, expected.Count)), MidpointRounding.AwayFromZero);
                results.Add(new JsonObject { ["participantId"] = submission.ParticipantId.ToString(), ["correctItems"] = groupCorrect, ["totalItems"] = expected.Count, ["earned"] = earned });
                if (earned > 0) await AwardScoreAsync(run, submission.ParticipantId, null, earned, "Grouping accuracy", roundId, ct);
            }
            state["orderingResults"] = results;
            state["orderingScoringMode"] = scoringMode;
            return;
        }

        var correct = ReadStringArray(round, "correctOrder");
        if (correct.Count == 0) return;
        foreach (var submission in run.Submissions.Where(x => x.RoundId == roundId && x.Kind == "ordering" && x.ModerationStatus == "approved" && !x.Hidden))
        {
            var submitted = ReadStringArray(ParseObject(submission.PayloadJson), "order");
            var correctPositions = submitted.Select((item, itemIndex) => itemIndex < correct.Count && item == correct[itemIndex]).Count(isCorrect => isCorrect);
            var earned = scoringMode == "exact" && correctPositions != correct.Count
                ? 0
                : (int)Math.Round(points * (correctPositions / (double)correct.Count), MidpointRounding.AwayFromZero);
            results.Add(new JsonObject { ["participantId"] = submission.ParticipantId.ToString(), ["correctPositions"] = correctPositions, ["totalPositions"] = correct.Count, ["earned"] = earned });
            if (earned > 0) await AwardScoreAsync(run, submission.ParticipantId, null, earned, "Ordering accuracy", roundId, ct);
        }
        state["orderingResults"] = results;
        state["orderingScoringMode"] = scoringMode;
    }

    private static string OrderingInteractionMode(JsonObject config, JsonObject? round)
    {
        var mode = (StringValue(round, "interactionMode") ?? StringValue(config, "interactionMode") ?? "ordering").Trim().ToLowerInvariant();
        return mode is "matching" or "grouping" ? mode : "ordering";
    }

    private async Task ScoreWordAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var approved = run.Submissions.Where(x => x.RoundId == roundId && x.Kind == "word" && x.ModerationStatus == "approved" && !x.Hidden).ToArray();
        foreach (var submission in approved)
        {
            foreach (var word in ReadStringArray(ParseObject(submission.PayloadJson), "words")) counts[word] = counts.TryGetValue(word, out var count) ? count + 1 : 1;
        }
        state["wordCloud"] = new JsonArray(counts.OrderByDescending(item => item.Value).ThenBy(item => item.Key, StringComparer.OrdinalIgnoreCase).Select(item => (JsonNode)new JsonObject { ["word"] = item.Key, ["count"] = item.Value }).ToArray());
        var rounds = ArrayValue(config, "rounds"); var index = IntValue(state, "currentRoundIndex"); var pointsPerWord = IntValue(rounds.Count > index ? rounds[index] as JsonObject : null, "points", 10);
        foreach (var submission in approved)
        {
            var words = ReadStringArray(ParseObject(submission.PayloadJson), "words").Distinct(StringComparer.OrdinalIgnoreCase).Count();
            if (words > 0) await AwardScoreAsync(run, submission.ParticipantId, null, Math.Min(1000, words * pointsPerWord), "Approved word contribution", roundId, ct);
        }
    }

    private async Task ScoreMatchPlayerAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        if (BoolValue(state, "scoresApplied")) return;
        var roundId = CurrentRoundId(run, config);
        var rounds = ArrayValue(config, "rounds");
        var currentRound = rounds.Count > IntValue(state, "currentRoundIndex") ? rounds[IntValue(state, "currentRoundIndex")] as JsonObject : null;
        var answerMode = (StringValue(currentRound, "answerMode") ?? "choice").Trim().ToLowerInvariant();
        var answer = IntValue(state, "revealedOptionIndex", -1);
        var answerText = StringValue(state, "revealedMatchAnswer");
        if ((answerMode == "choice" && answer < 0) || (answerMode == "text" && string.IsNullOrWhiteSpace(answerText))) return;
        var points = IntValue(currentRound, "points", 100);
        var matches = 0;
        foreach (var submission in run.Submissions.Where(item => item.RoundId == roundId && item.Kind == "matchPrediction" && !item.Hidden))
        {
            var payload = ParseObject(submission.PayloadJson);
            var isMatch = answerMode == "text"
                ? string.Equals(NormalizeMatchText(StringValue(payload, "text")), NormalizeMatchText(answerText), StringComparison.OrdinalIgnoreCase)
                : IntValue(payload, "optionIndex", -1) == answer;
            if (isMatch)
            {
                matches++;
                await AwardScoreAsync(run, submission.ParticipantId, null, points, "Matched the target", roundId, ct);
            }
        }
        state["matchCount"] = matches;
        state["scoresApplied"] = true;
    }

    private async Task ScoreBoardAsync(ActivityRun run, CancellationToken ct) => await Task.CompletedTask;

    private async Task AwardScoreAsync(ActivityRun run, Guid? participantId, Guid? teamId, int amount, string reason, string? roundId, CancellationToken ct)
    {
        if (participantId is null && teamId is null) return;
        var participant = participantId.HasValue ? run.Participants.FirstOrDefault(x => x.Id == participantId.Value) : null;
        var resolvedTeamId = teamId ?? participant?.TeamId;
        var team = resolvedTeamId.HasValue ? run.Teams.FirstOrDefault(x => x.Id == resolvedTeamId.Value) : null;
        var already = run.ScoreEvents.Any(x => !x.IsUndone && x.ParticipantId == participantId && x.TeamId == resolvedTeamId && x.RoundId == roundId && x.Reason == reason);
        if (already) return;
        // Stamped with the lobby so totals carry across the lesson's games,
        // and with the run so a single game's points stay attributable.
        db.ActivityScoreEvents.Add(new ActivityScoreEvent { ActivityRunId = run.Id, SessionGroupId = run.SessionGroupId, ParticipantId = participantId, TeamId = resolvedTeamId, RoundId = roundId, Amount = amount, Reason = reason });
        if (team is not null) team.Score += amount;
        await Task.CompletedTask;
    }

    private async Task CommitAsync(ActivityRun run, JsonObject state, CancellationToken ct, bool incrementRevision = true)
    {
        state["actionNonce"] = LongValue(state, "actionNonce") + 1;
        run.StateJson = Serialize(state);
        run.CurrentPhase = StringValue(state, "phase") ?? ActivityPhases.Lobby;
        run.UpdatedAt = DateTimeOffset.UtcNow;
        if (incrementRevision) run.Revision++;
        if (run.Status == ActivityRunStatuses.Prepared && run.CurrentPhase != ActivityPhases.Lobby)
        {
            run.Status = ActivityRunStatuses.Live;
            run.StartedAt ??= DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        await BroadcastDisplayAsync(run.Id, ct);
    }

    private async Task BroadcastDisplayAsync(Guid runId, CancellationToken ct)
    {
        var run = await LoadRunAsync(runId, ct);
        if (run?.ActivityDefinition is null) return;
        var envelope = await BuildEnvelopeAsync(run, ProjectionRole.Display, ct);
        await hub.Clients.Group($"run:{runId}").SendAsync("ReceiveState", envelope, ct);
    }

    private static void EnsureBracketState(JsonObject config, JsonObject state)
    {
        var matches = ArrayValue(state, "matchups");
        if (matches.Count == 0)
        {
            matches = new JsonArray();
            var entrants = BracketEntrants(config, state);
            for (var index = 0; index < entrants.Count; index += 2)
            {
                var first = entrants[index] as JsonObject;
                var second = index + 1 < entrants.Count ? entrants[index + 1] as JsonObject : null;
                var firstId = StringValue(first, "id") ?? $"entrant-{index + 1}";
                var secondId = StringValue(second, "id");
                var match = new JsonObject
                {
                    ["id"] = $"match-1-{(index / 2) + 1}",
                    ["round"] = 1,
                    ["entrantAId"] = firstId,
                    ["entrantBId"] = secondId,
                    ["status"] = secondId is null ? "complete" : "pending"
                };
                if (secondId is null) match["winnerId"] = firstId;
                matches.Add(match);
            }
            state["matchups"] = matches;
        }

        if (StringValue(state, "currentMatchId") is null)
        {
            var pending = matches.FirstOrDefault(item => item is JsonObject match && StringValue(match, "status") == "pending") as JsonObject;
            if (pending is not null) state["currentMatchId"] = StringValue(pending, "id");
            else AdvanceBracket(state);
        }
    }

    private async Task EnsureBracketEntrantsAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        var source = StringValue(config, "entrantSource", "teacher");
        if (ArrayValue(state, "bracketEntrants").Count > 0) return;

        var roster = new List<JsonObject>();
        if (source == "participants")
        {
            var participants = await db.ActivityParticipants
                .Where(participant => participant.ActivityRunId == run.Id && participant.Status != "removed")
                .ToListAsync(ct);
            roster.AddRange(participants.OrderBy(participant => participant.JoinedAt).Take(32).Select(participant => new JsonObject { ["id"] = participant.Id.ToString(), ["label"] = participant.DisplayName }));
        }
        else if (source == "teams")
        {
            var teams = await db.ActivityTeams
                .Where(team => team.ActivityRunId == run.Id && team.Active)
                .OrderBy(team => team.Position)
                .Take(32)
                .ToListAsync(ct);
            roster.AddRange(teams.Select(team => new JsonObject { ["id"] = team.Id.ToString(), ["label"] = team.Name }));
        }
        else
        {
            roster.AddRange(ArrayValue(config, "entrants").OfType<JsonObject>().Select(item => (JsonObject)item.DeepClone()));
        }

        var randomSelection = string.Equals(StringValue(config, "entrantSelection", "all"), "random", StringComparison.OrdinalIgnoreCase);
        if (randomSelection)
        {
            random.Shuffle(roster);
            var requestedCount = Math.Clamp(IntValue(config, "randomEntrantCount", roster.Count), 2, 32);
            roster = roster.Take(requestedCount).ToList();
        }

        if (source is not "teacher" || randomSelection)
            state["bracketEntrants"] = new JsonArray(roster.Select(item => (JsonNode)item).ToArray());
    }

    private static JsonArray BracketEntrants(JsonObject config, JsonObject state) =>
        ArrayValue(state, "bracketEntrants") is { Count: > 0 } entrants ? entrants : ArrayValue(config, "entrants");

    /// <summary>
    /// Copies the strongest participants or teams from a completed activity run
    /// into a not-yet-started bracket run. The target run remains authoritative:
    /// names are mapped to its current roster where possible and unmatched
    /// finalists become label-only entrants rather than leaking source IDs.
    /// </summary>
    public async Task<(bool Success, string? Error, int Count)> ImportBracketFinalistsAsync(
        Guid targetRunId,
        Guid sourceRunId,
        int? requestedLimit = null,
        CancellationToken ct = default)
    {
        var gate = Locks.GetOrAdd(targetRunId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var target = await LoadRunAsync(targetRunId, ct);
            var source = await LoadRunAsync(sourceRunId, ct);
            if (target?.ActivityDefinition is null || target.ActivityDefinition.Type != ActivityTypes.Bracket)
                return (false, "Finalists can only be imported into a bracket activity.", 0);
            if (source?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(source.ActivityDefinition))
                return (false, "Choose a completed interactive activity as the finalist source.", 0);
            if (target.Id == source.Id) return (false, "A bracket cannot import finalists from itself.", 0);

            var targetState = ParseObject(target.StateJson);
            var targetPhase = StringValue(targetState, "phase", ActivityPhases.Lobby);
            if (target.Status is not (ActivityRunStatuses.Prepared or ActivityRunStatuses.Live) || targetPhase is not (ActivityPhases.Lobby or ActivityPhases.Setup))
                return (false, "Import finalists before the bracket starts.", 0);
            var sourcePhase = GetPhase(source);
            if (source.Status != ActivityRunStatuses.Ended && sourcePhase is not (ActivityPhases.Leaderboard or ActivityPhases.FinalResults or ActivityPhases.Complete))
                return (false, "The source activity must be on its results screen before finalists can be imported.", 0);

            var candidates = BuildBracketHandoffCandidates(source);
            var limit = Math.Clamp(requestedLimit ?? Math.Min(8, candidates.Count), 2, 32);
            if (candidates.Count < 2) return (false, "The source activity does not have at least two finalist candidates.", 0);

            var chosen = candidates
                .OrderByDescending(candidate => candidate.Score)
                .ThenBy(candidate => candidate.Label, StringComparer.OrdinalIgnoreCase)
                .Take(limit)
                .ToList();
            var targetParticipants = target.Participants.Where(item => item.Status != "removed").ToArray();
            var targetTeams = target.Teams.Where(item => item.Active).ToArray();
            var entrants = new JsonArray();
            foreach (var candidate in chosen)
            {
                var participant = candidate.ParticipantId.HasValue
                    ? targetParticipants.FirstOrDefault(item => SameRosterName(item.DisplayName, candidate.Label))
                    : null;
                var team = candidate.TeamId.HasValue
                    ? targetTeams.FirstOrDefault(item => SameRosterName(item.Name, candidate.Label))
                    : null;
                var mappedId = participant?.Id.ToString() ?? team?.Id.ToString() ?? $"handoff-{Guid.NewGuid():N}";
                entrants.Add(new JsonObject
                {
                    ["id"] = mappedId,
                    ["label"] = candidate.Label,
                    ["sourceRunId"] = source.Id.ToString(),
                    ["sourceParticipantId"] = candidate.ParticipantId?.ToString(),
                    ["sourceTeamId"] = candidate.TeamId?.ToString(),
                    ["sourceScore"] = candidate.Score
                });
            }

            targetState["bracketEntrants"] = entrants;
            targetState["bracketHandoffSourceRunId"] = source.Id.ToString();
            targetState["bracketHandoffSourceName"] = source.ActivityDefinition.Name;
            targetState["matchups"] = new JsonArray();
            targetState["currentMatchId"] = null;
            targetState["currentRound"] = 1;
            targetState["bracketChampionId"] = null;
            targetState["revealedWinnerId"] = null;
            targetState["votingOpen"] = false;
            targetState["phase"] = ActivityPhases.Lobby;
            target.StateJson = Serialize(targetState);
            target.CurrentPhase = ActivityPhases.Lobby;
            target.Revision++;
            target.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            await BroadcastDisplayAsync(target.Id, ct);
            return (true, null, chosen.Count);
        }
        finally
        {
            gate.Release();
        }
    }

    private sealed record BracketHandoffCandidate(string Label, Guid? ParticipantId, Guid? TeamId, int Score);

    private static List<BracketHandoffCandidate> BuildBracketHandoffCandidates(ActivityRun source)
    {
        var participantScores = source.ScoreEvents
            .Where(score => !score.IsUndone && score.ParticipantId.HasValue)
            .GroupBy(score => score.ParticipantId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(score => score.Amount));
        var teamScores = source.ScoreEvents
            .Where(score => !score.IsUndone && score.TeamId.HasValue)
            .GroupBy(score => score.TeamId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(score => score.Amount));

        if (teamScores.Count > 0)
        {
            return source.Teams
                .Where(team => team.Active)
                .Select(team => new BracketHandoffCandidate(team.Name, null, team.Id, teamScores.GetValueOrDefault(team.Id)))
                .OrderByDescending(candidate => candidate.Score)
                .ThenBy(candidate => candidate.Label, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        return source.Participants
            .Where(participant => participant.Status != "removed")
            .Select(participant => new BracketHandoffCandidate(participant.DisplayName, participant.Id, null, participantScores.GetValueOrDefault(participant.Id)))
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool SameRosterName(string left, string right) =>
        string.Equals(string.Join(' ', left.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)), string.Join(' ', right.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)), StringComparison.OrdinalIgnoreCase);

    private static (bool Success, string? Error) AdvanceBracket(JsonObject state)
    {
        var matches = ArrayValue(state, "matchups");
        var pending = matches.FirstOrDefault(item => item is JsonObject match && StringValue(match, "status") == "pending") as JsonObject;
        if (pending is not null)
        {
            state["currentMatchId"] = StringValue(pending, "id");
            state["currentRound"] = IntValue(pending, "round", 1);
            state["phase"] = ActivityPhases.RoundIntro;
            state["votingOpen"] = false;
            state.Remove("revealedWinnerId");
            return (true, null);
        }

        var currentRound = matches
            .OfType<JsonObject>()
            .Select(match => IntValue(match, "round", 1))
            .DefaultIfEmpty(1)
            .Max();
        var roundMatches = matches
            .OfType<JsonObject>()
            .Where(match => IntValue(match, "round", 1) == currentRound)
            .ToArray();
        if (roundMatches.Any(match => StringValue(match, "status") != "complete")) return (false, "Finish every matchup in the current round first.");

        var winners = roundMatches
            .Select(match => StringValue(match, "winnerId"))
            .Where(winner => !string.IsNullOrWhiteSpace(winner))
            .Cast<string>()
            .ToArray();
        if (winners.Length <= 1)
        {
            state["bracketChampionId"] = winners.FirstOrDefault();
            state.Remove("currentMatchId");
            state["phase"] = ActivityPhases.FinalResults;
            state["votingOpen"] = false;
            return (true, null);
        }

        var nextRound = currentRound + 1;
        var nextRoundMatches = new List<JsonObject>();
        for (var index = 0; index < winners.Length; index += 2)
        {
            var first = winners[index];
            var second = index + 1 < winners.Length ? winners[index + 1] : null;
            var match = new JsonObject
            {
                ["id"] = $"match-{nextRound}-{(index / 2) + 1}",
                ["round"] = nextRound,
                ["entrantAId"] = first,
                ["entrantBId"] = second,
                ["status"] = second is null ? "complete" : "pending"
            };
            if (second is null) match["winnerId"] = first;
            nextRoundMatches.Add(match);
            matches.Add(match);
        }

        state["currentRound"] = nextRound;
        state.Remove("revealedWinnerId");
        state["votingOpen"] = false;
        var nextPending = nextRoundMatches.FirstOrDefault(match => StringValue(match, "status") == "pending");
        if (nextPending is null)
        {
            // A bye can complete the newly-created round immediately.
            return AdvanceBracket(state);
        }
        state["currentMatchId"] = StringValue(nextPending, "id");
        state["phase"] = ActivityPhases.RoundIntro;
        return (true, null);
    }

    private static JsonObject? BracketMatch(JsonObject state, string id) => ArrayValue(state, "matchups")
        .OfType<JsonObject>()
        .FirstOrDefault(match => StringValue(match, "id") == id);

    private async Task<ActivityStateEnvelope> BuildEnvelopeAsync(ActivityRun run, ProjectionRole role, CancellationToken ct, Guid? participantId = null)
    {
        var config = ParseConfig(run);
        var state = ParseObject(run.StateJson);
        if (role == ProjectionRole.Display || role == ProjectionRole.Participant) state = await ProjectDisplayStateAsync(run, config, state, ct, participantId);
        var projectedConfig = role == ProjectionRole.Host ? config : ProjectPublicConfig(run.ActivityDefinition!.Type, config, state);
        return new ActivityStateEnvelope(run.Id, run.ActivityDefinitionId, run.ActivityDefinition!.Type, run.Revision, run.Status, ParseUntyped(Serialize(state))!, DateTimeOffset.UtcNow, run.ActivityDefinition.Name, ParseUntyped(run.ActivityDefinition.ThemeJson), ParseUntyped(Serialize(projectedConfig)));
    }


    /// <summary>
    /// Engines where a round has a right answer, so "incorrect" is meaningful.
    /// Everything else reports points earned without implying a verdict.
    /// </summary>

    /// <summary>
    /// Engines where "everyone has answered" is a meaningful head count.
    ///
    /// Excluded: buzzer (one player answers by design), survey board and
    /// turn-based word (team or player turns), stage challenge and physical
    /// room (host-judged, phones optional).
    /// </summary>
    private static bool SupportsAutoAdvance(ActivityRun run) =>
        run.ActivityDefinition!.Type is ActivityTypes.Trivia or ActivityTypes.RapidFire
            or ActivityTypes.Poll or ActivityTypes.Prediction
            or ActivityTypes.Punchline or ActivityTypes.FakeOut
            or ActivityTypes.Drawing or ActivityTypes.Ordering or ActivityTypes.MatchPlayer;

    /// <summary>
    /// Close the response window once every active player is in.
    ///
    /// Opt-in per run, and only ever closes the window early — the host keeps
    /// the manual close and every later transition. Runs inside the per-run
    /// lock on the participant path, so the last submission and the close are
    /// one atomic step rather than a race between phones.
    /// </summary>
    private async Task ApplyAutoAdvanceAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        if (!SupportsAutoAdvance(run)) return;
        // The run-level toggle wins; a definition may pre-arm it.
        var enabled = state.ContainsKey("autoAdvanceEnabled")
            ? BoolValue(state, "autoAdvanceEnabled")
            : BoolValue(config, "autoAdvance");
        if (!enabled) return;
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses) return;
        if (!BoolValue(state, "responsesOpen")) return;

        var eligible = run.Participants
            .Where(x => x.Status is not ("removed" or "eliminated"))
            .Select(x => x.Id)
            .ToHashSet();
        if (eligible.Count == 0) return;

        var roundId = CurrentRoundId(run, config);
        // This runs before CommitAsync, so the submission that just arrived is
        // still only in the change tracker. Counting the database alone would
        // always be one player short and the window would never close.
        var answeredSet = db.ActivitySubmissions.Local
            .Where(x => x.ActivityRunId == run.Id && x.RoundId == roundId)
            .Select(x => x.ParticipantId)
            .ToHashSet();
        answeredSet.UnionWith(await db.ActivitySubmissions
            .Where(x => x.ActivityRunId == run.Id && x.RoundId == roundId)
            .Select(x => x.ParticipantId)
            .ToListAsync(ct));
        answeredSet.UnionWith(db.ActivityVotes.Local
            .Where(x => x.ActivityRunId == run.Id && x.RoundId == roundId)
            .Select(x => x.VoterParticipantId));
        answeredSet.UnionWith(run.Votes.Where(x => x.RoundId == roundId).Select(x => x.VoterParticipantId));

        if (!eligible.IsSubsetOf(answeredSet)) return;

        state["phase"] = ActivityPhases.ResponsesLocked;
        state["responsesOpen"] = false;
        state["responsesLocked"] = true;
        state["timerRunning"] = false;
        // Lets the stage say why the window shut rather than looking arbitrary.
        state["autoAdvanced"] = true;
    }


    /// <summary>
    /// Consecutive scoring rounds per player, counting back from their latest.
    ///
    /// Built in one pass for the whole run rather than per player: the
    /// leaderboard asks for every participant at once, and walking the
    /// submission and score-event lists separately for each of them is
    /// players x rounds x events work on every projection.
    ///
    /// Correctness is not persisted per submission, so the run's own history is
    /// the source: the rounds a player answered, in order, and whether each
    /// scored.
    /// </summary>
    private static Dictionary<Guid, int> BuildStreaks(ActivityRun run)
    {
        var scoredRounds = new HashSet<(Guid Participant, string Round)>();
        foreach (var item in run.ScoreEvents)
        {
            if (item.IsUndone || item.Amount <= 0 || !item.ParticipantId.HasValue || string.IsNullOrEmpty(item.RoundId)) continue;
            // Keyed by run as well: two games in a lesson both have a "round-1".
            scoredRounds.Add((item.ParticipantId.Value, $"{item.ActivityRunId:N}:{item.RoundId}"));
        }

        var roundsByParticipant = new Dictionary<Guid, List<string>>();
        var seen = new HashSet<(Guid, string)>();
        foreach (var submission in run.Submissions.OrderBy(x => x.SubmittedAt))
        {
            if (string.IsNullOrEmpty(submission.RoundId)) continue;
            if (!seen.Add((submission.ParticipantId, submission.RoundId))) continue;
            if (!roundsByParticipant.TryGetValue(submission.ParticipantId, out var rounds))
            {
                rounds = [];
                roundsByParticipant[submission.ParticipantId] = rounds;
            }
            rounds.Add($"{submission.ActivityRunId:N}:{submission.RoundId}");
        }

        var streaks = new Dictionary<Guid, int>();
        foreach (var (participantId, rounds) in roundsByParticipant)
        {
            var streak = 0;
            for (var index = rounds.Count - 1; index >= 0; index--)
            {
                if (!scoredRounds.Contains((participantId, rounds[index]))) break;
                streak++;
            }
            streaks[participantId] = streak;
        }
        return streaks;
    }

    /// <summary>
    /// Whether this player was the first to answer the round correctly. Uses
    /// the server-recorded submission time, never a client claim.
    /// </summary>
    private static bool IsFirstCorrect(ActivityRun run, string roundId, Guid participantId)
    {
        var scorers = run.ScoreEvents
            .Where(item => !item.IsUndone && item.ActivityRunId == run.Id
                && item.RoundId == roundId && item.Amount > 0 && item.ParticipantId.HasValue)
            .Select(item => item.ParticipantId!.Value)
            .ToHashSet();
        if (!scorers.Contains(participantId)) return false;

        var earliest = run.Submissions
            .Where(x => x.RoundId == roundId && x.ParticipantId != Guid.Empty && scorers.Contains(x.ParticipantId))
            .OrderBy(x => x.SubmittedAt)
            .Select(x => (Guid?)x.ParticipantId)
            .FirstOrDefault();
        return earliest == participantId;
    }

    private static readonly HashSet<string> GradedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ActivityTypes.Trivia, ActivityTypes.RapidFire, ActivityTypes.Prediction,
        ActivityTypes.Ordering, ActivityTypes.MatchPlayer, ActivityTypes.Buzzer,
    };

    /// <summary>
    /// How this player is doing, for their own phone.
    ///
    /// Correctness is not persisted per submission, so it is derived: points
    /// scored this round mean they got it, submitting without scoring means
    /// they did not, and no submission at all means they missed it. Engines
    /// without a right answer only report the points.
    /// </summary>
    private async Task<JsonObject> BuildPersonalResultAsync(
        ActivityRun run,
        JsonObject config,
        JsonObject state,
        Guid participantId,
        CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        var live = run.Participants.Where(x => x.Status != "removed").ToArray();

        var totals = live.ToDictionary(
            participant => participant.Id,
            participant => run.ScoreEvents
                .Where(score => !score.IsUndone && score.ParticipantId == participant.Id)
                .Sum(score => score.Amount));

        var score = totals.GetValueOrDefault(participantId);
        // Ties share a rank rather than being ordered arbitrarily.
        var rank = 1 + totals.Values.Count(other => other > score);

        // Round ids repeat between games ("round-1"), so this must stay pinned
        // to the current run even though the totals above span the lesson.
        var roundPoints = run.ScoreEvents
            .Where(item => !item.IsUndone && item.ActivityRunId == run.Id
                && item.ParticipantId == participantId && item.RoundId == roundId)
            .Sum(item => item.Amount);

        var answered = await db.ActivitySubmissions
            .AnyAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participantId && x.RoundId == roundId, ct)
            || run.Votes.Any(x => x.VoterParticipantId == participantId && x.RoundId == roundId);

        var graded = GradedTypes.Contains(run.ActivityDefinition!.Type);
        var outcome = !answered ? "missed"
            : roundPoints > 0 ? "correct"
            : graded ? "incorrect"
            : "scored";

        return new JsonObject
        {
            ["score"] = score,
            ["rank"] = rank,
            ["playerCount"] = live.Length,
            ["roundPoints"] = roundPoints,
            ["outcome"] = outcome,
            ["answered"] = answered,
            ["graded"] = graded,
            ["streak"] = graded ? BuildStreaks(run).GetValueOrDefault(participantId) : 0,
            ["first"] = outcome == "correct" && IsFirstCorrect(run, roundId, participantId),
        };
    }

    private async Task<JsonObject> ProjectDisplayStateAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct, Guid? participantId = null)
    {
        var projected = ParseObject(Serialize(state));
        projected["joinCode"] = run.JoinCode;
        // A phone cannot use a relative path, and the display's own origin is
        // whatever the TV connected to. The teacher-selected address is the one
        // the room should see and scan.
        projected["joinUrl"] = joinAddress.ResolveJoinUrl(run.JoinCode);
        projected["participantCount"] = await db.ActivityParticipants.CountAsync(x => x.ActivityRunId == run.Id && x.Status != "removed", ct);
        // Public roster, lobby only. Bluffing and creative games hide who wrote
        // what until the host reveals, so once play starts a name list in the
        // display projection would give the room something to correlate
        // against. Standings carry names again at reveal/leaderboard time.
        // Personal result for the phone. Only ever the asking player's own
        // standing: their score, their rank, and how this round went. Other
        // players' scores stay out of the participant projection.
        if (participantId.HasValue)
        {
            projected["you"] = await BuildPersonalResultAsync(run, config, state, participantId.Value, ct);
        }

        var rosterPhase = StringValue(state, "phase");
        if (rosterPhase is ActivityPhases.Setup or ActivityPhases.Lobby)
        {
            projected["roster"] = new JsonArray(run.Participants
                .Where(x => x.Status != "removed")
                .OrderBy(x => x.JoinedAt)
                .Select(x => (JsonNode)new JsonObject
                {
                    ["id"] = x.Id.ToString(),
                    ["name"] = x.DisplayName,
                    ["avatar"] = x.Avatar,
                    ["color"] = x.Color,
                }).ToArray());
        }
        var phase = StringValue(state, "phase");
        if (phase is ActivityPhases.Leaderboard or ActivityPhases.FinalResults or ActivityPhases.Complete)
        {
            var graded = GradedTypes.Contains(run.ActivityDefinition!.Type);
            var streaks = graded ? BuildStreaks(run) : [];
            var individualScores = run.Participants.Where(x => x.Status != "removed").Select(participant => new
            {
                participant.Id,
                participant.DisplayName,
                participant.Avatar,
                participant.Color,
                Streak = streaks.GetValueOrDefault(participant.Id),
                Score = run.ScoreEvents.Where(score => !score.IsUndone && score.ParticipantId == participant.Id).Sum(score => score.Amount)
            }).OrderByDescending(item => item.Score).ThenBy(item => item.DisplayName, StringComparer.Ordinal).ToArray();
            projected["leaderboard"] = new JsonArray(individualScores.Select((item, index) => (JsonNode)new JsonObject { ["rank"] = index + 1, ["id"] = item.Id.ToString(), ["name"] = item.DisplayName, ["avatar"] = item.Avatar, ["color"] = item.Color, ["streak"] = item.Streak, ["score"] = item.Score }).ToArray());
            projected["teamLeaderboard"] = new JsonArray(run.Teams.Where(team => team.Active).OrderByDescending(team => team.Score).Select((team, index) => (JsonNode)new JsonObject { ["rank"] = index + 1, ["id"] = team.Id.ToString(), ["name"] = team.Name, ["icon"] = team.Icon, ["score"] = team.Score }).ToArray());
        }
        if (run.ActivityDefinition!.Type is ActivityTypes.Trivia or ActivityTypes.RapidFire)
        {
            var quizModifiers = QuizModifierSettings.FromConfig(config);
            if (quizModifiers.LivesEnabled)
            {
                projected["quizLives"] = new JsonArray(run.Participants.Where(item => item.Status != "removed").Select(item => (JsonNode)new JsonObject
                {
                    ["id"] = item.Id.ToString(),
                    ["name"] = item.DisplayName,
                    ["lives"] = item.Lives,
                    ["active"] = item.Status != "eliminated"
                }).ToArray());
                if (participantId.HasValue)
                    projected["myLives"] = run.Participants.FirstOrDefault(item => item.Id == participantId.Value)?.Lives ?? quizModifiers.StartingLives;
            }
        }
        var roundId = CurrentRoundId(run, config);
        var submissions = run.Submissions.Where(x => x.RoundId == roundId && x.ModerationStatus == "approved" && !x.Hidden).ToList();
        if ((run.ActivityDefinition!.Type is ActivityTypes.Poll or ActivityTypes.Prediction) && !BoolValue(state, "resultsVisible"))
        {
            // Keep the live response count useful without leaking the current
            // distribution to phones before the host reveals it.
            projected["votes"] = new JsonObject();
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Punchline)
        {
            projected["submissions"] = new JsonArray(submissions.Select(x => (JsonNode)new JsonObject { ["id"] = x.Id.ToString(), ["text"] = StringValue(ParseObject(x.PayloadJson), "text") ?? "" }).ToArray());
            if (CreativeVotingStyle(config) == "headToHead")
            {
                var submissionText = submissions.ToDictionary(item => item.Id.ToString(), item => StringValue(ParseObject(item.PayloadJson), "text") ?? "", StringComparer.OrdinalIgnoreCase);
                var matches = new JsonArray();
                foreach (var match in ArrayValue(state, "creativeMatches").OfType<JsonObject>())
                {
                    var firstId = StringValue(match, "entrantAId");
                    var secondId = StringValue(match, "entrantBId");
                    matches.Add(new JsonObject
                    {
                        ["id"] = StringValue(match, "id"),
                        ["round"] = IntValue(match, "round", 1),
                        ["entrantAId"] = firstId,
                        ["entrantA"] = firstId is not null && submissionText.TryGetValue(firstId, out var firstText) ? firstText : "Response A",
                        ["entrantBId"] = secondId,
                        ["entrantB"] = secondId is not null && submissionText.TryGetValue(secondId, out var secondText) ? secondText : "Bye",
                        ["winnerId"] = StringValue(match, "winnerId"),
                        ["status"] = StringValue(match, "status", "pending")
                    });
                }
                projected["creativeMatches"] = matches;
                var currentId = StringValue(state, "creativeCurrentMatchId");
                var current = currentId is null ? null : matches.OfType<JsonObject>().FirstOrDefault(item => StringValue(item, "id") == currentId);
                if (current is not null) projected["creativeCurrentMatch"] = current.DeepClone();
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.FakeOut)
        {
            var visibleBluffs = participantId.HasValue
                ? submissions.Where(submission => submission.ParticipantId != participantId.Value)
                : submissions;
            var fakePhase = StringValue(state, "phase");
            var revealAuthors = BoolValue(config, "revealAuthors", true) && (fakePhase is ActivityPhases.Reveal or ActivityPhases.FinalResults);
            var options = new JsonArray(visibleBluffs.Select(x =>
            {
                var option = new JsonObject { ["id"] = x.Id.ToString(), ["text"] = StringValue(ParseObject(x.PayloadJson), "text") ?? "", ["isTruth"] = false };
                if (revealAuthors) option["author"] = run.Participants.FirstOrDefault(participant => participant.Id == x.ParticipantId)?.DisplayName ?? "Anonymous";
                return (JsonNode)option;
            }).ToArray());
            if (fakePhase is ActivityPhases.Voting or ActivityPhases.Reveal or ActivityPhases.FinalResults)
            {
                var truthOption = new JsonObject { ["id"] = "truth", ["text"] = StringValue(ArrayValue(config, "rounds").Count > IntValue(state, "currentRoundIndex") ? ArrayValue(config, "rounds")[IntValue(state, "currentRoundIndex")] as JsonObject : null, "truth") ?? "", ["isTruth"] = fakePhase is ActivityPhases.Reveal or ActivityPhases.FinalResults };
                if (revealAuthors) truthOption["author"] = "THE REAL ANSWER";
                options.Add(truthOption);
            }
            projected["options"] = options;
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Buzzer)
        {
            projected.Remove("buzzWinnerParticipantId");
            projected.Remove("lockedOutParticipantId");
            if (participantId.HasValue)
                projected["isLockedOut"] = StringValue(state, "lockedOutParticipantId") == participantId.Value.ToString();
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.SurveyBoard)
        {
            projected.Remove("currentTeamId");
            projected.Remove("stealTeamId");
            projected.Remove("surveyMatchInput");
            projected.Remove("surveyMatchSuggestions");
            if (participantId.HasValue)
            {
                var participant = run.Participants.FirstOrDefault(item => item.Id == participantId.Value);
                var activeTeamId = BoolValue(state, "stealOpen") ? StringValue(state, "stealTeamId") : StringValue(state, "currentTeamId");
                var teamRequired = SurveyTeamMode(config) && !string.IsNullOrWhiteSpace(activeTeamId);
                projected["isActiveTeam"] = !teamRequired || participant?.TeamId?.ToString() == activeTeamId;
                projected["isStealTeam"] = !BoolValue(state, "stealOpen") || participant?.TeamId?.ToString() == StringValue(state, "stealTeamId");
            }
            var revealed = IntValue(state, "revealedRank", 0); if (revealed > 0)
            {
                var answers = AnswersFor(ArrayValue(config, "questions").Count > IntValue(state, "currentQuestionIndex") ? ArrayValue(config, "questions")[IntValue(state, "currentQuestionIndex")] as JsonObject : null, config);
                var answer = answers.FirstOrDefault(x => IntValue(x, "rank") == revealed); if (answer is not null) { projected["revealedAnswer"] = StringValue(answer, "text"); projected["revealedPoints"] = IntValue(answer, "points", IntValue(answer, "count")); }
                projected["revealedAnswers"] = new JsonArray(answers.Where(answerItem => ArrayValue(state, "revealedRanks").Any(item => item?.GetValue<int>() == IntValue(answerItem, "rank"))).Select(answerItem => (JsonNode)new JsonObject { ["rank"] = IntValue(answerItem, "rank"), ["text"] = StringValue(answerItem, "text"), ["points"] = IntValue(answerItem, "points", IntValue(answerItem, "count")) }).ToArray());
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Drawing)
        {
            var drawingPhase = StringValue(state, "phase");
            var telephone = BoolValue(config, "telephoneChain");
            if (telephone)
            {
                var stepIndex = Math.Clamp(IntValue(state, "telephoneStepIndex"), 0, Math.Max(0, ArrayValue(config, "chainSteps").Count - 1));
                var chainStep = ArrayValue(config, "chainSteps").Count > stepIndex ? ArrayValue(config, "chainSteps")[stepIndex] as JsonObject : null;
                projected["telephoneStepIndex"] = stepIndex;
                projected["telephoneStepKind"] = StringValue(chainStep, "kind", "drawing");
                projected["telephoneStepLabel"] = StringValue(chainStep, "label", $"Step {stepIndex + 1}");
                projected["telephoneStepPrompt"] = StringValue(chainStep, "prompt", "Continue the chain.");
                projected["telephoneStepPhrase"] = StringValue(chainStep, "phrase", "");
                projected["telephoneStepCount"] = ArrayValue(config, "chainSteps").Count;
                if (participantId.HasValue && stepIndex > 0)
                {
                    var previous = run.Submissions.FirstOrDefault(submission => submission.ParticipantId == participantId.Value && submission.Kind == "telephone" && submission.RoundId == $"telephone-step-{stepIndex - 1}" && submission.ModerationStatus == "approved" && !submission.Hidden);
                    if (previous is not null)
                    {
                        var previousPayload = ParseObject(previous.PayloadJson);
                        projected["telephoneSourceStrokes"] = previousPayload["strokes"]?.DeepClone();
                        projected["telephoneSourceText"] = StringValue(previousPayload, "text") ?? "";
                    }
                }
                if (drawingPhase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
                {
                    projected["telephoneChain"] = new JsonArray(run.Submissions.Where(submission => submission.Kind == "telephone" && submission.ModerationStatus == "approved" && !submission.Hidden).OrderBy(submission => submission.SubmittedAt).ThenBy(submission => submission.Id).Select(submission =>
                    {
                        var chainPayload = ParseObject(submission.PayloadJson);
                        return (JsonNode)new JsonObject
                        {
                            ["id"] = submission.Id.ToString(),
                            ["stepIndex"] = IntValue(chainPayload, "stepIndex"),
                            ["kind"] = StringValue(chainPayload, "kind", "drawing"),
                            ["text"] = StringValue(chainPayload, "text", ""),
                            ["strokes"] = chainPayload["strokes"]?.DeepClone() ?? new JsonArray()
                        };
                    }).ToArray());
                }
            }
            if (drawingPhase == ActivityPhases.Voting && BoolValue(state, "votingTimerRunning"))
                projected["votingTimerRemainingMs"] = DrawingVotingRemainingMs(state);
            if (!telephone && drawingPhase is (ActivityPhases.Voting or ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete))
            {
                projected["drawings"] = new JsonArray(submissions.Select(submission =>
                {
                    var payload = ParseObject(submission.PayloadJson);
                    return (JsonNode)new JsonObject
                    {
                        ["id"] = submission.Id.ToString(),
                        ["strokes"] = payload["strokes"] is JsonNode strokes ? JsonNode.Parse(strokes.ToJsonString(ActivityJsonDefaults.Options)) : new JsonArray()
                    };
                }).ToArray());
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Ordering)
        {
            var orderingPhase = StringValue(state, "phase");
            var rounds = ArrayValue(config, "rounds");
            var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
            var round = rounds.Count > index ? rounds[index] as JsonObject : null;
            var interactionMode = OrderingInteractionMode(config, round);
            projected["interactionMode"] = interactionMode;
            projected["orderingInteractionMode"] = interactionMode;
            if (interactionMode == "matching")
            {
                var pairs = ArrayValue(round, "pairs").OfType<JsonObject>().ToArray();
                projected["matchingLeft"] = new JsonArray(pairs.Select((pair, pairIndex) => (JsonNode)new JsonObject
                {
                    ["id"] = StringValue(pair, "id") ?? $"pair-{pairIndex + 1}",
                    ["label"] = StringValue(pair, "left") ?? "Left item"
                }).ToArray());
                projected["matchingRight"] = new JsonArray(pairs
                    .Select((pair, pairIndex) => new { Id = StringValue(pair, "rightId") ?? StringValue(pair, "right") ?? $"right-{pairIndex + 1}", Label = StringValue(pair, "right") ?? "Right item" })
                    .OrderBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
                    .Select(item => (JsonNode)new JsonObject { ["id"] = item.Id, ["label"] = item.Label }).ToArray());
                if (orderingPhase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
                    projected["correctPairs"] = state["correctPairs"]?.DeepClone();
            }
            else if (interactionMode == "grouping")
            {
                projected["groupingItems"] = new JsonArray(ArrayValue(round, "items").OfType<JsonObject>().Select((item, itemIndex) => (JsonNode)new JsonObject
                {
                    ["id"] = StringValue(item, "id") ?? $"item-{itemIndex + 1}",
                    ["label"] = StringValue(item, "label") ?? "Item"
                }).ToArray());
                projected["groupingGroups"] = new JsonArray(ArrayValue(round, "groups").OfType<JsonObject>().Select((group, groupIndex) => (JsonNode)new JsonObject
                {
                    ["id"] = StringValue(group, "id") ?? $"group-{groupIndex + 1}",
                    ["label"] = $"Group {groupIndex + 1}"
                }).ToArray());
                if (orderingPhase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
                {
                    projected["correctGroups"] = state["correctGroups"]?.DeepClone();
                    projected["groupingGroups"] = new JsonArray(ArrayValue(round, "groups").OfType<JsonObject>().Select((group, groupIndex) => (JsonNode)new JsonObject
                    {
                        ["id"] = StringValue(group, "id") ?? $"group-{groupIndex + 1}",
                        ["label"] = StringValue(group, "label") ?? $"Group {groupIndex + 1}"
                    }).ToArray());
                }
            }
            if (orderingPhase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
            {
                projected["correctOrder"] = new JsonArray(ReadStringArray(state, "correctOrder").Select(item => (JsonNode)item).ToArray());
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Word && BoolValue(config, "turnBased"))
        {
            projected.Remove("turnParticipantId");
            projected.Remove("eliminatedParticipantIds");
            if (BoolValue(state, "timerRunning")) projected["timerRemainingMs"] = WordTimerRemainingMs(state);
            if (participantId.HasValue)
            {
                projected["isCurrentTurn"] = StringValue(state, "turnParticipantId") == participantId.Value.ToString();
                projected["isEliminated"] = ReadStringArray(state, "eliminatedParticipantIds").Contains(participantId.Value.ToString(), StringComparer.OrdinalIgnoreCase);
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Word)
        {
            if (BoolValue(state, "timerRunning")) projected["timerRemainingMs"] = WordTimerRemainingMs(state);
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.MatchPlayer)
        {
            var targetId = StringValue(state, "targetParticipantId");
            projected.Remove("targetParticipantId");
            if (participantId.HasValue) projected["isTarget"] = targetId == participantId.Value.ToString();
            var matchPhase = StringValue(state, "phase");
            if (matchPhase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
            {
                var rounds = ArrayValue(config, "rounds");
                var index = IntValue(state, "currentRoundIndex");
                var options = ArrayValue(rounds.Count > index ? rounds[index] as JsonObject : null, "options");
                var revealedIndex = IntValue(state, "revealedOptionIndex", -1);
                if (revealedIndex >= 0 && revealedIndex < options.Count) projected["revealedAnswer"] = options[revealedIndex]?.GetValue<string>() ?? "";
                if (StringValue(state, "revealedMatchAnswer") is { Length: > 0 } matchAnswer) projected["revealedAnswer"] = matchAnswer;
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Bracket)
        {
            var entrants = BracketEntrants(config, state);
            var entrantLabel = (string? id) => StringValue(entrants.OfType<JsonObject>().FirstOrDefault(item => StringValue(item, "id") == id), "label") ?? id ?? "Entrant";
            var bracketMatches = new JsonArray();
            foreach (var matchItem in ArrayValue(state, "matchups").OfType<JsonObject>())
            {
                bracketMatches.Add(new JsonObject
                {
                    ["id"] = StringValue(matchItem, "id"),
                    ["round"] = IntValue(matchItem, "round", 1),
                    ["entrantAId"] = StringValue(matchItem, "entrantAId"),
                    ["entrantBId"] = StringValue(matchItem, "entrantBId"),
                    ["entrantA"] = entrantLabel(StringValue(matchItem, "entrantAId")),
                    ["entrantB"] = entrantLabel(StringValue(matchItem, "entrantBId")),
                    ["winnerId"] = StringValue(matchItem, "winnerId"),
                    ["status"] = StringValue(matchItem, "status", "pending")
                });
            }
            projected["bracketMatches"] = bracketMatches;
            var championId = StringValue(state, "bracketChampionId");
            if (!string.IsNullOrWhiteSpace(championId)) projected["bracketChampion"] = entrantLabel(championId);
            var matchId = StringValue(state, "currentMatchId");
            var currentBracketMatch = matchId is null ? null : BracketMatch(state, matchId);
            if (currentBracketMatch is not null)
            {
                var activeMatchId = matchId!;
                var currentMatch = new JsonObject
                {
                    ["id"] = StringValue(currentBracketMatch, "id"),
                    ["round"] = IntValue(currentBracketMatch, "round", 1),
                    ["entrantAId"] = StringValue(currentBracketMatch, "entrantAId"),
                    ["entrantBId"] = StringValue(currentBracketMatch, "entrantBId"),
                    ["entrantA"] = entrantLabel(StringValue(currentBracketMatch, "entrantAId")),
                    ["entrantB"] = entrantLabel(StringValue(currentBracketMatch, "entrantBId")),
                    ["winnerId"] = StringValue(currentBracketMatch, "winnerId"),
                    ["status"] = StringValue(currentBracketMatch, "status", "pending")
                };
                var bracketPhase = StringValue(state, "phase");
                if (bracketPhase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
                {
                    currentMatch["voteCounts"] = new JsonArray(run.Votes.Where(vote => vote.RoundId == activeMatchId).GroupBy(vote => vote.TargetId).Select(group => (JsonNode)new JsonObject { ["entrantId"] = group.Key, ["label"] = entrantLabel(group.Key), ["count"] = group.Count() }).ToArray());
                }
                projected["currentMatch"] = currentMatch;
                if (participantId.HasValue) projected["hasVoted"] = await db.ActivityVotes.AnyAsync(vote => vote.ActivityRunId == run.Id && vote.VoterParticipantId == participantId.Value && vote.RoundId == activeMatchId, ct);
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.StageChallenge)
        {
            projected.Remove("audienceVoteCounts");
            projected.Remove("audienceVoteScoreApplied");
            if (BoolValue(config, "audienceVoting"))
            {
                if (phase == ActivityPhases.Voting && BoolValue(state, "audienceVotingOpen"))
                    projected["audienceVoteOptions"] = new JsonArray("success", "fail");
                if (phase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
                    projected["audienceVoteCounts"] = await GetStageAudienceVoteCountsAsync(run, config, ct);
                if (participantId.HasValue)
                    projected["hasAudienceVote"] = await db.ActivityVotes.AnyAsync(vote => vote.ActivityRunId == run.Id && vote.VoterParticipantId == participantId.Value && vote.RoundId == roundId, ct);
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.PhysicalRoom)
        {
            var rounds = ArrayValue(config, "rounds");
            var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
            var round = rounds.Count > index ? rounds[index] as JsonObject : null;
            var choices = ReadStringArray(round, "choices");
            var randomized = ReadStringArray(state, "randomizedChoices");
            var currentRound = new JsonObject
            {
                ["id"] = StringValue(round, "id") ?? $"round-{index + 1}",
                ["title"] = StringValue(round, "title") ?? StringValue(round, "prompt") ?? $"Round {index + 1}",
                ["instructions"] = StringValue(round, "instructions") ?? StringValue(round, "prompt") ?? "Follow the host's instructions.",
                ["choices"] = new JsonArray((randomized.Count > 0 ? randomized : choices).Select(choice => (JsonNode)choice).ToArray()),
                ["revealText"] = StringValue(round, "revealText") ?? "",
                ["nodeType"] = AdventureNodeType(round)
            };
            foreach (var mediaKey in new[] { "mediaUrl", "mediaId", "mediaCaption" })
                if (StringValue(round, mediaKey) is { Length: > 0 } mediaValue) currentRound[mediaKey] = mediaValue;
            if (BoolValue(config, "adventure"))
            {
                if (StringValue(state, "adventureEffectText") is { Length: > 0 } effectText) currentRound["effectText"] = effectText;
                if (state.ContainsKey("adventureAnswerCorrect")) currentRound["answerCorrect"] = BoolValue(state, "adventureAnswerCorrect");
                if (state.ContainsKey("adventureConditionResult")) currentRound["conditionResult"] = BoolValue(state, "adventureConditionResult");
                if (state["adventureInventory"] is JsonObject inventory) currentRound["inventory"] = inventory.DeepClone();
            }
            projected["currentRound"] = currentRound;
            projected["roundCount"] = rounds.Count;
            projected["adventure"] = BoolValue(config, "adventure");
            projected["responsesOpen"] = BoolValue(state, "responsesOpen");
            if (BoolValue(config, "adventure"))
            {
                projected["adventureLastChoice"] = StringValue(state, "adventureLastChoice") ?? "";
                projected["adventureHistory"] = state["adventureHistory"]?.DeepClone() ?? new JsonArray();
                var choiceCounts = run.Votes.Where(vote => vote.RoundId == CurrentRoundId(run, config)).GroupBy(vote => vote.TargetId).ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
                var projectedChoiceCounts = new JsonObject();
                foreach (var choiceCount in choiceCounts) projectedChoiceCounts[choiceCount.Key] = choiceCount.Value;
                projected["adventureChoiceCounts"] = projectedChoiceCounts;
                projected.Remove("adventureCorrectIndex");
                projected.Remove("adventureRandomChoice");
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Utility)
        {
            var utilityType = UtilityType(config);
            projected["utilityType"] = utilityType;
            if (utilityType == ActivityUtilityTypes.MysteryBoxes)
            {
                var revealedIds = new HashSet<string>(ReadStringArray(state, "revealedBoxIds"), StringComparer.OrdinalIgnoreCase);
                projected["boxes"] = new JsonArray(ArrayValue(config, "boxes").OfType<JsonObject>().Select((box, index) => (JsonNode)new JsonObject
                {
                    ["id"] = StringValue(box, "id") ?? $"box-{index + 1}",
                    ["label"] = StringValue(box, "label") ?? $"Mystery Box {index + 1}",
                    ["revealed"] = revealedIds.Contains(StringValue(box, "id") ?? $"box-{index + 1}")
                }).ToArray());
            }
            else if (utilityType == ActivityUtilityTypes.Countdown)
            {
                var remainingMs = UtilityCountdownRemainingMs(config, state);
                var warningMs = Math.Max(0, IntValue(config, "warningThresholdSeconds", 10)) * 1000L;
                projected["timerRemainingMs"] = remainingMs;
                projected["timerExpired"] = remainingMs == 0;
                projected["timerWarning"] = remainingMs > 0 && remainingMs <= warningMs;
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.ImageReveal)
        {
            var mediaMode = (StringValue(config, "mediaMode") ?? "image").Trim().ToLowerInvariant();
            if (mediaMode == "memorygrid")
            {
                projected["memoryCardsVisible"] = BoolValue(state, "memoryCardsVisible");
                projected["memoryTimerRemainingMs"] = MemoryTimerRemainingMs(state);
                var revealedCardIds = new HashSet<string>(ReadStringArray(state, "revealedCardIds"), StringComparer.OrdinalIgnoreCase);
                projected["revealedCardIds"] = new JsonArray(revealedCardIds.Select(id => (JsonNode)id).ToArray());
                projected["memoryCards"] = new JsonArray(ArrayValue(config, "memoryCards").OfType<JsonObject>().Select((card, index) =>
                {
                    var id = StringValue(card, "id") ?? $"card-{index + 1}";
                    var canSeeLabel = !participantId.HasValue || BoolValue(state, "memoryCardsVisible") || revealedCardIds.Contains(id);
                    return (JsonNode)new JsonObject { ["id"] = id, ["label"] = canSeeLabel ? StringValue(card, "label", "?") : "?" };
                }).ToArray());
            }
            if (BoolValue(state, "revealed")) projected["revealedAnswer"] = StringValue(config, "answer") ?? "";
        }
        return projected;
    }

    private static JsonObject ProjectPublicConfig(string type, JsonObject config, JsonObject state)
    {
        var projected = ParseObject(Serialize(config));
        if (type is ActivityTypes.Trivia or ActivityTypes.RapidFire)
        {
            foreach (var item in ArrayValue(projected, "questions"))
            {
                if (item is not JsonObject question) continue;
                question.Remove("correctIndex");
                question.Remove("correctText");
                question.Remove("acceptedAnswers");
                question.Remove("targetNumber");
                question.Remove("tolerance");
                question.Remove("scoringMode");
                if (!BoolValue(state, "explanationRevealed")) question.Remove("explanation");
            }
        }
        else if (type is ActivityTypes.Prediction)
        {
            foreach (var item in ArrayValue(projected, "rounds")) if (item is JsonObject round) round.Remove("correctIndex"); projected.Remove("correctIndex");
        }
        else if (type == ActivityTypes.Buzzer)
        {
            foreach (var item in ArrayValue(projected, "clues")) if (item is JsonObject clue) clue.Remove("answer");
        }
        else if (type == ActivityTypes.FakeOut)
        {
            foreach (var item in ArrayValue(projected, "rounds")) if (item is JsonObject round) round.Remove("truth");
        }
        else if (type == ActivityTypes.SurveyBoard)
        {
            foreach (var question in ArrayValue(projected, "questions")) if (question is JsonObject q) { q["answerCount"] = ArrayValue(q, "answers").Count; q.Remove("answers"); }
            projected.Remove("answers");
        }
        else if (type == ActivityTypes.Ordering)
        {
            foreach (var round in ArrayValue(projected, "rounds")) if (round is JsonObject item)
            {
                item.Remove("correctOrder");
                // Match-Up and Connections receive sanitized choices through
                // the role-specific state projection. The answer mapping stays
                // on the server until the host reveals it.
                item.Remove("pairs");
                item.Remove("groups");
            }
            if (projected.TryGetPropertyValue("scoringMode", out var scoringMode) && scoringMode is null) projected.Remove("scoringMode");
        }
        else if (type == ActivityTypes.ImageReveal)
        {
            projected.Remove("answer");
            if (string.Equals(StringValue(projected, "mediaMode"), "memoryGrid", StringComparison.OrdinalIgnoreCase))
                foreach (var card in ArrayValue(projected, "memoryCards").OfType<JsonObject>()) { card.Remove("label"); card.Remove("match"); }
        }
        else if (type == ActivityTypes.Drawing && BoolValue(config, "telephoneChain"))
        {
            projected.Remove("chainSteps");
        }
        else if (type == ActivityTypes.Utility)
        {
            foreach (var box in ArrayValue(projected, "boxes").OfType<JsonObject>())
            {
                box.Remove("value");
                box.Remove("prize");
                box.Remove("points");
            }
        }
        else if (type == ActivityTypes.PhysicalRoom && BoolValue(config, "adventure"))
        {
            foreach (var round in ArrayValue(projected, "rounds").OfType<JsonObject>())
            {
                round.Remove("branches");
                round.Remove("correctIndex");
                round.Remove("scoreDelta");
                round.Remove("scoreTarget");
                round.Remove("inventoryKey");
                round.Remove("inventoryValue");
                round.Remove("conditionKey");
                round.Remove("conditionEquals");
                round.Remove("trueTarget");
                round.Remove("falseTarget");
                round.Remove("next");
                round.Remove("nextTarget");
                round.Remove("randomTargets");
            }
        }
        if (projected["embeddedUtility"] is JsonObject embedded)
        {
            foreach (var box in ArrayValue(embedded, "boxes").OfType<JsonObject>())
            {
                box.Remove("value");
                box.Remove("prize");
                box.Remove("points");
            }
        }
        return projected;
    }

    private async Task<ActivityRun?> LoadRunAsync(Guid runId, CancellationToken ct)
    {
        var run = await db.ActivityRuns
            .Include(x => x.ActivityDefinition)
            .Include(x => x.RunParticipants).ThenInclude(x => x.Team)
            .Include(x => x.RunTeams)
            .Include(x => x.RunScoreEvents)
            .Include(x => x.Submissions).ThenInclude(x => x.Participant)
            .Include(x => x.Votes).ThenInclude(x => x.VoterParticipant)
            .SingleOrDefaultAsync(x => x.Id == runId, ct);
        if (run is null) return null;

        // Start from this run's own rows, then widen to the lobby when there is
        // one. Submissions and votes stay per-run: they are this game's answers.
        run.Participants = [.. run.RunParticipants];
        run.Teams = [.. run.RunTeams];
        run.ScoreEvents = [.. run.RunScoreEvents];

        if (run.SessionGroupId is Guid groupId)
        {
            var group = await db.ActivitySessionGroups.SingleOrDefaultAsync(x => x.Id == groupId, ct);
            // Ordering and the reset cut-off happen in memory: SQLite cannot
            // sort or compare DateTimeOffset in SQL, and these are classroom-
            // sized collections.
            var people = await db.ActivityParticipants
                .Include(x => x.Team)
                .Where(x => x.SessionGroupId == groupId)
                .ToListAsync(ct);
            run.Participants = [.. people.OrderBy(x => x.JoinedAt)];

            run.Teams = await db.ActivityTeams
                .Where(x => x.SessionGroupId == groupId)
                .OrderBy(x => x.Position)
                .ToListAsync(ct);

            // A host who cleared the board starts everyone from nothing, without
            // deleting the history behind it.
            var since = group?.ScoresResetAt;
            var points = await db.ActivityScoreEvents
                .Where(x => x.SessionGroupId == groupId)
                .ToListAsync(ct);
            run.ScoreEvents = since is null ? points : [.. points.Where(x => x.CreatedAt > since.Value)];
        }

        return run;
    }

    /// <summary>
    /// Find a player by their phone's token.
    ///
    /// Tokens are salted by the lobby, so the same phone is the same player in
    /// every game of a lesson. A token salted by a run predates groups; that
    /// row is upgraded in place on first sight so an in-flight session keeps
    /// its people instead of forking them.
    /// </summary>
    private async Task<ActivityParticipant?> FindParticipantAsync(Guid runId, string token, CancellationToken ct)
    {
        var raw = (token ?? "").Trim();
        if (raw.Length is < 20 or > 200) return null;

        var run = await db.ActivityRuns.SingleOrDefaultAsync(x => x.Id == runId, ct);
        if (run is null) return null;

        if (run.SessionGroupId is Guid groupId)
        {
            var hash = TokenHash(groupId, raw);
            var byGroup = await db.ActivityParticipants
                .SingleOrDefaultAsync(x => x.SessionGroupId == groupId && x.ParticipantTokenHash == hash, ct);
            if (byGroup is not null) return byGroup;

            var legacy = await db.ActivityParticipants
                .SingleOrDefaultAsync(x => x.ActivityRunId == runId && x.ParticipantTokenHash == TokenHash(runId, raw), ct);
            if (legacy is not null)
            {
                legacy.SessionGroupId = groupId;
                legacy.ParticipantTokenHash = hash;
                await db.SaveChangesAsync(ct);
                return legacy;
            }
            return null;
        }

        return await db.ActivityParticipants
            .SingleOrDefaultAsync(x => x.ActivityRunId == runId && x.ParticipantTokenHash == TokenHash(runId, raw), ct);
    }

    private async Task<string> NewJoinCodeAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 50; attempt++)
        {
            var code = new string(RandomNumberGenerator.GetBytes(6).Select(x => CodeAlphabet[x % CodeAlphabet.Length]).ToArray());
            if (!await db.ActivityRuns.AnyAsync(x => x.JoinCode == code && x.Status != ActivityRunStatuses.Ended, ct)) return code;
        }
        throw new InvalidOperationException("Could not create a unique activity join code.");
    }

    private static string Snapshot(ActivityDefinition definition) => JsonSerializer.Serialize(new
    {
        definition.Id, definition.Name, definition.Type, definition.EngineType, definition.PresetType, definition.SchemaVersion,
        definition.Description, definition.ConfigJson, definition.ThemeJson, definition.SettingsJson, definition.ModifiersJson,
        definition.PresentationJson, definition.Version
    }, ActivityJsonDefaults.Options);

    private static string GetPhase(ActivityRun run) => StringValue(ParseObject(run.StateJson), "phase") ?? run.CurrentPhase;
    private static JsonObject ParseConfig(ActivityRun run)
    {
        try
        {
            var snapshot = ParseObject(run.DefinitionSnapshotJson);
            var json = StringValue(snapshot, "configJson");
            return ParseObject(json ?? run.ActivityDefinition?.ConfigJson ?? "{}");
        }
        catch { return ParseObject(run.ActivityDefinition?.ConfigJson ?? "{}"); }
    }
    private static string CurrentRoundId(ActivityRun run, JsonObject config)
    {
        var state = ParseObject(run.StateJson); var type = run.ActivityDefinition?.Type;
        if (type == ActivityTypes.Bracket) return StringValue(state, "currentMatchId") ?? "bracket-lobby";
        if (type == ActivityTypes.Drawing && BoolValue(config, "telephoneChain")) return $"telephone-step-{IntValue(state, "telephoneStepIndex")}";
        var property = type is ActivityTypes.Trivia or ActivityTypes.RapidFire ? "currentQuestionIndex" : type == ActivityTypes.Buzzer ? "currentClueIndex" : type == ActivityTypes.SurveyBoard ? "currentQuestionIndex" : type is ActivityTypes.Punchline or ActivityTypes.Drawing ? "currentPromptIndex" : type == ActivityTypes.StageChallenge ? "currentChallengeIndex" : "currentRoundIndex";
        var index = IntValue(state, property); var arrayName = type is ActivityTypes.Trivia or ActivityTypes.RapidFire ? "questions" : type == ActivityTypes.Buzzer ? "clues" : type == ActivityTypes.SurveyBoard ? "questions" : type is ActivityTypes.Punchline or ActivityTypes.Drawing ? "prompts" : type == ActivityTypes.StageChallenge ? "challenges" : "rounds";
        var item = ArrayValue(config, arrayName).Count > index ? ArrayValue(config, arrayName)[index] as JsonObject : null;
        return StringValue(item, "id") ?? $"round-{index + 1}";
    }

    private static string CreativeVotingStyle(JsonObject config)
    {
        var style = (StringValue(config, "votingStyle") ?? "gallery").Trim().ToLowerInvariant();
        return style == "headtohead" ? "headToHead" : "gallery";
    }

    private static string CreativeVoteRoundId(ActivityRun run, JsonObject config, JsonObject state)
    {
        var baseRoundId = CurrentRoundId(run, config);
        if (CreativeVotingStyle(config) != "headToHead") return baseRoundId;
        var matchId = StringValue(state, "creativeCurrentMatchId");
        return string.IsNullOrWhiteSpace(matchId) ? baseRoundId : $"{baseRoundId}:{matchId}";
    }

    private static void InitializeQuizParticipants(ActivityRun run, JsonObject config, JsonObject state)
    {
        var modifiers = QuizModifierSettings.FromConfig(config);
        if (!modifiers.LivesEnabled || BoolValue(state, "quizLivesInitialized")) return;
        foreach (var participant in run.Participants.Where(item => item.Status != "removed"))
        {
            participant.Lives = modifiers.StartingLives;
            if (participant.Status == "eliminated") participant.Status = "active";
        }
        state["quizLivesInitialized"] = true;
    }

    private static int RapidFireDurationMs(JsonObject config, JsonObject state)
    {
        var questions = ArrayValue(config, "questions");
        var index = Math.Clamp(IntValue(state, "currentQuestionIndex"), 0, Math.Max(0, questions.Count - 1));
        var question = questions.Count > index ? questions[index] as JsonObject : null;
        var seconds = Math.Clamp(IntValue(question, "timerSeconds", IntValue(config, "defaultTimerSeconds", 15)), 3, 600);
        return seconds * 1000;
    }

    private static int RapidFireRemainingMs(JsonObject state)
    {
        var targetAt = DateTimeOffsetValue(state, "targetAt");
        if (targetAt.HasValue) return Math.Max(0, (int)Math.Min(int.MaxValue, (targetAt.Value - DateTimeOffset.UtcNow).TotalMilliseconds));
        return Math.Max(0, IntValue(state, "remainingMs"));
    }

    private static string UtilityType(JsonObject config)
    {
        var requested = StringValue(config, "utilityType", ActivityUtilityTypes.CoinFlip) ?? ActivityUtilityTypes.CoinFlip;
        return ActivityUtilityTypes.IsValid(requested) ? requested : ActivityUtilityTypes.CoinFlip;
    }
    private static string PollScoringMode(JsonObject config)
    {
        var mode = (StringValue(config, "pollMode") ?? "").Trim().ToLowerInvariant();
        return mode is "majority" or "minority" or "prediction" ? mode : "";
    }
    private static string FirstPlayPhase(string type) => type is ActivityTypes.Poll or ActivityTypes.Prediction or ActivityTypes.Punchline or ActivityTypes.FakeOut ? ActivityPhases.Prompt : ActivityPhases.RoundIntro;
    private static string NormalizeCode(string value) => (value ?? "").Trim().Replace("-", "").ToUpperInvariant();
    private static string NormalizeDisplayName(string? value) => (value ?? "").Trim() switch { var name when name.Length > 40 => name[..40], var name => name };
    private static string TokenHash(Guid runId, string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{runId:N}:{token}"))).ToLowerInvariant();
    private static JsonObject ParseObject(string json) { try { return JsonNode.Parse(json)?.AsObject() ?? []; } catch (JsonException) { return []; } }
    private static string Serialize(JsonNode node) => node.ToJsonString(ActivityJsonDefaults.Options);
    private static object? ParseUntyped(string json) { try { return JsonSerializer.Deserialize<object>(json, ActivityJsonDefaults.Options); } catch (JsonException) { return null; } }
    private static string QuizAnswerMode(JsonObject? question)
    {
        var mode = (StringValue(question, "answerMode") ?? "choice").Trim().ToLowerInvariant();
        return mode is "text" or "shorttext" or "number" ? mode : "choice";
    }
    private static string? QuizAnswerText(JsonObject? question)
    {
        if (question is null) return null;
        return QuizAnswerMode(question) switch
        {
            "text" or "shorttext" => ReadStringArray(question, "acceptedAnswers").FirstOrDefault() ?? StringValue(question, "correctText"),
            "number" when DoubleValue(question, "targetNumber") is double number => number.ToString("0.##########", CultureInfo.InvariantCulture),
            _ => ArrayValue(question, "options").Count > IntValue(question, "correctIndex", -1)
                && IntValue(question, "correctIndex", -1) >= 0
                ? ArrayValue(question, "options")[IntValue(question, "correctIndex", -1)]?.GetValue<string>()
                : null
        };
    }
    private static string? StringValue(JsonObject? obj, string key) => obj is not null && obj.TryGetPropertyValue(key, out var value) ? value?.GetValue<string>() : null;
    private static string? StringValue(JsonObject? obj, string key, string fallback) => StringValue(obj, key) ?? fallback;
    private static bool BoolValue(JsonObject? obj, string key, bool fallback = false) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null ? value.GetValue<bool>() : fallback;
    private static int IntValue(JsonObject? obj, string key, int fallback = 0) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null ? value.GetValue<int>() : fallback;
    private static long LongValue(JsonObject? obj, string key, long fallback = 0) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null ? value.GetValue<long>() : fallback;
    private static double? DoubleValue(JsonObject? obj, string key) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is JsonValue jsonValue && jsonValue.TryGetValue<double>(out var result) ? result : null;
    private static DateTimeOffset? DateTimeOffsetValue(JsonObject? obj, string key) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null && DateTimeOffset.TryParse(value.GetValue<string>(), out var result) ? result : null;
    private static JsonArray ArrayValue(JsonObject? obj, string key) => obj?.TryGetPropertyValue(key, out var value) == true && value is JsonArray array ? array : [];
    private static bool SurveyTeamMode(JsonObject config) => BoolValue(config, "teamPlay") || BoolValue(config, "stealEnabled");
    private static int SurveyStrikeLimit(JsonObject config) => Math.Clamp(IntValue(config, "strikesToSteal", 3), 1, 5);
    private static string ReadString(JsonElement? payload, string key) => payload?.TryGetProperty(key, out var value) == true && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static int ReadInt(JsonElement? payload, string key, int fallback) => payload?.TryGetProperty(key, out var value) == true && value.TryGetInt32(out var result) ? result : fallback;
    private static bool ReadBool(JsonElement? payload, string key) => payload?.TryGetProperty(key, out var value) == true && value.ValueKind == JsonValueKind.True;
    private static bool TryReadDouble(JsonElement? payload, string key, out double result)
    {
        result = 0;
        if (payload?.TryGetProperty(key, out var value) != true) return false;
        if (value.ValueKind == JsonValueKind.Number) return value.TryGetDouble(out result);
        return value.ValueKind == JsonValueKind.String && double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out result);
    }
    private static Guid? ReadGuid(JsonElement? payload, string key) => Guid.TryParse(ReadString(payload, key), out var id) ? id : null;
    private static List<string> ReadStringArray(JsonObject? obj, string key)
    {
        var values = new List<string>();
        foreach (var item in ArrayValue(obj, key))
        {
            if (item is not JsonValue value) continue;
            try
            {
                var text = value.GetValue<string>().Trim();
                if (text.Length > 0) values.Add(text);
            }
            catch (InvalidOperationException) { }
        }
        return values;
    }

    private static List<string> ReadStringArray(JsonElement? payload, string key)
    {
        if (payload?.TryGetProperty(key, out var value) != true || value.ValueKind != JsonValueKind.Array) return [];
        return value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString()?.Trim() ?? "")
            .Where(item => item.Length > 0)
            .Take(50)
            .ToList();
    }

    private static List<string> ReadWords(JsonElement? payload)
    {
        var raw = ReadStringArray(payload, "words");
        if (raw.Count == 0) raw = ReadString(payload, "text").Split([',', '\n', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        return raw.Select(NormalizeWord).Where(item => item.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(30).ToList();
    }

    private static int WordTimerRemainingMs(JsonObject state)
    {
        var duration = Math.Max(0L, LongValue(state, "timerDurationMs"));
        var started = DateTimeOffsetValue(state, "timerStartedAt");
        if (duration <= 0 || started is null) return 0;
        var end = DateTimeOffsetValue(state, "timerPausedAt") ?? DateTimeOffset.UtcNow;
        return Math.Max(0, (int)Math.Min(int.MaxValue, duration - (end - started.Value).TotalMilliseconds));
    }

    private static int MemoryTimerRemainingMs(JsonObject state)
    {
        var duration = Math.Max(0L, LongValue(state, "memoryDurationMs"));
        var started = DateTimeOffsetValue(state, "memoryStartedAt");
        if (!BoolValue(state, "memoryTimerRunning") || duration <= 0 || started is null) return 0;
        return Math.Max(0, (int)Math.Min(int.MaxValue, duration - (DateTimeOffset.UtcNow - started.Value).TotalMilliseconds));
    }

    private static int DrawingVotingRemainingMs(JsonObject state)
    {
        var duration = Math.Max(0L, LongValue(state, "votingDurationMs"));
        var started = DateTimeOffsetValue(state, "votingStartedAt");
        if (duration <= 0 || started is null) return 0;
        return Math.Max(0, (int)Math.Min(int.MaxValue, duration - (DateTimeOffset.UtcNow - started.Value).TotalMilliseconds));
    }

    private static string NormalizeMatchText(string? value) => string.Join(" ", (value ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();

    private static void InitializeWordTurn(ActivityRun run, JsonObject state)
    {
        var order = run.Participants.Where(item => item.Status != "removed").OrderBy(item => item.JoinedAt).Select(item => item.Id.ToString()).ToArray();
        state["turnOrder"] = new JsonArray(order.Select(item => (JsonNode)item).ToArray());
        state["turnIndex"] = 0;
        state["usedWords"] = new JsonArray();
        state["eliminatedParticipantIds"] = new JsonArray();
        state.Remove("lastTurnMessage");
        SetWordTurnParticipant(run, state, 0);
    }

    private static void ClearWordTurn(JsonObject state)
    {
        state.Remove("turnOrder");
        state.Remove("turnIndex");
        state.Remove("turnParticipantId");
        state.Remove("turnParticipantName");
        state.Remove("usedWords");
        state.Remove("eliminatedParticipantIds");
        state.Remove("lastTurnMessage");
    }

    private static void AddWordTurnElimination(JsonObject state, ActivityParticipant participant)
    {
        var eliminated = ReadStringArray(state, "eliminatedParticipantIds");
        if (eliminated.Contains(participant.Id.ToString(), StringComparer.OrdinalIgnoreCase)) return;
        var next = new JsonArray(eliminated.Select(item => (JsonNode)item).ToArray());
        next.Add(participant.Id.ToString());
        state["eliminatedParticipantIds"] = next;
    }

    private static void AppendWordTurnWords(JsonObject state, IReadOnlyList<string> words)
    {
        var used = new JsonArray(ReadStringArray(state, "usedWords").Select(item => (JsonNode)item).ToArray());
        foreach (var word in words) used.Add(word);
        state["usedWords"] = used;
    }

    private static void AdvanceWordTurn(ActivityRun run, JsonObject state)
    {
        var order = ReadStringArray(state, "turnOrder");
        var eliminated = ReadStringArray(state, "eliminatedParticipantIds");
        if (order.Count == 0)
        {
            state["phase"] = ActivityPhases.ResponsesLocked;
            state["responsesOpen"] = false;
            state["responsesLocked"] = true;
            return;
        }

        var currentIndex = IntValue(state, "turnIndex", -1);
        for (var offset = 1; offset <= order.Count; offset++)
        {
            var nextIndex = (currentIndex + offset + order.Count) % order.Count;
            var nextId = order[nextIndex];
            if (eliminated.Contains(nextId, StringComparer.OrdinalIgnoreCase)) continue;
            SetWordTurnParticipant(run, state, nextIndex);
            state["phase"] = ActivityPhases.AcceptingResponses;
            state["responsesOpen"] = true;
            state["responsesLocked"] = false;
            return;
        }

        state.Remove("turnParticipantId");
        state.Remove("turnParticipantName");
        state["phase"] = ActivityPhases.ResponsesLocked;
        state["responsesOpen"] = false;
        state["responsesLocked"] = true;
    }

    private static void SetWordTurnParticipant(ActivityRun run, JsonObject state, int index)
    {
        var order = ReadStringArray(state, "turnOrder");
        if (order.Count == 0 || index < 0 || index >= order.Count)
        {
            state.Remove("turnParticipantId");
            state.Remove("turnParticipantName");
            return;
        }

        var id = order[index];
        var participant = run.Participants.FirstOrDefault(item => item.Id.ToString() == id && item.Status != "removed");
        if (participant is null)
        {
            state.Remove("turnParticipantId");
            state.Remove("turnParticipantName");
            return;
        }

        state["turnIndex"] = index;
        state["turnParticipantId"] = participant.Id.ToString();
        state["turnParticipantName"] = participant.DisplayName;
    }

    private static string NormalizeWord(string value)
    {
        var normalized = string.Join(" ", value.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();
        return normalized.Length > 80 ? normalized[..80] : normalized;
    }

    private static bool ValidateDrawingPayload(JsonElement? payload, JsonObject config, out string error)
    {
        error = "";
        if (payload?.ValueKind != JsonValueKind.Object || payload.Value.TryGetProperty("strokes", out var strokes) != true || strokes.ValueKind != JsonValueKind.Array)
        {
            error = "A drawing must include strokes.";
            return false;
        }
        var maxStrokes = Math.Clamp(IntValue(config, "maxStrokes", 80), 1, 240);
        var maxPointsPerStroke = Math.Clamp(IntValue(config, "maxPointsPerStroke", IntValue(config, "maxStrokePoints", 120)), 1, 240);
        if (payload.Value.GetRawText().Length > 100_000 || strokes.GetArrayLength() > maxStrokes)
        {
            error = "That drawing is too large.";
            return false;
        }
        foreach (var stroke in strokes.EnumerateArray())
        {
            if (stroke.ValueKind != JsonValueKind.Object || stroke.TryGetProperty("points", out var points) != true || points.ValueKind != JsonValueKind.Array || points.GetArrayLength() is < 1 || points.GetArrayLength() > maxPointsPerStroke)
            {
                error = $"Each drawing stroke needs between 1 and {maxPointsPerStroke} points.";
                return false;
            }
            foreach (var point in points.EnumerateArray())
            {
                if (point.ValueKind != JsonValueKind.Array || point.GetArrayLength() < 2 || !point[0].TryGetDouble(out var x) || !point[1].TryGetDouble(out var y) || x is < 0 or > 1 || y is < 0 or > 1)
                {
                    error = "Drawing points must be normalized coordinates between 0 and 1.";
                    return false;
                }
            }
        }
        return true;
    }
    private static List<JsonObject> AnswersFor(JsonObject? question, JsonObject config) => (ArrayValue(question, "answers").Count > 0 ? ArrayValue(question, "answers") : ArrayValue(question, "items")).OfType<JsonObject>().ToList();

    private static JsonArray SurveyMatchSuggestions(JsonObject config, JsonObject state)
    {
        var submitted = (StringValue(state, "surveyMatchInput") ?? "").Trim();
        var questions = ArrayValue(config, "questions");
        var index = Math.Clamp(IntValue(state, "currentQuestionIndex"), 0, Math.Max(0, questions.Count - 1));
        var answers = AnswersFor(questions.Count > index ? questions[index] as JsonObject : null, config);
        if (submitted.Length == 0 || answers.Count == 0) return [];

        var matches = answers.Select(answer =>
        {
            var best = SurveyAnswerMatch(submitted, answer);
            return new
            {
                Rank = IntValue(answer, "rank"),
                Text = StringValue(answer, "text", ""),
                Score = best.Score,
                MatchedBy = best.MatchedBy
            };
        })
        .Where(match => match.Rank > 0 && match.Score >= 0.82)
        .OrderByDescending(match => match.Score)
        .ThenBy(match => match.Rank)
        .ToArray();

        // Do not offer a guess when two board entries are nearly equally
        // plausible. The host can always reveal any answer manually.
        if (matches.Length > 1 && matches[0].Score - matches[1].Score < 0.08) return [];
        return new JsonArray(matches.Take(3).Select(match => (JsonNode)new JsonObject
        {
            ["rank"] = match.Rank,
            ["text"] = match.Text,
            ["confidence"] = (int)Math.Round(match.Score * 100),
            ["matchedBy"] = match.MatchedBy
        }).ToArray());
    }

    private static (double Score, string MatchedBy) SurveyAnswerMatch(string submitted, JsonObject answer)
    {
        var normalizedSubmission = NormalizeSurveyText(submitted);
        var answerText = StringValue(answer, "text") ?? "";
        var candidates = new List<(string Text, string MatchedBy)> { (answerText, "answer text") };
        candidates.AddRange(ReadStringArray(answer, "aliases").Select(alias => (alias, "alias")));

        var best = (Score: 0d, MatchedBy: "");
        foreach (var candidate in candidates)
        {
            var normalizedCandidate = NormalizeSurveyText(candidate.Text);
            if (normalizedCandidate.Length == 0) continue;
            if (normalizedSubmission == normalizedCandidate) return (1d, candidate.MatchedBy);

            var submissionTokens = normalizedSubmission.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var candidateTokens = normalizedCandidate.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (submissionTokens.Length > 0 && submissionTokens.All(token => candidateTokens.Contains(token, StringComparer.Ordinal)) && submissionTokens.All(token => token.Length >= 4))
                best = best.Score < 0.88 ? (0.88, "word match") : best;

            var distance = SurveyEditDistance(normalizedSubmission, normalizedCandidate);
            var maximum = Math.Max(normalizedSubmission.Length, normalizedCandidate.Length);
            if (maximum > 0)
            {
                var score = 1d - (double)distance / maximum;
                if (score > best.Score) best = (score, "close spelling");
            }
        }
        return best;
    }

    private static string NormalizeSurveyText(string value)
    {
        var decomposed = (value ?? "").Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
            builder.Append(char.IsLetterOrDigit(character) ? char.ToLowerInvariant(character) : ' ');
        }
        return string.Join(' ', builder.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private static int SurveyEditDistance(string left, string right)
    {
        var previous = Enumerable.Range(0, right.Length + 1).ToArray();
        for (var leftIndex = 1; leftIndex <= left.Length; leftIndex++)
        {
            var current = new int[right.Length + 1];
            current[0] = leftIndex;
            for (var rightIndex = 1; rightIndex <= right.Length; rightIndex++)
            {
                current[rightIndex] = Math.Min(
                    Math.Min(current[rightIndex - 1] + 1, previous[rightIndex] + 1),
                    previous[rightIndex - 1] + (left[leftIndex - 1] == right[rightIndex - 1] ? 0 : 1));
            }
            previous = current;
        }
        return previous[right.Length];
    }

    private static void EnsureSurveyTeamTurn(ActivityRun run, JsonObject state, bool advance)
    {
        var teams = run.Teams.Where(team => team.Active).OrderBy(team => team.Position).ToArray();
        if (teams.Length == 0)
        {
            state.Remove("currentTeamId");
            state.Remove("currentTeamName");
            return;
        }

        var currentId = StringValue(state, "currentTeamId");
        var currentIndex = Array.FindIndex(teams, team => team.Id.ToString() == currentId);
        if (currentIndex < 0) currentIndex = 0;
        else if (advance) currentIndex = (currentIndex + 1) % teams.Length;
        var team = teams[currentIndex];
        state["currentTeamId"] = team.Id.ToString();
        state["currentTeamName"] = team.Name;
    }

    private static bool OpenSurveySteal(ActivityRun run, JsonObject state)
    {
        var teams = run.Teams.Where(team => team.Active).OrderBy(team => team.Position).ToArray();
        if (teams.Length < 2) return false;
        var currentId = StringValue(state, "currentTeamId");
        var currentIndex = Array.FindIndex(teams, team => team.Id.ToString() == currentId);
        if (currentIndex < 0) currentIndex = 0;
        var stealTeam = teams[(currentIndex + 1) % teams.Length];
        state["stealOpen"] = true;
        state["stealTeamId"] = stealTeam.Id.ToString();
        state["stealTeamName"] = stealTeam.Name;
        state["buzzWinnerParticipantId"] = null;
        state["buzzWinnerName"] = null;
        state["buzzWinnerTeamId"] = null;
        state["buzzLocked"] = false;
        state["responsesOpen"] = true;
        state["phase"] = ActivityPhases.AcceptingResponses;
        state["lastBoardEvent"] = $"{stealTeam.Name} can steal the board.";
        return true;
    }

    private static ActivityCommandResult Fail(string error, ActivityRun? run) => new(false, error, run?.Revision ?? 0, run?.Status ?? "", run is null ? null : ParseUntyped(run.StateJson), DateTimeOffset.UtcNow);
    private enum ProjectionRole { Host, Display, Participant }
    private static readonly string[] TeamColors = ["#6d5dfc", "#f08b54", "#24a69a", "#e45f8d", "#d9a441", "#4578d4"];
    private static readonly string[] TeamIcons = ["★", "◆", "●", "▲", "✦", "☀"];
}
