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
