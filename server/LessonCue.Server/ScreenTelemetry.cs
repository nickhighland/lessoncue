namespace LessonCue.Server;

using System.Text.Json;

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

        if (input.ClientTimeUnixMs is long clientTime)
        {
            var offset = clientTime - now.ToUnixTimeMilliseconds();
            screen.ClockOffsetMs = Math.Clamp(offset, -2_592_000_000L, 2_592_000_000L);
        }
        if (input.NetworkLatencyMs is int latency)
            screen.NetworkLatencyMs = Math.Clamp(latency, 0, 120_000);
        screen.NetworkQuality = NormalizeQuality(input.NetworkQuality, screen.NetworkLatencyMs);

        if (input.CacheInventory is not null)
            screen.CacheInventoryJson = JsonSerializer.Serialize(input.CacheInventory.Take(500).Select(item => new
            {
                itemId = Limit(item.ItemId, 80), title = Limit(item.Title, 160), state = Limit(item.State, 24) ?? "unknown",
                sizeBytes = Math.Max(0, item.SizeBytes), expectedBytes = item.ExpectedBytes is null ? (long?)null : Math.Max(0, item.ExpectedBytes.Value),
                error = Limit(item.Error, 500)
            }));
        if (input.DownloadQueue is not null)
            screen.DownloadQueueJson = JsonSerializer.Serialize(input.DownloadQueue.Take(500).Select(item => new
            {
                itemId = Limit(item.ItemId, 80), title = Limit(item.Title, 160), state = Limit(item.State, 24) ?? "queued",
                bytesDownloaded = Math.Max(0, item.BytesDownloaded), expectedBytes = item.ExpectedBytes is null ? (long?)null : Math.Max(0, item.ExpectedBytes.Value),
                error = Limit(item.Error, 500)
            }));
        if (input.CodecCapabilities is not null)
            screen.CodecCapabilitiesJson = JsonSerializer.Serialize(input.CodecCapabilities.Take(100).Select(item => new
            {
                kind = Limit(item.Kind, 24), codec = Limit(item.Codec, 80), supported = item.Supported, detail = Limit(item.Detail, 160)
            }));
        if (input.RecentErrors is not null)
            screen.RecentErrorsJson = JsonSerializer.Serialize(input.RecentErrors.OrderByDescending(x => x.Timestamp).Take(50).Select(item => new
            {
                timestamp = item.Timestamp, area = Limit(item.Area, 40), message = Limit(item.Message, 500), itemId = Limit(item.ItemId, 80)
            }));
        if (input.CacheInventory is not null || input.DownloadQueue is not null || input.CodecCapabilities is not null ||
            input.RecentErrors is not null || input.ClientTimeUnixMs is not null || input.NetworkLatencyMs is not null)
            screen.DiagnosticsUpdatedAt = now;

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

    private static string NormalizeQuality(string? quality, int? latency)
    {
        var normalized = quality?.Trim().ToLowerInvariant();
        if (normalized is "excellent" or "good" or "fair" or "poor" or "offline") return normalized;
        return latency switch { <= 50 => "excellent", <= 150 => "good", <= 400 => "fair", > 400 => "poor", _ => "unknown" };
    }
}
