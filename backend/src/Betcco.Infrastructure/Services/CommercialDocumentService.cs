using System.Text.Json;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Issues immutable internal commercial-document evidence from already trusted
/// payment/refund snapshots. This service has no tax-authority integration.
/// </summary>
public sealed class CommercialDocumentService(BetccoDbContext db) : ICommercialDocumentService
{
    public async Task<CommercialDocumentResult<InvoiceView>> IssueInvoiceAsync(string financeAdminUserId, Guid paymentId, CancellationToken cancellationToken = default)
    {
        var existing = await db.Invoices.Include(item => item.Lines).SingleOrDefaultAsync(item => item.PaymentId == paymentId, cancellationToken);
        if (existing is not null)
        {
            Audit(financeAdminUserId, "InvoiceIssueDuplicateReplay", existing.Id, new { existing.PaymentId });
            await db.SaveChangesAsync(cancellationToken);
            return new(ToView(existing), true);
        }

        var payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == paymentId, cancellationToken);
        if (payment is null) return await RejectInvoiceAsync(financeAdminUserId, paymentId, "INVOICE_PAYMENT_NOT_FOUND", "The payment was not found.", cancellationToken);
        if (payment.Status != PaymentStatus.Paid) return await RejectInvoiceAsync(financeAdminUserId, payment.Id, "INVOICE_PAYMENT_NOT_PAID", "Only a currently paid payment can issue an invoice.", cancellationToken);
        if (!IsMonetarySnapshotValid(payment)) return await RejectInvoiceAsync(financeAdminUserId, payment.Id, "INVOICE_PAYMENT_SNAPSHOT_INVALID", "The trusted payment monetary snapshot is invalid.", cancellationToken);
        if (string.IsNullOrWhiteSpace(payment.Currency) || string.IsNullOrWhiteSpace(payment.UserId)) return await RejectInvoiceAsync(financeAdminUserId, payment.Id, "INVOICE_PAYMENT_SNAPSHOT_INVALID", "The trusted payment snapshot is incomplete.", cancellationToken);

        var invoice = new Invoice
        {
            PaymentId = payment.Id,
            Number = $"BET-INV-{Guid.NewGuid():N}",
            CustomerUserId = payment.UserId,
            Subtotal = payment.Subtotal,
            Discount = payment.Discount,
            Tax = payment.Tax,
            Total = payment.Total,
            Currency = payment.Currency.Trim().ToUpperInvariant(),
            CorrelationReference = $"invoice:{payment.Id:N}",
            CreatedByUserId = financeAdminUserId
        };
        invoice.Lines.Add(new InvoiceLine
        {
            Sequence = 1,
            ItemType = payment.Purpose,
            ItemReferenceId = payment.ReferenceId,
            Amount = payment.Subtotal,
            SnapshotJson = string.IsNullOrWhiteSpace(payment.LineItemsJson) ? "[]" : payment.LineItemsJson
        });
        db.Invoices.Add(invoice);
        Audit(financeAdminUserId, "InvoiceIssued", invoice.Id, new { invoice.PaymentId, invoice.Number, invoice.Total, invoice.Currency, invoice.CorrelationReference });

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            var replay = await db.Invoices.Include(item => item.Lines).SingleOrDefaultAsync(item => item.PaymentId == paymentId, cancellationToken);
            if (replay is null) throw;
            return new(ToView(replay), true);
        }
        return new(ToView(invoice));
    }

    public async Task<CommercialDocumentResult<CreditNoteView>> IssueCreditNoteAsync(string financeAdminUserId, Guid refundId, CancellationToken cancellationToken = default)
    {
        var existing = await db.CreditNotes.SingleOrDefaultAsync(item => item.RefundId == refundId, cancellationToken);
        if (existing is not null)
        {
            Audit(financeAdminUserId, "CreditNoteIssueDuplicateReplay", existing.Id, new { existing.RefundId });
            await db.SaveChangesAsync(cancellationToken);
            return new(ToView(existing), true);
        }

        var refund = await db.Refunds.SingleOrDefaultAsync(item => item.Id == refundId, cancellationToken);
        if (refund is null) return await RejectCreditNoteAsync(financeAdminUserId, refundId, "CREDIT_NOTE_REFUND_NOT_FOUND", "The refund was not found.", cancellationToken);
        if (refund.Status != RefundStatus.InternallyRecorded)
            return await RejectCreditNoteAsync(financeAdminUserId, refund.Id, "CREDIT_NOTE_REFUND_NOT_FINALIZED", "Only an internally finalized refund can issue a credit note.", cancellationToken);

        var invoice = await db.Invoices.SingleOrDefaultAsync(item => item.PaymentId == refund.PaymentId, cancellationToken);
        if (invoice is null) return await RejectCreditNoteAsync(financeAdminUserId, refund.Id, "CREDIT_NOTE_INVOICE_REQUIRED", "An original internal invoice is required.", cancellationToken);
        if (refund.Amount != invoice.Total || !string.Equals(refund.Currency, invoice.Currency, StringComparison.OrdinalIgnoreCase))
            return await RejectCreditNoteAsync(financeAdminUserId, refund.Id, "CREDIT_NOTE_PARTIAL_OR_MISMATCHED_REFUND_UNSUPPORTED", "Credit notes currently require the matching full refund amount and currency.", cancellationToken);

        var creditNote = new CreditNote
        {
            InvoiceId = invoice.Id,
            RefundId = refund.Id,
            Number = $"BET-CN-{Guid.NewGuid():N}",
            Amount = refund.Amount,
            Currency = invoice.Currency,
            CorrelationReference = $"credit-note:{refund.Id:N}",
            CreatedByUserId = financeAdminUserId
        };
        db.CreditNotes.Add(creditNote);
        Audit(financeAdminUserId, "CreditNoteIssued", creditNote.Id, new { creditNote.InvoiceId, creditNote.RefundId, creditNote.Number, creditNote.Amount, creditNote.Currency, creditNote.CorrelationReference });

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            var replay = await db.CreditNotes.SingleOrDefaultAsync(item => item.RefundId == refundId, cancellationToken);
            if (replay is null) throw;
            return new(ToView(replay), true);
        }
        return new(ToView(creditNote));
    }

    private async Task<CommercialDocumentResult<InvoiceView>> RejectInvoiceAsync(string actor, Guid paymentId, string code, string message, CancellationToken cancellationToken)
    {
        Audit(actor, "InvoiceIssueRejected", paymentId, new { code });
        await db.SaveChangesAsync(cancellationToken);
        return new(null, FailureCode: code, FailureMessage: message);
    }

    private async Task<CommercialDocumentResult<CreditNoteView>> RejectCreditNoteAsync(string actor, Guid refundId, string code, string message, CancellationToken cancellationToken)
    {
        Audit(actor, "CreditNoteIssueRejected", refundId, new { code });
        await db.SaveChangesAsync(cancellationToken);
        return new(null, FailureCode: code, FailureMessage: message);
    }

    private void Audit(string actor, string action, Guid entityId, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = actor,
        Action = action,
        EntityType = action.StartsWith("Invoice", StringComparison.Ordinal) ? nameof(Invoice) : nameof(CreditNote),
        EntityId = entityId.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = action.EndsWith("Rejected", StringComparison.Ordinal) ? "Rejected" : "Success"
    });

    private static bool IsMonetarySnapshotValid(Payment payment) => payment.Subtotal >= 0m
        && payment.Discount >= 0m
        && payment.Tax >= 0m
        && payment.Total >= 0m
        && payment.Subtotal - payment.Discount + payment.Tax == payment.Total;

    private static InvoiceView ToView(Invoice invoice) => new(invoice.Id, invoice.PaymentId, invoice.Number, invoice.CustomerUserId, invoice.IssuedAtUtc, invoice.Status.ToString(), invoice.Subtotal, invoice.Discount, invoice.Tax, invoice.Total, invoice.Currency, invoice.CorrelationReference, invoice.Lines.OrderBy(line => line.Sequence).Select(line => new InvoiceLineView(line.Sequence, line.ItemType, line.ItemReferenceId, line.Amount, line.SnapshotJson)).ToArray());
    private static CreditNoteView ToView(CreditNote creditNote) => new(creditNote.Id, creditNote.InvoiceId, creditNote.RefundId, creditNote.Number, creditNote.IssuedAtUtc, creditNote.Status.ToString(), creditNote.Amount, creditNote.Currency, creditNote.CorrelationReference);
}
