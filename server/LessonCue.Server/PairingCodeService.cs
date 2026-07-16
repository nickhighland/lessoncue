using System.Security.Cryptography;

namespace LessonCue.Server;

public sealed class PairingCodeService
{
    private readonly byte[] secret;
    private readonly TimeSpan period = TimeSpan.FromMinutes(10);
    private readonly string preferencePath;
    private readonly object preferenceGate = new();
    private string? fixedPin;

    public PairingCodeService(string dataPath, string? configuredPin)
    {
        var configPath = Path.Combine(dataPath, "config");
        Directory.CreateDirectory(configPath);
        var secretPath = Path.Combine(configPath, "pairing-secret");
        preferencePath = Path.Combine(configPath, "pairing-pin");
        if (File.Exists(secretPath)) secret = Convert.FromHexString(File.ReadAllText(secretPath).Trim());
        else
        {
            secret = RandomNumberGenerator.GetBytes(32);
            File.WriteAllText(secretPath, Convert.ToHexString(secret).ToLowerInvariant());
        }
        var preference = File.Exists(preferencePath) ? File.ReadAllText(preferencePath).Trim() : null;
        fixedPin = string.Equals(preference, "automatic", StringComparison.OrdinalIgnoreCase)
            ? null
            : NormalizePin(preference ?? configuredPin);
    }

    public string? FixedPin => Volatile.Read(ref fixedPin);
    public DateTimeOffset ExpiresAt => FixedPin is not null ? DateTimeOffset.MaxValue : WindowStart().Add(period);
    public string Current => FixedPin ?? CodeFor(WindowStart());
    public bool IsValid(string pin) => CryptographicOperations.FixedTimeEquals(
        System.Text.Encoding.UTF8.GetBytes(Current), System.Text.Encoding.UTF8.GetBytes(pin.Trim()));

    public void SetFixedPin(string? pin)
    {
        var normalized = NormalizePin(pin);
        lock (preferenceGate)
        {
            var temporaryPath = preferencePath + ".tmp";
            File.WriteAllText(temporaryPath, normalized ?? "automatic");
            if (!OperatingSystem.IsWindows())
                File.SetUnixFileMode(temporaryPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            File.Move(temporaryPath, preferencePath, true);
            Volatile.Write(ref fixedPin, normalized);
        }
    }

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

    private static string? NormalizePin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return null;
        var normalized = pin.Trim();
        if (normalized.Length != 6 || !normalized.All(char.IsAsciiDigit))
            throw new ArgumentException("The pairing PIN must contain exactly six digits.");
        return normalized;
    }
}
