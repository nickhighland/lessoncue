using System.Net;
using Microsoft.Net.Http.Headers;

namespace LessonCue.Server;

/// <summary>
/// Routing for the public short domain.
///
/// Exactly one path belongs to LessonCue -- "/" -- and everything else is
/// forwarded to the shortener untouched. That split is the entire feature: a
/// redirect implemented as a short code with an empty slug, or as a hostname
/// rule at the edge, would also swallow "/kids" and every reserved game code.
///
/// Requests for any other hostname pass straight through, so this cannot affect
/// LessonCue's own address.
/// </summary>
public sealed class ShortDomainMiddleware(RequestDelegate next, ShortDomainService shortDomain, IHttpClientFactory clients)
{
    /// <summary>Hop-by-hop headers belong to one connection and must not be forwarded.</summary>
    private static readonly string[] HopByHop =
        ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

    public async Task InvokeAsync(HttpContext context)
    {
        var settings = shortDomain.Current;
        switch (ShortDomainService.Decide(settings, context.Request.Host.Value, context.Request.Path))
        {
            case ShortDomainService.Disposition.PassThrough:
                await next(context);
                return;

            case ShortDomainService.Disposition.Redirect:
                // Written out rather than Results.Redirect so the permanent
                // choice stays the administrator's and is never inferred.
                context.Response.StatusCode = settings.RedirectStatusCode;
                context.Response.Headers.Location = ShortDomainService.RootDestination(settings, context.Request.QueryString);
                context.Response.Headers.CacheControl = settings.Permanent ? "public, max-age=3600" : "no-store";
                return;

            case ShortDomainService.Disposition.NotFound:
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;

            default:
                await ForwardAsync(context, settings);
                return;
        }
    }

    /// <summary>
    /// Hand the request to the shortener as it arrived.
    ///
    /// The original Host header goes with it: the shortener resolves short codes
    /// per domain, so rewriting the host would make it look up the code against
    /// the wrong one and return a miss for a link that exists.
    /// </summary>
    private async Task ForwardAsync(HttpContext context, ShortDomainSettings settings)
    {
        var request = context.Request;
        var target = new UriBuilder(settings.Upstream)
        {
            Path = request.Path.Value ?? "/",
            Query = request.QueryString.Value?.TrimStart('?') ?? "",
        }.Uri;

        using var forwarded = new HttpRequestMessage(new HttpMethod(request.Method), target);
        if (request.ContentLength is > 0 || request.Headers.ContainsKey(HeaderNames.TransferEncoding))
            forwarded.Content = new StreamContent(request.Body);

        foreach (var header in request.Headers)
        {
            if (HopByHop.Contains(header.Key.ToLowerInvariant())) continue;
            if (!forwarded.Headers.TryAddWithoutValidation(header.Key, (IEnumerable<string>)header.Value))
                forwarded.Content?.Headers.TryAddWithoutValidation(header.Key, (IEnumerable<string>)header.Value);
        }
        forwarded.Headers.Host = request.Host.Value;
        forwarded.Headers.TryAddWithoutValidation("X-Forwarded-Proto", request.Scheme);
        forwarded.Headers.TryAddWithoutValidation("X-Forwarded-Host", request.Host.Value ?? "");
        if (context.Connection.RemoteIpAddress is { } remote)
            forwarded.Headers.TryAddWithoutValidation("X-Forwarded-For", remote.ToString());

        // Never follow the shortener's own redirect: its 302 to the destination
        // is the answer, and it has to reach the browser.
        var client = clients.CreateClient(ShortDomainHttp.ProxyClient);
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(forwarded, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException && !context.RequestAborted.IsCancellationRequested)
        {
            context.Response.StatusCode = StatusCodes.Status502BadGateway;
            await context.Response.WriteAsync("The link shortener is not reachable.", context.RequestAborted);
            return;
        }

        using (response)
        {
            context.Response.StatusCode = (int)response.StatusCode;
            foreach (var header in response.Headers.Concat(response.Content.Headers))
            {
                if (HopByHop.Contains(header.Key.ToLowerInvariant())) continue;
                context.Response.Headers[header.Key] = header.Value.ToArray();
            }
            // Length is decided by what actually gets written back.
            context.Response.Headers.Remove(HeaderNames.ContentLength);
            await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
        }
    }
}

public static class ShortDomainHttp
{
    public const string ProxyClient = "short-domain-proxy";

    public static IServiceCollection AddShortDomain(this IServiceCollection services)
    {
        services.AddSingleton<ShortDomainService>();
        services.AddHttpClient(ProxyClient)
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                UseCookies = false,
                AutomaticDecompression = DecompressionMethods.None,
            })
            .ConfigureHttpClient(client => client.Timeout = TimeSpan.FromSeconds(15));
        // The probe deliberately does not follow redirects either: the whole
        // point of the test is to see the redirect itself.
        services.AddHttpClient(ShortDomainService.ProbeClient)
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false })
            .ConfigureHttpClient(client => client.Timeout = TimeSpan.FromSeconds(8));
        return services;
    }
}
