using System.Text.Json;
using System.Text.Json.Nodes;

namespace LessonCue.Server.Activities.Types;

public static class WheelActivity
{
    public sealed record ItemConfig(
        string Id,
        string Label,
        double Weight = 1.0,
        string? Color = null,
        string? Icon = null);

    public sealed record Config(
        string Title = "Spin Wheel",
        List<ItemConfig>? Items = null,
        int SpinDurationSeconds = 5,
        bool RemoveWinner = false,
        bool AllowRepeat = false,
        bool PlaySound = true,
        bool Celebration = true);

    public sealed record State(
        string? WinnerId = null,
        string? WinnerLabel = null,
        List<string>? History = null,
        List<string>? RemovedIds = null,
        long SpinNonce = 0,
        int SpinDurationMs = 5000,
        string? DirectWinnerId = null,
        double? TargetAngle = null);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Prize Wheel",
        Items =
        [
            new ItemConfig(Guid.NewGuid().ToString(), "Grand Prize", 1.0, "#FF007F", "👑"),
            new ItemConfig(Guid.NewGuid().ToString(), "Free Pass", 2.0, "#00E5FF", "🎟️"),
            new ItemConfig(Guid.NewGuid().ToString(), "Snack Pack", 3.0, "#FFD600", "🍿"),
            new ItemConfig(Guid.NewGuid().ToString(), "High Five", 4.0, "#76FF03", "✋"),
            new ItemConfig(Guid.NewGuid().ToString(), "Double Spin", 1.5, "#D500F9", "🔄"),
            new ItemConfig(Guid.NewGuid().ToString(), "Leader's Choice", 2.0, "#FF6D00", "⭐")
        ]
    };

    public static object CreateInitialState(string configJson)
    {
        return new State(
            WinnerId: null,
            WinnerLabel: null,
            History: [],
            RemovedIds: [],
            SpinNonce: 0,
            SpinDurationMs: 5000,
            TargetAngle: null
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
        var state = JsonSerializer.Deserialize<State>(stateJson, ActivityJsonDefaults.Options) ?? new State();
        var items = config.Items ?? [];
        var removed = new HashSet<string>(state.RemovedIds ?? []);
        var history = new List<string>(state.History ?? []);

        switch (action.ToLowerInvariant())
        {
            case "spin":
            {
                // Eligible items: not removed and weight > 0
                var eligible = items.Where(x => !removed.Contains(x.Id) && x.Weight > 0).ToList();
                if (eligible.Count == 0)
                {
                    return (false, "No eligible items left to spin.", state);
                }

                // If a direct rigged winner was queued by the operator or passed in payload, use it
                ItemConfig winner;
                var targetId = payload?.TryGetProperty("targetItemId", out var pTarget) == true ? pTarget.GetString()
                    : (payload?.TryGetProperty("target", out var pT) == true ? pT.GetString() : null);

                if (!string.IsNullOrWhiteSpace(targetId) && eligible.Any(x => x.Id == targetId || x.Label.Equals(targetId, StringComparison.OrdinalIgnoreCase)))
                {
                    winner = eligible.First(x => x.Id == targetId || x.Label.Equals(targetId, StringComparison.OrdinalIgnoreCase));
                }
                else if (!string.IsNullOrWhiteSpace(state.DirectWinnerId) && eligible.Any(x => x.Id == state.DirectWinnerId))
                {
                    winner = eligible.First(x => x.Id == state.DirectWinnerId);
                }
                else
                {
                    winner = random.PickWeighted(eligible, x => Math.Max(0, x.Weight));
                }

                history.Insert(0, winner.Label);
                if (history.Count > 50) history.RemoveAt(history.Count - 1);

                var newRemoved = new List<string>(removed);
                if (config.RemoveWinner)
                {
                    newRemoved.Add(winner.Id);
                }

                var nextNonce = state.SpinNonce + 1;
                var durationMs = Math.Clamp(config.SpinDurationSeconds * 1000, 1000, 15000);

                // Pick a point inside the winning slice and include several
                // full turns so every display can animate the same result.
                var totalWeight = eligible.Sum(x => Math.Max(0, x.Weight));
                var cursor = 0.0;
                foreach (var item in eligible)
                {
                    if (item.Id == winner.Id) break;
                    cursor += Math.Max(0, item.Weight) / totalWeight;
                }
                var winnerShare = Math.Max(0, winner.Weight) / totalWeight;
                var sliceCenter = (cursor + winnerShare * (0.2 + random.NextDouble() * 0.6)) * Math.PI * 2;
                var pointerAngle = -Math.PI / 2;
                var fullTurns = 5 + random.NextInt(0, 3);
                var targetAngle = pointerAngle - sliceCenter + fullTurns * Math.PI * 2;

                var newState = state with
                {
                    WinnerId = winner.Id,
                    WinnerLabel = winner.Label,
                    History = history,
                    RemovedIds = newRemoved,
                    SpinNonce = nextNonce,
                    SpinDurationMs = durationMs,
                    DirectWinnerId = null,
                    TargetAngle = targetAngle
                };
                return (true, null, newState);
            }

            case "undospin":
            {
                if (history.Count == 0) return (true, null, state);
                var lastWinnerLabel = history[0];
                history.RemoveAt(0);

                var lastWinnerItem = items.FirstOrDefault(x => x.Label == lastWinnerLabel);
                var newRemoved = new List<string>(removed);
                if (lastWinnerItem != null)
                {
                    newRemoved.Remove(lastWinnerItem.Id);
                }

                var prevWinnerLabel = history.FirstOrDefault();
                var prevWinner = items.FirstOrDefault(x => x.Label == prevWinnerLabel);

                var newState = state with
                {
                    WinnerId = prevWinner?.Id,
                    WinnerLabel = prevWinner?.Label,
                    History = history,
                    RemovedIds = newRemoved
                };
                return (true, null, newState);
            }

            case "removeitem":
            {
                var itemId = payload?.TryGetProperty("itemId", out var pId) == true ? pId.GetString() : state.WinnerId;
                if (string.IsNullOrWhiteSpace(itemId)) return (false, "Item ID is required.", state);
                if (!removed.Contains(itemId))
                {
                    removed.Add(itemId);
                }
                return (true, null, state with { RemovedIds = removed.ToList() });
            }

            case "restoreremoved":
            case "resetremoved":
            {
                return (true, null, state with { RemovedIds = [] });
            }

            case "setnextwinner":
            {
                var targetId = payload?.TryGetProperty("itemId", out var pId) == true ? pId.GetString() : null;
                return (true, null, state with { DirectWinnerId = targetId });
            }

            case "reset":
            {
                return (true, null, (State)CreateInitialState(configJson));
            }

            default:
                return (false, $"Unrecognized wheel action '{action}'.", state);
        }
    }
}
