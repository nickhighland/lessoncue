using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace LessonCue.Server;

/// <summary>
/// A deliberately small local log for the Settings troubleshooting view. It is separate from
/// the system journal so Service Admins can diagnose a server from the browser without giving
/// other roles access to credentials or shell commands.
/// </summary>
public sealed class TroubleshootingLog : ILoggerProvider
{
    private const int MaximumEntries = 2_000;
    private const long MaximumFileBytes = 4 * 1024 * 1024;
    private static readonly Regex CredentialPattern = new(
        """(?ix)(?<prefix>["']?(?:authorization|api[ _-]?key|token|password|secret)["']?\s*[:=]\s*["']?)(?:(?:bearer|basic)\s+)?(?<secret>[^"'\s,;}&]+)|(?<prefix>\b(?:authorization|api[ _-]?key|token|password|secret)\s+)(?:(?:bearer|basic)\s+)?(?<secret>[^"'\s,;}&]+)""",
        RegexOptions.Compiled);
    private readonly ConcurrentQueue<TroubleshootingLogEntry> entries = new();
    private readonly object fileLock = new();
    private readonly string filePath;

    public TroubleshootingLog(string dataPath)
    {
        var logPath = Path.Combine(dataPath, "logs");
        Directory.CreateDirectory(logPath);
        filePath = Path.Combine(logPath, "troubleshooting.jsonl");
        LoadRecentEntries();
    }

    public ILogger CreateLogger(string categoryName) => new TroubleshootingLogger(this, categoryName);

    public IReadOnlyList<TroubleshootingLogEntry> GetRecent(int limit)
    {
        var safeLimit = Math.Clamp(limit, 1, MaximumEntries);
        return entries.Reverse().Take(safeLimit).ToArray();
    }

    public void Dispose() { }

    internal void Write(LogLevel level, string category, EventId eventId, string message, Exception? exception)
    {
        if (level < LogLevel.Information || category.StartsWith("Microsoft.", StringComparison.Ordinal) && level < LogLevel.Warning)
            return;

        var entry = new TroubleshootingLogEntry(
            DateTimeOffset.UtcNow,
            level.ToString(),
            category.Replace("LessonCue.Server.", "", StringComparison.Ordinal),
            eventId.Name ?? eventId.Id.ToString(),
            Redact(message),
            exception is null ? null : Redact(exception.Message));
        entries.Enqueue(entry);
        while (entries.Count > MaximumEntries && entries.TryDequeue(out _)) { }

        try
        {
            lock (fileLock)
            {
                if (File.Exists(filePath) && new FileInfo(filePath).Length > MaximumFileBytes)
                    File.Move(filePath, filePath + ".previous", true);
                File.AppendAllText(filePath, JsonSerializer.Serialize(entry) + Environment.NewLine);
            }
        }
        catch
        {
            // A full or read-only disk must not take down LessonCue merely because diagnostics cannot be saved.
        }
    }

    private void LoadRecentEntries()
    {
        try
        {
            if (!File.Exists(filePath)) return;
            foreach (var line in File.ReadLines(filePath).TakeLast(MaximumEntries))
            {
                var entry = JsonSerializer.Deserialize<TroubleshootingLogEntry>(line);
                if (entry is not null) entries.Enqueue(entry);
            }
        }
        catch
        {
            // A corrupt diagnostic file is not application data and can safely be ignored.
        }
    }

    private static string Redact(string value)
    {
        var trimmed = value.Length > 2_000 ? value[..2_000] + "…" : value;
        return CredentialPattern.Replace(trimmed, match => $"{match.Groups["prefix"].Value}[redacted]");
    }

    private sealed class TroubleshootingLogger(TroubleshootingLog owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => owner.Write(logLevel, category, eventId, formatter(state, exception), exception);
    }
}

public sealed record TroubleshootingLogEntry(
    DateTimeOffset Timestamp,
    string Level,
    string Category,
    string Event,
    string Message,
    string? Exception);
