using Betcco.Domain.Platform;

namespace Betcco.Application.Privacy;

public sealed record DataPortabilityExportResult(
    DataPortabilityExport? Export,
    string? FailureCode = null,
    string? FailureMessage = null);

public sealed record DataPortabilityDownloadResult(
    Stream? Content,
    string? FileName = null,
    string? FailureCode = null,
    string? FailureMessage = null);

public interface IDataPortabilityExportService
{
    Task<DataPortabilityExportResult> GenerateAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default);
    Task<DataPortabilityExportResult> ReleaseAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default);
    Task<DataPortabilityDownloadResult> OpenForOwnerDownloadAsync(Guid requestId, string ownerUserId, CancellationToken cancellationToken = default);
}
