using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Betcco.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;

namespace Betcco.IntegrationTests;

public sealed class ResitCommerceTests
{
    [Fact]
    public async Task Resit_checkout_is_paid_and_never_consumes_available_unit_credit()
    {
        await using var db = InMemory();
        var (resit, credit, authorization) = await SeedAsync(db);
        var commerce = new CommerceService(db, new FakePaymentProvider());

        var checkout = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "resit-paid");

        Assert.NotNull(checkout);
        Assert.False(checkout.IncludedCreditApplied);
        Assert.NotNull(checkout.Payment);
        Assert.Equal(EvaluationStatus.PendingPayment, resit.Status);
        Assert.Equal("Evaluation", (await db.Payments.SingleAsync()).Purpose);
        Assert.Equal(resit.Id, (await db.Payments.SingleAsync()).ReferenceId);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
        Assert.Null(credit.ConsumedAtUtc);

        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "resit-paid-confirmed"));
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout.PaymentId, "resit-paid-confirmed"));
        Assert.Equal(PaymentStatus.Paid, (await db.Payments.SingleAsync()).Status);
        Assert.Equal(EvaluationStatus.PendingAssignment, resit.Status);
        Assert.Equal(checkout.PaymentId, resit.PaymentId);
        Assert.Equal(resit.Id, authorization.ResitEvaluationRequestId);
        Assert.Null(resit.RetakeOfEvaluationRequestId);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
        Assert.Single(await db.PaymentStatusTransitions.ToListAsync());
    }

    [Fact]
    public async Task Expect_credit_on_resit_rejects_without_a_payment_or_entitlement_change()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var commerce = new CommerceService(db, new FakePaymentProvider());

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => commerce.CreateEvaluationCheckoutAsync(
            "student", resit.Id, "Card", "expected-credit", expectIncludedCredit: true));

        Assert.Equal("RESIT_INCLUDED_CREDIT_NOT_ALLOWED", error.Message);
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
        Assert.Empty(await db.Payments.ToListAsync());
    }

    [Fact]
    public async Task Same_and_different_keys_reuse_one_resit_payment_and_cross_request_key_conflicts()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var other = ReadyRequest();
        db.EvaluationRequests.Add(other);
        await db.SaveChangesAsync();
        var provider = new CountingProvider();
        var commerce = new CommerceService(db, provider);

        var first = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "first-key");
        var same = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "first-key");
        var different = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "second-key");
        var conflict = await Assert.ThrowsAsync<InvalidOperationException>(() => commerce.CreateEvaluationCheckoutAsync(
            "student", other.Id, "Card", "first-key"));

        Assert.Equal("EVALUATION_IDEMPOTENCY_KEY_CONFLICT", conflict.Message);
        Assert.Equal(first!.PaymentId, same!.PaymentId);
        Assert.Equal(first.PaymentId, different!.PaymentId);
        Assert.Equal(1, provider.CheckoutRequests);
        Assert.Single(await db.Payments.ToListAsync());
        Assert.Null(credit.ConsumedByEvaluationRequestId);
    }

    [Fact]
    public async Task Concurrent_different_keys_use_one_payment_and_provider_session()
    {
        var name = Guid.NewGuid().ToString();
        var root = new InMemoryDatabaseRoot();
        Guid resitId;
        await using (var seed = InMemory(name, root))
            resitId = (await SeedAsync(seed)).Resit.Id;
        await using var firstDb = InMemory(name, root);
        await using var secondDb = InMemory(name, root);
        var provider = new CountingProvider();
        var first = new CommerceService(firstDb, provider);
        var second = new CommerceService(secondDb, provider);

        var checkouts = await Task.WhenAll(
            Task.Run(() => first.CreateEvaluationCheckoutAsync("student", resitId, "Card", "parallel-a")),
            Task.Run(() => second.CreateEvaluationCheckoutAsync("student", resitId, "Card", "parallel-b")));

        Assert.All(checkouts, Assert.NotNull);
        Assert.Equal(checkouts[0]!.PaymentId, checkouts[1]!.PaymentId);
        Assert.Equal(1, provider.CheckoutRequests);
        await using var verify = InMemory(name, root);
        Assert.Single(await verify.Payments.Where(x => x.Purpose == "Evaluation" && x.ReferenceId == resitId).ToListAsync());
        Assert.Equal(EvaluationStatus.PendingPayment, (await verify.EvaluationRequests.SingleAsync(x => x.Id == resitId)).Status);
        Assert.Null((await verify.IncludedEvaluationEntitlements.SingleAsync()).ConsumedByEvaluationRequestId);
    }

    [Fact]
    [Trait("Category", "PostgreSQLCommerce")]
    public async Task PostgreSQL_concurrent_resit_checkout_has_one_payment_session_and_preserves_credit()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("resit_commerce_race");
        var (resitId, studentId) = await SeedPostgresAsync(database);
        await using var firstDb = database.CreateContext();
        await using var secondDb = database.CreateContext();
        var provider = new CountingProvider();
        var first = new CommerceService(firstDb, provider);
        var second = new CommerceService(secondDb, provider);

        var checkouts = await Task.WhenAll(
            Task.Run(() => first.CreateEvaluationCheckoutAsync(studentId, resitId, "Card", "pg-resit-a")),
            Task.Run(() => second.CreateEvaluationCheckoutAsync(studentId, resitId, "Card", "pg-resit-b")));

        Assert.All(checkouts, Assert.NotNull);
        Assert.Equal(checkouts[0]!.PaymentId, checkouts[1]!.PaymentId);
        Assert.Equal(1, provider.CheckoutRequests);
        await using var verify = database.CreateContext();
        Assert.Single(await verify.Payments.Where(item => item.Purpose == "Evaluation" && item.ReferenceId == resitId && item.Status == PaymentStatus.Processing).ToListAsync());
        Assert.Equal(EvaluationStatus.PendingPayment, (await verify.EvaluationRequests.SingleAsync(item => item.Id == resitId)).Status);
        Assert.Null((await verify.IncludedEvaluationEntitlements.SingleAsync()).ConsumedByEvaluationRequestId);
    }

    [Fact]
    public async Task Safe_cancellation_restores_resit_draft_and_new_key_can_retry()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        var first = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "cancel-first");

        Assert.True((await commerce.CancelProcessingPaymentAsync("student", first!.PaymentId)).IsCancelled);
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
        Assert.Null(resit.PaymentId);
        var retry = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "cancel-retry");
        Assert.NotNull(retry);
        Assert.NotEqual(first.PaymentId, retry.PaymentId);
        Assert.Equal(EvaluationStatus.PendingPayment, resit.Status);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
    }

    [Fact]
    public async Task Definite_session_failure_restores_draft_and_allows_a_new_attempt()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var rejected = await new CommerceService(db, new RejectingProvider())
            .CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "rejected-session");

        Assert.NotNull(rejected);
        Assert.Equal(PaymentStatus.Failed, (await db.Payments.SingleAsync()).Status);
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
        var retry = await new CommerceService(db, new FakePaymentProvider())
            .CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "after-rejection");
        Assert.NotNull(retry);
        Assert.NotEqual(rejected.PaymentId, retry.PaymentId);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
    }

    [Fact]
    public async Task Trusted_definite_PayTabs_failure_restores_resit_draft_for_retry()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var provider = new DecliningPayTabsProvider();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PayTabs:ProfileId"] = "test-profile",
            ["APP_PUBLIC_URL"] = "https://betcco.example"
        }).Build();
        var commerce = new CommerceService(db, provider, configuration: configuration);
        var checkout = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "paytabs-failure");

        Assert.NotNull(checkout);
        Assert.False(await commerce.ConfirmPayTabsCallbackAsync(PayTabsPaymentProvider.CartId(checkout.PaymentId), provider.Reference));
        Assert.Equal(PaymentStatus.Failed, (await db.Payments.SingleAsync()).Status);
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
        Assert.Null(resit.PaymentId);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
        var retry = await new CommerceService(db, new FakePaymentProvider()).CreateEvaluationCheckoutAsync(
            "student", resit.Id, "Card", "paytabs-failure-retry");
        Assert.NotNull(retry);
        Assert.NotEqual(checkout.PaymentId, retry.PaymentId);
    }

    [Fact]
    public async Task Unknown_provider_session_keeps_resit_pending_and_reuses_the_active_payment()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var provider = new UnknownProvider();
        var commerce = new CommerceService(db, provider);
        var first = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "unknown-first");
        var second = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "unknown-second");

        Assert.NotNull(first);
        Assert.Equal(first.PaymentId, second!.PaymentId);
        Assert.Equal(EvaluationStatus.PendingPayment, resit.Status);
        Assert.Equal(PaymentStatus.Processing, (await db.Payments.SingleAsync()).Status);
        Assert.Equal(1, provider.CheckoutRequests);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
        var cancellation = await commerce.CancelProcessingPaymentAsync("student", first.PaymentId);
        Assert.False(cancellation.IsCancelled);
        Assert.Equal("PAYMENT_PROVIDER_SESSION_REQUIRES_RECONCILIATION", cancellation.FailureCode);
        Assert.Equal(EvaluationStatus.PendingPayment, resit.Status);
    }

    [Fact]
    public async Task Paid_resit_refund_is_review_required_before_any_provider_side_effect()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var provider = new CountingProvider();
        var commerce = new CommerceService(db, provider);
        var checkout = await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "refund-resit");
        Assert.True(await commerce.ConfirmFakeWebhookAsync(checkout!.PaymentId, "refund-resit-paid"));

        var refunds = new RefundService(db, provider);
        var internalResult = await refunds.RecordInternalRefundAsync("finance", new(
            checkout.PaymentId, 5m, "JOD", "CUSTOMER_REQUEST", null, "resit-internal-refund"));
        var result = await refunds.InitiatePayTabsRefundAsync("finance", new(
            checkout.PaymentId, "CUSTOMER_REQUEST", null, "resit-refund-attempt"));

        Assert.Equal("RESIT_REFUND_REVIEW_REQUIRED", internalResult.FailureCode);
        Assert.Equal("RESIT_REFUND_REVIEW_REQUIRED", result.FailureCode);
        Assert.Empty(await db.Refunds.ToListAsync());
        Assert.Equal(0, provider.RefundRequests);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
        Assert.Null(credit.RevokedAtUtc);
    }

    [Fact]
    public async Task Checkout_rejects_invalid_resit_authorization_and_missing_readiness()
    {
        await using var db = InMemory();
        var (resit, credit, authorization) = await SeedAsync(db);
        var commerce = new CommerceService(db, new FakePaymentProvider());
        Assert.Null(await commerce.CreateEvaluationCheckoutAsync("other", resit.Id, "Card", "wrong-owner"));
        authorization.ActivatedAtUtc = null;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "invalid-auth"));
        authorization.ActivatedAtUtc = DateTimeOffset.UtcNow;
        db.SubmissionFiles.Remove(await db.SubmissionFiles.SingleAsync());
        await db.SaveChangesAsync();
        Assert.Null(await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "no-file"));
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
        Assert.Empty(await db.Payments.ToListAsync());
        Assert.Null(credit.ConsumedByEvaluationRequestId);
    }

    [Theory]
    [InlineData("non-draft")]
    [InlineData("wrong-attempt")]
    [InlineData("missing-authenticity")]
    public async Task Resit_checkout_requires_its_draft_first_attempt_and_authenticity(string invalidState)
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        switch (invalidState)
        {
            case "non-draft":
                resit.Status = EvaluationStatus.Completed;
                break;
            case "wrong-attempt":
                resit.SubmissionAttemptNumber = 2;
                break;
            case "missing-authenticity":
                db.AuthenticityDeclarations.Remove(await db.AuthenticityDeclarations.SingleAsync());
                break;
        }
        await db.SaveChangesAsync();

        var commerce = new CommerceService(db, new FakePaymentProvider());
        if (invalidState == "wrong-attempt")
            await Assert.ThrowsAsync<InvalidOperationException>(() => commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "not-ready"));
        else
            Assert.Null(await commerce.CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "not-ready"));

        Assert.Empty(await db.Payments.ToListAsync());
        Assert.Null(credit.ConsumedByEvaluationRequestId);
    }

    [Fact]
    public async Task Historical_credit_corruption_is_not_replayed_as_a_free_resit()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        credit.ConsumedByEvaluationRequestId = resit.Id;
        credit.ConsumedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => new CommerceService(db, new FakePaymentProvider())
            .CreateEvaluationCheckoutAsync("student", resit.Id, "Card", "historical-credit"));

        Assert.Equal("RESIT_INCLUDED_CREDIT_RECONCILIATION_REQUIRED", error.Message);
        Assert.Empty(await db.Payments.ToListAsync());
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
    }

    [Fact]
    public async Task Orphan_paid_evaluation_payment_is_not_accepted_as_a_valid_resit_confirmation()
    {
        await using var db = InMemory();
        var (resit, credit, _) = await SeedAsync(db);
        var payment = new Payment
        {
            UserId = "student",
            Purpose = "Evaluation",
            ReferenceId = resit.Id,
            Status = PaymentStatus.Paid,
            Subtotal = resit.Price,
            Total = resit.Price,
            Currency = resit.Currency,
            Provider = "FakeCard",
            ProviderPaymentId = "orphan-provider"
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();

        Assert.False(await new CommerceService(db, new FakePaymentProvider()).ConfirmFakeWebhookAsync(
            payment.Id, "orphan-confirmation"));
        Assert.Equal(EvaluationStatus.Draft, resit.Status);
        Assert.Null(resit.PaymentId);
        Assert.Null(credit.ConsumedByEvaluationRequestId);
    }

    private static async Task<(EvaluationRequest Resit, IncludedEvaluationEntitlement Credit, ResitAuthorization Authorization)> SeedAsync(BetccoDbContext db)
    {
        var unit = new UnitDefinition { QualificationVersionId = Guid.NewGuid(), Code = "U1", ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var definition = new AssessmentDefinition { UnitDefinition = unit, Code = "A1", ArabicTitle = "مهمة", EnglishTitle = "Assignment" };
        var scope = new AssessmentScope { AssessmentDefinition = definition, GradeId = Guid.NewGuid(), SpecializationId = Guid.NewGuid(), RubricTemplateId = Guid.NewGuid() };
        var original = ReadyRequest();
        original.AssessmentScopeId = scope.Id;
        original.Status = EvaluationStatus.Completed;
        var resit = ReadyRequest();
        resit.AssessmentScopeId = scope.Id;
        var authorization = new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            ResitEvaluationRequestId = resit.Id,
            ActivatedAtUtc = DateTimeOffset.UtcNow,
            AuthorizedByUserId = Guid.NewGuid(),
            Reason = "Authorized"
        };
        var credit = new IncludedEvaluationEntitlement
        {
            StudentUserId = "student",
            UnitDefinitionId = unit.Id,
            EnrollmentId = Guid.NewGuid(),
            GrantedByPaymentId = Guid.NewGuid()
        };
        db.AddRange(unit, definition, scope, original, resit, authorization, credit);
        db.SubmissionFiles.Add(new SubmissionFile
        {
            EvaluationRequestId = resit.Id,
            OriginalFileName = "fresh.pdf",
            StorageKey = "private/fresh.pdf",
            ContentType = "application/pdf",
            LengthBytes = 100,
            ScanStatus = UploadScanStatus.Clean
        });
        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            EvaluationRequestId = resit.Id,
            StudentUserId = "student",
            AttemptNumber = 1,
            PolicyVersion = AssessmentAuthenticityPolicy.Version,
            StatementSnapshot = AssessmentAuthenticityPolicy.EnglishStatement
        });
        await db.SaveChangesAsync();
        return (resit, credit, authorization);
    }

    private static EvaluationRequest ReadyRequest() => new()
    {
        StudentUserId = "student",
        GradeId = Guid.NewGuid(),
        SpecializationId = Guid.NewGuid(),
        TaskTypeId = Guid.NewGuid(),
        RubricTemplateId = Guid.NewGuid(),
        Status = EvaluationStatus.Draft,
        Price = AssessmentPricing.StandardEvaluationPrice,
        Currency = "JOD",
        SubmissionAttemptNumber = 1,
        CriteriaSnapshotJson = "[\"A.P1\"]",
        AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
    };

    private static async Task<(Guid ResitId, string StudentId)> SeedPostgresAsync(PostgresTestDatabase database)
    {
        await using var db = database.CreateContext();
        var studentId = Guid.NewGuid();
        var reviewerId = Guid.NewGuid();
        var track = new LearningTrack { Slug = $"resit-commerce-{Guid.NewGuid():N}", ArabicName = "مسار", EnglishName = "Track" };
        var grade = new Grade { Slug = $"grade-{Guid.NewGuid():N}", ArabicName = "درجة", EnglishName = "Grade", LearningTrack = track };
        var specialization = new Specialization { Slug = $"specialization-{Guid.NewGuid():N}", ArabicName = "تخصص", EnglishName = "Specialization", LearningTrack = track };
        var qualification = new Qualification { Code = $"Q-{Guid.NewGuid():N}", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "v1", SourceReference = "test" };
        var unit = new UnitDefinition { QualificationVersion = version, Code = "U1", ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var definition = new AssessmentDefinition { UnitDefinition = unit, Code = "A1", ArabicTitle = "مهمة", EnglishTitle = "Assignment" };
        var rubric = new RubricTemplate { ArabicTitle = "معيار", EnglishTitle = "Rubric" };
        var scope = new AssessmentScope { AssessmentDefinition = definition, GradeId = grade.Id, SpecializationId = specialization.Id, RubricTemplateId = rubric.Id };
        var original = ReadyRequest();
        original.StudentUserId = studentId.ToString();
        original.AssessmentScopeId = scope.Id;
        original.GradeId = grade.Id;
        original.SpecializationId = specialization.Id;
        original.RubricTemplateId = rubric.Id;
        original.Status = EvaluationStatus.Completed;
        var resit = ReadyRequest();
        resit.StudentUserId = studentId.ToString();
        resit.AssessmentScopeId = scope.Id;
        resit.GradeId = grade.Id;
        resit.SpecializationId = specialization.Id;
        resit.RubricTemplateId = rubric.Id;
        var authorization = new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            ResitEvaluationRequestId = resit.Id,
            AuthorizedByUserId = reviewerId,
            ActivatedAtUtc = DateTimeOffset.UtcNow,
            Reason = "Authorized"
        };
        var course = new Course
        {
            Slug = $"course-{Guid.NewGuid():N}",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            TeacherUserId = reviewerId.ToString(),
            Status = CourseStatus.Published,
            Price = 20m
        };
        var grantPayment = new Payment
        {
            UserId = studentId.ToString(),
            Purpose = "CourseCart",
            ReferenceId = Guid.NewGuid(),
            Status = PaymentStatus.Processing,
            Subtotal = 20m,
            Total = 20m,
            Provider = "Fake"
        };
        var enrollment = new Enrollment { StudentUserId = studentId.ToString(), Course = course, PaymentId = grantPayment.Id };
        var credit = new IncludedEvaluationEntitlement
        {
            StudentUserId = studentId.ToString(),
            Enrollment = enrollment,
            UnitDefinition = unit,
            GrantedByPaymentId = grantPayment.Id
        };
        db.AddRange(track, grade, specialization, qualification, version, unit, definition, rubric, scope,
            original, resit, authorization, course, grantPayment, enrollment, credit,
            new ApplicationUser { Id = studentId, UserName = $"{studentId:N}@betcco.test", Email = $"{studentId:N}@betcco.test", DisplayName = "Student" },
            new ApplicationUser { Id = reviewerId, UserName = $"{reviewerId:N}@betcco.test", Email = $"{reviewerId:N}@betcco.test", DisplayName = "Reviewer" });
        db.SubmissionFiles.Add(new SubmissionFile
        {
            EvaluationRequestId = resit.Id,
            OriginalFileName = "fresh.pdf",
            StorageKey = "private/fresh.pdf",
            ContentType = "application/pdf",
            LengthBytes = 100,
            ScanStatus = UploadScanStatus.Clean
        });
        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            EvaluationRequestId = resit.Id,
            StudentUserId = studentId.ToString(),
            AttemptNumber = 1,
            PolicyVersion = AssessmentAuthenticityPolicy.Version,
            StatementSnapshot = AssessmentAuthenticityPolicy.EnglishStatement
        });
        await db.SaveChangesAsync();
        return (resit.Id, studentId.ToString());
    }

    private static BetccoDbContext InMemory(string? name = null, InMemoryDatabaseRoot? root = null) => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(name ?? Guid.NewGuid().ToString(), root)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)).Options);

    private sealed class CountingProvider : Betcco.Application.Commerce.IPaymentProvider
    {
        private int checkoutRequests;
        private int refundRequests;
        public int CheckoutRequests => checkoutRequests;
        public int RefundRequests => refundRequests;
        public string ProviderName => "Fake";
        public Task<Betcco.Application.Commerce.PaymentSession> CreateCheckoutSessionAsync(Betcco.Application.Commerce.PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref checkoutRequests);
            return Task.FromResult(new Betcco.Application.Commerce.PaymentSession("FakeCard", $"fake_{request.PaymentId:N}", null, true));
        }
        public Task<Betcco.Application.Commerce.PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> CreateRefundAsync(Betcco.Application.Commerce.PaymentProviderRefundRequest request, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref refundRequests);
            throw new NotSupportedException();
        }
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class RejectingProvider : Betcco.Application.Commerce.IPaymentProvider
    {
        public string ProviderName => "Fake";
        public Task<Betcco.Application.Commerce.PaymentSession> CreateCheckoutSessionAsync(Betcco.Application.Commerce.PaymentCheckoutRequest request, CancellationToken cancellationToken = default) =>
            throw new Betcco.Application.Commerce.PaymentSessionCreationRejectedException("TEST_REJECTED", "The test provider rejected the session.");
        public Task<Betcco.Application.Commerce.PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> CreateRefundAsync(Betcco.Application.Commerce.PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class UnknownProvider : Betcco.Application.Commerce.IPaymentProvider
    {
        private int checkoutRequests;
        public int CheckoutRequests => checkoutRequests;
        public string ProviderName => "Fake";
        public Task<Betcco.Application.Commerce.PaymentSession> CreateCheckoutSessionAsync(Betcco.Application.Commerce.PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref checkoutRequests);
            throw new Betcco.Application.Commerce.PaymentSessionResultUnknownException("The test result is unknown.");
        }
        public Task<Betcco.Application.Commerce.PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> CreateRefundAsync(Betcco.Application.Commerce.PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class DecliningPayTabsProvider : Betcco.Application.Commerce.IPaymentProvider
    {
        private Guid paymentId;
        public string Reference => "PT-DECLINED";
        public string ProviderName => "PayTabs";
        public Task<Betcco.Application.Commerce.PaymentSession> CreateCheckoutSessionAsync(Betcco.Application.Commerce.PaymentCheckoutRequest request, CancellationToken cancellationToken = default)
        {
            paymentId = request.PaymentId;
            return Task.FromResult(new Betcco.Application.Commerce.PaymentSession("PayTabs", Reference, "https://paytabs.example/checkout", false));
        }
        public Task<Betcco.Application.Commerce.PaymentTransactionVerification> VerifyTransactionAsync(string providerPaymentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new Betcco.Application.Commerce.PaymentTransactionVerification(
                "PayTabs", "test-profile", providerPaymentId, PayTabsPaymentProvider.CartId(paymentId), "JOD", 5m,
                false, "Declined", "D", true));
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> CreateRefundAsync(Betcco.Application.Commerce.PaymentProviderRefundRequest request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Betcco.Application.Commerce.PaymentProviderRefundTransaction> VerifyRefundAsync(string providerRefundReference, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
