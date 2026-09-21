using LessonCue.Server;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class TroubleshootingReportTests
{
    [Fact]
    public void MediaIssuesExposeStableCodesAndExactEvidence()
    {
        var now = DateTimeOffset.UtcNow;
        var asset = new MediaDiagnosticSnapshot(
            Id: Guid.NewGuid(),
            FileName: "lesson.mp4",
            RelativePath: "originals/lesson.mp4",
            ContentType: "video/mp4",
            SizeBytes: 1234,
            Sha256: "expected",
            CreatedAt: now,
            ProcessingStatus: "ready",
            ProcessingError: "Media analysis is waiting for the processing runtime.",
            CompatibilityStatus: "pending",
            CompatibilityError: null,
            CompatibilityPath: null,
            CompatibilitySha256: null,
            CompatibilitySizeBytes: null,
            VideoCodec: "h264",
            AudioCodec: "aac",
            Width: 1920,
            Height: 1080,
            OfflineEligible: true,
            Version: 1,
            StoragePolicy: "retained",
            SourceKind: "upload",
            OriginalFile: new MediaFileDiagnostic(
                "originals/lesson.mp4", true, 1234, "expected", true, "expected", true, null),
            CompatibilityFile: null,
            Transcodes: []);

        var issues = TroubleshootingIssueBuilder.Build([], [], [asset], [], []);

        var issue = Assert.Single(issues, item => item.Code == "LC.MEDIA.PROCESSING.DEFERRED");
        Assert.Equal("warning", issue.Severity);
        Assert.Contains("processing runtime", issue.Evidence, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("OfflineEligible=True", issue.Evidence, StringComparison.Ordinal);
    }

    [Fact]
    public void PullEndpointAuthorizationUsesTheDedicatedBearerToken()
    {
        const string variable = TroubleshootingReportPullService.TokenEnvironmentVariable;
        var previous = Environment.GetEnvironmentVariable(variable);
        try
        {
            Environment.SetEnvironmentVariable(variable, "test-report-token");
            var context = new DefaultHttpContext();
            context.Request.Headers.Authorization = "Bearer test-report-token";
            Assert.True(TroubleshootingReportPullService.IsConfigured);
            Assert.True(TroubleshootingReportPullService.Authorize(context.Request));

            context.Request.Headers.Authorization = "Bearer wrong-token";
            Assert.False(TroubleshootingReportPullService.Authorize(context.Request));
            context.Request.Headers.Authorization = "test-report-token";
            Assert.False(TroubleshootingReportPullService.Authorize(context.Request));
        }
        finally
        {
            Environment.SetEnvironmentVariable(variable, previous);
        }
    }

    [Fact]
    public void PullUrlUsesTheConfiguredPublicBaseUrl()
    {
        var organization = new Organization
        {
            Name = "Test",
            PublicBaseUrl = "https://lessoncue.net/"
        };

        Assert.Equal("https://lessoncue.net/report.log",
            TroubleshootingReportPullService.EndpointUrl(organization));
    }
}
