using Betcco.Domain.Platform;

namespace Betcco.Application.Privacy;

/// <summary>
/// A human-reviewed eligibility decision supplied to the server-controlled
/// privacy-execution foundation. Requires legal review: the application does
/// not derive eligibility from a retention rule string on its own.
/// </summary>
public sealed record EvaluatePrivacyExecutionCommand(
    Guid DataSubjectRequestId,
    Guid RetentionPolicyId,
    bool IsEligible,
    string EligibilityReason,
    string ActorUserId);

public sealed record PrivacyExecutionEvaluationResult(
    PrivacyExecutionJob? Job,
    string? FailureCode = null,
    string? FailureMessage = null);

public interface IPrivacyExecutionService
{
    Task<PrivacyExecutionEvaluationResult> EvaluateAsync(
        EvaluatePrivacyExecutionCommand command,
        CancellationToken cancellationToken = default);
}
