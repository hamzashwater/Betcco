using System.IO.Compression;

namespace Betcco.Application.Common;

/// <summary>
/// Server-side file-type validation for private uploads. Browsers control the
/// supplied extension and Content-Type header, so neither is treated as a
/// source of truth. This validation deliberately runs before malware scanning
/// and before a stream can reach storage.
/// </summary>
public static class FileUploadValidation
{
    private const int PrefixLength = 4_096;
    private const int MaximumArchiveEntries = 1_000;
    private const long MaximumArchiveUncompressedBytes = 500L * 1024 * 1024;
    private const int MaximumArchiveCompressionRatio = 200;

    public static bool TryValidate(
        Stream content,
        string originalFileName,
        out FileUploadValidationResult result)
    {
        if (content is null || !content.CanSeek)
        {
            result = FileUploadValidationResult.Reject("UPLOAD_STREAM_UNSEEKABLE");
            return false;
        }

        var extension = Path.GetExtension(originalFileName)?.Trim().ToLowerInvariant();
        var originalPosition = content.Position;
        try
        {
            content.Position = 0;
            var prefix = ReadPrefix(content);
            result = extension switch
            {
                ".pdf" when StartsWith(prefix, 0x25, 0x50, 0x44, 0x46, 0x2D) => FileUploadValidationResult.Accept("application/pdf"),
                ".png" when StartsWith(prefix, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) => FileUploadValidationResult.Accept("image/png"),
                ".jpg" or ".jpeg" when StartsWith(prefix, 0xFF, 0xD8, 0xFF) => FileUploadValidationResult.Accept("image/jpeg"),
                ".webp" when IsWebp(prefix) => FileUploadValidationResult.Accept("image/webp"),
                ".mp4" when IsMp4(prefix) => FileUploadValidationResult.Accept("video/mp4"),
                ".webm" when IsWebm(prefix) => FileUploadValidationResult.Accept("video/webm"),
                ".txt" when IsPlainText(prefix) => FileUploadValidationResult.Accept("text/plain"),
                ".zip" or ".docx" or ".xlsx" or ".pptx" => ValidateZip(content, extension),
                _ => FileUploadValidationResult.Reject("UPLOAD_FILE_SIGNATURE_INVALID")
            };
            return result.IsValid;
        }
        catch (InvalidDataException)
        {
            result = FileUploadValidationResult.Reject("UPLOAD_ARCHIVE_INVALID");
            return false;
        }
        finally
        {
            content.Position = originalPosition;
        }
    }

    private static FileUploadValidationResult ValidateZip(Stream content, string extension)
    {
        content.Position = 0;
        using var archive = new ZipArchive(content, ZipArchiveMode.Read, leaveOpen: true);
        if (archive.Entries.Count is 0 or > MaximumArchiveEntries)
            return FileUploadValidationResult.Reject("UPLOAD_ARCHIVE_ENTRY_COUNT_INVALID");

        var totalUncompressedBytes = 0L;
        var hasContentTypes = false;
        var hasExpectedOfficeFolder = extension is ".zip";
        foreach (var entry in archive.Entries)
        {
            var name = entry.FullName.Replace('\\', '/');
            if (name.StartsWith("/", StringComparison.Ordinal)
                || name.Split('/', StringSplitOptions.RemoveEmptyEntries).Any(part => part is "." or "..")
                || HasExecutableExtension(name))
                return FileUploadValidationResult.Reject("UPLOAD_ARCHIVE_ENTRY_INVALID");

            if (entry.Length > MaximumArchiveUncompressedBytes - totalUncompressedBytes)
                return FileUploadValidationResult.Reject("UPLOAD_ARCHIVE_UNCOMPRESSED_SIZE_INVALID");
            totalUncompressedBytes += entry.Length;

            if (entry.Length > 0
                && (entry.CompressedLength <= 0
                    || entry.Length / Math.Max(1, entry.CompressedLength) > MaximumArchiveCompressionRatio))
                return FileUploadValidationResult.Reject("UPLOAD_ARCHIVE_COMPRESSION_RATIO_INVALID");

            hasContentTypes |= string.Equals(name, "[Content_Types].xml", StringComparison.OrdinalIgnoreCase);
            hasExpectedOfficeFolder |= extension switch
            {
                ".docx" => name.StartsWith("word/", StringComparison.OrdinalIgnoreCase),
                ".xlsx" => name.StartsWith("xl/", StringComparison.OrdinalIgnoreCase),
                ".pptx" => name.StartsWith("ppt/", StringComparison.OrdinalIgnoreCase),
                _ => false
            };
        }

        if (extension is not ".zip" && (!hasContentTypes || !hasExpectedOfficeFolder))
            return FileUploadValidationResult.Reject("UPLOAD_OFFICE_DOCUMENT_INVALID");

        return FileUploadValidationResult.Accept(extension switch
        {
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            _ => "application/zip"
        });
    }

    private static byte[] ReadPrefix(Stream content)
    {
        var buffer = new byte[PrefixLength];
        var totalRead = 0;
        while (totalRead < buffer.Length)
        {
            var read = content.Read(buffer, totalRead, buffer.Length - totalRead);
            if (read == 0) break;
            totalRead += read;
        }
        return totalRead == buffer.Length ? buffer : buffer[..totalRead];
    }

    private static bool StartsWith(IReadOnlyList<byte> bytes, params byte[] signature) =>
        bytes.Count >= signature.Length && signature.Select((value, index) => value == bytes[index]).All(match => match);

    private static bool IsWebp(IReadOnlyList<byte> bytes) =>
        StartsWith(bytes, 0x52, 0x49, 0x46, 0x46)
        && bytes.Count >= 12
        && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50;

    private static bool IsMp4(IReadOnlyList<byte> bytes)
    {
        if (bytes.Count < 24 || !StartsWithAt(bytes, 4, "ftyp"u8)) return false;
        var brand = System.Text.Encoding.ASCII.GetString(bytes.Skip(8).Take(4).ToArray());
        if (brand is not ("isom" or "iso2" or "iso4" or "iso5" or "iso6" or "mp41" or "mp42" or "avc1" or "M4V " or "dash")) return false;
        var ftypSize = ReadBigEndianUInt32(bytes, 0);
        if (ftypSize < 16 || ftypSize > (uint)(bytes.Count - 8)) return false;
        var nextOffset = (int)ftypSize;
        var nextSize = ReadBigEndianUInt32(bytes, nextOffset);
        return nextSize >= 8 && (StartsWithAt(bytes, nextOffset + 4, "moov"u8)
            || StartsWithAt(bytes, nextOffset + 4, "mdat"u8)
            || StartsWithAt(bytes, nextOffset + 4, "free"u8)
            || StartsWithAt(bytes, nextOffset + 4, "wide"u8)
            || StartsWithAt(bytes, nextOffset + 4, "sidx"u8));
    }

    private static bool IsWebm(IReadOnlyList<byte> bytes) =>
        StartsWith(bytes, 0x1A, 0x45, 0xDF, 0xA3)
        && ContainsSequence(bytes, [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D])
        && ContainsSequence(bytes, [0x18, 0x53, 0x80, 0x67]);

    private static bool StartsWithAt(IReadOnlyList<byte> bytes, int offset, ReadOnlySpan<byte> expected)
    {
        if (offset < 0 || bytes.Count - offset < expected.Length) return false;
        for (var index = 0; index < expected.Length; index++)
            if (bytes[offset + index] != expected[index]) return false;
        return true;
    }

    private static uint ReadBigEndianUInt32(IReadOnlyList<byte> bytes, int offset) =>
        ((uint)bytes[offset] << 24) | ((uint)bytes[offset + 1] << 16) | ((uint)bytes[offset + 2] << 8) | bytes[offset + 3];

    private static bool ContainsSequence(IReadOnlyList<byte> bytes, byte[] expected)
    {
        for (var offset = 0; offset <= bytes.Count - expected.Length; offset++)
            if (expected.Select((value, index) => bytes[offset + index] == value).All(match => match)) return true;
        return false;
    }

    private static bool IsPlainText(IReadOnlyList<byte> bytes) => !bytes.Contains((byte)0);

    private static bool HasExecutableExtension(string entryName) =>
        Path.GetExtension(entryName) is ".bat" or ".cmd" or ".com" or ".dll" or ".exe" or ".js" or ".jse" or ".msi" or ".ps1" or ".scr" or ".sh" or ".vbs" or ".vbe";
}

public sealed record FileUploadValidationResult(bool IsValid, string? DetectedContentType, string? ErrorCode)
{
    public static FileUploadValidationResult Accept(string contentType) => new(true, contentType, null);
    public static FileUploadValidationResult Reject(string errorCode) => new(false, null, errorCode);
}
