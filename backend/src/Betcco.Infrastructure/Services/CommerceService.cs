using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Application.Commerce;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Globalization;
using System.Data;
using System.Collections.Concurrent;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class CommerceService(
    BetccoDbContext db,
    IPaymentProvider paymentProvider,
    IEmailNotificationService? emailNotifications = null,
    IConfiguration? configuration = null) : ICommerceService
{
    // PostgreSQL row locking is the cross-process guard. This small in-process
    // gate also keeps the EF InMemory development/test provider deterministic.
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> CouponRedemptionLocks = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> CartCheckoutLocks = new();
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> PaymentSessionLocks = new();
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> EvaluationCreditLocks = new(StringComparer.Ordinal);
    public async Task<CartView> GetCartAsync(string ownerKey, string? userId, string locale, CancellationToken cancellationToken = default)
    {
        var cart = await db.Carts.Include(x => x.Items).SingleOrDefaultAsync(x => x.OwnerKey == ownerKey, cancellationToken);
        if (cart is null) return new CartView(Guid.Empty, [], 0, 0, 0, "JOD");
        if (userId is not null && cart.UserId is null) { cart.UserId = userId; await db.SaveChangesAsync(cancellationToken); }
        return await ToViewAsync(cart, locale, cancellationToken);
    }

    public async Task<CartView> AddCourseAsync(string ownerKey, string? userId, Guid courseId, string locale, CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.SingleOrDefaultAsync(x => x.Id == courseId && x.Status == CourseStatus.Published, cancellationToken) ?? throw new InvalidOperationException("Course is unavailable.");
        if (userId is not null && await db.Enrollments.AnyAsync(x => x.StudentUserId == userId && x.CourseId == courseId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) throw new InvalidOperationException("You are already enrolled in this course.");
        var cart = await db.Carts.Include(x => x.Items).SingleOrDefaultAsync(x => x.OwnerKey == ownerKey, cancellationToken);
        if (cart is null)
        {
            cart = new Cart { OwnerKey = ownerKey, UserId = userId };
            db.Carts.Add(cart);
        }
        else if (cart.Status == CartStatus.Closed) throw new InvalidOperationException("This cart has already been finalized.");
        else if (userId is not null && cart.UserId is null) cart.UserId = userId;
        if (!cart.Items.Any(x => x.ItemType == CartItemType.Course && x.ReferenceId == courseId)) cart.Items.Add(new CartItem { ItemType = CartItemType.Course, ReferenceId = courseId });
        await db.SaveChangesAsync(cancellationToken);
        return await ToViewAsync(cart, locale, cancellationToken);
    }

    public async Task<CartView> AddPackageAsync(string ownerKey, string? userId, Guid packageId, string locale, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var package = await db.CoursePackages.Include(x => x.Courses).SingleOrDefaultAsync(x => x.Id == packageId && x.IsPublished && (x.AvailableFromUtc == null || x.AvailableFromUtc <= now) && (x.AvailableUntilUtc == null || x.AvailableUntilUtc > now), cancellationToken) ?? throw new InvalidOperationException("Package is unavailable.");
        var packageCourseIds = package.Courses.Select(x => x.CourseId).Distinct().ToArray();
        if (packageCourseIds.Length == 0 || await db.Courses.CountAsync(x => packageCourseIds.Contains(x.Id) && x.Status == CourseStatus.Published, cancellationToken) != packageCourseIds.Length) throw new InvalidOperationException("Package courses are unavailable.");
        if (userId is not null && await db.Enrollments.AnyAsync(x => x.StudentUserId == userId && packageCourseIds.Contains(x.CourseId) && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) throw new InvalidOperationException("This package includes a course you already own.");
        var cart = await db.Carts.Include(x => x.Items).SingleOrDefaultAsync(x => x.OwnerKey == ownerKey, cancellationToken);
        if (cart is null)
        {
            cart = new Cart { OwnerKey = ownerKey, UserId = userId };
            db.Carts.Add(cart);
        }
        else if (cart.Status == CartStatus.Closed) throw new InvalidOperationException("This cart has already been finalized.");
        else if (userId is not null && cart.UserId is null) cart.UserId = userId;
        if (cart.Items.Any(x => x.ItemType == CartItemType.Course && packageCourseIds.Contains(x.ReferenceId))) throw new InvalidOperationException("Remove the included course from the cart before adding this package.");
        var cartPackageIds = cart.Items.Where(x => x.ItemType == CartItemType.Package).Select(x => x.ReferenceId).ToArray();
        if (cartPackageIds.Length > 0)
        {
            var existingCourseIds = await db.PackageCourses.Where(x => cartPackageIds.Contains(x.CoursePackageId)).Select(x => x.CourseId).ToArrayAsync(cancellationToken);
            if (existingCourseIds.Intersect(packageCourseIds).Any()) throw new InvalidOperationException("Your cart already contains a package with one or more of these courses.");
        }
        if (!cart.Items.Any(x => x.ItemType == CartItemType.Package && x.ReferenceId == packageId)) cart.Items.Add(new CartItem { ItemType = CartItemType.Package, ReferenceId = packageId });
        await db.SaveChangesAsync(cancellationToken);
        return await ToViewAsync(cart, locale, cancellationToken);
    }

    public async Task<bool> RemoveItemAsync(string ownerKey, string? userId, Guid itemId, CancellationToken cancellationToken = default)
    {
        var item = await db.CartItems.Include(x => x.Cart).SingleOrDefaultAsync(x => x.Id == itemId && x.Cart!.OwnerKey == ownerKey, cancellationToken);
        if (item is null || item.Cart!.Status == CartStatus.Closed || (item.Cart.UserId is not null && item.Cart.UserId != userId)) return false;
        db.CartItems.Remove(item);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<CheckoutResult?> CreateCourseCheckoutAsync(string userId, string ownerKey, string? couponCode, string? paymentMethod, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) throw new InvalidOperationException("An idempotency key is required.");
        var replay = await db.Payments.SingleOrDefaultAsync(x => x.UserId == userId && x.IdempotencyKey == idempotencyKey, cancellationToken);
        if (replay is not null) return await ResumeCheckoutAsync(replay, cancellationToken);

        var cartId = await db.Carts.AsNoTracking()
            .Where(x => x.OwnerKey == ownerKey && (x.UserId == null || x.UserId == userId))
            .Select(x => (Guid?)x.Id)
            .SingleOrDefaultAsync(cancellationToken);
        if (cartId is null) return null;

        var checkoutLock = !db.Database.IsRelational()
            ? CartCheckoutLocks.GetOrAdd(cartId.Value, _ => new SemaphoreSlim(1, 1))
            : null;
        if (checkoutLock is not null) await checkoutLock.WaitAsync(cancellationToken);
        try
        {
            replay = await db.Payments.SingleOrDefaultAsync(x => x.UserId == userId && x.IdempotencyKey == idempotencyKey, cancellationToken);
            if (replay is not null) return await ResumeCheckoutAsync(replay, cancellationToken);

            var cart = await db.Carts.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == cartId && x.OwnerKey == ownerKey && (x.UserId == null || x.UserId == userId), cancellationToken);
            if (cart is null || cart.Items.Count == 0) return null;
            if (cart.Status == CartStatus.Closed) throw new InvalidOperationException("This cart has already been finalized.");

            var activePayment = await db.Payments.SingleOrDefaultAsync(x => x.UserId == userId && x.Purpose == "CourseCart" && x.ReferenceId == cart.Id && x.Status == PaymentStatus.Processing, cancellationToken);
            if (activePayment is not null) return await ResumeCheckoutAsync(activePayment, cancellationToken);
            if (await db.Payments.AnyAsync(x => x.UserId == userId && x.Purpose == "CourseCart" && x.ReferenceId == cart.Id && x.Status == PaymentStatus.Paid, cancellationToken))
                throw new InvalidOperationException("This cart has already been finalized.");

            var directCourseIds = cart.Items.Where(x => x.ItemType == CartItemType.Course).Select(x => x.ReferenceId).Distinct().ToArray();
            var packageIds = cart.Items.Where(x => x.ItemType == CartItemType.Package).Select(x => x.ReferenceId).Distinct().ToArray();
            var directCourses = await db.Courses.Where(x => directCourseIds.Contains(x.Id) && x.Status == CourseStatus.Published).ToListAsync(cancellationToken);
            if (directCourses.Count != directCourseIds.Length) throw new InvalidOperationException("One or more cart items are unavailable.");
            var now = DateTimeOffset.UtcNow;
            var packageList = packageIds.Length == 0 ? [] : await db.CoursePackages.Include(x => x.Courses).Where(x => packageIds.Contains(x.Id) && x.IsPublished && (x.AvailableFromUtc == null || x.AvailableFromUtc <= now) && (x.AvailableUntilUtc == null || x.AvailableUntilUtc > now)).ToListAsync(cancellationToken);
            if (packageList.Count != packageIds.Length) throw new InvalidOperationException("One or more packages are unavailable.");
            var packageCourseReferences = packageList.SelectMany(x => x.Courses).Select(x => x.CourseId).ToArray();
            var packageCourseIds = packageCourseReferences.Distinct().ToArray();
            if (packageCourseReferences.Length != packageCourseIds.Length) throw new InvalidOperationException("The cart contains overlapping packages.");
            if (directCourseIds.Intersect(packageCourseIds).Any()) throw new InvalidOperationException("A course cannot be purchased both separately and inside a package.");
            var packageCourses = await db.Courses.Where(x => packageCourseIds.Contains(x.Id) && x.Status == CourseStatus.Published).ToListAsync(cancellationToken);
            if (packageCourses.Count != packageCourseIds.Length) throw new InvalidOperationException("One or more package courses are unavailable.");
            var allCourseIds = directCourseIds.Concat(packageCourseIds).Distinct().ToArray();
            if (await db.Enrollments.AnyAsync(x => x.StudentUserId == userId && allCourseIds.Contains(x.CourseId) && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) throw new InvalidOperationException("The cart contains an existing entitlement.");
            var purchaseLines = directCourses.Select(course => new PurchasedCourseLine(course.Id, course.IsFree ? 0 : course.Price)).ToList();
            foreach (var package in packageList)
            {
                var included = package.Courses.Select(x => x.CourseId).Distinct().ToArray();
                var includedCourses = packageCourses.Where(x => included.Contains(x.Id)).ToArray();
                purchaseLines.AddRange(AllocatePackagePrice(package.IsPublished ? package.Price : 0, includedCourses));
            }
            var subtotal = directCourses.Sum(x => x.IsFree ? 0 : x.Price) + packageList.Sum(x => x.Price);
            Payment payment;
            await using (var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken))
            {
                var discount = await ReserveDiscountAsync(couponCode, subtotal, userId, allCourseIds, cancellationToken);
                try
                {
                    var tax = await CalculateTaxAsync(subtotal - discount.Amount, cancellationToken);
                    var method = ResolvePaymentMethod(paymentMethod);
                    payment = new Payment
                    {
                        UserId = userId,
                        Purpose = "CourseCart",
                        ReferenceId = cart.Id,
                        ActiveCartId = cart.Id,
                        Status = PaymentStatus.Processing,
                        Subtotal = subtotal,
                        Discount = discount.Amount,
                        Tax = tax,
                        Total = Math.Max(0, subtotal - discount.Amount) + tax,
                        Currency = "JOD",
                        Method = method,
                        Provider = paymentProvider.ProviderName,
                        ProviderSessionStatus = ProviderSessionStatus.NotStarted,
                        IdempotencyKey = idempotencyKey,
                        CouponId = discount.CouponId,
                        CouponCode = discount.Code,
                        LineItemsJson = JsonSerializer.Serialize(new CoursePurchaseSnapshot(purchaseLines))
                    };
                    db.Payments.Add(payment);
                    db.AuditLogs.Add(Audit(userId, "CheckoutCreated", nameof(Payment), payment.Id.ToString()));
                    try
                    {
                        await db.SaveChangesAsync(cancellationToken);
                        await transaction.CommitAsync(cancellationToken);
                    }
                    catch (DbUpdateException)
                    {
                        await transaction.RollbackAsync(cancellationToken);
                        db.ChangeTracker.Clear();
                        var protectedPayment = await db.Payments.SingleOrDefaultAsync(x => x.UserId == userId && x.Purpose == "CourseCart" && x.ReferenceId == cartId && x.Status == PaymentStatus.Processing, cancellationToken);
                        if (protectedPayment is not null) return await ResumeCheckoutAsync(protectedPayment, cancellationToken);
                        throw;
                    }
                }
                finally
                {
                    discount.ReleaseGate();
                }
            }

            return await ResumeCheckoutAsync(payment, cancellationToken);
        }
        finally
        {
            checkoutLock?.Release();
        }
    }
    public async Task<CheckoutResult?> CreateMembershipCheckoutAsync(string userId, Guid membershipPlanId, string? couponCode, string? paymentMethod, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) throw new InvalidOperationException("An idempotency key is required.");
        var existing = await db.Payments.SingleOrDefaultAsync(item => item.UserId == userId && item.IdempotencyKey == idempotencyKey, cancellationToken);
        if (existing is not null) return await ResumeCheckoutAsync(existing, cancellationToken);
        var plan = await db.MembershipPlans.Include(item => item.Courses).SingleOrDefaultAsync(item => item.Id == membershipPlanId && item.IsPublished, cancellationToken);
        if (plan is null || plan.Price < 0 || plan.Courses.Count == 0) return null;
        var courseIds = plan.Courses.Select(item => item.CourseId).Distinct().ToArray();
        var courses = await db.Courses.Where(item => courseIds.Contains(item.Id) && item.Status == CourseStatus.Published).ToListAsync(cancellationToken);
        if (courses.Count != courseIds.Length) return null;
        var purchaseLines = AllocatePackagePrice(plan.Price, courses);
        Payment payment;
        await using (var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken))
        {
            var discount = await ReserveDiscountAsync(couponCode, plan.Price, userId, courseIds, cancellationToken);
            try
            {
                var tax = await CalculateTaxAsync(plan.Price - discount.Amount, cancellationToken);
                var method = ResolvePaymentMethod(paymentMethod);
                payment = new Payment
                {
                    UserId = userId,
                    Purpose = "Membership",
                    ReferenceId = plan.Id,
                    Status = PaymentStatus.Processing,
                    Subtotal = plan.Price,
                    Discount = discount.Amount,
                    Tax = tax,
                    Total = Math.Max(0, plan.Price - discount.Amount) + tax,
                    Currency = plan.Currency,
                    Method = method,
                    Provider = paymentProvider.ProviderName,
                    ProviderSessionStatus = ProviderSessionStatus.NotStarted,
                    IdempotencyKey = idempotencyKey,
                    CouponId = discount.CouponId,
                    CouponCode = discount.Code,
                    LineItemsJson = JsonSerializer.Serialize(new MembershipPurchaseSnapshot(plan.Interval, purchaseLines))
                };
                db.Payments.Add(payment);
                db.AuditLogs.Add(Audit(userId, "MembershipCheckoutCreated", nameof(Payment), payment.Id.ToString()));
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            finally
            {
                discount.ReleaseGate();
            }
        }
        return await ResumeCheckoutAsync(payment, cancellationToken);
    }

    public async Task<CheckoutResult?> CreateCourseSubscriptionCheckoutAsync(string userId, Guid courseSubscriptionPlanId, string? couponCode, string? paymentMethod, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) throw new InvalidOperationException("An idempotency key is required.");
        var existing = await db.Payments.SingleOrDefaultAsync(item => item.UserId == userId && item.IdempotencyKey == idempotencyKey, cancellationToken);
        if (existing is not null) return await ResumeCheckoutAsync(existing, cancellationToken);
        var plan = await db.CourseSubscriptionPlans.Include(item => item.Course).SingleOrDefaultAsync(item => item.Id == courseSubscriptionPlanId && item.IsPublished && item.Course!.Status == CourseStatus.Published, cancellationToken);
        if (plan is null || plan.Price < 0) return null;
        Payment payment;
        await using (var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken))
        {
            var discount = await ReserveDiscountAsync(couponCode, plan.Price, userId, [plan.CourseId], cancellationToken);
            try
            {
                var tax = await CalculateTaxAsync(plan.Price - discount.Amount, cancellationToken);
                var method = ResolvePaymentMethod(paymentMethod);
                payment = new Payment
                {
                    UserId = userId,
                    Purpose = "CourseSubscription",
                    ReferenceId = plan.Id,
                    Status = PaymentStatus.Processing,
                    Subtotal = plan.Price,
                    Discount = discount.Amount,
                    Tax = tax,
                    Total = Math.Max(0, plan.Price - discount.Amount) + tax,
                    Currency = plan.Currency,
                    Method = method,
                    Provider = paymentProvider.ProviderName,
                    ProviderSessionStatus = ProviderSessionStatus.NotStarted,
                    IdempotencyKey = idempotencyKey,
                    CouponId = discount.CouponId,
                    CouponCode = discount.Code,
                    LineItemsJson = JsonSerializer.Serialize(new MembershipPurchaseSnapshot(plan.Interval, [new PurchasedCourseLine(plan.CourseId, plan.Price)]))
                };
                db.Payments.Add(payment);
                db.AuditLogs.Add(Audit(userId, "CourseSubscriptionCheckoutCreated", nameof(Payment), payment.Id.ToString()));
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            finally
            {
                discount.ReleaseGate();
            }
        }
        return await ResumeCheckoutAsync(payment, cancellationToken);
    }

    public Task<bool> ConfirmFakeWebhookAsync(Guid paymentId, string providerEventId, string? expectedOwnerUserId = null, CancellationToken cancellationToken = default) =>
        ConfirmTrustedPaymentAsync(paymentId, providerEventId, expectedOwnerUserId, null, "PaymentConfirmedByDevelopmentTest", PaymentTransitionSource.DevelopmentFakeConfirmation, cancellationToken);

    public async Task<bool> ConfirmPayTabsCallbackAsync(string cartId, string providerPaymentId, CancellationToken cancellationToken = default)
    {
        if (paymentProvider.ProviderName != "PayTabs" || string.IsNullOrWhiteSpace(cartId) || string.IsNullOrWhiteSpace(providerPaymentId)) return false;
        var payment = await db.Payments.SingleOrDefaultAsync(item => item.Provider == "PayTabs" && item.ProviderPaymentId == providerPaymentId, cancellationToken);
        if (payment is null && TryParsePayTabsCartId(cartId, out var paymentId))
            payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == paymentId && item.Provider == "PayTabs", cancellationToken);
        if (payment is null || !string.Equals(cartId, PayTabsPaymentProvider.CartId(payment.Id), StringComparison.Ordinal))
        {
            await RecordPayTabsAuditAsync("PayTabsCallbackRejected", cartId, cancellationToken);
            return false;
        }

        await RecordPayTabsAuditAsync("PayTabsCallbackReceived", payment.Id.ToString(), cancellationToken);
        PaymentTransactionVerification verification;
        try
        {
            verification = await paymentProvider.VerifyTransactionAsync(providerPaymentId, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            await RecordPayTabsAuditAsync("PayTabsTransactionResultUnknown", payment.Id.ToString(), cancellationToken);
            return false;
        }
        catch (HttpRequestException)
        {
            await RecordPayTabsAuditAsync("PayTabsTransactionResultUnknown", payment.Id.ToString(), cancellationToken);
            return false;
        }
        catch (InvalidOperationException)
        {
            await RecordPayTabsAuditAsync("PayTabsVerificationFailed", payment.Id.ToString(), cancellationToken);
            return false;
        }

        var structuralFailure = !string.Equals(verification.ProfileId, configuration?["PayTabs:ProfileId"], StringComparison.Ordinal)
            ? "PayTabsProfileMismatch"
            : !string.IsNullOrWhiteSpace(payment.ProviderPaymentId) && !string.Equals(verification.ProviderPaymentId, payment.ProviderPaymentId, StringComparison.Ordinal)
                ? "PayTabsTransactionReferenceMismatch"
                : !string.Equals(verification.CartId, PayTabsPaymentProvider.CartId(payment.Id), StringComparison.Ordinal)
                    ? "PayTabsCartMismatch"
                    : !string.Equals(verification.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase)
                        ? "PayTabsCurrencyMismatch"
                        : verification.Amount != payment.Total
                            ? "PayTabsAmountMismatch"
                            : null;
        if (structuralFailure is not null)
        {
            await RecordPayTabsAuditAsync(structuralFailure, payment.Id.ToString(), cancellationToken);
            await OpenReconciliationCaseAsync(payment, structuralFailure switch { "PayTabsAmountMismatch" => ProviderReconciliationCaseType.PaymentAmountMismatch, "PayTabsCurrencyMismatch" => ProviderReconciliationCaseType.PaymentCurrencyMismatch, _ => ProviderReconciliationCaseType.ProviderReferenceMismatch }, verification.ProviderPaymentId, verification.ProviderResultCode, verification.Amount, cancellationToken);
            return false;
        }
        if (string.IsNullOrWhiteSpace(payment.ProviderPaymentId))
        {
            payment.ProviderPaymentId = verification.ProviderPaymentId;
            payment.ProviderSessionStatus = ProviderSessionStatus.Ready;
            payment.ProviderSessionResolvedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        if (verification.IsDefiniteFailure)
            return await RecordPayTabsFailureAsync(payment.Id, providerPaymentId, verification.ProviderResultCode, cancellationToken);
        if (!verification.IsSuccessful)
        {
            await RecordPayTabsAuditAsync("PayTabsTransactionResultUnknown", payment.Id.ToString(), cancellationToken);
            return false;
        }

        await RecordPayTabsAuditAsync("PayTabsTransactionVerified", payment.Id.ToString(), cancellationToken);
        return await ConfirmTrustedPaymentAsync(payment.Id, providerPaymentId, null, "PayTabs", "PaymentConfirmedByPayTabs", PaymentTransitionSource.PayTabsVerifiedTransaction, cancellationToken);
    }

    private async Task<bool> ConfirmTrustedPaymentAsync(Guid paymentId, string providerEventId, string? expectedOwnerUserId, string? expectedProvider, string confirmationAction, PaymentTransitionSource transitionSource, CancellationToken cancellationToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return await ConfirmTrustedPaymentOnceAsync(paymentId, providerEventId, expectedOwnerUserId, expectedProvider, confirmationAction, transitionSource, cancellationToken);
            }
            catch (Exception exception) when (attempt < 2 && IsPostgresConcurrencyConflict(exception))
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    private async Task<bool> ConfirmTrustedPaymentOnceAsync(Guid paymentId, string providerEventId, string? expectedOwnerUserId, string? expectedProvider, string confirmationAction, PaymentTransitionSource transitionSource, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        Guid[] enrolledCourseIds = [];
        Guid[] includedCreditCourseIds = [];
        var payments = db.Payments.Where(payment => payment.Id == paymentId && payment.Provider != null);
        payments = expectedProvider is null
            ? payments.Where(payment => payment.Provider!.StartsWith("Fake"))
            : payments.Where(payment => payment.Provider == expectedProvider);
        if (!string.IsNullOrWhiteSpace(expectedOwnerUserId))
            payments = payments.Where(payment => payment.UserId == expectedOwnerUserId);
        var payment = await payments.SingleOrDefaultAsync(cancellationToken);
        if (payment is null) return false;
        var existingEvent = await db.WebhookEvents.SingleOrDefaultAsync(x => x.Provider == payment.Provider && x.ProviderEventId == providerEventId, cancellationToken);
        if (existingEvent is not null)
        {
            if (existingEvent.EventType == "payment.succeeded.reconciliation_required")
                return false;
            db.AuditLogs.Add(Audit(payment.UserId, "DuplicatePaymentConfirmationIgnored", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        if (payment.Status == PaymentStatus.Paid)
        {
            db.AuditLogs.Add(Audit(payment.UserId, "PaymentAlreadyFinalizedConfirmationIgnored", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        if (expectedProvider == "PayTabs" && payment.Status is PaymentStatus.Failed or PaymentStatus.Cancelled)
        {
            db.WebhookEvents.Add(new WebhookEvent { Provider = payment.Provider!, ProviderEventId = providerEventId, EventType = "payment.succeeded.reconciliation_required" });
            db.AuditLogs.Add(Audit("system:paytabs", "PayTabsLateSuccessReconciliationRequired", nameof(Payment), payment.Id.ToString()));
            await OpenReconciliationCaseAsync(payment, ProviderReconciliationCaseType.LateProviderSuccess, providerEventId, null, payment.Total, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return false;
        }
        if (!string.IsNullOrWhiteSpace(payment.CouponCode) && payment.CouponId is null)
        {
            if (expectedProvider == "PayTabs")
            {
                db.WebhookEvents.Add(new WebhookEvent { Provider = payment.Provider!, ProviderEventId = providerEventId, EventType = "payment.succeeded.reconciliation_required" });
                await OpenReconciliationCaseAsync(payment, ProviderReconciliationCaseType.CouponSnapshotIdentityMismatch, providerEventId, null, payment.Total, cancellationToken);
            }
            db.AuditLogs.Add(Audit(expectedProvider == "PayTabs" ? "system:paytabs" : payment.UserId, "PaymentCouponSnapshotIdentityRequiresReconciliation", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return false;
        }
        if (!PaymentWorkflow.CanTransition(payment.Status, PaymentStatus.Paid)) return false;
        db.WebhookEvents.Add(new WebhookEvent { Provider = payment.Provider!, ProviderEventId = providerEventId, EventType = "payment.succeeded" });
        TransitionPaymentToPaid(payment, transitionSource, providerEventId, expectedOwnerUserId ?? "system:paytabs");
        if (payment.Purpose == "CourseCart")
        {
            await CloseCartForTrustedPaymentAsync(payment, cancellationToken);
            var purchase = ReadPurchaseSnapshot(payment.LineItemsJson);
            var courseIds = purchase.Lines.Select(x => x.CourseId).Distinct().ToArray();
            var courses = await db.Courses.Where(x => courseIds.Contains(x.Id)).ToListAsync(cancellationToken);
            if (purchase.Lines.All(x => x.GrossAmount == 0) && courses.Any(x => !x.IsFree && x.Price > 0))
                purchase = new CoursePurchaseSnapshot(courses.Select(course => new PurchasedCourseLine(course.Id, course.IsFree ? 0 : course.Price)).ToArray());
            includedCreditCourseIds = purchase.Lines.Where(x => x.GrossAmount > 0).Select(x => x.CourseId).Distinct().ToArray();
            await GrantPermanentCourseAccessAsync(payment.UserId, courseIds, payment.Id, cancellationToken);
            await RecordCourseRevenueSplitAsync(payment, courses, purchase.Lines, cancellationToken);
            enrolledCourseIds = courseIds;
        }
        if (payment.Purpose == "Membership")
        {
            var purchase = ReadMembershipPurchaseSnapshot(payment.LineItemsJson);
            var courseIds = purchase.Lines.Select(item => item.CourseId).Distinct().ToArray();
            var courses = await db.Courses.Where(item => courseIds.Contains(item.Id)).ToListAsync(cancellationToken);
            if (courseIds.Length == 0 || courses.Count != courseIds.Length) return false;
            var now = DateTimeOffset.UtcNow;
            var endsAt = AddInterval(now, purchase.Interval);
            if (!await db.UserMemberships.AnyAsync(item => item.PaymentId == payment.Id, cancellationToken))
            {
                db.UserMemberships.Add(new UserMembership { StudentUserId = payment.UserId, MembershipPlanId = payment.ReferenceId, PaymentId = payment.Id, StartsAtUtc = now, EndsAtUtc = endsAt, Status = SubscriptionStatus.Active });
            }
            await GrantTimedCourseAccessAsync(payment.UserId, courseIds, payment.Id, endsAt, cancellationToken);
            await RecordCourseRevenueSplitAsync(payment, courses, purchase.Lines, cancellationToken);
            enrolledCourseIds = courseIds;
        }
        if (payment.Purpose == "CourseSubscription")
        {
            var purchase = ReadMembershipPurchaseSnapshot(payment.LineItemsJson);
            var courseIds = purchase.Lines.Select(item => item.CourseId).Distinct().ToArray();
            if (courseIds.Length != 1) return false;
            var course = await db.Courses.SingleOrDefaultAsync(item => item.Id == courseIds[0], cancellationToken);
            if (course is null) return false;
            var now = DateTimeOffset.UtcNow;
            var endsAt = AddInterval(now, purchase.Interval);
            if (!await db.UserCourseSubscriptions.AnyAsync(item => item.PaymentId == payment.Id, cancellationToken))
            {
                db.UserCourseSubscriptions.Add(new UserCourseSubscription { StudentUserId = payment.UserId, CourseSubscriptionPlanId = payment.ReferenceId, PaymentId = payment.Id, StartsAtUtc = now, EndsAtUtc = endsAt, Status = SubscriptionStatus.Active });
            }
            await GrantTimedCourseAccessAsync(payment.UserId, courseIds, payment.Id, endsAt, cancellationToken);
            await RecordCourseRevenueSplitAsync(payment, [course], purchase.Lines, cancellationToken);
            enrolledCourseIds = courseIds;
        }
        if (payment.Purpose == "Evaluation")
        {
            var evaluation = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == payment.ReferenceId && x.StudentUserId == payment.UserId, cancellationToken);
            if (evaluation is not null && EvaluationWorkflow.CanTransition(evaluation.Status, EvaluationStatus.PendingAssignment))
            {
                evaluation.PaymentId = payment.Id;
                evaluation.Status = EvaluationStatus.PendingAssignment;
            }
        }
        if (includedCreditCourseIds.Length > 0)
            await GrantIncludedEvaluationEntitlementsAsync(payment.UserId, includedCreditCourseIds, payment.Id, cancellationToken);

        if (enrolledCourseIds.Length > 0)
        {
            var titles = await db.Courses.AsNoTracking()
                .Where(course => enrolledCourseIds.Contains(course.Id))
                .Select(course => new { course.Id, course.ArabicTitle, course.EnglishTitle })
                .ToListAsync(cancellationToken);
            foreach (var course in titles)
            {
                db.Notifications.Add(new Notification
                {
                    UserId = payment.UserId,
                    Title = "تم تسجيلك في دورة جديدة / New course enrollment",
                    Body = $"{course.ArabicTitle} / {course.EnglishTitle}",
                    Type = NotificationType.Enrollment,
                    DeepLink = $"/student/learn/{course.Id}",
                    DeduplicationKey = $"enrollment:{payment.Id:N}:{course.Id:N}"
                });
            }
        }
        if (!await RecordCouponRedemptionAsync(payment, cancellationToken)) return false;
        db.AuditLogs.Add(Audit(
            payment.UserId,
            confirmationAction,
            nameof(Payment),
            payment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await SendEnrollmentEmailAsync(payment.UserId, enrolledCourseIds, cancellationToken);
        return true;
    }

    private async Task CloseCartForTrustedPaymentAsync(Payment payment, CancellationToken cancellationToken)
    {
        var cart = await db.Carts.SingleOrDefaultAsync(item => item.Id == payment.ReferenceId && (item.UserId == null || item.UserId == payment.UserId), cancellationToken);
        if (cart is null)
            throw new InvalidOperationException("The payment cart could not be finalized.");
        if (cart.Status == CartStatus.Closed)
        {
            if (cart.ClosedByPaymentId != payment.Id)
                throw new InvalidOperationException("The payment cart has already been finalized by another payment.");
            return;
        }

        cart.Status = CartStatus.Closed;
        cart.ClosedAtUtc = DateTimeOffset.UtcNow;
        cart.ClosedByPaymentId = payment.Id;
    }

    public async Task<PaymentCancellationResult> CancelProcessingPaymentAsync(string userId, Guid paymentId, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == paymentId && item.UserId == userId, cancellationToken);
        if (payment is null)
        {
            db.AuditLogs.Add(Audit(userId, "PaymentCancellationRejected", nameof(Payment), paymentId.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new(false, FailureCode: "PAYMENT_NOT_FOUND_OR_NOT_OWNED", FailureMessage: "The payment was not found.");
        }
        if (payment.Status == PaymentStatus.Cancelled)
        {
            db.AuditLogs.Add(Audit(userId, "DuplicatePaymentCancellationIgnored", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new(true, true);
        }
        if (payment.Status != PaymentStatus.Processing)
        {
            db.AuditLogs.Add(Audit(userId, "PaymentCancellationRejected", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new(false, FailureCode: "PAYMENT_NOT_CANCELLABLE", FailureMessage: "Only a processing payment can be cancelled.");
        }
        var providerSessionMayExist = payment.Provider is not null
            && !payment.Provider.StartsWith("Fake", StringComparison.Ordinal)
            && (payment.ProviderSessionStatus is ProviderSessionStatus.Creating
                or ProviderSessionStatus.Unknown
                or ProviderSessionStatus.Ready
                or ProviderSessionStatus.RequiresReconciliation
                || payment.ProviderSessionStatus is null && !string.IsNullOrWhiteSpace(payment.ProviderPaymentId));
        if (providerSessionMayExist)
        {
            db.AuditLogs.Add(Audit(userId, "PaymentCancellationRejectedProviderSessionUnresolved", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new(false, FailureCode: "PAYMENT_PROVIDER_SESSION_REQUIRES_RECONCILIATION", FailureMessage: "The provider session must be resolved before this payment can be cancelled.");
        }
        if (await db.WebhookEvents.AnyAsync(item => item.Provider == payment.Provider && item.ProviderEventId == payment.ProviderPaymentId && item.EventType.StartsWith("payment.succeeded"), cancellationToken))
        {
            db.AuditLogs.Add(Audit(userId, "PaymentCancellationRejectedProviderSuccess", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new(false, FailureCode: "PAYMENT_PROVIDER_SUCCESS_REQUIRES_RECONCILIATION", FailureMessage: "Provider success evidence requires reconciliation.");
        }

        await ReleaseCouponReservationAsync(payment, cancellationToken);
        TransitionPaymentToCancelled(payment, userId);
        db.AuditLogs.Add(Audit(userId, "PaymentCancelledByCustomer", nameof(Payment), payment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(true);
    }

    private async Task<bool> RecordPayTabsFailureAsync(Guid paymentId, string providerPaymentId, string? providerResultCode, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var payment = await db.Payments.SingleOrDefaultAsync(item => item.Id == paymentId && item.Provider == "PayTabs" && item.ProviderPaymentId == providerPaymentId, cancellationToken);
        if (payment is null) return false;
        if (payment.Status == PaymentStatus.Failed)
        {
            db.AuditLogs.Add(Audit("system:paytabs", "DuplicatePayTabsPaymentFailureIgnored", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return false;
        }
        if (payment.Status != PaymentStatus.Processing)
        {
            db.AuditLogs.Add(Audit("system:paytabs", "PayTabsPaymentFailureAfterTerminalStateRequiresReview", nameof(Payment), payment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return false;
        }

        await ReleaseCouponReservationAsync(payment, cancellationToken);
        TransitionPaymentToFailed(payment, providerPaymentId, providerResultCode);
        db.AuditLogs.Add(Audit("system:paytabs", "PayTabsPaymentFailed", nameof(Payment), payment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return false;
    }

    private void TransitionPaymentToPaid(Payment payment, PaymentTransitionSource source, string providerEventReference, string actorContext)
    {
        var previousStatus = payment.Status;
        if (!PaymentWorkflow.CanTransition(previousStatus, PaymentStatus.Paid))
            throw new InvalidOperationException("The requested payment transition is not allowed.");

        payment.Status = PaymentStatus.Paid;
        payment.PaidAtUtc = DateTimeOffset.UtcNow;
        db.PaymentStatusTransitions.Add(new PaymentStatusTransition
        {
            PaymentId = payment.Id,
            PreviousStatus = previousStatus,
            NewStatus = PaymentStatus.Paid,
            Source = source,
            ActorContext = actorContext,
            Provider = payment.Provider,
            ProviderEventReference = providerEventReference,
            IdempotencyKey = payment.IdempotencyKey,
            CorrelationId = providerEventReference
        });
    }

    private void TransitionPaymentToFailed(Payment payment, string providerEventReference, string? providerResultCode, PaymentTransitionSource source = PaymentTransitionSource.PayTabsVerifiedFailure)
    {
        if (!PaymentWorkflow.CanTransition(payment.Status, PaymentStatus.Failed))
            throw new InvalidOperationException("The requested payment transition is not allowed.");
        var previousStatus = payment.Status;
        payment.Status = PaymentStatus.Failed;
        db.PaymentStatusTransitions.Add(new PaymentStatusTransition
        {
            PaymentId = payment.Id,
            PreviousStatus = previousStatus,
            NewStatus = PaymentStatus.Failed,
            Source = source,
            ActorContext = "system:paytabs",
            Provider = payment.Provider,
            ProviderEventReference = providerEventReference,
            IdempotencyKey = payment.IdempotencyKey,
            ReasonCode = providerResultCode,
            CorrelationId = providerEventReference
        });
    }

    private void TransitionPaymentToCancelled(Payment payment, string userId)
    {
        if (!PaymentWorkflow.CanTransition(payment.Status, PaymentStatus.Cancelled))
            throw new InvalidOperationException("The requested payment transition is not allowed.");
        var previousStatus = payment.Status;
        payment.Status = PaymentStatus.Cancelled;
        db.PaymentStatusTransitions.Add(new PaymentStatusTransition
        {
            PaymentId = payment.Id,
            PreviousStatus = previousStatus,
            NewStatus = PaymentStatus.Cancelled,
            Source = PaymentTransitionSource.CustomerCancellation,
            ActorContext = userId,
            Provider = payment.Provider,
            IdempotencyKey = payment.IdempotencyKey,
            ReasonCode = "CustomerCancelled",
            CorrelationId = $"payment-cancellation:{payment.Id:N}"
        });
    }

    public async Task<IncludedEvaluationCreditStatus> GetIncludedEvaluationCreditStatusAsync(
        string userId,
        Guid assessmentScopeId,
        CancellationToken cancellationToken = default)
    {
        var unitDefinitionId = await AssessmentUnitDefinitionIdAsync(assessmentScopeId, cancellationToken);
        if (unitDefinitionId is null) return new(false);

        var available = await db.IncludedEvaluationEntitlements.AsNoTracking().AnyAsync(
            item => item.StudentUserId == userId
                && item.UnitDefinitionId == unitDefinitionId.Value
                && item.ConsumedByEvaluationRequestId == null
                && item.RevokedAtUtc == null,
            cancellationToken);
        return new(available);
    }

    public async Task<EvaluationCheckoutResult?> CreateEvaluationCheckoutAsync(string userId, Guid evaluationRequestId, string? paymentMethod, string idempotencyKey, bool expectIncludedCredit = false, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) throw new InvalidOperationException("An idempotency key is required.");

        var existing = await db.Payments.SingleOrDefaultAsync(x => x.UserId == userId && x.IdempotencyKey == idempotencyKey, cancellationToken);
        if (existing is not null)
        {
            var status = await db.EvaluationRequests.AsNoTracking()
                .Where(item => item.Id == evaluationRequestId && item.StudentUserId == userId)
                .Select(item => item.Status)
                .SingleOrDefaultAsync(cancellationToken);
            return new(false, status.ToString(), await ResumeCheckoutAsync(existing, cancellationToken));
        }

        var included = await TryConsumeIncludedEvaluationCreditAsync(userId, evaluationRequestId, cancellationToken);
        if (included is not null) return included;
        if (expectIncludedCredit)
            throw new InvalidOperationException("Your included evaluation credit could not be applied. Refresh the page before choosing a paid review.");

        var request = await db.EvaluationRequests.SingleOrDefaultAsync(x => x.Id == evaluationRequestId && x.StudentUserId == userId && x.Status == EvaluationStatus.Draft, cancellationToken);
        if (request is null
            || !await db.SubmissionFiles.AnyAsync(x => x.EvaluationRequestId == evaluationRequestId && x.ScanStatus == UploadScanStatus.Clean, cancellationToken)
            || !await db.AuthenticityDeclarations.AnyAsync(x => x.EvaluationRequestId == evaluationRequestId && x.AttemptNumber == request.SubmissionAttemptNumber, cancellationToken)) return null;
        if (!EvaluationWorkflow.CanTransition(request.Status, EvaluationStatus.PendingPayment)) return null;

        request.Status = EvaluationStatus.PendingPayment;
        var tax = await CalculateTaxAsync(request.Price, cancellationToken);
        var method = ResolvePaymentMethod(paymentMethod);
        var payment = new Payment
        {
            UserId = userId,
            Purpose = "Evaluation",
            ReferenceId = request.Id,
            Status = PaymentStatus.Processing,
            Subtotal = request.Price,
            Tax = tax,
            Total = request.Price + tax,
            Currency = request.Currency,
            Method = method,
            Provider = paymentProvider.ProviderName,
            ProviderSessionStatus = ProviderSessionStatus.NotStarted,
            IdempotencyKey = idempotencyKey,
            LineItemsJson = "[]"
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync(cancellationToken);
        return new(false, request.Status.ToString(), await ResumeCheckoutAsync(payment, cancellationToken));
    }

    private async Task<EvaluationCheckoutResult?> TryConsumeIncludedEvaluationCreditAsync(
        string userId,
        Guid evaluationRequestId,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return await TryConsumeIncludedEvaluationCreditOnceAsync(userId, evaluationRequestId, cancellationToken);
            }
            catch (DbUpdateConcurrencyException) when (attempt < 2)
            {
                db.ChangeTracker.Clear();
            }
            catch (Exception exception) when (attempt < 2 && IsPostgresConcurrencyConflict(exception))
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    private async Task<EvaluationCheckoutResult?> TryConsumeIncludedEvaluationCreditOnceAsync(
        string userId,
        Guid evaluationRequestId,
        CancellationToken cancellationToken)
    {
        var snapshot = await db.EvaluationRequests.AsNoTracking()
            .Where(item => item.Id == evaluationRequestId && item.StudentUserId == userId)
            .Select(item => new
            {
                item.Status,
                item.AssessmentScopeId,
                item.RetakeOfEvaluationRequestId,
                item.SubmissionAttemptNumber
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (snapshot is null || snapshot.RetakeOfEvaluationRequestId is not null) return null;

        var replay = await db.IncludedEvaluationEntitlements.AsNoTracking()
            .AnyAsync(item => item.StudentUserId == userId && item.ConsumedByEvaluationRequestId == evaluationRequestId, cancellationToken);
        if (replay) return new(true, snapshot.Status.ToString(), null);
        if (snapshot.Status != EvaluationStatus.Draft || snapshot.AssessmentScopeId is null) return null;

        var hasCleanFile = await db.SubmissionFiles.AsNoTracking().AnyAsync(
            item => item.EvaluationRequestId == evaluationRequestId && item.ScanStatus == UploadScanStatus.Clean,
            cancellationToken);
        var hasAuthenticity = await db.AuthenticityDeclarations.AsNoTracking().AnyAsync(
            item => item.EvaluationRequestId == evaluationRequestId && item.AttemptNumber == snapshot.SubmissionAttemptNumber,
            cancellationToken);
        if (!hasCleanFile || !hasAuthenticity) return null;

        var unitDefinitionId = await AssessmentUnitDefinitionIdAsync(snapshot.AssessmentScopeId.Value, cancellationToken);
        if (unitDefinitionId is null) return null;

        var lockKey = $"{userId}:{unitDefinitionId.Value:N}";
        var gate = EvaluationCreditLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
                : null;

            var request = await db.EvaluationRequests.SingleOrDefaultAsync(
                item => item.Id == evaluationRequestId && item.StudentUserId == userId,
                cancellationToken);
            if (request is null || request.RetakeOfEvaluationRequestId is not null)
            {
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return null;
            }

            var consumed = await db.IncludedEvaluationEntitlements.SingleOrDefaultAsync(
                item => item.StudentUserId == userId && item.ConsumedByEvaluationRequestId == evaluationRequestId,
                cancellationToken);
            if (consumed is not null)
            {
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return new(true, request.Status.ToString(), null);
            }
            if (request.Status != EvaluationStatus.Draft || request.AssessmentScopeId is null)
            {
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return null;
            }

            var currentUnitDefinitionId = await AssessmentUnitDefinitionIdAsync(request.AssessmentScopeId.Value, cancellationToken);
            if (currentUnitDefinitionId != unitDefinitionId)
            {
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return null;
            }

            var entitlement = await db.IncludedEvaluationEntitlements
                .Where(item => item.StudentUserId == userId
                    && item.UnitDefinitionId == unitDefinitionId.Value
                    && item.ConsumedByEvaluationRequestId == null
                    && item.RevokedAtUtc == null)
                .OrderBy(item => item.GrantedAtUtc)
                .ThenBy(item => item.Id)
                .FirstOrDefaultAsync(cancellationToken);
            if (entitlement is null)
            {
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return null;
            }

            if (!EvaluationWorkflow.CanTransition(request.Status, EvaluationStatus.PendingAssignment))
            {
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return null;
            }

            var previousStatus = request.Status;
            entitlement.ConsumedByEvaluationRequestId = request.Id;
            entitlement.ConsumedAtUtc = DateTimeOffset.UtcNow;
            request.Price = 0m;
            request.PaymentId = null;
            request.Status = EvaluationStatus.PendingAssignment;

            db.AssessmentAuditEvents.Add(new AssessmentAuditEvent
            {
                EvaluationRequestId = request.Id,
                ActorUserId = userId,
                EventType = "IncludedEvaluationCreditConsumed",
                FromStatus = previousStatus.ToString(),
                ToStatus = request.Status.ToString(),
                AttemptNumber = request.SubmissionAttemptNumber,
                Reason = $"Included evaluation credit {entitlement.Id:N} consumed."
            });
            db.AuditLogs.Add(Audit(
                userId,
                "IncludedEvaluationCreditConsumed",
                nameof(IncludedEvaluationEntitlement),
                entitlement.Id.ToString()));

            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            return new(true, request.Status.ToString(), null);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<Guid?> AssessmentUnitDefinitionIdAsync(Guid assessmentScopeId, CancellationToken cancellationToken) =>
        await db.AssessmentScopes.AsNoTracking()
            .Where(scope => scope.Id == assessmentScopeId)
            .Select(scope => (Guid?)scope.AssessmentDefinition!.UnitDefinitionId)
            .SingleOrDefaultAsync(cancellationToken);

    private async Task<CheckoutResult> ResumeCheckoutAsync(Payment payment, CancellationToken cancellationToken)
    {
        var sessionLock = !db.Database.IsRelational()
            ? PaymentSessionLocks.GetOrAdd(payment.Id, _ => new SemaphoreSlim(1, 1))
            : null;
        if (sessionLock is not null) await sessionLock.WaitAsync(cancellationToken);
        var postgresLockKey = BitConverter.ToInt64(payment.Id.ToByteArray(), 0);
        var postgresLockAcquired = false;
        try
        {
            if (db.Database.IsNpgsql())
            {
                await db.Database.OpenConnectionAsync(cancellationToken);
                await using var command = new NpgsqlCommand("SELECT pg_advisory_lock(@lockKey)", (NpgsqlConnection)db.Database.GetDbConnection());
                command.Parameters.AddWithValue("lockKey", postgresLockKey);
                await command.ExecuteNonQueryAsync(cancellationToken);
                postgresLockAcquired = true;
            }
            await db.Entry(payment).ReloadAsync(cancellationToken);
            try
            {
                await EnsurePaymentSessionAsync(payment, cancellationToken);
            }
            catch (DbUpdateConcurrencyException) when (db.Database.IsNpgsql())
            {
                db.ChangeTracker.Clear();
                payment = await db.Payments.SingleAsync(item => item.Id == payment.Id, cancellationToken);
            }
            return ToCheckout(payment);
        }
        finally
        {
            if (postgresLockAcquired)
            {
                await using var command = new NpgsqlCommand("SELECT pg_advisory_unlock(@lockKey)", (NpgsqlConnection)db.Database.GetDbConnection());
                command.Parameters.AddWithValue("lockKey", postgresLockKey);
                await command.ExecuteNonQueryAsync(CancellationToken.None);
                await db.Database.CloseConnectionAsync();
            }
            sessionLock?.Release();
        }
    }

    private async Task EnsurePaymentSessionAsync(Payment payment, CancellationToken cancellationToken)
    {
        if (payment.ProviderSessionStatus is null)
        {
            payment.ProviderSessionStatus = string.IsNullOrWhiteSpace(payment.ProviderPaymentId)
                ? ProviderSessionStatus.RequiresReconciliation
                : ProviderSessionStatus.Ready;
            payment.ProviderSessionResolvedAtUtc = string.IsNullOrWhiteSpace(payment.ProviderPaymentId) ? null : payment.UpdatedAtUtc;
            if (payment.ProviderSessionStatus == ProviderSessionStatus.RequiresReconciliation)
                await OpenReconciliationCaseAsync(payment, ProviderReconciliationCaseType.ProviderSessionCreationResultUnknown, null, "LEGACY_SESSION_STATE_UNKNOWN", null, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        if (payment.ProviderSessionStatus is ProviderSessionStatus.Ready or ProviderSessionStatus.Failed) return;
        if (payment.ProviderSessionStatus == ProviderSessionStatus.NotStarted)
        {
            await CreateNewPaymentSessionAsync(payment, cancellationToken);
            return;
        }
        await RecoverPaymentSessionAsync(payment, cancellationToken);
    }

    private async Task CreateNewPaymentSessionAsync(Payment payment, CancellationToken cancellationToken)
    {
        PaymentCheckoutRequest request;
        try
        {
            request = CreatePaymentCheckoutRequest(payment);
        }
        catch (PaymentSessionCreationRejectedException exception)
        {
            await FailPaymentSessionAsync(payment, exception.FailureCode, cancellationToken);
            return;
        }

        payment.ProviderSessionStatus = ProviderSessionStatus.Creating;
        payment.ProviderSessionAttemptedAtUtc = DateTimeOffset.UtcNow;
        payment.ProviderSessionResolvedAtUtc = null;
        payment.ProviderSessionFailureCode = null;
        payment.ProviderSessionAttemptCount += 1;
        await db.SaveChangesAsync(cancellationToken);

        PaymentSession session;
        try
        {
            session = await paymentProvider.CreateCheckoutSessionAsync(request, cancellationToken);
        }
        catch (PaymentSessionCreationRejectedException exception)
        {
            await FailPaymentSessionAsync(payment, exception.FailureCode, CancellationToken.None);
            return;
        }
        catch (Exception exception) when (exception is PaymentSessionResultUnknownException or HttpRequestException or OperationCanceledException or InvalidOperationException or JsonException)
        {
            await MarkPaymentSessionUnknownAsync(payment, "PROVIDER_SESSION_RESULT_UNKNOWN", CancellationToken.None);
            return;
        }

        if (!string.IsNullOrWhiteSpace(payment.ProviderPaymentId)
            && !string.Equals(payment.ProviderPaymentId, session.ProviderPaymentId, StringComparison.Ordinal))
        {
            await RequireSessionReconciliationAsync(payment, ProviderReconciliationCaseType.ProviderReferenceMismatch, session.ProviderPaymentId, "PROVIDER_REFERENCE_CONFLICT", cancellationToken);
            return;
        }

        payment.Provider = session.Provider;
        payment.ProviderPaymentId = session.ProviderPaymentId;
        payment.ProviderCheckoutUrl = session.RedirectUrl;
        payment.ProviderSessionStatus = ProviderSessionStatus.Ready;
        payment.ProviderSessionResolvedAtUtc = DateTimeOffset.UtcNow;
        await ResolveRecoveredSessionCasesAsync(payment, "SESSION_CREATED_OR_RECOVERED", cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    private PaymentCheckoutRequest CreatePaymentCheckoutRequest(Payment payment)
    {
        var configuredPublicUrl = configuration?["APP_PUBLIC_URL"] ?? configuration?["NEXT_PUBLIC_APP_URL"];
        var requiresPayTabsUrls = string.Equals(paymentProvider.ProviderName, "PayTabs", StringComparison.Ordinal);
        if (!Uri.TryCreate(configuredPublicUrl, UriKind.Absolute, out var publicUri)
            || (requiresPayTabsUrls && !string.Equals(publicUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
        {
            if (requiresPayTabsUrls) throw new PaymentSessionCreationRejectedException("PAYTABS_PUBLIC_URL_INVALID", "APP_PUBLIC_URL must be an absolute HTTPS URL when PayTabs is enabled.");
            publicUri = new Uri("http://localhost:3000", UriKind.Absolute);
        }

        var baseUrl = publicUri.AbsoluteUri.TrimEnd('/');
        return new PaymentCheckoutRequest(
            payment.Id,
            payment.Currency,
            payment.Total,
            $"BETCCO purchase {payment.Id:N}",
            $"{baseUrl}/api/v1/payments/paytabs/callback",
            $"{baseUrl}/en/checkout/paytabs-result?paymentId={payment.Id:N}",
            payment.Method.ToString());
    }

    private async Task RecoverPaymentSessionAsync(Payment payment, CancellationToken cancellationToken)
    {
        IReadOnlyCollection<PaymentCheckoutRecovery> sessions;
        try
        {
            sessions = await paymentProvider.QueryCheckoutSessionsAsync(payment.Id, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or InvalidOperationException or JsonException)
        {
            await MarkPaymentSessionUnknownAsync(payment, "PROVIDER_SESSION_RECOVERY_UNAVAILABLE", CancellationToken.None);
            return;
        }

        var cartId = PayTabsPaymentProvider.CartId(payment.Id);
        var expectedProfileId = configuration?["PayTabs:ProfileId"];
        var matching = sessions.Where(session =>
            string.Equals(session.Provider, payment.Provider, StringComparison.Ordinal)
            && (!string.Equals(payment.Provider, "PayTabs", StringComparison.Ordinal)
                || string.Equals(session.ProfileId, expectedProfileId, StringComparison.Ordinal))
            && string.Equals(session.CartId, cartId, StringComparison.Ordinal)
            && string.Equals(session.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase)
            && session.Amount == payment.Total).ToArray();

        if (sessions.Count > 1 || matching.Length > 1)
        {
            await RequireSessionReconciliationAsync(payment, ProviderReconciliationCaseType.DuplicateProviderSessions, null, "MULTIPLE_PROVIDER_SESSIONS", cancellationToken);
            return;
        }
        if (sessions.Count == 1 && matching.Length == 0)
        {
            await RequireSessionReconciliationAsync(payment, ProviderReconciliationCaseType.ProviderReferenceMismatch, sessions.Single().ProviderPaymentId, "PROVIDER_SESSION_MISMATCH", cancellationToken);
            return;
        }
        if (matching.Length == 0)
        {
            var safeRetryAfter = paymentProvider.CheckoutSessionUncertaintyWindow;
            if (safeRetryAfter is not null
                && payment.ProviderSessionAttemptedAtUtc is not null
                && DateTimeOffset.UtcNow - payment.ProviderSessionAttemptedAtUtc.Value >= safeRetryAfter.Value)
            {
                payment.ProviderSessionStatus = ProviderSessionStatus.NotStarted;
                await db.SaveChangesAsync(cancellationToken);
                await CreateNewPaymentSessionAsync(payment, cancellationToken);
                return;
            }

            await RequireSessionReconciliationAsync(payment, ProviderReconciliationCaseType.ProviderSessionCreationResultUnknown, null, "PROVIDER_SESSION_NOT_DISCOVERABLE", cancellationToken);
            return;
        }

        var recovered = matching[0];
        if (!string.IsNullOrWhiteSpace(payment.ProviderPaymentId)
            && !string.Equals(payment.ProviderPaymentId, recovered.ProviderPaymentId, StringComparison.Ordinal))
        {
            await RequireSessionReconciliationAsync(payment, ProviderReconciliationCaseType.ProviderReferenceMismatch, recovered.ProviderPaymentId, "PROVIDER_REFERENCE_CONFLICT", cancellationToken);
            return;
        }

        payment.ProviderPaymentId = recovered.ProviderPaymentId;
        if (!string.IsNullOrWhiteSpace(recovered.RedirectUrl)) payment.ProviderCheckoutUrl = recovered.RedirectUrl;
        if (recovered.IsDefiniteFailure)
        {
            await ResolveRecoveredSessionCasesAsync(payment, "SESSION_DEFINITE_FAILURE_RECOVERED", cancellationToken);
            await FailPaymentSessionAsync(payment, recovered.ProviderResultCode ?? "PROVIDER_SESSION_REJECTED", cancellationToken, recovered.ProviderPaymentId);
            return;
        }
        if (recovered.IsSuccessful)
        {
            payment.ProviderSessionStatus = ProviderSessionStatus.Ready;
            payment.ProviderSessionResolvedAtUtc = DateTimeOffset.UtcNow;
            await ResolveRecoveredSessionCasesAsync(payment, "SESSION_SUCCESS_RECOVERED", cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            await ConfirmTrustedPaymentAsync(payment.Id, recovered.ProviderPaymentId, null, payment.Provider, "PaymentConfirmedByRecoveredProviderSession", PaymentTransitionSource.PayTabsVerifiedTransaction, cancellationToken);
            await db.Entry(payment).ReloadAsync(cancellationToken);
            return;
        }
        if (!string.IsNullOrWhiteSpace(payment.ProviderCheckoutUrl))
        {
            payment.ProviderSessionStatus = ProviderSessionStatus.Ready;
            payment.ProviderSessionResolvedAtUtc = DateTimeOffset.UtcNow;
            await ResolveRecoveredSessionCasesAsync(payment, "SESSION_REDIRECT_RECOVERED", cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        await RequireSessionReconciliationAsync(payment, ProviderReconciliationCaseType.ProviderSessionCreationResultUnknown, recovered.ProviderPaymentId, recovered.ProviderResultCode ?? "PROVIDER_SESSION_STATUS_UNKNOWN", cancellationToken);
    }

    private async Task MarkPaymentSessionUnknownAsync(Payment payment, string failureCode, CancellationToken cancellationToken)
    {
        payment.ProviderSessionStatus = ProviderSessionStatus.Unknown;
        payment.ProviderSessionFailureCode = failureCode;
        db.AuditLogs.Add(Audit(payment.UserId, "CheckoutSessionResultUnknown", nameof(Payment), payment.Id.ToString()));
        await OpenReconciliationCaseAsync(payment, ProviderReconciliationCaseType.ProviderSessionCreationResultUnknown, payment.ProviderPaymentId, failureCode, null, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task RequireSessionReconciliationAsync(Payment payment, ProviderReconciliationCaseType type, string? providerReference, string failureCode, CancellationToken cancellationToken)
    {
        payment.ProviderSessionStatus = ProviderSessionStatus.RequiresReconciliation;
        payment.ProviderSessionFailureCode = failureCode;
        db.AuditLogs.Add(Audit(payment.UserId, "CheckoutSessionRequiresReconciliation", nameof(Payment), payment.Id.ToString()));
        await OpenReconciliationCaseAsync(payment, type, providerReference, failureCode, null, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task FailPaymentSessionAsync(Payment payment, string failureCode, CancellationToken cancellationToken, string? providerReference = null)
    {
        payment.ProviderSessionStatus = ProviderSessionStatus.Failed;
        payment.ProviderSessionFailureCode = failureCode;
        payment.ProviderSessionResolvedAtUtc = DateTimeOffset.UtcNow;
        if (payment.Status == PaymentStatus.Processing)
        {
            await ReleaseCouponReservationAsync(payment, cancellationToken);
            TransitionPaymentToFailed(payment, providerReference ?? $"session-creation:{payment.Id:N}", failureCode, PaymentTransitionSource.ProviderSessionCreationRejected);
        }
        db.AuditLogs.Add(Audit(payment.UserId, "CheckoutSessionCreationRejected", nameof(Payment), payment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task ResolveRecoveredSessionCasesAsync(Payment payment, string resolutionCode, CancellationToken cancellationToken)
    {
        var cases = await db.ProviderReconciliationCases.Where(item =>
            item.PaymentId == payment.Id
            && item.Status != ProviderReconciliationCaseStatus.Resolved
            && item.CaseType == ProviderReconciliationCaseType.ProviderSessionCreationResultUnknown).ToListAsync(cancellationToken);
        foreach (var item in cases)
        {
            item.Status = ProviderReconciliationCaseStatus.Resolved;
            item.ResolutionCode = resolutionCode;
            item.ResolvedByUserId = $"system:{(payment.Provider ?? paymentProvider.ProviderName).ToLowerInvariant()}";
            item.ResolvedAtUtc = DateTimeOffset.UtcNow;
            db.AuditLogs.Add(Audit(item.ResolvedByUserId, "ProviderSessionRecoveryCaseResolved", nameof(ProviderReconciliationCase), item.Id.ToString()));
        }
    }

    private async Task RecordPayTabsAuditAsync(string action, string entityId, CancellationToken cancellationToken)
    {
        db.AuditLogs.Add(Audit("system:paytabs", action, nameof(Payment), entityId[..Math.Min(entityId.Length, 200)]));
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task OpenReconciliationCaseAsync(Payment payment, ProviderReconciliationCaseType type, string? providerReference, string? providerStatusCode, decimal? observedAmount, CancellationToken cancellationToken)
    {
        var provider = payment.Provider ?? paymentProvider.ProviderName;
        var identity = $"{provider}|{payment.Id:N}|{providerReference ?? payment.ProviderPaymentId ?? "none"}|{type}";
        if (await db.ProviderReconciliationCases.AnyAsync(item => item.BusinessIdentity == identity, cancellationToken)) return;
        db.ProviderReconciliationCases.Add(new ProviderReconciliationCase { Provider = provider, CaseType = type, PaymentId = payment.Id, BusinessIdentity = identity, LocalStatus = payment.Status.ToString(), ProviderTransactionReference = providerReference ?? payment.ProviderPaymentId, ProviderStatusCode = providerStatusCode, LocalAmount = payment.Total, ObservedProviderAmount = observedAmount, Currency = payment.Currency, CorrelationReference = payment.ProviderPaymentId, CreatedByUserId = $"system:{provider.ToLowerInvariant()}" });
        db.AuditLogs.Add(Audit("system:paytabs", "ProviderReconciliationCaseOpened", nameof(ProviderReconciliationCase), payment.Id.ToString()));
    }

    private static bool TryParsePayTabsCartId(string cartId, out Guid paymentId)
    {
        const string prefix = "BETCCO-";
        paymentId = Guid.Empty;
        return cartId.StartsWith(prefix, StringComparison.Ordinal)
            && Guid.TryParseExact(cartId[prefix.Length..], "N", out paymentId);
    }

    private async Task<CartView> ToViewAsync(Cart cart, string locale, CancellationToken cancellationToken)
    {
        var courseIds = cart.Items.Where(x => x.ItemType == CartItemType.Course).Select(x => x.ReferenceId).ToArray();
        var packageIds = cart.Items.Where(x => x.ItemType == CartItemType.Package).Select(x => x.ReferenceId).ToArray();
        var courses = await db.Courses.AsNoTracking().Where(x => courseIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);
        var packages = await db.CoursePackages.AsNoTracking().Where(x => packageIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);
        var lines = cart.Items.Where(x => (x.ItemType == CartItemType.Course && courses.ContainsKey(x.ReferenceId)) || (x.ItemType == CartItemType.Package && packages.ContainsKey(x.ReferenceId))).Select(item =>
        {
            if (item.ItemType == CartItemType.Package)
            {
                var package = packages[item.ReferenceId];
                var title = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? package.ArabicTitle : package.EnglishTitle;
                return new CartLineView(item.Id, item.ReferenceId, item.ItemType.ToString(), title, package.Price);
            }
            var course = courses[item.ReferenceId];
            var courseTitle = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? course.ArabicTitle : course.EnglishTitle;
            return new CartLineView(item.Id, item.ReferenceId, item.ItemType.ToString(), courseTitle, course.IsFree ? 0 : course.Price);
        }).ToArray();
        var subtotal = lines.Sum(x => x.Price);
        return new CartView(cart.Id, lines, subtotal, 0, subtotal, cart.Currency);
    }

    private async Task<DiscountQuote> ReserveDiscountAsync(string? couponCode, decimal subtotal, string userId, IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(couponCode)) return new(null, null, 0, null);
        var normalizedCode = couponCode.Trim().ToUpperInvariant();
        var gate = !db.Database.IsRelational()
            ? CouponRedemptionLocks.GetOrAdd(normalizedCode, _ => new SemaphoreSlim(1, 1))
            : null;
        if (gate is not null) await gate.WaitAsync(cancellationToken);
        try
        {
            var now = DateTimeOffset.UtcNow;
            var coupon = await CouponForUpdateAsync(normalizedCode, cancellationToken);
            if (coupon is null || !coupon.IsActive
                || (coupon.StartsAtUtc is not null && coupon.StartsAtUtc > now) || (coupon.EndsAtUtc is not null && coupon.EndsAtUtc < now)
                || (coupon.MaxRedemptions is not null && coupon.RedemptionCount >= coupon.MaxRedemptions)
                || (coupon.MinimumPurchaseAmount is not null && subtotal < coupon.MinimumPurchaseAmount)
                || (await db.CouponCourses.AnyAsync(item => item.CouponId == coupon.Id, cancellationToken) && !await db.CouponCourses.AnyAsync(item => item.CouponId == coupon.Id && courseIds.Contains(item.CourseId), cancellationToken))
                || (coupon.MaxRedemptionsPerUser is not null
                    && await db.CouponRedemptions.CountAsync(item => item.CouponId == coupon.Id && item.UserId == userId, cancellationToken)
                        + await db.Payments.CountAsync(item => item.CouponId == coupon.Id && item.UserId == userId && item.Status == PaymentStatus.Processing, cancellationToken)
                        >= coupon.MaxRedemptionsPerUser))
                throw new InvalidOperationException("The coupon is invalid or unavailable.");
            var amount = Math.Min(subtotal, coupon.FixedAmountOff ?? Math.Round(subtotal * coupon.PercentageOff / 100m, 3));
            coupon.RedemptionCount += 1;
            return new(coupon.Id, coupon.Code, Math.Max(0, amount), gate);
        }
        catch
        {
            gate?.Release();
            throw;
        }
    }

    private async Task RecordCourseRevenueSplitAsync(Payment payment, IReadOnlyCollection<Course> courses, IReadOnlyCollection<PurchasedCourseLine> purchaseLines, CancellationToken cancellationToken)
    {
        var grossByCourse = purchaseLines.GroupBy(x => x.CourseId).ToDictionary(x => x.Key, x => x.Sum(line => line.GrossAmount));
        var paidCourses = courses.Where(course => grossByCourse.TryGetValue(course.Id, out var gross) && gross > 0).OrderBy(course => course.Id).ToArray();
        var revenueAfterDiscount = Math.Max(0, payment.Total - payment.Tax);
        if (paidCourses.Length == 0 || revenueAfterDiscount <= 0) return;

        var platformCommissionPercent = await PlatformCommissionPercentAsync(cancellationToken);
        var platformCommissionRate = platformCommissionPercent / 100m;
        var subtotal = paidCourses.Sum(course => grossByCourse[course.Id]);
        var remainingNet = revenueAfterDiscount;
        var allocations = new List<CourseSaleAllocation>();
        for (var index = 0; index < paidCourses.Length; index++)
        {
            var course = paidCourses[index];
            var netAmount = index == paidCourses.Length - 1
                ? remainingNet
                : Math.Round(revenueAfterDiscount * grossByCourse[course.Id] / subtotal, 3, MidpointRounding.AwayFromZero);
            remainingNet -= netAmount;
            var platformCommission = Math.Round(netAmount * platformCommissionRate, 3, MidpointRounding.AwayFromZero);
            var teacherEarning = netAmount - platformCommission;
            var allocation = new CourseSaleAllocation
            {
                PaymentId = payment.Id,
                CourseId = course.Id,
                TeacherUserId = course.TeacherUserId,
                GrossAmount = grossByCourse[course.Id],
                DiscountAllocated = grossByCourse[course.Id] - netAmount,
                NetAmount = netAmount,
                PlatformCommission = platformCommission,
                TeacherEarning = teacherEarning,
                Currency = payment.Currency
            };
            allocations.Add(allocation);
            db.CourseSaleAllocations.Add(allocation);
            db.WalletTransactions.Add(new WalletTransaction
            {
                UserId = "platform",
                Type = "PlatformCommission",
                Amount = platformCommission,
                Currency = payment.Currency,
                PaymentId = payment.Id,
                Description = $"{platformCommissionPercent:0.###}% commission for course sale {course.Id}"
            });
            if (string.IsNullOrWhiteSpace(course.TeacherUserId))
            {
                db.WalletTransactions.Add(new WalletTransaction
                {
                    UserId = "platform",
                    Type = "UnassignedCourseRevenue",
                    Amount = teacherEarning,
                    Currency = payment.Currency,
                    PaymentId = payment.Id,
                    Description = $"Teacher share held for unassigned course {course.Id}"
                });
            }
            else
            {
                db.WalletTransactions.Add(new WalletTransaction
                {
                    UserId = course.TeacherUserId,
                    Type = "TeacherCourseEarning",
                    Amount = teacherEarning,
                    Currency = payment.Currency,
                    PaymentId = payment.Id,
                    Description = $"{100m - platformCommissionPercent:0.###}% earning for course sale {course.Id}"
                });
            }
        }

        await BookPaidCourseSaleLedgerAsync(payment, allocations, cancellationToken);
    }

    private async Task BookPaidCourseSaleLedgerAsync(Payment payment, IReadOnlyCollection<CourseSaleAllocation> allocations, CancellationToken cancellationToken)
    {
        if (allocations.Count == 0) return;

        var clearingAccount = await LedgerAccountAsync(LedgerAccountCode.CourseSaleClearing, payment.Currency, cancellationToken);
        var commissionAccount = await LedgerAccountAsync(LedgerAccountCode.PlatformCommission, payment.Currency, cancellationToken);
        var teacherPayableAccount = await LedgerAccountAsync(LedgerAccountCode.TeacherEarningsPayable, payment.Currency, cancellationToken);
        var ledgerTransaction = new LedgerTransaction
        {
            EventType = LedgerEventType.PaidCourseSale,
            Currency = payment.Currency,
            PaymentId = payment.Id,
            ProviderReference = payment.ProviderPaymentId,
            IdempotencyKey = payment.IdempotencyKey,
            BusinessEventReference = $"payment:{payment.Id:N}:paid-course-sale",
            CorrelationId = payment.Id.ToString("N")
        };

        foreach (var allocation in allocations)
        {
            ledgerTransaction.Entries.Add(new LedgerEntry
            {
                LedgerAccount = clearingAccount,
                CourseSaleAllocation = allocation,
                Side = LedgerEntrySide.Debit,
                Amount = allocation.NetAmount,
                Currency = allocation.Currency
            });
            ledgerTransaction.Entries.Add(new LedgerEntry
            {
                LedgerAccount = commissionAccount,
                CourseSaleAllocation = allocation,
                Side = LedgerEntrySide.Credit,
                Amount = allocation.PlatformCommission,
                Currency = allocation.Currency
            });
            ledgerTransaction.Entries.Add(new LedgerEntry
            {
                LedgerAccount = teacherPayableAccount,
                CourseSaleAllocation = allocation,
                Side = LedgerEntrySide.Credit,
                Amount = allocation.TeacherEarning,
                Currency = allocation.Currency
            });
        }

        db.LedgerTransactions.Add(ledgerTransaction);
    }

    private async Task<LedgerAccount> LedgerAccountAsync(LedgerAccountCode code, string currency, CancellationToken cancellationToken)
    {
        var account = await db.LedgerAccounts.SingleOrDefaultAsync(item => item.Code == code && item.Currency == currency, cancellationToken);
        if (account is not null) return account;

        account = new LedgerAccount { Code = code, Currency = currency };
        db.LedgerAccounts.Add(account);
        return account;
    }

    private async Task<decimal> PlatformCommissionPercentAsync(CancellationToken cancellationToken)
    {
        const decimal fallback = 30m;
        var value = await db.SiteSettings.AsNoTracking()
            .Where(setting => setting.Key == "PlatformCommissionPercent")
            .Select(setting => setting.EnglishValue)
            .SingleOrDefaultAsync(cancellationToken);
        return decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var percentage)
            && percentage is >= 0 and <= 100
            ? percentage
            : fallback;
    }

    private async Task<decimal> CalculateTaxAsync(decimal taxableAmount, CancellationToken cancellationToken)
    {
        if (taxableAmount <= 0) return 0;
        const decimal fallback = 0m;
        var value = await db.SiteSettings.AsNoTracking()
            .Where(setting => setting.Key == "SalesTaxPercent")
            .Select(setting => setting.EnglishValue)
            .SingleOrDefaultAsync(cancellationToken);
        var rate = decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            && parsed is >= 0 and <= 100
            ? parsed
            : fallback;
        return Math.Round(taxableAmount * rate / 100m, 3, MidpointRounding.AwayFromZero);
    }

    private async Task GrantTimedCourseAccessAsync(string userId, IReadOnlyCollection<Guid> courseIds, Guid paymentId, DateTimeOffset endsAtUtc, CancellationToken cancellationToken)
    {
        var existing = await db.Enrollments.Where(item => item.StudentUserId == userId && courseIds.Contains(item.CourseId)).ToListAsync(cancellationToken);
        foreach (var courseId in courseIds)
        {
            var enrollment = existing.SingleOrDefault(item => item.CourseId == courseId);
            if (enrollment is null)
            {
                db.Enrollments.Add(new Enrollment { StudentUserId = userId, CourseId = courseId, PaymentId = paymentId, AccessEndsAtUtc = endsAtUtc });
            }
            else if (enrollment.AccessEndsAtUtc is not null && enrollment.AccessEndsAtUtc < endsAtUtc)
            {
                enrollment.AccessEndsAtUtc = endsAtUtc;
                enrollment.PaymentId = paymentId;
            }
        }
    }

    private async Task GrantPermanentCourseAccessAsync(string userId, IReadOnlyCollection<Guid> courseIds, Guid paymentId, CancellationToken cancellationToken)
    {
        var existing = await db.Enrollments.Where(item => item.StudentUserId == userId && courseIds.Contains(item.CourseId)).ToListAsync(cancellationToken);
        foreach (var courseId in courseIds)
        {
            var enrollment = existing.SingleOrDefault(item => item.CourseId == courseId);
            if (enrollment is null) db.Enrollments.Add(new Enrollment { StudentUserId = userId, CourseId = courseId, PaymentId = paymentId });
            else
            {
                enrollment.AccessEndsAtUtc = null;
                enrollment.PaymentId = paymentId;
            }
        }
    }

    private async Task GrantIncludedEvaluationEntitlementsAsync(
        string userId,
        IReadOnlyCollection<Guid> courseIds,
        Guid paymentId,
        CancellationToken cancellationToken)
    {
        if (courseIds.Count == 0) return;

        var trackedEnrollments = db.ChangeTracker.Entries<Enrollment>()
            .Where(entry => entry.State != EntityState.Deleted
                && entry.Entity.StudentUserId == userId
                && courseIds.Contains(entry.Entity.CourseId))
            .Select(entry => entry.Entity)
            .ToList();
        var trackedCourseIds = trackedEnrollments.Select(item => item.CourseId).ToHashSet();
        var missingCourseIds = courseIds.Where(courseId => !trackedCourseIds.Contains(courseId)).ToArray();
        if (missingCourseIds.Length > 0)
        {
            trackedEnrollments.AddRange(await db.Enrollments
                .Where(item => item.StudentUserId == userId && missingCourseIds.Contains(item.CourseId))
                .ToListAsync(cancellationToken));
        }

        var enrollments = trackedEnrollments
            .GroupBy(item => item.Id)
            .Select(group => group.First())
            .ToArray();
        if (enrollments.Length == 0) return;

        var unitMappings = await db.CourseModules.AsNoTracking()
            .Where(module => courseIds.Contains(module.CourseId) && module.UnitDefinitionId != null)
            .Select(module => new { module.CourseId, UnitDefinitionId = module.UnitDefinitionId!.Value })
            .ToArrayAsync(cancellationToken);
        if (unitMappings.Length == 0) return;

        var enrollmentIds = enrollments.Select(item => item.Id).ToArray();
        var existingPairs = await db.IncludedEvaluationEntitlements.AsNoTracking()
            .Where(item => item.GrantedByPaymentId == paymentId && enrollmentIds.Contains(item.EnrollmentId))
            .Select(item => new { item.EnrollmentId, item.UnitDefinitionId })
            .ToArrayAsync(cancellationToken);
        var existing = existingPairs.Select(item => (item.EnrollmentId, item.UnitDefinitionId)).ToHashSet();

        var enrollmentsByCourse = enrollments.ToDictionary(item => item.CourseId);
        foreach (var mapping in unitMappings)
        {
            if (!enrollmentsByCourse.TryGetValue(mapping.CourseId, out var enrollment)) continue;
            if (!existing.Add((enrollment.Id, mapping.UnitDefinitionId))) continue;

            var entitlement = new IncludedEvaluationEntitlement
            {
                StudentUserId = userId,
                EnrollmentId = enrollment.Id,
                UnitDefinitionId = mapping.UnitDefinitionId,
                GrantedByPaymentId = paymentId,
                GrantedAtUtc = DateTimeOffset.UtcNow
            };
            db.IncludedEvaluationEntitlements.Add(entitlement);
            db.AuditLogs.Add(Audit(
                userId,
                "IncludedEvaluationCreditGranted",
                nameof(IncludedEvaluationEntitlement),
                entitlement.Id.ToString()));
        }
    }

    private async Task SendEnrollmentEmailAsync(string userId, IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken)
    {
        if (emailNotifications is null || courseIds.Count == 0 || !Guid.TryParse(userId, out var parsedUserId)) return;
        var recipient = await db.Users.AsNoTracking()
            .Where(user => user.Id == parsedUserId && user.EmailConfirmed && user.Email != null)
            .Select(user => user.Email)
            .SingleOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(recipient)) return;

        var titles = await db.Courses.AsNoTracking()
            .Where(course => courseIds.Contains(course.Id))
            .OrderBy(course => course.EnglishTitle)
            .Select(course => course.EnglishTitle)
            .ToArrayAsync(cancellationToken);
        if (titles.Length == 0) return;
        await emailNotifications.SendAsync(
            new PlatformEmailNotification(
                "CourseEnrollment",
                recipient,
                "BETCCO course enrollment confirmed",
                "Your BETCCO course access is ready",
                $"You can now start learning in: {string.Join(", ", titles)}."),
            CancellationToken.None);
    }

    private async Task<bool> RecordCouponRedemptionAsync(Payment payment, CancellationToken cancellationToken)
    {
        if (payment.CouponId is null || await db.CouponRedemptions.AnyAsync(item => item.PaymentId == payment.Id, cancellationToken)) return true;
        var gate = !db.Database.IsRelational()
            ? CouponRedemptionLocks.GetOrAdd(payment.CouponId.Value.ToString("N"), _ => new SemaphoreSlim(1, 1))
            : null;
        if (gate is not null) await gate.WaitAsync(cancellationToken);
        try
        {
            if (await db.CouponRedemptions.AnyAsync(item => item.PaymentId == payment.Id, cancellationToken)) return true;
            var coupon = await CouponForRedemptionAsync(payment.CouponId.Value, cancellationToken);
            if (coupon is not null) await db.Entry(coupon).ReloadAsync(cancellationToken);
            if (coupon is null) return false;

            db.CouponRedemptions.Add(new CouponRedemption { CouponId = coupon.Id, UserId = payment.UserId, PaymentId = payment.Id });
            return true;
        }
        finally
        {
            gate?.Release();
        }
    }

    private async Task ReleaseCouponReservationAsync(Payment payment, CancellationToken cancellationToken)
    {
        if (payment.CouponId is null || await db.CouponRedemptions.AnyAsync(item => item.PaymentId == payment.Id, cancellationToken)) return;
        var gate = !db.Database.IsRelational()
            ? CouponRedemptionLocks.GetOrAdd(payment.CouponId.Value.ToString("N"), _ => new SemaphoreSlim(1, 1))
            : null;
        if (gate is not null) await gate.WaitAsync(cancellationToken);
        try
        {
            if (await db.CouponRedemptions.AnyAsync(item => item.PaymentId == payment.Id, cancellationToken)) return;
            var coupon = await CouponForRedemptionAsync(payment.CouponId.Value, cancellationToken);
            if (coupon is not null && coupon.RedemptionCount > 0) coupon.RedemptionCount -= 1;
        }
        finally
        {
            gate?.Release();
        }
    }

    private Task<Coupon?> CouponForUpdateAsync(string couponCode, CancellationToken cancellationToken) =>
        db.Database.IsNpgsql()
            ? db.Coupons.FromSqlInterpolated($"SELECT * FROM \"Coupons\" WHERE \"Code\" = {couponCode} FOR UPDATE").SingleOrDefaultAsync(cancellationToken)
            : db.Coupons.SingleOrDefaultAsync(item => item.Code == couponCode && item.IsActive, cancellationToken);

    private Task<Coupon?> CouponForRedemptionAsync(Guid couponId, CancellationToken cancellationToken) =>
        db.Database.IsNpgsql()
            ? db.Coupons.FromSqlInterpolated($"SELECT * FROM \"Coupons\" WHERE \"Id\" = {couponId} FOR UPDATE").SingleOrDefaultAsync(cancellationToken)
            : db.Coupons.SingleOrDefaultAsync(item => item.Id == couponId, cancellationToken);

    private static bool IsPostgresConcurrencyConflict(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres
                && postgres.SqlState is PostgresErrorCodes.SerializationFailure
                    or PostgresErrorCodes.DeadlockDetected
                    or PostgresErrorCodes.UniqueViolation)
                return true;
        }
        return false;
    }

    private static DateTimeOffset AddInterval(DateTimeOffset start, BillingInterval interval) => interval switch
    {
        BillingInterval.Monthly => start.AddMonths(1),
        BillingInterval.Quarterly => start.AddMonths(3),
        BillingInterval.Yearly => start.AddYears(1),
        _ => start.AddMonths(1)
    };

    private static PaymentMethod ResolvePaymentMethod(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return PaymentMethod.Card;
        if (!Enum.TryParse<PaymentMethod>(value, true, out var method) || !Enum.IsDefined(method)) throw new InvalidOperationException("Unsupported payment method.");
        return method;
    }

    private static CheckoutResult ToCheckout(Payment payment) => new(payment.Id, payment.Status.ToString(), payment.Provider ?? "", payment.ProviderPaymentId ?? "", payment.ProviderCheckoutUrl, payment.ProviderSessionStatus?.ToString() ?? "LegacyUnknown", payment.Subtotal, payment.Discount, payment.Tax, payment.Total, payment.Currency, payment.Method.ToString());
    private static AuditLog Audit(string actor, string action, string entityType, string entityId) => new() { ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId, Outcome = "Success" };
    private static IReadOnlyCollection<PurchasedCourseLine> AllocatePackagePrice(decimal packagePrice, IReadOnlyCollection<Course> courses)
    {
        var paidCourses = courses.Where(x => !x.IsFree).OrderBy(x => x.Id).ToArray();
        if (paidCourses.Length == 0) return courses.Select(x => new PurchasedCourseLine(x.Id, 0)).ToArray();
        var referenceTotal = paidCourses.Sum(x => x.Price);
        var remaining = packagePrice;
        var lines = new List<PurchasedCourseLine>();
        for (var index = 0; index < paidCourses.Length; index++)
        {
            var course = paidCourses[index];
            var gross = index == paidCourses.Length - 1
                ? remaining
                : referenceTotal == 0
                    ? Math.Round(packagePrice / paidCourses.Length, 3, MidpointRounding.AwayFromZero)
                    : Math.Round(packagePrice * course.Price / referenceTotal, 3, MidpointRounding.AwayFromZero);
            remaining -= gross;
            lines.Add(new PurchasedCourseLine(course.Id, gross));
        }
        lines.AddRange(courses.Where(x => x.IsFree).Select(x => new PurchasedCourseLine(x.Id, 0)));
        return lines;
    }
    private static CoursePurchaseSnapshot ReadPurchaseSnapshot(string json)
    {
        var snapshot = JsonSerializer.Deserialize<CoursePurchaseSnapshot>(json);
        if (snapshot?.Lines.Count > 0) return snapshot;
        var legacyCourseIds = JsonSerializer.Deserialize<Guid[]>(json) ?? [];
        return new CoursePurchaseSnapshot(legacyCourseIds.Select(id => new PurchasedCourseLine(id, 0)).ToArray());
    }
    private static MembershipPurchaseSnapshot ReadMembershipPurchaseSnapshot(string json) => JsonSerializer.Deserialize<MembershipPurchaseSnapshot>(json) ?? throw new InvalidOperationException("The membership payment snapshot is invalid.");
    private sealed record PurchasedCourseLine(Guid CourseId, decimal GrossAmount);
    private sealed record CoursePurchaseSnapshot(IReadOnlyCollection<PurchasedCourseLine> Lines);
    private sealed record MembershipPurchaseSnapshot(BillingInterval Interval, IReadOnlyCollection<PurchasedCourseLine> Lines);
    private sealed record DiscountQuote(Guid? CouponId, string? Code, decimal Amount, SemaphoreSlim? Gate)
    {
        public void ReleaseGate() => Gate?.Release();
    }
}
