using System.Text.Json;
using System.Text.Json.Serialization;

namespace LessonCue.Server.Activities.Types;

public static class ImageShuffleActivity
{
    public sealed record ImageItem(
        string Id,
        string ImageUrl = "",
        string? Label = null,
        double Weight = 1.0,
        string? Url = null)
    {
        [JsonIgnore]
        public string EffectiveImageUrl => string.IsNullOrWhiteSpace(ImageUrl) ? Url ?? "" : ImageUrl;
    }

    public sealed record Config(
        string Title = "Image Shuffle",
        List<ImageItem>? Images = null,
        bool RemoveAfterPick = false,
        int ShuffleSpeedMs = 100);

    public sealed record State(
        string? SelectedImageId = null,
        string? SelectedImageUrl = null,
        string? SelectedLabel = null,
        bool IsShuffling = false,
        List<string>? History = null,
        long ActionNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Photo Roulette",
        Images = [],
        RemoveAfterPick = false
    };

    public static object CreateInitialState(string configJson) => new State(
        SelectedImageId: null,
        SelectedImageUrl: null,
        SelectedLabel: null,
        IsShuffling: false,
        History: [],
        ActionNonce: 0
    );

    public static (bool Success, string? Error, object NewState) Reduce(
        string configJson,
        string stateJson,
        string action,
        JsonElement? payload,
        IActivityRandomSource random)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? (State)CreateInitialState(configJson);
        var images = config.Images ?? [];
        var history = new List<string>(state.History ?? []);

        switch (action.ToLowerInvariant())
        {
            case "startshuffle":
                return (true, null, state with { IsShuffling = true, ActionNonce = state.ActionNonce + 1 });

            case "stopshuffle":
            case "shuffle":
            case "pick":
            {
                var eligible = config.RemoveAfterPick
                    ? images.Where(image => !(history.Contains(image.Id))).ToList()
                    : images;
                if (eligible.Count == 0) return (false, "No images remain in the shuffle pool.", state);

                var targetId = payload?.TryGetProperty("targetImageId", out var pTarget) == true
                    ? pTarget.GetString()
                    : (payload?.TryGetProperty("targetId", out var pTargetId) == true ? pTargetId.GetString() : null);
                var picked = !string.IsNullOrWhiteSpace(targetId)
                    ? eligible.FirstOrDefault(image => image.Id == targetId || image.Label == targetId)
                    : null;
                picked ??= random.PickWeighted(eligible, x => Math.Max(0, x.Weight));
                history.Insert(0, picked.Id);
                if (history.Count > 50) history.RemoveAt(history.Count - 1);

                return (true, null, state with
                {
                    SelectedImageId = picked.Id,
                    SelectedImageUrl = picked.EffectiveImageUrl,
                    SelectedLabel = picked.Label,
                    IsShuffling = false,
                    History = history,
                    ActionNonce = state.ActionNonce + 1
                });
            }

            case "reset":
                return (true, null, (State)CreateInitialState(configJson));

            default:
                return (false, $"Unrecognized image shuffle action '{action}'.", state);
        }
    }
}
