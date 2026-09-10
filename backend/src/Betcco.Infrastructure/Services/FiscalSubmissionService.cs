using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

public sealed class FiscalSubmissionService(BetccoDbContext db, IFiscalInvoiceProvider provider) : IFiscalSubmissionService
{
    public async Task<FiscalSubmissionResult> SubmitInvoiceAsync(string financeAdminUserId, Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var existing = await db.FiscalDocumentSubmissions.SingleOrDefaultAsync(x => x.BusinessIdentity == InvoiceIdentity(invoiceId), cancellationToken);
        if (existing is not null)
        {
            Audit(financeAdminUserId, "FiscalSubmissionDuplicateReplay", existing.Id, new { existing.Status });
            await db.SaveChangesAsync(cancellationToken);
            return new(View(existing), true, existing.Status is FiscalSubmissionStatus.Accepted ? null : existing.FailureCode);
        }

        var invoice = await db.Invoices.Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == invoiceId, cancellationToken);
        if (invoice is null) return await RejectAsync(financeAdminUserId, invoiceId, "FISCAL_INVOICE_NOT_FOUND", cancellationToken);
        var payment = await db.Payments.AsNoTracking().SingleAsync(x => x.Id == invoice.PaymentId, cancellationToken);
        if (invoice.Status != CommercialDocumentStatus.Issued || payment.Status != PaymentStatus.Paid)
            return await RejectAsync(financeAdminUserId, invoice.Id, "FISCAL_INVOICE_NOT_ELIGIBLE", cancellationToken);

        var submission = new FiscalDocumentSubmission
        {
            InvoiceId = invoice.Id,
            Provider = provider.ProviderName,
            DocumentType = FiscalDocumentType.Invoice,
            Status = FiscalSubmissionStatus.Submitting,
            BusinessIdentity = InvoiceIdentity(invoice.Id),
            CorrelationReference = $"jofotara:invoice:{invoice.Id:N}",
            CreatedByUserId = financeAdminUserId
        };
        db.FiscalDocumentSubmissions.Add(submission);
        Transition(submission, FiscalSubmissionStatus.Pending, FiscalSubmissionStatus.Submitting, FiscalSubmissionTransitionSource.FinanceAdminRequested, financeAdminUserId, null, null);
        Audit(financeAdminUserId, "FiscalSubmissionRequested", submission.Id, new { submission.InvoiceId, submission.Provider });
        Audit(financeAdminUserId, "FiscalSubmissionStarted", submission.Id, new { submission.InvoiceId });
        await db.SaveChangesAsync(cancellationToken);

        FiscalProviderSubmissionResult result;
        try
        {
            result = await provider.SubmitInvoiceAsync(new(submission.Id, invoice.Id, invoice.Number, invoice.Currency, invoice.Subtotal, invoice.Discount, invoice.Tax, invoice.Total, invoice.Lines.OrderBy(x => x.Sequence).Select(x => new InvoiceLineView(x.Sequence, x.ItemType, x.ItemReferenceId, x.Amount, x.SnapshotJson)).ToArray()), cancellationToken);
        }
        catch (FiscalProviderResultUnknownException)
        {
            return await CompleteAsync(submission, FiscalSubmissionStatus.ProviderResultUnknown, FiscalSubmissionTransitionSource.ProviderResultUnknown, financeAdminUserId, null, null, "JOFOtARA_PROVIDER_RESULT_UNKNOWN", cancellationToken);
        }
        catch (Exception)
        {
            return await CompleteAsync(submission, FiscalSubmissionStatus.RequiresReview, FiscalSubmissionTransitionSource.ConfigurationOrMappingBlocked, financeAdminUserId, null, null, "JOFOtARA_PROVIDER_RESPONSE_INVALID", cancellationToken);
        }

        if (result.IsAccepted)
            return await CompleteAsync(submission, FiscalSubmissionStatus.Accepted, FiscalSubmissionTransitionSource.ProviderAccepted, financeAdminUserId, result.ProviderReference, result.StatusCode, null, cancellationToken);
        if (result.IsDefiniteRejected)
            return await CompleteAsync(submission, FiscalSubmissionStatus.Rejected, FiscalSubmissionTransitionSource.ProviderRejected, financeAdminUserId, result.ProviderReference, result.StatusCode, result.FailureCode ?? "JOFOtARA_REJECTED", cancellationToken);
        return await CompleteAsync(submission, FiscalSubmissionStatus.RequiresReview, FiscalSubmissionTransitionSource.ConfigurationOrMappingBlocked, financeAdminUserId, result.ProviderReference, result.StatusCode, result.FailureCode ?? "JOFOtARA_REQUIRES_REVIEW", cancellationToken);
    }

    private async Task<FiscalSubmissionResult> CompleteAsync(FiscalDocumentSubmission submission, FiscalSubmissionStatus status, FiscalSubmissionTransitionSource source, string actor, string? reference, string? code, string? failure, CancellationToken cancellationToken)
    {
        submission.Status = status; submission.ProviderReference = reference; submission.ProviderStatusCode = code; submission.FailureCode = failure;
        if (status == FiscalSubmissionStatus.Accepted) submission.ConfirmedAtUtc = DateTimeOffset.UtcNow;
        Transition(submission, FiscalSubmissionStatus.Submitting, status, source, actor, reference, code);
        Audit(actor, status switch { FiscalSubmissionStatus.Accepted => "FiscalSubmissionAccepted", FiscalSubmissionStatus.Rejected => "FiscalSubmissionRejected", FiscalSubmissionStatus.ProviderResultUnknown => "FiscalSubmissionProviderResultUnknown", _ => "FiscalSubmissionConfigurationOrMappingBlocked" }, submission.Id, new { submission.InvoiceId, status, code, failure });
        await db.SaveChangesAsync(cancellationToken);
        return new(View(submission), FailureCode: failure);
    }

    private async Task<FiscalSubmissionResult> RejectAsync(string actor, Guid id, string code, CancellationToken cancellationToken)
    {
        Audit(actor, "FiscalSubmissionRejected", id, new { code }); await db.SaveChangesAsync(cancellationToken); return new(null, FailureCode: code);
    }
    private void Transition(FiscalDocumentSubmission submission, FiscalSubmissionStatus previous, FiscalSubmissionStatus next, FiscalSubmissionTransitionSource source, string actor, string? reference, string? code) => db.FiscalDocumentSubmissionTransitions.Add(new() { FiscalDocumentSubmissionId = submission.Id, PreviousStatus = previous, NewStatus = next, Source = source, ActorContext = actor, ProviderReference = reference, ResultCode = code, CorrelationReference = submission.CorrelationReference });
    private void Audit(string actor, string action, Guid id, object metadata) => db.AuditLogs.Add(new AuditLog { ActorUserId = actor, Action = action, EntityType = nameof(FiscalDocumentSubmission), EntityId = id.ToString(), MetadataJson = JsonSerializer.Serialize(metadata), Outcome = action.Contains("Rejected", StringComparison.Ordinal) ? "Rejected" : "Success" });
    private static string InvoiceIdentity(Guid invoiceId) => $"jofotara|invoice|{invoiceId:N}";
    private static FiscalSubmissionView View(FiscalDocumentSubmission x) => new(x.Id, x.InvoiceId, x.CreditNoteId, x.Provider, x.DocumentType.ToString(), x.Status.ToString(), x.AttemptedAtUtc, x.ConfirmedAtUtc, x.ProviderReference, x.ProviderStatusCode, x.FailureCode, x.CorrelationReference);
}
