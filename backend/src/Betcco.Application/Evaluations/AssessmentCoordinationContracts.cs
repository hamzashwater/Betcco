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
    bool? HasEligibleEvaluator, string? BlockerCode,
    DateTimeOffset? ExpectedCompletionAtUtc, string ExpectedCompletionState);

public sealed record AssessmentCoordinationPage(
    IReadOnlyList<AssessmentCoordinationItem> Items, int Page, int PageSize, int TotalCount);

public interface IAssessmentCoordinationService
{
    Task<AssessmentCoordinationPage> QueueAsync(EvaluationStatus? status, int page, int pageSize,
        CancellationToken cancellationToken = default, string? expectedCompletionState = null);
    Task<ExpectedCompletionWriteResult> SetExpectedCompletionAsync(Guid evaluationRequestId,
        DateTimeOffset expectedCompletionAtUtc, string? reason, Guid actorUserId,
        CancellationToken cancellationToken = default);
}

public static class ExpectedCompletionStates
{
    public const string NotSet = "NotSet";
    public const string OnTrack = "OnTrack";
    public const string Overdue = "Overdue";

    public static string Resolve(DateTimeOffset? target, DateTimeOffset now) => target is null
        ? NotSet : now <= target ? OnTrack : Overdue;
}

public enum ExpectedCompletionWriteResult
{
    Success,
    RequestNotFound,
    RequestNotActive,
    InvalidTarget,
    InvalidReason,
    InvalidActor,
    Conflict
}
