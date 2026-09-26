using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Authorization;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/evaluations")]
public sealed class EvaluationsController(IEvaluationService evaluations, ICommerceService commerce, IFileStorage storage, Betcco.Infrastructure.Persistence.BetccoDbContext db,
    IScopedAssessmentService scopedAssessments, IEvaluatorSpecialismService specialisms) : ControllerBase
{
    [Authorize(Policy = "Student")]
    [HttpGet("assessment-scopes")]
    public async Task<IActionResult> AssessmentScopes(CancellationToken cancellationToken) =>
        Ok(await scopedAssessments.ListOptionsAsync(cancellationToken));

    [Authorize(Policy = "Student")]
    [HttpGet("assessment-scopes/{assessmentScopeId:guid}/included-credit")]
    public async Task<IActionResult> IncludedCredit(Guid assessmentScopeId, CancellationToken cancellationToken) =>
        Ok(await commerce.GetIncludedEvaluationCreditStatusAsync(UserId, assessmentScopeId, cancellationToken));

    [Authorize(Policy = "Student")]
    [HttpPost("scoped")]
    public async Task<IActionResult> CreateScoped(ScopedEvaluationCommand command, CancellationToken cancellationToken)
    {
        var request = await scopedAssessments.CreateAsync(UserId, command, cancellationToken);
        return request is null ? BadRequest(new { message = "The selected assessment is no longer available." }) : Ok(request);
    }

    [Authorize(Policy = "Student")]
    [HttpPost]
    // Historic clients only; the Student wizard uses POST /scoped.
    public IActionResult Create() => Conflict(new
    {
        code = "SCOPED_ASSESSMENT_REQUIRED",
        message = "Create a request through a canonical assessment scope."
    });

    [Authorize(Policy = "Student")]
    [HttpPost("{requestId:guid}/files")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(110L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 110L * 1024 * 1024)]
    public async Task<IActionResult> AddFile(Guid requestId, IFormFile file, CancellationToken cancellationToken)
    {
        var allowed = new[] { "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "image/jpeg", "image/png", "image/webp" };
        if (file.Length == 0) return BadRequest(new { message = "This file format is not allowed." });
        if (file.Length > 100L * 1024 * 1024) return BadRequest(new { message = "Each file must be 100MB or smaller." });
        await using var stream = file.OpenReadStream();
        if (!FileUploadValidation.TryValidate(stream, file.FileName, out var validation)
            || validation.DetectedContentType is null
            || !allowed.Contains(validation.DetectedContentType, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "The file content does not match an allowed document, image, or text type." });
        var result = await evaluations.AddFileAsync(UserId, requestId, file.FileName, validation.DetectedContentType, file.Length, stream, cancellationToken);
        return result switch
        {
            EvaluationFileAddStatus.Added => NoContent(),
            EvaluationFileAddStatus.Rejected => BadRequest(new { message = "The file was rejected by the security scanner." }),
            EvaluationFileAddStatus.ScannerUnavailable => StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "File security scanning is temporarily unavailable. Try again later." }),
            _ => NotFound()
        };
    }

    [Authorize(Policy = "Student")]
    [HttpPost("{requestId:guid}/authenticity-declaration")]
    public async Task<IActionResult> DeclareAuthenticity(Guid requestId, CancellationToken cancellationToken)
    {
        var declared = await evaluations.DeclareAuthenticityAsync(
            UserId,
            requestId,
            Request.Headers.AcceptLanguage.ToString(),
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers.UserAgent.ToString(),
            HttpContext.TraceIdentifier,
            cancellationToken);
        return declared
            ? NoContent()
            : BadRequest(new { message = "An originality declaration can only be recorded for your editable assessment." });
    }

    [Authorize(Policy = "Student")]
    [HttpPost("{requestId:guid}/evidence")]
    public async Task<IActionResult> AddEvidence(Guid requestId, AddEvaluationEvidenceRequest request, CancellationToken cancellationToken) => await evaluations.AddEvidenceAsync(UserId, requestId, request.CriterionCode, request.Narrative, cancellationToken) ? NoContent() : BadRequest(new { message = "Evidence must target a valid criterion on an editable evaluation." });

    [Authorize(Policy = "Student")]
    [HttpPost("{requestId:guid}/resubmit")]
    public async Task<IActionResult> Resubmit(Guid requestId, CancellationToken cancellationToken) =>
        await evaluations.ResubmitAsync(UserId, requestId, cancellationToken)
            ? NoContent()
            : BadRequest(new { message = "Add a clean updated file and confirm the revised-work originality declaration before using your revision check." });

    [Authorize(Policy = "CourseReviewer")]
    [HttpPost("{requestId:guid}/assign")]
    public async Task<IActionResult> Assign(Guid requestId, AssignEvaluatorRequest request, CancellationToken cancellationToken)
    {
        var result = await evaluations.AssignWithOutcomeAsync(UserId, requestId, request.TeacherUserId, cancellationToken);
        return result switch
        {
            AssignmentResult.Success => NoContent(),
            AssignmentResult.AcademicMappingRequired => Conflict(new { code = "ACADEMIC_MAPPING_REQUIRED" }),
            AssignmentResult.EvaluatorNotEligible => BadRequest(new { code = "EVALUATOR_NOT_ELIGIBLE" }),
            AssignmentResult.UnitSpecialismRequired => Conflict(new { code = "UNIT_SPECIALISM_REQUIRED" }),
            AssignmentResult.Conflict => Conflict(new { code = "ASSIGNMENT_CONFLICT" }),
            _ => Conflict(new { code = "REQUEST_NOT_ASSIGNABLE" })
        };
    }

    [Authorize(Policy = "CourseReviewer")]
    [HttpGet("{requestId:guid}/eligible-evaluators")]
    public async Task<IActionResult> EligibleEvaluators(Guid requestId, CancellationToken cancellationToken)
    {
        var (result, candidates) = await specialisms.EligibleAsync(requestId, cancellationToken);
        return result switch
        {
            AssignmentResult.Success => Ok(candidates),
            AssignmentResult.AcademicMappingRequired => Conflict(new { code = "ACADEMIC_MAPPING_REQUIRED" }),
            _ => NotFound()
        };
    }

    [Authorize(Policy = "AssessmentAssessor")]
    [HttpPost("{requestId:guid}/criteria-plan")]
    public async Task<IActionResult> SetCriteriaPlan(Guid requestId, SetEvaluationCriteriaPlanCommand command, CancellationToken cancellationToken) => await evaluations.SetCriteriaPlanAsync(UserId, requestId, command.CriterionCodes, cancellationToken) ? NoContent() : BadRequest(new { message = "Select one or more valid criteria before starting the evaluation." });

    [Authorize(Policy = "AssessmentAssessor")]
    [HttpPost("{requestId:guid}/review")]
    public async Task<IActionResult> SubmitReview(Guid requestId, SubmitEvaluationReviewCommand command, CancellationToken cancellationToken) =>
        await evaluations.SubmitReviewAsync(UserId, requestId, command, cancellationToken)
            ? NoContent()
            : BadRequest(new { message = "Assess every selected criterion, provide teacher feedback, and when opening the one revision check provide a future revision deadline." });

    [Authorize(Policy = "AssessmentAssessor")]
    [HttpPost("{requestId:guid}/results")]
    public async Task<IActionResult> SubmitResults(Guid requestId, IReadOnlyCollection<CriterionSubmission> results, CancellationToken cancellationToken)
    {
        var isHistoricalRetake = await db.EvaluationRequests.AsNoTracking()
            .AnyAsync(request => request.Id == requestId && request.RetakeOfEvaluationRequestId != null, cancellationToken);
        if (!isHistoricalRetake) return Conflict(new
        {
            code = "BETCCO_REVIEW_FLOW_REQUIRED",
            message = "Submit the BETCCO assignment review, feedback, and revision decision through the review endpoint."
        });
        return await evaluations.SubmitResultsAsync(UserId, requestId, results, cancellationToken)
            ? NoContent()
            : BadRequest(new { message = "The historical Retake result could not be submitted." });
    }

    [Authorize(Policy = "AssessmentAssessor")]
    [HttpGet("assigned")]
    public async Task<IActionResult> Assigned(CancellationToken cancellationToken)
    {
        var requests = await db.EvaluatorAssignments
            .Where(x => x.EvaluatorUserId == UserId)
            .OrderByDescending(x => x.AssignedAtUtc)
            .Select(x => new
            {
                id = x.EvaluationRequestId,
                status = x.EvaluationRequest!.Status.ToString(),
                x.EvaluationRequest.StudentComment,
                x.EvaluationRequest.CriteriaSnapshotJson,
                x.EvaluationRequest.EvaluatorCriteriaPlanJson,
                x.EvaluationRequest.AssessmentScopeSnapshotJson,
                x.EvaluationRequest.RetakeOfEvaluationRequestId,
                x.EvaluationRequest.SubmissionAttemptNumber,
                filesCount = x.EvaluationRequest.SubmissionFiles.Count
            })
            .ToListAsync(cancellationToken);

        return Ok(requests.Select(x => new
        {
            x.id,
            x.status,
            x.StudentComment,
            x.filesCount,
            isRetake = x.RetakeOfEvaluationRequestId != null,
            x.RetakeOfEvaluationRequestId,
            x.SubmissionAttemptNumber,
            criteria = JsonSerializer.Deserialize<string[]>(x.CriteriaSnapshotJson) ?? [],
            selectedCriteria = JsonSerializer.Deserialize<string[]>(x.EvaluatorCriteriaPlanJson) ?? [],
            academic = AssessmentScopeSnapshotReader.Summary(x.AssessmentScopeSnapshotJson)
        }));
    }

    [Authorize(Policy = "CourseReviewer")]
    [HttpGet("pending-assignment")]
    public async Task<IActionResult> PendingAssignment(CancellationToken cancellationToken)
    {
        var requests = await db.EvaluationRequests
            .Where(x => x.Status == EvaluationStatus.PendingAssignment)
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => new
            {
                x.Id,
                status = x.Status.ToString(),
                x.StudentComment,
                filesCount = x.SubmissionFiles.Count,
                x.CriteriaSnapshotJson,
                x.AssessmentScopeSnapshotJson,
                x.RetakeOfEvaluationRequestId
            })
            .ToListAsync(cancellationToken);

        return Ok(requests.Select(x => new
        {
            x.Id,
            x.status,
            x.StudentComment,
            x.filesCount,
            isRetake = x.RetakeOfEvaluationRequestId != null,
            x.RetakeOfEvaluationRequestId,
            criteria = JsonSerializer.Deserialize<string[]>(x.CriteriaSnapshotJson) ?? [],
            academic = AssessmentScopeSnapshotReader.Summary(x.AssessmentScopeSnapshotJson)
        }));
    }

    [Authorize(Policy = "AssessmentVerifier")]
    [HttpGet("under-review")]
    public async Task<IActionResult> UnderReview(CancellationToken cancellationToken)
    {
        // Once a Lead IV selects an assessment, only its independent assigned
        // verifier may see or decide that sampled attempt.
        var requests = await db.EvaluationRequests.AsNoTracking()
            .Include(x => x.SubmissionFiles)
            .Include(x => x.CriterionResults)
            .Include(x => x.EvidenceItems)
            .Include(x => x.FeedbackItems)
            .Where(x => x.Status == EvaluationStatus.UnderReview)
            .Where(x =>
                !db.InternalVerificationSamples.Any(sample =>
                    sample.EvaluationRequestId == x.Id
                    && sample.SubmissionAttemptNumber == x.SubmissionAttemptNumber)
                || db.InternalVerificationSamples.Any(sample =>
                    sample.EvaluationRequestId == x.Id
                    && sample.SubmissionAttemptNumber == x.SubmissionAttemptNumber
                    && sample.AssignedVerifierUserId == UserId
                    && sample.Status == InternalVerificationSampleStatus.Pending))
            .OrderBy(x => x.UpdatedAtUtc)
            .ToListAsync(cancellationToken);
        return Ok(requests.Select(request => new
        {
            request.Id,
            request.StudentComment,
            isRetake = request.RetakeOfEvaluationRequestId != null,
            request.RetakeOfEvaluationRequestId,
            academic = AssessmentScopeSnapshotReader.Summary(request.AssessmentScopeSnapshotJson),
            filesCount = request.SubmissionFiles.Count,
            calculatedGrade = request.CalculatedGrade?.ToString(),
            sectionResults = ReadSectionResults(request.SectionResultsJson),
            results = request.CriterionResults.OrderBy(x => x.CriterionCode).Select(x => new { x.CriterionCode, achievement = x.Achievement.ToString(), x.Evidence, x.Comment }),
            evidence = request.EvidenceItems.OrderBy(x => x.CriterionCode).Select(x => new { x.CriterionCode, x.Narrative }),
            feedback = request.FeedbackItems.OrderBy(x => x.CreatedAtUtc).Select(x => new { x.Body, x.RequestsResubmission })
        }));
    }

    [Authorize(Policy = "AssessmentVerifier")]
    [HttpPost("{requestId:guid}/complete")]
    public async Task<IActionResult> Complete(Guid requestId, CancellationToken cancellationToken) => await evaluations.CompleteAsync(UserId, requestId, cancellationToken) ? NoContent() : BadRequest();

    [Authorize(Policy = "AssessmentVerifier")]
    [HttpPost("{requestId:guid}/internal-verification")]
    public async Task<IActionResult> InternalVerification(Guid requestId, InternalVerificationRequest request, CancellationToken cancellationToken) => await evaluations.VerifyAsync(UserId, requestId, request.Approve, request.Comment, request.ResubmissionDueAtUtc, cancellationToken) ? NoContent() : BadRequest(new { message = "A completed teacher assessment is required. A resubmission decision needs a reason and an allowed deadline." });

    [Authorize(Policy = "Student")]
    [HttpPost("{requestId:guid}/checkout")]
    [EnableRateLimiting("checkout")]
    public async Task<IActionResult> Checkout(Guid requestId, EvaluationCheckoutRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var result = await commerce.CreateEvaluationCheckoutAsync(
                UserId,
                requestId,
                request.PaymentMethod,
                Request.Headers["Idempotency-Key"].ToString(),
                request.ExpectIncludedCredit,
                cancellationToken);
            if (result is null)
                return BadRequest(new { message = "Add at least one clean file and confirm the originality declaration before submitting the review request." });

            if (result.IncludedCreditApplied)
            {
                return Ok(new
                {
                    includedCreditApplied = true,
                    result.EvaluationStatus,
                    paymentId = (Guid?)null
                });
            }

            var payment = result.Payment!;
            return Ok(new
            {
                includedCreditApplied = false,
                result.EvaluationStatus,
                payment.PaymentId,
                payment.Status,
                payment.Provider,
                payment.CheckoutReference,
                payment.RedirectUrl,
                payment.ProviderSessionStatus,
                payment.Subtotal,
                payment.Discount,
                payment.Tax,
                payment.Total,
                payment.Currency,
                payment.PaymentMethod
            });
        }
        catch (InvalidOperationException exception) { return BadRequest(new { message = exception.Message }); }
    }

    [Authorize(Policy = "Student")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine([FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 50)
            return BadRequest(new { code = "EVALUATION_PAGE_INVALID", message = "Use page >= 1 and pageSize between 1 and 50." });

        var owned = db.EvaluationRequests.AsNoTracking()
            .Where(x => x.StudentUserId == UserId);
        var totalCount = await owned.CountAsync(cancellationToken);
        var offset = (long)(page - 1) * pageSize;
        if (offset >= totalCount)
            return Ok(new StudentEvaluationPage([], page, pageSize, totalCount, false));

        var requests = await owned
            .Include(x => x.CriterionResults)
            .Include(x => x.EvidenceItems)
            .Include(x => x.FeedbackItems)
            .Include(x => x.RevisionDeadlineAdjustments)
            .AsSplitQuery()
            .OrderByDescending(x => x.CreatedAtUtc)
            .ThenByDescending(x => x.Id)
            .Skip((int)offset)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = requests.Select(request =>
        {
            var showResult = request.Status is EvaluationStatus.NeedsRevision or EvaluationStatus.Completed;
            return new StudentEvaluationItem(
                request.Id, request.Status.ToString(), request.Price, request.Currency, request.StudentComment,
                request.SubmissionAttemptNumber, request.RevisionDueAtUtc,
                request.RevisionDeadlineAdjustments
                    .Where(item => item.RevokedAtUtc == null)
                    .OrderByDescending(item => item.GrantedAtUtc)
                    .Select(item => (DateTimeOffset?)item.ExtendedDueAtUtc)
                    .FirstOrDefault() ?? request.RevisionDueAtUtc,
                request.RetakeOfEvaluationRequestId != null, request.RetakeOfEvaluationRequestId,
                AssessmentScopeSnapshotReader.Summary(request.AssessmentScopeSnapshotJson),
                JsonSerializer.Deserialize<string[]>(request.CriteriaSnapshotJson) ?? [],
                JsonSerializer.Deserialize<string[]>(request.EvaluatorCriteriaPlanJson) ?? [],
                request.EvidenceItems.OrderBy(x => x.CriterionCode)
                    .Select(x => new StudentEvaluationEvidence(x.CriterionCode, x.Narrative)).ToArray(),
                request.FeedbackItems.OrderBy(x => x.CreatedAtUtc)
                    .Select(x => new StudentEvaluationFeedback(x.Body, x.RequestsResubmission, x.CreatedAtUtc)).ToArray(),
                showResult ? request.CalculatedGrade?.ToString() : null,
                showResult ? ReadSectionResults(request.SectionResultsJson) : [],
                showResult
                    ? request.CriterionResults.OrderBy(x => x.CriterionCode)
                        .Select(x => new StudentEvaluationCriterionResult(x.CriterionCode,
                            x.Achievement.ToString(), x.Evidence, x.Comment)).ToArray()
                    : []);
        }).ToArray();

        return Ok(new StudentEvaluationPage(items, page, pageSize, totalCount,
            offset + items.Length < totalCount));
    }

    [HttpGet("{requestId:guid}")]
    public async Task<IActionResult> Get(Guid requestId, CancellationToken cancellationToken)
    {
        var request = await db.EvaluationRequests.Include(x => x.SubmissionFiles).Include(x => x.CriterionResults).Include(x => x.EvidenceItems).Include(x => x.FeedbackItems).Include(x => x.InternalVerifications).Include(x => x.RevisionDeadlineAdjustments).AsNoTracking().SingleOrDefaultAsync(x => x.Id == requestId, cancellationToken);
        if (request is null) return NotFound();
        var isOwner = request.StudentUserId == UserId;
        var canVerify = PlatformPermissionAuthorizationHandler.HasPermission(User, PlatformPermissions.VerifyAssessments);
        var sampleRequiresAnotherVerifier = canVerify && await db.InternalVerificationSamples.AsNoTracking().AnyAsync(sample =>
            sample.EvaluationRequestId == requestId
            && sample.SubmissionAttemptNumber == request.SubmissionAttemptNumber
            && sample.AssignedVerifierUserId != UserId,
            cancellationToken);
        var isAssignedAssessor = PlatformPermissionAuthorizationHandler.HasPermission(User, PlatformPermissions.Assess)
            && await db.EvaluatorAssignments.AnyAsync(x => x.EvaluationRequestId == requestId && x.EvaluatorUserId == UserId, cancellationToken);
        if ((!canVerify || sampleRequiresAnotherVerifier) && !isOwner && !isAssignedAssessor) return NotFound();
        var canViewCalculatedResult = !isOwner
            || request.Status is EvaluationStatus.NeedsRevision or EvaluationStatus.Completed;
        return Ok(new
        {
            request.Id,
            status = request.Status.ToString(),
            request.Price,
            request.Currency,
            request.StudentComment,
            request.SubmissionAttemptNumber,
            revisionDueAtUtc = request.RevisionDueAtUtc,
            effectiveRevisionDueAtUtc = request.RevisionDeadlineAdjustments
                .Where(item => item.RevokedAtUtc == null)
                .OrderByDescending(item => item.GrantedAtUtc)
                .Select(item => (DateTimeOffset?)item.ExtendedDueAtUtc)
                .FirstOrDefault() ?? request.RevisionDueAtUtc,
            isRetake = request.RetakeOfEvaluationRequestId != null,
            request.RetakeOfEvaluationRequestId,
            academic = AssessmentScopeSnapshotReader.Summary(request.AssessmentScopeSnapshotJson),
            criteria = JsonSerializer.Deserialize<string[]>(request.CriteriaSnapshotJson) ?? [],
            selectedCriteria = JsonSerializer.Deserialize<string[]>(request.EvaluatorCriteriaPlanJson) ?? [],
            files = request.SubmissionFiles.Select(x => new { x.Id, x.OriginalFileName, x.ContentType, x.LengthBytes, x.CreatedAtUtc, scanStatus = x.ScanStatus.ToString() }),
            evidence = request.EvidenceItems.OrderBy(x => x.CriterionCode).Select(x => new { x.CriterionCode, x.Narrative }),
            feedback = request.FeedbackItems.OrderBy(x => x.CreatedAtUtc).Select(x => new { x.Body, x.RequestsResubmission, x.CreatedAtUtc }),
            internalVerifications = request.InternalVerifications.Where(_ => !isOwner || canVerify).OrderBy(x => x.VerifiedAtUtc).Select(x => new { x.Decision, x.Comment, x.VerifiedAtUtc }),
            calculatedGrade = canViewCalculatedResult ? request.CalculatedGrade?.ToString() : null,
            sectionResults = canViewCalculatedResult ? ReadSectionResults(request.SectionResultsJson) : [],
            // The learner can see the current estimate after the first BETCCO review
            // and the final estimate after the one revision check.
            results = request.CriterionResults
                .Where(_ => !isOwner || request.Status is EvaluationStatus.NeedsRevision or EvaluationStatus.Completed)
                .Select(x => new { x.CriterionCode, achievement = x.Achievement.ToString(), x.Evidence, x.Comment })
        });
    }

    [HttpGet("{requestId:guid}/files/{fileId:guid}")]
    public async Task<IActionResult> DownloadFile(Guid requestId, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await db.SubmissionFiles.AsNoTracking().SingleOrDefaultAsync(x => x.Id == fileId && x.EvaluationRequestId == requestId, cancellationToken);
        if (file is null) return NotFound();
        var isOwner = await db.EvaluationRequests.AnyAsync(x => x.Id == requestId && x.StudentUserId == UserId, cancellationToken);
        var request = await db.EvaluationRequests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == requestId, cancellationToken);
        if (request is null) return NotFound();
        var canVerify = PlatformPermissionAuthorizationHandler.HasPermission(User, PlatformPermissions.VerifyAssessments);
        var sampleRequiresAnotherVerifier = canVerify && await db.InternalVerificationSamples.AsNoTracking().AnyAsync(sample =>
            sample.EvaluationRequestId == requestId
            && sample.SubmissionAttemptNumber == request.SubmissionAttemptNumber
            && sample.AssignedVerifierUserId != UserId,
            cancellationToken);
        var isAssignedAssessor = PlatformPermissionAuthorizationHandler.HasPermission(User, PlatformPermissions.Assess)
            && await db.EvaluatorAssignments.AnyAsync(x => x.EvaluationRequestId == requestId && x.EvaluatorUserId == UserId, cancellationToken);
        if ((!canVerify || sampleRequiresAnotherVerifier) && !isOwner && !isAssignedAssessor) return NotFound();
        var content = await storage.OpenPrivateReadAsync(file.StorageKey, cancellationToken);
        if (content is null) return NotFound();
        return File(content, file.ContentType, file.OriginalFileName, enableRangeProcessing: true);
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static IReadOnlyCollection<EvaluationSectionView> ReadSectionResults(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return (JsonSerializer.Deserialize<EvaluationSectionResult[]>(json) ?? [])
                .Select(section => new EvaluationSectionView(section.Section, section.Grade))
                .ToArray();
        }
        catch (JsonException) { return []; }
    }
}

public sealed record AssignEvaluatorRequest(string TeacherUserId);
public sealed record EvaluationCheckoutRequest(string? PaymentMethod, bool ExpectIncludedCredit = false);
public sealed record AddEvaluationEvidenceRequest(string CriterionCode, string Narrative);
public sealed record InternalVerificationRequest(bool Approve, string? Comment, DateTimeOffset? ResubmissionDueAtUtc);
public sealed record EvaluationSectionView(string Section, string Grade);
public sealed record StudentEvaluationEvidence(string CriterionCode, string Narrative);
public sealed record StudentEvaluationFeedback(string Body, bool RequestsResubmission, DateTimeOffset CreatedAtUtc);
public sealed record StudentEvaluationCriterionResult(string CriterionCode, string Achievement, string? Evidence, string? Comment);
public sealed record StudentEvaluationItem(
    Guid Id, string Status, decimal Price, string Currency, string? StudentComment,
    int SubmissionAttemptNumber, DateTimeOffset? RevisionDueAtUtc, DateTimeOffset? EffectiveRevisionDueAtUtc,
    bool IsRetake, Guid? RetakeOfEvaluationRequestId, AssessmentAcademicSummary? Academic,
    IReadOnlyList<string> Criteria, IReadOnlyList<string> SelectedCriteria,
    IReadOnlyList<StudentEvaluationEvidence> Evidence, IReadOnlyList<StudentEvaluationFeedback> Feedback,
    string? CalculatedGrade, IReadOnlyCollection<EvaluationSectionView> SectionResults,
    IReadOnlyList<StudentEvaluationCriterionResult> Results);
public sealed record StudentEvaluationPage(
    IReadOnlyList<StudentEvaluationItem> Items, int Page, int PageSize, int TotalCount, bool HasNextPage);
