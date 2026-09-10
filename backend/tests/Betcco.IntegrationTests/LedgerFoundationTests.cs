using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class LedgerFoundationTests
{
    [Fact]
    public async Task Balanced_decimal_ledger_transaction_is_persisted_with_equal_debits_and_credits()
    {
        await using var db = CreateDb();
        var accounts = await AddAccountsAsync(db);
        var transaction = CreateTransaction(accounts, 1.001m, 0.3m, 0.701m);
        db.LedgerTransactions.Add(transaction);

        await db.SaveChangesAsync();

        var saved = Assert.Single(await db.LedgerTransactions.Include(item => item.Entries).ToListAsync());
        Assert.Equal(1.001m, saved.Entries.Where(entry => entry.Side == LedgerEntrySide.Debit).Sum(entry => entry.Amount));
        Assert.Equal(1.001m, saved.Entries.Where(entry => entry.Side == LedgerEntrySide.Credit).Sum(entry => entry.Amount));
        Assert.All(saved.Entries, entry => Assert.Equal("JOD", entry.Currency));
    }

    [Fact]
    public async Task Unbalanced_or_mixed_currency_ledger_transactions_are_rejected()
    {
        await using var db = CreateDb();
        var accounts = await AddAccountsAsync(db);
        var unbalanced = CreateTransaction(accounts, 10m, 3m, 6m);
        db.LedgerTransactions.Add(unbalanced);

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        db.ChangeTracker.Clear();
        var mixedCurrency = CreateTransaction(accounts, 10m, 3m, 7m);
        mixedCurrency.Entries.First(entry => entry.Side == LedgerEntrySide.Credit).Currency = "USD";
        db.LedgerTransactions.Add(mixedCurrency);

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        db.ChangeTracker.Clear();
        var oneSided = new LedgerTransaction
        {
            EventType = LedgerEventType.PaidCourseSale,
            Currency = "JOD",
            BusinessEventReference = $"ledger-test:{Guid.NewGuid():N}"
        };
        oneSided.Entries.Add(new LedgerEntry { LedgerAccount = accounts.Clearing, Side = LedgerEntrySide.Debit, Amount = 1m, Currency = "JOD" });
        db.LedgerTransactions.Add(oneSided);

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Ledger_transactions_and_entries_are_append_only_and_cannot_be_appended_after_finalization()
    {
        await using var db = CreateDb();
        var accounts = await AddAccountsAsync(db);
        var transaction = CreateTransaction(accounts, 10m, 3m, 7m);
        db.LedgerTransactions.Add(transaction);
        await db.SaveChangesAsync();

        var entry = transaction.Entries.First();
        entry.Amount = 1m;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        db.Entry(entry).State = EntityState.Unchanged;
        db.LedgerEntries.Remove(entry);
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        db.Entry(entry).State = EntityState.Unchanged;
        transaction.BusinessEventReference = "rewritten";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        db.Entry(transaction).State = EntityState.Unchanged;
        Assert.Throws<InvalidOperationException>(() => db.LedgerTransactions.Remove(transaction));

        db.ChangeTracker.Clear();
        db.LedgerEntries.Add(new LedgerEntry
        {
            LedgerTransactionId = transaction.Id,
            LedgerAccountId = accounts.Clearing.Id,
            Side = LedgerEntrySide.Debit,
            Amount = 1m,
            Currency = "JOD"
        });
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Invalid_ledger_booking_rolls_back_wallet_projection_in_the_same_save()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using (var db = CreateDb(databaseName))
        {
            var accounts = await AddAccountsAsync(db);
            db.WalletTransactions.Add(new WalletTransaction
            {
                UserId = "teacher",
                Type = "TeacherCourseEarning",
                Amount = 10m,
                Currency = "JOD",
                Description = "Pending projection"
            });
            db.LedgerTransactions.Add(CreateTransaction(accounts, 10m, 3m, 6m));

            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        }

        await using var verification = CreateDb(databaseName);
        Assert.Empty(await verification.WalletTransactions.ToListAsync());
        Assert.Empty(await verification.LedgerTransactions.ToListAsync());
    }

    [Fact]
    public async Task Existing_paid_payment_is_not_given_fabricated_ledger_history()
    {
        await using var db = CreateDb();
        db.Payments.Add(new Payment
        {
            UserId = "student",
            Purpose = "CourseCart",
            ReferenceId = Guid.NewGuid(),
            Status = PaymentStatus.Paid,
            Subtotal = 100m,
            Total = 100m,
            Currency = "JOD",
            Provider = "Fake",
            ProviderPaymentId = "pre-ledger-payment"
        });

        await db.SaveChangesAsync();

        Assert.Empty(await db.LedgerTransactions.ToListAsync());
        Assert.Empty(await db.LedgerEntries.ToListAsync());
    }

    private static async Task<LedgerAccounts> AddAccountsAsync(BetccoDbContext db)
    {
        var clearing = new LedgerAccount { Code = LedgerAccountCode.CourseSaleClearing, Currency = "JOD" };
        var commission = new LedgerAccount { Code = LedgerAccountCode.PlatformCommission, Currency = "JOD" };
        var teacherPayable = new LedgerAccount { Code = LedgerAccountCode.TeacherEarningsPayable, Currency = "JOD" };
        db.LedgerAccounts.AddRange(clearing, commission, teacherPayable);
        await db.SaveChangesAsync();
        return new LedgerAccounts(clearing, commission, teacherPayable);
    }

    private static LedgerTransaction CreateTransaction(LedgerAccounts accounts, decimal debit, decimal commission, decimal teacherPayable)
    {
        var transaction = new LedgerTransaction
        {
            EventType = LedgerEventType.PaidCourseSale,
            Currency = "JOD",
            BusinessEventReference = $"ledger-test:{Guid.NewGuid():N}"
        };
        transaction.Entries.Add(new LedgerEntry { LedgerAccount = accounts.Clearing, Side = LedgerEntrySide.Debit, Amount = debit, Currency = "JOD" });
        transaction.Entries.Add(new LedgerEntry { LedgerAccount = accounts.Commission, Side = LedgerEntrySide.Credit, Amount = commission, Currency = "JOD" });
        transaction.Entries.Add(new LedgerEntry { LedgerAccount = accounts.TeacherPayable, Side = LedgerEntrySide.Credit, Amount = teacherPayable, Currency = "JOD" });
        return transaction;
    }

    private static BetccoDbContext CreateDb(string? databaseName = null) => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);

    private sealed record LedgerAccounts(LedgerAccount Clearing, LedgerAccount Commission, LedgerAccount TeacherPayable);
}
