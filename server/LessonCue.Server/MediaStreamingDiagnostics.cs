using System.Net.Sockets;

namespace LessonCue.Server;

/// <summary>
/// Identifies transport failures that happen after a media response has
/// started. A display, browser, or proxy can legitimately abandon a large
/// range request, so these must not be recorded as server application faults.
/// </summary>
internal static class MediaStreamingDiagnostics
{
    private static readonly SocketError[] DownstreamSocketErrors =
    [
        SocketError.TimedOut,
        SocketError.ConnectionReset,
        SocketError.ConnectionAborted,
        SocketError.OperationAborted,
        SocketError.Shutdown,
        SocketError.NotConnected,
        SocketError.NetworkReset
    ];

    public static bool IsMediaResponsePath(string path) =>
        path.StartsWith("/api/v1/media/", StringComparison.Ordinal) &&
        (path.EndsWith("/file", StringComparison.Ordinal) ||
         path.EndsWith("/playback", StringComparison.Ordinal) ||
         path.Contains("/transcodes/", StringComparison.Ordinal) ||
         path.EndsWith("/thumbnail", StringComparison.Ordinal) ||
         path.EndsWith("/filmstrip", StringComparison.Ordinal) ||
         path.EndsWith("/waveform", StringComparison.Ordinal));

    public static bool IsDownstreamDisconnect(HttpContext context, Exception error)
    {
        if (!IsMediaResponsePath(context.Request.Path.Value ?? "")) return false;
        if (context.RequestAborted.IsCancellationRequested) return true;

        for (var current = error; current is not null; current = current.InnerException)
        {
            if (current is SocketException socket && DownstreamSocketErrors.Contains(socket.SocketErrorCode))
                return true;
            if (current is IOException && IsTransportMessage(current.Message))
                return true;
        }

        return false;
    }

    private static bool IsTransportMessage(string? message) =>
        !string.IsNullOrWhiteSpace(message) &&
        (message.Contains("broken pipe", StringComparison.OrdinalIgnoreCase) ||
         message.Contains("connection reset", StringComparison.OrdinalIgnoreCase) ||
         message.Contains("connection timed out", StringComparison.OrdinalIgnoreCase) ||
         message.Contains("forcibly closed", StringComparison.OrdinalIgnoreCase));
}
