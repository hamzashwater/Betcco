using System.IO.Compression;
using System.Text;
using Betcco.Application.Common;

namespace Betcco.UnitTests;

public sealed class FileUploadValidationTests
{
    [Fact]
    public void Accepts_a_real_pdf_and_returns_server_detected_content_type()
    {
        using var stream = new MemoryStream(Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj"));

        var accepted = FileUploadValidation.TryValidate(stream, "submission.pdf", out var result);

        Assert.True(accepted);
        Assert.Equal("application/pdf", result.DetectedContentType);
        Assert.Equal(0, stream.Position);
    }

    [Fact]
    public void Rejects_an_extension_that_does_not_match_the_file_signature()
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("this is plain text, not a PDF"));

        var accepted = FileUploadValidation.TryValidate(stream, "disguised.pdf", out var result);

        Assert.False(accepted);
        Assert.Equal("UPLOAD_FILE_SIGNATURE_INVALID", result.ErrorCode);
    }

    [Fact]
    public void Accepts_a_well_formed_office_document_archive()
    {
        using var stream = OfficeDocument("word/document.xml");

        var accepted = FileUploadValidation.TryValidate(stream, "coursework.docx", out var result);

        Assert.True(accepted);
        Assert.Equal("application/vnd.openxmlformats-officedocument.wordprocessingml.document", result.DetectedContentType);
    }

    [Fact]
    public void Rejects_an_archive_with_an_executable_entry()
    {
        using var stream = Archive("payload.exe");

        var accepted = FileUploadValidation.TryValidate(stream, "evidence.zip", out var result);

        Assert.False(accepted);
        Assert.Equal("UPLOAD_ARCHIVE_ENTRY_INVALID", result.ErrorCode);
    }

    [Fact]
    public void Accepts_structured_mp4_and_webm_headers_without_trusting_the_browser_type()
    {
        using var mp4 = new MemoryStream([
            0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D, 0, 0, 0, 0,
            0, 0, 0, 8, 0x6D, 0x64, 0x61, 0x74
        ]);
        using var webm = new MemoryStream([
            0x1A, 0x45, 0xDF, 0xA3, 0x8B, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D,
            0x18, 0x53, 0x80, 0x67, 0x80
        ]);

        Assert.True(FileUploadValidation.TryValidate(mp4, "lesson.mp4", out var mp4Result));
        Assert.Equal("video/mp4", mp4Result.DetectedContentType);
        Assert.True(FileUploadValidation.TryValidate(webm, "lesson.webm", out var webmResult));
        Assert.Equal("video/webm", webmResult.DetectedContentType);
    }

    [Theory]
    [InlineData("spoof.mp4", new byte[] { 0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D })]
    [InlineData("spoof.webm", new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0x81, 0x00 })]
    [InlineData("wrong.mp4", new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0x81, 0x00 })]
    public void Rejects_truncated_or_spoofed_video_headers(string fileName, byte[] content)
    {
        using var stream = new MemoryStream(content);
        Assert.False(FileUploadValidation.TryValidate(stream, fileName, out var result));
        Assert.Equal("UPLOAD_FILE_SIGNATURE_INVALID", result.ErrorCode);
    }

    private static MemoryStream OfficeDocument(string officeEntry)
    {
        var stream = Archive("[Content_Types].xml", officeEntry);
        stream.Position = 0;
        return stream;
    }

    private static MemoryStream Archive(params string[] entryNames)
    {
        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var name in entryNames)
            {
                var entry = archive.CreateEntry(name);
                using var writer = new StreamWriter(entry.Open());
                writer.Write("safe test content");
            }
        }
        stream.Position = 0;
        return stream;
    }
}
