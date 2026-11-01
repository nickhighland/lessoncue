using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class SeedData
{
    private const string DemoOrganizationName = "LessonCue Demo";
    private const string DemoClassName = "Learning Lab";
    private const string DemoMediaFolder = "LessonCue Demo";

    private static readonly DemoMediaSpec[] DemoMedia =
    [
        new("lessoncue-pre-roll.mp4", "preRoll", "Welcome Loop", 8_000, "loop", 1000),
        new("lessoncue-countdown.mp4", "countdown", "Countdown to class", 10_000, "advance", 2000),
        new("lessoncue-main.mp4", "lesson", "Main Presentation", 12_000, "pause", 3000),
        new("lessoncue-post-roll.mp4", "postLesson", "Thanks for learning", 8_000, "pause", 4000)
    ];

    public static Task RunAsync(LessonCueDb db) => RunAsync(db, null);

    public static async Task RunAsync(LessonCueDb db, string? dataPath)
    {
        if (!await db.Organizations.AnyAsync())
        {
            var organization = new Organization { Name = DemoOrganizationName, SignageModelVersion = 1 };
            var lessonClass = new LessonClass { Name = DemoClassName, Description = "A ready-to-use example class for any learning environment." };
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
            var postRoll = new PlaylistItem { LessonId = lesson.Id, Title = "Thanks for learning", Type = "video", Role = "postLesson", Position = 4000, DurationMs = 8_000, EndBehavior = "pause" };
            lesson.CountdownItemId = countdown.Id;
            db.AddRange(organization, lessonClass, lesson, preRoll, countdown, teaching, postRoll);
            db.AuditEvents.Add(new AuditEvent
            {
                Action = "system.seed",
                Object = "database",
                Summary = JsonSerializer.Serialize(new { OrganizationName = DemoOrganizationName, ClassName = DemoClassName })
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

        if (!string.IsNullOrWhiteSpace(dataPath))
        {
            await EnsureDemoSequenceAsync(db, dataPath);
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureDemoSequenceAsync(LessonCueDb db, string dataPath)
    {
        // Only repair the data created by the built-in demo seed. A normal
        // installation must never have its administrator's playlists rewritten
        // just because the server restarted.
        var seededDemo = await db.AuditEvents.AnyAsync(x =>
            x.Action == "system.seed" && x.Summary != null &&
            x.Summary.Contains(DemoOrganizationName));
        if (!seededDemo) return;

        var lessonClass = await db.Classes.FirstOrDefaultAsync(x => x.Name == DemoClassName);
        if (lessonClass is null) return;

        var lesson = await db.Lessons
            .Include(x => x.Items)
            .ThenInclude(x => x.MediaAsset)
            .Where(x => x.ClassId == lessonClass.Id)
            .OrderBy(x => x.Date)
            .FirstOrDefaultAsync();
        if (lesson is null) return;

        var changed = false;
        foreach (var spec in DemoMedia)
        {
            var (media, mediaChanged) = await EnsureDemoMediaAsync(db, dataPath, spec);
            changed |= mediaChanged;

            var item = lesson.Items
                .Where(x => string.Equals(x.Role, spec.Role, StringComparison.OrdinalIgnoreCase))
                .OrderBy(x => x.Position)
                .FirstOrDefault();
            if (item is null)
            {
                item = new PlaylistItem
                {
                    LessonId = lesson.Id,
                    Title = spec.Title,
                    Type = "video",
                    Role = spec.Role,
                    Position = spec.Position,
                    DurationMs = spec.DurationMs,
                    EndBehavior = spec.EndBehavior,
                    MediaAssetId = media.Id,
                    MediaAsset = media
                };
                lesson.Items.Add(item);
                db.PlaylistItems.Add(item);
                changed = true;
            }
            else
            {
                if (item.Type != "video") { item.Type = "video"; changed = true; }
                if (item.MediaAssetId != media.Id) { item.MediaAssetId = media.Id; changed = true; }
                if (item.MediaAsset != media) { item.MediaAsset = media; changed = true; }
                if (item.DurationMs != spec.DurationMs) { item.DurationMs = spec.DurationMs; changed = true; }
                if (item.Position != spec.Position) { item.Position = spec.Position; changed = true; }
                if (item.EndBehavior != spec.EndBehavior) { item.EndBehavior = spec.EndBehavior; changed = true; }
            }
        }

        if (!lesson.PreRollEnabled) { lesson.PreRollEnabled = true; changed = true; }
        var countdown = lesson.Items.FirstOrDefault(x =>
            string.Equals(x.Role, "countdown", StringComparison.OrdinalIgnoreCase));
        if (countdown is not null && lesson.CountdownItemId != countdown.Id)
        {
            lesson.CountdownItemId = countdown.Id;
            changed = true;
        }
        if (lesson.PreRollStartsAt is null && lesson.DesignatedStartAt is not null)
        {
            lesson.PreRollStartsAt = lesson.DesignatedStartAt.Value.AddMinutes(-30);
            changed = true;
        }

        if (changed)
        {
            lesson.Version++;
            db.AuditEvents.Add(new AuditEvent
            {
                Action = "system.demo-sequence",
                Object = lesson.Id.ToString(),
                Summary = JsonSerializer.Serialize(new
                {
                    LessonTitle = lesson.Title,
                    Roles = DemoMedia.Select(x => x.Role).ToArray(),
                    MediaFolder = DemoMediaFolder
                })
            });
        }
    }

    private static async Task<(MediaAsset Asset, bool Changed)> EnsureDemoMediaAsync(
        LessonCueDb db, string dataPath, DemoMediaSpec spec)
    {
        var sourcePath = Path.Combine(AppContext.BaseDirectory, "SeedMedia", spec.FileName);
        if (!File.Exists(sourcePath))
            throw new FileNotFoundException($"The bundled LessonCue demo media is missing: {spec.FileName}", sourcePath);

        var relativePath = $"demo/{spec.FileName}";
        var mediaRoot = new MediaStoragePaths(dataPath).Originals;
        var destinationPath = Path.Combine(mediaRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);

        var size = new FileInfo(sourcePath).Length;
        var sha = await HashFileAsync(sourcePath);
        if (!File.Exists(destinationPath) || new FileInfo(destinationPath).Length != size ||
            !string.Equals(await HashFileAsync(destinationPath), sha, StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(sourcePath, destinationPath, overwrite: true);
        }

        var media = await db.MediaAssets.FirstOrDefaultAsync(x =>
            x.FileName == spec.FileName && x.Folder == DemoMediaFolder);
        var changed = media is null;
        media ??= new MediaAsset { FileName = spec.FileName, RelativePath = relativePath };

        changed |= media.RelativePath != relativePath || media.ContentType != "video/mp4" || media.Sha256 != sha ||
                   media.SizeBytes != size || media.DurationMs != spec.DurationMs || !media.OfflineEligible ||
                   media.ProcessingStatus != "ready" || media.CompatibilityStatus != "native" ||
                   media.VideoCodec != "h264" || media.AudioCodec != "aac" || media.Width != 1280 ||
                   media.Height != 720 || media.SourceKind != "upload" || media.StoragePolicy != MediaRetention.Persistent ||
                   media.OriginLessonId is not null || media.DeleteAfter is not null || media.Folder != DemoMediaFolder;

        media.FileName = spec.FileName;
        media.ContentType = "video/mp4";
        media.RelativePath = relativePath;
        media.Sha256 = sha;
        media.SizeBytes = size;
        media.DurationMs = spec.DurationMs;
        media.OfflineEligible = true;
        media.ProcessingStatus = "ready";
        media.ProcessingError = null;
        media.VideoCodec = "h264";
        media.AudioCodec = "aac";
        media.Width = 1280;
        media.Height = 720;
        media.CompatibilityPath = null;
        media.CompatibilitySha256 = null;
        media.CompatibilitySizeBytes = null;
        media.CompatibilityStatus = "native";
        media.CompatibilityError = null;
        media.CompatibilityTranscodedAt = null;
        media.CompatibilityTranscodeEngine = null;
        media.SourceKind = "upload";
        media.StoragePolicy = MediaRetention.Persistent;
        media.OriginLessonId = null;
        media.DeleteAfter = null;
        media.RetentionDateIsManual = false;
        media.Folder = DemoMediaFolder;
        media.TagsCsv = $"demo,{spec.Role}";
        media.Version = Math.Max(media.Version, 1);

        if (media.Id == Guid.Empty || db.Entry(media).State == EntityState.Detached)
            db.MediaAssets.Add(media);

        return (media, changed);
    }

    private static async Task<string> HashFileAsync(string path)
    {
        await using var stream = File.OpenRead(path);
        return Convert.ToHexString(await SHA256.HashDataAsync(stream)).ToLowerInvariant();
    }

    private sealed record DemoMediaSpec(string FileName, string Role, string Title, long DurationMs,
        string EndBehavior, decimal Position);

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
