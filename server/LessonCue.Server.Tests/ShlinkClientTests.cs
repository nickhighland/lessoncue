using System.Net;
using System.Text;
using LessonCue.Server.Shortener;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ShlinkClientTests
{
    [Fact]
    public async Task LooksUpCanonicalLowercaseSlugBeforeCaseFallback()
    {
        var requests = new List<string>();
        using var http = new HttpClient(new Handler(requests));
        var client = new ShlinkClient(http);

        var result = await client.FindAsync("http://shortener", "key", "N6X2", "short.example", TestContext.Current.CancellationToken);

        Assert.Equal("n6x2", result?.ShortCode);
        Assert.Single(requests);
        Assert.Contains("/short-urls/n6x2?", requests[0], StringComparison.Ordinal);
    }

    [Fact]
    public async Task GenericBadRequestIsReportedAsFailureNotAReservedCodeConflict()
    {
        using var http = new HttpClient(new ErrorHandler(HttpStatusCode.BadRequest, "invalid domain"));
        var client = new ShlinkClient(http);

        var error = await Assert.ThrowsAsync<ShlinkException>(() =>
            client.CreateAsync("http://shortener", "key", "N6X2", "https://lessoncue.local/play/N6X2",
                "short.example", [], TestContext.Current.CancellationToken));

        Assert.False(error.IsConflict);
        Assert.Contains("invalid domain", error.Message, StringComparison.Ordinal);
    }

    private sealed class Handler(List<string> requests) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            requests.Add(request.RequestUri?.PathAndQuery ?? "");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    "{\"shortCode\":\"n6x2\",\"longUrl\":\"https://lessoncue.local/room/n6x2\",\"tags\":[],\"domain\":\"short.example\"}",
                    Encoding.UTF8, "application/json")
            });
        }
    }

    private sealed class ErrorHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "text/plain")
            });
    }
}
