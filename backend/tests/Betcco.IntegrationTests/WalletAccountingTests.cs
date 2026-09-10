using Betcco.Application.Commerce;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class WalletAccountingTests
{
    [Fact]
    public async Task Verified_course_payment_allocates_30_percent_to_platform_and_70_percent_to_teacher()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course
        {
            Slug = "wallet-course",
            ArabicTitle = "دورة المحفظة",
            EnglishTitle = "Wallet Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            TeacherUserId = "teacher",
            Status = CourseStatus.Published,
            Price = 100m
        };
        var cart = new Cart { OwnerKey = "cart-owner", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(track, course, cart);
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", "cart-owner", null, "EWallet", "course-payment-key");
        Assert.NotNull(checkout);
        Assert.Equal("EWallet", checkout.PaymentMethod);

        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "wallet-payment-succeeded"));

        var allocation = Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Equal(100m, allocation.NetAmount);
        Assert.Equal(30m, allocation.PlatformCommission);
        Assert.Equal(70m, allocation.TeacherEarning);
        Assert.Equal(30m, await db.WalletTransactions.Where(transaction => transaction.UserId == "platform").SumAsync(transaction => transaction.Amount));
        Assert.Equal(70m, await db.WalletTransactions.Where(transaction => transaction.UserId == "teacher").SumAsync(transaction => transaction.Amount));
        Assert.Single(await db.Enrollments.ToListAsync());
        var ledgerTransaction = Assert.Single(await db.LedgerTransactions.Include(transaction => transaction.Entries).ThenInclude(entry => entry.LedgerAccount).ToListAsync());
        Assert.Equal(checkout.PaymentId, ledgerTransaction.PaymentId);
        Assert.Equal(LedgerEventType.PaidCourseSale, ledgerTransaction.EventType);
        Assert.Equal(100m, ledgerTransaction.Entries.Where(entry => entry.Side == LedgerEntrySide.Debit).Sum(entry => entry.Amount));
        Assert.Equal(100m, ledgerTransaction.Entries.Where(entry => entry.Side == LedgerEntrySide.Credit).Sum(entry => entry.Amount));
        Assert.All(ledgerTransaction.Entries, entry => Assert.Equal(allocation.Id, entry.CourseSaleAllocationId));
        Assert.Contains(ledgerTransaction.Entries, entry => entry.LedgerAccount!.Code == LedgerAccountCode.PlatformCommission && entry.Amount == 30m);
        Assert.Contains(ledgerTransaction.Entries, entry => entry.LedgerAccount!.Code == LedgerAccountCode.TeacherEarningsPayable && entry.Amount == 70m);
    }

    [Fact]
    public async Task Verified_course_payment_creates_one_enrollment_notification_and_sends_the_adapter_event()
    {
        await using var db = CreateDb();
        var student = new Betcco.Infrastructure.Identity.ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "enrolled@betcco.test",
            Email = "enrolled@betcco.test",
            DisplayName = "Enrolled student",
            EmailConfirmed = true
        };
        var track = new LearningTrack { Slug = "enrollment-notification", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course { Slug = "enrollment-notification-course", ArabicTitle = "دورة", EnglishTitle = "Enrollment course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 20m };
        var cart = new Cart { OwnerKey = "enrollment-notification-cart", UserId = student.Id.ToString() };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(student, track, course, cart);
        await db.SaveChangesAsync();

        var email = new RecordingEmailNotifications();
        var commerce = new CommerceService(db, new FakePaymentProvider(), email);
        var checkout = await commerce.CreateCourseCheckoutAsync(student.Id.ToString(), cart.OwnerKey, null, "Card", "enrollment-notification-key");

        Assert.NotNull(checkout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "enrollment-notification-succeeded"));
        Assert.Single(await db.Notifications.Where(item => item.Type == NotificationType.Enrollment).ToListAsync());
        Assert.Single(email.Events);
        Assert.Equal("CourseEnrollment", email.Events[0].EventName);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "enrollment-notification-succeeded"));
        Assert.Single(await db.Notifications.Where(item => item.Type == NotificationType.Enrollment).ToListAsync());
    }

    [Fact]
    public async Task Verified_package_payment_enrolls_each_included_course_and_allocates_the_discounted_package_price()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var first = new Course { Slug = "package-first", ArabicTitle = "الأولى", EnglishTitle = "First", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher-a", Status = CourseStatus.Published, Price = 100m };
        var second = new Course { Slug = "package-second", ArabicTitle = "الثانية", EnglishTitle = "Second", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher-b", Status = CourseStatus.Published, Price = 50m };
        var package = new CoursePackage { Slug = "business-bundle", ArabicTitle = "باقة", EnglishTitle = "Bundle", ArabicDescription = "وصف", EnglishDescription = "Description", Price = 120m, IsPublished = true };
        package.Courses.Add(new PackageCourse { CourseId = first.Id });
        package.Courses.Add(new PackageCourse { CourseId = second.Id });
        var cart = new Cart { OwnerKey = "package-cart", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Package, ReferenceId = package.Id });
        db.AddRange(track, first, second, package, cart);
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", "package-cart", null, "Card", "package-payment-key");

        Assert.NotNull(checkout);
        Assert.Equal(120m, checkout.Total);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "package-payment-succeeded"));
        Assert.Equal(2, await db.Enrollments.CountAsync());
        Assert.Equal(120m, await db.CourseSaleAllocations.SumAsync(allocation => allocation.NetAmount));
        Assert.Equal(36m, await db.CourseSaleAllocations.SumAsync(allocation => allocation.PlatformCommission));
        Assert.Equal(84m, await db.CourseSaleAllocations.SumAsync(allocation => allocation.TeacherEarning));
    }

    [Fact]
    public async Task Verified_payment_uses_the_admin_configured_commission_for_a_new_sale()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course { Slug = "configured-wallet-course", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        var cart = new Cart { OwnerKey = "configured-wallet-cart", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(track, course, cart, new SiteSetting { Key = "PlatformCommissionPercent", ArabicValue = "25", EnglishValue = "25", IsPublic = false });
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", "configured-wallet-cart", null, "Card", "configured-wallet-payment-key");

        Assert.NotNull(checkout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "configured-wallet-payment-succeeded"));
        var allocation = Assert.Single(await db.CourseSaleAllocations.ToListAsync());
        Assert.Equal(25m, allocation.PlatformCommission);
        Assert.Equal(75m, allocation.TeacherEarning);

        var setting = await db.SiteSettings.SingleAsync(item => item.Key == "PlatformCommissionPercent");
        setting.ArabicValue = "90";
        setting.EnglishValue = "90";
        await db.SaveChangesAsync();

        var historicalAllocation = await db.CourseSaleAllocations.SingleAsync();
        Assert.Equal(25m, historicalAllocation.PlatformCommission);
        Assert.Equal(75m, historicalAllocation.TeacherEarning);
    }

    [Fact]
    public async Task Checkout_snapshots_server_configured_tax_and_excludes_it_from_revenue_split()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "tax-track", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course { Slug = "tax-course", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 100m };
        var cart = new Cart { OwnerKey = "tax-cart", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = course.Id });
        db.AddRange(track, course, cart,
            new SiteSetting { Key = "SalesTaxPercent", ArabicValue = "16", EnglishValue = "16", IsPublic = false },
            new SiteSetting { Key = "PlatformCommissionPercent", ArabicValue = "30", EnglishValue = "30", IsPublic = false });
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateCourseCheckoutAsync("student", cart.OwnerKey, null, "Card", "tax-payment-key");

        Assert.NotNull(checkout);
        Assert.Equal(100m, checkout.Subtotal);
        Assert.Equal(0m, checkout.Discount);
        Assert.Equal(16m, checkout.Tax);
        Assert.Equal(116m, checkout.Total);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "tax-payment-succeeded"));

        var payment = await db.Payments.SingleAsync();
        Assert.Equal(16m, payment.Tax);
        var allocation = await db.CourseSaleAllocations.SingleAsync();
        Assert.Equal(100m, allocation.NetAmount);
        Assert.Equal(30m, allocation.PlatformCommission);
        Assert.Equal(70m, allocation.TeacherEarning);
    }

    [Fact]
    public async Task Expired_package_cannot_be_checked_out_even_when_it_was_already_in_a_cart()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course { Slug = "expired-package-course", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 20m };
        var package = new CoursePackage { Slug = "expired-package", ArabicTitle = "باقة", EnglishTitle = "Expired package", ArabicDescription = "وصف", EnglishDescription = "Description", Price = 10m, IsPublished = true, AvailableUntilUtc = DateTimeOffset.UtcNow.AddMinutes(-1) };
        package.Courses.Add(new PackageCourse { CourseId = course.Id });
        var cart = new Cart { OwnerKey = "expired-package-cart", UserId = "student" };
        cart.Items.Add(new CartItem { ItemType = CartItemType.Package, ReferenceId = package.Id });
        db.AddRange(track, course, package, cart);
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => commerce.CreateCourseCheckoutAsync("student", "expired-package-cart", null, "Card", "expired-package-key"));
        Assert.Equal("One or more packages are unavailable.", exception.Message);
        Assert.Empty(await db.Payments.ToListAsync());
    }

    [Fact]
    public async Task Withdrawal_reserves_balance_and_rejection_restores_it()
    {
        await using var db = CreateDb();
        db.WalletTransactions.Add(new WalletTransaction
        {
            UserId = "teacher",
            Type = "TeacherCourseEarning",
            Amount = 70m,
            Currency = "JOD",
            Description = "Verified teacher earning"
        });
        await db.SaveChangesAsync();
        var protectionPath = Path.Combine(Path.GetTempPath(), $"betcco-wallet-tests-{Guid.NewGuid():N}");
        var protection = DataProtectionProvider.Create(new DirectoryInfo(protectionPath));
        var wallet = new WalletService(db, protection, new FakePayoutProvider());

        var requested = await wallet.CreatePayoutRequestAsync("teacher", new CreatePayoutRequest(50m, "BankTransfer", "JO00TESTACCOUNT1234", "withdrawal-rejection-key"));
        Assert.NotNull(requested);
        Assert.Equal("Requested", requested.Status);
        Assert.Equal(20m, (await wallet.GetTeacherWalletAsync("teacher")).AvailableBalance);

        Assert.True(await wallet.RejectPayoutAsync("admin", requested.Id, "Missing payout verification"));
        Assert.True(await wallet.RejectPayoutAsync("admin", requested.Id, "Repeated request"));
        var afterRejection = await wallet.GetTeacherWalletAsync("teacher");
        Assert.Equal(70m, afterRejection.AvailableBalance);
        Assert.Equal("Rejected", Assert.Single(afterRejection.Payouts).Status);
        Assert.DoesNotContain("JO00TESTACCOUNT1234", Assert.Single(afterRejection.Payouts).DestinationMasked);
        var payoutTransactions = await db.WalletTransactions.Where(transaction => transaction.PayoutRequestId == requested.Id).ToListAsync();
        Assert.Equal(2, payoutTransactions.Count);
        Assert.Contains(payoutTransactions, transaction => transaction.Type == "PayoutReserved" && transaction.Amount == -50m);
        Assert.Contains(payoutTransactions, transaction => transaction.Type == "PayoutReversal" && transaction.Amount == 50m);
    }

    [Fact]
    public async Task Payout_request_is_idempotent_and_cannot_reserve_another_teachers_earnings()
    {
        await using var db = CreateDb();
        db.WalletTransactions.Add(new WalletTransaction
        {
            UserId = "teacher-a",
            Type = "TeacherCourseEarning",
            Amount = 10m,
            Currency = "JOD",
            Description = "Verified teacher earning"
        });
        db.WalletTransactions.Add(new WalletTransaction
        {
            UserId = "teacher-b",
            Type = "TeacherCourseEarning",
            Amount = 100m,
            Currency = "JOD",
            Description = "Other teacher earning"
        });
        await db.SaveChangesAsync();
        var wallet = CreateWalletService(db);

        var first = await wallet.CreatePayoutRequestAsync("teacher-a", new CreatePayoutRequest(6m, "BankTransfer", "JO00TESTACCOUNT1234", "teacher-a-withdrawal"));
        var duplicate = await wallet.CreatePayoutRequestAsync("teacher-a", new CreatePayoutRequest(9m, "EWallet", "99999999", "teacher-a-withdrawal"));

        Assert.NotNull(first);
        Assert.NotNull(duplicate);
        Assert.Equal(first.Id, duplicate.Id);
        Assert.Equal(6m, duplicate.Amount);
        Assert.Single(await db.PayoutRequests.Where(request => request.TeacherUserId == "teacher-a").ToListAsync());
        Assert.Single(await db.WalletTransactions.Where(transaction => transaction.PayoutRequestId == first.Id && transaction.Type == "PayoutReserved").ToListAsync());
        await Assert.ThrowsAsync<InvalidOperationException>(() => wallet.CreatePayoutRequestAsync("teacher-a", new CreatePayoutRequest(5m, "BankTransfer", "JO00TESTACCOUNT1234", "teacher-a-over-balance")));
        await Assert.ThrowsAsync<InvalidOperationException>(() => wallet.CreatePayoutRequestAsync("teacher-c", new CreatePayoutRequest(1m, "BankTransfer", "JO00TESTACCOUNT1234", "teacher-c-no-balance")));
        Assert.Empty(await db.PayoutRequests.Where(request => request.TeacherUserId == "teacher-c").ToListAsync());
    }

    [Fact]
    public async Task Wallet_balance_uses_full_append_only_history_and_jod_decimal_rounding()
    {
        await using var db = CreateDb();
        for (var index = 0; index < 101; index++)
        {
            db.WalletTransactions.Add(new WalletTransaction
            {
                UserId = "teacher",
                Type = "TeacherCourseEarning",
                Amount = 1.001m,
                Currency = "JOD",
                Description = "Verified teacher earning"
            });
        }
        await db.SaveChangesAsync();
        var wallet = CreateWalletService(db);

        var payout = await wallet.CreatePayoutRequestAsync("teacher", new CreatePayoutRequest(0.1006m, "BankTransfer", "JO00TESTACCOUNT1234", "decimal-withdrawal"));

        Assert.NotNull(payout);
        Assert.Equal(0.101m, payout.Amount);
        var view = await wallet.GetTeacherWalletAsync("teacher");
        Assert.Equal(101.101m, view.TotalEarned);
        Assert.Equal(0.101m, view.TotalWithdrawn);
        Assert.Equal(101m, view.AvailableBalance);
        Assert.Equal(100, view.Transactions.Count);
    }

    [Fact]
    public async Task Financial_ledger_entries_and_sale_allocations_are_append_only()
    {
        await using var db = CreateDb();
        var transaction = new WalletTransaction
        {
            UserId = "teacher",
            Type = "TeacherCourseEarning",
            Amount = 70m,
            Currency = "JOD",
            Description = "Verified teacher earning"
        };
        db.WalletTransactions.Add(transaction);
        await db.SaveChangesAsync();

        transaction.Amount = 0m;

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(transaction).State = EntityState.Unchanged;
        db.WalletTransactions.Remove(transaction);

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(transaction).State = EntityState.Unchanged;

        var allocation = new CourseSaleAllocation
        {
            PaymentId = Guid.NewGuid(),
            CourseId = Guid.NewGuid(),
            GrossAmount = 100m,
            NetAmount = 100m,
            PlatformCommission = 30m,
            TeacherEarning = 70m,
            Currency = "JOD"
        };
        db.CourseSaleAllocations.Add(allocation);
        await db.SaveChangesAsync();

        allocation.TeacherEarning = 0m;

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(allocation).State = EntityState.Unchanged;
        db.CourseSaleAllocations.Remove(allocation);

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options);

    private static WalletService CreateWalletService(BetccoDbContext db)
    {
        var protectionPath = Path.Combine(Path.GetTempPath(), $"betcco-wallet-tests-{Guid.NewGuid():N}");
        return new WalletService(db, DataProtectionProvider.Create(new DirectoryInfo(protectionPath)), new FakePayoutProvider());
    }

    private sealed class RecordingEmailNotifications : IEmailNotificationService
    {
        public List<PlatformEmailNotification> Events { get; } = [];

        public Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default)
        {
            Events.Add(notification);
            return Task.CompletedTask;
        }
    }
}
