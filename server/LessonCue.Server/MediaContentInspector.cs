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
        var extension = MediaFormatCatalog.Normalize(Path.GetExtension(fileName));
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
        extension = MediaFormatCatalog.Normalize(extension);
        if (!stream.CanRead) return Reject(extension, "The uploaded file cannot be read.");
        if (!stream.CanSeek) return Reject(extension, "The uploaded file must be seekable for content validation.");
        if (stream.Length < 2) return Reject(extension, "The uploaded file is empty or truncated.");
        if (!MediaFormatCatalog.IsSupported(extension))
            return Reject(extension, $"The {extension.TrimStart('.').ToUpperInvariant()} file type is not supported.");

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
            ".gif" => TextAt(header, 0, "GIF87a") || TextAt(header, 0, "GIF89a"),
            ".bmp" => TextAt(header, 0, "BM"),
            ".tif" or ".tiff" => Tiff(header),
            ".avif" => IsoBaseMedia(header, "avif", "avis"),
            ".heic" or ".heif" => IsoBaseMedia(header, "heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"),
            ".jxl" => (Starts(header, [0xff, 0x0a]) || TextAt(header, 4, "JXL ")),
            ".ico" => Starts(header, [0x00, 0x00, 0x01, 0x00]),
            ".jp2" or ".jpf" or ".jpm" => Starts(header, [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a]),
            ".j2k" => Starts(header, [0xff, 0x4f, 0xff, 0x51]),
            ".mj2" => IsoBaseMedia(header),
            ".wav" => TextAt(header, 0, "RIFF") && TextAt(header, 8, "WAVE"),
            ".avi" => TextAt(header, 0, "RIFF") && TextAt(header, 8, "AVI "),
            ".mp3" or ".mp2" or ".mpa" => TextAt(header, 0, "ID3") || MpegAudioFrame(header),
            ".aac" => TextAt(header, 0, "ADIF") || AacFrame(header),
            ".flac" => TextAt(header, 0, "fLaC"),
            ".ogg" or ".oga" or ".opus" or ".spx" => TextAt(header, 0, "OggS"),
            ".aiff" or ".aif" or ".aifc" => TextAt(header, 0, "FORM") &&
                (TextAt(header, 8, "AIFF") || TextAt(header, 8, "AIFC")),
            ".amr" => TextAt(header, 0, "#!AMR"),
            ".ac3" or ".eac3" => Starts(header, [0x0b, 0x77]),
            ".au" or ".snd" => TextAt(header, 0, ".snd"),
            ".caf" => TextAt(header, 0, "caff"),
            ".mka" => Starts(header, [0x1a, 0x45, 0xdf, 0xa3]),
            ".ape" => TextAt(header, 0, "MAC "),
            ".wv" => TextAt(header, 0, "wvpk"),
            ".tta" => TextAt(header, 0, "TTA1") || TextAt(header, 0, "TTA2"),
            ".voc" => TextAt(header, 0, "Creative Voice File"),
            ".mp4" or ".m4v" or ".mov" or ".f4v" or ".m4a" or ".3gp" or ".3gpp" or ".3g2" or ".3gpp2" =>
                IsoBaseMedia(header),
            ".mkv" or ".webm" => Starts(header, [0x1a, 0x45, 0xdf, 0xa3]),
            ".rm" or ".rmvb" => Starts(header, [0x2e, 0x7b, 0x52, 0x4d, 0x46]),
            ".wmv" or ".asf" => Starts(header, Asf),
            ".mpeg" or ".mpg" or ".mpe" or ".m1v" or ".m2v" or ".vob" => MpegProgramOrElementary(header),
            ".ts" or ".mts" or ".m2ts" => TransportStream(stream),
            ".mxf" => Mxf(header),
            ".nut" => TextAt(header, 0, "nut/multimedia container"),
            ".ivf" => TextAt(header, 0, "DKIF"),
            ".y4m" => TextAt(header, 0, "YUV4MPEG2"),
            ".h264" or ".264" or ".h265" or ".hevc" or ".265" => H26xElementary(header),
            ".mjpeg" or ".mjpg" => Starts(header, [0xff, 0xd8, 0xff]),
            ".flv" => TextAt(header, 0, "FLV"),
            ".ogv" or ".ogm" => TextAt(header, 0, "OggS"),
            ".pdf" => TextAt(header, 0, "%PDF-"),
            ".ppt" or ".pps" or ".pot" or ".doc" or ".dot" or ".xls" or ".xlt" or ".xla" => Starts(header, Ole),
            ".rtf" => TextAt(header, 0, "{\\rtf"),
            ".txt" or ".md" or ".csv" or ".tsv" => TextDocument(stream),
            ".pptx" or ".ppsx" or ".potx" or ".pptm" or ".ppsm" or ".potm" or
                ".docx" or ".docm" or ".dotx" or ".dotm" or
                ".xlsx" or ".xlsm" or ".xltx" or ".xltm" or ".xlam" or
                ".odp" or ".otp" or ".odt" or ".ott" or ".ods" or ".ots" or
                ".fodp" or ".fodt" or ".fods" or ".key" or ".pages" or ".numbers" =>
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

    public static string ContentType(string extension) => MediaFormatCatalog.ContentType(extension);

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
                ".pptx" or ".ppsx" or ".potx" or ".pptm" or ".ppsm" or ".potm" =>
                    names.Contains("[Content_Types].xml") && names.Contains("ppt/presentation.xml"),
                ".docx" or ".docm" or ".dotx" or ".dotm" => names.Contains("[Content_Types].xml") && names.Contains("word/document.xml"),
                ".xlsx" or ".xlsm" or ".xltx" or ".xltm" or ".xlam" => names.Contains("[Content_Types].xml") &&
                    (names.Contains("xl/workbook.xml") || names.Contains("xl/workbook.bin")),
                ".odp" or ".otp" or ".odt" or ".ott" or ".ods" or ".ots" or ".fodp" or ".fodt" or ".fods" =>
                    names.Contains("META-INF/manifest.xml") && names.Contains("content.xml"),
                ".key" or ".pages" or ".numbers" => names.Contains("Index/Document.iwa") ||
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

    private static bool IsoBaseMedia(ReadOnlySpan<byte> header, params string[] brands)
    {
        if (header.Length < 12) return false;
        for (var offset = 4; offset <= Math.Min(header.Length - 4, 40); offset += 4)
        {
            if (!TextAt(header, offset, "ftyp")) continue;
            if (brands.Length == 0) return true;
            var brandOffset = offset + 4;
            foreach (var brand in brands)
            {
                if (TextAt(header, brandOffset, brand)) return true;
                for (var index = 0; index < 8; index++)
                    if (TextAt(header, brandOffset + index * 4, brand)) return true;
            }
            return false;
        }
        return false;
    }

    private static bool Tiff(ReadOnlySpan<byte> header) =>
        Starts(header, [0x49, 0x49, 0x2a, 0x00]) || Starts(header, [0x4d, 0x4d, 0x00, 0x2a]);

    private static bool Mxf(ReadOnlySpan<byte> header) =>
        Starts(header, [0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01]);

    private static bool H26xElementary(ReadOnlySpan<byte> header) =>
        Starts(header, [0x00, 0x00, 0x01]) || Starts(header, [0x00, 0x00, 0x00, 0x01]);

    private static bool TextDocument(Stream stream)
    {
        stream.Position = 0;
        var sample = new byte[(int)Math.Min(64 * 1024, stream.Length)];
        var read = stream.Read(sample);
        stream.Position = 0;
        if (read == 0) return false;
        if (sample.Take(read).Any(value => value == 0)) return false;
        try
        {
            _ = System.Text.Encoding.UTF8.GetString(sample, 0, read);
            return true;
        }
        catch (DecoderFallbackException) { return false; }
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
