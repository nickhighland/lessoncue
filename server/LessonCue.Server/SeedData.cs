using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class SeedData
{
    public static async Task RunAsync(LessonCueDb db)
    {
        if (await db.Organizations.AnyAsync()) return;
        var organization = new Organization { Name = "LessonCue Demo" };
        var lessonClass = new LessonClass { Name = "Children's Sunday School", Description = "A ready-to-use example class." };
        var lesson = new Lesson
        {
            ClassId = lessonClass.Id,
            Date = new DateOnly(2026, 7, 19),
            Title = "The Good Samaritan",
            AvailableFrom = new DateTimeOffset(2026, 7, 12, 0, 0, 0, TimeSpan.FromHours(-4)),
            ExpiresAt = new DateTimeOffset(2026, 7, 20, 23, 59, 59, TimeSpan.FromHours(-4)),
            DesignatedStartAt = new DateTimeOffset(2026, 7, 19, 9, 0, 0, TimeSpan.FromHours(-4)),
            PreRollEnabled = true
        };
        var preRoll = new PlaylistItem { LessonId = lesson.Id, Title = "Welcome Loop", Type = "video", Role = "preRoll", Position = 1000, DurationMs = 30_000, EndBehavior = "loop" };
        var countdown = new PlaylistItem { LessonId = lesson.Id, Title = "Five Minute Countdown", Type = "video", Role = "countdown", Position = 2000, DurationMs = 300_000, EndBehavior = "advance" };
        var teaching = new PlaylistItem { LessonId = lesson.Id, Title = "Teaching Video", Type = "video", Role = "lesson", Position = 3000, DurationMs = 600_000, EndBehavior = "pause" };
        lesson.CountdownItemId = countdown.Id;
        db.AddRange(organization, lessonClass, lesson, preRoll, countdown, teaching);
        db.AuditEvents.Add(new AuditEvent
        {
            Action = "system.seed",
            Object = "database",
            Summary = JsonSerializer.Serialize(new { OrganizationName = organization.Name, ClassName = lessonClass.Name })
        });
        await db.SaveChangesAsync();
    }
}

public static class ServerIdentity
{
    public static Guid LoadOrCreate(string dataPath)
    {
        var configPath = Path.Combine(dataPath, "config");
        Directory.CreateDirectory(configPath);
        var identityPath = Path.Combine(configPath, "server-id");
        if (File.Exists(identityPath) && Guid.TryParse(File.ReadAllText(identityPath), out var existing)) return existing;
        var created = Guid.NewGuid();
        File.WriteAllText(identityPath, created.ToString());
        return created;
    }
}
