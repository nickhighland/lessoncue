using LessonCue.Server;
using Microsoft.AspNetCore.DataProtection;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class AdminMfaServiceTests
{
    [Fact]
    public void ValidatesRfc6238Sha1VectorAsSixDigitsAndPreventsReplay()
    {
        const string rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        var timestamp = DateTimeOffset.FromUnixTimeSeconds(59);

        var accepted = AdminMfaService.ValidateSecret(rfcSecret, "287082", timestamp);
        var replayed = AdminMfaService.ValidateSecret(rfcSecret, "287082", timestamp, accepted.Counter);

        Assert.True(accepted.Success);
        Assert.Equal(1, accepted.Counter);
        Assert.False(replayed.Success);
    }

    [Fact]
    public void ProtectsSecretsAndBuildsAnAuthenticatorProvisioningUri()
    {
        var service = new AdminMfaService(new EphemeralDataProtectionProvider());
        var generated = service.CreateSecret();
        var account = new AdminAccount
        {
            Username = "owner",
            PasswordHash = "unused",
            TotpSecretProtected = generated.ProtectedSecret
        };

        Assert.NotEqual(generated.Secret, generated.ProtectedSecret);
        Assert.False(service.Validate(account, "not-a-code", DateTimeOffset.UtcNow, false).Success);
        var uri = service.BuildProvisioningUri("Sample School", account.Username, generated.Secret);
        Assert.StartsWith("otpauth://totp/", uri, StringComparison.Ordinal);
        Assert.Contains($"secret={generated.Secret}", uri, StringComparison.Ordinal);
        Assert.Contains("issuer=LessonCue%20-%20Sample%20School", uri, StringComparison.Ordinal);
    }
}
