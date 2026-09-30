namespace LessonCue.Server;

/// <summary>
/// Stable, machine-readable descriptions for the failures that appear in the
/// troubleshooting stream. The original message and exception remain the
/// evidence; these definitions give an operator or AI a durable vocabulary
/// for grouping the same failure across runs and releases.
/// </summary>
public sealed record TroubleshootingErrorDefinition(
    string Code,
    string Description,
    string RecommendedAction);

public static class TroubleshootingErrorCatalog
{
    public static TroubleshootingErrorDefinition ForRuntime(
        string category, string eventName, string message, Exception? exception = null)
    {
        var text = $"{category} {eventName} {message} {exception?.Message}";
        if (ContainsAll(text, "bwrap", "mount proc", "operation not permitted"))
            return new(
                "LC.MEDIA.WORKER.BWRAP_PROC_MOUNT",
                "The media worker could not create the Bubblewrap proc mount. This is a host sandbox-permission failure, not evidence that the uploaded media is corrupt.",
                "Verify the direct worker is selected and inspect the LessonCue service sandbox and worker permissions; do not replace the original media before checking its size and SHA-256.");

        if (ContainsAll(text, "no supported javascript runtime", "yt-dlp"))
            return new(
                "LC.YOUTUBE.JS_RUNTIME_MISSING",
                "YouTube extraction could not find a supported JavaScript runtime, so yt-dlp may return incomplete formats or an HTTP 403.",
                "Verify the bundled or configured Deno executable, its permissions, and the yt-dlp runtime arguments before retrying the import.");

        if (ContainsAll(text, "unsupported file format", "gz") ||
            ContainsAll(text, "invalid_parameter", "gz"))
            return new(
                "LC.TROUBLESHOOTING.EMAIL_ATTACHMENT_FORMAT_UNSUPPORTED",
                "The configured email provider rejected the troubleshooting attachment because it was sent as a gzip file.",
                "Send the redacted troubleshooting report as a plain JSON attachment; keep the compressed copy only in server-side artifacts.");

        if (ContainsAll(text, "youtube", "403") || ContainsAll(text, "youtube", "forbidden"))
            return new(
                "LC.YOUTUBE.DOWNLOAD_FORBIDDEN",
                "YouTube rejected the selected media request. The default player client can expose SABR-backed URLs that return HTTP 403 even when the public video is downloadable.",
                "Retry with the explicit Android player client, then inspect yt-dlp/Deno versions and server egress if the request still fails; do not classify this as a LessonCue media-file failure without evidence.");

        if (ContainsAny(text, "ffprobe", "show_streams"))
            return new(
                "LC.MEDIA.ANALYSIS.FFPROBE_FAILED",
                "FFprobe could not inspect the media source, so codec, duration, or dimensions may be unavailable.",
                "Verify the original file exists and matches its recorded size/SHA-256, then check ffprobe availability and service-user read access.");

        if (ContainsAny(text, "ffmpeg", "encoder", "quick sync", "qsv"))
            return new(
                "LC.MEDIA.CONVERSION.FFMPEG_FAILED",
                "FFmpeg or a hardware encoder failed during media derivative generation or compatibility conversion.",
                "Compare the exact command error with converter and GPU diagnostics, then retry only after confirming the original file remains intact.");

        if (Contains(category, "MediaProcessingService"))
            return new(
                "LC.MEDIA.PROCESSING.FAILED",
                "Media analysis or first-derivative processing failed for an asset.",
                "Compare the MediaAsset processing state with the original-file existence, recorded size, SHA-256, and media-worker dependency diagnostics.");

        if (Contains(category, "AdaptiveTranscode") || Contains(category, "MediaTranscode"))
            return new(
                "LC.MEDIA.COMPATIBILITY.FAILED",
                "Optional media compatibility conversion failed after the source asset was admitted.",
                "Confirm the original remains playable, inspect the compatibility error and encoder diagnostics, then retry the compatibility job if the failure is recoverable.");

        if (Contains(category, "HardwareAcceleration"))
            return new(
                "LC.MEDIA.HARDWARE_ENCODER.UNAVAILABLE",
                "The configured hardware-acceleration path could not be initialized or completed.",
                "Check render-device access, VAAPI/QSV driver selection, ffmpeg capabilities, and the LessonCue service account before falling back to software encoding.");

        if (Contains(category, "TroubleshootingEmail"))
            return new(
                "LC.TROUBLESHOOTING.EMAIL_DELIVERY_FAILED",
                "The scheduled troubleshooting email could not be delivered.",
                "Inspect the persisted email-provider response, recipient, sender, provider configuration, and attachment size.");

        if (Contains(category, "TroubleshootingReview"))
            return new(
                "LC.TROUBLESHOOTING.REVIEW_FAILED",
                "The scheduled AI troubleshooting review or report package failed.",
                "Inspect report-generation dependencies and the selected provider configuration; the raw redacted report should remain usable when available.");

        if (Contains(category, "UpdateService") || Contains(category, "DatabaseUpgrade"))
            return new(
                "LC.SERVER.UPDATE_OR_MIGRATION_FAILED",
                "A protected LessonCue update or database migration did not complete successfully.",
                "Preserve the database and update transaction evidence, verify readiness, and inspect the updater/recovery journal before retrying.");

        if (ContainsAny(text, "http request", "httpclient", "status code", "502", "503", "504"))
            return new(
                "LC.INTEGRATION.HTTP_REQUEST_FAILED",
                "An HTTP integration request failed or returned an exceptional response.",
                "Use the status code, response detail, endpoint, and request trace to identify the integration; do not suppress the failure as routine HTTP noise.");

        var component = ComponentSlug(category);
        var eventSlug = ComponentSlug(eventName);
        if (eventSlug is "0" or "EVENT0" or "") eventSlug = "FAILURE";
        return new(
            $"LC.RUNTIME.{component}.{eventSlug}",
            $"A runtime failure was recorded by {category}. The message, exception, and details are the evidence for the exact cause.",
            "Inspect the evidence at the recorded timestamp and reproduce the failing subsystem before changing code or configuration.");
    }

    public static TroubleshootingErrorDefinition ForAudit(string action, string? summary, string result)
    {
        var actionSlug = ComponentSlug(action);
        if (Contains(action, "media.processing.deferred"))
            return new(
                "LC.MEDIA.PROCESSING.DEFERRED",
                "Media processing was deferred because the original remained intact but the processing runtime was unavailable or failed in a recoverable way.",
                "Keep the original asset, inspect the recorded runtime error, and retry processing after the worker dependency is repaired.");
        if (Contains(action, "media.processing.failed"))
            return new(
                "LC.MEDIA.PROCESSING.FAILED",
                "Media processing was marked failed by the server.",
                "Compare the stored ProcessingError with the original-file checks and worker diagnostics; do not re-upload an intact source.");
        if (Contains(action, "media.compatibility.failed"))
            return new(
                "LC.MEDIA.COMPATIBILITY.FAILED",
                "Media compatibility conversion was marked failed after source processing.",
                "Inspect CompatibilityError and the converter runtime, then use the retry action if the failure is infrastructure-related.");

        return new(
            $"LC.AUDIT.{actionSlug}",
            $"An audit event recorded result '{result}' for action '{action}'. The summary is the exact server evidence.",
            "Inspect the audit summary and matching runtime entries before deciding whether the event represents a code, configuration, or external-service problem.");
    }

    public static string ComponentSlug(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "UNKNOWN";
        var chars = value.Trim().ToUpperInvariant()
            .Select(character => char.IsLetterOrDigit(character) ? character : '_')
            .ToArray();
        var result = new string(chars).Trim('_');
        while (result.Contains("__", StringComparison.Ordinal))
            result = result.Replace("__", "_", StringComparison.Ordinal);
        return result.Length == 0 ? "UNKNOWN" : result;
    }

    private static bool Contains(string value, string fragment) =>
        value.Contains(fragment, StringComparison.OrdinalIgnoreCase);

    private static bool ContainsAll(string value, params string[] fragments) =>
        fragments.All(fragment => value.Contains(fragment, StringComparison.OrdinalIgnoreCase));

    private static bool ContainsAny(string value, params string[] fragments) =>
        fragments.Any(fragment => value.Contains(fragment, StringComparison.OrdinalIgnoreCase));
}
