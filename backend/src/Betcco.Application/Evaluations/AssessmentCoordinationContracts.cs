using Betcco.Domain.Common;

namespace Betcco.Application.Evaluations;

public static class AssessmentCoordinationStatuses
{
    public static readonly EvaluationStatus[] Active =
    [
        EvaluationStatus.PendingAssignment,
        EvaluationStatus.Assigned,
        EvaluationStatus.UnderReview,
        EvaluationStatus.NeedsRevision
    ];
}

public sealed record AssessmentCoordinationItem(
    Guid Id, string Status, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc,
    bool IsRetake, string? QualificationCode, string? QualificationVersionCode,
    string? UnitCode, string? UnitArabicTitle, string? UnitEnglishTitle,
    string? EvaluatorDisplayName, DateTimeOffset? AssignedAtUtc,
    bool? HasEligibleEvaluator, string? BlockerCode);

public sealed record AssessmentCoordinationPage(
    IReadOnlyList<AssessmentCoordinationItem> Items, int Page, int PageSize, int TotalCount);

public interface IAssessmentCoordinationService
{
    Task<AssessmentCoordinationPage> QueueAsync(EvaluationStatus? status, int page, int pageSize,
        CancellationToken cancellationToken = default);
}
