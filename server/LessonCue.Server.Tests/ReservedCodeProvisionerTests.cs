using System.Net;
using System.Text;
using System.Text.Json;
using LessonCue.Server.Activities;
using LessonCue.Server.Shortener;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// Provisioning the hundred reserved codes against a stand-in shortener, so
/// the awkward cases -- a slug somebody else made, an API that stops answering
/// -- can actually be exercised.
/// </summary>
public class ReservedCodeProvisionerTests
{
    private const string Upstream = "http://shlink:8080";
    private const string Key = "integration-key";
    private const string Domain = "go.example.org";
    private const string PublicUrl = "https://lessoncue.example.org";

    /// <summary>A shortener that remembers what it was told, and can misbehave on request.</summary>
    private sealed class FakeShortener : HttpMessageHandler
    {
        public readonly Dictionary<string, (string LongUrl, List<string> Tags)> Urls = new(StringComparer.Ordinal);
        public int Creates;
        public int Updates;
        public bool Unreachable;
        public readonly HashSet<string> RefuseToCreate = new(StringComparer.OrdinalIgnoreCase);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (Unreachable) throw new HttpRequestException("no route to host");

            var path = request.RequestUri!.AbsolutePath;
            var slug = path.Split('/').Last();

            if (request.Method == HttpMethod.Get && path.EndsWith("/health", StringComparison.Ordinal))
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));

            if (request.Method == HttpMethod.Get)
                return Task.FromResult(Urls.TryGetValue(slug, out var found)
                    ? Json(HttpStatusCode.OK, slug, found.LongUrl, found.Tags)
                    : new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("{}") });

            if (request.Method == HttpMethod.Post)
            {
                var body = JsonDocument.Parse(request.Content!.ReadAsStringAsync(ct).Result).RootElement;
                // Loose mode lower-cases a custom slug as it stores it, while
                // lookup by slug stays exact. Storing the code verbatim here is
                // what let a hundred reserved codes be created and then never
                // found again on the real thing.
                var customSlug = body.GetProperty("customSlug").GetString()!.ToLowerInvariant();
                if (RefuseToCreate.Contains(customSlug) || Urls.ContainsKey(customSlug))
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadRequest) { Content = new StringContent("slug already in use") });
                var tags = body.GetProperty("tags").EnumerateArray().Select(x => x.GetString()!).ToList();
                Urls[customSlug] = (body.GetProperty("longUrl").GetString()!, tags);
                Creates++;
                return Task.FromResult(Json(HttpStatusCode.OK, customSlug, Urls[customSlug].LongUrl, tags));
            }

            if (request.Method == HttpMethod.Patch)
            {
                var body = JsonDocument.Parse(request.Content!.ReadAsStringAsync(ct).Result).RootElement;
                var tags = body.GetProperty("tags").EnumerateArray().Select(x => x.GetString()!).ToList();
                Urls[slug.Split('?')[0]] = (body.GetProperty("longUrl").GetString()!, tags);
                Updates++;
                return Task.FromResult(Json(HttpStatusCode.OK, slug, Urls[slug.Split('?')[0]].LongUrl, tags));
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.MethodNotAllowed));
        }

        /// <summary>The slug as this shortener stores it. Tests name codes the
        /// way LessonCue writes them; loose mode keeps them lower-cased.</summary>
        private static string Stored(string code) => code.ToLowerInvariant();
        public bool Has(string code) => Urls.ContainsKey(Stored(code));
        public void Forget(string code) => Urls.Remove(Stored(code));
        public (string LongUrl, List<string> Tags) this[string code]
        {
            get => Urls[Stored(code)];
            set => Urls[Stored(code)] = value;
        }

        private static HttpResponseMessage Json(HttpStatusCode status, string slug, string longUrl, IEnumerable<string> tags) =>
            new(status)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(new { shortCode = slug, longUrl, tags, domain = Domain }),
                    Encoding.UTF8, "application/json"),
            };
    }

    private static (ReservedCodeProvisioner Provisioner, FakeShortener Fake) Create()
    {
        var fake = new FakeShortener();
        return (new ReservedCodeProvisioner(new ShlinkClient(new HttpClient(fake))), fake);
    }

    [Fact]
    public async Task AFirstRunCreatesEveryReservedCode()
    {
        var (provisioner, fake) = Create();
        var report = await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);

        Assert.Equal(100, report.Created);
        Assert.Equal(100, report.Present);
        Assert.False(report.Degraded);
        Assert.Equal(100, fake.Urls.Count);
    }

    [Fact]
    public async Task EveryCodePointsAtLessonCuesOwnJoinRoute()
    {
        var (provisioner, fake) = Create();
        await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);

        // Reusing the existing route rather than inventing a second way in.
        Assert.Equal($"{PublicUrl}/play/Q7Z6", fake["Q7Z6"].LongUrl);
        Assert.All(fake.Urls, entry => Assert.Contains("/play/", entry.Value.LongUrl));
    }

    [Fact]
    public async Task EveryCodeIsTaggedAsOurs()
    {
        var (provisioner, fake) = Create();
        await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        Assert.All(fake.Urls, entry => Assert.Contains(ReservedGameCodes.ReservedTag, entry.Value.Tags));
    }

    [Fact]
    public async Task RunningItAgainChangesNothing()
    {
        var (provisioner, fake) = Create();
        await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        var second = await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);

        Assert.Equal(0, second.Created);
        Assert.Equal(0, second.Repaired);
        Assert.Equal(100, second.AlreadyCorrect);
        Assert.Equal(100, fake.Creates);
    }

    [Fact]
    public async Task AMissingCodeIsPutBack()
    {
        var (provisioner, fake) = Create();
        await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        fake.Forget("A3C8");

        var report = await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        Assert.Equal(1, report.Created);
        Assert.True(fake.Has("A3C8"));
    }

    [Fact]
    public async Task ACodeSentToTheWrongPlaceIsRepairedRatherThanRecreated()
    {
        var (provisioner, fake) = Create();
        await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        // As happens when LessonCue's public address changes.
        fake["Q7Z6"] = ("https://old.example.org/play/Q7Z6", [ReservedGameCodes.ReservedTag]);

        var report = await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        Assert.Equal(1, report.Repaired);
        Assert.Equal(0, report.Created);
        Assert.Equal($"{PublicUrl}/play/Q7Z6", fake["Q7Z6"].LongUrl);
        // Repaired in place, so its visit history survives.
        Assert.Equal(1, fake.Updates);
    }

    [Fact]
    public async Task ASlugSomebodyElseCreatedIsReportedRatherThanTakenOver()
    {
        var (provisioner, fake) = Create();
        fake["Q7Z6"] = ("https://someone-elses.example.org/campaign", ["marketing"]);

        var report = await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);

        Assert.Contains("Q7Z6", report.Conflicts);
        Assert.True(report.Degraded);
        // Left exactly as they had it.
        Assert.Equal("https://someone-elses.example.org/campaign", fake["Q7Z6"].LongUrl);
        Assert.Equal(99, report.Created);
    }

    [Fact]
    public async Task ACreateThatIsRefusedBecomesAConflictNotACrash()
    {
        var (provisioner, fake) = Create();
        fake.RefuseToCreate.Add("M4S9");

        var report = await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        Assert.Contains("M4S9", report.Conflicts);
        Assert.Equal(99, report.Created);
    }

    [Fact]
    public async Task AShortenerThatStopsAnsweringIsReportedForEveryCode()
    {
        var (provisioner, fake) = Create();
        fake.Unreachable = true;

        var report = await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        Assert.True(report.Degraded);
        Assert.Equal(100, report.Failures.Count);
        Assert.Equal(0, report.Created);
    }

    [Fact]
    public async Task AnAuditReportsWhatIsMissingWithoutChangingAnything()
    {
        var (provisioner, fake) = Create();
        await provisioner.ReconcileAsync(Upstream, Key, Domain, PublicUrl, TestContext.Current.CancellationToken);
        fake.Forget("Z9Y5");
        var creates = fake.Creates;

        var (present, missing) = await provisioner.AuditAsync(Upstream, Key, Domain, TestContext.Current.CancellationToken);
        Assert.Equal(99, present);
        Assert.Equal(["Z9Y5"], missing);
        Assert.Equal(creates, fake.Creates);
    }

    [Fact]
    public async Task ADestinationIsBuiltFromWhicheverPublicAddressIsConfigured()
    {
        // Nothing here is specific to one installation.
        Assert.Equal("https://a.example.org/play/Q7Z6", ReservedCodeProvisioner.DestinationFor("https://a.example.org", "Q7Z6"));
        Assert.Equal("https://b.school.edu/play/Q7Z6", ReservedCodeProvisioner.DestinationFor("https://b.school.edu/", "Q7Z6"));
        await Task.CompletedTask;
    }
}
