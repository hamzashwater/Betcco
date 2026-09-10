using System.Security.Claims;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

/// <summary>
/// Staff create and release a private portability export; only its verified
/// subject can download it through this authenticated endpoint before expiry.
/// No public or storage-provider URL is ever returned.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/privacy/portability")]
public sealed class PrivacyPortabilityController(IDataPortabilityExportService exports) : ControllerBase
{
    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/generate")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Generate(Guid requestId, CancellationToken cancellationToken)
    {
        var result = await exports.GenerateAsync(requestId, UserId, cancellationToken);
        return result.Export is null || result.Export.Status == DataPortabilityExportStatus.GenerationFailed
            ? Conflict(new { code = result.FailureCode, message = result.FailureMessage })
            : Ok(ToView(result.Export));
    }

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPost("requests/{requestId:guid}/release")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Release(Guid requestId, CancellationToken cancellationToken)
    {
        var result = await exports.ReleaseAsync(requestId, UserId, cancellationToken);
        return result.Export is null
            ? Conflict(new { code = result.FailureCode, message = result.FailureMessage })
            : Ok(ToView(result.Export));
    }

    [HttpGet("requests/{requestId:guid}/download")]
    public async Task<IActionResult> Download(Guid requestId, CancellationToken cancellationToken)
    {
        var result = await exports.OpenForOwnerDownloadAsync(requestId, UserId, cancellationToken);
        return result.Content is null
            ? NotFound()
            : File(result.Content, "application/json", result.FileName, enableRangeProcessing: false);
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static DataPortabilityExportView ToView(DataPortabilityExport export) => new(
        export.Id,
        export.DataSubjectRequestId,
        export.SubjectUserId,
        export.Status,
        export.RequestedAtUtc,
        export.GeneratedAtUtc,
        export.GeneratedByUserId,
        export.ExportFormat,
        export.ExportVersion,
        export.ExpiresAtUtc,
        export.ReleasedAtUtc,
        export.ReleasedByUserId,
        export.DownloadedAtUtc,
        export.DownloadCount,
        export.FailureReason);
}

public sealed record DataPortabilityExportView(Guid Id, Guid DataSubjectRequestId, string SubjectUserId, DataPortabilityExportStatus Status, DateTimeOffset RequestedAtUtc, DateTimeOffset? GeneratedAtUtc, string? GeneratedByUserId, string ExportFormat, string ExportVersion, DateTimeOffset ExpiresAtUtc, DateTimeOffset? ReleasedAtUtc, string? ReleasedByUserId, DateTimeOffset? DownloadedAtUtc, int DownloadCount, string? FailureReason);
