namespace Betcco.Application.Evaluations;

public sealed record AssessmentPdfReport(
    string FileName,
    byte[] Content);

public interface IAssessmentPdfReportService
{
    bool IsConfigured { get; }
    string? UnavailableReason { get; }

    Task<AssessmentPdfReport?> CreateAsync(
        string leadVerifierUserId,
        Guid evaluationRequestId,
        string? locale,
        CancellationToken cancellationToken = default);
}
