using System.Diagnostics;

namespace LessonCue.Server;

public sealed record MediaConverterStatus(
    bool Ffmpeg,
    bool Ffprobe,
    bool LibreOffice,
    bool Poppler,
    bool WebpEncoder,
    bool TheoraEncoder,
    IReadOnlyList<string> Missing,
    DateTimeOffset CheckedAt);

/// <summary>
/// Reports the optional local tools needed to exercise the broad media
/// catalog. This is deliberately diagnostic only: uploads still validate
/// signatures, and a missing optional codec produces an actionable processing
/// error instead of making the file silently disappear.
/// </summary>
public static class MediaConverterCapabilities
{
    private static readonly object Gate = new();
    private static MediaConverterStatus? cached;

    public static MediaConverterStatus Snapshot()
    {
        lock (Gate)
        {
            if (cached is not null && DateTimeOffset.UtcNow - cached.CheckedAt < TimeSpan.FromMinutes(10))
                return cached;
            cached = Detect();
            return cached;
        }
    }

    public static void Invalidate()
    {
        lock (Gate) cached = null;
    }

    private static MediaConverterStatus Detect()
    {
        var ffmpeg = FindExecutable("LESSONCUE_MEDIA_FFMPEG_PATH", "ffmpeg",
            @"C:\Program Files\ffmpeg\bin\ffmpeg.exe");
        var ffprobe = FindExecutable("LESSONCUE_MEDIA_FFPROBE_PATH", "ffprobe",
            @"C:\Program Files\ffmpeg\bin\ffprobe.exe");
        var libreOffice = FindExecutable("LESSONCUE_LIBREOFFICE_PATH", "soffice",
            @"C:\Program Files\LibreOffice\program\soffice.exe") ??
            FindExecutable("LESSONCUE_LIBREOFFICE_PATH", "libreoffice");
        var pdftoppm = FindExecutable("LESSONCUE_PDFTOPPM_PATH", "pdftoppm",
            @"C:\Program Files\poppler\Library\bin\pdftoppm.exe");
        var pdfinfo = FindExecutable("LESSONCUE_PDFINFO_PATH", "pdfinfo",
            @"C:\Program Files\poppler\Library\bin\pdfinfo.exe");
        var encoders = ffmpeg is null ? "" : Probe(ffmpeg, "-hide_banner", "-encoders");
        var webp = encoders.Contains("libwebp", StringComparison.OrdinalIgnoreCase) ||
            encoders.Contains("webp", StringComparison.OrdinalIgnoreCase);
        var theora = encoders.Contains("libtheora", StringComparison.OrdinalIgnoreCase);
        var missing = new List<string>();
        if (ffmpeg is null) missing.Add("FFmpeg (media inspection and conversion)");
        if (ffprobe is null) missing.Add("FFprobe (media inspection)");
        if (libreOffice is null) missing.Add("LibreOffice (legacy Office, OpenDocument, and text conversion)");
        if (pdftoppm is null || pdfinfo is null) missing.Add("Poppler (PDF rendering)");
        if (ffmpeg is not null && !webp) missing.Add("FFmpeg WebP encoder (libwebp)");
        if (ffmpeg is not null && !theora) missing.Add("FFmpeg Ogg/Theora encoder (libtheora)");
        return new MediaConverterStatus(
            ffmpeg is not null,
            ffprobe is not null,
            libreOffice is not null,
            pdftoppm is not null && pdfinfo is not null,
            webp,
            theora,
            missing,
            DateTimeOffset.UtcNow);
    }

    private static string? FindExecutable(string environmentName, string command, params string[] candidates)
    {
        var configured = Environment.GetEnvironmentVariable(environmentName);
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return configured;
        foreach (var directory in (Environment.GetEnvironmentVariable("PATH") ?? "")
                     .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var path = Path.Combine(directory, OperatingSystem.IsWindows() ? command + ".exe" : command);
            if (File.Exists(path)) return path;
        }
        return candidates.FirstOrDefault(File.Exists);
    }

    private static string Probe(string executable, params string[] arguments)
    {
        try
        {
            var start = new ProcessStartInfo(executable)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            foreach (var argument in arguments) start.ArgumentList.Add(argument);
            using var process = Process.Start(start);
            if (process is null || !process.WaitForExit(2_000))
            {
                try { process?.Kill(entireProcessTree: true); } catch { }
                return "";
            }
            return process.StandardOutput.ReadToEnd() + process.StandardError.ReadToEnd();
        }
        catch { return ""; }
    }
}
