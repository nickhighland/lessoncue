using System.Text.Json;
using System.Text.Json.Serialization;

namespace LessonCue.Server.Activities.Types;

public static class PrizeGridActivity
{
    public sealed record BoxConfig(
        int BoxNumber,
        string FrontText = "",
        string FrontEmoji = "🎁",
        string HiddenPrize = "",
        int Points = 0,
        string? HiddenImage = null,
        string? Label = null,
        string? Icon = null,
        string? Prize = null)
    {
        [JsonIgnore] public string EffectiveFrontText => string.IsNullOrWhiteSpace(Label) ? FrontText : Label;
        [JsonIgnore] public string EffectiveFrontEmoji => string.IsNullOrWhiteSpace(Icon) ? FrontEmoji : Icon;
        [JsonIgnore] public string EffectiveHiddenPrize => string.IsNullOrWhiteSpace(Prize) ? HiddenPrize : Prize;
    }

    public sealed record Config(
        string Title = "Prize Grid",
        int BoxCount = 12,
        int Columns = 4,
        List<BoxConfig>? Boxes = null,
        bool RandomizeOnReset = true,
        bool PlaySound = true);

    public sealed record BoxState(
        int BoxNumber,
        bool Revealed,
        string? Prize = null,
        int Points = 0);

    public sealed record State(
        List<BoxState>? Boxes = null,
        int RevealedCount = 0,
        int LastRevealedNumber = 0,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Lucky Box Grid",
        BoxCount = 12,
        Columns = 4,
        Boxes =
        [
            new BoxConfig(1, "1", "🎁", "100 Points", 100),
            new BoxConfig(2, "2", "🎁", "50 Points", 50),
            new BoxConfig(3, "3", "🎁", "GRAND PRIZE! 🏆", 500),
            new BoxConfig(4, "4", "🎁", "Zonk! 🤡", 0),
            new BoxConfig(5, "5", "🎁", "200 Points", 200),
            new BoxConfig(6, "6", "🎁", "Double Points! ⚡", 250),
            new BoxConfig(7, "7", "🎁", "75 Points", 75),
            new BoxConfig(8, "8", "🎁", "Candy Bar 🍫", 50),
            new BoxConfig(9, "9", "🎁", "150 Points", 150),
            new BoxConfig(10, "10", "🎁", "Zonk! 🦆", 0),
            new BoxConfig(11, "11", "🎁", "300 Points", 300),
            new BoxConfig(12, "12", "🎁", "Leader's Treat 🍦", 100)
        ]
    };

    public static object CreateInitialState(string configJson)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var boxes = (config.Boxes ?? []).Select(b => new BoxState(b.BoxNumber, false, null, 0)).ToList();
        return new State(
            Boxes: boxes,
            RevealedCount: 0,
            LastRevealedNumber: 0,
            ActionNonce: 0
        );
    }

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload,
        IActivityRandomSource random)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? (State)CreateInitialState(configJson);
        var boxMap = (config.Boxes ?? []).ToDictionary(x => x.BoxNumber);
        var currentBoxStates = (state.Boxes ?? []).ToDictionary(x => x.BoxNumber, x => x);

        switch (action.ToLowerInvariant())
        {
            case "revealbox":
            {
                if (payload == null) return (false, "Payload is required.", state);
                if (!payload.Value.TryGetProperty("boxNumber", out var pNum) || !pNum.TryGetInt32(out var boxNum))
                {
                    return (false, "Box number is required.", state);
                }

                if (!boxMap.TryGetValue(boxNum, out var conf))
                {
                    return (false, $"Box {boxNum} not found in configuration.", state);
                }

                currentBoxStates[boxNum] = new BoxState(
                    BoxNumber: boxNum,
                    Revealed: true,
                    Prize: conf.EffectiveHiddenPrize,
                    Points: conf.Points
                );

                var revealedTotal = currentBoxStates.Values.Count(x => x.Revealed);
                var newState = state with
                {
                    Boxes = currentBoxStates.Values.OrderBy(x => x.BoxNumber).ToList(),
                    RevealedCount = revealedTotal,
                    LastRevealedNumber = boxNum,
                    ActionNonce = state.ActionNonce + 1
                };
                return (true, null, newState);
            }

            case "hidebox":
            {
                if (payload == null) return (false, "Payload is required.", state);
                if (!payload.Value.TryGetProperty("boxNumber", out var pNum) || !pNum.TryGetInt32(out var boxNum))
                {
                    return (false, "Box number is required.", state);
                }

                if (currentBoxStates.ContainsKey(boxNum))
                {
                    currentBoxStates[boxNum] = new BoxState(boxNum, false, null, 0);
                }

                var revealedTotal = currentBoxStates.Values.Count(x => x.Revealed);
                var newState = state with
                {
                    Boxes = currentBoxStates.Values.OrderBy(x => x.BoxNumber).ToList(),
                    RevealedCount = revealedTotal,
                    ActionNonce = state.ActionNonce + 1
                };
                return (true, null, newState);
            }

            case "revealall":
            {
                foreach (var (num, conf) in boxMap)
                {
                    currentBoxStates[num] = new BoxState(num, true, conf.EffectiveHiddenPrize, conf.Points);
                }

                var newState = state with
                {
                    Boxes = currentBoxStates.Values.OrderBy(x => x.BoxNumber).ToList(),
                    RevealedCount = currentBoxStates.Count,
                    ActionNonce = state.ActionNonce + 1
                };
                return (true, null, newState);
            }

            case "reset":
            {
                return (true, null, (State)CreateInitialState(configJson));
            }

            default:
                return (false, $"Unrecognized prize grid action '{action}'.", state);
        }
    }
}
