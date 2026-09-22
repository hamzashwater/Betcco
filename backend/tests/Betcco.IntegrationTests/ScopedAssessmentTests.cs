using System.Reflection;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class ScopedAssessmentTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Discovery_only_offers_valid_published_scopes_and_student_route_is_protected()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("scope_discovery");
        await using var db = database.CreateContext();
        var fixture = await Seed(db);
        var service = new ScopedAssessmentService(db);
        Assert.Equal(fixture.Scope.Id, Assert.Single(await service.ListOptionsAsync(default)).AssessmentScopeId);

        fixture.Scope.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Empty(await service.ListOptionsAsync(default));
        fixture.Scope.IsActive = true;
        fixture.Scope.PublishedAtUtc = null;
        await db.SaveChangesAsync();
        Assert.Empty(await service.ListOptionsAsync(default));
        fixture.Scope.PublishedAtUtc = DateTimeOffset.UtcNow;
        fixture.Rubric.Criteria.First().Code = "OTHER.P1";
        await db.SaveChangesAsync();
        Assert.Empty(await service.ListOptionsAsync(default));
        fixture.Rubric.Criteria.First().Code = "A.P1";
        fixture.Version.Qualification!.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Empty(await service.ListOptionsAsync(default));

        foreach (var method in new[] { nameof(EvaluationsController.AssessmentScopes), nameof(EvaluationsController.CreateScoped) })
        {
            var attribute = typeof(EvaluationsController).GetMethod(method)!.GetCustomAttribute<AuthorizeAttribute>();
            Assert.Equal("Student", attribute?.Policy);
        }
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Scoped_creation_derives_legacy_fields_and_keeps_complete_snapshot_immutable()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("scope_snapshot");
        await using var db = database.CreateContext();
        var fixture = await Seed(db);
        var service = new ScopedAssessmentService(db);
        var view = await service.CreateAsync("student", new(fixture.Scope.Id, "  review please  "), default);
        Assert.NotNull(view);
        Assert.Equal("Qualification", view.Academic?.QualificationEnglishName);
        Assert.Equal("review please", view.StudentComment);
        var request = await db.EvaluationRequests.SingleAsync();
        Assert.Equal(fixture.Scope.Id, request.AssessmentScopeId);
        Assert.Equal(fixture.Grade.Id, request.GradeId);
        Assert.Equal(fixture.Specialization.Id, request.SpecializationId);
        Assert.Equal(fixture.Rubric.Id, request.RubricTemplateId);
        Assert.Equal(fixture.Task.Id, request.TaskTypeId);
        Assert.Equal(fixture.Version.Id, request.QualificationVersionId);
        Assert.NotNull(request.QualificationVersionSnapshotJson);
        Assert.Equal(new[] { "A.P1", "A.M1", "A.D1" }, JsonSerializer.Deserialize<string[]>(request.CriteriaSnapshotJson));
        Assert.Equal(BtecAssessmentRuleSet.Default.Version, request.AssessmentRuleSetVersion);
        Assert.NotEmpty(request.AssessmentRuleSetSnapshotJson);
        Assert.Single(await db.AssessmentAuditEvents.Where(x => x.EvaluationRequestId == request.Id).ToListAsync());

        var before = request.AssessmentScopeSnapshotJson;
        var snapshot = JsonSerializer.Deserialize<AssessmentScopeSnapshot>(before!);
        Assert.NotNull(snapshot);
        Assert.Equal(AssessmentScopeSnapshot.Version, snapshot.SchemaVersion);
        Assert.Equal("Q", snapshot.Qualification.Code);
        Assert.Equal("U1", snapshot.Unit.Code);
        Assert.Equal("ASSIGNMENT", snapshot.Assessment.Code);
        Assert.Equal(2, snapshot.Scope.Version);
        Assert.Equal("صف", snapshot.Scope.GradeArabicName);
        Assert.Equal("Specialization", snapshot.Scope.SpecializationEnglishName);
        Assert.Equal("A", Assert.Single(snapshot.LearningAims).Code);
        Assert.Equal("Source A", snapshot.LearningAims[0].SourceReference);
        Assert.Equal(new[] { "Pass", "Merit", "Distinction" }, snapshot.CanonicalCriteria.Select(x => x.Band));
        Assert.Equal(new[] { "A.P1", "A.M1", "A.D1" }, snapshot.CanonicalCriteria.Select(x => x.Code));
        Assert.Equal("وصف", snapshot.CanonicalCriteria[0].ArabicDescription);
        Assert.Equal("Description", snapshot.CanonicalCriteria[0].EnglishDescription);
        Assert.Equal("Source criterion", snapshot.CanonicalCriteria[0].SourceReference);
        Assert.Equal("A", snapshot.CanonicalCriteria[0].LearningAimCode);
        Assert.Equal(request.AssessmentRuleSetVersion, snapshot.Rubric.AssessmentRuleSetVersion);

        fixture.Grade.EnglishName = "Changed grade";
        fixture.Specialization.EnglishName = "Changed specialization";
        fixture.Scope.IsActive = false;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        Assert.Equal(before, (await db.EvaluationRequests.SingleAsync()).AssessmentScopeSnapshotJson);
        Assert.Null(await service.CreateAsync("student", new(fixture.Scope.Id, null), default));
        Assert.Single(await db.EvaluationRequests.ToListAsync());
        Assert.Null(AssessmentScopeSnapshotReader.Summary(null));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Missing_legacy_task_or_conflicting_rubric_binding_rejects_without_partial_request()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("scope_reject");
        await using var db = database.CreateContext();
        var fixture = await Seed(db);
        var service = new ScopedAssessmentService(db);
        fixture.Rubric.TaskTypeId = null;
        await db.SaveChangesAsync();
        Assert.Empty(await service.ListOptionsAsync(default));
        Assert.Null(await service.CreateAsync("student", new(fixture.Scope.Id, null), default));
        fixture.Rubric.TaskTypeId = fixture.Task.Id;
        fixture.Rubric.GradeId = Guid.NewGuid();
        await db.SaveChangesAsync();
        Assert.Null(await service.CreateAsync("student", new(fixture.Scope.Id, null), default));
        fixture.Rubric.GradeId = fixture.Grade.Id;
        fixture.Rubric.AssessmentRuleSetJson = "{invalid";
        await db.SaveChangesAsync();
        Assert.Empty(await service.ListOptionsAsync(default));
        Assert.Null(await service.CreateAsync("student", new(fixture.Scope.Id, null), default));
        Assert.Empty(await db.EvaluationRequests.ToListAsync());
        Assert.Empty(await db.AssessmentAuditEvents.ToListAsync());
        Assert.DoesNotContain(typeof(ScopedEvaluationCommand).GetProperties(), x => x.Name is "GradeId" or "RubricTemplateId");
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Pdf_and_safe_audit_use_saved_academic_identity_after_display_names_change()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("scope_exports");
        await using var db = database.CreateContext();
        var fixture = await Seed(db);
        var created = await new ScopedAssessmentService(db).CreateAsync("student", new(fixture.Scope.Id, null), default);
        Assert.NotNull(created);
        fixture.Grade.EnglishName = "Mutated grade";
        fixture.Rubric.EnglishTitle = "Mutated rubric";
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var eligibility = new LeadStaff();
        var renderer = new CaptureRenderer();
        var pdf = await new AssessmentPdfReportService(db, eligibility, renderer).CreateAsync("lead", created.Id, "en", default);
        Assert.NotNull(pdf);
        Assert.Equal("Grade", renderer.Report?.Academic?.GradeEnglishName);
        Assert.Equal("Rubric", renderer.Report?.TaskIdentity.RubricEnglishTitle);
        Assert.Equal("U1", renderer.Report?.Academic?.UnitCode);

        var export = await new AssessmentAuditExportService(db, eligibility).CreateAsync("lead", created.Id, default);
        Assert.NotNull(export);
        using var json = JsonDocument.Parse(export.JsonContent);
        var evaluation = json.RootElement.GetProperty("payload").GetProperty("evaluation");
        Assert.Equal("Grade", evaluation.GetProperty("academic").GetProperty("gradeEnglishName").GetString());
        Assert.Equal("U1", evaluation.GetProperty("academic").GetProperty("unitCode").GetString());
        Assert.DoesNotContain("assessmentScopeId", export.JsonContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storageKey", export.JsonContent, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class LeadStaff : IAssessorEligibilityService
    {
        public Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class CaptureRenderer : IAssessmentPdfRenderer
    {
        public bool IsConfigured => true;
        public string? UnavailableReason => null;
        public AssessmentPdfReportModel? Report { get; private set; }
        public byte[] Render(AssessmentPdfReportModel report)
        {
            Report = report;
            return "%PDF-test"u8.ToArray();
        }
    }

    private static async Task<(AssessmentScope Scope, Grade Grade, Specialization Specialization,
        RubricTemplate Rubric, TaskType Task, QualificationVersion Version)> Seed(BetccoDbContext db)
    {
        var track = new LearningTrack { Slug = "track", ArabicName = "مسار", EnglishName = "Track" };
        var grade = new Grade { Slug = "grade", ArabicName = "صف", EnglishName = "Grade", LearningTrack = track };
        var specialization = new Specialization { Slug = "specialization", ArabicName = "تخصص", EnglishName = "Specialization", LearningTrack = track };
        var task = new TaskType { ArabicName = "مهمة", EnglishName = "Task" };
        var qualification = new Qualification { Code = "Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "Source version" };
        var unit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = "U1",
            ArabicTitle = "وحدة",
            EnglishTitle = "Unit",
            SourceReference = "Source unit",
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        var aim = new LearningAimDefinition
        {
            UnitDefinition = unit,
            Code = "A",
            ArabicTitle = "هدف",
            EnglishTitle = "Aim",
            ArabicDescription = "شرح",
            EnglishDescription = "Aim description",
            SourceReference = "Source A",
            SortOrder = 1
        };
        var criteria = new[] { ("A.P1", BtecCriterionBand.Pass, 1), ("A.M1", BtecCriterionBand.Merit, 2), ("A.D1", BtecCriterionBand.Distinction, 3) }
            .Select(x => new AssessmentCriterionDefinition
            {
                LearningAimDefinition = aim,
                Code = x.Item1,
                Band = x.Item2,
                ArabicDescription = "وصف",
                EnglishDescription = "Description",
                SourceReference = "Source criterion",
                SortOrder = x.Item3
            }).ToArray();
        var definition = new AssessmentDefinition
        {
            UnitDefinition = unit,
            Code = "ASSIGNMENT",
            Version = 1,
            ArabicTitle = "تقييم",
            EnglishTitle = "Assessment",
            SourceReference = "Source assignment",
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        var rubric = new RubricTemplate
        {
            ArabicTitle = "معايير",
            EnglishTitle = "Rubric",
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = task.Id,
            QualificationVersion = version
        };
        foreach (var criterion in criteria) rubric.Criteria.Add(new RubricCriterion
        {
            Code = criterion.Code,
            ArabicDescription = criterion.ArabicDescription,
            EnglishDescription = criterion.EnglishDescription,
            SortOrder = criterion.SortOrder
        });
        var scope = new AssessmentScope
        {
            AssessmentDefinition = definition,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            RubricTemplateId = rubric.Id,
            Version = 2,
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        db.AddRange(track, grade, specialization, task, qualification, version, unit, aim, definition, rubric, scope);
        db.AddRange(criteria);
        await db.SaveChangesAsync();
        db.AssessmentDefinitionAims.Add(new AssessmentDefinitionAim
        {
            AssessmentDefinitionId = definition.Id,
            UnitDefinitionId = unit.Id,
            LearningAimDefinitionId = aim.Id
        });
        db.AssessmentDefinitionCriteria.AddRange(criteria.Select(x => new AssessmentDefinitionCriterion
        {
            AssessmentDefinitionId = definition.Id,
            LearningAimDefinitionId = aim.Id,
            AssessmentCriterionDefinitionId = x.Id
        }));
        await db.SaveChangesAsync();
        return (scope, grade, specialization, rubric, task, version);
    }
}
