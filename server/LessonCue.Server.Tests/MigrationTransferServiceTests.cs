using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MigrationTransferServiceTests
{
    [Fact]
    public async Task TransferGrantIsEncryptedBackupOnlyAndOneTime()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.Combine(
            Path.GetTempPath(), $"lessoncue-transfer-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var path = Path.Combine(root, "source.lcbak");
            await File.WriteAllTextAsync(path, "encrypted-placeholder", ct);
            var service = new MigrationTransferService(
                new DummyHttpClientFactory(),
                new BackupService(root));

            var grant = service.Create(path, "source.lcbak");
            Assert.Equal(64, grant.Token.Length);
            var source = service.Consume(grant.Token);
            Assert.NotNull(source);
            Assert.Equal(path, source.Path);
            Assert.Null(service.Consume(grant.Token));
            Assert.Throws<ArgumentException>(() =>
                service.Create(path, "legacy.zip"));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Theory]
    [InlineData("http://192.168.4.75", "http://192.168.4.75/")]
    [InlineData("http://lessoncue.local:8080", "http://lessoncue.local:8080/")]
    [InlineData("https://lesson.example.org/path", "https://lesson.example.org/")]
    public void SourceAddressAllowsPrivateHttpOrAnyHttps(
        string value,
        string expected)
    {
        Assert.Equal(expected, MigrationTransferService.NormalizeSource(value).AbsoluteUri);
    }

    [Theory]
    [InlineData("http://example.org")]
    [InlineData("ftp://192.168.1.2")]
    [InlineData("not-an-address")]
    public void SourceAddressRejectsUnsafeOrigins(string value)
    {
        Assert.Throws<ArgumentException>(() =>
            MigrationTransferService.NormalizeSource(value));
    }

    private sealed class DummyHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}
