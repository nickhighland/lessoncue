using System.Collections.Concurrent;
using System.Diagnostics;

namespace LessonCue.Server;

public sealed class LiveStreamRelayService(string dataPath, ILogger<LiveStreamRelayService> logger) : BackgroundService
{
    private readonly string root = Path.Combine(dataPath, "media", "live-streams");
    private readonly ConcurrentDictionary<string, RelaySession> sessions = new(StringComparer.Ordinal);

    public async Task<(string? Path, string? Error)> PreparePlaylistAsync(
        Guid signageId, string zoneId, string sourceUrl, CancellationToken cancellationToken)
    {
        var session = sessions.GetOrAdd(Key(signageId, zoneId),
            _ => new RelaySession(Path.Combine(root, signageId.ToString("N"), SafeZoneId(zoneId))));
        session.LastAccess = DateTimeOffset.UtcNow;
        await session.Gate.WaitAsync(cancellationToken);
        try
        {
            if (!string.Equals(session.SourceUrl, sourceUrl, StringComparison.Ordinal) ||
                session.Process is null || session.Process.HasExited)
                Start(session, sourceUrl);
        }
        finally { session.Gate.Release(); }

        var playlist = Path.Combine(session.Directory, "index.m3u8");
        for (var attempt = 0; attempt < 40 && !cancellationToken.IsCancellationRequested; attempt++)
        {
            if (File.Exists(playlist) && new FileInfo(playlist).Length > 0) return (playlist, null);
            if (session.Process is { HasExited: true }) break;
            await Task.Delay(250, cancellationToken);
        }
        return (null, session.LastError ?? "The live stream has not produced playable video yet.");
    }

    public string? ResolveSegment(Guid signageId, string zoneId, string fileName)
    {
        if (fileName.Length != 9 || !fileName.EndsWith(".ts", StringComparison.OrdinalIgnoreCase) ||
            !fileName[..6].All(char.IsAsciiDigit)) return null;
        if (!sessions.TryGetValue(Key(signageId, zoneId), out var session)) return null;
        session.LastAccess = DateTimeOffset.UtcNow;
        var path = Path.Combine(session.Directory, fileName);
        return File.Exists(path) ? path : null;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Directory.CreateDirectory(root);
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var expired = sessions.Where(pair => pair.Value.LastAccess < DateTimeOffset.UtcNow.AddMinutes(-5)).ToArray();
                foreach (var pair in expired)
                    if (sessions.TryRemove(pair.Key, out var session)) Stop(session);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally
        {
            foreach (var session in sessions.Values) Stop(session);
            sessions.Clear();
        }
    }

    private void Start(RelaySession session, string sourceUrl)
    {
        Stop(session);
        Directory.CreateDirectory(session.Directory);
        foreach (var file in Directory.EnumerateFiles(session.Directory)) try { File.Delete(file); } catch { }
        var startInfo = new ProcessStartInfo("ffmpeg")
        {
            UseShellExecute = false,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            CreateNoWindow = true
        };
        foreach (var argument in new[]
        {
            "-nostdin", "-hide_banner", "-loglevel", "warning",
            "-i", sourceUrl,
            "-map", "0:v:0?", "-map", "0:a:0?",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
            "-f", "hls", "-hls_time", "2", "-hls_list_size", "8",
            "-hls_flags", "delete_segments+append_list+omit_endlist+independent_segments",
            "-hls_segment_filename", Path.Combine(session.Directory, "%06d.ts"),
            Path.Combine(session.Directory, "index.m3u8")
        }) startInfo.ArgumentList.Add(argument);

        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        session.SourceUrl = sourceUrl;
        session.LastError = null;
        process.ErrorDataReceived += (_, eventArgs) =>
        {
            if (string.IsNullOrWhiteSpace(eventArgs.Data)) return;
            var safe = eventArgs.Data.Replace(sourceUrl, "[stream]", StringComparison.Ordinal);
            session.LastError = safe.Length > 500 ? safe[..500] : safe;
        };
        process.Exited += (_, _) =>
        {
            if (process.ExitCode != 0)
                logger.LogWarning("A signage live-stream relay stopped with exit code {ExitCode}: {Error}",
                    process.ExitCode, session.LastError ?? "FFmpeg did not report a reason.");
        };
        try
        {
            if (!process.Start()) throw new InvalidOperationException("FFmpeg did not start.");
            process.BeginErrorReadLine();
            process.BeginOutputReadLine();
            session.Process = process;
        }
        catch (Exception error)
        {
            session.LastError = error.Message;
            process.Dispose();
        }
    }

    private static void Stop(RelaySession session)
    {
        var process = session.Process;
        session.Process = null;
        if (process is null) return;
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch { }
        process.Dispose();
    }

    private static string Key(Guid signageId, string zoneId) => $"{signageId:N}:{zoneId}";
    private static string SafeZoneId(string zoneId)
    {
        var safe = new string(zoneId.Where(char.IsAsciiLetterOrDigit).Take(64).ToArray());
        return safe.Length == 0 ? "zone" : safe;
    }

    private sealed class RelaySession(string directory)
    {
        public string Directory { get; } = directory;
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public Process? Process { get; set; }
        public string? SourceUrl { get; set; }
        public string? LastError { get; set; }
        public DateTimeOffset LastAccess { get; set; } = DateTimeOffset.UtcNow;
    }
}
