using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class AudienceInteractionApi
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string CodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

    public static void MapAudienceInteraction(this IEndpointRouteBuilder routes)
    {
        var publicApi = routes.MapGroup("/api/v1/audience");
        publicApi.MapGet("/join/{code}", GetPublicSession).RequireRateLimiting("audience");
        publicApi.MapPost("/join/{code}/responses", SubmitResponses).RequireRateLimiting("audience-submit");

        var admin = publicApi.MapGroup("/admin")
            .RequireAuthorization(LessonCuePermissions.Planning);
        admin.MapGet("/sessions", GetAdminSessions);
        admin.MapPost("/sessions", CreateSession);
        admin.MapPut("/sessions/{id:guid}", UpdateSession);
        admin.MapPost("/sessions/{id:guid}/state/{action}", ChangeState);
        admin.MapPost("/sessions/{id:guid}/reset", ResetResponses);
        admin.MapPost("/sessions/{id:guid}/display-media", GetOrCreateDisplayMedia);
        admin.MapPut("/responses/{id:guid}/moderation", ModerateResponse);
        admin.MapDelete("/sessions/{id:guid}", DeleteSession);
    }

    private static async Task<IResult> GetPublicSession(string code, LessonCueDb db, CancellationToken ct)
    {
        var session = await db.AudienceSessions.AsNoTracking()
            .Include(x => x.Questions.OrderBy(q => q.Position))
            .SingleOrDefaultAsync(x => x.Code == NormalizeCode(code), ct);
        if (session is null) return Results.NotFound(new { error = "That response code was not found." });

        var questions = session.Status == "open"
            ? session.Questions.Select(PublicQuestion).ToArray()
            : [];
        object? results = null;
        if (session.ShowLiveResults && session.Status is "open" or "closed")
            results = await BuildResults(db, session.Id, ct);
        return Results.Ok(new
        {
            session.Code,
            session.Title,
            session.Status,
            session.ShowLiveResults,
            session.AllowResponseChanges,
            questions,
            results,
            privacy = "Responses are anonymous. LessonCue does not retain your name, IP address, or device details."
        });
    }

    private static async Task<IResult> SubmitResponses(string code, AudienceResponseInput input,
        LessonCueDb db, CancellationToken ct)
    {
        var session = await db.AudienceSessions
            .Include(x => x.Questions.OrderBy(q => q.Position))
            .SingleOrDefaultAsync(x => x.Code == NormalizeCode(code), ct);
        if (session is null) return Results.NotFound(new { error = "That response code was not found." });
        if (session.Status != "open") return Results.Conflict(new { error = "This response session is not open." });
        var token = input.ParticipantToken?.Trim() ?? "";
        if (token.Length is < 20 or > 200)
            return Results.BadRequest(new { error = "The anonymous response token is invalid. Reload this page and try again." });
        // Salt the anonymous token with the session so it cannot be correlated
        // across separate polls, even by someone inspecting the local database.
        var hash = Hash($"{session.Id:N}:{token}");
        var supplied = (input.Answers ?? []).GroupBy(x => x.QuestionId).ToDictionary(x => x.Key, x => x.Last());

        foreach (var question in session.Questions)
        {
            supplied.TryGetValue(question.Id, out var answer);
            var choices = NormalizeChoices(answer?.Choices);
            var text = (answer?.Text ?? "").Trim();
            if (text.Length > 1000) return Results.BadRequest(new { error = "Written responses are limited to 1,000 characters." });
            var options = ReadOptions(question.OptionsJson);
            if (question.Type is "single" or "multiple")
            {
                if (choices.Any(choice => !options.Contains(choice, StringComparer.Ordinal)))
                    return Results.BadRequest(new { error = $"“{question.Prompt}” contains an invalid choice." });
                var limit = question.Type == "single" ? 1 : Math.Clamp(question.MaxSelections, 1, Math.Max(1, options.Count));
                if (choices.Count > limit)
                    return Results.BadRequest(new { error = $"Choose no more than {limit} answers for “{question.Prompt}”." });
            }
            if (question.Required && (question.Type == "text" ? text.Length == 0 : choices.Count == 0))
                return Results.BadRequest(new { error = $"Please answer “{question.Prompt}”." });
        }

        var existing = await db.AudienceResponses
            .Where(x => x.SessionId == session.Id && x.ParticipantTokenHash == hash)
            .ToDictionaryAsync(x => x.QuestionId, ct);
        if (!session.AllowResponseChanges && existing.Count > 0)
            return Results.Conflict(new { error = "This session accepts one submission per device and your response was already received." });

        var now = DateTimeOffset.UtcNow;
        foreach (var question in session.Questions)
        {
            supplied.TryGetValue(question.Id, out var answer);
            var choices = NormalizeChoices(answer?.Choices);
            var text = (answer?.Text ?? "").Trim();
            if (!existing.TryGetValue(question.Id, out var response))
            {
                response = new AudienceResponse
                {
                    SessionId = session.Id,
                    QuestionId = question.Id,
                    ParticipantTokenHash = hash,
                    SubmittedAt = now
                };
                db.AudienceResponses.Add(response);
            }
            response.AnswerJson = JsonSerializer.Serialize(choices, Json);
            response.TextAnswer = question.Type == "text" ? text : "";
            response.ModerationStatus = question.Type == "text" && question.ModerateResponses ? "pending" : "approved";
            response.UpdatedAt = now;
        }
        session.PurgeAt = now.AddDays(Math.Clamp(session.RetentionDays, 1, 30));
        await db.SaveChangesAsync(ct);
        return Results.Ok(new
        {
            accepted = true,
            message = "Your anonymous response was received.",
            results = session.ShowLiveResults ? await BuildResults(db, session.Id, ct) : null
        });
    }

    private static async Task<IResult> GetAdminSessions(LessonCueDb db, CancellationToken ct)
    {
        var sessions = await db.AudienceSessions.AsNoTracking()
            .Include(x => x.Questions.OrderBy(q => q.Position))
            .ThenInclude(x => x.Responses)
            .ToListAsync(ct);
        return Results.Ok(sessions.OrderByDescending(x => x.UpdatedAt).Select(AdminSession));
    }

    private static async Task<IResult> CreateSession(AudienceSessionInput input, HttpContext context,
        LessonCueDb db, CancellationToken ct)
    {
        var error = Validate(input);
        if (error is not null) return Results.BadRequest(new { error });
        var now = DateTimeOffset.UtcNow;
        var item = new AudienceSession
        {
            Title = input.Title.Trim(),
            Code = await NewCode(db, ct),
            ShowLiveResults = input.ShowLiveResults,
            AllowResponseChanges = input.AllowResponseChanges,
            RetentionDays = Math.Clamp(input.RetentionDays, 1, 30),
            CreatedBy = context.User.Identity?.Name ?? "admin",
            CreatedAt = now,
            UpdatedAt = now,
            PurgeAt = now.AddDays(Math.Clamp(input.RetentionDays, 1, 30))
        };
        ApplyQuestions(item, input.Questions ?? []);
        db.AudienceSessions.Add(item);
        Audit(db, context, "audience.session.create", item.Id, $"{item.Title} · {item.Code}");
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/audience/admin/sessions/{item.Id}", AdminSession(item));
    }

    private static async Task<IResult> UpdateSession(Guid id, AudienceSessionInput input, HttpContext context,
        LessonCueDb db, CancellationToken ct)
    {
        var error = Validate(input);
        if (error is not null) return Results.BadRequest(new { error });
        var item = await db.AudienceSessions.Include(x => x.Questions).ThenInclude(x => x.Responses)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return Results.NotFound();
        var hasResponses = item.Questions.Any(x => x.Responses.Count > 0);
        if (hasResponses && QuestionsChanged(item, input.Questions ?? []))
            return Results.Conflict(new { error = "Reset responses before changing questions or answer choices." });
        item.Title = input.Title.Trim();
        item.ShowLiveResults = input.ShowLiveResults;
        item.AllowResponseChanges = input.AllowResponseChanges;
        item.RetentionDays = Math.Clamp(input.RetentionDays, 1, 30);
        item.UpdatedAt = DateTimeOffset.UtcNow;
        item.PurgeAt = item.UpdatedAt.AddDays(item.RetentionDays);
        if (!hasResponses)
        {
            db.AudienceQuestions.RemoveRange(item.Questions);
            item.Questions.Clear();
            ApplyQuestions(item, (input.Questions ?? []).Select(question => question with { Id = null }).ToArray());
        }
        Audit(db, context, "audience.session.update", item.Id, item.Title);
        await db.SaveChangesAsync(ct);
        return Results.Ok(AdminSession(item));
    }

    private static async Task<IResult> ChangeState(Guid id, string action, HttpContext context,
        LessonCueDb db, CancellationToken ct)
    {
        var item = await db.AudienceSessions.Include(x => x.Questions).ThenInclude(x => x.Responses)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return Results.NotFound();
        var now = DateTimeOffset.UtcNow;
        switch (action.Trim().ToLowerInvariant())
        {
            case "open":
                if (item.Questions.Count == 0) return Results.BadRequest(new { error = "Add at least one question before opening." });
                item.Status = "open";
                item.OpenedAt = now;
                item.ClosedAt = null;
                break;
            case "close":
                item.Status = "closed";
                item.ClosedAt = now;
                break;
            default:
                return Results.BadRequest(new { error = "Use open or close." });
        }
        item.UpdatedAt = now;
        item.PurgeAt = now.AddDays(Math.Clamp(item.RetentionDays, 1, 30));
        Audit(db, context, $"audience.session.{item.Status}", item.Id, item.Title);
        await db.SaveChangesAsync(ct);
        return Results.Ok(AdminSession(item));
    }

    private static async Task<IResult> ResetResponses(Guid id, HttpContext context, LessonCueDb db, CancellationToken ct)
    {
        var item = await db.AudienceSessions.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return Results.NotFound();
        await db.AudienceResponses.Where(x => x.SessionId == id).ExecuteDeleteAsync(ct);
        item.UpdatedAt = DateTimeOffset.UtcNow;
        Audit(db, context, "audience.responses.reset", id, item.Title);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> GetOrCreateDisplayMedia(Guid id, AudienceDisplayMediaInput input,
        HttpContext context,
        LessonCueDb db, CancellationToken ct)
    {
        var session = await db.AudienceSessions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (session is null) return Results.NotFound(new { error = "That audience poll no longer exists." });
        var delay = input.ShowResults ? Math.Clamp(input.ResultDelaySeconds, 0, 3600) : 0;
        var sourceUrl = $"/audience-display/{session.Code}?results={(input.ShowResults ? 1 : 0)}&delay={delay}";
        var media = await db.MediaAssets.SingleOrDefaultAsync(
            x => (x.SourceKind == "link" || x.SourceKind == "audience-poll") &&
                 x.LinkKind == "embedded" && x.SourceUrl == sourceUrl, ct);
        if (media is null)
        {
            media = new MediaAsset
            {
                FileName = session.Title,
                ContentType = "text/uri-list",
                RelativePath = "",
                SizeBytes = 0,
                OfflineEligible = false,
                ProcessingStatus = "ready",
                CompatibilityStatus = "not-needed",
                SourceKind = "link",
                SourceUrl = sourceUrl,
                LinkKind = "embedded"
            };
            MediaRetention.KeepPermanently(media);
            db.MediaAssets.Add(media);
            Audit(db, context, "audience.display-media.create", session.Id, session.Title);
            await db.SaveChangesAsync(ct);
        }
        else if (media.FileName != session.Title || media.SourceKind != "link" ||
                 media.CompatibilityStatus != "not-needed")
        {
            media.FileName = session.Title;
            media.SourceKind = "link";
            media.ProcessingStatus = "ready";
            media.CompatibilityStatus = "not-needed";
            await db.SaveChangesAsync(ct);
        }
        return Results.Ok(media);
    }

    private static async Task<IResult> ModerateResponse(Guid id, AudienceModerationInput input, HttpContext context,
        LessonCueDb db, CancellationToken ct)
    {
        var status = input.Status.Trim().ToLowerInvariant();
        if (status is not ("approved" or "rejected"))
            return Results.BadRequest(new { error = "Moderation status must be approved or rejected." });
        var item = await db.AudienceResponses.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return Results.NotFound();
        item.ModerationStatus = status;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        Audit(db, context, $"audience.response.{status}", item.SessionId, item.QuestionId.ToString());
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    private static async Task<IResult> DeleteSession(Guid id, HttpContext context, LessonCueDb db, CancellationToken ct)
    {
        var item = await db.AudienceSessions.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return Results.NotFound();
        db.AudienceSessions.Remove(item);
        Audit(db, context, "audience.session.delete", id, item.Title);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static object PublicQuestion(AudienceQuestion question) => new
    {
        question.Id,
        question.Position,
        question.Type,
        question.Prompt,
        options = ReadOptions(question.OptionsJson),
        question.Required,
        question.MaxSelections
    };

    private static object AdminSession(AudienceSession session) => new
    {
        session.Id,
        session.Title,
        session.Code,
        session.Status,
        session.ShowLiveResults,
        session.AllowResponseChanges,
        session.RetentionDays,
        session.CreatedBy,
        session.CreatedAt,
        session.UpdatedAt,
        session.OpenedAt,
        session.ClosedAt,
        session.PurgeAt,
        participantCount = session.Questions.SelectMany(x => x.Responses)
            .Select(x => x.ParticipantTokenHash).Distinct().Count(),
        pendingModerationCount = session.Questions.SelectMany(x => x.Responses)
            .Count(x => x.ModerationStatus == "pending"),
        questions = session.Questions.OrderBy(x => x.Position).Select(question => new
        {
            question.Id,
            question.Position,
            question.Type,
            question.Prompt,
            options = ReadOptions(question.OptionsJson),
            question.Required,
            question.MaxSelections,
            question.ModerateResponses,
            responses = question.Responses.OrderByDescending(x => x.UpdatedAt).Select(response => new
            {
                response.Id,
                choices = ReadOptions(response.AnswerJson),
                text = response.TextAnswer,
                response.ModerationStatus,
                response.SubmittedAt,
                response.UpdatedAt
            })
        })
    };

    private static async Task<object> BuildResults(LessonCueDb db, Guid sessionId, CancellationToken ct)
    {
        var questions = await db.AudienceQuestions.AsNoTracking().Where(x => x.SessionId == sessionId)
            .Include(x => x.Responses).OrderBy(x => x.Position).ToListAsync(ct);
        return new
        {
            participantCount = questions.SelectMany(x => x.Responses).Select(x => x.ParticipantTokenHash).Distinct().Count(),
            questions = questions.Select(question =>
            {
                var approved = question.Responses.Where(x => x.ModerationStatus == "approved").ToArray();
                var counts = ReadOptions(question.OptionsJson).Select(option => new
                {
                    option,
                    count = approved.Count(response => ReadOptions(response.AnswerJson).Contains(option, StringComparer.Ordinal))
                });
                return new
                {
                    question.Id,
                    question.Prompt,
                    question.Type,
                    counts,
                    textResponses = question.Type == "text"
                        ? approved.Select(x => x.TextAnswer).Where(x => x.Length > 0).Take(100).ToArray()
                        : []
                };
            })
        };
    }

    private static string? Validate(AudienceSessionInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Title) || input.Title.Trim().Length > 160)
            return "Enter a session title up to 160 characters.";
        if (input.RetentionDays is < 1 or > 30) return "Response retention must be between 1 and 30 days.";
        var questions = input.Questions ?? [];
        if (questions.Count > 20) return "A session can contain up to 20 questions.";
        foreach (var question in questions)
        {
            if (string.IsNullOrWhiteSpace(question.Prompt) || question.Prompt.Trim().Length > 500)
                return "Every question needs a prompt up to 500 characters.";
            if (question.Type is not ("single" or "multiple" or "text"))
                return "Question type must be single choice, multiple choice, or written response.";
            var options = NormalizeChoices(question.Options);
            if (question.Type is "single" or "multiple" && options.Count is < 2 or > 12)
                return "Choice questions need between 2 and 12 unique choices.";
        }
        return null;
    }

    private static void ApplyQuestions(AudienceSession session, IReadOnlyList<AudienceQuestionInput> questions)
    {
        for (var i = 0; i < questions.Count; i++)
        {
            var input = questions[i];
            var options = NormalizeChoices(input.Options);
            session.Questions.Add(new AudienceQuestion
            {
                Id = input.Id ?? Guid.NewGuid(),
                Position = i,
                Type = input.Type,
                Prompt = input.Prompt.Trim(),
                OptionsJson = JsonSerializer.Serialize(options, Json),
                Required = input.Required,
                MaxSelections = input.Type == "single" ? 1 : Math.Clamp(input.MaxSelections, 1, Math.Max(1, options.Count)),
                ModerateResponses = input.Type == "text" && input.ModerateResponses
            });
        }
    }

    private static bool QuestionsChanged(AudienceSession session, IReadOnlyList<AudienceQuestionInput> inputs)
    {
        var current = session.Questions.OrderBy(x => x.Position).ToArray();
        if (current.Length != inputs.Count) return true;
        for (var i = 0; i < current.Length; i++)
        {
            var input = inputs[i];
            if (current[i].Id != input.Id || current[i].Type != input.Type ||
                current[i].Prompt != input.Prompt.Trim() ||
                !ReadOptions(current[i].OptionsJson).SequenceEqual(NormalizeChoices(input.Options)) ||
                current[i].Required != input.Required ||
                current[i].MaxSelections != (input.Type == "single" ? 1 : Math.Clamp(input.MaxSelections, 1, Math.Max(1, NormalizeChoices(input.Options).Count))) ||
                current[i].ModerateResponses != (input.Type == "text" && input.ModerateResponses))
                return true;
        }
        return false;
    }

    private static List<string> NormalizeChoices(IEnumerable<string>? choices) => (choices ?? [])
        .Select(x => (x ?? "").Trim()).Where(x => x.Length > 0).Distinct(StringComparer.Ordinal).Take(12).ToList();

    private static List<string> ReadOptions(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static string NormalizeCode(string code) => (code ?? "").Trim().Replace("-", "").ToUpperInvariant();
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static async Task<string> NewCode(LessonCueDb db, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var bytes = RandomNumberGenerator.GetBytes(6);
            var code = new string(bytes.Select(value => CodeAlphabet[value % CodeAlphabet.Length]).ToArray());
            if (!await db.AudienceSessions.AnyAsync(x => x.Code == code, ct)) return code;
        }
        throw new InvalidOperationException("Could not generate a unique audience response code.");
    }

    private static void Audit(LessonCueDb db, HttpContext context, string action, Guid id, string summary) =>
        db.AuditEvents.Add(new AuditEvent
        {
            Actor = context.User.Identity?.Name ?? "admin",
            Action = action,
            Object = id.ToString(),
            Summary = summary
        });
}
