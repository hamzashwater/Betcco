using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CommercialDocumentFoundationTests
{
    [Fact]
    public async Task Paid_payment_issues_one_immutable_server_snapshot_invoice()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid, 100m, 10m, 5m, 95m);
        var service = new CommercialDocumentService(db);

        var result = await service.IssueInvoiceAsync("finance", payment.Id);

        var invoice = Assert.IsType<InvoiceView>(result.Document);
        Assert.StartsWith("BET-INV-", invoice.Number);
        Assert.Equal(payment.Id, invoice.PaymentId);
        Assert.Equal("student", invoice.CustomerUserId);
        Assert.Equal(100m, invoice.Subtotal);
        Assert.Equal(10m, invoice.Discount);
        Assert.Equal(5m, invoice.Tax);
        Assert.Equal(95m, invoice.Total);
        Assert.Equal("JOD", invoice.Currency);
        var line = Assert.Single(invoice.Lines);
        Assert.Equal(payment.Purpose, line.ItemType);
        Assert.Equal(payment.ReferenceId, line.ItemReferenceId);
        Assert.Equal(payment.LineItemsJson, line.SnapshotJson);
        Assert.Contains(db.AuditLogs, item => item.Action == "InvoiceIssued");
    }

    [Theory]
    [InlineData(PaymentStatus.Processing)]
    [InlineData(PaymentStatus.Failed)]
    [InlineData(PaymentStatus.Cancelled)]
    public async Task Non_paid_payment_cannot_issue_invoice(PaymentStatus status)
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, status, 100m, 0m, 0m, 100m);

        var result = await new CommercialDocumentService(db).IssueInvoiceAsync("finance", payment.Id);

        Assert.Equal("INVOICE_PAYMENT_NOT_PAID", result.FailureCode);
        Assert.Empty(await db.Invoices.ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "InvoiceIssueRejected");
    }

    [Fact]
    public async Task Invalid_trusted_payment_arithmetic_is_rejected_and_client_has_no_monetary_override_surface()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid, 100m, 10m, 5m, 96m);

        var result = await new CommercialDocumentService(db).IssueInvoiceAsync("finance", payment.Id);

        Assert.Equal("INVOICE_PAYMENT_SNAPSHOT_INVALID", result.FailureCode);
        Assert.Empty(await db.Invoices.ToListAsync());
        Assert.DoesNotContain(typeof(CommercialDocumentsController).GetMethods().Where(method => method.Name == nameof(CommercialDocumentsController.IssueInvoice)).SelectMany(method => method.GetParameters()), parameter => parameter.ParameterType != typeof(Guid) && parameter.ParameterType != typeof(CancellationToken));
    }

    [Fact]
    public async Task Invoice_issue_is_idempotent_and_document_snapshot_cannot_be_rewritten_or_deleted()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid, 100m, 0m, 0m, 100m);
        var service = new CommercialDocumentService(db);
        var first = await service.IssueInvoiceAsync("finance", payment.Id);
        var replay = await service.IssueInvoiceAsync("finance", payment.Id);

        Assert.NotNull(first.Document);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Equal(first.Document!.Id, replay.Document!.Id);
        Assert.Single(await db.Invoices.ToListAsync());
        var invoice = await db.Invoices.Include(item => item.Lines).SingleAsync();
        invoice.Total = 1m;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(invoice).State = EntityState.Unchanged;
        var line = Assert.Single(invoice.Lines);
        line.SnapshotJson = "[]";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        invoice = await db.Invoices.SingleAsync();
        db.Invoices.Remove(invoice);
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Finalized_full_refund_issues_one_credit_note_without_new_wallet_or_ledger_effects()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Refunded, 100m, 0m, 0m, 100m);
        var invoice = new Invoice
        {
            PaymentId = payment.Id,
            Number = $"BET-INV-{Guid.NewGuid():N}",
            CustomerUserId = payment.UserId,
            Subtotal = payment.Subtotal,
            Total = payment.Total,
            Currency = payment.Currency,
            CorrelationReference = $"invoice:{payment.Id:N}"
        };
        db.Invoices.Add(invoice);
        var refund = new Refund
        {
            PaymentId = payment.Id,
            Amount = 100m,
            Currency = "JOD",
            Status = RefundStatus.InternallyRecorded,
            ReasonCode = "CustomerRequest",
            RequestedByUserId = "finance",
            IdempotencyKey = "refund-idempotency",
            CorrelationReference = "refund:trusted"
        };
        db.Refunds.Add(refund);
        await db.SaveChangesAsync();
        var walletBefore = await db.WalletTransactions.CountAsync();
        var ledgerBefore = await db.LedgerTransactions.CountAsync();
        var service = new CommercialDocumentService(db);

        var first = await service.IssueCreditNoteAsync("finance", refund.Id);
        var replay = await service.IssueCreditNoteAsync("finance", refund.Id);

        var note = Assert.IsType<CreditNoteView>(first.Document);
        Assert.StartsWith("BET-CN-", note.Number);
        Assert.Equal(invoice.Id, note.InvoiceId);
        Assert.Equal(refund.Id, note.RefundId);
        Assert.Equal(100m, note.Amount);
        Assert.Equal("JOD", note.Currency);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Equal(note.Id, replay.Document!.Id);
        Assert.Single(await db.CreditNotes.ToListAsync());
        Assert.Equal(walletBefore, await db.WalletTransactions.CountAsync());
        Assert.Equal(ledgerBefore, await db.LedgerTransactions.CountAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "CreditNoteIssued");
    }

    [Fact]
    public async Task Requested_or_partial_refund_cannot_issue_credit_note()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid, 100m, 0m, 0m, 100m);
        var refund = new Refund
        {
            PaymentId = payment.Id,
            Amount = 25m,
            Currency = "JOD",
            Status = RefundStatus.Requested,
            ReasonCode = "CustomerRequest",
            RequestedByUserId = "finance",
            IdempotencyKey = "partial-refund",
            CorrelationReference = "refund:partial"
        };
        db.Refunds.Add(refund);
        await db.SaveChangesAsync();

        var result = await new CommercialDocumentService(db).IssueCreditNoteAsync("finance", refund.Id);

        Assert.Equal("CREDIT_NOTE_REFUND_NOT_FINALIZED", result.FailureCode);
        Assert.Empty(await db.CreditNotes.ToListAsync());
    }

    [Fact]
    public async Task Invoice_and_credit_note_routes_require_finance_authorization()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(CommercialDocumentsController).GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("FinanceAdmin", authorization.Policy);

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManageFinance);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.Student)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);
        Assert.False(context.HasSucceeded);
    }

    private static async Task<Payment> AddPaymentAsync(BetccoDbContext db, PaymentStatus status, decimal subtotal, decimal discount, decimal tax, decimal total)
    {
        var payment = new Payment
        {
            UserId = "student",
            Purpose = "CourseCart",
            ReferenceId = Guid.NewGuid(),
            Status = status,
            Subtotal = subtotal,
            Discount = discount,
            Tax = tax,
            Total = total,
            Currency = "JOD",
            Provider = "Fake",
            ProviderPaymentId = $"fake-{Guid.NewGuid():N}",
            LineItemsJson = "{\"Lines\":[{\"CourseId\":\"00000000-0000-0000-0000-000000000001\",\"GrossAmount\":100}]}"
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
