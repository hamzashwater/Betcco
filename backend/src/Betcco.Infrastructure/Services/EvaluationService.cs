using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class EvaluationService(
    BetccoDbContext db,
    IFileStorage storage,
    IFileSecurityScanner scanner,
    IAssessorEligibilityService? assessorEligibility = null,
    IStorageLifecycleCoordinator? storageLifecycle = null) : IEvaluationService
{
    public async Task<EvaluationView?> CreateDraftAsync(string studentUserId, CreateEvaluationCommand command, CancellationToken cancellationToken = default)
    {
        var rubric = await db.RubricTemplates
            .Include(x => x.Criteria)
            .Include(x => x.QualificationVersion)
            .ThenInclude(x => x!.Qualification)
            .SingleOrDefaultAsync(x => x.Id == command.RubricTemplateId && x.IsActive, cancellationToken);
        if (rubric is null || rubric.GradeId != command.GradeId || rubric.SpecializationId != command.SpecializationId || rubric.TaskTypeId != command.TaskTypeId) return null;
        var configuredRuleSetJson = string.IsNullOrWhiteSpace(rubric.AssessmentRuleSetJson)
            ? BtecAssessmentRuleSet.DefaultJson
            : rubric.AssessmentRuleSetJson;
        if (!BtecAssessmentRuleSet.TryRead(configuredRuleSetJson, out var ruleSet)) return null;
        var criteria = rubric.Criteria.OrderBy(x => x.SortOrder).Select(x => x.Code).ToArray();
        var qualificationSnapshot = rubric.QualificationVersion is null ? null : JsonSerializer.Serialize(new
        {
            qualificationCode = rubric.QualificationVersion.Qualification!.Code,
            rubric.QualificationVersion.VersionCode,
            rubric.QualificationVersion.SourceReference,
            rubric.QualificationVersion.EffectiveFromUtc,
            rubric.QualificationVersion.EffectiveUntilUtc
        });
        var request = new EvaluationRequest { StudentUserId = studentUserId, GradeId = command.GradeId, SpecializationId = command.SpecializationId, TaskTypeId = command.TaskTypeId, RubricTemplateId = rubric.Id, Price = AssessmentPricing.StandardEvaluationPrice, StudentComment = command.StudentComment?.Trim(), CriteriaSnapshotJson = JsonSerializer.Serialize(criteria), AssessmentRuleSetVersion = ruleSet.Version, AssessmentRuleSetSnapshotJson = JsonSerializer.Serialize(ruleSet), QualificationVersionId = rubric.QualificationVersionId, QualificationVersionSnapshotJson = qualificationSnapshot };
        db.EvaluationRequests.Add(request);
        RecordAssessmentEvent(request, studentUserId, "DraftCreated", null, request.Status, null, request.SubmissionAttemptNumber, null);
        db.AuditLogs.Add(Audit(studentUserId, "EvaluationDraftCreated", nameof(EvaluationRequest), request.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return ToView(request, criteria);
    }

    public async Task<EvaluationFileAddStatus> AddFileAsync(string studentUserId, Guid requestId, string originalName, string contentType, long length, Stream content, CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.StudentUserId == studentUserId && (x.Status == EvaluationStatus.Draft || x.Status == EvaluationStatus.NeedsRevision), cancellationToken);
        if (request is null || length <= 0 || length > 100L * 1024 * 1024) return EvaluationFileAddStatus.RequestNotFound;
        if (!FileUploadValidation.TryValidate(content, originalName, out var validation))
        {
            db.AuditLogs.Add(Audit(studentUserId, "EvaluationFileRejected", nameof(EvaluationRequest), requestId.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            return EvaluationFileAddStatus.Rejected;
        }
        var scan = await scanner.ScanAsync(content, cancellationToken);
        if (scan.Outcome == FileScanOutcome.Rejected)
        {
            db.AuditLogs.Add(Audit(studentUserId, "EvaluationFileRejected", nameof(EvaluationRequest), requestId.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            return EvaluationFileAddStatus.Rejected;
        }
        if (!scan.IsClean) return EvaluationFileAddStatus.ScannerUnavailable;
        if (content.CanSeek) content.Position = 0;
        StagedPrivateFile? staged = null;
        StorageLifecycleOperation? finalization = null;
        string key;
        if (storageLifecycle is null)
        {
            key = await storage.SavePrivateAsync(content, validation.DetectedContentType!, cancellationToken);
        }
        else
        {
            staged = await storage.StagePrivateAsync(content, validation.DetectedContentType!, cancellationToken);
            key = staged.StorageKey;
            finalization = storageLifecycle.EnqueueFinalization(staged);
        }
        db.SubmissionFiles.Add(new SubmissionFile { EvaluationRequestId = requestId, OriginalFileName = Path.GetFileName(originalName), StorageKey = key, ContentType = validation.DetectedContentType!, LengthBytes = length, ScanStatus = UploadScanStatus.Clean });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            if (staged is not null) await storageLifecycle!.DiscardStagedAsync(staged, cancellationToken);
            throw;
        }
        if (finalization is not null) await storageLifecycle!.TryProcessNowAsync(finalization.Id, cancellationToken);
        return EvaluationFileAddStatus.Added;
    }

    public async Task<bool> DeclareAuthenticityAsync(
        string studentUserId,
        Guid requestId,
        string locale,
        string? ipAddress,
        string? userAgent,
        string? correlationId,
        CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(
            item => item.Id == requestId
                    && item.StudentUserId == studentUserId
                    && (item.Status == EvaluationStatus.Draft || item.Status == EvaluationStatus.NeedsRevision),
            cancellationToken);
        if (request is null) return false;

        // A resubmission declaration is intentionally prepared for the next
        // attempt, then consumed only when the student formally resubmits.
        var attemptNumber = request.Status == EvaluationStatus.NeedsRevision
            ? request.SubmissionAttemptNumber + 1
            : request.SubmissionAttemptNumber;
        var alreadyDeclared = await db.AuthenticityDeclarations.AnyAsync(
            item => item.EvaluationRequestId == requestId && item.AttemptNumber == attemptNumber,
            cancellationToken);
        if (alreadyDeclared) return true;

        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            EvaluationRequestId = requestId,
            StudentUserId = studentUserId,
            AttemptNumber = attemptNumber,
            PolicyVersion = AssessmentAuthenticityPolicy.Version,
            StatementSnapshot = AssessmentAuthenticityPolicy.StatementFor(locale),
            DeclaredAtUtc = DateTimeOffset.UtcNow,
            IpAddress = Trim(ipAddress, 128),
            UserAgent = Trim(userAgent, 512)
        });
        RecordAssessmentEvent(request, studentUserId, "AuthenticityDeclared", null, null, AssessmentAuthenticityPolicy.Version, attemptNumber, correlationId);
        db.AuditLogs.Add(Audit(studentUserId, "EvaluationAuthenticityDeclared", nameof(EvaluationRequest), requestId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> MarkPaidAsync(Guid requestId, Guid paymentId, CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == requestId && (x.Status == EvaluationStatus.Draft || x.Status == EvaluationStatus.PendingPayment), cancellationToken);
        var payment = await db.Payments.SingleOrDefaultAsync(x => x.Id == paymentId && x.Status == PaymentStatus.Paid, cancellationToken);
        if (request is null || payment is null || payment.UserId != request.StudentUserId) return false;
        if (!await db.AuthenticityDeclarations.AnyAsync(
                item => item.EvaluationRequestId == requestId && item.AttemptNumber == request.SubmissionAttemptNumber,
                cancellationToken)) return false;
        request.PaymentId = payment.Id;
        if (!EvaluationWorkflow.CanTransition(request.Status, EvaluationStatus.PendingAssignment)) return false;
        var previousStatus = request.Status;
        request.Status = EvaluationStatus.PendingAssignment;
        RecordAssessmentEvent(request, payment.UserId, "PaymentConfirmed", previousStatus, request.Status, payment.Id.ToString(), request.SubmissionAttemptNumber, null);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> AssignAsync(string adminUserId, Guid requestId, string teacherUserId, CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.Status == EvaluationStatus.PendingAssignment, cancellationToken);
        if (request is null || (assessorEligibility is not null && !await assessorEligibility.IsEligibleAsync(teacherUserId, cancellationToken))) return false;
        db.EvaluatorAssignments.Add(new EvaluatorAssignment { EvaluationRequestId = requestId, EvaluatorUserId = teacherUserId, AssignedByUserId = adminUserId });
        if (!EvaluationWorkflow.CanTransition(request.Status, EvaluationStatus.Assigned)) return false;
        var previousStatus = request.Status;
        request.Status = EvaluationStatus.Assigned;
        RecordAssessmentEvent(request, adminUserId, "AssessorAssigned", previousStatus, request.Status, null, request.SubmissionAttemptNumber, null);
        db.AuditLogs.Add(Audit(adminUserId, "EvaluatorAssigned", nameof(EvaluationRequest), requestId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> SetCriteriaPlanAsync(string teacherUserId, Guid requestId, IReadOnlyCollection<string> criterionCodes, CancellationToken cancellationToken = default)
    {
        var assignment = await db.EvaluatorAssignments.SingleOrDefaultAsync(x => x.EvaluationRequestId == requestId && x.EvaluatorUserId == teacherUserId, cancellationToken);
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.Status == EvaluationStatus.Assigned, cancellationToken);
        if (assignment is null || request is null) return false;

        var selectedCodes = criterionCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var availableCodes = JsonSerializer.Deserialize<string[]>(request.CriteriaSnapshotJson) ?? [];
        if (!BtecAssessmentRuleSet.TryRead(request.AssessmentRuleSetSnapshotJson, out var ruleSet)) return false;
        if (selectedCodes.Length == 0
            || selectedCodes.Any(code => !availableCodes.Contains(code, StringComparer.OrdinalIgnoreCase))
            || (request.RetakeOfEvaluationRequestId is not null
                && (selectedCodes.Length != availableCodes.Length
                    || availableCodes.Any(code => !selectedCodes.Contains(code, StringComparer.OrdinalIgnoreCase))))
            || !ruleSet.HasValidPlan(selectedCodes)) return false;

        request.EvaluatorCriteriaPlanJson = JsonSerializer.Serialize(selectedCodes);
        RecordAssessmentEvent(request, teacherUserId, "CriteriaPlanSet", null, null, $"{selectedCodes.Length} criteria selected", request.SubmissionAttemptNumber, null);
        db.AuditLogs.Add(Audit(teacherUserId, "EvaluationCriteriaPlanSet", nameof(EvaluationRequest), requestId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> SubmitResultsAsync(string teacherUserId, Guid requestId, IReadOnlyCollection<CriterionSubmission> results, CancellationToken cancellationToken = default)
    {
        var assignment = await db.EvaluatorAssignments.SingleOrDefaultAsync(x => x.EvaluationRequestId == requestId && x.EvaluatorUserId == teacherUserId, cancellationToken);
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == requestId && (x.Status == EvaluationStatus.Assigned || x.Status == EvaluationStatus.UnderReview), cancellationToken);
        if (assignment is null || request is null || results.Count == 0) return false;
        var validCodes = JsonSerializer.Deserialize<string[]>(request.CriteriaSnapshotJson) ?? [];
        var selectedCodes = JsonSerializer.Deserialize<string[]>(request.EvaluatorCriteriaPlanJson) ?? [];
        if (!BtecAssessmentRuleSet.TryRead(request.AssessmentRuleSetSnapshotJson, out var ruleSet)) return false;
        if (selectedCodes.Length == 0 || results.Count != selectedCodes.Length || results.Select(x => x.CriterionCode).Distinct(StringComparer.OrdinalIgnoreCase).Count() != results.Count) return false;
        if (results.Any(x => !validCodes.Contains(x.CriterionCode, StringComparer.OrdinalIgnoreCase) || !selectedCodes.Contains(x.CriterionCode, StringComparer.OrdinalIgnoreCase) || !Enum.TryParse<CriterionAchievement>(x.Achievement, true, out _))) return false;
        if (request.RetakeOfEvaluationRequestId is not null
            && (validCodes.Any(code => !string.Equals(EvaluationAssessmentCalculator.Describe(code).Band, "P", StringComparison.OrdinalIgnoreCase))
                || selectedCodes.Length != validCodes.Length)) return false;
        if (request.Status == EvaluationStatus.Assigned && !EvaluationWorkflow.CanTransition(request.Status, EvaluationStatus.UnderReview)) return false;

        // BTEC outcomes are derived from criterion decisions and this request's
        // immutable rule-set snapshot only.
        var normalizedResults = results.Select(item =>
        {
            Enum.TryParse<CriterionAchievement>(item.Achievement, true, out var achievement);
            var code = item.CriterionCode.Trim().ToUpperInvariant();
            return new CriterionSubmission(code, achievement.ToString(), item.Evidence?.Trim(), item.Comment?.Trim());
        }).ToArray();
        var calculation = EvaluationAssessmentCalculator.Calculate(normalizedResults, ruleSet);
        if (request.RetakeOfEvaluationRequestId is not null && calculation.Grade > EvaluationGrade.Pass) return false;
        var existing = await db.CriterionResults.Where(x => x.EvaluationRequestId == requestId).ToListAsync(cancellationToken);
        db.CriterionResults.RemoveRange(existing);
        foreach (var item in normalizedResults)
        {
            Enum.TryParse<CriterionAchievement>(item.Achievement, true, out var achievement);
            db.CriterionResults.Add(new CriterionResult { EvaluationRequestId = requestId, CriterionCode = item.CriterionCode, Achievement = achievement, Score = null, Evidence = item.Evidence, Comment = item.Comment });
        }
        request.CalculatedGrade = calculation.Grade;
        request.CalculatedScore = null;
        request.SectionResultsJson = JsonSerializer.Serialize(calculation.Sections);
        if (request.Status == EvaluationStatus.Assigned)
        {
            var previousStatus = request.Status;
            request.Status = EvaluationStatus.UnderReview;
            RecordAssessmentEvent(request, teacherUserId, "AssessmentSubmittedForVerification", previousStatus, request.Status, null, request.SubmissionAttemptNumber, null);
        }
        else
        {
            RecordAssessmentEvent(request, teacherUserId, "AssessmentDecisionUpdated", null, null, null, request.SubmissionAttemptNumber, null);
        }
        db.AuditLogs.Add(Audit(teacherUserId, "EvaluationResultsSubmitted", nameof(EvaluationRequest), requestId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> CompleteAsync(string adminUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        return await VerifyAsync(adminUserId, requestId, true, null, null, cancellationToken);
    }

    public async Task<bool> AddEvidenceAsync(string studentUserId, Guid requestId, string criterionCode, string narrative, CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.StudentUserId == studentUserId && (x.Status == EvaluationStatus.Draft || x.Status == EvaluationStatus.NeedsRevision), cancellationToken);
        var code = criterionCode.Trim().ToUpperInvariant();
        string[] validCodes = request is null ? [] : JsonSerializer.Deserialize<string[]>(request.CriteriaSnapshotJson) ?? [];
        if (request is null || string.IsNullOrWhiteSpace(narrative) || narrative.Trim().Length > 4000 || !validCodes.Contains(code, StringComparer.OrdinalIgnoreCase)) return false;
        var evidence = await db.EvaluationEvidenceItems.SingleOrDefaultAsync(x => x.EvaluationRequestId == requestId && x.CriterionCode == code, cancellationToken);
        if (evidence is null) db.EvaluationEvidenceItems.Add(new EvaluationEvidence { EvaluationRequestId = requestId, CriterionCode = code, Narrative = narrative.Trim() });
        else evidence.Narrative = narrative.Trim();
        db.AuditLogs.Add(Audit(studentUserId, "EvaluationEvidenceAdded", nameof(EvaluationRequest), requestId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> ResubmitAsync(string studentUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.Include(x => x.SubmissionFiles).SingleOrDefaultAsync(x => x.Id == requestId && x.StudentUserId == studentUserId && x.Status == EvaluationStatus.NeedsRevision, cancellationToken);
        if (request is null || !request.SubmissionFiles.Any(x => x.ScanStatus == UploadScanStatus.Clean) || !EvaluationWorkflow.CanTransition(request.Status, EvaluationStatus.Assigned)) return false;
        var nextAttempt = request.SubmissionAttemptNumber + 1;
        var authorization = await db.ResubmissionAuthorizations.SingleOrDefaultAsync(
            item => item.EvaluationRequestId == requestId
                    && item.AttemptNumber == nextAttempt
                    && item.SubmittedAtUtc == null
                    && item.RevokedAtUtc == null,
            cancellationToken);
        if (authorization is null || authorization.DueAtUtc < DateTimeOffset.UtcNow) return false;
        if (!await db.AuthenticityDeclarations.AnyAsync(
                item => item.EvaluationRequestId == requestId && item.AttemptNumber == nextAttempt,
                cancellationToken)) return false;
        var previousStatus = request.Status;
        request.Status = EvaluationStatus.Assigned;
        request.SubmissionAttemptNumber = nextAttempt;
        authorization.SubmittedAtUtc = DateTimeOffset.UtcNow;
        RecordAssessmentEvent(request, studentUserId, "ResubmissionSubmitted", previousStatus, request.Status, null, nextAttempt, null);
        db.AuditLogs.Add(Audit(studentUserId, "EvaluationResubmitted", nameof(EvaluationRequest), requestId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> VerifyAsync(string adminUserId, Guid requestId, bool complete, string? comment, DateTimeOffset? resubmissionDueAtUtc, CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.Status == EvaluationStatus.UnderReview, cancellationToken);
        if (request is null || (assessorEligibility is not null && !await assessorEligibility.IsEligibleVerifierAsync(adminUserId, cancellationToken))) return false;
        var evaluator = await db.EvaluatorAssignments.AsNoTracking().SingleOrDefaultAsync(item => item.EvaluationRequestId == requestId, cancellationToken);
        if (evaluator?.EvaluatorUserId == adminUserId) return false;
        var sample = await db.InternalVerificationSamples.SingleOrDefaultAsync(item =>
            item.EvaluationRequestId == requestId
            && item.SubmissionAttemptNumber == request.SubmissionAttemptNumber,
            cancellationToken);
        if (sample is not null && (sample.Status != InternalVerificationSampleStatus.Pending || sample.AssignedVerifierUserId != adminUserId)) return false;
        var results = await db.CriterionResults.Where(x => x.EvaluationRequestId == requestId).ToListAsync(cancellationToken);
        if (results.Count == 0) return false;
        var destination = complete ? EvaluationStatus.Completed : EvaluationStatus.NeedsRevision;
        if (!EvaluationWorkflow.CanTransition(request.Status, destination) || (!complete && string.IsNullOrWhiteSpace(comment))) return false;
        BtecAssessmentRuleSet? ruleSet = null;
        if (!complete)
        {
            if (resubmissionDueAtUtc is null || resubmissionDueAtUtc <= DateTimeOffset.UtcNow) return false;
            if (!BtecAssessmentRuleSet.TryRead(request.AssessmentRuleSetSnapshotJson, out var parsedRuleSet)) return false;
            ruleSet = parsedRuleSet;
            var authorizationsIssued = await db.ResubmissionAuthorizations.CountAsync(
                item => item.EvaluationRequestId == requestId,
                cancellationToken);
            if (authorizationsIssued >= ruleSet.ResubmissionPolicy.MaximumAuthorizations
                || resubmissionDueAtUtc > DateTimeOffset.UtcNow.AddDays(ruleSet.ResubmissionPolicy.MaximumDeadlineDays)) return false;
        }
        // Requests created before a calculation was persisted are reconstructed
        // from their immutable criterion decisions and rule-set snapshot.
        if (request.CalculatedGrade is null)
        {
            if (!BtecAssessmentRuleSet.TryRead(request.AssessmentRuleSetSnapshotJson, out var calculationRuleSet)) return false;
            var calculation = EvaluationAssessmentCalculator.Calculate(results.Select(result => new CriterionSubmission(result.CriterionCode, result.Achievement.ToString(), result.Evidence, result.Comment)), calculationRuleSet);
            request.CalculatedGrade = calculation.Grade;
            request.CalculatedScore = null;
            request.SectionResultsJson = JsonSerializer.Serialize(calculation.Sections);
        }
        var previousStatus = request.Status;
        request.Status = destination;
        db.InternalVerifications.Add(new InternalVerification { EvaluationRequestId = requestId, VerifierUserId = adminUserId, Decision = complete ? "Approved" : "ResubmissionRequested", Comment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim() });
        if (!complete)
        {
            db.ResubmissionAuthorizations.Add(new ResubmissionAuthorization
            {
                EvaluationRequestId = requestId,
                AuthorizedByUserId = adminUserId,
                AttemptNumber = request.SubmissionAttemptNumber + 1,
                RuleSetVersion = ruleSet!.Version,
                Reason = comment!.Trim(),
                AuthorizedAtUtc = DateTimeOffset.UtcNow,
                DueAtUtc = resubmissionDueAtUtc!.Value
            });
        }
        if (sample is not null)
        {
            sample.Status = complete
                ? InternalVerificationSampleStatus.Accepted
                : InternalVerificationSampleStatus.ReturnedToAssessor;
            sample.DecisionComment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();
            sample.DecidedAtUtc = DateTimeOffset.UtcNow;
            RecordAssessmentEvent(request, adminUserId, "InternalVerificationSampleResolved", previousStatus, destination, sample.DecisionComment, request.SubmissionAttemptNumber, null);
        }
        if (!string.IsNullOrWhiteSpace(comment)) db.EvaluationFeedbackItems.Add(new EvaluationFeedback { EvaluationRequestId = requestId, AuthorUserId = adminUserId, Body = comment.Trim(), RequestsResubmission = !complete });
        db.Notifications.Add(new Notification { UserId = request.StudentUserId, Title = complete ? "Evaluation verified" : "Evaluation needs revision", Body = complete ? "Your evaluation has been internally verified." : "Review the feedback and submit an updated assignment.", Type = NotificationType.Evaluation, DeepLink = "/student/evaluations" });
        RecordAssessmentEvent(request, adminUserId, complete ? "InternalVerificationAccepted" : "ResubmissionRequested", previousStatus, destination, comment, request.SubmissionAttemptNumber, null);
        db.AuditLogs.Add(Audit(adminUserId, complete ? "EvaluationInternallyVerified" : "EvaluationResubmissionRequested", nameof(EvaluationRequest), requestId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static EvaluationView ToView(EvaluationRequest request, IReadOnlyCollection<string> criteria) => new(request.Id, request.Status.ToString(), request.Price, request.Currency, request.StudentComment, criteria);
    private static AuditLog Audit(string actor, string action, string entityType, string entityId) => new() { ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId, Outcome = "Success" };

    private void RecordAssessmentEvent(
        EvaluationRequest request,
        string? actorUserId,
        string eventType,
        EvaluationStatus? fromStatus,
        EvaluationStatus? toStatus,
        string? reason,
        int? attemptNumber,
        string? correlationId) =>
        db.AssessmentAuditEvents.Add(new AssessmentAuditEvent
        {
            EvaluationRequestId = request.Id,
            ActorUserId = actorUserId,
            EventType = eventType,
            FromStatus = fromStatus?.ToString(),
            ToStatus = toStatus?.ToString(),
            Reason = Trim(reason, 4_000),
            AttemptNumber = attemptNumber,
            CorrelationId = Trim(correlationId, 128),
            OccurredAtUtc = DateTimeOffset.UtcNow
        });

    private static string? Trim(string? value, int maximum) => string.IsNullOrWhiteSpace(value)
        ? null
        : value.Trim()[..Math.Min(value.Trim().Length, maximum)];
}
