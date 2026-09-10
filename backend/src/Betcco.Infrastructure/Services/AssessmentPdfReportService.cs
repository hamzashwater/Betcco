using Betcco.Application.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public interface IAssessmentPdfRenderer
{
    bool IsConfigured { get; }
    string? UnavailableReason { get; }
    byte[] Render(AssessmentPdfReportModel report);
}

public sealed record AssessmentPdfReportModel(
    bool IsArabic,
    Guid EvaluationRequestId,
    string StudentUserId,
    string Status,
    string? CalculatedOutcome,
    int AttemptNumber,
    string AssessmentRuleSetVersion,
    string? QualificationVersionSnapshotJson,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyCollection<AssessmentPdfCriterion> Criteria,
    IReadOnlyCollection<AssessmentPdfDeclaration> Declarations,
    IReadOnlyCollection<AssessmentPdfVerification> Verifications,
    IReadOnlyCollection<AssessmentPdfAppeal> Appeals);

public sealed record AssessmentPdfCriterion(string Code, string Achievement, string? Evidence, string? Comment);
public sealed record AssessmentPdfDeclaration(int AttemptNumber, string PolicyVersion, DateTimeOffset DeclaredAtUtc);
public sealed record AssessmentPdfVerification(string Decision, string? Comment, DateTimeOffset VerifiedAtUtc);
public sealed record AssessmentPdfAppeal(string Status, string Reason, string? DecisionRationale, DateTimeOffset CreatedAtUtc, DateTimeOffset? ReviewedAtUtc);

public sealed class AssessmentPdfReportService(
    BetccoDbContext db,
    IAssessorEligibilityService assessorEligibility,
    IAssessmentPdfRenderer renderer) : IAssessmentPdfReportService
{
    public bool IsConfigured => renderer.IsConfigured;
    public string? UnavailableReason => renderer.UnavailableReason;

    public async Task<AssessmentPdfReport?> CreateAsync(
        string leadVerifierUserId,
        Guid evaluationRequestId,
        string? locale,
        CancellationToken cancellationToken = default)
    {
        if (!renderer.IsConfigured
            || !await assessorEligibility.IsEligibleLeadVerifierAsync(leadVerifierUserId, cancellationToken))
            return null;

        var request = await db.EvaluationRequests
            .AsNoTracking()
            .Include(item => item.CriterionResults)
            .Include(item => item.AuthenticityDeclarations)
            .Include(item => item.InternalVerifications)
            .Include(item => item.Appeals)
            .SingleOrDefaultAsync(item => item.Id == evaluationRequestId, cancellationToken);
        if (request is null) return null;

        var report = new AssessmentPdfReportModel(
            locale?.StartsWith("ar", StringComparison.OrdinalIgnoreCase) == true,
            request.Id,
            request.StudentUserId,
            request.Status.ToString(),
            request.CalculatedGrade?.ToString(),
            request.SubmissionAttemptNumber,
            request.AssessmentRuleSetVersion,
            request.QualificationVersionSnapshotJson,
            request.CreatedAtUtc,
            request.CriterionResults.OrderBy(item => item.CriterionCode)
                .Select(item => new AssessmentPdfCriterion(item.CriterionCode, item.Achievement.ToString(), item.Evidence, item.Comment))
                .ToArray(),
            request.AuthenticityDeclarations.OrderBy(item => item.AttemptNumber).ThenBy(item => item.DeclaredAtUtc)
                .Select(item => new AssessmentPdfDeclaration(item.AttemptNumber, item.PolicyVersion, item.DeclaredAtUtc))
                .ToArray(),
            request.InternalVerifications.OrderBy(item => item.VerifiedAtUtc)
                .Select(item => new AssessmentPdfVerification(item.Decision, item.Comment, item.VerifiedAtUtc))
                .ToArray(),
            request.Appeals.OrderBy(item => item.CreatedAtUtc)
                .Select(item => new AssessmentPdfAppeal(item.Status.ToString(), item.Reason, item.DecisionRationale, item.CreatedAtUtc, item.ReviewedAtUtc))
                .ToArray());
        var content = renderer.Render(report);
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = leadVerifierUserId,
            Action = "AssessmentPdfReportExported",
            EntityType = "EvaluationRequest",
            EntityId = request.Id.ToString(),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return new AssessmentPdfReport(
            $"betcco-assessment-report-{request.Id:N}-{DateTimeOffset.UtcNow:yyyyMMddTHHmmssZ}.pdf",
            content);
    }
}

public sealed class DisabledAssessmentPdfRenderer(string reason) : IAssessmentPdfRenderer
{
    public bool IsConfigured => false;
    public string? UnavailableReason => reason;

    public byte[] Render(AssessmentPdfReportModel report) =>
        throw new InvalidOperationException(UnavailableReason);
}
