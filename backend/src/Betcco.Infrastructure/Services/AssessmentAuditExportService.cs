using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Betcco.Application.Evaluations;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Produces a private, structured audit artefact. This intentionally does not
/// expose object-storage keys, IP addresses, user agents, or student data that
/// is unnecessary for the quality-assurance record.
/// </summary>
public sealed class AssessmentAuditExportService(
    BetccoDbContext db,
    IAssessorEligibilityService assessorEligibility) : IAssessmentAuditExportService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public async Task<AssessmentAuditExport?> CreateAsync(
        string leadVerifierUserId,
        Guid evaluationRequestId,
        CancellationToken cancellationToken = default)
    {
        if (!await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken))
            return null;

        var request = await db.EvaluationRequests
            .AsNoTracking()
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
            .Select(item => new
            {
                item.EvaluatorUserId,
                item.AssignedByUserId,
                item.AssignedAtUtc
            })
            .ToArrayAsync(cancellationToken);
        var payload = new
        {
            schemaVersion = "betcco-assessment-audit-v1",
            generatedAtUtc = DateTimeOffset.UtcNow,
            evaluation = new
            {
                request.Id,
                status = request.Status.ToString(),
                request.SubmissionAttemptNumber,
                calculatedOutcome = request.CalculatedGrade?.ToString(),
                request.AssessmentRuleSetVersion,
                request.AssessmentRuleSetSnapshotJson,
                request.QualificationVersionId,
                request.QualificationVersionSnapshotJson,
                request.CriteriaSnapshotJson,
                request.EvaluatorCriteriaPlanJson,
                request.SectionResultsJson,
                request.CreatedAtUtc,
                request.UpdatedAtUtc
            },
            evaluatorAssignments = assignments,
            submissions = request.SubmissionFiles
                .OrderBy(item => item.CreatedAtUtc)
                .Select(item => new
                {
                    item.Id,
                    item.OriginalFileName,
                    item.ContentType,
                    item.LengthBytes,
                    scanStatus = item.ScanStatus.ToString(),
                    item.CreatedAtUtc
                }),
            authenticityDeclarations = request.AuthenticityDeclarations
                .OrderBy(item => item.AttemptNumber)
                .ThenBy(item => item.DeclaredAtUtc)
                .Select(item => new
                {
                    item.AttemptNumber,
                    item.PolicyVersion,
                    item.StatementSnapshot,
                    item.DeclaredAtUtc
                }),
            criterionDecisions = request.CriterionResults
                .OrderBy(item => item.CriterionCode)
                .Select(item => new
                {
                    item.CriterionCode,
                    achievement = item.Achievement.ToString(),
                    item.Evidence,
                    item.Comment,
                    item.CreatedAtUtc,
                    item.UpdatedAtUtc
                }),
            evidence = request.EvidenceItems
                .OrderBy(item => item.CriterionCode)
                .Select(item => new { item.CriterionCode, item.Narrative, item.CreatedAtUtc, item.UpdatedAtUtc }),
            feedback = request.FeedbackItems
                .OrderBy(item => item.CreatedAtUtc)
                .Select(item => new { item.AuthorUserId, item.Body, item.RequestsResubmission, item.CreatedAtUtc }),
            internalVerification = new
            {
                decisions = request.InternalVerifications
                    .OrderBy(item => item.VerifiedAtUtc)
                    .Select(item => new { item.VerifierUserId, item.Decision, item.Comment, item.VerifiedAtUtc }),
                samples = request.InternalVerificationSamples
                    .OrderBy(item => item.SelectedAtUtc)
                    .Select(item => new
                    {
                        item.SubmissionAttemptNumber,
                        item.SelectedByUserId,
                        item.AssignedVerifierUserId,
                        item.SelectionRationale,
                        sampleStatus = item.Status.ToString(),
                        item.DecisionComment,
                        item.SelectedAtUtc,
                        item.DecidedAtUtc,
                        plan = item.InternalVerificationPlan is null ? null : new
                        {
                            item.InternalVerificationPlan.SelectionRationale,
                            item.InternalVerificationPlan.ActiveFromUtc,
                            item.InternalVerificationPlan.ActiveUntilUtc
                        }
                    })
            },
            resubmissionAuthorizations = request.ResubmissionAuthorizations
                .OrderBy(item => item.AttemptNumber)
                .Select(item => new
                {
                    item.AuthorizedByUserId,
                    item.AttemptNumber,
                    item.RuleSetVersion,
                    item.Reason,
                    item.AuthorizedAtUtc,
                    item.DueAtUtc,
                    item.SubmittedAtUtc,
                    item.RevokedAtUtc
                }),
            appeals = request.Appeals
                .OrderBy(item => item.CreatedAtUtc)
                .Select(item => new
                {
                    appealStatus = item.Status.ToString(),
                    item.Reason,
                    item.ReviewedByUserId,
                    item.DecisionRationale,
                    item.CreatedAtUtc,
                    item.ReviewedAtUtc,
                    item.WithdrawnAtUtc
                }),
            academicAuditTrail = request.AssessmentAuditEvents
                .OrderBy(item => item.OccurredAtUtc)
                .ThenBy(item => item.Id)
                .Select(item => new
                {
                    item.Id,
                    item.ActorUserId,
                    item.EventType,
                    item.FromStatus,
                    item.ToStatus,
                    item.Reason,
                    item.AttemptNumber,
                    item.CorrelationId,
                    item.OccurredAtUtc
                })
        };
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload, JsonOptions);
        var payloadSha256 = Convert.ToHexString(SHA256.HashData(payloadBytes)).ToLowerInvariant();
        var jsonContent = JsonSerializer.Serialize(new
        {
            payloadSha256,
            payload
        }, JsonOptions);
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
            $"betcco-assessment-audit-{evaluationRequestId:N}-{DateTimeOffset.UtcNow:yyyyMMddTHHmmssZ}.json",
            jsonContent,
            payloadSha256);
    }
}
