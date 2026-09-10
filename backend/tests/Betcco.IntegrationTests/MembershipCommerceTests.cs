using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class MembershipCommerceTests
{
    [Fact]
    public async Task Verified_membership_payment_grants_timed_course_access_and_redeems_coupon_once()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course { Slug = "membership-course", ArabicTitle = "دورة", EnglishTitle = "Course", ArabicDescription = "وصف", EnglishDescription = "Description", LearningTrack = track, TeacherUserId = "teacher", Status = CourseStatus.Published, Price = 30m };
        var plan = new MembershipPlan { Slug = "plus-monthly", ArabicTitle = "بلس", EnglishTitle = "Plus", ArabicDescription = "وصف", EnglishDescription = "Description", Price = 20m, Interval = BillingInterval.Monthly, IsPublished = true };
        plan.Courses.Add(new MembershipPlanCourse { CourseId = course.Id });
        var coupon = new Coupon { Code = "WELCOME", PercentageOff = 25m, MaxRedemptions = 1, MaxRedemptionsPerUser = 1, IsActive = true };
        db.AddRange(track, course, plan, coupon);
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());
        var checkout = await commerce.CreateMembershipCheckoutAsync("student", plan.Id, coupon.Code, "Card", "membership-payment-key");

        Assert.NotNull(checkout);
        Assert.Equal(15m, checkout.Total);
        Assert.False(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "foreign-account-attempt", "other-student"));
        Assert.Empty(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.PaymentStatusTransitions.ToListAsync());
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "membership-succeeded"));

        var enrollment = Assert.Single(await db.Enrollments.ToListAsync());
        Assert.Equal(course.Id, enrollment.CourseId);
        Assert.NotNull(enrollment.AccessEndsAtUtc);
        Assert.True(enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow);
        Assert.Single(await db.UserMemberships.ToListAsync());
        Assert.Equal(1, (await db.Coupons.SingleAsync()).RedemptionCount);
        Assert.Single(await db.CouponRedemptions.ToListAsync());
        Assert.Equal(15m, await db.CourseSaleAllocations.SumAsync(item => item.NetAmount));
    }
}
