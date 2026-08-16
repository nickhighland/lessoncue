using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class AudienceActivities
{
    public static class Poll
    {
        public sealed record Config(
            string Question = "What is your favorite ice cream flavor?",
            List<object>? Options = null,
            bool ShowLiveResults = true,
            string DisplayStyle = "bar",
            string? Prompt = null);

        public sealed record State(
            bool ResponsesOpen = true,
            bool ResultsVisible = true,
            Dictionary<string, int>? Votes = null,
            int TotalVotes = 0,
            long ActionNonce = 0);

        public static object CreateDefaultConfig() => new Config
        {
            Question = "Live Poll Question",
            Options = ["Option A", "Option B", "Option C", "Option D"],
            ShowLiveResults = true
        };

        public static object CreateInitialState(string configJson) => new State(
            ResponsesOpen: true,
            ResultsVisible: true,
            Votes: new Dictionary<string, int>(),
            TotalVotes: 0,
            ActionNonce: 0
        );

        public static (bool Success, string? Error, object NewState) Reduce(
            string configJson,
            string stateJson,
            string action,
            JsonElement? payload)
        {
            var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? (State)CreateInitialState(configJson);
            switch (action.ToLowerInvariant())
            {
                case "open":
                    return (true, null, state with { ResponsesOpen = true, ActionNonce = state.ActionNonce + 1 });
                case "close":
                    return (true, null, state with { ResponsesOpen = false, ActionNonce = state.ActionNonce + 1 });
                case "showresults":
                    return (true, null, state with { ResultsVisible = true, ActionNonce = state.ActionNonce + 1 });
                case "hideresults":
                    return (true, null, state with { ResultsVisible = false, ActionNonce = state.ActionNonce + 1 });
                case "castvote":
                case "vote":
                {
                    var optIdx = payload?.TryGetProperty("optionIndex", out var pIdx) == true && pIdx.TryGetInt32(out var i) ? i.ToString() : (payload?.TryGetProperty("option", out var pOpt) == true ? pOpt.GetString() ?? "0" : "0");
                    var votes = new Dictionary<string, int>(state.Votes ?? new Dictionary<string, int>());
                    votes[optIdx] = votes.TryGetValue(optIdx, out var count) ? count + 1 : 1;
                    return (true, null, state with
                    {
                        Votes = votes,
                        TotalVotes = state.TotalVotes + 1,
                        ActionNonce = state.ActionNonce + 1
                    });
                }
                case "reset":
                    return (true, null, (State)CreateInitialState(configJson));
                default:
                    return (false, $"Unknown poll action '{action}'.", state);
            }
        }
    }

    public static class Ranking
    {
        public sealed record Config(
            string Question = "Rank the following in order of preference:",
            List<string>? Options = null,
            bool ShowLiveResults = true);

        public sealed record State(
            bool ResponsesOpen = true,
            bool ResultsVisible = true,
            Dictionary<string, double>? AverageRanks = null,
            int TotalParticipants = 0,
            long ActionNonce = 0);

        public static object CreateDefaultConfig() => new Config
        {
            Question = "Rank your favorites:",
            Options = ["Item 1", "Item 2", "Item 3", "Item 4"]
        };

        public static object CreateInitialState(string configJson) => new State(
            ResponsesOpen: true,
            ResultsVisible: true,
            AverageRanks: new Dictionary<string, double>(),
            TotalParticipants: 0,
            ActionNonce: 0
        );

        public static (bool Success, string? Error, object NewState) Reduce(
            string configJson,
            string stateJson,
            string action,
            JsonElement? payload)
        {
            var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? (State)CreateInitialState(configJson);
            switch (action.ToLowerInvariant())
            {
                case "open":
                    return (true, null, state with { ResponsesOpen = true, ActionNonce = state.ActionNonce + 1 });
                case "close":
                    return (true, null, state with { ResponsesOpen = false, ActionNonce = state.ActionNonce + 1 });
                case "showresults":
                    return (true, null, state with { ResultsVisible = true, ActionNonce = state.ActionNonce + 1 });
                case "hideresults":
                    return (true, null, state with { ResultsVisible = false, ActionNonce = state.ActionNonce + 1 });
                case "reset":
                    return (true, null, (State)CreateInitialState(configJson));
                default:
                    return (false, $"Unknown ranking action '{action}'.", state);
            }
        }
    }

    public static class Responses
    {
        public sealed record QuestionItem(
            string Id,
            string Prompt,
            string? Category = null);

        public sealed record ResponseItem(
            string Id,
            string QuestionId,
            string Text,
            string? Author = null,
            int Upvotes = 0,
            bool Approved = true,
            bool Featured = false,
            DateTimeOffset CreatedAt = default);

        public sealed record Config(
            string Title = "Live Q&A Wall",
            List<QuestionItem>? Questions = null,
            string Prompt = "Send in your questions & thoughts:",
            bool RequireModeration = false,
            string DisplayStyle = "wall"); // "wall", "single", "grid"

        public sealed record State(
            int ActiveQuestionIndex = 0,
            bool ResponsesOpen = true,
            string? FeaturedResponseId = null,
            List<ResponseItem>? Responses = null,
            int ApprovedCount = 0,
            long ActionNonce = 0);

        public static object CreateDefaultConfig() => new Config
        {
            Title = "Live Q&A Wall",
            Questions =
            [
                new QuestionItem("q1", "What questions do you have about today's message?", "Discussion"),
                new QuestionItem("q2", "Share your favorite takeaway or reflection:", "Reflection"),
                new QuestionItem("q3", "Send in your prayer requests or praises:", "Prayer")
            ]
        };

        public static object CreateInitialState(string configJson)
        {
            var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
            return new State(
                ActiveQuestionIndex: 0,
                ResponsesOpen: true,
                FeaturedResponseId: null,
                Responses: [],
                ApprovedCount: 0,
                ActionNonce: 0
            );
        }

        public static (bool Success, string? Error, object NewState) Reduce(
            string configJson,
            string stateJson,
            string action,
            JsonElement? payload)
        {
            var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
            var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? (State)CreateInitialState(configJson);
            var responses = new List<ResponseItem>(state.Responses ?? []);
            var questions = config.Questions ?? [new QuestionItem("q1", config.Prompt)];

            switch (action.ToLowerInvariant())
            {
                case "nextquestion":
                case "next":
                {
                    var nextIdx = (state.ActiveQuestionIndex + 1) % Math.Max(1, questions.Count);
                    return (true, null, state with { ActiveQuestionIndex = nextIdx, FeaturedResponseId = null, ActionNonce = state.ActionNonce + 1 });
                }

                case "prevquestion":
                case "prev":
                {
                    var prevIdx = (state.ActiveQuestionIndex - 1 + questions.Count) % Math.Max(1, questions.Count);
                    return (true, null, state with { ActiveQuestionIndex = prevIdx, FeaturedResponseId = null, ActionNonce = state.ActionNonce + 1 });
                }

                case "setquestion":
                case "selectquestion":
                {
                    var idx = payload?.TryGetProperty("questionIndex", out var pIdx) == true && pIdx.TryGetInt32(out var i)
                        ? i
                        : (payload?.TryGetProperty("index", out var pI) == true && pI.TryGetInt32(out var i2) ? i2 : 0);
                    idx = Math.Clamp(idx, 0, Math.Max(0, questions.Count - 1));
                    return (true, null, state with { ActiveQuestionIndex = idx, FeaturedResponseId = null, ActionNonce = state.ActionNonce + 1 });
                }

                case "open":
                    return (true, null, state with { ResponsesOpen = true, ActionNonce = state.ActionNonce + 1 });

                case "close":
                    return (true, null, state with { ResponsesOpen = false, ActionNonce = state.ActionNonce + 1 });

                case "setfeatured":
                case "feature":
                {
                    var id = payload?.TryGetProperty("responseId", out var pId) == true ? pId.GetString() : null;
                    return (true, null, state with { FeaturedResponseId = id, ActionNonce = state.ActionNonce + 1 });
                }

                case "togglefeature":
                {
                    var id = payload?.TryGetProperty("responseId", out var pId) == true ? pId.GetString() : null;
                    var newFeatured = state.FeaturedResponseId == id ? null : id;
                    return (true, null, state with { FeaturedResponseId = newFeatured, ActionNonce = state.ActionNonce + 1 });
                }

                case "submitresponse":
                case "submit":
                {
                    var text = payload?.TryGetProperty("text", out var pText) == true ? pText.GetString() ?? "" : "";
                    if (string.IsNullOrWhiteSpace(text)) return (false, "Response text cannot be empty.", state);

                    var author = payload?.TryGetProperty("author", out var pAuthor) == true ? pAuthor.GetString() : null;
                    var qId = payload?.TryGetProperty("questionId", out var pQId) == true ? pQId.GetString()
                        : (questions.Count > state.ActiveQuestionIndex ? questions[state.ActiveQuestionIndex].Id : "q1");

                    var newResp = new ResponseItem(
                        Id: Guid.NewGuid().ToString(),
                        QuestionId: qId ?? "q1",
                        Text: text.Trim(),
                        Author: string.IsNullOrWhiteSpace(author) ? null : author.Trim(),
                        Upvotes: 0,
                        Approved: !config.RequireModeration,
                        Featured: false,
                        CreatedAt: DateTimeOffset.UtcNow
                    );

                    responses.Insert(0, newResp);
                    var approved = responses.Count(x => x.Approved);

                    return (true, null, state with
                    {
                        Responses = responses,
                        ApprovedCount = approved,
                        ActionNonce = state.ActionNonce + 1
                    });
                }

                case "upvote":
                case "like":
                {
                    var id = payload?.TryGetProperty("responseId", out var pId) == true ? pId.GetString() : null;
                    if (string.IsNullOrWhiteSpace(id)) return (false, "responseId required.", state);

                    var idx = responses.FindIndex(x => x.Id == id);
                    if (idx >= 0)
                    {
                        var item = responses[idx];
                        responses[idx] = item with { Upvotes = item.Upvotes + 1 };
                    }
                    return (true, null, state with { Responses = responses, ActionNonce = state.ActionNonce + 1 });
                }

                case "toggleapprove":
                case "approve":
                {
                    var id = payload?.TryGetProperty("responseId", out var pId) == true ? pId.GetString() : null;
                    if (string.IsNullOrWhiteSpace(id)) return (false, "responseId required.", state);

                    var idx = responses.FindIndex(x => x.Id == id);
                    if (idx >= 0)
                    {
                        var item = responses[idx];
                        responses[idx] = item with { Approved = !item.Approved };
                    }
                    return (true, null, state with
                    {
                        Responses = responses,
                        ApprovedCount = responses.Count(x => x.Approved),
                        ActionNonce = state.ActionNonce + 1
                    });
                }

                case "clearresponses":
                case "clear":
                {
                    return (true, null, state with
                    {
                        Responses = [],
                        ApprovedCount = 0,
                        FeaturedResponseId = null,
                        ActionNonce = state.ActionNonce + 1
                    });
                }

                case "reset":
                    return (true, null, (State)CreateInitialState(configJson));

                default:
                    return (false, $"Unknown responses action '{action}'.", state);
            }
        }
    }
}
