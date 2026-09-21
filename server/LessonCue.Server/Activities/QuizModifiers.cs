using System.Text.Json.Nodes;

namespace LessonCue.Server.Activities;

/// <summary>
/// Shared, deliberately small rule modifiers for the Quiz engine. Named quiz
/// games use these settings instead of creating another runtime or scorer.
/// The parser accepts both the teacher-facing nested <c>modifiers</c> object
/// and the older top-level boolean aliases so saved definitions remain easy to
/// migrate.
/// </summary>
public sealed record QuizModifierSettings(
    bool WagerEnabled,
    int WagerMaxPoints,
    int WagerDefaultPoints,
    bool SpeedBonusEnabled,
    int SpeedBonusMaxPoints,
    int SpeedBonusWindowSeconds,
    bool LivesEnabled,
    int StartingLives,
    bool EliminateAtZeroLives,
    bool DoubleOrNothingEnabled)
{
    public static QuizModifierSettings FromConfig(JsonObject config)
    {
        var modifiers = ObjectValue(config, "modifiers");
        var wager = ObjectValue(modifiers, "wager");
        var speed = ObjectValue(modifiers, "speedBonus");
        var lives = ObjectValue(modifiers, "lives");
        var doubleOrNothing = ObjectValue(modifiers, "doubleOrNothing");

        var wagerMax = ClampInt(IntValue(wager, "maxPoints", IntValue(modifiers, "wagerMaxPoints", 500)), 0, 10_000);
        var wagerDefault = ClampInt(IntValue(wager, "defaultPoints", 0), 0, wagerMax);
        return new QuizModifierSettings(
            Enabled(wager, modifiers, config, "wager"),
            wagerMax,
            wagerDefault,
            // Speed bonuses are on for quizzes unless a teacher explicitly
            // turns them off. This also makes older definitions pick up the
            // new default without a data migration.
            Enabled(speed, modifiers, config, "speedBonus", defaultValue: true),
            ClampInt(IntValue(speed, "maxPoints", 50), 0, 2_000),
            ClampInt(IntValue(speed, "windowSeconds", 20), 1, 600),
            Enabled(lives, modifiers, config, "lives"),
            ClampInt(IntValue(lives, "startingLives", 3), 1, 9),
            BoolValue(lives, "eliminateAtZero", BoolValue(modifiers, "eliminateAtZero", true)),
            Enabled(doubleOrNothing, modifiers, config, "doubleOrNothing"));
    }

    private static bool Enabled(JsonObject section, JsonObject modifiers, JsonObject config, string key, bool defaultValue = false)
    {
        if (section.TryGetPropertyValue("enabled", out var sectionValue)
            && sectionValue is JsonValue sectionJson
            && sectionJson.TryGetValue<bool>(out var sectionEnabled)) return sectionEnabled;
        if (modifiers.TryGetPropertyValue($"{key}Enabled", out var modifierValue)
            && modifierValue is JsonValue modifierJson
            && modifierJson.TryGetValue<bool>(out var modifierEnabled)) return modifierEnabled;
        if (config.TryGetPropertyValue($"{key}Enabled", out var configValue)
            && configValue is JsonValue configJson
            && configJson.TryGetValue<bool>(out var configEnabled)) return configEnabled;
        return defaultValue;
    }

    private static JsonObject ObjectValue(JsonObject? parent, string key) =>
        parent?.TryGetPropertyValue(key, out var value) == true && value is JsonObject objectValue
            ? objectValue
            : [];

    private static bool BoolValue(JsonObject? parent, string key, bool fallback) =>
        parent?.TryGetPropertyValue(key, out var value) == true
        && value is JsonValue jsonValue
        && jsonValue.TryGetValue<bool>(out var result)
            ? result
            : fallback;

    private static int IntValue(JsonObject? parent, string key, int fallback) =>
        parent?.TryGetPropertyValue(key, out var value) == true
        && value is JsonValue jsonValue
        && jsonValue.TryGetValue<int>(out var result)
            ? result
            : fallback;

    private static int ClampInt(int value, int minimum, int maximum) => Math.Clamp(value, minimum, maximum);
}
