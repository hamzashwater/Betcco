using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class RefundFoundationTests
{
    [Fact]
    public async Task Unpaid_zero_negative_excessive_and_wrong_currency_refunds_are_rejected()
    {
        await using var db = CreateDb();
        var service = new RefundService(db);
        var unpaid = await AddPaymentAsync(db, PaymentStatus.Processing);

        Assert.Equal("REFUND_PAYMENT_NOT_PAID", (await service.RecordInternalRefundAsync("finance", Request(unpaid.Id, 1m, "JOD", "unpaid"))).FailureCode);

        var paid = await AddPaidCoursePaymentAsync(db);
        Assert.Equal("REFUND_AMOUNT_INVALID", (await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, 0m, "JOD", "zero"))).FailureCode);
        Assert.Equal("REFUND_AMOUNT_INVALID", (await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, -1m, "JOD", "negative"))).FailureCode);
        Assert.Equal("REFUND_AMOUNT_EXCEEDS_BALANCE", (await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, 101m, "JOD", "excessive"))).FailureCode);
        Assert.Equal("REFUND_CURRENCY_INVALID", (await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, 100m, "USD", "currency"))).FailureCode);
        Assert.Empty(await db.Refunds.ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "RefundInvalidCurrencyRejected");
        Assert.Equal(1, await db.LedgerTransactions.CountAsync());
    }

    [Fact]
    public async Task Full_refund_records_immutable_evidence_payment_transition_and_balanced_new_reversal()
    {
        await using var db = CreateDb();
        var paid = await AddPaidCoursePaymentAsync(db);
        var originalLedger = await db.LedgerTransactions.Include(item => item.Entries).SingleAsync();
        var originalEntries = originalLedger.Entries.Select(entry => (entry.Id, entry.Side, entry.Amount, entry.CourseSaleAllocationId)).ToArray();
        var originalWallet = (await db.WalletTransactions.OrderBy(item => item.Id).ToListAsync()).Select(item => (item.Id, item.Amount, item.Type)).ToArray();
        var service = new RefundService(db);

        var result = await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, 100m, "JOD", "full"));

        var refund = Assert.IsType<RefundView>(result.Refund);
        Assert.Equal(nameof(RefundStatus.InternallyRecorded), refund.Status);
        Assert.Null(refund.ProviderRefundReference);
        Assert.Equal(nameof(RefundEntitlementDisposition.NotChangedPendingBusinessPolicy), refund.EntitlementDisposition);
        var payment = await db.Payments.SingleAsync(item => item.Id == paid.Payment.Id);
        Assert.Equal(PaymentStatus.Refunded, payment.Status);
        var transition = Assert.Single(await db.PaymentStatusTransitions.ToListAsync(), item => item.NewStatus == PaymentStatus.Refunded);
        Assert.Equal(PaymentTransitionSource.InternalRefundRecorded, transition.Source);
        Assert.Equal(refund.CorrelationReference, transition.CorrelationId);

        var ledgers = await db.LedgerTransactions.Include(item => item.Entries).ToListAsync();
        Assert.Equal(2, ledgers.Count);
        var unchangedOriginal = Assert.Single(ledgers, item => item.Id == originalLedger.Id);
        Assert.Equal(originalEntries, unchangedOriginal.Entries.Select(entry => (entry.Id, entry.Side, entry.Amount, entry.CourseSaleAllocationId)).ToArray());
        var reversal = Assert.Single(ledgers, item => item.RefundId == refund.Id);
        Assert.Equal(LedgerEventType.PaidCourseSaleRefund, reversal.EventType);
        Assert.Equal(reversal.Entries.Where(item => item.Side == LedgerEntrySide.Debit).Sum(item => item.Amount), reversal.Entries.Where(item => item.Side == LedgerEntrySide.Credit).Sum(item => item.Amount));
        Assert.All(reversal.Entries, entry => Assert.Equal(paid.Allocation.Id, entry.CourseSaleAllocationId));

        var persistedOriginalWallet = (await db.WalletTransactions.Where(item => item.RefundId == null).OrderBy(item => item.Id).ToListAsync()).Select(item => (item.Id, item.Amount, item.Type)).ToArray();
        Assert.Equal(originalWallet, persistedOriginalWallet);
        var reversals = await db.WalletTransactions.Where(item => item.RefundId == refund.Id).ToListAsync();
        Assert.Equal(-30m, Assert.Single(reversals, item => item.Type == "PlatformCommissionRefundReversal").Amount);
        Assert.Equal(-70m, Assert.Single(reversals, item => item.Type == "TeacherCourseEarningRefundReversal").Amount);
        Assert.Single(await db.Enrollments.Where(item => item.PaymentId == paid.Payment.Id).ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "RefundInternallyRecorded");
        Assert.Contains(db.AuditLogs, item => item.Action == "RefundEntitlementPolicyNotApplied");
    }

    [Fact]
    public async Task Partial_refund_is_preserved_as_requested_without_inventing_allocation_or_access_policy()
    {
        await using var db = CreateDb();
        var paid = await AddPaidCoursePaymentAsync(db);
        var service = new RefundService(db);

        var result = await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, 25m, "JOD", "partial"));

        var refund = Assert.IsType<RefundView>(result.Refund);
        Assert.Equal(nameof(RefundStatus.Requested), refund.Status);
        Assert.Equal("PARTIAL_REFUND_ALLOCATION_POLICY_REQUIRED", refund.FailureCode);
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync(item => item.Id == paid.Payment.Id)).Status);
        Assert.Single(await db.LedgerTransactions.ToListAsync());
        Assert.Equal(2, await db.WalletTransactions.CountAsync());
        Assert.Single(await db.Enrollments.Where(item => item.PaymentId == paid.Payment.Id).ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "RefundAllocationPolicyRequired");
    }

    [Fact]
    public async Task Duplicate_and_competing_refund_requests_cannot_duplicate_or_over_refund()
    {
        await using var db = CreateDb();
        var paid = await AddPaidCoursePaymentAsync(db);
        var service = new RefundService(db);
        var request = Request(paid.Payment.Id, 100m, "JOD", "idempotent");

        var first = await service.RecordInternalRefundAsync("finance", request);
        var replay = await service.RecordInternalRefundAsync("finance", request);
        var competing = await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, 100m, "JOD", "competing"));

        Assert.NotNull(first.Refund);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Equal(first.Refund!.Id, replay.Refund!.Id);
        Assert.Equal("REFUND_PAYMENT_NOT_PAID", competing.FailureCode);
        Assert.Single(await db.Refunds.ToListAsync());
        Assert.Equal(2, await db.LedgerTransactions.CountAsync());
        Assert.Equal(4, await db.WalletTransactions.CountAsync());
        Assert.Single(await db.PaymentStatusTransitions.Where(item => item.NewStatus == PaymentStatus.Refunded).ToListAsync());
        Assert.Contains(db.AuditLogs, item => item.Action == "RefundDuplicateReplay");
    }

    [Fact]
    public async Task Refund_history_is_append_only()
    {
        await using var db = CreateDb();
        var paid = await AddPaidCoursePaymentAsync(db);
        var service = new RefundService(db);
        var refund = Assert.IsType<RefundView>((await service.RecordInternalRefundAsync("finance", Request(paid.Payment.Id, 25m, "JOD", "immutable"))).Refund);
        var entity = await db.Refunds.SingleAsync(item => item.Id == refund.Id);

        entity.Amount = 1m;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(entity).State = EntityState.Unchanged;
        db.Refunds.Remove(entity);
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Refund_finalization_requires_finance_administrator_authorization()
    {
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(RefundsController).GetCustomAttributes(typeof(AuthorizeAttribute), true)));
        Assert.Equal("FinanceAdmin", authorization.Policy);

        var requirement = new PlatformPermissionRequirement(PlatformPermissions.ManageFinance);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, PlatformRoles.Student)], "Test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private static RecordInternalRefund Request(Guid paymentId, decimal amount, string currency, string idempotencyKey) => new(paymentId, amount, currency, "CustomerRequest", "Internal accounting only", idempotencyKey);

    private static async Task<(Payment Payment, CourseSaleAllocation Allocation)> AddPaidCoursePaymentAsync(BetccoDbContext db)
    {
        var track = new LearningTrack { Slug = $"track-{Guid.NewGuid():N}", ArabicName = "مسار", EnglishName = "Track", IsBtecFocused = true };
        var course = new Course { Slug = $"course-{Guid.NewGuid():N}", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        var cart = new Cart { OwnerKey = $"cart-{Guid.NewGuid():N}", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(track, course, cart);
        await db.SaveChangesAsync();
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", $"checkout-{Guid.NewGuid():N}");
        Assert.NotNull(checkout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, $"payment-{Guid.NewGuid():N}"));
        return (await db.Payments.SingleAsync(item => item.Id == checkout.PaymentId), await db.CourseSaleAllocations.SingleAsync(item => item.PaymentId == checkout.PaymentId));
    }

    private static async Task<Payment> AddPaymentAsync(BetccoDbContext db, PaymentStatus status)
    {
        var payment = new Payment { UserId = "student", Purpose = "CourseCart", ReferenceId = Guid.NewGuid(), Status = status, Subtotal = 100m, Total = 100m, Currency = "JOD", Provider = "Fake", ProviderPaymentId = $"fake-{Guid.NewGuid():N}" };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);
}
