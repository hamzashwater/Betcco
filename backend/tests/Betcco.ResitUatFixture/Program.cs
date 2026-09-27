using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

// This executable is test support for the disposable Full UAT database only.
// It seeds historical state that the browser cannot create in one focused journey,
// and reads lifecycle invariants. All new Resit transitions still use the live API.
if (Environment.GetEnvironmentVariable("BETCCO_RESIT_UAT_FIXTURE") != "1"
    || Environment.GetEnvironmentVariable("BETCCO_E2E_API") != "1"
    || Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") != "Development")
    throw new InvalidOperationException("The Resit fixture requires the explicit Development Full UAT gates.");

var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")
    ?? throw new InvalidOperationException("Full UAT PostgreSQL connection is missing.");
if (!(new NpgsqlConnectionStringBuilder(connection).Database ?? "")
    .EndsWith("_uat", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("The Resit fixture only accepts a database ending in _uat.");
var storageRoot = Environment.GetEnvironmentVariable("Storage__LocalRoot")
    ?? throw new InvalidOperationException("The Full UAT private storage root is missing.");
var options = new DbContextOptionsBuilder<BetccoDbContext>().UseNpgsql(connection).Options;
await using var db = new BetccoDbContext(options);
if (!await db.Database.CanConnectAsync())
    throw new InvalidOperationException("The Full UAT PostgreSQL database is unavailable.");

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
switch (args)
{
    case ["seed"]:
        Console.WriteLine(JsonSerializer.Serialize(await SeedAsync(db, storageRoot), jsonOptions));
        break;
    case ["snapshot", var originalText, var resitText]
        when Guid.TryParse(originalText, out var originalId) && Guid.TryParse(resitText, out var resitId):
        Console.WriteLine(JsonSerializer.Serialize(await SnapshotAsync(db, originalId, resitId), jsonOptions));
        break;
    default:
        throw new ArgumentException("Use seed or snapshot <original-id> <resit-id>; an empty GUID means no Resit yet.");
}

static async Task<object> SeedAsync(BetccoDbContext db, string storageRoot)
{
    var password = Environment.GetEnvironmentVariable("BETCCO_RESIT_UAT_PASSWORD")
        ?? throw new InvalidOperationException("The one-run fixture password is missing.");
    var suffix = Guid.NewGuid().ToString("N");
    var roleNames = new[] { PlatformRoles.Student, PlatformRoles.CourseReviewer, PlatformRoles.Assessor, PlatformRoles.Teacher };
    var roles = await db.Roles.Where(role => role.Name != null && roleNames.Contains(role.Name))
        .ToDictionaryAsync(role => role.Name!);
    if (roles.Count != roleNames.Length)
        throw new InvalidOperationException("The API must initialize Full UAT roles before the fixture runs.");

    ApplicationUser User(string label)
    {
        var email = $"resit-uat-{label}-{suffix}@betcco.test";
        var user = new ApplicationUser
        {
            UserName = email,
            NormalizedUserName = email.ToUpperInvariant(),
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            EmailConfirmed = true,
            SecurityStamp = Guid.NewGuid().ToString(),
            ConcurrencyStamp = Guid.NewGuid().ToString(),
            DisplayName = $"Resit UAT {label}"
        };
        user.PasswordHash = new PasswordHasher<ApplicationUser>().HashPassword(user, password);
        return user;
    }

    var student = User("student");
    var otherStudent = User("other-student");
    var reviewer = User("reviewer");
    var originalEvaluator = User("original-evaluator");
    var independentEvaluator = User("independent-evaluator");
    db.Users.AddRange(student, otherStudent, reviewer, originalEvaluator, independentEvaluator);
    void Role(ApplicationUser user, string name) =>
        db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = user.Id, RoleId = roles[name].Id });
    Role(student, PlatformRoles.Student);
    Role(otherStudent, PlatformRoles.Student);
    Role(reviewer, PlatformRoles.CourseReviewer);
    Role(reviewer, PlatformRoles.Assessor); // Proves the authorizer is rejected even with an eligible assessor role.
    Role(originalEvaluator, PlatformRoles.Assessor);
    Role(originalEvaluator, PlatformRoles.Teacher);
    Role(independentEvaluator, PlatformRoles.Assessor);
    Role(independentEvaluator, PlatformRoles.Teacher);

    var track = new LearningTrack
    {
        Slug = $"resit-uat-{suffix}",
        ArabicName = "مسار اختبار",
        EnglishName = "Resit UAT track"
    };
    var grade = new Grade
    {
        Slug = $"resit-uat-grade-{suffix}",
        ArabicName = "صف اختبار",
        EnglishName = "Resit UAT grade",
        LearningTrack = track
    };
    var specialization = new Specialization
    {
        Slug = $"resit-uat-specialization-{suffix}",
        ArabicName = "تخصص اختبار",
        EnglishName = "Resit UAT specialization",
        LearningTrack = track
    };
    var qualification = new Qualification
    {
        Code = $"UAT-{suffix[..8]}",
        ArabicName = "مؤهل اختبار",
        EnglishName = "Resit UAT qualification"
    };
    var version = new QualificationVersion
    {
        Qualification = qualification,
        VersionCode = "v1",
        SourceReference = "Full UAT fixture"
    };
    var unit = new UnitDefinition
    {
        QualificationVersion = version,
        Code = "U1",
        ArabicTitle = "وحدة اختبار",
        EnglishTitle = "Resit UAT unit",
        IsActive = true
    };
    var definition = new AssessmentDefinition
    {
        UnitDefinition = unit,
        Code = "A1",
        ArabicTitle = "مهمة اختبار",
        EnglishTitle = "Resit UAT assignment"
    };
    var rubric = new RubricTemplate { ArabicTitle = "معيار اختبار", EnglishTitle = "Resit UAT rubric" };
    var scope = new AssessmentScope
    {
        AssessmentDefinition = definition,
        GradeId = grade.Id,
        SpecializationId = specialization.Id,
        RubricTemplateId = rubric.Id,
        PublishedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
        IsActive = true
    };
    var now = DateTimeOffset.UtcNow;
    var scopeSnapshot = new AssessmentScopeSnapshot(
        AssessmentScopeSnapshot.Version,
        new QualificationAcademicSnapshot(qualification.Code, qualification.ArabicName,
            qualification.EnglishName, version.VersionCode, version.SourceReference, now.AddYears(-1), null),
        new UnitAcademicSnapshot(unit.Code, unit.ArabicTitle, unit.EnglishTitle, "Full UAT fixture"),
        new AssessmentDefinitionAcademicSnapshot(definition.Code, 1, definition.ArabicTitle,
            definition.EnglishTitle, "Full UAT fixture", now.AddDays(-2)),
        new ScopeAcademicSnapshot(1, now.AddDays(-2), grade.Slug, grade.ArabicName,
            grade.EnglishName, specialization.Slug, specialization.ArabicName, specialization.EnglishName),
        [new AimAcademicSnapshot("A", "هدف", "Aim", "شرح", "Description", "Full UAT fixture", 1)],
        [new CriterionAcademicSnapshot("A.P1", "Pass", "A", "معيار", "Criterion", "Full UAT fixture", 1)],
        new RubricAcademicSnapshot(rubric.ArabicTitle, rubric.EnglishTitle, 1,
            BtecAssessmentRuleSet.Default.Version, ["A.P1"]));
    var original = new EvaluationRequest
    {
        StudentUserId = student.Id.ToString(),
        GradeId = grade.Id,
        SpecializationId = specialization.Id,
        TaskTypeId = Guid.NewGuid(),
        RubricTemplateId = rubric.Id,
        AssessmentScopeId = scope.Id,
        AssessmentScopeSnapshotJson = JsonSerializer.Serialize(scopeSnapshot),
        QualificationVersionId = version.Id,
        QualificationVersionSnapshotJson = "{\"fixture\":true}",
        CriteriaSnapshotJson = "[\"A.P1\"]",
        AssessmentRuleSetVersion = BtecAssessmentRuleSet.Default.Version,
        AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson,
        Status = EvaluationStatus.Completed,
        CalculatedGrade = EvaluationGrade.NotYetAchieved,
        SubmissionAttemptNumber = 2,
        RevisionDueAtUtc = now.AddDays(-1),
        Price = AssessmentPricing.StandardEvaluationPrice,
        Currency = "JOD"
    };
    var originalFileKey = $"objects/uat/{suffix}.pdf";
    var originalFile = new SubmissionFile
    {
        EvaluationRequestId = original.Id,
        OriginalFileName = "original-second-attempt.pdf",
        StorageKey = originalFileKey,
        ContentType = "application/pdf",
        LengthBytes = 31,
        ScanStatus = UploadScanStatus.Clean
    };
    var originalDeclaration = new AuthenticityDeclaration
    {
        EvaluationRequestId = original.Id,
        StudentUserId = student.Id.ToString(),
        AttemptNumber = 2,
        PolicyVersion = AssessmentAuthenticityPolicy.Version,
        StatementSnapshot = AssessmentAuthenticityPolicy.EnglishStatement
    };
    var initial = new EvaluationReviewDecision
    {
        EvaluationRequestId = original.Id,
        AttemptNumber = 1,
        ReviewStage = EvaluationReviewStage.InitialReview,
        ReviewerUserId = originalEvaluator.Id.ToString(),
        DecidedAtUtc = now.AddDays(-2),
        CalculatedGrade = EvaluationGrade.NotYetAchieved,
        SectionResultsJson = "[]",
        Feedback = "Initial review requested the one revision check.",
        CriterionCount = 1,
        RequestsRevision = true,
        RevisionDueAtUtc = now.AddDays(-1)
    };
    var final = new EvaluationReviewDecision
    {
        EvaluationRequestId = original.Id,
        AttemptNumber = 2,
        ReviewStage = EvaluationReviewStage.RevisionCheck,
        ReviewerUserId = originalEvaluator.Id.ToString(),
        DecidedAtUtc = now.AddHours(-1),
        CalculatedGrade = EvaluationGrade.NotYetAchieved,
        SectionResultsJson = "[]",
        Feedback = "Final original review remained NotYetAchieved.",
        CriterionCount = 1
    };
    foreach (var decision in new[] { initial, final })
        decision.CriterionDecisions.Add(new EvaluationReviewCriterionDecision
        {
            EvaluationReviewDecisionId = decision.Id,
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.NotAchieved
        });
    var originalAssignment = new EvaluatorAssignment
    {
        EvaluationRequestId = original.Id,
        EvaluatorUserId = originalEvaluator.Id.ToString(),
        AssignedByUserId = reviewer.Id.ToString()
    };
    var course = new Course
    {
        Slug = $"resit-uat-course-{suffix}",
        ArabicTitle = "دورة اختبار",
        EnglishTitle = "Resit UAT course",
        ArabicDescription = "اختبار",
        EnglishDescription = "Fixture",
        LearningTrackId = track.Id,
        GradeId = grade.Id,
        SpecializationId = specialization.Id,
        QualificationVersionId = version.Id,
        Status = CourseStatus.Published,
        PublishedAtUtc = now.AddDays(-3)
    };
    var courseUnit = new CourseModule
    {
        CourseId = course.Id,
        UnitDefinitionId = unit.Id,
        UnitCode = unit.Code,
        ArabicTitle = unit.ArabicTitle,
        EnglishTitle = unit.EnglishTitle,
        IsPublished = true,
        PublicationStatus = ContentPublicationStatus.Published
    };
    var paidCoursePayment = new Payment
    {
        UserId = student.Id.ToString(),
        Purpose = "CourseCart",
        ReferenceId = course.Id,
        Status = PaymentStatus.Paid,
        Total = 1,
        Subtotal = 1,
        Currency = "JOD",
        PaidAtUtc = now.AddDays(-3)
    };
    var enrollment = new Enrollment
    {
        StudentUserId = student.Id.ToString(),
        CourseId = course.Id,
        PaymentId = paidCoursePayment.Id
    };
    var credit = new IncludedEvaluationEntitlement
    {
        StudentUserId = student.Id.ToString(),
        EnrollmentId = enrollment.Id,
        UnitDefinitionId = unit.Id,
        GrantedByPaymentId = paidCoursePayment.Id
    };
    db.AddRange(track, grade, specialization, qualification, version, unit, definition, rubric,
        scope, original, originalFile, originalDeclaration, initial, final, originalAssignment,
        course, courseUnit, paidCoursePayment, enrollment, credit);
    db.CriterionResults.Add(new CriterionResult
    {
        EvaluationRequestId = original.Id,
        CriterionCode = "A.P1",
        Achievement = CriterionAchievement.NotAchieved,
        Comment = "Original outcome"
    });
    db.EvaluatorUnitSpecialisms.AddRange(
        new EvaluatorUnitSpecialism { EvaluatorUserId = reviewer.Id, UnitDefinitionId = unit.Id, GrantedByUserId = reviewer.Id },
        new EvaluatorUnitSpecialism { EvaluatorUserId = originalEvaluator.Id, UnitDefinitionId = unit.Id, GrantedByUserId = reviewer.Id },
        new EvaluatorUnitSpecialism { EvaluatorUserId = independentEvaluator.Id, UnitDefinitionId = unit.Id, GrantedByUserId = reviewer.Id });

    var originalPath = Path.Combine(storageRoot, originalFileKey.Replace('/', Path.DirectorySeparatorChar));
    Directory.CreateDirectory(Path.GetDirectoryName(originalPath)!);
    var originalBytes = "%PDF-1.7\nOriginal UAT evidence\n"u8.ToArray();
    originalFile.LengthBytes = originalBytes.Length;
    await File.WriteAllBytesAsync(originalPath, originalBytes);
    await db.SaveChangesAsync();
    return new
    {
        originalId = original.Id,
        scopeId = scope.Id,
        studentId = student.Id,
        otherStudentId = otherStudent.Id,
        reviewerId = reviewer.Id,
        originalEvaluatorId = originalEvaluator.Id,
        independentEvaluatorId = independentEvaluator.Id,
        creditId = credit.Id,
        studentEmail = student.Email,
        otherStudentEmail = otherStudent.Email,
        reviewerEmail = reviewer.Email,
        originalEvaluatorEmail = originalEvaluator.Email,
        independentEvaluatorEmail = independentEvaluator.Email
    };
}

static async Task<object> SnapshotAsync(BetccoDbContext db, Guid originalId, Guid resitId)
{
    var original = await db.EvaluationRequests.AsNoTracking().SingleAsync(item => item.Id == originalId);
    var authorization = await db.ResitAuthorizations.AsNoTracking()
        .SingleOrDefaultAsync(item => item.OriginalEvaluationRequestId == originalId);
    var credit = await db.IncludedEvaluationEntitlements.AsNoTracking()
        .SingleAsync(item => item.StudentUserId == original.StudentUserId);
    var originalState = new
    {
        original.Id,
        status = original.Status.ToString(),
        grade = original.CalculatedGrade?.ToString(),
        original.SubmissionAttemptNumber,
        original.PaymentId,
        original.RevisionDueAtUtc,
        original.CriteriaSnapshotJson,
        original.AssessmentScopeSnapshotJson,
        original.SectionResultsJson,
        fileIds = await db.SubmissionFiles.AsNoTracking().Where(item => item.EvaluationRequestId == originalId)
            .Select(item => item.Id).OrderBy(id => id).ToArrayAsync(),
        declarationIds = await db.AuthenticityDeclarations.AsNoTracking().Where(item => item.EvaluationRequestId == originalId)
            .Select(item => item.Id).OrderBy(id => id).ToArrayAsync(),
        decisionIds = await db.EvaluationReviewDecisions.AsNoTracking().Where(item => item.EvaluationRequestId == originalId)
            .Select(item => item.Id).OrderBy(id => id).ToArrayAsync(),
        resultIds = await db.CriterionResults.AsNoTracking().Where(item => item.EvaluationRequestId == originalId)
            .Select(item => item.Id).OrderBy(id => id).ToArrayAsync()
    };
    object? resitState = null;
    if (resitId != Guid.Empty)
    {
        var resit = await db.EvaluationRequests.AsNoTracking().SingleAsync(item => item.Id == resitId);
        var payment = await db.Payments.AsNoTracking().SingleOrDefaultAsync(item =>
            item.Purpose == "Evaluation" && item.ReferenceId == resitId);
        resitState = new
        {
            resit.Id,
            status = resit.Status.ToString(),
            grade = resit.CalculatedGrade?.ToString(),
            resit.SubmissionAttemptNumber,
            resit.PaymentId,
            resit.Price,
            resit.Currency,
            resit.RevisionDueAtUtc,
            resit.RetakeOfEvaluationRequestId,
            files = (await db.SubmissionFiles.AsNoTracking().Where(item => item.EvaluationRequestId == resitId)
                .ToArrayAsync()).Select(item => new { item.Id, item.StorageKey, scanStatus = item.ScanStatus.ToString() }).ToArray(),
            declarations = await db.AuthenticityDeclarations.AsNoTracking()
                .Where(item => item.EvaluationRequestId == resitId)
                .Select(item => new { item.Id, item.AttemptNumber }).ToArrayAsync(),
            reviews = (await db.EvaluationReviewDecisions.AsNoTracking()
                .Where(item => item.EvaluationRequestId == resitId).ToArrayAsync())
                .Select(item => new
                {
                    item.AttemptNumber,
                    item.RequestsRevision,
                    grade = item.CalculatedGrade.ToString()
                }).ToArray(),
            feedbackRevisionCount = await db.EvaluationFeedbackItems.AsNoTracking()
                .CountAsync(item => item.EvaluationRequestId == resitId && item.RequestsResubmission),
            resubmissionCount = await db.ResubmissionAuthorizations.AsNoTracking()
                .CountAsync(item => item.EvaluationRequestId == resitId),
            assignmentEvaluatorId = await db.EvaluatorAssignments.AsNoTracking()
                .Where(item => item.EvaluationRequestId == resitId)
                .Select(item => item.EvaluatorUserId).SingleOrDefaultAsync(),
            payment = payment is null ? null : new
            {
                payment.Id,
                status = payment.Status.ToString(),
                payment.Purpose,
                payment.Subtotal,
                payment.Total,
                payment.Currency,
                payment.Provider
            }
        };
    }
    return new
    {
        original = originalState,
        resit = resitState,
        creditConsumedByEvaluationRequestId = credit.ConsumedByEvaluationRequestId,
        authorization = authorization is null ? null : new
        {
            authorization.Id,
            authorization.ResitEvaluationRequestId,
            authorization.AuthorizedByUserId,
            authorization.Reason,
            authorization.ActivatedAtUtc,
            authorization.RevokedAtUtc
        }
    };
}
