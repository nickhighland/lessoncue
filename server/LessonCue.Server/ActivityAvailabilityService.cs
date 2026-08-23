using System.Text.Json;

namespace LessonCue.Server;

public sealed record ActivityAvailabilityStatus(bool Enabled);

public sealed record ActivityAvailabilityInput(bool Enabled);

/// <summary>
/// Whether Activities are offered to teachers at all.
///
/// Lets a Service Admin hide an unfinished game system from the people planning
/// real lessons without deleting any authored content. Turning it off hides the
/// teacher-facing surfaces and refuses to start anything new; a session already
/// in progress keeps running, because pulling a live game out from under a
/// classroom would be worse than the thing being hidden.
/// </summary>
public sealed class ActivityAvailabilityService(string dataPath)
{
    private readonly string configPath = Path.Combine(dataPath, "activities-enabled.json");
    private readonly SemaphoreSlim gate = new(1, 1);

    public bool Enabled => Read();

    public ActivityAvailabilityStatus Status => new(Read());

    public async Task<ActivityAvailabilityStatus> SetAsync(bool enabled, CancellationToken ct = default)
    {
        await gate.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataPath);
            await File.WriteAllTextAsync(configPath, JsonSerializer.Serialize(new Stored(enabled)), ct);
        }
        finally { gate.Release(); }
        return new ActivityAvailabilityStatus(enabled);
    }

    private bool Read()
    {
        try
        {
            // Absent config means available: hiding is the deliberate act.
            if (!File.Exists(configPath)) return true;
            return JsonSerializer.Deserialize<Stored>(File.ReadAllText(configPath))?.Enabled ?? true;
        }
        catch { return true; }
    }

    private sealed record Stored(bool Enabled);
}
