using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static partial class YouTubeMedia
{
    public static bool IsYouTubeUrl(Uri uri) =>
        HostIs(uri.Host, "youtube.com") || HostIs(uri.Host, "youtu.be") || HostIs(uri.Host, "youtube-nocookie.com");

    public static string? EmbedUrl(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || !IsYouTubeUrl(uri)) return null;
        string? id = null;
        if (HostIs(uri.Host, "youtu.be")) id = uri.AbsolutePath.Trim('/').Split('/').FirstOrDefault();
        else
        {
            var parts = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2 && parts[0] is "embed" or "shorts" or "live") id = parts[1];
            if (id is null && uri.AbsolutePath.TrimEnd('/').Equals("/watch", StringComparison.OrdinalIgnoreCase))
                id = uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
                    .Select(x => x.Split('=', 2)).FirstOrDefault(x => x.Length == 2 && x[0] == "v")?.ElementAtOrDefault(1);
        }
        if (string.IsNullOrWhiteSpace(id)) return null;
        id = Uri.UnescapeDataString(id);
        return VideoId().IsMatch(id) ? $"https://www.youtube.com/embed/{id}?autoplay=1&controls=1&rel=0" : null;
    }

    private static bool HostIs(string host, string domain) =>
        host.Equals(domain, StringComparison.OrdinalIgnoreCase) || host.EndsWith('.' + domain, StringComparison.OrdinalIgnoreCase);

    [GeneratedRegex("^[A-Za-z0-9_-]{6,20}$")]
    private static partial Regex VideoId();
}

public sealed class YouTubeImportService(
    IServiceScopeFactory scopes,
    MediaStoragePaths paths,
    StorageService storage,
    ILogger<YouTubeImportService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
                var item = await db.MediaAssets.FirstOrDefaultAsync(
                    x => x.SourceKind == "youtube-download" && x.ProcessingStatus == "downloading", stoppingToken);
                if (item is null) { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); continue; }
                await DownloadAsync(item, db, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception ex)
            {
                logger.LogError(ex, "YouTube import loop failed");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task DownloadAsync(MediaAsset item, LessonCueDb db, CancellationToken ct)
    {
        var temporary = Path.Combine(paths.DataPath, "media", "temporary", "youtube-" + item.Id.ToString("N"));
        try
        {
            if (!Uri.TryCreate(item.SourceUrl, UriKind.Absolute, out var uri) || !YouTubeMedia.IsYouTubeUrl(uri))
                throw new InvalidOperationException("Only YouTube URLs can be downloaded by this importer.");
            var executable = FindExecutable();
            var snapshot = await storage.GetSnapshotAsync(db, ct);
            if (snapshot.RemainingBytes < 1024 * 1024)
                throw new InvalidOperationException("The LessonCue storage allocation is full.");

            Directory.CreateDirectory(temporary);
            var outputTemplate = Path.Combine(temporary, "%(title).150B [%(id)s].%(ext)s");
            var start = new ProcessStartInfo(executable)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            foreach (var argument in new[] { "--no-config", "--no-playlist", "--newline", "--restrict-filenames",
                         "--max-filesize", snapshot.RemainingBytes.ToString(), "-f", "best[ext=mp4]", "-o", outputTemplate,
                         "--print", "after_move:filepath", item.SourceUrl! })
                start.ArgumentList.Add(argument);

            using var process = new Process { StartInfo = start };
            process.Start();
            var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0)
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? "YouTube download failed." : stderr.Trim());

            var downloaded = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(Path.GetFullPath).LastOrDefault(File.Exists);
            if (downloaded is null || !downloaded.StartsWith(Path.GetFullPath(temporary) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                throw new InvalidOperationException("The downloader did not produce a valid local file.");
            var info = new FileInfo(downloaded);
            if (info.Length > snapshot.RemainingBytes)
                throw new InvalidOperationException("The downloaded video exceeds the available LessonCue storage.");

            var extension = Path.GetExtension(downloaded).ToLowerInvariant();
            if (extension != ".mp4") throw new InvalidOperationException("YouTube did not provide an MP4 version of this video.");
            var storedName = item.Id + extension;
            var destination = Path.Combine(paths.Originals, storedName);
            Directory.CreateDirectory(paths.Originals);
            File.Move(downloaded, destination, true);
            await using var stream = File.OpenRead(destination);
            item.Sha256 = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)).ToLowerInvariant();
            item.RelativePath = storedName;
            item.FileName = Path.GetFileName(downloaded);
            item.ContentType = "video/mp4";
            item.SizeBytes = info.Length;
            item.OfflineEligible = true;
            item.LinkKind = "youtube-local";
            item.ProcessingStatus = "pending";
            item.ProcessingError = null;
            db.AuditEvents.Add(new AuditEvent { Actor = "system", Action = "media.youtube.download",
                Object = item.Id.ToString(), Summary = $"Downloaded {item.FileName} to local storage." });
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            item.ProcessingStatus = "failed";
            item.ProcessingError = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
            await db.SaveChangesAsync(CancellationToken.None);
            logger.LogWarning(ex, "Could not import YouTube media {MediaId}", item.Id);
        }
        finally
        {
            try { if (Directory.Exists(temporary)) Directory.Delete(temporary, true); } catch (Exception ex) { logger.LogDebug(ex, "Could not remove YouTube staging directory"); }
        }
    }

    private static string FindExecutable()
    {
        var configured = Environment.GetEnvironmentVariable("LESSONCUE_YTDLP_PATH");
        if (!string.IsNullOrWhiteSpace(configured)) return configured;
        var bundled = Path.Combine(AppContext.BaseDirectory, OperatingSystem.IsWindows() ? "yt-dlp.exe" : "yt-dlp");
        return File.Exists(bundled) ? bundled : OperatingSystem.IsWindows() ? "yt-dlp.exe" : "yt-dlp";
    }
}
