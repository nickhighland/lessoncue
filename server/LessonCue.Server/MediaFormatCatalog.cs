namespace LessonCue.Server;

/// <summary>
/// The single source of truth for media formats LessonCue will admit.
///
/// The catalog is deliberately broader than the formats every browser or TV
/// can play natively. FFmpeg normalizes video/audio and rasterizes images for
/// derivatives; LibreOffice and Poppler turn document formats into lesson
/// slides. Content signatures are still checked separately by
/// <see cref="MediaContentInspector"/>.
/// </summary>
public sealed record MediaFormatDefinition(
    string Extension,
    string Family,
    string ContentType,
    string Converter,
    string Label);

public static class MediaFormatCatalog
{
    private static readonly MediaFormatDefinition[] Definitions =
    [
        // Video containers and common camera/export formats.
        .. Video(".mp4", "video/mp4", "MP4 video"),
        .. Video(".m4v", "video/mp4", "M4V video"),
        .. Video(".mov", "video/quicktime", "QuickTime video"),
        .. Video(".f4v", "video/mp4", "Flash MP4 video"),
        .. Video(".mkv", "video/x-matroska", "Matroska video"),
        .. Video(".webm", "video/webm", "WebM video"),
        .. Video(".avi", "video/x-msvideo", "AVI video"),
        .. Video(".wmv", "video/x-ms-wmv", "Windows Media video"),
        .. Video(".asf", "video/x-ms-asf", "Advanced Systems Format video"),
        .. Video(".mpeg", "video/mpeg", "MPEG video"),
        .. Video(".mpg", "video/mpeg", "MPEG video"),
        .. Video(".mpe", "video/mpeg", "MPEG video"),
        .. Video(".m1v", "video/mpeg", "MPEG-1 video"),
        .. Video(".m2v", "video/mpeg", "MPEG-2 video"),
        .. Video(".vob", "video/mpeg", "DVD video"),
        .. Video(".ts", "video/mp2t", "MPEG transport stream"),
        .. Video(".mts", "video/mp2t", "AVCHD video"),
        .. Video(".m2ts", "video/mp2t", "Blu-ray transport stream"),
        .. Video(".mxf", "application/mxf", "Material Exchange Format video"),
        .. Video(".flv", "video/x-flv", "Flash video"),
        .. Video(".ogv", "video/ogg", "Ogg video"),
        .. Video(".ogm", "video/ogg", "Ogg media video"),
        .. Video(".3gp", "video/3gpp", "3GPP video"),
        .. Video(".3gpp", "video/3gpp", "3GPP video"),
        .. Video(".3g2", "video/3gpp2", "3GPP2 video"),
        .. Video(".3gpp2", "video/3gpp2", "3GPP2 video"),
        .. Video(".rm", "application/vnd.rn-realmedia", "RealMedia video"),
        .. Video(".rmvb", "application/vnd.rn-realmedia-vbr", "RealMedia variable-bitrate video"),
        .. Video(".nut", "video/x-nut", "NUT video"),
        .. Video(".ivf", "video/x-ivf", "IVF video"),
        .. Video(".y4m", "video/x-yuv4mpeg", "YUV4MPEG video"),
        .. Video(".h264", "video/h264", "H.264 elementary stream"),
        .. Video(".264", "video/h264", "H.264 elementary stream"),
        .. Video(".h265", "video/h265", "H.265 elementary stream"),
        .. Video(".hevc", "video/h265", "HEVC elementary stream"),
        .. Video(".265", "video/h265", "H.265 elementary stream"),
        .. Video(".mjpeg", "video/x-motion-jpeg", "Motion JPEG video"),
        .. Video(".mjpg", "video/x-motion-jpeg", "Motion JPEG video"),

        // Audio containers and lossless/lossy exchange formats.
        .. Audio(".mp3", "audio/mpeg", "MP3 audio"),
        .. Audio(".mp2", "audio/mpeg", "MPEG audio"),
        .. Audio(".mpa", "audio/mpeg", "MPEG audio"),
        .. Audio(".m4a", "audio/mp4", "MPEG-4 audio"),
        .. Audio(".aac", "audio/aac", "AAC audio"),
        .. Audio(".wav", "audio/wav", "WAV audio"),
        .. Audio(".flac", "audio/flac", "FLAC audio"),
        .. Audio(".ogg", "audio/ogg", "Ogg audio"),
        .. Audio(".oga", "audio/ogg", "Ogg audio"),
        .. Audio(".opus", "audio/opus", "Opus audio"),
        .. Audio(".wma", "audio/x-ms-wma", "Windows Media audio"),
        .. Audio(".aiff", "audio/aiff", "AIFF audio"),
        .. Audio(".aif", "audio/aiff", "AIFF audio"),
        .. Audio(".aifc", "audio/aiff", "AIFF-C audio"),
        .. Audio(".amr", "audio/amr", "AMR audio"),
        .. Audio(".ac3", "audio/ac3", "Dolby Digital audio"),
        .. Audio(".eac3", "audio/eac3", "Enhanced AC-3 audio"),
        .. Audio(".au", "audio/basic", "Sun AU audio"),
        .. Audio(".snd", "audio/basic", "Sun SND audio"),
        .. Audio(".caf", "audio/x-caf", "Core Audio Format"),
        .. Audio(".mka", "audio/x-matroska", "Matroska audio"),
        .. Audio(".ape", "audio/ape", "Monkey's Audio"),
        .. Audio(".wv", "audio/wavpack", "WavPack audio"),
        .. Audio(".tta", "audio/x-tta", "True Audio"),
        .. Audio(".voc", "audio/x-voc", "Creative Voice audio"),
        .. Audio(".spx", "audio/ogg", "Speex audio"),

        // Raster images. FFmpeg supplies thumbnailing and TV-safe derivatives
        // when a browser or Android decoder does not support the original.
        .. Image(".jpg", "image/jpeg", "JPEG image"),
        .. Image(".jpeg", "image/jpeg", "JPEG image"),
        .. Image(".png", "image/png", "PNG image"),
        .. Image(".webp", "image/webp", "WebP image"),
        .. Image(".gif", "image/gif", "GIF image"),
        .. Image(".bmp", "image/bmp", "Bitmap image"),
        .. Image(".tif", "image/tiff", "TIFF image"),
        .. Image(".tiff", "image/tiff", "TIFF image"),
        .. Image(".avif", "image/avif", "AVIF image"),
        .. Image(".heic", "image/heic", "HEIC image"),
        .. Image(".heif", "image/heif", "HEIF image"),
        .. Image(".jxl", "image/jxl", "JPEG XL image"),
        .. Image(".ico", "image/x-icon", "Windows icon"),
        .. Image(".jp2", "image/jp2", "JPEG 2000 image"),
        .. Image(".j2k", "image/jp2", "JPEG 2000 image"),
        .. Image(".jpf", "image/jp2", "JPEG 2000 image"),
        .. Image(".jpm", "image/jp2", "JPEG 2000 image"),
        .. Image(".mj2", "image/mj2", "JPEG 2000 motion image"),

        // Presentations, office documents, spreadsheets, text, and archives
        // that LibreOffice/Poppler can turn into safe lesson slide images.
        .. Document(".pdf", "application/pdf", "PDF document", "Poppler"),
        .. OleDocument(".ppt", "application/vnd.ms-powerpoint", "PowerPoint 97-2003"),
        .. OleDocument(".pps", "application/vnd.ms-powerpoint", "PowerPoint slideshow"),
        .. OleDocument(".pot", "application/vnd.ms-powerpoint", "PowerPoint template"),
        .. OleDocument(".doc", "application/msword", "Word 97-2003"),
        .. OleDocument(".xls", "application/vnd.ms-excel", "Excel 97-2003"),
        .. OleDocument(".xlt", "application/vnd.ms-excel", "Excel template"),
        .. OleDocument(".xla", "application/vnd.ms-excel", "Excel add-in"),
        .. Document(".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint"),
        .. Document(".ppsx", "application/vnd.openxmlformats-officedocument.presentationml.slideshow", "PowerPoint slideshow"),
        .. Document(".potx", "application/vnd.openxmlformats-officedocument.presentationml.template", "PowerPoint template"),
        .. Document(".pptm", "application/vnd.ms-powerpoint.presentation.macroEnabled.12", "PowerPoint macro-enabled presentation"),
        .. Document(".ppsm", "application/vnd.ms-powerpoint.slideshow.macroEnabled.12", "PowerPoint macro-enabled slideshow"),
        .. Document(".potm", "application/vnd.ms-powerpoint.template.macroEnabled.12", "PowerPoint macro-enabled template"),
        .. Document(".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word document"),
        .. Document(".docm", "application/vnd.ms-word.document.macroEnabled.12", "Word macro-enabled document"),
        .. Document(".dot", "application/msword", "Word template 97-2003"),
        .. Document(".dotx", "application/vnd.openxmlformats-officedocument.wordprocessingml.template", "Word template"),
        .. Document(".dotm", "application/vnd.ms-word.template.macroEnabled.12", "Word macro-enabled template"),
        .. Document(".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel workbook"),
        .. Document(".xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12", "Excel macro-enabled workbook"),
        .. Document(".xltx", "application/vnd.openxmlformats-officedocument.spreadsheetml.template", "Excel template"),
        .. Document(".xltm", "application/vnd.ms-excel.template.macroEnabled.12", "Excel macro-enabled template"),
        .. Document(".xlam", "application/vnd.ms-excel.addin.macroEnabled.12", "Excel add-in"),
        .. Document(".odp", "application/vnd.oasis.opendocument.presentation", "OpenDocument presentation"),
        .. Document(".otp", "application/vnd.oasis.opendocument.presentation-template", "OpenDocument presentation template"),
        .. Document(".odt", "application/vnd.oasis.opendocument.text", "OpenDocument text"),
        .. Document(".ott", "application/vnd.oasis.opendocument.text-template", "OpenDocument text template"),
        .. Document(".ods", "application/vnd.oasis.opendocument.spreadsheet", "OpenDocument spreadsheet"),
        .. Document(".ots", "application/vnd.oasis.opendocument.spreadsheet-template", "OpenDocument spreadsheet template"),
        .. Document(".fodp", "application/vnd.oasis.opendocument.presentation", "Flat OpenDocument presentation"),
        .. Document(".fodt", "application/vnd.oasis.opendocument.text", "Flat OpenDocument text"),
        .. Document(".fods", "application/vnd.oasis.opendocument.spreadsheet", "Flat OpenDocument spreadsheet"),
        .. Document(".key", "application/vnd.apple.keynote", "Keynote presentation"),
        .. Document(".pages", "application/vnd.apple.pages", "Pages document"),
        .. Document(".numbers", "application/vnd.apple.numbers", "Numbers spreadsheet"),
        .. Document(".rtf", "application/rtf", "Rich Text document"),
        .. Document(".txt", "text/plain", "Plain-text document"),
        .. Document(".md", "text/markdown", "Markdown document"),
        .. Document(".csv", "text/csv", "Comma-separated values"),
        .. Document(".tsv", "text/tab-separated-values", "Tab-separated values")
    ];

    private static readonly IReadOnlyDictionary<string, MediaFormatDefinition> ByExtension =
        Definitions.ToDictionary(value => value.Extension, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyList<MediaFormatDefinition> All => Definitions;

    public static IReadOnlyList<string> SupportedExtensions => ByExtension.Keys.Order(StringComparer.OrdinalIgnoreCase).ToList();

    public static string BrowserAccept =>
        "video/*,audio/*,image/*," + string.Join(',', Definitions.Where(value => value.Family == "document").Select(value => value.Extension));

    public static bool IsSupported(string? extension) =>
        !string.IsNullOrWhiteSpace(extension) && ByExtension.ContainsKey(Normalize(extension));

    public static bool IsVideo(string? extension, string? contentType = null) =>
        Family(extension, contentType) == "video";

    public static bool IsAudio(string? extension, string? contentType = null) =>
        Family(extension, contentType) == "audio";

    public static bool IsImage(string? extension, string? contentType = null) =>
        Family(extension, contentType) == "image";

    public static bool IsDocument(string? extension, string? contentType = null) =>
        Family(extension, contentType) == "document";

    public static bool IsConvertibleDocument(string? extension) => IsDocument(extension);

    public static bool IsDirectLinkable(string? extension) =>
        IsVideo(extension) || IsAudio(extension) || IsImage(extension);

    public static string ContentType(string? extension) =>
        extension is not null && ByExtension.TryGetValue(Normalize(extension), out var value)
            ? value.ContentType
            : "application/octet-stream";

    public static string Family(string? extension, string? contentType = null)
    {
        if (extension is not null && ByExtension.TryGetValue(Normalize(extension), out var value)) return value.Family;
        if (contentType?.StartsWith("video/", StringComparison.OrdinalIgnoreCase) == true) return "video";
        if (contentType?.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) == true) return "audio";
        if (contentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) == true) return "image";
        return "document";
    }

    public static string Converter(string? extension) =>
        extension is not null && ByExtension.TryGetValue(Normalize(extension), out var value)
            ? value.Converter
            : "none";

    public static string Normalize(string extension) =>
        extension.StartsWith(".", StringComparison.Ordinal) ? extension.ToLowerInvariant() : $".{extension.ToLowerInvariant()}";

    private static MediaFormatDefinition[] Video(string extension, string contentType, string label) =>
        [new(extension, "video", contentType, "FFmpeg", label)];

    private static MediaFormatDefinition[] Audio(string extension, string contentType, string label) =>
        [new(extension, "audio", contentType, "FFmpeg", label)];

    private static MediaFormatDefinition[] Image(string extension, string contentType, string label) =>
        [new(extension, "image", contentType, "FFmpeg", label)];

    private static MediaFormatDefinition[] Document(string extension, string contentType, string label,
        string converter = "LibreOffice") =>
        [new(extension, "document", contentType, converter, label)];

    private static MediaFormatDefinition[] OleDocument(string extension, string contentType, string label) =>
        [new(extension, "document", contentType, "LibreOffice", label)];
}
