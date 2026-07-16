namespace LessonCue.Server;

public static class ScreenTelemetry
{
    private static readonly HashSet<string> States = new(StringComparer.OrdinalIgnoreCase)
    {
        "idle", "loading", "buffering", "playing", "paused", "completed", "error"
    };

    public static void Apply(Screen screen, TvStatusInput input, DateTimeOffset now, string? remoteAddress = null)
    {
        screen.LastSeenAt = now;
        screen.AppVersion = Limit(input.AppVersion, 32) ?? "unknown";
        screen.ManifestVersion = Math.Max(0, input.ManifestVersion);
        screen.LastIpAddress = Limit(remoteAddress, 64);
        screen.FreeBytes = Math.Max(0, input.FreeBytes);
        screen.FailedDownloads = Math.Max(0, input.FailedDownloads);
        screen.CachedItems = Math.Max(0, input.CachedItems ?? screen.CachedItems);
        screen.TotalItems = Math.Max(screen.CachedItems, input.TotalItems ?? screen.TotalItems);
        screen.DeviceModel = Limit(input.DeviceModel, 160);
        screen.OsVersion = Limit(input.OsVersion, 80);

        if (input.AcknowledgedControlVersion is int acknowledged)
            screen.AcknowledgedControlVersion = Math.Max(screen.AcknowledgedControlVersion,
                Math.Min(screen.ControlVersion, Math.Max(0, acknowledged)));

        if (input.PlaybackState is not null)
        {
            var state = input.PlaybackState.Trim().ToLowerInvariant();
            screen.PlaybackState = States.Contains(state) ? state : "error";
            screen.PlaybackLessonId = input.LessonId;
            screen.PlaybackItemId = input.ItemId;
            screen.PlaybackPositionMs = Math.Max(0, input.PositionMs ?? 0);
            screen.PlaybackDurationMs = input.DurationMs is null ? null : Math.Max(0, input.DurationMs.Value);
            screen.PlaybackVolumePercent = Math.Clamp(input.VolumePercent ?? screen.PlaybackVolumePercent, 0, 150);
            screen.PlaybackError = screen.PlaybackState == "error"
                ? Limit(string.IsNullOrWhiteSpace(input.PlaybackError) ? "Playback failed." : input.PlaybackError, 1000)
                : null;
            screen.PlaybackUpdatedAt = now;
        }
    }

    private static string? Limit(string? value, int length)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= length ? trimmed : trimmed[..length];
    }
}
