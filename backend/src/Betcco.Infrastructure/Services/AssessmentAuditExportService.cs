using System.Security.Cryptography;
using System.Text.Json;
using Betcco.Application.Evaluations;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Produces a private, structured audit artefact from an explicit safe export
/// contract. Database identifiers and operational request metadata are used
/// only to assemble the export and are never serialized into it.
/// </summary>
public sealed class AssessmentAuditExportService(
    BetccoDbContext db,
    IAssessorEligibilityService assessorEligibility) : IAssessmentAuditExportService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };
    private static readonly JsonSerializerOptions ChecksumJsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<AssessmentAuditExport?> CreateAsync(
        string leadVerifierUserId,
        Guid evaluationRequestId,
        CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken))
            return null;

        var request = await db.EvaluationRequests
            .AsNoTracking()
            .AsSplitQuery()
            .Include(item => item.SubmissionFiles)
            .Include(item => item.CriterionResults)
            .Include(item => item.EvidenceItems)
            .Include(item => item.FeedbackItems)
            .Include(item => item.InternalVerifications)
            .Include(item => item.InternalVerificationSamples)
            .ThenInclude(item => item.InternalVerificationPlan)
            .Include(item => item.AuthenticityDeclarations)
            .Include(item => item.ResubmissionAuthorizations)
            .Include(item => item.Appeals)
            .Include(item => item.AssessmentAuditEvents)
            .SingleOrDefaultAsync(item => item.Id == evaluationRequestId, cancellationToken);
        if (request is null) return null;

        var assignments = await db.EvaluatorAssignments
            .AsNoTracking()
            .Where(item => item.EvaluationRequestId == evaluationRequestId)
            .OrderBy(item => item.AssignedAtUtc)
            .ToArrayAsync(cancellationToken);
        var userIds = assignments.SelectMany(item => new[] { item.EvaluatorUserId, item.AssignedByUserId })
            .Concat(request.FeedbackItems.Select(item => item.AuthorUserId))
            .Concat(request.InternalVerifications.Select(item => item.VerifierUserId))
            .Concat(request.InternalVerificationSamples.SelectMany(item => new[] { item.SelectedByUserId, item.AssignedVerifierUserId }))
            .Concat(request.ResubmissionAuthorizations.Select(item => item.AuthorizedByUserId))
            .Concat(request.Appeals.Select(item => item.ReviewedByUserId))
            .Concat(request.AssessmentAuditEvents.Select(item => item.ActorUserId))
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => Guid.TryParse(item, out var id) ? id : (Guid?)null)
            .Where(item => item.HasValue)
            .Select(item => item!.Value)
            .Distinct()
            .ToArray();
        var displayNames = await db.Users.AsNoTracking()
            .Where(user => userIds.Contains(user.Id))
            .Select(user => new { user.Id, user.DisplayName })
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);
        string? DisplayName(string? userId) =>
            Guid.TryParse(userId, out var id) ? displayNames.GetValueOrDefault(id) : null;
        string FeedbackAuthorRole(string userId) => assignments.Any(item =>
            string.Equals(item.EvaluatorUserId, userId, StringComparison.OrdinalIgnoreCase))
                ? "Assessor"
                : "InternalVerifier";

        var exportedAtUtc = DateTimeOffset.UtcNow;
        var payload = new AssessmentAuditPayload(
            "betcco-assessment-audit-v2",
            exportedAtUtc,
            new AssessmentAuditEvaluation(
                request.Status.ToString(),
                request.SubmissionAttemptNumber,
                request.CalculatedGrade?.ToString(),
                request.AssessmentRuleSetVersion,
                ParseRuleSetSnapshot(request.AssessmentRuleSetSnapshotJson),
                ParseQualificationSnapshot(request.QualificationVersionSnapshotJson),
                ParseStringArray(request.CriteriaSnapshotJson),
                ParseStringArray(request.EvaluatorCriteriaPlanJson),
                ParseSectionResults(request.SectionResultsJson),
                request.CreatedAtUtc,
                request.UpdatedAtUtc),
            assignments.Select(item => new AssessmentAuditAssignment(
                    new AssessmentAuditActor("Assessor", DisplayName(item.EvaluatorUserId)),
                    new AssessmentAuditActor("AssessmentAssigner", DisplayName(item.AssignedByUserId)),
                    item.AssignedAtUtc))
                .ToArray(),
            request.SubmissionFiles.OrderBy(item => item.CreatedAtUtc)
                .Select(item => new AssessmentAuditSubmission(
                    item.OriginalFileName,
                    item.ContentType,
                    item.LengthBytes,
                    item.ScanStatus.ToString(),
                    item.CreatedAtUtc))
                .ToArray(),
            request.AuthenticityDeclarations.OrderBy(item => item.AttemptNumber).ThenBy(item => item.DeclaredAtUtc)
                .Select(item => new AssessmentAuditAuthenticityDeclaration(
                    item.AttemptNumber,
                    item.PolicyVersion,
                    item.StatementSnapshot,
                    item.DeclaredAtUtc))
                .ToArray(),
            request.CriterionResults.OrderBy(item => item.CriterionCode)
                .Select(item => new AssessmentAuditCriterionDecision(
                    item.CriterionCode,
                    item.Achievement.ToString(),
                    item.Evidence,
                    item.Comment,
                    item.CreatedAtUtc,
                    item.UpdatedAtUtc))
                .ToArray(),
            request.EvidenceItems.OrderBy(item => item.CriterionCode)
                .Select(item => new AssessmentAuditEvidence(
                    item.CriterionCode,
                    item.Narrative,
                    item.CreatedAtUtc,
                    item.UpdatedAtUtc))
                .ToArray(),
            request.FeedbackItems.OrderBy(item => item.CreatedAtUtc)
                .Select(item => new AssessmentAuditFeedback(
                    new AssessmentAuditActor(FeedbackAuthorRole(item.AuthorUserId), DisplayName(item.AuthorUserId)),
                    item.Body,
                    item.RequestsResubmission,
                    item.CreatedAtUtc))
                .ToArray(),
            new AssessmentAuditInternalVerification(
                request.InternalVerifications.OrderBy(item => item.VerifiedAtUtc)
                    .Select(item => new AssessmentAuditVerificationDecision(
                        new AssessmentAuditActor("InternalVerifier", DisplayName(item.VerifierUserId)),
                        item.Decision,
                        item.Comment,
                        item.VerifiedAtUtc))
                    .ToArray(),
                request.InternalVerificationSamples.OrderBy(item => item.SelectedAtUtc)
                    .Select(item => new AssessmentAuditVerificationSample(
                        item.SubmissionAttemptNumber,
                        new AssessmentAuditActor("LeadInternalVerifier", DisplayName(item.SelectedByUserId)),
                        new AssessmentAuditActor("InternalVerifier", DisplayName(item.AssignedVerifierUserId)),
                        item.SelectionRationale,
                        item.Status.ToString(),
                        item.DecisionComment,
                        item.SelectedAtUtc,
                        item.DecidedAtUtc,
                        item.InternalVerificationPlan is null
                            ? null
                            : new AssessmentAuditVerificationPlan(
                                item.InternalVerificationPlan.SelectionRationale,
                                item.InternalVerificationPlan.ActiveFromUtc,
                                item.InternalVerificationPlan.ActiveUntilUtc)))
                    .ToArray()),
            request.ResubmissionAuthorizations.OrderBy(item => item.AttemptNumber)
                .Select(item => new AssessmentAuditResubmissionAuthorization(
                    new AssessmentAuditActor("InternalVerifier", DisplayName(item.AuthorizedByUserId)),
                    item.AttemptNumber,
                    item.RuleSetVersion,
                    item.Reason,
                    item.AuthorizedAtUtc,
                    item.DueAtUtc,
                    item.SubmittedAtUtc,
                    item.RevokedAtUtc))
                .ToArray(),
            request.Appeals.OrderBy(item => item.CreatedAtUtc)
                .Select(item => new AssessmentAuditAppeal(
                    item.Status.ToString(),
                    item.Reason,
                    item.ReviewedByUserId is null
                        ? null
                        : new AssessmentAuditActor("LeadInternalVerifier", DisplayName(item.ReviewedByUserId)),
                    item.DecisionRationale,
                    item.CreatedAtUtc,
                    item.ReviewedAtUtc,
                    item.WithdrawnAtUtc))
                .ToArray(),
            request.AssessmentAuditEvents.OrderBy(item => item.OccurredAtUtc).ThenBy(item => item.Id)
                .Select(item => new AssessmentAuditEventEntry(
                    item.ActorUserId is null
                        ? null
                        : new AssessmentAuditActor(ActorRole(item.EventType), DisplayName(item.ActorUserId)),
                    item.EventType,
                    item.FromStatus,
                    item.ToStatus,
                    AcademicReason(item.EventType, item.Reason),
                    item.AttemptNumber,
                    item.OccurredAtUtc))
                .ToArray());
        var payloadElement = JsonSerializer.SerializeToElement(payload, ChecksumJsonOptions);
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payloadElement, ChecksumJsonOptions);
        var payloadSha256 = Convert.ToHexString(SHA256.HashData(payloadBytes)).ToLowerInvariant();
        var jsonContent = JsonSerializer.Serialize(new AssessmentAuditEnvelope(payloadSha256, payloadElement), JsonOptions);
        db.AuditLogs.Add(new()
        {
            ActorUserId = leadVerifierUserId,
            Action = "AssessmentAuditExported",
            EntityType = "EvaluationRequest",
            EntityId = evaluationRequestId.ToString(),
            Outcome = "Success",
            MetadataJson = JsonSerializer.Serialize(new { payloadSha256 })
        });
        await db.SaveChangesAsync(cancellationToken);
        return new AssessmentAuditExport(
            $"betcco-assessment-audit-{exportedAtUtc:yyyyMMddTHHmmssfffZ}.json",
            jsonContent,
            payloadSha256);
    }

    private static AssessmentAuditRuleSet? ParseRuleSetSnapshot(string snapshotJson)
    {
        if (!BtecAssessmentRuleSet.TryRead(snapshotJson, out var ruleSet)) return null;

        return new AssessmentAuditRuleSet(
            ruleSet.Version,
            ruleSet.OutcomeRules
                .Select(rule => new AssessmentAuditOutcomeRule(rule.Outcome, rule.RequiredBands.ToArray()))
                .ToArray(),
            new AssessmentAuditResubmissionPolicy(
                ruleSet.ResubmissionPolicy.MaximumAuthorizations,
                ruleSet.ResubmissionPolicy.MaximumDeadlineDays));
    }

    private static AssessmentAuditQualification? ParseQualificationSnapshot(string? snapshotJson)
    {
        if (string.IsNullOrWhiteSpace(snapshotJson)) return null;

        try
        {
            using var document = JsonDocument.Parse(snapshotJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return null;

            var root = document.RootElement;
            var qualification = GetObject(root, "qualification") ?? root;
            var version = GetObject(root, "version") ?? root;
            var parsed = new AssessmentAuditQualification(
                GetString(root, "qualificationCode") ?? GetString(qualification, "code"),
                GetString(root, "qualificationArabicName") ?? GetString(qualification, "arabicName"),
                GetString(root, "qualificationEnglishName") ?? GetString(qualification, "englishName"),
                GetString(root, "versionCode") ?? GetString(version, "code"),
                GetString(root, "sourceReference") ?? GetString(version, "sourceReference"),
                GetDateTimeOffset(root, "effectiveFromUtc") ?? GetDateTimeOffset(version, "effectiveFromUtc"),
                GetDateTimeOffset(root, "effectiveUntilUtc") ?? GetDateTimeOffset(version, "effectiveUntilUtc"));
            return parsed.QualificationCode is not null && parsed.VersionCode is not null && parsed.SourceReference is not null
                ? parsed
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IReadOnlyCollection<string> ParseStringArray(string snapshotJson)
    {
        try
        {
            return (JsonSerializer.Deserialize<string[]>(snapshotJson, JsonOptions) ?? [])
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToArray();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IReadOnlyCollection<EvaluationSectionResult> ParseSectionResults(string snapshotJson)
    {
        try
        {
            return JsonSerializer.Deserialize<EvaluationSectionResult[]>(snapshotJson, JsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static JsonElement? GetObject(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Object ? value : null;

    private static string? GetString(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static DateTimeOffset? GetDateTimeOffset(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && value.TryGetDateTimeOffset(out var parsed)
            ? parsed
            : null;

    private static string ActorRole(string eventType) => eventType switch
    {
        "DraftCreated" or "AuthenticityDeclared" or "PaymentConfirmed" or "ResubmissionSubmitted"
            or "AppealSubmitted" or "AppealWithdrawn" => "Learner",
        "AssessorAssigned" => "AssessmentAssigner",
        "CriteriaPlanSet" or "AssessmentSubmittedForVerification" or "AssessmentDecisionUpdated" => "Assessor",
        "InternalVerificationSampleSelected" or "AppealUpheld" or "AppealRejected" => "LeadInternalVerifier",
        "InternalVerificationSampleResolved" or "InternalVerificationAccepted" or "ResubmissionRequested" => "InternalVerifier",
        _ => "AcademicWorkflowActor"
    };

    private static string? AcademicReason(string eventType, string? reason) =>
        eventType == "PaymentConfirmed" ? null : reason;

    private sealed record AssessmentAuditEnvelope(string PayloadSha256, JsonElement Payload);
    private sealed record AssessmentAuditPayload(
        string SchemaVersion,
        DateTimeOffset GeneratedAtUtc,
        AssessmentAuditEvaluation Evaluation,
        IReadOnlyCollection<AssessmentAuditAssignment> EvaluatorAssignments,
        IReadOnlyCollection<AssessmentAuditSubmission> Submissions,
        IReadOnlyCollection<AssessmentAuditAuthenticityDeclaration> AuthenticityDeclarations,
        IReadOnlyCollection<AssessmentAuditCriterionDecision> CriterionDecisions,
        IReadOnlyCollection<AssessmentAuditEvidence> Evidence,
        IReadOnlyCollection<AssessmentAuditFeedback> Feedback,
        AssessmentAuditInternalVerification InternalVerification,
        IReadOnlyCollection<AssessmentAuditResubmissionAuthorization> ResubmissionAuthorizations,
        IReadOnlyCollection<AssessmentAuditAppeal> Appeals,
        IReadOnlyCollection<AssessmentAuditEventEntry> AcademicAuditTrail);
    private sealed record AssessmentAuditEvaluation(
        string Status,
        int SubmissionAttemptNumber,
        string? CalculatedOutcome,
        string AssessmentRuleSetVersion,
        AssessmentAuditRuleSet? AssessmentRuleSet,
        AssessmentAuditQualification? Qualification,
        IReadOnlyCollection<string> Criteria,
        IReadOnlyCollection<string> EvaluatorCriteriaPlan,
        IReadOnlyCollection<EvaluationSectionResult> SectionResults,
        DateTimeOffset CreatedAtUtc,
        DateTimeOffset UpdatedAtUtc);
    private sealed record AssessmentAuditRuleSet(
        string Version,
        IReadOnlyCollection<AssessmentAuditOutcomeRule> OutcomeRules,
        AssessmentAuditResubmissionPolicy ResubmissionPolicy);
    private sealed record AssessmentAuditOutcomeRule(string Outcome, IReadOnlyCollection<string> RequiredBands);
    private sealed record AssessmentAuditResubmissionPolicy(int MaximumAuthorizations, int MaximumDeadlineDays);
    private sealed record AssessmentAuditQualification(
        string? QualificationCode,
        string? QualificationArabicName,
        string? QualificationEnglishName,
        string? VersionCode,
        string? SourceReference,
        DateTimeOffset? EffectiveFromUtc,
        DateTimeOffset? EffectiveUntilUtc);
    private sealed record AssessmentAuditActor(string Role, string? DisplayName);
    private sealed record AssessmentAuditAssignment(AssessmentAuditActor Assessor, AssessmentAuditActor AssignedBy, DateTimeOffset AssignedAtUtc);
    private sealed record AssessmentAuditSubmission(string OriginalFileName, string ContentType, long LengthBytes, string ScanStatus, DateTimeOffset CreatedAtUtc);
    private sealed record AssessmentAuditAuthenticityDeclaration(int AttemptNumber, string PolicyVersion, string StatementSnapshot, DateTimeOffset DeclaredAtUtc);
    private sealed record AssessmentAuditCriterionDecision(string CriterionCode, string Achievement, string? Evidence, string? Comment, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc);
    private sealed record AssessmentAuditEvidence(string CriterionCode, string Narrative, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc);
    private sealed record AssessmentAuditFeedback(AssessmentAuditActor Author, string Body, bool RequestsResubmission, DateTimeOffset CreatedAtUtc);
    private sealed record AssessmentAuditInternalVerification(
        IReadOnlyCollection<AssessmentAuditVerificationDecision> Decisions,
        IReadOnlyCollection<AssessmentAuditVerificationSample> Samples);
    private sealed record AssessmentAuditVerificationDecision(AssessmentAuditActor Verifier, string Decision, string? Comment, DateTimeOffset VerifiedAtUtc);
    private sealed record AssessmentAuditVerificationSample(
        int SubmissionAttemptNumber,
        AssessmentAuditActor SelectedBy,
        AssessmentAuditActor AssignedVerifier,
        string SelectionRationale,
        string SampleStatus,
        string? DecisionComment,
        DateTimeOffset SelectedAtUtc,
        DateTimeOffset? DecidedAtUtc,
        AssessmentAuditVerificationPlan? Plan);
    private sealed record AssessmentAuditVerificationPlan(string SelectionRationale, DateTimeOffset ActiveFromUtc, DateTimeOffset? ActiveUntilUtc);
    private sealed record AssessmentAuditResubmissionAuthorization(
        AssessmentAuditActor AuthorizedBy,
        int AttemptNumber,
        string RuleSetVersion,
        string Reason,
        DateTimeOffset AuthorizedAtUtc,
        DateTimeOffset DueAtUtc,
        DateTimeOffset? SubmittedAtUtc,
        DateTimeOffset? RevokedAtUtc);
    private sealed record AssessmentAuditAppeal(
        string AppealStatus,
        string Reason,
        AssessmentAuditActor? ReviewedBy,
        string? DecisionRationale,
        DateTimeOffset CreatedAtUtc,
        DateTimeOffset? ReviewedAtUtc,
        DateTimeOffset? WithdrawnAtUtc);
    private sealed record AssessmentAuditEventEntry(
        AssessmentAuditActor? Actor,
        string EventType,
        string? FromStatus,
        string? ToStatus,
        string? Reason,
        int? AttemptNumber,
        DateTimeOffset OccurredAtUtc);
}
