using Betcco.Domain.Common;
using Betcco.Domain.Platform;

namespace Betcco.Application.Privacy;

public sealed record DataSubjectFulfillmentResult(
    DataSubjectFulfillment? Fulfillment,
    string? FailureCode = null,
    string? FailureMessage = null);

public interface IDataSubjectFulfillmentService
{
    Task<DataSubjectFulfillmentResult> GenerateAccessAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default);
    Task<DataSubjectFulfillmentResult> ReleaseAccessAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default);
    Task<DataSubjectFulfillmentResult> ApplyCorrectionAsync(Guid requestId, CorrectablePersonalField field, string value, string actorUserId, CancellationToken cancellationToken = default);
    Task<DataSubjectFulfillmentResult> ApplyRestrictionAsync(Guid requestId, string processingScope, string reason, string actorUserId, CancellationToken cancellationToken = default);
    Task<DataSubjectFulfillmentResult> WithdrawOptionalConsentAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default);
    Task<DataSubjectFulfillmentResult> RecordProfilingObjectionAsync(Guid requestId, string scope, string reviewedOutcome, string reason, string actorUserId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Deny-by-default query boundary for future processing workflows. A caller
/// must name the subject and processing scope explicitly.
/// </summary>
public interface IDataProcessingRestrictionChecker
{
    Task<bool> IsRestrictedAsync(string subjectUserId, string processingScope, CancellationToken cancellationToken = default);
}
