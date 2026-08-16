using System.Collections.Concurrent;
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
    IActivityRandomSource random)
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

            if (string.IsNullOrWhiteSpace(current.JoinCode))
            {
                current.JoinCode = await NewJoinCodeAsync(ct);
                changed = true;
            }

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

    public async Task<ActivityRun?> FindByJoinCodeAsync(string code, CancellationToken ct = default)
    {
        var normalized = NormalizeCode(code);
        if (normalized.Length == 0) return null;
        var run = await db.ActivityRuns.Include(x => x.ActivityDefinition)
            .SingleOrDefaultAsync(x => x.JoinCode == normalized, ct);
        if (run is null || run.ActivityDefinition is null || run.Status == ActivityRunStatuses.Ended) return null;
        return await EnsureInteractiveRunAsync(run, ct);
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
        var hash = TokenHash(run.Id, token);
        var participant = await db.ActivityParticipants
            .SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantTokenHash == hash, ct);

        var displayName = NormalizeDisplayName(input.DisplayName);
        if (participant is null)
        {
            var count = await db.ActivityParticipants.CountAsync(x => x.ActivityRunId == run.Id && x.Status != "removed", ct);
            participant = new ActivityParticipant
            {
                Id = Guid.NewGuid(),
                ActivityRunId = run.Id,
                ParticipantTokenHash = hash,
                DisplayName = string.IsNullOrWhiteSpace(displayName) ? $"Player {count + 1}" : displayName,
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
            participant.LastSeenAt = DateTimeOffset.UtcNow;
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
            .Select(x => new { id = x.Id, displayName = x.DisplayName, teamId = x.TeamId, joinedAt = x.JoinedAt })
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
        var isEliminated = isTurnBasedWord && ReadStringArray(rawState, "eliminatedParticipantIds").Contains(participant.Id.ToString(), StringComparer.OrdinalIgnoreCase);
        var isCurrentTurn = isTurnBasedWord && StringValue(rawState, "turnParticipantId") == participant.Id.ToString();
        var hasSubmission = await db.ActivitySubmissions.AnyAsync(x => x.ActivityRunId == runId && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var hasVote = await db.ActivityVotes.AnyAsync(x => x.ActivityRunId == runId && x.VoterParticipantId == participant.Id && x.RoundId == roundId, ct);
        // Creative and bluffing rounds intentionally have two separate inputs:
        // submit a response first, then vote in a later phase. Do not let the
        // first input disable the second one on the participant phone.
        var hasSubmitted = isTurnBasedWord ? false : phase == ActivityPhases.Voting ? hasVote : hasSubmission || hasVote;
        var canRespond = phase is ActivityPhases.AcceptingResponses or ActivityPhases.Voting or ActivityPhases.Prompt;
        if (isTurnBasedWord) canRespond = canRespond && isCurrentTurn && !isEliminated;
        return new ActivityParticipantView(envelope, participant.Id, participant.DisplayName, participant.TeamId?.ToString(), hasSubmitted, canRespond);
    }

    public async Task<ActivityHostView?> GetHostViewAsync(Guid runId, CancellationToken ct = default)
    {
        var run = await LoadRunAsync(runId, ct);
        if (run?.ActivityDefinition is null) return null;
        run = await EnsureInteractiveRunAsync(run, ct);
        run = await LoadRunAsync(run.Id, ct) ?? run;
        var envelope = await BuildEnvelopeAsync(run, ProjectionRole.Host, ct);
        var participants = run.Participants.Where(x => x.Status != "removed").OrderBy(x => x.JoinedAt)
            .Select(x => (object)new { id = x.Id, displayName = x.DisplayName, status = x.Status, teamId = x.TeamId, lives = x.Lives, joinedAt = x.JoinedAt, lastSeenAt = x.LastSeenAt })
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
        return new ActivityHostView(envelope, run.JoinCode, participants, teams, submissions, votes, scoreEvents);
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
        var run = await LoadRunAsync(runId, ct);
        if (run?.ActivityDefinition is null || !ActivityEngineCatalog.IsInteractive(run.ActivityDefinition)) return false;
        var gate = Locks.GetOrAdd(runId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            run = await LoadRunAsync(runId, ct);
            if (run is null) return false;
            db.ActivityTeams.RemoveRange(run.Teams);
            run.Teams.Clear();
            foreach (var (input, index) in inputs.Take(12).Select((value, index) => (value, index)))
            {
                var name = NormalizeDisplayName(input.Name);
                if (string.IsNullOrWhiteSpace(name)) name = $"Team {index + 1}";
                run.Teams.Add(new ActivityTeam { ActivityRunId = run.Id, Name = name, Position = index, Color = input.Color ?? TeamColors[index % TeamColors.Length], Icon = input.Icon ?? TeamIcons[index % TeamIcons.Length] });
            }
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
        if (action is "start" or "startgame")
        {
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
            state["phase"] = FirstPlayPhase(run.ActivityDefinition!.Type);
            state["actionNonce"] = LongValue(state, "actionNonce") + 1;
            if (run.ActivityDefinition.Type == ActivityTypes.RapidFire) state["isRunning"] = true;
            run.Status = ActivityRunStatuses.Live;
            run.StartedAt ??= DateTimeOffset.UtcNow;
            return (true, null);
        }
        if (action is "pause")
        {
            run.Status = ActivityRunStatuses.Paused;
            run.TimerPausedAt = DateTimeOffset.UtcNow;
            if (run.ActivityDefinition?.Type == ActivityTypes.RapidFire) state["isRunning"] = false;
            return (true, null);
        }
        if (action is "resume")
        {
            run.Status = ActivityRunStatuses.Live;
            run.TimerPausedAt = null;
            if (run.ActivityDefinition?.Type == ActivityTypes.RapidFire) state["isRunning"] = true;
            return (true, null);
        }
        if (action is "awardpoints" or "score" or "award") return await AwardFromPayloadAsync(run, state, payload, ct);
        if (action is "undoscore" or "undoscoreevent") return await UndoScoreAsync(run, payload, ct);
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
            ActivityTypes.Bracket => await HandleBracketParticipantAsync(run, participant, config, state, action, payload, ct),
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
                state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "closeresponses":
            case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "revealanswer":
            case "reveal":
                state["phase"] = ActivityPhases.Reveal; state["responsesOpen"] = false; state["responsesLocked"] = true; state["answerRevealed"] = true;
                var correct = questions.Count == 0 ? 0 : IntValue(questions[index] as JsonObject, "correctIndex");
                state["revealedCorrectIndex"] = correct;
                var explanation = StringValue(questions.Count == 0 ? null : questions[index] as JsonObject, "explanation");
                if (!string.IsNullOrWhiteSpace(explanation)) state["revealedExplanation"] = explanation;
                if (!BoolValue(state, "scoresApplied"))
                {
                    await ScoreQuizAsync(run, questions, index, ct);
                    state["scoresApplied"] = true;
                }
                return (true, null);
            case "hideanswer":
                state["answerRevealed"] = false; state.Remove("revealedCorrectIndex"); return (true, null);
            case "revealexplanation":
                state["explanationRevealed"] = true; return (true, null);
            case "nextquestion":
            case "nextround":
            case "next":
                if (index >= Math.Max(0, questions.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentQuestionIndex"] = index + 1; state["roundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro;
                state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; state.Remove("revealedCorrectIndex"); state.Remove("revealedExplanation"); state["scoresApplied"] = false; return (true, null);
            case "prevquestion":
            case "previous":
                state["currentQuestionIndex"] = Math.Max(0, index - 1); state["roundIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            case "finish": state["phase"] = ActivityPhases.FinalResults; return (true, null);
            default: return (false, $"Unrecognized quiz action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleQuizParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("answer" or "submit" or "choose")) return (false, "Choose an answer while answers are open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Answers are not open.");
        var questions = ArrayValue(config, "questions");
        var index = Math.Clamp(IntValue(state, "currentQuestionIndex"), 0, Math.Max(0, questions.Count - 1));
        var optionIndex = ReadInt(payload, "optionIndex", ReadInt(payload, "answerIndex", -1));
        var question = questions.Count > index ? questions[index] as JsonObject : null;
        var options = question is null ? [] : ArrayValue(question, "options");
        if (optionIndex < 0 || optionIndex >= options.Count) return (false, "That answer is not available.");
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var payloadJson = JsonSerializer.Serialize(new { optionIndex }, ActivityJsonDefaults.Options);
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
        var index = Math.Clamp(IntValue(state, "currentClueIndex"), 0, Math.Max(0, clues.Count - 1));
        switch (action)
        {
            case "open": case "openbuzzers": state["phase"] = ActivityPhases.AcceptingResponses; state["buzzLocked"] = false; state["buzzWinnerParticipantId"] = null; state["buzzWinnerName"] = null; return (true, null);
            case "reopen": case "resetbuzzers": state["phase"] = ActivityPhases.AcceptingResponses; state["buzzLocked"] = false; state["buzzWinnerParticipantId"] = null; state["buzzWinnerName"] = null; return (true, null);
            case "revealclue": case "nextclue":
                state["cluesRevealed"] = Math.Min(clues.Count, IntValue(state, "cluesRevealed") + 1); state["phase"] = ActivityPhases.AcceptingResponses; state["buzzLocked"] = false; return (true, null);
            case "correct":
                state["phase"] = ActivityPhases.Reveal; state["answerRevealed"] = true;
                if (!BoolValue(state, "scoresApplied")) { var points = IntValue(clues.Count > index ? clues[index] as JsonObject : null, "points", 100); var winner = StringValue(state, "buzzWinnerParticipantId"); if (Guid.TryParse(winner, out var id)) await AwardScoreAsync(run, id, null, points, "Correct buzzer answer", CurrentRoundId(run, config), ct); state["scoresApplied"] = true; }
                state["revealedAnswer"] = StringValue(clues.Count > index ? clues[index] as JsonObject : null, "answer"); return (true, null);
            case "incorrect":
                var loser = StringValue(state, "buzzWinnerParticipantId");
                if (Guid.TryParse(loser, out var loserId) && BoolValue(config, "lockOutOnMiss", true)) state["lockedOutParticipantId"] = loserId.ToString();
                var penalty = IntValue(config, "wrongPenalty");
                if (Guid.TryParse(loser, out loserId) && penalty != 0) await AwardScoreAsync(run, loserId, null, -Math.Abs(penalty), "Incorrect buzzer answer", CurrentRoundId(run, config), ct);
                state["buzzWinnerParticipantId"] = null; state["buzzWinnerName"] = null; state["buzzLocked"] = false; state["phase"] = ActivityPhases.AcceptingResponses; return (true, null);
            case "next": case "nextround":
                if (index >= Math.Max(0, clues.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentClueIndex"] = index + 1; state["cluesRevealed"] = 0; state["buzzWinnerParticipantId"] = null; state["buzzWinnerName"] = null; state["buzzLocked"] = false; state["answerRevealed"] = false; state.Remove("revealedAnswer"); state.Remove("lockedOutParticipantId"); state["scoresApplied"] = false; state["phase"] = ActivityPhases.RoundIntro; return (true, null);
            default: return (false, $"Unrecognized buzzer action '{action}'.");
        }
    }

    private Task<(bool Success, string? Error)> HandleBuzzerParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("buzz" or "answer")) return Task.FromResult((Success: false, Error: (string?)"Press the buzzer when it opens."));
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || BoolValue(state, "buzzLocked")) return Task.FromResult((Success: false, Error: (string?)"The buzzer is closed."));
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
            case "openvoting": state["phase"] = ActivityPhases.Voting; state["votingOpen"] = true; return (true, null);
            case "closevoting": case "reveal":
                state["phase"] = ActivityPhases.Reveal; state["votingOpen"] = false; state["resultsVisible"] = true; await ScoreCreativeAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                var prompts = ArrayValue(config, "prompts"); var promptIndex = IntValue(state, "currentPromptIndex");
                if (promptIndex >= Math.Max(0, prompts.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentPromptIndex"] = promptIndex + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["votingOpen"] = false; state["resultsVisible"] = false; return (true, null);
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
        if (action is "vote" or "choose") return await SaveVoteAsync(run, participant, state, payload, roundId, ct);
        return (false, "Submit a response or vote when the host opens that phase.");
    }

    private async Task<(bool Success, string? Error)> HandleBluffHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        switch (action)
        {
            case "open": case "openresponses": state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "close": case "closeresponses": case "lock": state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "openvoting": state["phase"] = ActivityPhases.Voting; state["votingOpen"] = true; return (true, null);
            case "closevoting": case "reveal":
                state["phase"] = ActivityPhases.Reveal; state["votingOpen"] = false; state["resultsVisible"] = true; state["answerRevealed"] = true; await ScoreBluffAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                var rounds = ArrayValue(config, "rounds"); var index = IntValue(state, "currentRoundIndex");
                if (index >= Math.Max(0, rounds.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["votingOpen"] = false; state["resultsVisible"] = false; state["answerRevealed"] = false; return (true, null);
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
        if (action is "vote" or "choose") return await SaveVoteAsync(run, participant, state, payload, roundId, ct);
        return (false, "Submit a fake answer or vote when the host opens that phase.");
    }

    private Task<(bool Success, string? Error)> HandleMediaRevealHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var totalStages = Math.Clamp(IntValue(config, "totalStages", IntValue(config, "stages", 5)), 1, 50);
        var currentStage = Math.Clamp(IntValue(state, "currentStage"), 0, totalStages);
        switch (action)
        {
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
                state["phase"] = ActivityPhases.Lobby;
                state["actionNonce"] = LongValue(state, "actionNonce") + 1;
                return Task.FromResult((true, (string?)null));
            default: return Task.FromResult((false, (string?)$"Unrecognized image reveal action '{action}'."));
        }
    }

    private async Task<(bool Success, string? Error)> HandleDrawingHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        switch (action)
        {
            case "open": case "openresponses": case "startdrawing":
                state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "close": case "closeresponses": case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "openvoting":
                state["phase"] = ActivityPhases.Voting; state["votingOpen"] = true; return (true, null);
            case "closevoting": case "reveal":
                state["phase"] = ActivityPhases.Reveal; state["votingOpen"] = false; state["resultsVisible"] = true; await ScoreDrawingAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                var prompts = ArrayValue(config, "prompts"); var index = IntValue(state, "currentPromptIndex");
                if (index >= Math.Max(0, prompts.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentPromptIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["votingOpen"] = false; state["resultsVisible"] = false; return (true, null);
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
            if (!ValidateDrawingPayload(payload, out var error)) return (false, error);
            var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
            var status = BoolValue(config, "requireModeration", true) ? "pending" : "approved";
            var json = payload!.Value.GetRawText();
            if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "drawing", PayloadJson = json, ModerationStatus = status });
            else { existing.PayloadJson = json; existing.ModerationStatus = status; existing.Hidden = false; existing.UpdatedAt = DateTimeOffset.UtcNow; }
            state["submissionCount"] = await db.ActivitySubmissions.CountAsync(x => x.ActivityRunId == run.Id && x.RoundId == roundId, ct) + (existing is null ? 1 : 0);
            return (true, null);
        }
        if (action is "vote" or "choose") return await SaveVoteAsync(run, participant, state, payload, roundId, ct);
        return (false, "Draw or vote when the host opens that phase.");
    }

    private async Task<(bool Success, string? Error)> HandleOrderingHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var rounds = ArrayValue(config, "rounds");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        switch (action)
        {
            case "open": case "openresponses": case "startsorting":
                state["phase"] = ActivityPhases.AcceptingResponses; state["responsesOpen"] = true; state["responsesLocked"] = false; return (true, null);
            case "close": case "closeresponses": case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "reveal": case "showanswer":
                state["phase"] = ActivityPhases.Reveal; state["responsesOpen"] = false; state["responsesLocked"] = true; state["answerRevealed"] = true;
                state["correctOrder"] = new JsonArray(ReadStringArray(rounds.Count > index ? rounds[index] as JsonObject : null, "correctOrder").Select(item => (JsonNode)item).ToArray());
                if (!BoolValue(state, "scoresApplied")) { await ScoreOrderingAsync(run, config, state, ct); state["scoresApplied"] = true; }
                return (true, null);
            case "next": case "nextround":
                if (index >= Math.Max(0, rounds.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; state.Remove("correctOrder"); state["scoresApplied"] = false; return (true, null);
            case "previous": case "prev":
                state["currentRoundIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["answerRevealed"] = false; state.Remove("correctOrder"); return (true, null);
            case "showleaderboard": state["phase"] = ActivityPhases.Leaderboard; return (true, null);
            default: return (false, $"Unrecognized ordering action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleOrderingParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("submit" or "sort" or "answer")) return (false, "Arrange the items while the round is open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || !BoolValue(state, "responsesOpen")) return (false, "Sorting is closed.");
        var order = ReadStringArray(payload, "order");
        if (order.Count < 1 || order.Count > 50 || order.Distinct(StringComparer.Ordinal).Count() != order.Count) return (false, "Your order must contain each item once.");
        var rounds = ArrayValue(config, "rounds"); var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
        var items = ArrayValue(rounds.Count > index ? rounds[index] as JsonObject : null, "items").Select(item => StringValue(item as JsonObject, "id") ?? "").Where(item => item.Length > 0).ToHashSet(StringComparer.Ordinal);
        if (items.Count > 0 && order.Any(item => !items.Contains(item))) return (false, "That ordering contains an unknown item.");
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var json = JsonSerializer.Serialize(new { order }, ActivityJsonDefaults.Options);
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
                if (BoolValue(config, "turnBased")) InitializeWordTurn(run, state);
                return (true, null);
            case "close": case "closeresponses": case "lock":
                state["phase"] = ActivityPhases.ResponsesLocked; state["responsesOpen"] = false; state["responsesLocked"] = true; return (true, null);
            case "reveal": case "showwords":
                state["phase"] = ActivityPhases.Reveal; state["responsesOpen"] = false; state["responsesLocked"] = true; state["resultsVisible"] = true; await ScoreWordAsync(run, config, state, ct); return (true, null);
            case "next": case "nextround":
                if (index >= Math.Max(0, rounds.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state["resultsVisible"] = false; state.Remove("wordCloud");
                if (BoolValue(config, "turnBased")) InitializeWordTurn(run, state); else ClearWordTurn(state);
                return (true, null);
            case "previous": case "prev":
                state["currentRoundIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["responsesOpen"] = false; state["responsesLocked"] = false; state.Remove("wordCloud");
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
                var targetAnswer = targetSubmission is null ? -1 : IntValue(ParseObject(targetSubmission.PayloadJson), "optionIndex", -1);
                if (targetAnswer < 0) return (false, "The target has not answered yet.");
                state["phase"] = ActivityPhases.Reveal;
                state["responsesOpen"] = false;
                state["responsesLocked"] = true;
                state["answerRevealed"] = true;
                state["revealedOptionIndex"] = targetAnswer;
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
        var optionIndex = ReadInt(payload, "optionIndex", -1);
        if (optionIndex < 0 || optionIndex >= options.Count) return (false, "That choice is not available.");
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(item => item.ActivityRunId == run.Id && item.ParticipantId == participant.Id && item.RoundId == roundId, ct);
        var kind = isTarget ? "matchTarget" : "matchPrediction";
        var json = JsonSerializer.Serialize(new { optionIndex }, ActivityJsonDefaults.Options);
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
            case "success":
            case "succeed":
            case "fail":
                var succeeded = action is "success" or "succeed";
                state["phase"] = ActivityPhases.Reveal;
                state["challengeStatus"] = succeeded ? "success" : "failure";
                state["outcome"] = succeeded ? "success" : "failure";
                state["timerPausedAt"] = DateTimeOffset.UtcNow;
                if (!BoolValue(state, "scoresApplied"))
                {
                    var selectedParticipantId = Guid.TryParse(StringValue(state, "selectedParticipantId"), out var participantGuid) ? participantGuid : (Guid?)null;
                    var selectedTeamId = Guid.TryParse(StringValue(state, "selectedTeamId"), out var teamGuid) ? teamGuid : (Guid?)null;
                    var amount = succeeded ? IntValue(challenge, "points", 100) : IntValue(challenge, "failPoints", 0);
                    if (amount != 0 && (selectedParticipantId.HasValue || selectedTeamId.HasValue)) await AwardScoreAsync(run, selectedParticipantId, selectedTeamId, amount, succeeded ? "Stage challenge success" : "Stage challenge result", CurrentRoundId(run, config), ct);
                    state["scoresApplied"] = true;
                }
                return (true, null);
            case "next":
            case "nextchallenge":
                if (index >= Math.Max(0, challenges.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentChallengeIndex"] = index + 1;
                state["phase"] = ActivityPhases.RoundIntro;
                state["challengeStatus"] = "ready";
                state["timerDurationMs"] = 0L;
                state.Remove("timerStartedAt"); state.Remove("timerPausedAt"); state.Remove("outcome"); state.Remove("selectedParticipantId"); state.Remove("selectedParticipantName"); state.Remove("selectedTeamId");
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

    private async Task<(bool Success, string? Error)> HandlePhysicalRoomHostAsync(ActivityRun run, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        var rounds = ArrayValue(config, "rounds");
        if (rounds.Count == 0) return (false, "Add at least one room round before starting.");
        var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, rounds.Count - 1);
        var round = rounds[index] as JsonObject;
        var seconds = Math.Clamp(IntValue(round, "seconds", 30), 5, 3600);

        switch (action)
        {
            case "next":
            case "nextround":
                if (index >= rounds.Count - 1) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentRoundIndex"] = index + 1;
                ResetPhysicalRoomRound(state);
                return (true, null);
            case "previous":
            case "prev":
                state["currentRoundIndex"] = Math.Max(0, index - 1);
                ResetPhysicalRoomRound(state);
                return (true, null);
            case "starttimer":
            case "startchallenge":
            case "timer":
                state["phase"] = ActivityPhases.AcceptingResponses;
                state["challengeStatus"] = "running";
                state["timerDurationMs"] = seconds * 1000L;
                state["timerStartedAt"] = DateTimeOffset.UtcNow;
                state.Remove("timerPausedAt");
                state["revealed"] = false;
                return (true, null);
            case "pausetimer":
            case "pausechallenge":
                if (DateTimeOffsetValue(state, "timerStartedAt") is null) return (false, "Start the room timer first.");
                state["timerPausedAt"] = DateTimeOffset.UtcNow;
                state["challengeStatus"] = "paused";
                return (true, null);
            case "resumetimer":
            case "resumechallenge":
                var startedAt = DateTimeOffsetValue(state, "timerStartedAt");
                var pausedAt = DateTimeOffsetValue(state, "timerPausedAt");
                if (startedAt is null || pausedAt is null) return (false, "The room timer is not paused.");
                state["timerStartedAt"] = DateTimeOffset.UtcNow - (pausedAt.Value - startedAt.Value);
                state.Remove("timerPausedAt");
                state["challengeStatus"] = "running";
                return (true, null);
            case "reset":
            case "resetround":
                ResetPhysicalRoomRound(state);
                return (true, null);
            case "randomize":
                var choices = ReadStringArray(round, "choices");
                for (var position = choices.Count - 1; position > 0; position--)
                {
                    var swap = RandomNumberGenerator.GetInt32(position + 1);
                    (choices[position], choices[swap]) = (choices[swap], choices[position]);
                }
                state["randomizedChoices"] = new JsonArray(choices.Select(choice => (JsonNode)choice).ToArray());
                return (true, null);
            case "reveal":
            case "show":
                state["phase"] = ActivityPhases.Reveal;
                state["challengeStatus"] = "revealed";
                state["revealed"] = true;
                state["timerPausedAt"] = DateTimeOffset.UtcNow;
                return (true, null);
            case "showleaderboard":
            case "leaderboard":
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
        state["randomizedChoices"] = new JsonArray();
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
                Name = $"Team {index + 1}",
                Position = index,
                Color = TeamColors[index % TeamColors.Length],
                Icon = TeamIcons[index % TeamIcons.Length]
            };
            teams.Add(team);
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
            case "open": case "openbuzzers": state["phase"] = ActivityPhases.AcceptingResponses; state["buzzLocked"] = false; state["buzzWinnerParticipantId"] = null; state["buzzWinnerName"] = null; return (true, null);
            case "resetbuzzers": case "reopen": state["buzzLocked"] = false; state["buzzWinnerParticipantId"] = null; state["buzzWinnerName"] = null; state["phase"] = ActivityPhases.AcceptingResponses; return (true, null);
            case "matchanswer": case "revealitem":
                var rank = ReadInt(payload, "rank", 0); var answers = AnswersFor(questions.Count > index ? questions[index] as JsonObject : null, config);
                var answer = answers.FirstOrDefault(x => IntValue(x, "rank") == rank); if (answer is null) return (false, "That survey answer was not found.");
                state["phase"] = ActivityPhases.Reveal; state["revealedRank"] = rank; state["revealedAnswer"] = StringValue(answer, "text"); state["revealedPoints"] = IntValue(answer, "points", IntValue(answer, "count")); state["buzzLocked"] = true;
                var revealedRanks = ArrayValue(state, "revealedRanks").Select(item => item?.GetValue<int>() ?? 0).Where(value => value > 0).ToHashSet();
                var newlyRevealed = revealedRanks.Add(rank);
                state["revealedRanks"] = new JsonArray(revealedRanks.OrderBy(value => value).Select(value => (JsonNode)value).ToArray());
                var points = IntValue(answer, "points", IntValue(answer, "count"));
                if (newlyRevealed) state["revealedScore"] = IntValue(state, "revealedScore") + points;
                var winner = StringValue(state, "buzzWinnerParticipantId"); if (newlyRevealed && Guid.TryParse(winner, out var winnerId)) await AwardScoreAsync(run, winnerId, null, points, "Matched survey answer", CurrentRoundId(run, config), ct); return (true, null);
            case "revealall":
                var allAnswers = AnswersFor(questions.Count > index ? questions[index] as JsonObject : null, config);
                state["phase"] = ActivityPhases.Reveal;
                state["buzzLocked"] = true;
                state["revealedRanks"] = new JsonArray(allAnswers.Select(item => (JsonNode)IntValue(item, "rank")).Where(item => item.GetValue<int>() > 0).ToArray());
                state.Remove("revealedRank"); state.Remove("revealedAnswer"); state.Remove("revealedPoints");
                return (true, null);
            case "addstrike": case "strike": state["strikes"] = Math.Clamp(IntValue(state, "strikes") + 1, 0, 3); return (true, null);
            case "clearstrikes": state["strikes"] = 0; return (true, null);
            case "next": case "nextquestion":
                if (index >= Math.Max(0, questions.Count - 1)) { state["phase"] = ActivityPhases.FinalResults; return (true, null); }
                state["currentQuestionIndex"] = index + 1; state["phase"] = ActivityPhases.RoundIntro; state["strikes"] = 0; state.Remove("revealedRank"); state.Remove("revealedRanks"); state.Remove("revealedAnswer"); state.Remove("revealedPoints"); state["buzzLocked"] = false; return (true, null);
            case "prev": case "prevquestion": case "previous":
                state["currentQuestionIndex"] = Math.Max(0, index - 1); state["phase"] = ActivityPhases.RoundIntro; state["strikes"] = 0; state.Remove("revealedRank"); state.Remove("revealedRanks"); state.Remove("revealedAnswer"); state.Remove("revealedPoints"); state["buzzLocked"] = false; return (true, null);
            default: return (false, $"Unrecognized survey action '{action}'.");
        }
    }

    private async Task<(bool Success, string? Error)> HandleSurveyParticipantAsync(ActivityRun run, ActivityParticipant participant, JsonObject config, JsonObject state, string action, JsonElement? payload, CancellationToken ct)
    {
        if (action is not ("answer" or "submit" or "buzz")) return (false, "Send an answer when the survey round is open.");
        if (StringValue(state, "phase") != ActivityPhases.AcceptingResponses || BoolValue(state, "buzzLocked")) return (false, "The survey board is not accepting answers.");
        var text = ReadString(payload, "text").Trim(); if (text.Length is < 1 or > 300) return (false, "Answers must be between 1 and 300 characters.");
        var roundId = CurrentRoundId(run, config);
        var existing = await db.ActivitySubmissions.SingleOrDefaultAsync(x => x.ActivityRunId == run.Id && x.ParticipantId == participant.Id && x.RoundId == roundId, ct);
        var json = JsonSerializer.Serialize(new { text }, ActivityJsonDefaults.Options);
        if (existing is null) db.ActivitySubmissions.Add(new ActivitySubmission { ActivityRunId = run.Id, ParticipantId = participant.Id, RoundId = roundId, Kind = "surveyAnswer", PayloadJson = json });
        else { existing.PayloadJson = json; existing.UpdatedAt = DateTimeOffset.UtcNow; }
        state["buzzWinnerParticipantId"] = participant.Id.ToString(); state["buzzWinnerName"] = participant.DisplayName; state["buzzLocked"] = true; state["phase"] = ActivityPhases.Judging;
        return (true, null);
    }

    private async Task<(bool Success, string? Error)> SaveVoteAsync(ActivityRun run, ActivityParticipant participant, JsonObject state, JsonElement? payload, string roundId, CancellationToken ct)
    {
        var target = ReadString(payload, "targetId").Trim(); if (target.Length is < 1 or > 80) return (false, "Choose a response to vote for.");
        if (StringValue(state, "phase") != ActivityPhases.Voting || !BoolValue(state, "votingOpen")) return (false, "Voting is closed.");
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

    private async Task ScoreQuizAsync(ActivityRun run, JsonArray questions, int index, CancellationToken ct)
    {
        var correct = IntValue(questions.Count > index ? questions[index] as JsonObject : null, "correctIndex"); var points = IntValue(questions.Count > index ? questions[index] as JsonObject : null, "points", 100); var roundId = CurrentRoundId(run, ParseConfig(run));
        foreach (var submission in run.Submissions.Where(x => x.RoundId == roundId && x.Kind == "quizAnswer" && x.ModerationStatus == "approved"))
        {
            var answer = ParseObject(submission.PayloadJson); if (IntValue(answer, "optionIndex", -1) == correct) await AwardScoreAsync(run, submission.ParticipantId, null, points, "Correct answer", roundId, ct);
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

    private async Task ScoreBluffAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
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
        state["truth"] = truth;
    }

    private async Task ScoreDrawingAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct)
    {
        var roundId = CurrentRoundId(run, config);
        var counts = run.Votes.Where(x => x.RoundId == roundId).GroupBy(x => x.TargetId).OrderByDescending(x => x.Count()).ThenBy(x => x.Key, StringComparer.Ordinal).ToList();
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
        var correct = ReadStringArray(round, "correctOrder");
        if (correct.Count == 0) return;
        var points = IntValue(round, "points", 100);
        foreach (var submission in run.Submissions.Where(x => x.RoundId == roundId && x.Kind == "ordering" && x.ModerationStatus == "approved" && !x.Hidden))
        {
            var submitted = ReadStringArray(ParseObject(submission.PayloadJson), "order");
            var correctPositions = submitted.Select((item, itemIndex) => itemIndex < correct.Count && item == correct[itemIndex]).Count(isCorrect => isCorrect);
            var earned = (int)Math.Round(points * (correctPositions / (double)correct.Count), MidpointRounding.AwayFromZero);
            if (earned > 0) await AwardScoreAsync(run, submission.ParticipantId, null, earned, "Ordering accuracy", roundId, ct);
        }
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
        var answer = IntValue(state, "revealedOptionIndex", -1);
        if (answer < 0) return;
        var points = IntValue(ArrayValue(config, "rounds").Count > IntValue(state, "currentRoundIndex") ? ArrayValue(config, "rounds")[IntValue(state, "currentRoundIndex")] as JsonObject : null, "points", 100);
        var matches = 0;
        foreach (var submission in run.Submissions.Where(item => item.RoundId == roundId && item.Kind == "matchPrediction" && !item.Hidden))
        {
            if (IntValue(ParseObject(submission.PayloadJson), "optionIndex", -1) == answer)
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
        db.ActivityScoreEvents.Add(new ActivityScoreEvent { ActivityRunId = run.Id, ParticipantId = participantId, TeamId = resolvedTeamId, RoundId = roundId, Amount = amount, Reason = reason });
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
        if (source is not ("participants" or "teams") || ArrayValue(state, "bracketEntrants").Count > 0) return;

        var entrants = new JsonArray();
        if (source == "participants")
        {
            var participants = await db.ActivityParticipants
                .Where(participant => participant.ActivityRunId == run.Id && participant.Status != "removed")
                .ToListAsync(ct);
            foreach (var participant in participants.OrderBy(participant => participant.JoinedAt).Take(32))
                entrants.Add(new JsonObject { ["id"] = participant.Id.ToString(), ["label"] = participant.DisplayName });
        }
        else
        {
            var teams = await db.ActivityTeams
                .Where(team => team.ActivityRunId == run.Id && team.Active)
                .OrderBy(team => team.Position)
                .Take(32)
                .ToListAsync(ct);
            foreach (var team in teams)
                entrants.Add(new JsonObject { ["id"] = team.Id.ToString(), ["label"] = team.Name });
        }

        state["bracketEntrants"] = entrants;
    }

    private static JsonArray BracketEntrants(JsonObject config, JsonObject state) =>
        ArrayValue(state, "bracketEntrants") is { Count: > 0 } entrants ? entrants : ArrayValue(config, "entrants");

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

    private async Task<JsonObject> ProjectDisplayStateAsync(ActivityRun run, JsonObject config, JsonObject state, CancellationToken ct, Guid? participantId = null)
    {
        var projected = ParseObject(Serialize(state));
        projected["joinCode"] = run.JoinCode;
        projected["participantCount"] = await db.ActivityParticipants.CountAsync(x => x.ActivityRunId == run.Id && x.Status != "removed", ct);
        var phase = StringValue(state, "phase");
        if (phase is ActivityPhases.Leaderboard or ActivityPhases.FinalResults or ActivityPhases.Complete)
        {
            var individualScores = run.Participants.Where(x => x.Status != "removed").Select(participant => new
            {
                participant.Id,
                participant.DisplayName,
                Score = run.ScoreEvents.Where(score => !score.IsUndone && score.ParticipantId == participant.Id).Sum(score => score.Amount)
            }).OrderByDescending(item => item.Score).ThenBy(item => item.DisplayName, StringComparer.Ordinal).ToArray();
            projected["leaderboard"] = new JsonArray(individualScores.Select((item, index) => (JsonNode)new JsonObject { ["rank"] = index + 1, ["id"] = item.Id.ToString(), ["name"] = item.DisplayName, ["score"] = item.Score }).ToArray());
            projected["teamLeaderboard"] = new JsonArray(run.Teams.Where(team => team.Active).OrderByDescending(team => team.Score).Select((team, index) => (JsonNode)new JsonObject { ["rank"] = index + 1, ["id"] = team.Id.ToString(), ["name"] = team.Name, ["icon"] = team.Icon, ["score"] = team.Score }).ToArray());
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
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.FakeOut)
        {
            var options = new JsonArray(submissions.Select(x => (JsonNode)new JsonObject { ["id"] = x.Id.ToString(), ["text"] = StringValue(ParseObject(x.PayloadJson), "text") ?? "", ["isTruth"] = false }).ToArray());
            var fakePhase = StringValue(state, "phase");
            if (fakePhase is ActivityPhases.Voting or ActivityPhases.Reveal or ActivityPhases.FinalResults)
            {
                options.Add(new JsonObject { ["id"] = "truth", ["text"] = StringValue(ArrayValue(config, "rounds").Count > IntValue(state, "currentRoundIndex") ? ArrayValue(config, "rounds")[IntValue(state, "currentRoundIndex")] as JsonObject : null, "truth") ?? "", ["isTruth"] = fakePhase is ActivityPhases.Reveal or ActivityPhases.FinalResults });
            }
            projected["options"] = options;
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.SurveyBoard)
        {
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
            if (drawingPhase is ActivityPhases.Voting or ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
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
            if (orderingPhase is ActivityPhases.Reveal or ActivityPhases.FinalResults or ActivityPhases.Leaderboard or ActivityPhases.Complete)
            {
                projected["correctOrder"] = new JsonArray(ReadStringArray(state, "correctOrder").Select(item => (JsonNode)item).ToArray());
            }
        }
        else if (run.ActivityDefinition.Type == ActivityTypes.Word && BoolValue(config, "turnBased"))
        {
            projected.Remove("turnParticipantId");
            projected.Remove("eliminatedParticipantIds");
            if (participantId.HasValue)
            {
                projected["isCurrentTurn"] = StringValue(state, "turnParticipantId") == participantId.Value.ToString();
                projected["isEliminated"] = ReadStringArray(state, "eliminatedParticipantIds").Contains(participantId.Value.ToString(), StringComparer.OrdinalIgnoreCase);
            }
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
        else if (run.ActivityDefinition.Type == ActivityTypes.PhysicalRoom)
        {
            var rounds = ArrayValue(config, "rounds");
            var index = Math.Clamp(IntValue(state, "currentRoundIndex"), 0, Math.Max(0, rounds.Count - 1));
            var round = rounds.Count > index ? rounds[index] as JsonObject : null;
            var choices = ReadStringArray(round, "choices");
            var randomized = ReadStringArray(state, "randomizedChoices");
            projected["currentRound"] = new JsonObject
            {
                ["id"] = StringValue(round, "id") ?? $"round-{index + 1}",
                ["title"] = StringValue(round, "title") ?? StringValue(round, "prompt") ?? $"Round {index + 1}",
                ["instructions"] = StringValue(round, "instructions") ?? StringValue(round, "prompt") ?? "Follow the host's instructions.",
                ["choices"] = new JsonArray((randomized.Count > 0 ? randomized : choices).Select(choice => (JsonNode)choice).ToArray()),
                ["revealText"] = StringValue(round, "revealText") ?? ""
            };
            projected["roundCount"] = rounds.Count;
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
        else if (run.ActivityDefinition.Type == ActivityTypes.ImageReveal && BoolValue(state, "revealed"))
        {
            projected["revealedAnswer"] = StringValue(config, "answer") ?? "";
        }
        return projected;
    }

    private static JsonObject ProjectPublicConfig(string type, JsonObject config, JsonObject state)
    {
        var projected = ParseObject(Serialize(config));
        if (type is ActivityTypes.Trivia or ActivityTypes.RapidFire)
        {
            foreach (var item in ArrayValue(projected, "questions")) if (item is JsonObject question) { question.Remove("correctIndex"); if (!BoolValue(state, "explanationRevealed")) question.Remove("explanation"); }
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
            foreach (var round in ArrayValue(projected, "rounds")) if (round is JsonObject item) item.Remove("correctOrder");
        }
        else if (type == ActivityTypes.ImageReveal)
        {
            projected.Remove("answer");
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
        return projected;
    }

    private async Task<ActivityRun?> LoadRunAsync(Guid runId, CancellationToken ct) => await db.ActivityRuns
        .Include(x => x.ActivityDefinition)
        .Include(x => x.Participants).ThenInclude(x => x.Team)
        .Include(x => x.Teams)
        .Include(x => x.ScoreEvents)
        .Include(x => x.Submissions).ThenInclude(x => x.Participant)
        .Include(x => x.Votes).ThenInclude(x => x.VoterParticipant)
        .SingleOrDefaultAsync(x => x.Id == runId, ct);

    private async Task<ActivityParticipant?> FindParticipantAsync(Guid runId, string token, CancellationToken ct)
    {
        var raw = (token ?? "").Trim(); if (raw.Length is < 20 or > 200) return null;
        return await db.ActivityParticipants.SingleOrDefaultAsync(x => x.ActivityRunId == runId && x.ParticipantTokenHash == TokenHash(runId, raw), ct);
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
        var property = type is ActivityTypes.Trivia or ActivityTypes.RapidFire ? "currentQuestionIndex" : type == ActivityTypes.Buzzer ? "currentClueIndex" : type == ActivityTypes.SurveyBoard ? "currentQuestionIndex" : type is ActivityTypes.Punchline or ActivityTypes.Drawing ? "currentPromptIndex" : type == ActivityTypes.StageChallenge ? "currentChallengeIndex" : "currentRoundIndex";
        var index = IntValue(state, property); var arrayName = type is ActivityTypes.Trivia or ActivityTypes.RapidFire ? "questions" : type == ActivityTypes.Buzzer ? "clues" : type == ActivityTypes.SurveyBoard ? "questions" : type is ActivityTypes.Punchline or ActivityTypes.Drawing ? "prompts" : type == ActivityTypes.StageChallenge ? "challenges" : "rounds";
        var item = ArrayValue(config, arrayName).Count > index ? ArrayValue(config, arrayName)[index] as JsonObject : null;
        return StringValue(item, "id") ?? $"round-{index + 1}";
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
    private static string? StringValue(JsonObject? obj, string key) => obj is not null && obj.TryGetPropertyValue(key, out var value) ? value?.GetValue<string>() : null;
    private static string? StringValue(JsonObject? obj, string key, string fallback) => StringValue(obj, key) ?? fallback;
    private static bool BoolValue(JsonObject? obj, string key, bool fallback = false) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null ? value.GetValue<bool>() : fallback;
    private static int IntValue(JsonObject? obj, string key, int fallback = 0) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null ? value.GetValue<int>() : fallback;
    private static long LongValue(JsonObject? obj, string key, long fallback = 0) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null ? value.GetValue<long>() : fallback;
    private static DateTimeOffset? DateTimeOffsetValue(JsonObject? obj, string key) => obj is not null && obj.TryGetPropertyValue(key, out var value) && value is not null && DateTimeOffset.TryParse(value.GetValue<string>(), out var result) ? result : null;
    private static JsonArray ArrayValue(JsonObject? obj, string key) => obj?.TryGetPropertyValue(key, out var value) == true && value is JsonArray array ? array : [];
    private static string ReadString(JsonElement? payload, string key) => payload?.TryGetProperty(key, out var value) == true && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static int ReadInt(JsonElement? payload, string key, int fallback) => payload?.TryGetProperty(key, out var value) == true && value.TryGetInt32(out var result) ? result : fallback;
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

    private static bool ValidateDrawingPayload(JsonElement? payload, out string error)
    {
        error = "";
        if (payload?.ValueKind != JsonValueKind.Object || payload.Value.TryGetProperty("strokes", out var strokes) != true || strokes.ValueKind != JsonValueKind.Array)
        {
            error = "A drawing must include strokes.";
            return false;
        }
        if (payload.Value.GetRawText().Length > 100_000 || strokes.GetArrayLength() > 80)
        {
            error = "That drawing is too large.";
            return false;
        }
        foreach (var stroke in strokes.EnumerateArray())
        {
            if (stroke.ValueKind != JsonValueKind.Object || stroke.TryGetProperty("points", out var points) != true || points.ValueKind != JsonValueKind.Array || points.GetArrayLength() is < 1 or > 120)
            {
                error = "Each drawing stroke needs between 1 and 120 points.";
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
    private static ActivityCommandResult Fail(string error, ActivityRun? run) => new(false, error, run?.Revision ?? 0, run?.Status ?? "", run is null ? null : ParseUntyped(run.StateJson), DateTimeOffset.UtcNow);
    private enum ProjectionRole { Host, Display, Participant }
    private static readonly string[] TeamColors = ["#6d5dfc", "#f08b54", "#24a69a", "#e45f8d", "#d9a441", "#4578d4"];
    private static readonly string[] TeamIcons = ["★", "◆", "●", "▲", "✦", "☀"];
}
