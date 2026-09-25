using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Betcco.IntegrationTests;

public sealed class IncludedEvaluationEntitlementTests
{
    [Fact]
    public async Task Paid_unit_grants_one_credit_and_checkout_consumes_it_without_evaluation_payment()
    {
        await using var db = CreateDb();
        var unit = await AddUnitCourseAsync(db, "paid", 25m, isFree: false);
        var commerce = new CommerceService(db, new FakePaymentProvider());

        var courseCheckout = await commerce.CreateCourseCheckoutAsync(
            "student", "paid-cart", null, "Card", "paid-course");
        Assert.NotNull(courseCheckout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(
            courseCheckout.PaymentId, "paid-course-confirmed"));

        var entitlement = Assert.Single(await db.IncludedEvaluationEntitlements.ToListAsync());
        Assert.Equal(unit.Id, entitlement.UnitDefinitionId);
        Assert.Null(entitlement.ConsumedByEvaluationRequestId);
        Assert.True((await commerce.GetIncludedEvaluationCreditStatusAsync(
            "student", (await AddReadyEvaluationAsync(db, "student", unit.Id)).Scope.Id)).Available);

        var ready = await db.EvaluationRequests
            .OrderByDescending(item => item.CreatedAtUtc)
            .FirstAsync();
        var checkout = await commerce.CreateEvaluationCheckoutAsync(
            "student", ready.Id, "Card", "included-review", expectIncludedCredit: true);

        Assert.NotNull(checkout);
        Assert.True(checkout.IncludedCreditApplied);
        Assert.Null(checkout.Payment);
        Assert.Equal(EvaluationStatus.PendingAssignment, ready.Status);
        Assert.Equal(0m, ready.Price);
        Assert.Null(ready.PaymentId);
        Assert.Empty(await db.Payments.Where(item => item.Purpose == "Evaluation").ToListAsync());

        await db.Entry(entitlement).ReloadAsync();
        Assert.Equal(ready.Id, entitlement.ConsumedByEvaluationRequestId);
        Assert.NotNull(entitlement.ConsumedAtUtc);
        Assert.False((await commerce.GetIncludedEvaluationCreditStatusAsync(
            "student", ready.AssessmentScopeId!.Value)).Available);
        var replay = await commerce.CreateEvaluationCheckoutAsync(
            "student", ready.Id, "Card", "included-review-replay", expectIncludedCredit: true);
        Assert.NotNull(replay);
        Assert.True(replay.IncludedCreditApplied);
        Assert.Single(await db.IncludedEvaluationEntitlements.ToListAsync());
        Assert.Empty(await db.Payments.Where(item => item.Purpose == "Evaluation").ToListAsync());
    }

    [Fact]
    public async Task Credit_cannot_cross_units_and_expected_credit_never_falls_back_to_payment()
    {
        await using var db = CreateDb();
        var purchasedUnit = await AddUnitCourseAsync(db, "owned", 30m, isFree: false);
        var otherUnit = NewUnit("OTHER");
        db.UnitDefinitions.Add(otherUnit);
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());
        var courseCheckout = await commerce.CreateCourseCheckoutAsync(
            "student", "owned-cart", null, "Card", "owned-course");
        Assert.NotNull(courseCheckout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(
            courseCheckout.PaymentId, "owned-course-confirmed"));

        var other = await AddReadyEvaluationAsync(db, "student", otherUnit.Id);
        Assert.False((await commerce.GetIncludedEvaluationCreditStatusAsync(
            "student", other.Scope.Id)).Available);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            commerce.CreateEvaluationCheckoutAsync(
                "student", other.Request.Id, "Card", "wrong-unit-credit",
                expectIncludedCredit: true));
        Assert.Contains("could not be applied", exception.Message);
        Assert.Equal(EvaluationStatus.Draft, other.Request.Status);
        Assert.Empty(await db.Payments.Where(item => item.Purpose == "Evaluation").ToListAsync());

        var paid = await commerce.CreateEvaluationCheckoutAsync(
            "student", other.Request.Id, "Card", "paid-review");
        Assert.NotNull(paid);
        Assert.False(paid.IncludedCreditApplied);
        Assert.NotNull(paid.Payment);
        Assert.Equal(EvaluationStatus.PendingPayment, other.Request.Status);
        Assert.Single(await db.Payments.Where(item => item.Purpose == "Evaluation").ToListAsync());

        var ownedCredit = Assert.Single(await db.IncludedEvaluationEntitlements.ToListAsync());
        Assert.Equal(purchasedUnit.Id, ownedCredit.UnitDefinitionId);
        Assert.Null(ownedCredit.ConsumedByEvaluationRequestId);
    }

    [Fact]
    public async Task Free_course_access_does_not_grant_an_included_evaluation_credit()
    {
        await using var db = CreateDb();
        _ = await AddUnitCourseAsync(db, "free", 0m, isFree: true);
        var commerce = new CommerceService(db, new FakePaymentProvider());

        var checkout = await commerce.CreateCourseCheckoutAsync(
            "student", "free-cart", null, "Card", "free-course");
        Assert.NotNull(checkout);
        Assert.True(await commerce.ConfirmFakeWebhookAsync(
            checkout.PaymentId, "free-course-confirmed"));

        Assert.Single(await db.Enrollments.ToListAsync());
        Assert.Empty(await db.IncludedEvaluationEntitlements.ToListAsync());
    }

    private static async Task<UnitDefinition> AddUnitCourseAsync(
        BetccoDbContext db,
        string key,
        decimal price,
        bool isFree)
    {
        var unit = NewUnit(key.ToUpperInvariant());
        var track = new LearningTrack
        {
            Slug = $"track-{key}",
            ArabicName = "BTEC",
            EnglishName = "BTEC",
            IsBtecFocused = true
        };
        var course = new Course
        {
            Slug = $"course-{key}",
            ArabicTitle = "دورة",
            EnglishTitle = $"Course {key}",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            TeacherUserId = "teacher",
            Status = CourseStatus.Published,
            Price = price,
            IsFree = isFree
        };
        course.Modules.Add(new CourseModule
        {
            CourseId = course.Id,
            UnitDefinitionId = unit.Id,
            ArabicTitle = "وحدة",
            EnglishTitle = "Unit",
            UnitCode = unit.Code,
            IsPublished = true
        });
        var cart = new Betcco.Domain.Commerce.Cart
        {
            OwnerKey = $"{key}-cart",
            UserId = "student"
        };
        cart.Items.Add(new Betcco.Domain.Commerce.CartItem
        {
            ItemType = CartItemType.Course,
            ReferenceId = course.Id
        });

        db.AddRange(unit, track, course, cart);
        await db.SaveChangesAsync();
        return unit;
    }

    private static UnitDefinition NewUnit(string code) => new()
    {
        QualificationVersionId = Guid.NewGuid(),
        Code = code,
        ArabicTitle = $"وحدة {code}",
        EnglishTitle = $"Unit {code}",
        IsActive = true,
        PublishedAtUtc = DateTimeOffset.UtcNow
    };

    private static async Task<(EvaluationRequest Request, AssessmentScope Scope)> AddReadyEvaluationAsync(
        BetccoDbContext db,
        string studentUserId,
        Guid unitDefinitionId)
    {
        var definition = new AssessmentDefinition
        {
            UnitDefinitionId = unitDefinitionId,
            Code = $"A-{Guid.NewGuid():N}",
            Version = 1,
            ArabicTitle = "مهمة",
            EnglishTitle = "Assignment",
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        var scope = new AssessmentScope
        {
            AssessmentDefinition = definition,
            AssessmentDefinitionId = definition.Id,
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid(),
            Version = 1,
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        var request = new EvaluationRequest
        {
            StudentUserId = studentUserId,
            GradeId = scope.GradeId,
            SpecializationId = scope.SpecializationId,
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = scope.RubricTemplateId,
            AssessmentScopeId = scope.Id,
            Status = EvaluationStatus.Draft,
            Price = AssessmentPricing.StandardEvaluationPrice,
            CriteriaSnapshotJson = "[\"A.P1\"]",
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.AddRange(definition, scope, request);
        db.SubmissionFiles.Add(new SubmissionFile
        {
            EvaluationRequestId = request.Id,
            OriginalFileName = "assignment.pdf",
            StorageKey = $"private/{request.Id:N}/assignment.pdf",
            ContentType = "application/pdf",
            LengthBytes = 100,
            ScanStatus = UploadScanStatus.Clean
        });
        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            EvaluationRequestId = request.Id,
            StudentUserId = studentUserId,
            AttemptNumber = 1,
            PolicyVersion = AssessmentAuthenticityPolicy.Version,
            StatementSnapshot = AssessmentAuthenticityPolicy.EnglishStatement
        });
        await db.SaveChangesAsync();
        return (request, scope);
    }

    private static BetccoDbContext CreateDb() => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(warnings =>
                warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);
}
