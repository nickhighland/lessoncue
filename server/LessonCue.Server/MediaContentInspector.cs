using System.IO.Compression;
using System.Text;

namespace LessonCue.Server;

public sealed record MediaContentInspection(bool Valid, string ContentType, string? Error);

public static class MediaContentInspector
{
    private static readonly byte[] Asf =
        [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c];
    private static readonly byte[] Ole =
        [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

    public static MediaContentInspection Inspect(string path, string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
                64 * 1024, FileOptions.SequentialScan);
            return Inspect(stream, extension);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException)
        {
            return Reject(extension, $"LessonCue could not safely inspect this file: {error.Message}");
        }
    }

    public static MediaContentInspection Inspect(Stream stream, string extension)
    {
        extension = extension.ToLowerInvariant();
        if (!stream.CanRead) return Reject(extension, "The uploaded file cannot be read.");
        if (!stream.CanSeek) return Reject(extension, "The uploaded file must be seekable for content validation.");
        if (stream.Length < 2) return Reject(extension, "The uploaded file is empty or truncated.");

        Span<byte> header = stackalloc byte[64];
        stream.Position = 0;
        var read = stream.Read(header);
        header = header[..read];
        stream.Position = 0;

        var valid = extension switch
        {
            ".jpg" or ".jpeg" => Starts(header, [0xff, 0xd8, 0xff]),
            ".png" => Starts(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            ".webp" => TextAt(header, 0, "RIFF") && TextAt(header, 8, "WEBP"),
            ".wav" => TextAt(header, 0, "RIFF") && TextAt(header, 8, "WAVE"),
            ".avi" => TextAt(header, 0, "RIFF") && TextAt(header, 8, "AVI "),
            ".mp3" => TextAt(header, 0, "ID3") || MpegAudioFrame(header),
            ".aac" => TextAt(header, 0, "ADIF") || AacFrame(header),
            ".mp4" or ".m4v" or ".mov" or ".f4v" or ".m4a" or ".3gp" or ".3g2" =>
                IsoBaseMedia(header),
            ".mkv" or ".webm" => Starts(header, [0x1a, 0x45, 0xdf, 0xa3]),
            ".wmv" or ".asf" => Starts(header, Asf),
            ".mpeg" or ".mpg" or ".mpe" or ".vob" => MpegProgramOrElementary(header),
            ".ts" or ".mts" or ".m2ts" => TransportStream(stream),
            ".flv" => TextAt(header, 0, "FLV"),
            ".ogv" => TextAt(header, 0, "OggS"),
            ".pdf" => TextAt(header, 0, "%PDF-"),
            ".ppt" or ".pps" or ".pot" or ".doc" => Starts(header, Ole),
            ".pptx" or ".ppsx" or ".potx" or ".docx" or ".odp" or ".key" =>
                ExpectedZipPackage(stream, extension),
            _ => false
        };

        return valid
            ? new MediaContentInspection(true, ContentType(extension), null)
            : Reject(extension,
                $"The contents do not match the {extension.TrimStart('.').ToUpperInvariant()} file type. The upload may be mislabeled, damaged, or unsafe.");
    }

    public static void RequireValid(string path, string fileName)
    {
        var result = Inspect(path, fileName);
        if (!result.Valid) throw new InvalidDataException(result.Error);
    }

    public static string ContentType(string extension) => extension.ToLowerInvariant() switch
    {
        ".mp4" or ".m4v" or ".mov" or ".f4v" => "video/mp4",
        ".mkv" => "video/x-matroska", ".webm" => "video/webm", ".avi" => "video/x-msvideo",
        ".wmv" or ".asf" => "video/x-ms-wmv", ".mpeg" or ".mpg" or ".mpe" or ".vob" => "video/mpeg",
        ".ts" or ".mts" or ".m2ts" => "video/mp2t", ".flv" => "video/x-flv", ".ogv" => "video/ogg",
        ".3gp" or ".3g2" => "video/3gpp", ".mp3" => "audio/mpeg", ".m4a" => "audio/mp4",
        ".aac" => "audio/aac", ".wav" => "audio/wav", ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png", ".webp" => "image/webp", ".pdf" => "application/pdf",
        ".ppt" or ".pps" or ".pot" => "application/vnd.ms-powerpoint",
        ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".ppsx" => "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
        ".potx" => "application/vnd.openxmlformats-officedocument.presentationml.template",
        ".odp" => "application/vnd.oasis.opendocument.presentation",
        ".key" => "application/vnd.apple.keynote",
        ".doc" => "application/msword",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        _ => "application/octet-stream"
    };

    private static bool ExpectedZipPackage(Stream stream, string extension)
    {
        if (stream.Length > int.MaxValue && !stream.CanSeek) return false;
        try
        {
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);
            if (archive.Entries.Count is 0 or > 100_000) return false;
            var names = archive.Entries.Select(entry => entry.FullName.Replace('\\', '/'))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (names.Any(name => name.StartsWith("/", StringComparison.Ordinal) ||
                name.Split('/', StringSplitOptions.RemoveEmptyEntries).Contains("..")))
                return false;
            return extension switch
            {
                ".pptx" or ".ppsx" or ".potx" =>
                    names.Contains("[Content_Types].xml") && names.Contains("ppt/presentation.xml"),
                ".docx" => names.Contains("[Content_Types].xml") && names.Contains("word/document.xml"),
                ".odp" => names.Contains("META-INF/manifest.xml") && names.Contains("content.xml"),
                ".key" => names.Contains("Index/Document.iwa") ||
                    names.Contains("index.apxl") || names.Contains("index.xml"),
                _ => false
            };
        }
        catch (InvalidDataException)
        {
            return false;
        }
        finally
        {
            stream.Position = 0;
        }
    }

    private static bool TransportStream(Stream stream)
    {
        Span<byte> sample = stackalloc byte[389];
        stream.Position = 0;
        var read = stream.Read(sample);
        stream.Position = 0;
        if (read < 1) return false;
        if (sample[0] == 0x47)
            return read <= 188 || sample[188] == 0x47 || (read > 376 && sample[376] == 0x47);
        return read > 196 && sample[4] == 0x47 && sample[196] == 0x47;
    }

    private static bool IsoBaseMedia(ReadOnlySpan<byte> header)
    {
        if (header.Length < 12) return false;
        for (var offset = 4; offset <= Math.Min(header.Length - 4, 40); offset += 4)
            if (TextAt(header, offset, "ftyp")) return true;
        return false;
    }

    private static bool MpegProgramOrElementary(ReadOnlySpan<byte> header) =>
        Starts(header, [0x00, 0x00, 0x01, 0xba]) ||
        Starts(header, [0x00, 0x00, 0x01, 0xb3]) ||
        Starts(header, [0x00, 0x00, 0x01, 0xe0]);

    private static bool MpegAudioFrame(ReadOnlySpan<byte> header) =>
        header.Length >= 2 && header[0] == 0xff && (header[1] & 0xe0) == 0xe0;

    private static bool AacFrame(ReadOnlySpan<byte> header) =>
        header.Length >= 2 && header[0] == 0xff && (header[1] & 0xf6) == 0xf0;

    private static bool Starts(ReadOnlySpan<byte> value, ReadOnlySpan<byte> prefix) =>
        value.Length >= prefix.Length && value[..prefix.Length].SequenceEqual(prefix);

    private static bool TextAt(ReadOnlySpan<byte> value, int offset, string text)
    {
        var expected = Encoding.ASCII.GetBytes(text);
        return offset >= 0 && value.Length >= offset + expected.Length &&
            value.Slice(offset, expected.Length).SequenceEqual(expected);
    }

    private static MediaContentInspection Reject(string extension, string error) =>
        new(false, ContentType(extension), error);
}
