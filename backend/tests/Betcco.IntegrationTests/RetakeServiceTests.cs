using System.Reflection;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class RetakeServiceTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Liv_creates_one_independent_pass_only_retake_and_preserves_original_history()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("retake_happy");
        await using var db = database.CreateContext();
        var fixture = await SeedEligibleOriginal(db);
        var scoped = new ScopedAssessmentService(db);
        Assert.DoesNotContain(await scoped.ListOptionsAsync(default), x => x.AssessmentScopeId == fixture.RetakeScope.Id);
        Assert.Null(await scoped.CreateAsync("student", new(fixture.RetakeScope.Id, null), default));
        var service = new RetakeService(db, scoped, new Eligibility(true));

        var eligible = Assert.Single(await service.ListEligibleAsync("liv"));
        Assert.Equal(fixture.Original.Id, eligible.OriginalEvaluationRequestId);
        Assert.Equal(new[] { "A.P1" }, eligible.UnmetPassCriteria);
        Assert.Equal(fixture.RetakeScope.Id, Assert.Single(eligible.AvailableScopes).AssessmentScopeId);

        var originalSnapshot = fixture.Original.AssessmentScopeSnapshotJson;
        var originalPaymentId = fixture.Original.PaymentId;
        var result = await service.AuthorizeAsync("liv", fixture.Original.Id,
            new(fixture.RetakeScope.Id, "Documented LIV decision"));
        Assert.Equal(RetakeAuthorizationStatus.Created, result.Status);

        db.ChangeTracker.Clear();
        var original = await db.EvaluationRequests.Include(x => x.CriterionResults)
            .Include(x => x.EvidenceItems).Include(x => x.AuthenticityDeclarations)
            .SingleAsync(x => x.Id == fixture.Original.Id);
        var retake = await db.EvaluationRequests.Include(x => x.CriterionResults)
            .Include(x => x.EvidenceItems).Include(x => x.AuthenticityDeclarations)
            .SingleAsync(x => x.Id == result.Authorization!.RetakeEvaluationRequestId);
        var authorization = await db.RetakeAuthorizations.SingleAsync();

        Assert.Equal(originalSnapshot, original.AssessmentScopeSnapshotJson);
        Assert.Equal(originalPaymentId, original.PaymentId);
        Assert.Equal(EvaluationStatus.Completed, original.Status);
        Assert.Equal(3, original.CriterionResults.Count);
        Assert.Single(original.EvidenceItems);
        Assert.Single(original.AuthenticityDeclarations);
        Assert.Equal(original.Id, retake.RetakeOfEvaluationRequestId);
        Assert.Equal(EvaluationStatus.Draft, retake.Status);
        Assert.Equal(AssessmentPricing.StandardEvaluationPrice, retake.Price);
        Assert.Null(retake.PaymentId);
        Assert.Empty(retake.CriterionResults);
        Assert.Empty(retake.EvidenceItems);
        Assert.Empty(retake.AuthenticityDeclarations);
        Assert.Equal(new[] { "A.P1" }, System.Text.Json.JsonSerializer.Deserialize<string[]>(retake.CriteriaSnapshotJson));
        Assert.Equal("Documented LIV decision", authorization.Reason);
        Assert.Equal(fixture.RetakeScope.Id, authorization.RetakeAssessmentScopeId);
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(), x => x.EvaluationRequestId == original.Id && x.EventType == "RetakeAuthorized");
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(), x => x.EvaluationRequestId == retake.Id && x.EventType == "RetakeEvaluationCreated");
        Assert.DoesNotContain(typeof(RetakeAuthorizationView).GetProperties(), x => x.Name == "Reason");

        var commerce = new CommerceService(db, new FakePaymentProvider());
        Assert.Null(await commerce.CreateEvaluationCheckoutAsync("student", retake.Id, "Card", "retake-before-evidence"));
        db.SubmissionFiles.Add(new SubmissionFile
        {
            EvaluationRequestId = retake.Id,
            OriginalFileName = "retake.pdf",
            StorageKey = "retake/private/file",
            ContentType = "application/pdf",
            LengthBytes = 100,
            ScanStatus = UploadScanStatus.Clean
        });
        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            EvaluationRequestId = retake.Id,
            StudentUserId = "student",
            AttemptNumber = 1,
            PolicyVersion = AssessmentAuthenticityPolicy.Version,
            StatementSnapshot = AssessmentAuthenticityPolicy.EnglishStatement
        });
        await db.SaveChangesAsync();
        var checkout = await commerce.CreateEvaluationCheckoutAsync("student", retake.Id, "Card", "retake-checkout");
        Assert.NotNull(checkout);
        var payment = await db.Payments.SingleAsync(x => x.Id == checkout.PaymentId);
        Assert.Equal("Evaluation", payment.Purpose);
        Assert.Equal(retake.Id, payment.ReferenceId);
        Assert.Equal(AssessmentPricing.StandardEvaluationPrice, payment.Subtotal);
        Assert.Equal(originalPaymentId, original.PaymentId);
        Assert.Equal(EvaluationStatus.PendingPayment, retake.Status);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Eligibility_and_scope_are_server_owned_and_reject_unauthorized_or_invalid_requests()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("retake_guards");
        await using var db = database.CreateContext();
        var fixture = await SeedEligibleOriginal(db);

        var forbidden = await new RetakeService(db, new ScopedAssessmentService(db), new Eligibility(false))
            .AuthorizeAsync("student", fixture.Original.Id, new(fixture.RetakeScope.Id, "attempt"));
        Assert.Equal(RetakeAuthorizationStatus.Forbidden, forbidden.Status);

        var service = new RetakeService(db, new ScopedAssessmentService(db), new Eligibility(true));
        var invalidScope = await service.AuthorizeAsync("liv", fixture.Original.Id,
            new(fixture.OriginalScope.Id, "wrong assignment"));
        Assert.Equal(RetakeAuthorizationStatus.InvalidScope, invalidScope.Status);
        Assert.Empty(await db.RetakeAuthorizations.ToListAsync());

        var consumed = await db.ResubmissionAuthorizations.SingleAsync();
        consumed.SubmittedAtUtc = null;
        await db.SaveChangesAsync();
        Assert.Equal(RetakeAuthorizationStatus.NotEligible,
            (await service.AuthorizeAsync("liv", fixture.Original.Id,
                new(fixture.RetakeScope.Id, "resubmission not consumed"))).Status);
        consumed.SubmittedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        var targetDefinitionId = await db.AssessmentScopes.Where(x => x.Id == fixture.RetakeScope.Id)
            .Select(x => x.AssessmentDefinitionId).SingleAsync();
        var merit = await db.AssessmentCriterionDefinitions.SingleAsync(x => x.Code == "A.M1");
        var aimId = merit.LearningAimDefinitionId;
        db.AssessmentDefinitionCriteria.Add(new AssessmentDefinitionCriterion
        {
            AssessmentDefinitionId = targetDefinitionId,
            LearningAimDefinitionId = aimId,
            AssessmentCriterionDefinitionId = merit.Id
        });
        var targetRubricId = await db.AssessmentScopes.Where(x => x.Id == fixture.RetakeScope.Id)
            .Select(x => x.RubricTemplateId).SingleAsync();
        db.RubricCriteria.Add(new RubricCriterion
        {
            RubricTemplateId = targetRubricId,
            Code = "A.M1",
            ArabicDescription = "A.M1",
            EnglishDescription = "A.M1",
            SortOrder = 2
        });
        await db.SaveChangesAsync();
        Assert.Equal(RetakeAuthorizationStatus.InvalidScope,
            (await service.AuthorizeAsync("liv", fixture.Original.Id,
                new(fixture.RetakeScope.Id, "merit is not permitted"))).Status);

        fixture.Original.CalculatedGrade = EvaluationGrade.Pass;
        await db.SaveChangesAsync();
        Assert.Equal(RetakeAuthorizationStatus.NotEligible,
            (await service.AuthorizeAsync("liv", fixture.Original.Id,
                new(fixture.RetakeScope.Id, "passing request"))).Status);
        Assert.Empty(await db.RetakeAuthorizations.ToListAsync());

        var policy = typeof(RetakesController).GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal("AssessmentAppealReviewer", policy?.Policy);
        Assert.DoesNotContain(typeof(AuthorizeRetakeCommand).GetProperties(), x => x.Name.Contains("Price", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Retake_assessment_accepts_only_its_complete_pass_plan_and_cannot_award_above_pass()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("retake_pass_only");
        await using var db = database.CreateContext();
        var fixture = await SeedEligibleOriginal(db);
        var authorization = await new RetakeService(db, new ScopedAssessmentService(db), new Eligibility(true))
            .AuthorizeAsync("liv", fixture.Original.Id, new(fixture.RetakeScope.Id, "approved"));
        var retake = await db.EvaluationRequests.SingleAsync(x => x.Id == authorization.Authorization!.RetakeEvaluationRequestId);
        retake.Status = EvaluationStatus.Assigned;
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = retake.Id,
            EvaluatorUserId = "assessor",
            AssignedByUserId = "admin"
        });
        await db.SaveChangesAsync();
        var evaluation = new EvaluationService(db, new NullStorage(), new CleanScanner(), new Eligibility(true));
        Assert.False(await evaluation.SetCriteriaPlanAsync("assessor", retake.Id, ["A.P1", "A.M1"]));
        Assert.True(await evaluation.SetCriteriaPlanAsync("assessor", retake.Id, ["A.P1"]));
        Assert.False(await evaluation.SubmitResultsAsync("assessor", retake.Id,
            [new CriterionSubmission("A.M1", "Achieved", null, null)]));
        Assert.True(await evaluation.SubmitResultsAsync("assessor", retake.Id,
            [new CriterionSubmission("A.P1", "Achieved", "retake evidence", null)]));
        Assert.Equal(EvaluationGrade.Pass, retake.CalculatedGrade);
        Assert.Equal(EvaluationStatus.UnderReview, retake.Status);
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Database_and_service_prevent_second_retake_and_retake_chains()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("retake_unique");
        await using var db = database.CreateContext();
        var fixture = await SeedEligibleOriginal(db);
        var service = new RetakeService(db, new ScopedAssessmentService(db), new Eligibility(true));
        var first = await service.AuthorizeAsync("liv", fixture.Original.Id,
            new(fixture.RetakeScope.Id, "approved"));
        Assert.Equal(RetakeAuthorizationStatus.Created, first.Status);
        Assert.Equal(RetakeAuthorizationStatus.NotEligible,
            (await service.AuthorizeAsync("liv", fixture.Original.Id,
                new(fixture.RetakeScope.Id, "again"))).Status);

        db.EvaluationRequests.Add(new EvaluationRequest
        {
            StudentUserId = fixture.Original.StudentUserId,
            GradeId = fixture.Original.GradeId,
            SpecializationId = fixture.Original.SpecializationId,
            TaskTypeId = fixture.Original.TaskTypeId,
            RubricTemplateId = fixture.Original.RubricTemplateId,
            Price = AssessmentPricing.StandardEvaluationPrice,
            RetakeOfEvaluationRequestId = fixture.Original.Id
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());

        db.ChangeTracker.Clear();
        var retakeId = first.Authorization!.RetakeEvaluationRequestId;
        var retake = await db.EvaluationRequests.SingleAsync(x => x.Id == retakeId);
        retake.Status = EvaluationStatus.Completed;
        retake.SubmissionAttemptNumber = 2;
        retake.CalculatedGrade = EvaluationGrade.NotYetAchieved;
        db.ResubmissionAuthorizations.Add(new ResubmissionAuthorization
        {
            EvaluationRequestId = retake.Id,
            AuthorizedByUserId = "verifier",
            AttemptNumber = 2,
            RuleSetVersion = BtecAssessmentRuleSet.Default.Version,
            Reason = "revision",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(1),
            SubmittedAtUtc = DateTimeOffset.UtcNow
        });
        db.CriterionResults.Add(new CriterionResult
        {
            EvaluationRequestId = retake.Id,
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.NotAchieved
        });
        await db.SaveChangesAsync();
        Assert.DoesNotContain(await service.ListEligibleAsync("liv"), x => x.OriginalEvaluationRequestId == retake.Id);
    }

    private static async Task<Fixture> SeedEligibleOriginal(BetccoDbContext db)
    {
        var track = new LearningTrack { Slug = "track", ArabicName = "مسار", EnglishName = "Track" };
        var grade = new Grade { Slug = "grade", ArabicName = "صف", EnglishName = "Grade", LearningTrack = track };
        var specialization = new Specialization { Slug = "spec", ArabicName = "تخصص", EnglishName = "Specialization", LearningTrack = track };
        var task = new TaskType { ArabicName = "مهمة", EnglishName = "Task" };
        var qualification = new Qualification { Code = "Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "source", IsActive = true };
        var unit = new UnitDefinition { QualificationVersion = version, Code = "U1", ArabicTitle = "وحدة", EnglishTitle = "Unit", SourceReference = "source", IsActive = true, PublishedAtUtc = DateTimeOffset.UtcNow };
        var aim = new LearningAimDefinition { UnitDefinition = unit, Code = "A", ArabicTitle = "هدف", EnglishTitle = "Aim", ArabicDescription = "شرح", EnglishDescription = "Aim", SourceReference = "source", SortOrder = 1 };
        var pass = Criterion(aim, "A.P1", BtecCriterionBand.Pass, 1);
        var merit = Criterion(aim, "A.M1", BtecCriterionBand.Merit, 2);
        var distinction = Criterion(aim, "A.D1", BtecCriterionBand.Distinction, 3);
        var originalDefinition = Definition(unit, "ORIGINAL", "Original");
        var retakeDefinition = Definition(unit, "RETAKE", "Retake");
        var originalRubric = Rubric(grade, specialization, task, version, pass, merit, distinction);
        var retakeRubric = Rubric(grade, specialization, task, version, pass);
        var originalScope = Scope(originalDefinition, grade, specialization, originalRubric);
        var retakeScope = Scope(retakeDefinition, grade, specialization, retakeRubric);
        db.AddRange(track, grade, specialization, task, qualification, version, unit, aim,
            pass, merit, distinction, originalDefinition, retakeDefinition, originalRubric, retakeRubric,
            originalScope, retakeScope);
        await db.SaveChangesAsync();
        AddMappings(db, originalDefinition, unit, aim, pass, merit, distinction);
        AddMappings(db, retakeDefinition, unit, aim, pass);
        await db.SaveChangesAsync();

        var originalView = await new ScopedAssessmentService(db).CreateAsync("student", new(originalScope.Id, null), default);
        var original = await db.EvaluationRequests.SingleAsync(x => x.Id == originalView!.Id);
        original.Status = EvaluationStatus.Completed;
        original.SubmissionAttemptNumber = 2;
        original.CalculatedGrade = EvaluationGrade.NotYetAchieved;
        original.PaymentId = Guid.NewGuid();
        db.CriterionResults.AddRange(
            Result(original.Id, "A.P1", CriterionAchievement.NotAchieved),
            Result(original.Id, "A.M1", CriterionAchievement.NotAchieved),
            Result(original.Id, "A.D1", CriterionAchievement.NotAchieved));
        db.ResubmissionAuthorizations.Add(new ResubmissionAuthorization
        {
            EvaluationRequestId = original.Id,
            AuthorizedByUserId = "verifier",
            AttemptNumber = 2,
            RuleSetVersion = BtecAssessmentRuleSet.Default.Version,
            Reason = "authorized revision",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(1),
            SubmittedAtUtc = DateTimeOffset.UtcNow
        });
        db.EvaluationEvidenceItems.Add(new EvaluationEvidence { EvaluationRequestId = original.Id, CriterionCode = "A.P1", Narrative = "original evidence" });
        db.AuthenticityDeclarations.Add(new AuthenticityDeclaration { EvaluationRequestId = original.Id, StudentUserId = "student", AttemptNumber = 2, PolicyVersion = "v1", StatementSnapshot = "original declaration" });
        await db.SaveChangesAsync();
        return new(original, originalScope, retakeScope);
    }

    private static AssessmentCriterionDefinition Criterion(LearningAimDefinition aim, string code, BtecCriterionBand band, int order) => new()
    { LearningAimDefinition = aim, Code = code, Band = band, ArabicDescription = code, EnglishDescription = code, SourceReference = "source", SortOrder = order };
    private static AssessmentDefinition Definition(UnitDefinition unit, string code, string title) => new()
    { UnitDefinition = unit, Code = code, ArabicTitle = title, EnglishTitle = title, SourceReference = "source", IsActive = true, PublishedAtUtc = DateTimeOffset.UtcNow };
    private static RubricTemplate Rubric(Grade grade, Specialization specialization, TaskType task, QualificationVersion version, params AssessmentCriterionDefinition[] criteria)
    {
        var rubric = new RubricTemplate { ArabicTitle = "Rubric", EnglishTitle = "Rubric", GradeId = grade.Id, SpecializationId = specialization.Id, TaskTypeId = task.Id, QualificationVersion = version };
        foreach (var criterion in criteria) rubric.Criteria.Add(new RubricCriterion { Code = criterion.Code, ArabicDescription = criterion.Code, EnglishDescription = criterion.Code, SortOrder = criterion.SortOrder });
        return rubric;
    }
    private static AssessmentScope Scope(AssessmentDefinition definition, Grade grade, Specialization specialization, RubricTemplate rubric) => new()
    { AssessmentDefinition = definition, GradeId = grade.Id, SpecializationId = specialization.Id, RubricTemplateId = rubric.Id, Version = 1, IsActive = true, IsRetakeOnly = definition.Code == "RETAKE", PublishedAtUtc = DateTimeOffset.UtcNow };
    private static void AddMappings(BetccoDbContext db, AssessmentDefinition definition, UnitDefinition unit, LearningAimDefinition aim, params AssessmentCriterionDefinition[] criteria)
    {
        db.AssessmentDefinitionAims.Add(new AssessmentDefinitionAim { AssessmentDefinitionId = definition.Id, UnitDefinitionId = unit.Id, LearningAimDefinitionId = aim.Id });
        db.AssessmentDefinitionCriteria.AddRange(criteria.Select(x => new AssessmentDefinitionCriterion { AssessmentDefinitionId = definition.Id, LearningAimDefinitionId = aim.Id, AssessmentCriterionDefinitionId = x.Id }));
    }
    private static CriterionResult Result(Guid requestId, string code, CriterionAchievement achievement) => new() { EvaluationRequestId = requestId, CriterionCode = code, Achievement = achievement };
    private sealed record Fixture(EvaluationRequest Original, AssessmentScope OriginalScope, AssessmentScope RetakeScope);
    private sealed class Eligibility(bool allowed) : IAssessorEligibilityService
    {
        public Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(allowed);
        public Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(allowed);
        public Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(allowed);
    }
    private sealed class NullStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => Task.FromResult("unused");
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
    }
    private sealed class CleanScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) => Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }
}
