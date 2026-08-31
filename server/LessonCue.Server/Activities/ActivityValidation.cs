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
                    var modifierError = ValidateQuizModifiers(doc.RootElement, "Trivia");
                    if (modifierError is not null) return modifierError;
                    var config = JsonSerializer.Deserialize<TriviaActivity.Config>(configJson, ActivityJsonDefaults.Options);
                    if (config?.Questions != null && config.Questions.Count is < 1 or > 100)
                        return "Trivia must contain between 1 and 100 questions.";
                    if (config?.Questions != null)
                    {
                        foreach (var question in config.Questions)
                        {
                            var answerMode = (question.AnswerMode ?? "choice").Trim().ToLowerInvariant();
                            if (answerMode == "choice")
                            {
                                var optionCount = question.Options?.Count ?? 0;
                                if (optionCount is < 2 or > 8)
                                    return "Trivia questions must have between 2 and 8 choices.";
                                if (!question.CorrectIndex.HasValue || question.CorrectIndex.Value < 0 || question.CorrectIndex.Value >= optionCount)
                                    return "Trivia question correct answers must point to an existing choice.";
                            }
                            else if (answerMode == "text" || answerMode == "shorttext")
                            {
                                var answerCount = question.AcceptedAnswers?.Count(answer => !string.IsNullOrWhiteSpace(answer)) ?? 0;
                                if (answerCount == 0 && string.IsNullOrWhiteSpace(question.CorrectText))
                                    return "Short-answer trivia questions must include at least one accepted answer.";
                                if (answerCount > 20) return "Short-answer trivia questions may contain at most 20 accepted answers.";
                            }
                            else if (answerMode == "number")
                            {
                                if (!question.TargetNumber.HasValue || !double.IsFinite(question.TargetNumber.Value))
                                    return "Number trivia questions must include a finite target number.";
                                if (question.Tolerance.HasValue && (!double.IsFinite(question.Tolerance.Value) || question.Tolerance.Value < 0))
                                    return "Number trivia tolerance must be zero or greater.";
                                if (!string.IsNullOrWhiteSpace(question.ScoringMode) && !new[] { "exact", "closest", "closestWithoutGoingOver" }.Contains(question.ScoringMode.Trim(), StringComparer.OrdinalIgnoreCase))
                                    return "Number trivia scoring mode is invalid.";
                            }
                            else
                            {
                                return "Trivia answer mode must be choice, text, or number.";
                            }
                        }
                    }
                    break;
                }

                case ActivityTypes.RapidFire:
                {
                    var modifierError = ValidateQuizModifiers(doc.RootElement, "Rapid Fire");
                    if (modifierError is not null) return modifierError;
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
                    if (audience.RootElement.TryGetProperty("rounds", out var rounds))
                    {
                        if (rounds.ValueKind != JsonValueKind.Array || rounds.GetArrayLength() is < 1 or > 100)
                            return $"{type} must contain between 1 and 100 rounds.";
                        foreach (var round in rounds.EnumerateArray())
                        {
                            if (round.ValueKind != JsonValueKind.Object || !round.TryGetProperty("options", out var roundOptions) ||
                                roundOptions.ValueKind != JsonValueKind.Array || roundOptions.GetArrayLength() is < 2 or > 8)
                                return $"{type} rounds must have between 2 and 8 choices.";
                        }
                    }
                    break;
                }

                case ActivityTypes.Buzzer:
                {
                    using var buzzer = JsonDocument.Parse(configJson);
                    if (buzzer.RootElement.TryGetProperty("clues", out var clues) && clues.ValueKind == JsonValueKind.Array && clues.GetArrayLength() is < 1 or > 100)
                        return "Buzzer Battle must contain between 1 and 100 clues.";
                    foreach (var property in new[] { "wrongPenalty" })
                        if (BadNumber(buzzer.RootElement, property, 0, 10000))
                            return "Buzzer penalties must be between 0 and 10,000.";
                    if (buzzer.RootElement.TryGetProperty("clues", out var clueValues) && clueValues.ValueKind == JsonValueKind.Array)
                        foreach (var clue in clueValues.EnumerateArray())
                            if (clue.ValueKind == JsonValueKind.Object && BadNumber(clue, "points", 0, 10000))
                                return "Buzzer clue points must be between 0 and 10,000.";
                    break;
                }

                case ActivityTypes.Punchline:
                {
                    using var punchline = JsonDocument.Parse(configJson);
                    if (punchline.RootElement.TryGetProperty("prompts", out var prompts) && prompts.ValueKind == JsonValueKind.Array && prompts.GetArrayLength() is < 1 or > 100)
                        return "Punchline must contain between 1 and 100 prompts.";
                    if (punchline.RootElement.TryGetProperty("votingStyle", out var votingStyle) && votingStyle.ValueKind == JsonValueKind.String && !new[] { "gallery", "headToHead" }.Contains(votingStyle.GetString(), StringComparer.OrdinalIgnoreCase))
                        return "Punchline voting style must be gallery or head-to-head.";
                    if (BadNumber(punchline.RootElement, "headToHeadMatchPoints", 0, 10_000))
                        return "Punchline matchup points must be between 0 and 10,000.";
                    break;
                }

                case ActivityTypes.FakeOut:
                {
                    using var fakeOut = JsonDocument.Parse(configJson);
                    if (fakeOut.RootElement.TryGetProperty("rounds", out var rounds) && rounds.ValueKind == JsonValueKind.Array && rounds.GetArrayLength() is < 1 or > 100)
                        return "Fake Out must contain between 1 and 100 rounds.";
                    foreach (var property in new[] { "truthPoints", "bluffPoints", "hostFavoritePoints" })
                        if (BadNumber(fakeOut.RootElement, property, 0, 10000))
                            return "Fake Out scoring values must be between 0 and 10,000.";
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

                case ActivityTypes.ImageReveal:
                {
                    using var reveal = JsonDocument.Parse(configJson);
                    var mediaMode = reveal.RootElement.TryGetProperty("mediaMode", out var mediaModeElement) && mediaModeElement.ValueKind == JsonValueKind.String
                        ? mediaModeElement.GetString()?.Trim().ToLowerInvariant()
                        : "image";
                    if (mediaMode is not ("image" or "memorygrid" or "audio" or "difference" or "emoji" or "rebus"))
                        return "Image Reveal media mode must be image, memoryGrid, audio, difference, emoji, or rebus.";
                    if (BadNumber(reveal.RootElement, "totalStages", 1, 24))
                        return "Image Reveal must contain between 1 and 24 reveal stages.";
                    if (BadNumber(reveal.RootElement, "stages", 1, 24))
                        return "Image Reveal must contain between 1 and 24 reveal stages.";
                    if (BadNumber(reveal.RootElement, "autoIntervalSeconds", 1, 60))
                        return "Image Reveal auto-reveal must be between 1 and 60 seconds per stage.";
                    if (reveal.RootElement.TryGetProperty("style", out var style) && style.ValueKind == JsonValueKind.String && !new[] { "blur", "pixel", "zoom", "silhouette", "crop" }.Contains(style.GetString(), StringComparer.OrdinalIgnoreCase))
                        return "Image Reveal style is invalid.";
                    if (mediaMode == "memorygrid")
                    {
                        if (!reveal.RootElement.TryGetProperty("memoryCards", out var memoryCards) || memoryCards.ValueKind != JsonValueKind.Array || memoryCards.GetArrayLength() is < 2 or > 100)
                            return "Memory Grid must contain between 2 and 100 cards.";
                        var cardIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach (var card in memoryCards.EnumerateArray())
                        {
                            if (!card.TryGetProperty("id", out var cardId) || cardId.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(cardId.GetString()) || !cardIds.Add(cardId.GetString()!))
                                return "Memory Grid card IDs must be present and unique.";
                            if (!card.TryGetProperty("label", out var label) || label.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(label.GetString()))
                                return "Memory Grid cards need visible labels or symbols.";
                        }
                    }
                    if (mediaMode == "audio" && BadNumber(reveal.RootElement, "audioDurationSeconds", 1, 600))
                        return "Audio clues must be between 1 second and 10 minutes.";
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
                        if (interactive.RootElement.TryGetProperty("scoringMode", out var scoringMode) &&
                            (scoringMode.ValueKind != JsonValueKind.String || !new[] { "partial", "exact" }.Contains(scoringMode.GetString(), StringComparer.OrdinalIgnoreCase)))
                            return "Ordering scoring mode must be partial or exact.";
                        foreach (var round in rounds.EnumerateArray())
                        {
                            var interactionMode = round.TryGetProperty("interactionMode", out var roundMode) && roundMode.ValueKind == JsonValueKind.String
                                ? roundMode.GetString()?.Trim().ToLowerInvariant()
                                : interactive.RootElement.TryGetProperty("interactionMode", out var rootMode) && rootMode.ValueKind == JsonValueKind.String
                                    ? rootMode.GetString()?.Trim().ToLowerInvariant()
                                    : "ordering";
                            if (interactionMode == "matching")
                            {
                                if (!round.TryGetProperty("pairs", out var pairs) || pairs.ValueKind != JsonValueKind.Array || pairs.GetArrayLength() is < 2 or > 50)
                                    return "Match-Up rounds must contain between 2 and 50 pairs.";
                                var pairIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                                foreach (var pair in pairs.EnumerateArray())
                                {
                                    if (!pair.TryGetProperty("left", out var left) || left.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(left.GetString()) ||
                                        !pair.TryGetProperty("right", out var right) || right.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(right.GetString()))
                                        return "Every Match-Up pair needs left and right text.";
                                    var id = pair.TryGetProperty("id", out var pairId) && pairId.ValueKind == JsonValueKind.String ? pairId.GetString() : null;
                                    if (!string.IsNullOrWhiteSpace(id) && !pairIds.Add(id)) return "Match-Up pair IDs must be unique.";
                                }
                            }
                            else if (interactionMode == "grouping")
                            {
                                if (!round.TryGetProperty("items", out var groupingItems) || groupingItems.ValueKind != JsonValueKind.Array || groupingItems.GetArrayLength() is < 2 or > 50)
                                    return "Connections rounds must contain between 2 and 50 items.";
                                if (!round.TryGetProperty("groups", out var groups) || groups.ValueKind != JsonValueKind.Array || groups.GetArrayLength() is < 2 or > 12)
                                    return "Connections rounds must contain between 2 and 12 groups.";
                                var itemIds = groupingItems.EnumerateArray().Select(item => item.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String ? id.GetString() : null).Where(id => !string.IsNullOrWhiteSpace(id)).Cast<string>().ToHashSet(StringComparer.OrdinalIgnoreCase);
                                foreach (var group in groups.EnumerateArray())
                                {
                                    if (!group.TryGetProperty("itemIds", out var groupItems) || groupItems.ValueKind != JsonValueKind.Array || groupItems.GetArrayLength() < 1)
                                        return "Every Connections group needs at least one item.";
                                    foreach (var itemId in groupItems.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString() ?? ""))
                                        if (!itemIds.Contains(itemId)) return "Connections groups may only contain items from the round.";
                                }
                            }
                            else if (round.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array && items.GetArrayLength() is < 2 or > 50)
                                return "Ordering rounds must contain between 2 and 50 items.";
                            if (BadNumber(round, "points", 0, 10000))
                                return "Ordering round points must be between 0 and 10,000.";
                        }
                    }
                    if (type == ActivityTypes.Drawing)
                    {
                        if (configJson.Length > 20000) return "Drawing activity configuration is too large.";
                        foreach (var property in new[] { "maxStrokes", "maxPointsPerStroke" })
                            if (BadNumber(interactive.RootElement, property, 1, 240))
                                return "Drawing limits must be between 1 and 240.";
                        if (BadNumber(interactive.RootElement, "votingSeconds", 5, 600))
                            return "Drawing voting time must be between 5 seconds and 10 minutes.";
                        if (interactive.RootElement.TryGetProperty("telephoneChain", out var telephoneChain) && telephoneChain.ValueKind == JsonValueKind.True)
                        {
                            if (!interactive.RootElement.TryGetProperty("chainSteps", out var chainSteps) || chainSteps.ValueKind != JsonValueKind.Array || chainSteps.GetArrayLength() is < 2 or > 12)
                                return "Telephone Draw must contain between 2 and 12 chain steps.";
                            foreach (var step in chainSteps.EnumerateArray())
                            {
                                if (!step.TryGetProperty("kind", out var kind) || kind.ValueKind != JsonValueKind.String || !new[] { "drawing", "description" }.Contains(kind.GetString(), StringComparer.OrdinalIgnoreCase))
                                    return "Telephone Draw steps must be drawing or description steps.";
                                if (!step.TryGetProperty("prompt", out var stepPrompt) || stepPrompt.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(stepPrompt.GetString()))
                                    return "Telephone Draw steps need a prompt.";
                            }
                        }
                    }
                    if (type == ActivityTypes.Word)
                    {
                        if (BadNumber(interactive.RootElement, "maxWords", 1, 30))
                            return "Word rounds may accept between 1 and 30 words per response.";
                        if (interactive.RootElement.TryGetProperty("turnBased", out var turnBased) && turnBased.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                            return "Word turn-based mode must be true or false.";
                        if (rounds.ValueKind == JsonValueKind.Array)
                            foreach (var round in rounds.EnumerateArray())
                                if (BadNumber(round, "seconds", 5, 600))
                                    return "Word round timers must be between 5 seconds and 10 minutes.";
                    }
                    if (type == ActivityTypes.MatchPlayer && rounds.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var round in rounds.EnumerateArray())
                        {
                            var answerMode = round.TryGetProperty("answerMode", out var mode) && mode.ValueKind == JsonValueKind.String ? mode.GetString() : "choice";
                            if (answerMode is not ("choice" or "text")) return "Match Minds answer mode must be choice or text.";
                            if (answerMode == "choice" && (!round.TryGetProperty("options", out var options) || options.ValueKind != JsonValueKind.Array || options.GetArrayLength() is < 2 or > 8))
                                return "Choice-based Match Minds rounds must have between 2 and 8 options.";
                            if (BadNumber(round, "points", 0, 10000))
                                return "Match Minds round points must be between 0 and 10,000.";
                        }
                    }
                    if (type == ActivityTypes.StageChallenge && rounds.ValueKind == JsonValueKind.Array)
                    {
                        if (interactive.RootElement.TryGetProperty("audienceVoting", out var audienceVoting) && audienceVoting.ValueKind != JsonValueKind.True && audienceVoting.ValueKind != JsonValueKind.False)
                            return "Stage Challenge audienceVoting must be true or false.";
                        if (BadNumber(interactive.RootElement, "audienceVotePoints", 0, 1000))
                            return "Stage Challenge audience vote points must be between 0 and 1,000.";
                        foreach (var challenge in rounds.EnumerateArray())
                        {
                            if (BadNumber(challenge, "seconds", 5, 3600))
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
                    var selection = bracket.RootElement.TryGetProperty("entrantSelection", out var selectionElement) && selectionElement.ValueKind == JsonValueKind.String
                        ? selectionElement.GetString()
                        : "all";
                    if (selection is not ("all" or "random")) return "Bracket entrant selection must be all or random.";
                    if (BadNumber(bracket.RootElement, "randomEntrantCount", 2, 32))
                        return "Random bracket rosters must contain between 2 and 32 entrants.";
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
                    var adventure = physical.RootElement.TryGetProperty("adventure", out var adventureElement) && adventureElement.ValueKind == JsonValueKind.True;
                    var nodeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (adventure)
                    {
                        foreach (var round in rounds.EnumerateArray())
                        {
                            if (round.ValueKind != JsonValueKind.Object) return "Each Physical Room round must be an object.";
                            if (!round.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(id.GetString()))
                                return "Adventure nodes need a non-empty id.";
                            if (!nodeIds.Add(id.GetString()!)) return "Adventure node ids must be unique.";
                        }
                    }
                    foreach (var round in rounds.EnumerateArray())
                    {
                        if (round.ValueKind != JsonValueKind.Object) return "Each Physical Room round must be an object.";
                        var nodeType = ActivityAdventureNodeTypes.Choice;
                        if (adventure && round.TryGetProperty("nodeType", out var nodeTypeElement))
                        {
                            if (nodeTypeElement.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(nodeTypeElement.GetString()))
                                return "Adventure node types must be strings.";
                            nodeType = nodeTypeElement.GetString()!.Trim().ToLowerInvariant();
                            if (!ActivityAdventureNodeTypes.IsValid(nodeType))
                                return $"Adventure node type '{nodeType}' is not supported.";
                        }
                        if (BadNumber(round, "seconds", 5, 3600))
                            return "Physical Room timers must be between 5 seconds and 60 minutes.";
                        var choiceCount = round.TryGetProperty("choices", out var choicesElement) && choicesElement.ValueKind == JsonValueKind.Array
                            ? choicesElement.GetArrayLength()
                            : 0;
                        if (adventure && nodeType is ActivityAdventureNodeTypes.Poll or ActivityAdventureNodeTypes.Quiz && choiceCount is < 2 or > 12)
                            return $"Adventure {nodeType} nodes need between 2 and 12 choices.";
                        if (adventure && nodeType == ActivityAdventureNodeTypes.Quiz && BadNumber(round, "correctIndex", 0, Math.Max(0, choiceCount - 1)))
                            return "Adventure quiz correctIndex must point to a visible choice.";
                        if (adventure && nodeType == ActivityAdventureNodeTypes.End && choiceCount > 0)
                            return "Adventure end nodes cannot contain choices.";
                        if (adventure && nodeType == ActivityAdventureNodeTypes.Media)
                        {
                            foreach (var mediaKey in new[] { "mediaUrl", "mediaId" })
                            {
                                if (round.TryGetProperty(mediaKey, out var mediaValue) && mediaValue.ValueKind != JsonValueKind.String)
                                    return $"Adventure media {mediaKey} must be a string.";
                            }
                        }
                        if (adventure && nodeType == ActivityAdventureNodeTypes.Score)
                        {
                            if (BadNumber(round, "scoreDelta", -10000, 10000))
                                return "Adventure scoreDelta must be between -10,000 and 10,000.";
                            if (round.TryGetProperty("scoreTarget", out var scoreTarget) && (scoreTarget.ValueKind != JsonValueKind.String || !new[] { "team", "allTeams", "participant", "none" }.Contains(scoreTarget.GetString(), StringComparer.OrdinalIgnoreCase)))
                                return "Adventure scoreTarget must be team, allTeams, participant, or none.";
                        }
                        if (adventure && nodeType == ActivityAdventureNodeTypes.Inventory)
                        {
                            if (!round.TryGetProperty("inventoryKey", out var inventoryKey) || inventoryKey.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(inventoryKey.GetString()) || inventoryKey.GetString()!.Length > 80)
                                return "Adventure inventory nodes need an inventoryKey of 1–80 characters.";
                            if (round.TryGetProperty("inventoryValue", out var inventoryValue) && (inventoryValue.ValueKind != JsonValueKind.String || inventoryValue.GetString()!.Length > 200))
                                return "Adventure inventoryValue must be at most 200 characters.";
                        }
                        if (adventure && nodeType == ActivityAdventureNodeTypes.Condition)
                        {
                            if (!round.TryGetProperty("conditionKey", out var conditionKey) || conditionKey.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(conditionKey.GetString()) || conditionKey.GetString()!.Length > 80)
                                return "Adventure condition nodes need a conditionKey of 1–80 characters.";
                            foreach (var targetKey in new[] { "trueTarget", "falseTarget" })
                            {
                                if (round.TryGetProperty(targetKey, out var target) && ValidateAdventureTarget(target, rounds.GetArrayLength(), nodeIds, $"Adventure {targetKey}") is { } targetError)
                                    return targetError;
                            }
                        }
                        if (adventure && nodeType is ActivityAdventureNodeTypes.Scene or ActivityAdventureNodeTypes.Media or ActivityAdventureNodeTypes.Score or ActivityAdventureNodeTypes.Inventory)
                        {
                            foreach (var targetKey in new[] { "next", "nextTarget" })
                            {
                                if (round.TryGetProperty(targetKey, out var target) && ValidateAdventureTarget(target, rounds.GetArrayLength(), nodeIds, "Adventure next target") is { } targetError)
                                    return targetError;
                            }
                        }
                        if (adventure && nodeType == ActivityAdventureNodeTypes.Random && round.TryGetProperty("randomTargets", out var randomTargets))
                        {
                            if (randomTargets.ValueKind != JsonValueKind.Array || randomTargets.GetArrayLength() is < 1 or > 12)
                                return "Adventure randomTargets must contain between 1 and 12 destinations.";
                            foreach (var target in randomTargets.EnumerateArray())
                                if (ValidateAdventureTarget(target, rounds.GetArrayLength(), nodeIds, "Adventure random target") is { } targetError)
                                    return targetError;
                        }
                        if (adventure && nodeType == ActivityAdventureNodeTypes.Random && !round.TryGetProperty("randomTargets", out _) && (!round.TryGetProperty("branches", out var randomBranches) || randomBranches.ValueKind != JsonValueKind.Object || randomBranches.EnumerateObject().Any() == false))
                            return "Adventure random nodes need at least one destination.";
                        if (round.TryGetProperty("choices", out var choices) && choices.ValueKind == JsonValueKind.Array)
                        {
                            if (choices.GetArrayLength() > 12) return "A Physical Room round cannot have more than 12 choices.";
                            if (adventure && round.TryGetProperty("branches", out var branches))
                            {
                                if (branches.ValueKind != JsonValueKind.Object) return "Adventure branches must be an object keyed by choice number.";
                                foreach (var branch in branches.EnumerateObject())
                                {
                                    if (!int.TryParse(branch.Name, out var choiceIndex) || choiceIndex < 0 || choiceIndex >= choices.GetArrayLength())
                                        return "Adventure branch choice indexes must point to a visible choice.";
                                    if (ValidateAdventureTarget(branch.Value, rounds.GetArrayLength(), nodeIds, "Adventure branch target") is { } targetError)
                                        return targetError;
                                }
                            }
                        }
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
                        if (BadNumber(utility.RootElement, "diceSides", 2, 1000))
                            return "Dice must have between 2 and 1,000 sides.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.RandomNumber, StringComparison.OrdinalIgnoreCase))
                    {
                        var minimum = NumberOr(utility.RootElement, "minimum", 1);
                        var maximum = NumberOr(utility.RootElement, "maximum", 100);
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
                        if (BadNumber(utility.RootElement, "teamCount", 2, 12))
                            return "Team Generator must create between 2 and 12 teams.";
                        if (utility.RootElement.TryGetProperty("teamAssignmentMode", out var assignmentMode) && (assignmentMode.ValueKind != JsonValueKind.String || !ActivityUtilityAssignmentModes.IsValid(assignmentMode.GetString() ?? "")))
                            return "Team Generator assignment mode must be manual, balanced, or random.";
                    }
                    if (utilityType.Equals(ActivityUtilityTypes.Countdown, StringComparison.OrdinalIgnoreCase))
                    {
                        if (BadNumber(utility.RootElement, "durationSeconds", 1, 3600))
                            return "Utility Countdown must be between 1 second and 60 minutes.";
                        if (BadNumber(utility.RootElement, "warningThresholdSeconds", 0, 3600))
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

    private static string? ValidateAdventureTarget(JsonElement target, int roundCount, HashSet<string> nodeIds, string label)
    {
        if (target.ValueKind == JsonValueKind.Number)
        {
            if (target.ValueKind != JsonValueKind.Number
                || !target.TryGetInt32(out var targetIndex) || targetIndex < 0 || targetIndex >= roundCount)
                return $"{label} indexes must point to an existing node.";
            return null;
        }
        if (target.ValueKind != JsonValueKind.String)
            return $"{label} must be a node id, node index, or __end__.";
        var targetId = target.GetString();
        return string.IsNullOrWhiteSpace(targetId) || (!string.Equals(targetId, "__end__", StringComparison.OrdinalIgnoreCase) && !nodeIds.Contains(targetId))
            ? $"{label}s must point to an existing node or finish the adventure."
            : null;
    }

    private static string? ValidateQuizModifiers(JsonElement root, string label)
    {
        if (!root.TryGetProperty("modifiers", out var modifiers) || modifiers.ValueKind != JsonValueKind.Object) return null;

        if (modifiers.TryGetProperty("wager", out var wager) && wager.ValueKind == JsonValueKind.Object)
        {
            var max = NumberOr(wager, "maxPoints", 500);
            var defaultValue = NumberOr(wager, "defaultPoints", 0);
            if (max is < 0 or > 10_000 || defaultValue is < 0 || defaultValue > max)
                return $"{label} wager points must be between 0 and 10,000, with the default no higher than the maximum.";
        }

        if (modifiers.TryGetProperty("speedBonus", out var speed) && speed.ValueKind == JsonValueKind.Object)
        {
            var max = NumberOr(speed, "maxPoints", 50);
            var window = NumberOr(speed, "windowSeconds", 20);
            if (max is < 0 or > 2_000 || window is < 1 or > 600)
                return $"{label} speed bonuses must be at most 2,000 points and use a 1–600 second window.";
        }

        if (modifiers.TryGetProperty("lives", out var lives) && lives.ValueKind == JsonValueKind.Object)
        {
            var startingLives = NumberOr(lives, "startingLives", 3);
            if (startingLives is < 1 or > 9) return $"{label} must start with between 1 and 9 lives.";
        }

        return null;
    }

    /// <summary>
    /// Whether a numeric setting is present but not a whole number in range.
    /// Absent counts as fine, and so does an explicit null: a nullable field
    /// serializes to null, which is the model saying "not set".
    /// </summary>
    /// <remarks>
    /// JsonElement.TryGetInt32 throws rather than returning false when the
    /// element is not a number, so reading a null this way turned "create this
    /// game from the library" into a 500 with no message. Two call sites had
    /// already been patched with a local kind check; this is the same fix
    /// everywhere, once.
    /// </remarks>
    private static bool BadNumber(JsonElement source, string name, int min, int max)
    {
        if (!source.TryGetProperty(name, out var element)) return false;
        if (element.ValueKind == JsonValueKind.Null) return false;
        if (element.ValueKind != JsonValueKind.Number) return true;
        return !element.TryGetInt32(out var value) || value < min || value > max;
    }

    /// <summary>A numeric setting, or the shipped default when it is not set.</summary>
    private static int NumberOr(JsonElement source, string name, int fallback) =>
        source.TryGetProperty(name, out var element)
        && element.ValueKind == JsonValueKind.Number
        && element.TryGetInt32(out var value)
            ? value
            : fallback;

}
