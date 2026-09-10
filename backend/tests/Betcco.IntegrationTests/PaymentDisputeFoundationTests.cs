using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class PaymentDisputeFoundationTests
{
    [Fact]
    public async Task Finance_admin_can_record_paid_dispute_without_financial_posting_or_payment_status_change()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid);
        var controller = CreateController(db);

        var result = await controller.Create(Request(payment.Id, 25m, "JOD", "eligible"), default);

        var created = Assert.IsType<CreatedAtActionResult>(result);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Single(await db.PaymentDisputes.ToListAsync());
        Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
        Assert.Empty(await db.LedgerEntries.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Empty(await db.CourseSaleAllocations.ToListAsync());
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.Refunds.ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "PaymentDisputeOpened");
    }

    [Theory]
    [InlineData(PaymentStatus.Processing)]
    [InlineData(PaymentStatus.Failed)]
    [InlineData(PaymentStatus.Cancelled)]
    public async Task Only_paid_payment_is_eligible_for_ordinary_dispute_evidence(PaymentStatus status)
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, status);

        var result = await CreateController(db).Create(Request(payment.Id, 1m, "JOD", status.ToString()), default);

        var rejected = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("DISPUTE_PAYMENT_NOT_PAID", Code(rejected));
        Assert.Empty(await db.PaymentDisputes.ToListAsync());
    }

    [Fact]
    public async Task Zero_negative_excessive_and_wrong_currency_amounts_are_rejected_server_side()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid);
        var controller = CreateController(db);

        Assert.Equal("DISPUTE_AMOUNT_INVALID", Code(Assert.IsType<BadRequestObjectResult>(await controller.Create(Request(payment.Id, 0m, "JOD", "zero"), default))));
        Assert.Equal("DISPUTE_AMOUNT_INVALID", Code(Assert.IsType<BadRequestObjectResult>(await controller.Create(Request(payment.Id, -1m, "JOD", "negative"), default))));
        Assert.Equal("DISPUTE_AMOUNT_EXCEEDS_PAYMENT", Code(Assert.IsType<BadRequestObjectResult>(await controller.Create(Request(payment.Id, 101m, "JOD", "excess"), default))));
        Assert.Equal("DISPUTE_CURRENCY_INVALID", Code(Assert.IsType<BadRequestObjectResult>(await controller.Create(Request(payment.Id, 1m, "USD", "currency"), default))));
        Assert.Empty(await db.PaymentDisputes.ToListAsync());
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task Duplicate_business_identity_replays_without_duplicate_dispute_or_business_audit_event()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid);
        var controller = CreateController(db);
        var request = Request(payment.Id, 10m, "JOD", "same", providerReference: "provider-dispute-1");

        Assert.IsType<CreatedAtActionResult>(await controller.Create(request, default));
        Assert.IsType<OkObjectResult>(await controller.Create(request, default));
        Assert.IsType<OkObjectResult>(await controller.Create(request, default));

        Assert.Single(await db.PaymentDisputes.ToListAsync());
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "PaymentDisputeOpened").ToListAsync());
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "PaymentDisputeDuplicateReplay").ToListAsync());
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Dispute_lifecycle_is_open_to_review_to_resolved_and_original_evidence_is_immutable()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid);
        var controller = CreateController(db);
        Assert.IsType<CreatedAtActionResult>(await controller.Create(Request(payment.Id, 15m, "JOD", "lifecycle"), default));
        var disputeId = (await db.PaymentDisputes.SingleAsync()).Id;

        Assert.IsType<OkObjectResult>(await controller.MoveToReview(disputeId, default));
        Assert.IsType<OkObjectResult>(await controller.Resolve(disputeId, new("ReviewedNoFinancialAction", "No posting"), default));
        Assert.IsType<OkObjectResult>(await controller.Resolve(disputeId, new("ReviewedNoFinancialAction", "retry"), default));
        Assert.IsType<OkObjectResult>(await controller.Get(disputeId, default));

        var dispute = await db.PaymentDisputes.SingleAsync();
        Assert.Equal(PaymentDisputeStatus.Resolved, dispute.Status);
        dispute.Category = "rewritten";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(dispute).State = EntityState.Unchanged;
        dispute.ResolutionCode = "rewritten";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(dispute).State = EntityState.Unchanged;
        db.PaymentDisputes.Remove(dispute);
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        Assert.Single(await db.AuditLogs.Where(item => item.Action == "PaymentDisputeResolved").ToListAsync());
    }

    [Fact]
    public async Task Invalid_lifecycle_transitions_are_rejected()
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, PaymentStatus.Paid);
        var controller = CreateController(db);
        Assert.IsType<CreatedAtActionResult>(await controller.Create(Request(payment.Id, 15m, "JOD", "invalid-lifecycle"), default));
        var disputeId = (await db.PaymentDisputes.SingleAsync()).Id;

        Assert.Equal("DISPUTE_REVIEW_REQUIRED", Code(Assert.IsType<ConflictObjectResult>(await controller.Resolve(disputeId, new("ReviewedNoFinancialAction", null), default))));
        var dispute = await db.PaymentDisputes.SingleAsync();
        dispute.Status = PaymentDisputeStatus.Resolved;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Theory]
    [InlineData(PaymentStatus.Refunded)]
    [InlineData(PaymentStatus.PartiallyRefunded)]
    public async Task Refunded_payment_dispute_fails_closed_and_opens_one_reconciliation_case(PaymentStatus status)
    {
        await using var db = CreateDb();
        var payment = await AddPaymentAsync(db, status);
        var controller = CreateController(db);

        Assert.Equal("DISPUTE_REFUND_PRECEDENCE_REQUIRES_REVIEW", Code(Assert.IsType<ConflictObjectResult>(await controller.Create(Request(payment.Id, 10m, "JOD", "refund-state"), default))));
        Assert.Equal("DISPUTE_REFUND_PRECEDENCE_REQUIRES_REVIEW", Code(Assert.IsType<ConflictObjectResult>(await controller.Create(Request(payment.Id, 10m, "JOD", "refund-state"), default))));

        Assert.Empty(await db.PaymentDisputes.ToListAsync());
        Assert.Single(await db.ProviderReconciliationCases.ToListAsync());
        Assert.Equal(status, (await db.Payments.SingleAsync()).Status);
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
    }

    [Fact]
    public async Task Finance_admin_policy_protects_all_dispute_apis_and_no_force_financial_endpoint_exists()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(PaymentDisputesController).GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("FinanceAdmin", authorization.Policy);

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManageFinance);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.Student)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);
        Assert.False(context.HasSucceeded);

        var routes = typeof(PaymentDisputesController).GetMethods().Select(method => method.Name).ToArray();
        Assert.DoesNotContain("ForcePaid", routes);
        Assert.DoesNotContain("ForceRefunded", routes);
        Assert.DoesNotContain("PostLedger", routes);
        Assert.DoesNotContain("DebitWallet", routes);
        Assert.DoesNotContain(nameof(Payment.Status), typeof(CreatePaymentDisputeRequest).GetProperties().Select(property => property.Name));
    }

    private static CreatePaymentDisputeRequest Request(Guid paymentId, decimal amount, string currency, string key, string? providerReference = null) =>
        new(paymentId, amount, currency, "CardholderDispute", "ProviderEvidence", "Safe case note", providerReference, key);

    private static PaymentDisputesController CreateController(BetccoDbContext db)
    {
        var controller = new PaymentDisputesController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "finance-admin"), new Claim(ClaimTypes.Role, PlatformRoles.Admin)], "Test"))
            }
        };
        return controller;
    }

    private static string Code(ObjectResult result) => result.Value!.GetType().GetProperty("code")!.GetValue(result.Value)!.ToString()!;

    private static async Task<Payment> AddPaymentAsync(BetccoDbContext db, PaymentStatus status)
    {
        var payment = new Payment
        {
            UserId = "student",
            Purpose = "CourseCart",
            ReferenceId = Guid.NewGuid(),
            Status = status,
            Subtotal = 100m,
            Total = 100m,
            Currency = "JOD",
            Provider = "PayTabs",
            ProviderPaymentId = $"paytabs-{Guid.NewGuid():N}"
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);
}
