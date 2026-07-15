using System.Security.Cryptography;

namespace LessonCue.Server;

public sealed class PairingCodeService
{
    private readonly byte[] secret;
    private readonly TimeSpan period = TimeSpan.FromMinutes(10);

    public PairingCodeService(string dataPath, string? configuredPin)
    {
        if (!string.IsNullOrWhiteSpace(configuredPin))
        {
            secret = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"configured:{configuredPin}"));
            FixedPin = configuredPin;
            return;
        }
        var path = Path.Combine(dataPath, "config", "pairing-secret");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (File.Exists(path)) secret = Convert.FromHexString(File.ReadAllText(path).Trim());
        else
        {
            secret = RandomNumberGenerator.GetBytes(32);
            File.WriteAllText(path, Convert.ToHexString(secret).ToLowerInvariant());
        }
    }

    public string? FixedPin { get; }
    public DateTimeOffset ExpiresAt => FixedPin is not null ? DateTimeOffset.MaxValue : WindowStart().Add(period);
    public string Current => FixedPin ?? CodeFor(WindowStart());
    public bool IsValid(string pin) => CryptographicOperations.FixedTimeEquals(
        System.Text.Encoding.UTF8.GetBytes(Current), System.Text.Encoding.UTF8.GetBytes(pin.Trim()));

    private DateTimeOffset WindowStart()
    {
        var ticks = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / (long)period.TotalSeconds * (long)period.TotalSeconds;
        return DateTimeOffset.FromUnixTimeSeconds(ticks);
    }

    private string CodeFor(DateTimeOffset window)
    {
        using var hmac = new HMACSHA256(secret);
        var hash = hmac.ComputeHash(BitConverter.GetBytes(window.ToUnixTimeSeconds()));
        return (BitConverter.ToUInt32(hash, 0) % 1_000_000).ToString("D6");
    }
}
