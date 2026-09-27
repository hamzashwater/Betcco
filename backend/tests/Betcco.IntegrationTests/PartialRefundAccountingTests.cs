using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class PartialRefundAccountingTests
{
    [Fact]
    public async Task Taxed_single_partial_books_revenue_only_and_preserves_access_and_credit()
    {
        await using var db = CreateDb();
        var sale = await SeedAsync(db, 116m, 16m, (100m, 30m, 70m, "teacher"));

        var result = await new RefundService(db).RecordInternalRefundAsync("finance", Request(sale.Payment.Id, 20m, "first"));

        var refund = Assert.IsType<RefundView>(result.Refund);
        Assert.Equal(nameof(RefundStatus.InternallyRecorded), refund.Status);
        Assert.Equal(nameof(RefundEntitlementDisposition.NotChangedPendingBusinessPolicy), refund.EntitlementDisposition);
        Assert.Equal(PaymentStatus.PartiallyRefunded, sale.Payment.Status);
        var transition = Assert.Single(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Equal((PaymentStatus.Paid, PaymentStatus.PartiallyRefunded), (transition.PreviousStatus, transition.NewStatus));
        Assert.Equal((2.759m, 17.241m), (20m - await RevenueAsync(db, refund.Id), await RevenueAsync(db, refund.Id)));
        await AssertLedgerBalancedAsync(db, refund.Id);
        Assert.Equal(-5.172m, await WalletAsync(db, refund.Id, "platform", "PlatformCommissionRefundReversal"));
        Assert.Equal(-12.069m, await WalletAsync(db, refund.Id, "teacher", "TeacherCourseEarningRefundReversal"));
        Assert.Null(sale.Enrollment.AccessEndsAtUtc);
        Assert.Null(sale.Credit.RevokedAtUtc);
        Assert.Null(sale.Credit.RevokedByRefundId);
        Assert.Null(sale.Credit.ConsumedAtUtc);
    }

    [Fact]
    public async Task Cumulative_partials_converge_to_full_snapshot_without_duplicate_effects()
    {
        await using var db = CreateDb();
        var sale = await SeedAsync(db, 116m, 16m, (100m, 30m, 70m, "teacher"));
        var service = new RefundService(db);
        var firstRequest = Request(sale.Payment.Id, 20m, "one");
        var first = Assert.IsType<RefundView>((await service.RecordInternalRefundAsync("finance", firstRequest)).Refund);
        var second = Assert.IsType<RefundView>((await service.RecordInternalRefundAsync("finance", Request(sale.Payment.Id, 30m, "two"))).Refund);

        Assert.Equal((PaymentStatus.PartiallyRefunded, PaymentStatus.PartiallyRefunded),
            (sale.Payment.Status, (await db.PaymentStatusTransitions.OrderBy(item => item.CreatedAtUtc).LastAsync()).NewStatus));
        Assert.Equal(6.897m, 50m - await RevenueAsync(db, first.Id) - await RevenueAsync(db, second.Id));
        Assert.Equal(4.138m, 30m - await RevenueAsync(db, second.Id));
        Assert.Equal(25.862m, await RevenueAsync(db, second.Id));

        var beforeReplay = (await db.LedgerTransactions.CountAsync(), await db.LedgerEntries.CountAsync(),
            await db.WalletTransactions.CountAsync(), await db.PaymentStatusTransitions.CountAsync(),
            await db.RefundStatusTransitions.CountAsync());
        var replay = await service.RecordInternalRefundAsync("finance", firstRequest);
        Assert.True(replay.IsIdempotentReplay);
        Assert.Equal(first.Id, replay.Refund?.Id);
        Assert.Equal(beforeReplay, (await db.LedgerTransactions.CountAsync(), await db.LedgerEntries.CountAsync(),
            await db.WalletTransactions.CountAsync(), await db.PaymentStatusTransitions.CountAsync(),
            await db.RefundStatusTransitions.CountAsync()));

        Assert.Equal("REFUND_AMOUNT_EXCEEDS_BALANCE",
            (await service.RecordInternalRefundAsync("finance", Request(sale.Payment.Id, 67m, "too-much"))).FailureCode);
        var final = Assert.IsType<RefundView>((await service.RecordInternalRefundAsync("finance", Request(sale.Payment.Id, 66m, "final"))).Refund);
        Assert.Equal(nameof(RefundStatus.InternallyRecorded), final.Status);
        Assert.Equal(PaymentStatus.Refunded, sale.Payment.Status);
        Assert.Equal(100m, await db.LedgerEntries.Where(item => item.Side == LedgerEntrySide.Credit
            && item.LedgerTransaction!.RefundId != null).SumAsync(item => item.Amount));
        Assert.Equal(-30m, await db.WalletTransactions.Where(item => item.Type == "PlatformCommissionRefundReversal").SumAsync(item => item.Amount));
        Assert.Equal(-70m, await db.WalletTransactions.Where(item => item.Type == "TeacherCourseEarningRefundReversal").SumAsync(item => item.Amount));
        Assert.Equal(16m, 116m - await db.LedgerEntries.Where(item => item.Side == LedgerEntrySide.Credit
            && item.LedgerTransaction!.RefundId != null).SumAsync(item => item.Amount));
        Assert.Equal(final.Id, sale.Credit.RevokedByRefundId);
        Assert.NotNull(sale.Credit.RevokedAtUtc);
        Assert.Null(sale.Enrollment.AccessEndsAtUtc);
        var transitions = await db.PaymentStatusTransitions.OrderBy(item => item.CreatedAtUtc).ToListAsync();
        Assert.Equal(3, transitions.Count);
        Assert.Equal((PaymentStatus.Paid, PaymentStatus.PartiallyRefunded), (transitions[0].PreviousStatus, transitions[0].NewStatus));
        Assert.Equal((PaymentStatus.PartiallyRefunded, PaymentStatus.PartiallyRefunded), (transitions[1].PreviousStatus, transitions[1].NewStatus));
        Assert.Equal((PaymentStatus.PartiallyRefunded, PaymentStatus.Refunded), (transitions[2].PreviousStatus, transitions[2].NewStatus));
        await AssertLedgerBalancedAsync(db, second.Id);
        await AssertLedgerBalancedAsync(db, final.Id);
    }

    [Fact]
    public async Task Two_courses_assign_one_minor_unit_residual_deterministically_and_credit_original_teachers()
    {
        await using var db = CreateDb();
        var sale = await SeedAsync(db, 100m, 0m,
            (50m, 15m, 35m, "teacher-a"), (50m, 15m, 35m, "teacher-b"));
        var ordered = sale.Allocations.OrderBy(item => item.Id).ToArray();

        var refund = Assert.IsType<RefundView>((await new RefundService(db).RecordInternalRefundAsync("finance",
            Request(sale.Payment.Id, 20.001m, "multi-course"))).Refund);

        Assert.Equal(nameof(RefundStatus.InternallyRecorded), refund.Status);
        var credits = await db.LedgerEntries.Include(item => item.LedgerAccount)
            .Where(item => item.LedgerTransaction!.RefundId == refund.Id && item.LedgerAccount!.Code == LedgerAccountCode.CourseSaleClearing)
            .OrderBy(item => item.CourseSaleAllocationId).ToListAsync();
        Assert.Equal(2, credits.Count);
        Assert.Equal((ordered[0].Id, 10m), (credits[0].CourseSaleAllocationId, credits[0].Amount));
        Assert.Equal((ordered[1].Id, 10.001m), (credits[1].CourseSaleAllocationId, credits[1].Amount));
        Assert.Equal(20.001m, credits.Sum(item => item.Amount));
        Assert.True(credits.All(item => item.Amount <= 50m));
        foreach (var allocation in ordered)
        {
            var teacherWallet = await WalletAsync(db, refund.Id, allocation.TeacherUserId!, "TeacherCourseEarningRefundReversal");
            Assert.True(teacherWallet < 0m);
        }
        await AssertLedgerBalancedAsync(db, refund.Id);
        Assert.Null(sale.Credit.RevokedAtUtc);
    }

    [Fact]
    public async Task Internally_recorded_partial_refund_cannot_issue_partial_credit_note()
    {
        await using var db = CreateDb();
        var sale = await SeedAsync(db, 116m, 16m, (100m, 30m, 70m, "teacher"));
        var documents = new CommercialDocumentService(db);
        Assert.NotNull((await documents.IssueInvoiceAsync("finance", sale.Payment.Id)).Document);
        var refund = Assert.IsType<RefundView>((await new RefundService(db).RecordInternalRefundAsync(
            "finance", Request(sale.Payment.Id, 20m, "partial-document"))).Refund);

        var result = await documents.IssueCreditNoteAsync("finance", refund.Id);

        Assert.Equal("CREDIT_NOTE_PARTIAL_OR_MISMATCHED_REFUND_UNSUPPORTED", result.FailureCode);
        Assert.Empty(await db.CreditNotes.ToListAsync());
    }

    [Fact]
    public async Task Unsupported_purpose_and_historical_precision_stop_before_financial_effects()
    {
        await using var db = CreateDb();
        var sale = await SeedAsync(db, 116m, 16m, (100m, 30m, 70m, "teacher"));
        sale.Payment.Purpose = "Evaluation";
        var service = new RefundService(db);
        var unsupported = Assert.IsType<RefundView>((await service.RecordInternalRefundAsync("finance", Request(sale.Payment.Id, 20m, "purpose"))).Refund);
        Assert.Equal("REFUND_PURPOSE_REVIEW_REQUIRED", unsupported.FailureCode);

        await using var historicalDb = CreateDb();
        var historicalSale = await SeedAsync(historicalDb, 116m, 16m, (100.0001m, 30m, 70m, "teacher"));
        var historical = Assert.IsType<RefundView>((await new RefundService(historicalDb).RecordInternalRefundAsync(
            "finance", Request(historicalSale.Payment.Id, 20m, "history"))).Refund);
        Assert.Equal("REFUND_HISTORICAL_MONEY_REVIEW_REQUIRED", historical.FailureCode);
        Assert.Equal(PaymentStatus.Paid, sale.Payment.Status);
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Null(sale.Credit.RevokedAtUtc);
        Assert.Empty(await historicalDb.LedgerTransactions.ToListAsync());

        await using var paymentDb = CreateDb();
        var paymentSnapshot = await SeedAsync(paymentDb, 116.0001m, 16m, (100.0001m, 30m, 70.0001m, "teacher"));
        var invalidPayment = await new RefundService(paymentDb).RecordInternalRefundAsync(
            "finance", Request(paymentSnapshot.Payment.Id, 20m, "invalid-payment-snapshot"));
        Assert.Equal("REFUND_HISTORICAL_MONEY_REVIEW_REQUIRED", invalidPayment.FailureCode);
        Assert.Empty(await paymentDb.Refunds.ToListAsync());
    }

    [Fact]
    public async Task Tax_only_increment_and_invalid_split_remain_requested_without_partial_effects()
    {
        await using var db = CreateDb();
        var taxOnly = await SeedAsync(db, 0.003m, 0.002m, (0.001m, 0m, 0.001m, "teacher"));
        var service = new RefundService(db);
        var blocked = Assert.IsType<RefundView>((await service.RecordInternalRefundAsync("finance", Request(taxOnly.Payment.Id, 0.001m, "tax-only"))).Refund);
        Assert.Equal("REFUND_TAX_ONLY_INCREMENT_REQUIRES_REVIEW", blocked.FailureCode);
        Assert.Equal(nameof(RefundStatus.Requested), blocked.Status);
        Assert.Equal(PaymentStatus.Paid, taxOnly.Payment.Status);

        await using var invalidDb = CreateDb();
        var invalid = await SeedAsync(invalidDb, 100m, 0m, (100m, 31m, 70m, "teacher"));
        var rejected = Assert.IsType<RefundView>((await new RefundService(invalidDb).RecordInternalRefundAsync(
            "finance", Request(invalid.Payment.Id, 20m, "bad-split"))).Refund);
        Assert.Equal("REFUND_ALLOCATION_POLICY_REQUIRED", rejected.FailureCode);
        Assert.Equal(PaymentStatus.Paid, invalid.Payment.Status);
        Assert.Empty(await db.LedgerTransactions.ToListAsync());
        Assert.Empty(await db.WalletTransactions.ToListAsync());
        Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
        Assert.Empty(await invalidDb.LedgerTransactions.ToListAsync());
    }

    private static RecordInternalRefund Request(Guid paymentId, decimal amount, string key) =>
        new(paymentId, amount, "JOD", "CustomerRequest", null, key);

    private static async Task<(Payment Payment, CourseSaleAllocation[] Allocations, Enrollment Enrollment, IncludedEvaluationEntitlement Credit)> SeedAsync(
        BetccoDbContext db, decimal total, decimal tax, params (decimal Net, decimal Platform, decimal Teacher, string UserId)[] lines)
    {
        var payment = new Payment
        {
            UserId = "student",
            Purpose = "CourseCart",
            ReferenceId = Guid.NewGuid(),
            Status = PaymentStatus.Paid,
            Subtotal = total - tax,
            Tax = tax,
            Total = total,
            Currency = "JOD",
            Provider = "Fake"
        };
        var allocations = lines.Select((line, index) => new CourseSaleAllocation
        {
            Id = Guid.Parse($"00000000-0000-0000-0000-{index + 1:000000000000}"),
            PaymentId = payment.Id,
            CourseId = Guid.NewGuid(),
            TeacherUserId = line.UserId,
            NetAmount = line.Net,
            PlatformCommission = line.Platform,
            TeacherEarning = line.Teacher,
            Currency = "JOD"
        }).ToArray();
        var enrollment = new Enrollment { StudentUserId = "student", CourseId = allocations[0].CourseId, PaymentId = payment.Id };
        var credit = new IncludedEvaluationEntitlement
        {
            StudentUserId = "student",
            EnrollmentId = enrollment.Id,
            UnitDefinitionId = Guid.NewGuid(),
            GrantedByPaymentId = payment.Id
        };
        db.Add(payment);
        db.AddRange(allocations);
        db.Add(enrollment);
        db.Add(credit);
        await db.SaveChangesAsync();
        return (payment, allocations, enrollment, credit);
    }

    private static async Task<decimal> RevenueAsync(BetccoDbContext db, Guid refundId) =>
        await db.LedgerEntries.Where(item => item.LedgerTransaction!.RefundId == refundId
            && item.Side == LedgerEntrySide.Credit).SumAsync(item => item.Amount);

    private static async Task<decimal> WalletAsync(BetccoDbContext db, Guid refundId, string userId, string type) =>
        (await db.WalletTransactions.SingleAsync(item => item.RefundId == refundId && item.UserId == userId && item.Type == type)).Amount;

    private static async Task AssertLedgerBalancedAsync(BetccoDbContext db, Guid refundId)
    {
        var ledger = await db.LedgerTransactions.Include(item => item.Entries).SingleAsync(item => item.RefundId == refundId);
        Assert.Equal(ledger.Entries.Where(item => item.Side == LedgerEntrySide.Credit).Sum(item => item.Amount),
            ledger.Entries.Where(item => item.Side == LedgerEntrySide.Debit).Sum(item => item.Amount));
        Assert.All(ledger.Entries, item => Assert.True(item.Amount > 0m));
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)).Options);
}
