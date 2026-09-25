using System.Text.Json;
using Betcco.Domain.Common;

namespace Betcco.Application.Evaluations;

// Legacy compatibility path; new requests from the Student UI use ScopedEvaluationCommand.
public sealed record CreateEvaluationCommand(Guid GradeId, Guid SpecializationId, Guid TaskTypeId, Guid RubricTemplateId, string? StudentComment);
public sealed record EvaluationView(Guid Id, string Status, decimal Price, string Currency, string? StudentComment, IReadOnlyCollection<string> Criteria,
    AssessmentAcademicSummary? Academic = null, bool IsRetake = false, Guid? RetakeOfEvaluationRequestId = null);

public static class AssessmentPricing
{
    // Slice 1 deliberately uses the current server-owned standard assessment
    // price. This boundary can accept a Retake pricing context later without
    // changing the Retake lifecycle or trusting a browser-provided amount.
    public const decimal StandardEvaluationPrice = 5m;
}

public sealed record AuthorizeRetakeCommand(Guid RetakeAssessmentScopeId, string Reason);
public sealed record RetakeScopeOption(Guid AssessmentScopeId, string AssessmentCode,
    string AssessmentArabicTitle, string AssessmentEnglishTitle, IReadOnlyList<string> CriterionCodes);
public sealed record RetakeEligibilityView(Guid OriginalEvaluationRequestId, string StudentUserId,
    AssessmentAcademicSummary Academic, IReadOnlyList<string> UnmetPassCriteria,
    IReadOnlyList<RetakeScopeOption> AvailableScopes);
public sealed record RetakeAuthorizationView(Guid AuthorizationId, Guid OriginalEvaluationRequestId,
    Guid RetakeEvaluationRequestId, Guid RetakeAssessmentScopeId, DateTimeOffset AuthorizedAtUtc);
public enum RetakeAuthorizationStatus { Created, Forbidden, NotEligible, InvalidScope, Conflict }
public sealed record RetakeAuthorizationResult(RetakeAuthorizationStatus Status, RetakeAuthorizationView? Authorization = null);

public interface IRetakeService
{
    Task<IReadOnlyList<RetakeEligibilityView>> ListEligibleAsync(string leadVerifierUserId, CancellationToken cancellationToken = default);
    Task<RetakeAuthorizationResult> AuthorizeAsync(string leadVerifierUserId, Guid originalEvaluationRequestId,
        AuthorizeRetakeCommand command, CancellationToken cancellationToken = default);
}
// BTEC assessment accepts a criterion decision and evidence only. A numeric
// score must never be sent by a client or used to grant an academic outcome.
public sealed record CriterionSubmission(string CriterionCode, string Achievement, string? Evidence, string? Comment);
public sealed record SetEvaluationCriteriaPlanCommand(IReadOnlyCollection<string> CriterionCodes);
public sealed record SubmitEvaluationReviewCommand(
    IReadOnlyCollection<CriterionSubmission> Results,
    string Feedback,
    bool RequestRevision);
public sealed record EvaluationSectionResult(string Section, string Grade);
public sealed record EvaluationCalculation(EvaluationGrade Grade, IReadOnlyCollection<EvaluationSectionResult> Sections);
public sealed record BtecOutcomeRule(string Outcome, IReadOnlyCollection<string> RequiredBands);

/// <summary>
/// Stored with the rule-set snapshot, rather than scattered through an
/// assessment service. A qualification specification can therefore use a
/// different number of authorised resubmissions or deadline window.
/// </summary>
public sealed record BtecResubmissionPolicy(int MaximumAuthorizations, int MaximumDeadlineDays)
{
    public static BtecResubmissionPolicy Default { get; } = new(1, 30);

    public bool IsValid() => MaximumAuthorizations is >= 0 and <= 5
        && MaximumDeadlineDays is >= 1 and <= 365;
}

/// <summary>
/// Server-owned wording for the authenticity declaration. The browser only
/// submits an affirmative action; it never supplies, versions, or edits the
/// legal/academic statement that is persisted with an assessment attempt.
/// </summary>
public static class AssessmentAuthenticityPolicy
{
    public const string Version = "betcco-assessment-authenticity-v1";

    public const string ArabicStatement = "أقر بأن العمل والأدلة المقدمة تخصني، وأنني ذكرت أي مصادر أو مساعدة مسموح بها، وأفهم أن تقديم عمل الغير أو إخفاء مصدره قد يخضع لإجراءات النزاهة الأكاديمية.";
    public const string EnglishStatement = "I declare that the submitted work and evidence are my own, that I have acknowledged any permitted sources or assistance, and that presenting another person's work as my own may be subject to academic-integrity procedures.";

    public static string StatementFor(string? locale) => locale?.StartsWith("ar", StringComparison.OrdinalIgnoreCase) == true
        ? ArabicStatement
        : EnglishStatement;
}

/// <summary>
/// Declarative, versioned rules for a BTEC-style assessment. The default is a
/// conservative internal rule-set and must be replaced with the applicable
/// qualification specification before a centre relies on it operationally.
/// </summary>
public sealed record BtecAssessmentRuleSet(string Version, IReadOnlyCollection<BtecOutcomeRule> OutcomeRules)
{
    public BtecResubmissionPolicy ResubmissionPolicy { get; init; } = BtecResubmissionPolicy.Default;

    public static BtecAssessmentRuleSet Default { get; } = new(
        "btec-internal-v1",
        [
            new BtecOutcomeRule(nameof(EvaluationGrade.Pass), ["P"]),
            new BtecOutcomeRule(nameof(EvaluationGrade.Merit), ["P", "M"]),
            new BtecOutcomeRule(nameof(EvaluationGrade.Distinction), ["P", "M", "D"])
        ]);

    public static string DefaultJson { get; } = JsonSerializer.Serialize(Default);

    public bool IsValid()
    {
        if (string.IsNullOrWhiteSpace(Version) || OutcomeRules.Count == 0 || !ResubmissionPolicy.IsValid()) return false;
        var outcomes = new HashSet<EvaluationGrade>();
        foreach (var rule in OutcomeRules)
        {
            if (!Enum.TryParse<EvaluationGrade>(rule.Outcome, true, out var outcome)
                || outcome == EvaluationGrade.NotYetAchieved
                || rule.RequiredBands.Count == 0
                || !outcomes.Add(outcome)
                || rule.RequiredBands.Any(band => band is not ("P" or "M" or "D"))) return false;
        }

        return true;
    }

    public bool HasValidPlan(IEnumerable<string> criterionCodes)
    {
        if (!IsValid()) return false;
        var sections = criterionCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(EvaluationAssessmentCalculator.Describe)
            .GroupBy(descriptor => descriptor.Section, StringComparer.OrdinalIgnoreCase)
            .Select(section => section
                .Select(descriptor => descriptor.Band)
                .ToHashSet(StringComparer.OrdinalIgnoreCase))
            .ToArray();
        if (sections.Length == 0) return false;

        // Each learning-aim section must be a complete plan in its own right.
        // A plan may stop at Pass or Merit, but cannot skip a prerequisite
        // band (for example, P plus D without M).
        return sections.All(availableBands => OutcomeRules.Any(rule =>
            rule.RequiredBands.All(availableBands.Contains)
            && availableBands.All(band => rule.RequiredBands.Contains(band, StringComparer.OrdinalIgnoreCase))));
    }

    public static bool TryRead(string? json, out BtecAssessmentRuleSet ruleSet)
    {
        ruleSet = Default;
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            var parsed = JsonSerializer.Deserialize<BtecAssessmentRuleSet>(json);
            if (parsed is null || !parsed.IsValid()) return false;
            ruleSet = parsed with
            {
                OutcomeRules = parsed.OutcomeRules
                    .Select(rule => rule with
                    {
                        Outcome = rule.Outcome.Trim(),
                        RequiredBands = rule.RequiredBands
                            .Select(band => band.Trim().ToUpperInvariant())
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToArray()
                    })
                    .OrderBy(rule => ParseOutcome(rule.Outcome))
                    .ToArray()
            };
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static EvaluationGrade ParseOutcome(string outcome) =>
        Enum.TryParse<EvaluationGrade>(outcome, true, out var parsed) ? parsed : EvaluationGrade.NotYetAchieved;
}

public enum EvaluationFileAddStatus { Added, RequestNotFound, Rejected, ScannerUnavailable }

/// <summary>
/// Evaluates criterion decisions against a persisted rule-set snapshot. A
/// criterion code can be stored as <c>A.P1</c>, <c>B.M2</c>, or <c>C.D3</c>.
/// It never turns an arbitrary percentage into P, M or D.
/// </summary>
public static class EvaluationAssessmentCalculator
{
    public static EvaluationCalculation Calculate(
        IEnumerable<CriterionSubmission> submissions,
        BtecAssessmentRuleSet? ruleSet = null)
    {
        var rules = ruleSet ?? BtecAssessmentRuleSet.Default;
        if (!rules.IsValid())
            return new EvaluationCalculation(EvaluationGrade.NotYetAchieved, []);

        var sections = submissions
            .Select(submission => new { Submission = submission, Descriptor = Describe(submission.CriterionCode) })
            .GroupBy(item => item.Descriptor.Section, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var grade = CalculateSection(
                    group.Select(item => (item.Descriptor.Band, ParseAchievement(item.Submission.Achievement))),
                    rules);
                return new EvaluationSectionResult(group.Key, grade.ToString());
            })
            .OrderBy(section => section.Section, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var overall = sections.Length == 0
            ? EvaluationGrade.NotYetAchieved
            : sections.Select(section => ParseGrade(section.Grade)).OrderBy(grade => grade).First();
        return new EvaluationCalculation(overall, sections);
    }

    public static (string Section, string Band, string Label) Describe(string criterionCode)
    {
        var code = criterionCode.Trim().ToUpperInvariant();
        var separatorIndex = code.IndexOfAny(['.', ':', '-', '_']);
        var section = "A";
        var label = code;
        if (separatorIndex == 1 && char.IsLetter(code[0]) && code.Length > separatorIndex + 1)
        {
            section = code[..1];
            label = code[(separatorIndex + 1)..];
        }

        var band = label.Length > 0 && "PMD".Contains(label[0]) ? label[..1] : "P";
        return (section, band, label);
    }

    private static EvaluationGrade CalculateSection(
        IEnumerable<(string Band, CriterionAchievement Achievement)> section,
        BtecAssessmentRuleSet ruleSet)
    {
        var outcomes = section.ToArray();
        var achieved = EvaluationGrade.NotYetAchieved;
        foreach (var rule in ruleSet.OutcomeRules)
        {
            if (!Enum.TryParse<EvaluationGrade>(rule.Outcome, true, out var outcome)) continue;
            var meetsRule = rule.RequiredBands.All(requiredBand =>
            {
                var bandOutcomes = outcomes.Where(item => string.Equals(item.Band, requiredBand, StringComparison.OrdinalIgnoreCase)).ToArray();
                return bandOutcomes.Length > 0 && bandOutcomes.All(item => item.Achievement == CriterionAchievement.Achieved);
            });
            if (meetsRule && outcome > achieved) achieved = outcome;
        }

        return achieved;
    }

    private static CriterionAchievement ParseAchievement(string achievement) =>
        Enum.TryParse<CriterionAchievement>(achievement, true, out var parsed) ? parsed : CriterionAchievement.NotAchieved;

    private static EvaluationGrade ParseGrade(string grade) =>
        Enum.TryParse<EvaluationGrade>(grade, out var parsed) ? parsed : EvaluationGrade.NotYetAchieved;
}

public interface IEvaluationService
{
    Task<EvaluationView?> CreateDraftAsync(string studentUserId, CreateEvaluationCommand command, CancellationToken cancellationToken = default);
    Task<EvaluationFileAddStatus> AddFileAsync(string studentUserId, Guid requestId, string originalName, string contentType, long length, Stream content, CancellationToken cancellationToken = default);
    Task<bool> DeclareAuthenticityAsync(string studentUserId, Guid requestId, string locale, string? ipAddress, string? userAgent, string? correlationId, CancellationToken cancellationToken = default);
    Task<bool> MarkPaidAsync(Guid requestId, Guid paymentId, CancellationToken cancellationToken = default);
    Task<bool> AssignAsync(string adminUserId, Guid requestId, string teacherUserId, CancellationToken cancellationToken = default);
    Task<AssignmentResult> AssignWithOutcomeAsync(string adminUserId, Guid requestId, string evaluatorUserId,
        CancellationToken cancellationToken = default);
    Task<bool> SetCriteriaPlanAsync(string teacherUserId, Guid requestId, IReadOnlyCollection<string> criterionCodes, CancellationToken cancellationToken = default);
    Task<bool> SubmitReviewAsync(string teacherUserId, Guid requestId, SubmitEvaluationReviewCommand command, CancellationToken cancellationToken = default);
    Task<bool> SubmitResultsAsync(string teacherUserId, Guid requestId, IReadOnlyCollection<CriterionSubmission> results, CancellationToken cancellationToken = default);
    Task<bool> CompleteAsync(string adminUserId, Guid requestId, CancellationToken cancellationToken = default);
    Task<bool> AddEvidenceAsync(string studentUserId, Guid requestId, string criterionCode, string narrative, CancellationToken cancellationToken = default);
    Task<bool> ResubmitAsync(string studentUserId, Guid requestId, CancellationToken cancellationToken = default);
    Task<bool> VerifyAsync(string adminUserId, Guid requestId, bool complete, string? comment, DateTimeOffset? resubmissionDueAtUtc, CancellationToken cancellationToken = default);
}

/// <summary>
/// Keeps staff-role lookup out of the assessment workflow. Implementations
/// must reject frozen, missing, or non-assessor accounts before an evaluation
/// can be assigned to them.
/// </summary>
public interface IAssessorEligibilityService
{
    Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default);
    Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default);
    Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default);
}

public sealed record CreateInternalVerificationPlanCommand(
    string? AssessorUserId,
    Guid? GradeId,
    Guid? SpecializationId,
    Guid? TaskTypeId,
    string? TargetOutcome,
    string SelectionRationale,
    DateTimeOffset? ActiveUntilUtc);

public sealed record SelectInternalVerificationSampleCommand(
    Guid EvaluationRequestId,
    string AssignedVerifierUserId,
    string SelectionRationale);

public sealed record InternalVerificationPlanView(
    Guid Id,
    string? AssessorUserId,
    Guid? GradeId,
    Guid? SpecializationId,
    Guid? TaskTypeId,
    string? TargetOutcome,
    string SelectionRationale,
    DateTimeOffset ActiveFromUtc,
    DateTimeOffset? ActiveUntilUtc,
    bool IsActive,
    int SamplesCount);

public sealed record InternalVerificationCandidateView(
    Guid EvaluationRequestId,
    int SubmissionAttemptNumber,
    string AssessorUserId,
    Guid GradeId,
    Guid SpecializationId,
    Guid TaskTypeId,
    string? CalculatedOutcome,
    DateTimeOffset SubmittedForVerificationAtUtc);

public interface IInternalVerificationSamplingService
{
    Task<InternalVerificationPlanView?> CreatePlanAsync(string leadVerifierUserId, CreateInternalVerificationPlanCommand command, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<InternalVerificationPlanView>> ListPlansAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<InternalVerificationCandidateView>?> ListCandidatesAsync(string leadVerifierUserId, Guid planId, int take, CancellationToken cancellationToken = default);
    Task<bool> SelectSampleAsync(string leadVerifierUserId, Guid planId, SelectInternalVerificationSampleCommand command, CancellationToken cancellationToken = default);
}

public sealed record CreateEvaluationAppealCommand(Guid EvaluationRequestId, string Reason);
public sealed record ReviewEvaluationAppealCommand(EvaluationAppealStatus Status, string DecisionRationale);
public sealed record EvaluationAppealView(
    Guid Id,
    Guid EvaluationRequestId,
    string Status,
    string Reason,
    string? DecisionRationale,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReviewedAtUtc,
    DateTimeOffset? WithdrawnAtUtc);

public interface IEvaluationAppealService
{
    Task<EvaluationAppealView?> CreateAsync(string studentUserId, CreateEvaluationAppealCommand command, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<EvaluationAppealView>> ListMineAsync(string studentUserId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<EvaluationAppealView>> ListForReviewAsync(CancellationToken cancellationToken = default);
    Task<bool> WithdrawAsync(string studentUserId, Guid appealId, CancellationToken cancellationToken = default);
    Task<bool> ReviewAsync(string leadVerifierUserId, Guid appealId, ReviewEvaluationAppealCommand command, CancellationToken cancellationToken = default);
}

/// <summary>
/// Creates a bounded, reproducible export for academic quality assurance. The
/// export is separate from student-facing feedback and is restricted to a
/// qualified lead verifier by the API boundary.
/// </summary>
public sealed record AssessmentAuditExport(
    string FileName,
    string JsonContent,
    string PayloadSha256);

public interface IAssessmentAuditExportService
{
    Task<AssessmentAuditExport?> CreateAsync(
        string leadVerifierUserId,
        Guid evaluationRequestId,
        CancellationToken cancellationToken = default);
}
