using System.Text.Json;
using System.Text.Json.Serialization;

namespace LessonCue.Server.Activities.Types;

public static class PickerActivity
{
    [JsonConverter(typeof(ItemConfigConverter))]
    public sealed record ItemConfig(
        string Id,
        string Text,
        double Weight = 1.0);

    public sealed class ItemConfigConverter : JsonConverter<ItemConfig>
    {
        public override ItemConfig? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.String)
            {
                var str = reader.GetString() ?? "";
                return new ItemConfig(str, str, 1.0);
            }
            if (reader.TokenType == JsonTokenType.StartObject)
            {
                using var doc = JsonDocument.ParseValue(ref reader);
                var root = doc.RootElement;
                var id = root.TryGetProperty("id", out var pId) ? pId.GetString() ?? "" : "";
                var text = root.TryGetProperty("text", out var pText) ? pText.GetString() ?? "" : "";
                var weight = root.TryGetProperty("weight", out var pWeight) && pWeight.TryGetDouble(out var w) ? w : 1.0;
                if (string.IsNullOrWhiteSpace(id)) id = text;
                return new ItemConfig(id, text, weight);
            }
            return null;
        }

        public override void Write(Utf8JsonWriter writer, ItemConfig value, JsonSerializerOptions options)
        {
            writer.WriteStartObject();
            writer.WriteString("id", value.Id);
            writer.WriteString("text", value.Text);
            writer.WriteNumber("weight", value.Weight);
            writer.WriteEndObject();
        }
    }

    public sealed record Config(
        string Title = "Random Picker",
        List<ItemConfig>? Items = null,
        bool RemoveAfterPick = true,
        bool AllowRepeat = false,
        int AnimationDurationMs = 3000,
        bool PlaySound = true);

    public sealed record State(
        string? CurrentPick = null,
        List<string>? History = null,
        List<string>? RemovedIds = null,
        long PickNonce = 0,
        int AnimationDurationMs = 3000);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Name Picker",
        Items =
        [
            new ItemConfig(Guid.NewGuid().ToString(), "Alex"),
            new ItemConfig(Guid.NewGuid().ToString(), "Jordan"),
            new ItemConfig(Guid.NewGuid().ToString(), "Taylor"),
            new ItemConfig(Guid.NewGuid().ToString(), "Morgan"),
            new ItemConfig(Guid.NewGuid().ToString(), "Sam"),
            new ItemConfig(Guid.NewGuid().ToString(), "Riley"),
            new ItemConfig(Guid.NewGuid().ToString(), "Casey"),
            new ItemConfig(Guid.NewGuid().ToString(), "Avery")
        ],
        RemoveAfterPick = true
    };

    public static object CreateInitialState(string configJson) => new State(
        CurrentPick: null,
        History: [],
        RemovedIds: [],
        PickNonce: 0,
        AnimationDurationMs: 3000
    );

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload,
        IActivityRandomSource random)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? new State();
        var items = config.Items ?? [];
        var removed = new HashSet<string>(state.RemovedIds ?? []);
        var history = new List<string>(state.History ?? []);

        switch (action.ToLowerInvariant())
        {
            case "pick":
            {
                var eligible = items.Where(x => !removed.Contains(x.Id) && x.Weight > 0).ToList();
                if (eligible.Count == 0)
                {
                    return (false, "No items remaining in the pool.", state);
                }

                ItemConfig winner;
                var target = payload?.TryGetProperty("targetItem", out var pTarget) == true ? pTarget.GetString() : null;
                var matched = !string.IsNullOrWhiteSpace(target) ? eligible.FirstOrDefault(x => x.Text == target || x.Id == target) : null;
                if (matched != null)
                {
                    winner = matched;
                }
                else
                {
                    winner = random.PickWeighted(eligible, x => Math.Max(0, x.Weight));
                }

                history.Insert(0, winner.Text);
                if (history.Count > 100) history.RemoveAt(history.Count - 1);

                var newRemoved = new List<string>(removed);
                if (config.RemoveAfterPick)
                {
                    newRemoved.Add(winner.Id);
                }

                var nextNonce = state.PickNonce + 1;
                var animMs = Math.Clamp(config.AnimationDurationMs, 500, 10000);

                var newState = state with
                {
                    CurrentPick = winner.Text,
                    History = history,
                    RemovedIds = newRemoved,
                    PickNonce = nextNonce,
                    AnimationDurationMs = animMs
                };
                return (true, null, newState);
            }

            case "undopick":
            {
                if (history.Count == 0) return (true, null, state);
                var lastPick = history[0];
                history.RemoveAt(0);

                var matchedItem = items.FirstOrDefault(x => x.Text == lastPick);
                var newRemoved = new List<string>(removed);
                if (matchedItem != null)
                {
                    newRemoved.Remove(matchedItem.Id);
                }

                var prevPick = history.FirstOrDefault();
                var newState = state with
                {
                    CurrentPick = prevPick,
                    History = history,
                    RemovedIds = newRemoved
                };
                return (true, null, newState);
            }

            case "restoreremoved":
            case "resetpool":
            {
                return (true, null, state with { RemovedIds = [] });
            }

            case "reset":
            {
                return (true, null, (State)CreateInitialState(configJson));
            }

            default:
                return (false, $"Unrecognized picker action '{action}'.", state);
        }
    }
}
