using System.Net.Sockets;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaStreamingDiagnosticsTests
{
    [Fact]
    public void Recognizes_timed_out_media_response_as_downstream_disconnect()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/v1/media/11111111-1111-1111-1111-111111111111/playback";

        var error = new SocketException((int)SocketError.TimedOut);

        Assert.True(MediaStreamingDiagnostics.IsDownstreamDisconnect(context, error));
    }

    [Fact]
    public void Recognizes_client_cancellation_for_media_response()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var context = new DefaultHttpContext { RequestAborted = cancellation.Token };
        context.Request.Path = "/api/v1/media/11111111-1111-1111-1111-111111111111/file";

        Assert.True(MediaStreamingDiagnostics.IsDownstreamDisconnect(context, new IOException("response stopped")));
    }

    [Fact]
    public void Does_not_suppress_the_same_socket_error_on_non_media_routes()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/v1/auth/session";

        Assert.False(MediaStreamingDiagnostics.IsDownstreamDisconnect(
            context, new SocketException((int)SocketError.TimedOut)));
    }
}
