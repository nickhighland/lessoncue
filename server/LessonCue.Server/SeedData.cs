using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class SeedData
{
    public static async Task RunAsync(LessonCueDb db)
    {
        if (!await db.Organizations.AnyAsync())
        {
            var organization = new Organization { Name = "LessonCue Demo" };
            var lessonClass = new LessonClass { Name = "Learning Lab", Description = "A ready-to-use example class for any learning environment." };
            var sampleDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7));
            var designatedStart = new DateTimeOffset(sampleDate.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero);
            var lesson = new Lesson
            {
                ClassId = lessonClass.Id,
                Date = sampleDate,
                Title = "Sample Lesson",
                AvailableFrom = DateTimeOffset.UtcNow.AddMinutes(-1),
                ExpiresAt = designatedStart.AddDays(1),
                DesignatedStartAt = designatedStart,
                PreRollStartsAt = designatedStart.AddMinutes(-30),
                PreRollEnabled = true
            };
            var preRoll = new PlaylistItem { LessonId = lesson.Id, Title = "Welcome Loop", Type = "video", Role = "preRoll", Position = 1000, DurationMs = 30_000, EndBehavior = "loop" };
            var countdown = new PlaylistItem { LessonId = lesson.Id, Title = "Five-Minute Countdown", Type = "video", Role = "countdown", Position = 2000, DurationMs = 300_000, EndBehavior = "advance" };
            var teaching = new PlaylistItem { LessonId = lesson.Id, Title = "Main Presentation", Type = "video", Role = "lesson", Position = 3000, DurationMs = 600_000, EndBehavior = "pause" };
            lesson.CountdownItemId = countdown.Id;
            db.AddRange(organization, lessonClass, lesson, preRoll, countdown, teaching);
            db.AuditEvents.Add(new AuditEvent
            {
                Action = "system.seed",
                Object = "database",
                Summary = JsonSerializer.Serialize(new { OrganizationName = organization.Name, ClassName = lessonClass.Name })
            });
        }
        if (!await db.SignageLayouts.AnyAsync())
        {
            var starters = new[]
            {
                Starter("Welcome board", "welcome", 1920, 1080, "#25302d",
                    [new("welcome-title", "text", "Welcome", "Welcome", X: 8, Y: 12, Width: 84, Height: 30, FontSize: 96, TextAlign: "center"),
                     new("welcome-clock", "clock", "Today", X: 30, Y: 57, Width: 40, Height: 22, FontSize: 54, TextAlign: "center")]),
                Starter("Daily dashboard", "dashboard", 1920, 1080, "#17201e",
                    [new("dashboard-title", "text", "Today", "Today at a glance", X: 4, Y: 4, Width: 92, Height: 18, FontSize: 64),
                     new("dashboard-calendar", "calendar", "Schedule", X: 4, Y: 25, Width: 58, Height: 70),
                     new("dashboard-weather", "weather", "Weather", X: 65, Y: 25, Width: 31, Height: 33),
                     new("dashboard-clock", "clock", "Time", X: 65, Y: 61, Width: 31, Height: 34, TextAlign: "center")]),
                Starter("Portrait announcements", "portrait", 1080, 1920, "#20242a",
                    [new("portrait-title", "text", "Announcements", "Announcements", X: 7, Y: 5, Width: 86, Height: 15, FontSize: 72, TextAlign: "center"),
                     new("portrait-media", "shape", "Feature area", X: 7, Y: 24, Width: 86, Height: 48, Shape: "rectangle", CornerRadius: 6),
                     new("portrait-ticker", "ticker", "Updates", "Add timely updates here", X: 7, Y: 77, Width: 86, Height: 14, TickerSpeed: 50)])
            };
            db.SignageLayouts.AddRange(starters);
        }
        await db.SaveChangesAsync();
    }

    private static SignageLayoutResource Starter(string name, string key, int width, int height, string background,
        IReadOnlyCollection<SignageZoneInput> zones)
    {
        var json = SignageLayout.StoreZones(zones);
        return new SignageLayoutResource
        {
            Name = name, Folder = "Starter templates", Description = "Built-in LessonCue starter layout.",
            IsTemplate = true, IsStarter = true, TemplateKey = key, BackgroundColor = background,
            CanvasWidth = width, CanvasHeight = height, Orientation = width > height ? "landscape" : "portrait",
            DraftZonesJson = json, PublishedZonesJson = json, Version = 1, PublishedVersion = 1,
            PublishState = "published", PublishedAt = DateTimeOffset.UtcNow
        };
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
