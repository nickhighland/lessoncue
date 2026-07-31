using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;

namespace LessonCue.Server;

public sealed record TotpValidation(bool Success, long Counter);

/// <summary>
/// RFC 6238-compatible, six-digit TOTP for optional Service Admin MFA.
/// Secrets are encrypted with LessonCue's persisted ASP.NET Data Protection keys.
/// </summary>
public sealed class AdminMfaService
{
    private const int PeriodSeconds = 30;
    private readonly IDataProtector _protector;

    public AdminMfaService(IDataProtectionProvider protection)
    {
        _protector = protection.CreateProtector("LessonCue.AdminMfa.Totp.v1");
    }

    public (string Secret, string ProtectedSecret) CreateSecret()
    {
        var bytes = RandomNumberGenerator.GetBytes(20);
        var secret = Base32Encode(bytes);
        return (secret, _protector.Protect(secret));
    }

    public string BuildProvisioningUri(string organization, string username, string secret)
    {
        var issuer = string.IsNullOrWhiteSpace(organization) ? "LessonCue" : $"LessonCue - {organization.Trim()}";
        var label = Uri.EscapeDataString($"{issuer}:{username}");
        return $"otpauth://totp/{label}?secret={secret}&issuer={Uri.EscapeDataString(issuer)}&algorithm=SHA1&digits=6&period={PeriodSeconds}";
    }

    public TotpValidation Validate(AdminAccount account, string? code, DateTimeOffset now, bool preventReplay)
    {
        if (string.IsNullOrWhiteSpace(account.TotpSecretProtected)) return new(false, 0);
        string secret;
        try { secret = _protector.Unprotect(account.TotpSecretProtected); }
        catch (CryptographicException) { return new(false, 0); }
        return ValidateSecret(secret, code, now, preventReplay ? account.TotpLastCounter : -1);
    }

    public static TotpValidation ValidateSecret(string secret, string? code, DateTimeOffset now,
        long minimumExclusiveCounter = -1)
    {
        var normalized = new string((code ?? "").Where(char.IsDigit).ToArray());
        if (normalized.Length != 6) return new(false, 0);
        byte[] key;
        try { key = Base32Decode(secret); }
        catch (FormatException) { return new(false, 0); }
        var currentCounter = now.ToUnixTimeSeconds() / PeriodSeconds;
        for (var offset = -1; offset <= 1; offset++)
        {
            var counter = currentCounter + offset;
            if (counter <= minimumExclusiveCounter) continue;
            if (CryptographicOperations.FixedTimeEquals(
                    Encoding.ASCII.GetBytes(ComputeCode(key, counter)),
                    Encoding.ASCII.GetBytes(normalized)))
                return new(true, counter);
        }
        return new(false, 0);
    }

    private static string ComputeCode(byte[] key, long counter)
    {
        Span<byte> message = stackalloc byte[8];
        for (var index = 7; index >= 0; index--)
        {
            message[index] = (byte)(counter & 0xff);
            counter >>= 8;
        }
        using var hmac = new HMACSHA1(key);
        var hash = hmac.ComputeHash(message.ToArray());
        var offset = hash[^1] & 0x0f;
        var binary = ((hash[offset] & 0x7f) << 24) |
                     (hash[offset + 1] << 16) |
                     (hash[offset + 2] << 8) |
                     hash[offset + 3];
        return (binary % 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
    }

    private static string Base32Encode(ReadOnlySpan<byte> data)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var output = new StringBuilder((data.Length * 8 + 4) / 5);
        var buffer = 0;
        var bits = 0;
        foreach (var value in data)
        {
            buffer = (buffer << 8) | value;
            bits += 8;
            while (bits >= 5)
            {
                output.Append(alphabet[(buffer >> (bits - 5)) & 31]);
                bits -= 5;
            }
        }
        if (bits > 0) output.Append(alphabet[(buffer << (5 - bits)) & 31]);
        return output.ToString();
    }

    private static byte[] Base32Decode(string value)
    {
        var normalized = value.Trim().Replace(" ", "", StringComparison.Ordinal).TrimEnd('=').ToUpperInvariant();
        var output = new List<byte>(normalized.Length * 5 / 8);
        var buffer = 0;
        var bits = 0;
        foreach (var character in normalized)
        {
            var decoded = character switch
            {
                >= 'A' and <= 'Z' => character - 'A',
                >= '2' and <= '7' => character - '2' + 26,
                _ => throw new FormatException("Invalid Base32 value.")
            };
            buffer = (buffer << 5) | decoded;
            bits += 5;
            if (bits < 8) continue;
            output.Add((byte)((buffer >> (bits - 8)) & 0xff));
            bits -= 8;
        }
        return output.ToArray();
    }
}
