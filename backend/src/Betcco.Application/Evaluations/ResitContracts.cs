namespace Betcco.Application.Evaluations;

public sealed record AuthorizeResitCommand(string Reason);

public sealed record RevokeResitAuthorizationCommand(string Reason);

public sealed record ResitEligibilityView(
    Guid OriginalEvaluationRequestId,
    AssessmentAcademicSummary? Academic,
    string FinalEstimatedGrade,
    int SubmissionAttemptNumber);

public sealed record ResitEligibilityPage(
    IReadOnlyList<ResitEligibilityView> Items,
    int Page,
    int PageSize,
    bool HasNextPage);

public sealed record ResitAuthorizationStaffView(
    Guid AuthorizationId,
    Guid OriginalEvaluationRequestId,
    Guid? ResitEvaluationRequestId,
    DateTimeOffset AuthorizedAtUtc,
    string Reason,
    DateTimeOffset? ActivatedAtUtc,
    DateTimeOffset? RevokedAtUtc,
    Guid? RevokedByUserId,
    string? RevocationReason);

public sealed record ResitAuthorizationPage(
    IReadOnlyList<ResitAuthorizationStaffView> Items,
    int Page,
    int PageSize,
    bool HasNextPage);

public enum ResitAuthorizationWriteStatus
{
    Created,
    Revoked,
    NotFound,
    NotEligible,
    Invalid,
    InvalidActor,
    AlreadyActivated,
    Conflict
}

public sealed record ResitAuthorizationWriteResult(
    ResitAuthorizationWriteStatus Status,
    ResitAuthorizationStaffView? Authorization = null);

public enum ResitActivationStatus
{
    Activated,
    AlreadyActivated,
    NotFound,
    InvalidActor,
    Revoked,
    OriginalNoLongerValid,
    AcademicSnapshotInvalid,
    Conflict
}

public sealed record ResitActivationResult(
    ResitActivationStatus Status,
    Guid? OriginalEvaluationRequestId = null,
    Guid? ResitEvaluationRequestId = null);

public interface IResitService
{
    Task<ResitActivationResult> ActivateAsync(
        string studentUserId,
        Guid authorizationId,
        CancellationToken cancellationToken = default);

    Task<ResitEligibilityPage> ListEligibleAsync(
        Guid actorUserId,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    Task<ResitAuthorizationPage> ListAuthorizationsAsync(
        Guid actorUserId,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    Task<ResitAuthorizationWriteResult> AuthorizeAsync(
        Guid actorUserId,
        Guid originalEvaluationRequestId,
        AuthorizeResitCommand command,
        CancellationToken cancellationToken = default);

    Task<ResitAuthorizationWriteResult> RevokeAsync(
        Guid actorUserId,
        Guid authorizationId,
        RevokeResitAuthorizationCommand command,
        CancellationToken cancellationToken = default);
}
