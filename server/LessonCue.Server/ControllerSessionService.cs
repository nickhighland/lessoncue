using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace LessonCue.Server;

public sealed record TemporaryControllerSession(string Token, Guid ClassId, Guid? LessonId,
    DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

public sealed class ControllerSessionService
{
    private readonly ConcurrentDictionary<string, TemporaryControllerSession> sessions = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, DateTimeOffset> universalGrants = new(StringComparer.Ordinal);

    public TemporaryControllerSession Create(Guid classId, Guid? lessonId, int expiresInMinutes)
    {
        Cleanup();
        var now = DateTimeOffset.UtcNow;
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var session = new TemporaryControllerSession(token, classId, lessonId, now,
            now.AddMinutes(Math.Clamp(expiresInMinutes, 5, 10_080)));
        sessions[token] = session;
        return session;
    }

    public TemporaryControllerSession? Get(string token)
    {
        if (token.Length != 48 || token.Any(character => !Uri.IsHexDigit(character))) return null;
        if (!sessions.TryGetValue(token, out var session)) return null;
        if (session.ExpiresAt > DateTimeOffset.UtcNow) return session;
        sessions.TryRemove(token, out _);
        return null;
    }

    public string CreateUniversalGrant()
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        universalGrants[token] = DateTimeOffset.UtcNow.AddHours(12);
        return token;
    }

    public bool IsUniversalGrantValid(string token)
    {
        if (token.Length != 64 || token.Any(character => !Uri.IsHexDigit(character)) ||
            !universalGrants.TryGetValue(token, out var expiresAt)) return false;
        if (expiresAt > DateTimeOffset.UtcNow) return true;
        universalGrants.TryRemove(token, out _);
        return false;
    }

    public void RevokeUniversalGrants() => universalGrants.Clear();

    private void Cleanup()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var item in sessions.Where(item => item.Value.ExpiresAt <= now)) sessions.TryRemove(item.Key, out _);
    }
}
