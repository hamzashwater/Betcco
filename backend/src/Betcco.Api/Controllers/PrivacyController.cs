using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

/// <summary>
/// Authenticated privacy-rights workflow. It records a request and its human
/// review; it intentionally never performs irreversible erasure or exports
/// personal data directly from a browser request.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/privacy")]
public sealed class PrivacyController(BetccoDbContext db) : ControllerBase
{
    [HttpGet("requests")]
    public async Task<IActionResult> ListMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (!IsBoundedPage(page, pageSize)) return BadRequest(new { code = "PRIVACY_PAGE_INVALID", message = "Use a page size between 1 and 50." });
        var query = db.DataSubjectRequests.AsNoTracking().Where(item => item.OwnerUserId == UserId);
        return Ok(await ToPageAsync(query, page, pageSize, cancellationToken));
    }

    [HttpGet("requests/{requestId:guid}")]
    public async Task<IActionResult> GetMine(Guid requestId, CancellationToken cancellationToken)
    {
        var item = await db.DataSubjectRequests.AsNoTracking()
            .SingleOrDefaultAsync(request => request.Id == requestId && request.OwnerUserId == UserId, cancellationToken);
        return item is null ? NotFound() : Ok(ToView(item));
    }

    [HttpGet("consents")]
    public async Task<IActionResult> ListMyConsentHistory(CancellationToken cancellationToken)
    {
        var items = await db.ConsentRecords.AsNoTracking()
            .Where(item => item.UserId == UserId)
            .OrderByDescending(item => item.CreatedAtUtc)
            .Select(item => new ConsentRecordView(item.Purpose, item.Decision, item.PolicyVersion, item.CaptureMethod, item.CreatedAtUtc))
            .ToListAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPost("requests")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Create(CreateDataSubjectRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(request.RequestType))
            return BadRequest(new { code = "PRIVACY_REQUEST_TYPE_INVALID", message = "Select a valid privacy request type." });
        if (!IsOptionalText(request.Description, 2_000))
            return BadRequest(new { code = "PRIVACY_DESCRIPTION_INVALID", message = "Keep the request details to 2000 characters or fewer." });

        var hasOpenDuplicate = await db.DataSubjectRequests.AnyAsync(item =>
            item.OwnerUserId == UserId && item.RequestType == request.RequestType &&
            (item.Status == DataSubjectRequestStatus.Submitted ||
             item.Status == DataSubjectRequestStatus.IdentityVerificationRequired ||
             item.Status == DataSubjectRequestStatus.InReview),
            cancellationToken);
        if (hasOpenDuplicate)
            return Conflict(new { code = "PRIVACY_REQUEST_ALREADY_OPEN", message = "An open request of this type already exists. Track or cancel it before submitting another." });

        var item = new DataSubjectRequest
        {
            OwnerUserId = UserId,
            RequestType = request.RequestType,
            Description = request.Description?.Trim()
        };
        db.DataSubjectRequests.Add(item);
        Audit("PrivacyRequestCreated", item, new { requestType = item.RequestType.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetMine), new { requestId = item.Id }, ToView(item));
    }

    [HttpPost("requests/{requestId:guid}/cancel")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Cancel(Guid requestId, CancelDataSubjectRequest request, CancellationToken cancellationToken)
    {
        if (!IsOptionalText(request.Reason, 500))
            return BadRequest(new { code = "PRIVACY_CANCELLATION_INVALID", message = "Keep the cancellation reason to 500 characters or fewer." });
        var item = await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == requestId && item.OwnerUserId == UserId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status is DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected or DataSubjectRequestStatus.Cancelled)
            return Conflict(new { code = "PRIVACY_REQUEST_FINAL", message = "This privacy request is already final and cannot be cancelled." });

        item.Status = DataSubjectRequestStatus.Cancelled;
        item.ResolutionSummary = request.Reason?.Trim();
        item.ResolvedAtUtc = DateTimeOffset.UtcNow;
        Audit("PrivacyRequestCancelledByOwner", item, new { requestType = item.RequestType.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpGet("admin/requests")]
    public async Task<IActionResult> ListForReview(
        [FromQuery] DataSubjectRequestStatus? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        if (!IsBoundedPage(page, pageSize)) return BadRequest(new { code = "PRIVACY_PAGE_INVALID", message = "Use a page size between 1 and 50." });
        if (status.HasValue && !Enum.IsDefined(status.Value)) return BadRequest(new { code = "PRIVACY_STATUS_INVALID", message = "Select a valid privacy request status." });
        var query = db.DataSubjectRequests.AsNoTracking();
        if (status.HasValue) query = query.Where(item => item.Status == status.Value);
        var result = await ToPageAsync(query, page, pageSize, cancellationToken);
        Audit("PrivacyRequestAdminListRead", null, new
        {
            authorizationPolicy = "PrivacyAdmin",
            readScope = "admin-request-list",
            status = status?.ToString(),
            page,
            pageSize,
            resultCount = result.Items.Count
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(result);
    }

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpGet("admin/requests/{requestId:guid}")]
    public async Task<IActionResult> GetForReview(Guid requestId, CancellationToken cancellationToken)
    {
        var item = await db.DataSubjectRequests.AsNoTracking().SingleOrDefaultAsync(item => item.Id == requestId, cancellationToken);
        if (item is null) return NotFound();
        Audit("PrivacyRequestAdminDetailRead", item, new
        {
            authorizationPolicy = "PrivacyAdmin",
            requestType = item.RequestType.ToString(),
            status = item.Status.ToString()
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item));
    }

    [Authorize(Policy = "PrivacyAdmin")]
    [HttpPut("admin/requests/{requestId:guid}")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Review(Guid requestId, ReviewDataSubjectRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(request.Status) || !IsValidStaffTransition(request.Status))
            return BadRequest(new { code = "PRIVACY_STATUS_INVALID", message = "Select a valid review status." });
        if (!IsOptionalText(request.ResolutionSummary, 2_000))
            return BadRequest(new { code = "PRIVACY_RESOLUTION_INVALID", message = "Keep the review note to 2000 characters or fewer." });
        if (request.Status is DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected && string.IsNullOrWhiteSpace(request.ResolutionSummary))
            return BadRequest(new { code = "PRIVACY_RESOLUTION_REQUIRED", message = "A resolution summary is required before a request is final." });

        var item = await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == requestId, cancellationToken);
        if (item is null) return NotFound();
        if (item.Status is DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected or DataSubjectRequestStatus.Cancelled)
            return Conflict(new { code = "PRIVACY_REQUEST_FINAL", message = "A final privacy request cannot be changed." });
        if (!CanTransition(item.Status, request.Status))
            return Conflict(new { code = "PRIVACY_TRANSITION_INVALID", message = "That privacy-request transition is not allowed." });
        if (request.Status == DataSubjectRequestStatus.Completed
            && item.IdentityVerifiedAtUtc is null
            && !request.MarkIdentityVerified)
            return Conflict(new { code = "PRIVACY_IDENTITY_VERIFICATION_REQUIRED", message = "Verify the requester's identity before completing this privacy request." });
        if (request.Status == DataSubjectRequestStatus.Completed && RequiresFulfillmentEvidence(item.RequestType))
        {
            var fulfillment = await db.DataSubjectFulfillments.AsNoTracking()
                .SingleOrDefaultAsync(fulfillment => fulfillment.DataSubjectRequestId == item.Id, cancellationToken);
            if (!HasCompletionEvidence(item.RequestType, fulfillment))
                return Conflict(new { code = "PRIVACY_FULFILLMENT_EVIDENCE_REQUIRED", message = "Record the required controlled fulfillment evidence before completing this privacy request." });
        }

        item.Status = request.Status;
        item.AssignedToUserId = UserId;
        item.ResolutionSummary = request.ResolutionSummary?.Trim();
        if (request.MarkIdentityVerified && item.IdentityVerifiedAtUtc is null)
        {
            item.IdentityVerifiedAtUtc = DateTimeOffset.UtcNow;
            item.IdentityVerifiedByUserId = UserId;
        }
        if (request.Status is DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected)
            item.ResolvedAtUtc = DateTimeOffset.UtcNow;
        Audit("PrivacyRequestReviewed", item, new { status = item.Status.ToString(), identityVerified = item.IdentityVerifiedAtUtc.HasValue });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(item));
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private void Audit(string action, DataSubjectRequest? item, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = nameof(DataSubjectRequest),
        EntityId = item?.Id.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = "Success"
    });

    private static bool IsBoundedPage(int page, int pageSize) => page >= 1 && pageSize is >= 1 and <= 50;
    private static bool IsOptionalText(string? value, int maximum) => value is null || value.Trim().Length <= maximum;
    private static bool IsValidStaffTransition(DataSubjectRequestStatus value) => value is DataSubjectRequestStatus.IdentityVerificationRequired or DataSubjectRequestStatus.InReview or DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected;
    private static bool CanTransition(DataSubjectRequestStatus current, DataSubjectRequestStatus next) => current switch
    {
        DataSubjectRequestStatus.Submitted => next is DataSubjectRequestStatus.IdentityVerificationRequired or DataSubjectRequestStatus.InReview or DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected,
        DataSubjectRequestStatus.IdentityVerificationRequired => next is DataSubjectRequestStatus.InReview or DataSubjectRequestStatus.Rejected,
        DataSubjectRequestStatus.InReview => next is DataSubjectRequestStatus.IdentityVerificationRequired or DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected,
        _ => false
    };
    private static bool RequiresFulfillmentEvidence(DataSubjectRequestType type) => type is
        DataSubjectRequestType.Access or
        DataSubjectRequestType.Portability or
        DataSubjectRequestType.Rectification or
        DataSubjectRequestType.Restriction or
        DataSubjectRequestType.ErasureOrConcealment or
        DataSubjectRequestType.ObjectionToProfiling or
        DataSubjectRequestType.WithdrawMarketingConsent;
    private static bool HasCompletionEvidence(DataSubjectRequestType type, DataSubjectFulfillment? fulfillment) => fulfillment is not null &&
        (type is DataSubjectRequestType.Access or DataSubjectRequestType.Portability
            ? fulfillment.Status == DataSubjectFulfillmentStatus.Released
            : fulfillment.Status == DataSubjectFulfillmentStatus.Applied);

    private static async Task<PrivacyRequestPage> ToPageAsync(IQueryable<DataSubjectRequest> query, int page, int pageSize, CancellationToken cancellationToken)
    {
        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query.OrderByDescending(item => item.CreatedAtUtc).ThenByDescending(item => item.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return new PrivacyRequestPage(items.Select(ToView).ToArray(), page, pageSize, totalCount);
    }

    private static PrivacyRequestView ToView(DataSubjectRequest item) => new(
        item.Id,
        item.RequestType,
        item.Status,
        item.Description,
        item.ResolutionSummary,
        item.IdentityVerifiedAtUtc,
        item.CreatedAtUtc,
        item.UpdatedAtUtc,
        item.ResolvedAtUtc);
}

public sealed record CreateDataSubjectRequest(DataSubjectRequestType RequestType, [param: StringLength(2_000)] string? Description);
public sealed record CancelDataSubjectRequest([param: StringLength(500)] string? Reason);
public sealed record ReviewDataSubjectRequest(DataSubjectRequestStatus Status, [param: StringLength(2_000)] string? ResolutionSummary, bool MarkIdentityVerified);
public sealed record PrivacyRequestView(Guid Id, DataSubjectRequestType RequestType, DataSubjectRequestStatus Status, string? Description, string? ResolutionSummary, DateTimeOffset? IdentityVerifiedAtUtc, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc, DateTimeOffset? ResolvedAtUtc);
public sealed record PrivacyRequestPage(IReadOnlyCollection<PrivacyRequestView> Items, int Page, int PageSize, int TotalCount);
public sealed record ConsentRecordView(ConsentPurpose Purpose, ConsentDecision Decision, string PolicyVersion, string CaptureMethod, DateTimeOffset RecordedAtUtc);
