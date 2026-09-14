using Betcco.Application.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

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
    string? StudentDisplayName,
    string Status,
    string? OverallOutcome,
    int AttemptNumber,
    string AssessmentRuleSetVersion,
    AssessmentPdfQualification? Qualification,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset ExportedAtUtc,
    IReadOnlyCollection<AssessmentPdfCriterion> Criteria,
    IReadOnlyCollection<AssessmentPdfDeclaration> Declarations,
    IReadOnlyCollection<AssessmentPdfVerification> Verifications,
    IReadOnlyCollection<AssessmentPdfVerificationSample> VerificationSamples,
    IReadOnlyCollection<AssessmentPdfResubmission> Resubmissions,
    IReadOnlyCollection<AssessmentPdfAppeal> Appeals);

public sealed record AssessmentPdfCriterion(string Code, string Achievement, string? Evidence, string? Comment);
public sealed record AssessmentPdfDeclaration(int AttemptNumber, string PolicyVersion, string Statement, DateTimeOffset DeclaredAtUtc);
public sealed record AssessmentPdfVerification(string Decision, string? Comment, DateTimeOffset VerifiedAtUtc);
public sealed record AssessmentPdfVerificationSample(
    int AttemptNumber,
    string SelectionRationale,
    string Status,
    string? DecisionComment,
    DateTimeOffset SelectedAtUtc,
    DateTimeOffset? DecidedAtUtc);
public sealed record AssessmentPdfResubmission(
    int AttemptNumber,
    string RuleSetVersion,
    string Reason,
    DateTimeOffset AuthorizedAtUtc,
    DateTimeOffset DueAtUtc,
    DateTimeOffset? SubmittedAtUtc,
    DateTimeOffset? RevokedAtUtc);
public sealed record AssessmentPdfAppeal(string Status, string Reason, string? DecisionRationale, DateTimeOffset CreatedAtUtc, DateTimeOffset? ReviewedAtUtc);
public sealed record AssessmentPdfQualification(
    AssessmentPdfQualificationSnapshotStatus SnapshotStatus,
    string? Code,
    string? ArabicName,
    string? EnglishName,
    string? VersionCode,
    string? SourceReference,
    DateTimeOffset? EffectiveFromUtc,
    DateTimeOffset? EffectiveUntilUtc);

public enum AssessmentPdfQualificationSnapshotStatus
{
    Available,
    Unsupported,
    Malformed
}

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
            .Include(item => item.InternalVerificationSamples)
            .Include(item => item.ResubmissionAuthorizations)
            .Include(item => item.Appeals)
            .SingleOrDefaultAsync(item => item.Id == evaluationRequestId, cancellationToken);
        if (request is null) return null;

        string? studentDisplayName = null;
        if (Guid.TryParse(request.StudentUserId, out var studentUserId))
        {
            studentDisplayName = await db.Users
                .AsNoTracking()
                .Where(user => user.Id == studentUserId)
                .Select(user => user.DisplayName)
                .SingleOrDefaultAsync(cancellationToken);
        }

        var exportedAtUtc = DateTimeOffset.UtcNow;

        var report = new AssessmentPdfReportModel(
            locale?.StartsWith("ar", StringComparison.OrdinalIgnoreCase) == true,
            request.Id,
            studentDisplayName,
            request.Status.ToString(),
            request.CalculatedGrade?.ToString(),
            request.SubmissionAttemptNumber,
            request.AssessmentRuleSetVersion,
            ParseQualificationSnapshot(request.QualificationVersionSnapshotJson),
            request.CreatedAtUtc,
            exportedAtUtc,
            request.CriterionResults.OrderBy(item => item.CriterionCode)
                .Select(item => new AssessmentPdfCriterion(item.CriterionCode, item.Achievement.ToString(), item.Evidence, item.Comment))
                .ToArray(),
            request.AuthenticityDeclarations.OrderBy(item => item.AttemptNumber).ThenBy(item => item.DeclaredAtUtc)
                .Select(item => new AssessmentPdfDeclaration(item.AttemptNumber, item.PolicyVersion, item.StatementSnapshot, item.DeclaredAtUtc))
                .ToArray(),
            request.InternalVerifications.OrderBy(item => item.VerifiedAtUtc)
                .Select(item => new AssessmentPdfVerification(item.Decision, item.Comment, item.VerifiedAtUtc))
                .ToArray(),
            request.InternalVerificationSamples.OrderBy(item => item.SelectedAtUtc)
                .Select(item => new AssessmentPdfVerificationSample(
                    item.SubmissionAttemptNumber,
                    item.SelectionRationale,
                    item.Status.ToString(),
                    item.DecisionComment,
                    item.SelectedAtUtc,
                    item.DecidedAtUtc))
                .ToArray(),
            request.ResubmissionAuthorizations.OrderBy(item => item.AttemptNumber).ThenBy(item => item.AuthorizedAtUtc)
                .Select(item => new AssessmentPdfResubmission(
                    item.AttemptNumber,
                    item.RuleSetVersion,
                    item.Reason,
                    item.AuthorizedAtUtc,
                    item.DueAtUtc,
                    item.SubmittedAtUtc,
                    item.RevokedAtUtc))
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
            $"betcco-assessment-report-{request.Id:N}-{exportedAtUtc:yyyyMMddTHHmmssZ}.pdf",
            content);
    }

    private static AssessmentPdfQualification? ParseQualificationSnapshot(string? snapshotJson)
    {
        if (string.IsNullOrWhiteSpace(snapshotJson)) return null;

        try
        {
            using var document = JsonDocument.Parse(snapshotJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return UnavailableQualification(AssessmentPdfQualificationSnapshotStatus.Unsupported);

            var root = document.RootElement;
            var qualification = GetObject(root, "qualification") ?? root;
            var version = GetObject(root, "version") ?? root;
            var parsed = new AssessmentPdfQualification(
                AssessmentPdfQualificationSnapshotStatus.Available,
                GetString(root, "qualificationCode") ?? GetString(qualification, "code"),
                GetString(root, "qualificationArabicName") ?? GetString(qualification, "arabicName"),
                GetString(root, "qualificationEnglishName") ?? GetString(qualification, "englishName"),
                GetString(root, "versionCode") ?? GetString(version, "code"),
                GetString(root, "sourceReference") ?? GetString(version, "sourceReference"),
                GetDateTimeOffset(root, "effectiveFromUtc") ?? GetDateTimeOffset(version, "effectiveFromUtc"),
                GetDateTimeOffset(root, "effectiveUntilUtc") ?? GetDateTimeOffset(version, "effectiveUntilUtc"));

            return HasUsefulQualificationValue(parsed)
                ? parsed
                : UnavailableQualification(AssessmentPdfQualificationSnapshotStatus.Unsupported);
        }
        catch (JsonException)
        {
            return UnavailableQualification(AssessmentPdfQualificationSnapshotStatus.Malformed);
        }
    }

    private static AssessmentPdfQualification UnavailableQualification(AssessmentPdfQualificationSnapshotStatus status) =>
        new(status, null, null, null, null, null, null, null);

    private static bool HasUsefulQualificationValue(AssessmentPdfQualification qualification) =>
        !string.IsNullOrWhiteSpace(qualification.Code)
        || !string.IsNullOrWhiteSpace(qualification.ArabicName)
        || !string.IsNullOrWhiteSpace(qualification.EnglishName)
        || !string.IsNullOrWhiteSpace(qualification.VersionCode)
        || !string.IsNullOrWhiteSpace(qualification.SourceReference)
        || qualification.EffectiveFromUtc.HasValue
        || qualification.EffectiveUntilUtc.HasValue;

    private static JsonElement? GetObject(JsonElement element, string propertyName)
    {
        var property = FindProperty(element, propertyName);
        return property is { ValueKind: JsonValueKind.Object } ? property : null;
    }

    private static string? GetString(JsonElement element, string propertyName)
    {
        var property = FindProperty(element, propertyName);
        return property is { ValueKind: JsonValueKind.String } ? property.Value.GetString() : null;
    }

    private static DateTimeOffset? GetDateTimeOffset(JsonElement element, string propertyName)
    {
        var property = FindProperty(element, propertyName);
        return property is { ValueKind: JsonValueKind.String } && property.Value.TryGetDateTimeOffset(out var value)
            ? value
            : null;
    }

    private static JsonElement? FindProperty(JsonElement element, string propertyName)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
                return property.Value;
        }

        return null;
    }
}

public sealed class DisabledAssessmentPdfRenderer(string reason) : IAssessmentPdfRenderer
{
    public bool IsConfigured => false;
    public string? UnavailableReason => reason;

    public byte[] Render(AssessmentPdfReportModel report) =>
        throw new InvalidOperationException(UnavailableReason);
}
