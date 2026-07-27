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
                Starter("Full-screen playlist", "fullscreen", 1920, 1080, "#111816",
                    [new("main-playlist", "presentation", "Main playlist", "Choose a playlist",
                        X: 0, Y: 0, Width: 100, Height: 100, BackgroundColor: "#111816", Fit: "contain")]),
                Starter("Information frame", "information-frame", 1920, 1080, "#26302d",
                    [new("main-playlist", "presentation", "Main playlist", "Choose a playlist",
                        X: 0, Y: 0, Width: 80, Height: 80, BackgroundColor: "#303331", Fit: "contain"),
                     new("side-1", "text", "Sidebar", "Add a message", X: 80, Y: 0, Width: 20, Height: 40,
                        BackgroundColor: "#063b27", FontSize: 34),
                     new("side-2", "clock", "Time and date", X: 80, Y: 40, Width: 20, Height: 40,
                        BackgroundColor: "#052c1e", TextAlign: "center"),
                     new("bottom-1", "weather", "Weather", X: 0, Y: 80, Width: 20, Height: 20,
                        BackgroundColor: "#052c1e", TextAlign: "center"),
                     new("bottom-2", "wifi", "Guest Wi-Fi", X: 20, Y: 80, Width: 20, Height: 20,
                        BackgroundColor: "#063b27", QrPlacement: "left"),
                     new("bottom-3", "text", "News", "Add an update", X: 40, Y: 80, Width: 20, Height: 20,
                        BackgroundColor: "#052c1e", FontSize: 30),
                     new("bottom-4", "text", "Message", "Welcome", X: 60, Y: 80, Width: 20, Height: 20,
                        BackgroundColor: "#063b27", FontSize: 30),
                     new("bottom-5", "qr", "Learn more", QrValue: "https://lessoncue.local",
                        X: 80, Y: 80, Width: 20, Height: 20, BackgroundColor: "#052c1e", QrPlacement: "left")]),
                Starter("Welcome board", "welcome", 1920, 1080, "#25302d",
                    [new("welcome-title", "text", "Welcome", "Welcome", X: 8, Y: 12, Width: 84, Height: 30, FontSize: 96, TextAlign: "center"),
                     new("welcome-playlist", "presentation", "Feature playlist", "Choose a playlist",
                        X: 8, Y: 48, Width: 60, Height: 42, BackgroundColor: "#17201e", Fit: "contain"),
                     new("welcome-clock", "clock", "Today", X: 72, Y: 48, Width: 20, Height: 42, FontSize: 44, TextAlign: "center")])
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
