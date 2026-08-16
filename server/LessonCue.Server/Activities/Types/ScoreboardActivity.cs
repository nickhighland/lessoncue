using System.Text.Json;

namespace LessonCue.Server.Activities.Types;

public static class ScoreboardActivity
{
    public sealed record TeamConfig(
        string Id,
        string Name,
        string Color,
        string? Icon = null,
        int InitialScore = 0);

    public sealed record Config(
        string Title = "Team Scoreboard",
        List<TeamConfig>? Teams = null,
        int Increment = 1,
        int Decrement = 1,
        bool SortByScore = false,
        bool ShowPodium = false,
        bool PlaySound = true);

    public sealed record TeamState(
        string Id,
        int Score);

    public sealed record ScoreHistoryEntry(
        string TeamId,
        int Delta,
        int OldScore,
        int NewScore,
        DateTimeOffset Timestamp);

    public sealed record State(
        List<TeamState>? Teams = null,
        List<ScoreHistoryEntry>? History = null,
        string? WinningTeamId = null,
        long UpdateNonce = 0);

    public static object CreateDefaultConfig() => new Config
    {
        Title = "Game Show Scoreboard",
        Teams =
        [
            new TeamConfig(Guid.NewGuid().ToString(), "Team Red", "#FF1744", "🔥", 0),
            new TeamConfig(Guid.NewGuid().ToString(), "Team Blue", "#2979FF", "⚡", 0),
            new TeamConfig(Guid.NewGuid().ToString(), "Team Green", "#00E676", "🌲", 0),
            new TeamConfig(Guid.NewGuid().ToString(), "Team Yellow", "#FFEA00", "⭐", 0)
        ],
        Increment = 1,
        Decrement = 1,
        SortByScore = false
    };

    public static object CreateInitialState(string configJson)
    {
        var config = JsonSerializer.Deserialize<Config>(configJson, ActivityJsonDefaults.Options) ?? new Config();
        var teams = (config.Teams ?? []).Select(t => new TeamState(t.Id, t.InitialScore)).ToList();
        return new State(
            Teams: teams,
            History: [],
            WinningTeamId: null,
            UpdateNonce: 0
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
        var currentTeams = (state.Teams ?? []).ToDictionary(x => x.Id, x => x.Score);
        var history = new List<ScoreHistoryEntry>(state.History ?? []);

        // Ensure all configured teams exist
        foreach (var t in config.Teams ?? [])
        {
            if (!currentTeams.ContainsKey(t.Id))
            {
                currentTeams[t.Id] = t.InitialScore;
            }
        }

        switch (action.ToLowerInvariant())
        {
            case "adjustscore":
            case "addscore":
            case "changescore":
            case "incrementscore":
            case "decrementscore":
            {
                if (payload == null) return (false, "Payload is required.", state);
                var teamId = payload.Value.TryGetProperty("teamId", out var pTeamId) ? pTeamId.GetString() : null;
                if (string.IsNullOrWhiteSpace(teamId) || !currentTeams.ContainsKey(teamId))
                {
                    return (false, "Valid teamId is required.", state);
                }

                var amount = 0;
                if (payload.Value.TryGetProperty("amount", out var pAmount) && pAmount.TryGetInt32(out var amt))
                {
                    amount = amt;
                }
                else if (payload.Value.TryGetProperty("points", out var pPoints) && pPoints.TryGetInt32(out var pts))
                {
                    amount = pts;
                }
                else
                {
                    amount = action.Equals("decrementscore", StringComparison.OrdinalIgnoreCase) ? -config.Decrement : config.Increment;
                }

                // Treat the named increment/decrement actions consistently even
                // when a web client sends a positive amount for a decrement.
                if (action.Equals("decrementscore", StringComparison.OrdinalIgnoreCase)) amount = -Math.Abs(amount);
                if (action.Equals("incrementscore", StringComparison.OrdinalIgnoreCase)) amount = Math.Abs(amount);

                var oldScore = currentTeams[teamId];
                var newScore = oldScore + amount;
                currentTeams[teamId] = newScore;

                history.Insert(0, new ScoreHistoryEntry(teamId, amount, oldScore, newScore, DateTimeOffset.UtcNow));
                if (history.Count > 100) history.RemoveAt(history.Count - 1);

                var teamStates = currentTeams.Select(kv => new TeamState(kv.Key, kv.Value)).ToList();
                return (true, null, state with
                {
                    Teams = teamStates,
                    History = history,
                    WinningTeamId = LeadingTeamId(currentTeams),
                    UpdateNonce = state.UpdateNonce + 1
                });
            }

            case "setscore":
            {
                if (payload == null) return (false, "Payload is required.", state);
                var teamId = payload.Value.TryGetProperty("teamId", out var pTeamId) ? pTeamId.GetString() : null;
                if (string.IsNullOrWhiteSpace(teamId) || !currentTeams.ContainsKey(teamId))
                {
                    return (false, "Valid teamId is required.", state);
                }

                if (!payload.Value.TryGetProperty("score", out var pScore) || !pScore.TryGetInt32(out var exactScore))
                {
                    return (false, "Score is required.", state);
                }

                var oldScore = currentTeams[teamId];
                currentTeams[teamId] = exactScore;

                history.Insert(0, new ScoreHistoryEntry(teamId, exactScore - oldScore, oldScore, exactScore, DateTimeOffset.UtcNow));
                if (history.Count > 100) history.RemoveAt(history.Count - 1);

                var teamStates = currentTeams.Select(kv => new TeamState(kv.Key, kv.Value)).ToList();
                return (true, null, state with
                {
                    Teams = teamStates,
                    History = history,
                    WinningTeamId = LeadingTeamId(currentTeams),
                    UpdateNonce = state.UpdateNonce + 1
                });
            }

            case "undoscore":
            {
                if (history.Count == 0) return (true, null, state);
                var last = history[0];
                history.RemoveAt(0);

                if (currentTeams.ContainsKey(last.TeamId))
                {
                    currentTeams[last.TeamId] = last.OldScore;
                }

                var teamStates = currentTeams.Select(kv => new TeamState(kv.Key, kv.Value)).ToList();
                return (true, null, state with
                {
                    Teams = teamStates,
                    History = history,
                    WinningTeamId = LeadingTeamId(currentTeams),
                    UpdateNonce = state.UpdateNonce + 1
                });
            }

            case "resetscores":
            case "reset":
            {
                return (true, null, (State)CreateInitialState(configJson));
            }

            default:
                return (false, $"Unrecognized scoreboard action '{action}'.", state);
        }
    }

    private static string? LeadingTeamId(IReadOnlyDictionary<string, int> scores)
    {
        if (scores.Count == 0) return null;
        var leader = scores.OrderByDescending(item => item.Value).First();
        return leader.Value > 0 ? leader.Key : null;
    }
}
