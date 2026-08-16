using System.Text.Json;
using LessonCue.Server.Activities.Types;

namespace LessonCue.Server.Activities;

public static class ActivityValidation
{
    public static string? ValidateDefinition(string type, string? name, string configJson)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "Activity name is required.";
        }

        if (name.Length > 160)
        {
            return "Activity name cannot exceed 160 characters.";
        }

        if (!ActivityTypes.IsValid(type))
        {
            return $"Invalid activity type '{type}'. Valid types: {string.Join(", ", ActivityTypes.All)}.";
        }

        try
        {
            using var doc = JsonDocument.Parse(configJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return "Config must be a JSON object.";
            }

            // Type-specific validations
            switch (type)
            {
                case ActivityTypes.Wheel:
                {
                    var config = JsonSerializer.Deserialize<WheelActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Items != null && config.Items.Count is < 1 or > 50)
                    {
                        return "Wheel must contain between 1 and 50 items.";
                    }
                    break;
                }

                case ActivityTypes.Picker:
                {
                    var config = JsonSerializer.Deserialize<PickerActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Items != null && config.Items.Count is < 1 or > 25000)
                    {
                        return "Picker must contain between 1 and 25,000 items.";
                    }
                    break;
                }

                case ActivityTypes.Scoreboard:
                {
                    var config = JsonSerializer.Deserialize<ScoreboardActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Teams != null && config.Teams.Count is < 1 or > 30)
                    {
                        return "Scoreboard must contain between 1 and 30 teams.";
                    }
                    break;
                }

                case ActivityTypes.PrizeGrid:
                {
                    var config = JsonSerializer.Deserialize<PrizeGridActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Boxes != null && config.Boxes.Count is < 1 or > 100)
                    {
                        return "Prize Grid must contain between 1 and 100 boxes.";
                    }
                    break;
                }

                case ActivityTypes.Trivia:
                {
                    var config = JsonSerializer.Deserialize<TriviaActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Questions != null && config.Questions.Count is < 1 or > 100)
                        return "Trivia must contain between 1 and 100 questions.";
                    if (config?.Questions != null)
                    {
                        foreach (var question in config.Questions)
                        {
                            var optionCount = question.Options?.Count ?? 0;
                            if (optionCount is < 2 or > 8)
                                return "Trivia questions must have between 2 and 8 choices.";
                            if (question.CorrectIndex < 0 || question.CorrectIndex >= optionCount)
                                return "Trivia question correct answers must point to an existing choice.";
                        }
                    }
                    break;
                }

                case ActivityTypes.RapidFire:
                {
                    var config = JsonSerializer.Deserialize<RapidFireActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Questions != null && config.Questions.Count is < 1 or > 100)
                        return "Rapid Fire must contain between 1 and 100 questions.";
                    if (config?.Questions != null)
                        foreach (var question in config.Questions)
                        {
                            var optionCount = question.Options?.Count ?? 0;
                            if (optionCount is < 2 or > 8) return "Rapid Fire questions must have between 2 and 8 choices.";
                            if (question.CorrectIndex < 0 || question.CorrectIndex >= optionCount) return "Rapid Fire question correct answers must point to an existing choice.";
                        }
                    break;
                }

                case ActivityTypes.EmojiPrompt:
                {
                    var config = JsonSerializer.Deserialize<EmojiPromptActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Rounds != null && config.Rounds.Count is < 1 or > 100)
                        return "Emoji Prompt must contain between 1 and 100 rounds.";
                    break;
                }

                case ActivityTypes.RankIt:
                {
                    var config = JsonSerializer.Deserialize<RankItActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Rounds != null && config.Rounds.Count is < 1 or > 50)
                        return "Rank It must contain between 1 and 50 rounds.";
                    if (config?.Rounds != null)
                        foreach (var round in config.Rounds)
                            if ((round.Items?.Count ?? 0) is < 2 or > 50) return "Rank It rounds must contain between 2 and 50 items.";
                    break;
                }

                case ActivityTypes.WordScramble:
                {
                    var config = JsonSerializer.Deserialize<WordScrambleActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Rounds != null && config.Rounds.Count is < 1 or > 100)
                        return "Word Scramble must contain between 1 and 100 rounds.";
                    break;
                }

                case ActivityTypes.Prediction:
                {
                    var config = JsonSerializer.Deserialize<PredictionActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Rounds != null && config.Rounds.Count is < 1 or > 100)
                        return "Prediction must contain between 1 and 100 rounds.";
                    if (config?.Rounds != null)
                        foreach (var round in config.Rounds)
                        {
                            var optionCount = round.Options?.Count ?? 0;
                            if (optionCount is < 2 or > 8) return "Prediction rounds must have between 2 and 8 choices.";
                            if (round.CorrectIndex < 0 || round.CorrectIndex >= optionCount) return "Prediction correct answers must point to an existing choice.";
                        }
                    break;
                }

                case ActivityTypes.Poll:
                case ActivityTypes.Ranking:
                {
                    using var audience = JsonDocument.Parse(configJson);
                    if (audience.RootElement.TryGetProperty("options", out var options))
                    {
                        if (options.ValueKind != JsonValueKind.Array || options.GetArrayLength() is < 2 or > 8)
                            return $"{type} choices must contain between 2 and 8 entries.";
                    }
                    break;
                }

                case ActivityTypes.Buzzer:
                {
                    using var buzzer = JsonDocument.Parse(configJson);
                    if (buzzer.RootElement.TryGetProperty("clues", out var clues) && clues.ValueKind == JsonValueKind.Array && clues.GetArrayLength() is < 1 or > 100)
                        return "Buzzer Battle must contain between 1 and 100 clues.";
                    break;
                }

                case ActivityTypes.Punchline:
                {
                    using var punchline = JsonDocument.Parse(configJson);
                    if (punchline.RootElement.TryGetProperty("prompts", out var prompts) && prompts.ValueKind == JsonValueKind.Array && prompts.GetArrayLength() is < 1 or > 100)
                        return "Punchline must contain between 1 and 100 prompts.";
                    break;
                }

                case ActivityTypes.FakeOut:
                {
                    using var fakeOut = JsonDocument.Parse(configJson);
                    if (fakeOut.RootElement.TryGetProperty("rounds", out var rounds) && rounds.ValueKind == JsonValueKind.Array && rounds.GetArrayLength() is < 1 or > 100)
                        return "Fake Out must contain between 1 and 100 rounds.";
                    break;
                }

                case ActivityTypes.SurveyBoard:
                {
                    var config = JsonSerializer.Deserialize<SurveyBoardActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Questions != null && config.Questions.Count is < 1 or > 100)
                        return "Survey Board must contain between 1 and 100 questions.";
                    if (config?.Questions != null)
                        foreach (var question in config.Questions)
                        {
                            var answers = question.Answers ?? question.Items;
                            if (answers != null && answers.Count is < 1 or > 100) return "Survey Board questions must contain between 1 and 100 answers.";
                        }
                    if (config?.Questions == null && config?.Answers != null && config.Answers.Count is < 1 or > 100)
                        return "Survey Board must contain between 1 and 100 answers.";
                    break;
                }

                case ActivityTypes.Drawing:
                case ActivityTypes.Ordering:
                case ActivityTypes.Word:
                case ActivityTypes.MatchPlayer:
                case ActivityTypes.StageChallenge:
                {
                    using var interactive = JsonDocument.Parse(configJson);
                    var collectionName = type == ActivityTypes.Drawing ? "prompts" : type == ActivityTypes.StageChallenge ? "challenges" : "rounds";
                    if (interactive.RootElement.TryGetProperty(collectionName, out var rounds) && rounds.ValueKind == JsonValueKind.Array && rounds.GetArrayLength() is < 1 or > 100)
                        return $"{type} must contain between 1 and 100 rounds.";
                    if (type == ActivityTypes.Ordering && rounds.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var round in rounds.EnumerateArray())
                        {
                            if (round.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array && items.GetArrayLength() is < 2 or > 50)
                                return "Ordering rounds must contain between 2 and 50 items.";
                        }
                    }
                    if (type == ActivityTypes.Drawing && configJson.Length > 20000)
                        return "Drawing activity configuration is too large.";
                    if (type == ActivityTypes.MatchPlayer && rounds.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var round in rounds.EnumerateArray())
                        {
                            if (round.TryGetProperty("options", out var options) && options.ValueKind == JsonValueKind.Array && options.GetArrayLength() is < 2 or > 8)
                                return "Match Minds rounds must have between 2 and 8 options.";
                        }
                    }
                    if (type == ActivityTypes.StageChallenge && rounds.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var challenge in rounds.EnumerateArray())
                        {
                            if (challenge.TryGetProperty("seconds", out var seconds) && seconds.ValueKind == JsonValueKind.Number && (!seconds.TryGetInt32(out var duration) || duration is < 5 or > 3600))
                                return "Stage Challenge timers must be between 5 seconds and 60 minutes.";
                        }
                    }
                    break;
                }
                case ActivityTypes.Bracket:
                {
                    using var bracket = JsonDocument.Parse(configJson);
                    var source = bracket.RootElement.TryGetProperty("entrantSource", out var sourceElement) && sourceElement.ValueKind == JsonValueKind.String
                        ? sourceElement.GetString()
                        : "teacher";
                    if (source is not ("teacher" or "participants" or "teams")) return "Bracket entrant source must be teacher, participants, or teams.";
                    if (!bracket.RootElement.TryGetProperty("entrants", out var entrants) || entrants.ValueKind != JsonValueKind.Array)
                    {
                        if (source == "teacher") return "Bracket Battle needs at least two entrants.";
                        break;
                    }
                    if (source == "teacher" && entrants.GetArrayLength() is < 2 or > 32)
                        return "Bracket Battle must have between 2 and 32 entrants.";
                    if (entrants.GetArrayLength() > 32) return "Bracket Battle cannot have more than 32 entrants.";
                    var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var entrant in entrants.EnumerateArray())
                    {
                        if (!entrant.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(id.GetString()))
                            return "Every bracket entrant needs a unique id.";
                        if (!ids.Add(id.GetString()!)) return "Bracket entrant ids must be unique.";
                        if (!entrant.TryGetProperty("label", out var label) || label.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(label.GetString()))
                            return "Every bracket entrant needs a label.";
                    }
                    break;
                }
                case ActivityTypes.PhysicalRoom:
                {
                    using var physical = JsonDocument.Parse(configJson);
                    if (!physical.RootElement.TryGetProperty("rounds", out var rounds) || rounds.ValueKind != JsonValueKind.Array || rounds.GetArrayLength() is < 1 or > 100)
                        return "Physical Room needs between one and 100 rounds.";
                    foreach (var round in rounds.EnumerateArray())
                    {
                        if (round.ValueKind != JsonValueKind.Object) return "Each Physical Room round must be an object.";
                        if (round.TryGetProperty("seconds", out var seconds) && seconds.ValueKind == JsonValueKind.Number && (!seconds.TryGetInt32(out var duration) || duration is < 5 or > 3600))
                            return "Physical Room timers must be between 5 seconds and 60 minutes.";
                        if (round.TryGetProperty("choices", out var choices) && choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 12)
                            return "A Physical Room round cannot have more than 12 choices.";
                    }
                    break;
                }
                case ActivityTypes.Utility:
                {
                    using var utility = JsonDocument.Parse(configJson);
                    var utilityType = utility.RootElement.TryGetProperty("utilityType", out var utilityTypeElement) && utilityTypeElement.ValueKind == JsonValueKind.String
                        ? utilityTypeElement.GetString() ?? ActivityUtilityTypes.CoinFlip
                        : ActivityUtilityTypes.CoinFlip;
                    if (!ActivityUtilityTypes.IsValid(utilityType)) return "Utility preset is not supported.";
                    if (utilityType.Equals(ActivityUtilityTypes.CoinFlip, StringComparison.OrdinalIgnoreCase))
                    {
                        if (utility.RootElement.TryGetProperty("choices", out var choices) && (choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() is < 2 or > 8))
                            return "Coin Flip choices must contain between 2 and 8 entries.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.Dice, StringComparison.OrdinalIgnoreCase))
                    {
                        if (utility.RootElement.TryGetProperty("diceSides", out var sides) && (!sides.TryGetInt32(out var sideCount) || sideCount is < 2 or > 1000))
                            return "Dice must have between 2 and 1,000 sides.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.RandomNumber, StringComparison.OrdinalIgnoreCase))
                    {
                        var minimum = utility.RootElement.TryGetProperty("minimum", out var minimumElement) && minimumElement.TryGetInt32(out var min) ? min : 1;
                        var maximum = utility.RootElement.TryGetProperty("maximum", out var maximumElement) && maximumElement.TryGetInt32(out var max) ? max : 100;
                        if (maximum < minimum || maximum - (long)minimum > 1_000_000) return "Random Number needs a range of at most one million values.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.MysteryBoxes, StringComparison.OrdinalIgnoreCase))
                    {
                        if (!utility.RootElement.TryGetProperty("boxes", out var boxes) || boxes.ValueKind != JsonValueKind.Array || boxes.GetArrayLength() is < 2 or > 50)
                            return "Mystery Boxes needs between 2 and 50 boxes.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.ChallengePicker, StringComparison.OrdinalIgnoreCase))
                    {
                        if (!utility.RootElement.TryGetProperty("challenges", out var challenges) || challenges.ValueKind != JsonValueKind.Array || challenges.GetArrayLength() is < 1 or > 100)
                            return "Challenge Picker needs between 1 and 100 challenges.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.TeamGenerator, StringComparison.OrdinalIgnoreCase))
                    {
                        if (utility.RootElement.TryGetProperty("teamCount", out var teamCount) && (!teamCount.TryGetInt32(out var count) || count is < 2 or > 12))
                            return "Team Generator must create between 2 and 12 teams.";
                        if (utility.RootElement.TryGetProperty("teamAssignmentMode", out var assignmentMode) && (assignmentMode.ValueKind != JsonValueKind.String || !ActivityUtilityAssignmentModes.IsValid(assignmentMode.GetString() ?? "")))
                            return "Team Generator assignment mode must be manual, balanced, or random.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.Countdown, StringComparison.OrdinalIgnoreCase))
                    {
                        if (utility.RootElement.TryGetProperty("durationSeconds", out var duration) && (!duration.TryGetInt32(out var seconds) || seconds is < 1 or > 3600))
                            return "Utility Countdown must be between 1 second and 60 minutes.";
                        if (utility.RootElement.TryGetProperty("warningThresholdSeconds", out var warning) && (!warning.TryGetInt32(out var warningSeconds) || warningSeconds is < 0 or > 3600))
                            return "Countdown warning time must be between 0 seconds and 60 minutes.";
                    }
                    break;
                }
            }
        }
        catch (JsonException ex)
        {
            return $"Malformed Config JSON: {ex.Message}";
        }

        return null;
    }
}
