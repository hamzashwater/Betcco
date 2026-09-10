using Betcco.Domain.Platform;

namespace Betcco.Application.Privacy;

public sealed record EraseConcealmentExecutionResult(
    PrivacyExecutionJob? Job,
    DataSubjectFulfillment? Fulfillment = null,
    string? FailureCode = null,
    string? FailureMessage = null);

public interface IEraseConcealmentExecutionService
{
    Task<EraseConcealmentExecutionResult> ExecuteAsync(
        Guid privacyExecutionJobId,
        string actorUserId,
        CancellationToken cancellationToken = default);
}
