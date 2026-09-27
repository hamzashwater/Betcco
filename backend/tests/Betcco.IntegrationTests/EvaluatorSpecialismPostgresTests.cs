using System.Reflection;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Betcco.IntegrationTests;

public sealed class EvaluatorSpecialismPostgresTests
{
    [Fact]
    [Trait("Category", "PostgreSQLAssessment")]
    public async Task Activated_resit_routes_only_to_an_independent_evaluator_with_matching_unit_grant()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("resit_evaluator_routing");
        await using var provider = Services(database.ConnectionString);
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        db.Roles.Add(new IdentityRole<Guid> { Name = PlatformRoles.Assessor, NormalizedName = "ASSESSOR" });
        await db.SaveChangesAsync();
        var student = new ApplicationUser { UserName = "resit-student@example.test", DisplayName = "Student" };
        var originalEvaluator = new ApplicationUser { UserName = "original@example.test", DisplayName = "Original" };
        var authorizer = new ApplicationUser { UserName = "authorizer@example.test", DisplayName = "Authorizer" };
        var independent = new ApplicationUser { UserName = "independent@example.test", DisplayName = "Independent" };
        foreach (var user in new[] { student, originalEvaluator, authorizer, independent })
            Assert.True((await users.CreateAsync(user)).Succeeded);
        foreach (var user in new[] { originalEvaluator, authorizer, independent })
            Assert.True((await users.AddToRoleAsync(user, PlatformRoles.Assessor)).Succeeded);

        var track = new LearningTrack { Slug = "resit-routing", ArabicName = "مسار", EnglishName = "Track" };
        var grade = new Grade { Slug = "resit-grade", ArabicName = "صف", EnglishName = "Grade", LearningTrack = track };
        var specialization = new Specialization
        {
            Slug = "resit-specialization",
            ArabicName = "تخصص",
            EnglishName = "Specialization",
            LearningTrack = track
        };
        var task = new TaskType { ArabicName = "مهمة", EnglishName = "Task" };
        var qualification = new Qualification { Code = "RESIT-Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "test" };
        var unit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = "U1",
            ArabicTitle = "وحدة",
            EnglishTitle = "Unit"
        };
        var definition = new AssessmentDefinition
        {
            UnitDefinition = unit,
            Code = "A1",
            ArabicTitle = "تقييم",
            EnglishTitle = "Assessment"
        };
        var rubric = new RubricTemplate
        {
            ArabicTitle = "معيار",
            EnglishTitle = "Rubric",
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = task.Id,
            QualificationVersion = version
        };
        var academicScope = new AssessmentScope
        {
            AssessmentDefinition = definition,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            RubricTemplateId = rubric.Id
        };
        var now = DateTimeOffset.UtcNow;
        var snapshot = new AssessmentScopeSnapshot(
            AssessmentScopeSnapshot.Version,
            new QualificationAcademicSnapshot("RESIT-Q", "مؤهل", "Qualification", "V1", "test", now.AddYears(-1), null),
            new UnitAcademicSnapshot("U1", "وحدة", "Unit", "test"),
            new AssessmentDefinitionAcademicSnapshot("A1", 1, "مهمة", "Assignment", "test", now.AddMonths(-1)),
            new ScopeAcademicSnapshot(1, now.AddMonths(-1), "grade", "صف", "Grade", "spec", "تخصص", "Specialization"),
            [new AimAcademicSnapshot("A", "هدف", "Aim", "شرح", "Description", "test", 1)],
            [new CriterionAcademicSnapshot("A.P1", "Pass", "A", "معيار", "Criterion", "test", 1)],
            new RubricAcademicSnapshot("روبرك", "Rubric", 1, BtecAssessmentRuleSet.Default.Version, ["A.P1"]));
        var original = new EvaluationRequest
        {
            StudentUserId = student.Id.ToString(),
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = task.Id,
            RubricTemplateId = rubric.Id,
            QualificationVersionId = version.Id,
            QualificationVersionSnapshotJson = "{}",
            AssessmentScope = academicScope,
            AssessmentScopeSnapshotJson = JsonSerializer.Serialize(snapshot),
            CriteriaSnapshotJson = "[\"A.P1\"]",
            AssessmentRuleSetVersion = BtecAssessmentRuleSet.Default.Version,
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson,
            Status = EvaluationStatus.Completed,
            CalculatedGrade = EvaluationGrade.NotYetAchieved,
            SubmissionAttemptNumber = 2,
            RevisionDueAtUtc = now.AddDays(-1)
        };
        var authorization = new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            AuthorizedByUserId = authorizer.Id,
            Reason = "Private staff rationale"
        };
        db.AddRange(track, grade, specialization, task, qualification, version, unit, definition, rubric,
            academicScope, original, authorization);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = original.Id,
            EvaluatorUserId = originalEvaluator.Id.ToString(),
            AssignedByUserId = authorizer.Id.ToString()
        });
        foreach (var evaluator in new[] { originalEvaluator, authorizer, independent })
            db.EvaluatorUnitSpecialisms.Add(new EvaluatorUnitSpecialism
            {
                EvaluatorUserId = evaluator.Id,
                UnitDefinitionId = unit.Id,
                GrantedByUserId = authorizer.Id
            });
        await db.SaveChangesAsync();

        var activation = await new ResitService(db).ActivateAsync(student.Id.ToString(), authorization.Id);
        Assert.Equal(ResitActivationStatus.Activated, activation.Status);
        var resitId = Assert.IsType<Guid>(activation.ResitEvaluationRequestId);
        Assert.Equal(resitId, authorization.ResitEvaluationRequestId);
        var resit = await db.EvaluationRequests.SingleAsync(x => x.Id == resitId);
        // L12 owns payment; this setup simulates its completed PendingAssignment handoff.
        resit.Status = EvaluationStatus.PendingAssignment;
        await db.SaveChangesAsync();

        var specialisms = new EvaluatorSpecialismService(db, users);
        var candidates = await specialisms.EligibleAsync(resitId);
        Assert.Equal(AssignmentResult.Success, candidates.Result);
        Assert.Equal(independent.Id, Assert.Single(candidates.Candidates).Id);
        var routing = new EvaluationService(db, new NullStorage(), new CleanScanner());
        foreach (var blocked in new[] { originalEvaluator, authorizer })
        {
            Assert.Equal(AssignmentResult.ResitIndependenceRequired,
                await routing.AssignWithOutcomeAsync(authorizer.Id.ToString(), resitId, blocked.Id.ToString()));
            Assert.False(await db.EvaluatorAssignments.AnyAsync(x => x.EvaluationRequestId == resitId));
            Assert.Equal(EvaluationStatus.PendingAssignment, resit.Status);
        }
        Assert.Equal(AssignmentResult.Success,
            await routing.AssignWithOutcomeAsync(authorizer.Id.ToString(), resitId, independent.Id.ToString()));
        var assignment = await db.EvaluatorAssignments.SingleAsync(x => x.EvaluationRequestId == resitId);
        Assert.Equal(independent.Id.ToString(), assignment.EvaluatorUserId);
        Assert.Equal(await db.EvaluatorUnitSpecialisms.Where(x => x.EvaluatorUserId == independent.Id)
            .Select(x => x.Id).SingleAsync(), assignment.EvaluatorUnitSpecialismId);
        Assert.Equal(EvaluationStatus.Assigned, resit.Status);
    }

    [Fact]
    [Trait("Category", "PostgreSQLAssessment")]
    public async Task Direct_assignment_rechecks_unit_grant_and_persists_exact_evidence()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("evaluator_routing");
        await using var provider = Services(database.ConnectionString);
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var role = new IdentityRole<Guid> { Name = PlatformRoles.Assessor, NormalizedName = "ASSESSOR" };
        db.Roles.Add(role);
        await db.SaveChangesAsync();
        var actor = new ApplicationUser { UserName = "reviewer@example.test", DisplayName = "Reviewer" };
        var evaluator = new ApplicationUser { UserName = "assessor@example.test", DisplayName = "Assessor" };
        Assert.True((await users.CreateAsync(actor)).Succeeded);
        Assert.True((await users.CreateAsync(evaluator)).Succeeded);
        Assert.True((await users.AddToRoleAsync(evaluator, PlatformRoles.Assessor)).Succeeded);

        var track = new LearningTrack { Slug = "routing-track", ArabicName = "مسار", EnglishName = "Track" };
        var grade = new Grade { Slug = "routing-grade", ArabicName = "صف", EnglishName = "Grade", LearningTrack = track };
        var specialization = new Specialization
        {
            Slug = "routing-specialization",
            ArabicName = "تخصص",
            EnglishName = "Specialization",
            LearningTrack = track
        };
        var task = new TaskType { ArabicName = "مهمة", EnglishName = "Task" };
        var qualification = new Qualification { Code = "ROUTING-Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "test" };
        var unit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = "U1",
            ArabicTitle = "وحدة",
            EnglishTitle = "Unit",
            IsActive = true
        };
        var definition = new AssessmentDefinition
        {
            UnitDefinition = unit,
            Code = "A1",
            ArabicTitle = "تقييم",
            EnglishTitle = "Assessment"
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
        var academicScope = new AssessmentScope
        {
            AssessmentDefinition = definition,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            RubricTemplateId = rubric.Id
        };
        var request = new EvaluationRequest
        {
            StudentUserId = "historical-student",
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = task.Id,
            RubricTemplateId = rubric.Id,
            QualificationVersionId = version.Id,
            AssessmentScope = academicScope,
            Status = EvaluationStatus.PendingAssignment
        };
        db.AddRange(track, grade, specialization, task, qualification, version, unit, definition, rubric,
            academicScope, request);
        await db.SaveChangesAsync();

        var routing = new EvaluationService(db, new NullStorage(), new CleanScanner());
        Assert.Equal(AssignmentResult.UnitSpecialismRequired,
            await routing.AssignWithOutcomeAsync(actor.Id.ToString(), request.Id, evaluator.Id.ToString()));
        Assert.Empty(await db.EvaluatorAssignments.ToListAsync());
        var specialisms = new EvaluatorSpecialismService(db, users);
        Assert.Equal(SpecialismWriteResult.Success,
            await specialisms.GrantAsync(evaluator.Id, unit.Id, actor.Id));
        var grant = await db.EvaluatorUnitSpecialisms.SingleAsync();
        var candidates = await specialisms.EligibleAsync(request.Id);
        Assert.Equal(AssignmentResult.Success, candidates.Result);
        Assert.Contains(candidates.Candidates, x => x.Id == evaluator.Id);
        Assert.Equal(AssignmentResult.Success,
            await routing.AssignWithOutcomeAsync(actor.Id.ToString(), request.Id, evaluator.Id.ToString()));
        var assignment = await db.EvaluatorAssignments.SingleAsync();
        Assert.Equal(grant.Id, assignment.EvaluatorUnitSpecialismId);
        Assert.Equal(AssignmentResult.RequestNotAssignable,
            await routing.AssignWithOutcomeAsync(actor.Id.ToString(), request.Id, evaluator.Id.ToString()));
        var raceRequest = new EvaluationRequest
        {
            StudentUserId = request.StudentUserId,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = task.Id,
            RubricTemplateId = rubric.Id,
            QualificationVersionId = version.Id,
            AssessmentScopeId = academicScope.Id,
            Status = EvaluationStatus.PendingAssignment
        };
        db.EvaluationRequests.Add(raceRequest);
        await db.SaveChangesAsync();
        async Task<AssignmentResult> AssignInScope()
        {
            using var assignmentScope = provider.CreateScope();
            var assignmentDb = assignmentScope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            return await new EvaluationService(assignmentDb, new NullStorage(), new CleanScanner())
                .AssignWithOutcomeAsync(actor.Id.ToString(), raceRequest.Id, evaluator.Id.ToString());
        }
        var concurrentAssignments = await Task.WhenAll(AssignInScope(), AssignInScope());
        Assert.Equal(1, concurrentAssignments.Count(x => x == AssignmentResult.Success));
        Assert.Equal(1, await db.EvaluatorAssignments.CountAsync(x => x.EvaluationRequestId == raceRequest.Id));
        var retakeScope = new AssessmentScope
        {
            AssessmentDefinitionId = definition.Id,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            RubricTemplateId = rubric.Id,
            Version = 2,
            IsRetakeOnly = true
        };
        var retake = new EvaluationRequest
        {
            StudentUserId = request.StudentUserId,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = task.Id,
            RubricTemplateId = rubric.Id,
            QualificationVersionId = version.Id,
            AssessmentScope = retakeScope,
            RetakeOfEvaluationRequestId = request.Id,
            Status = EvaluationStatus.PendingAssignment
        };
        db.AddRange(retakeScope, retake);
        await db.SaveChangesAsync();
        Assert.Equal(SpecialismWriteResult.Success,
            await specialisms.RevokeAsync(grant.Id, actor.Id, null));
        Assert.Equal(grant.Id, (await db.EvaluatorAssignments.SingleAsync(x => x.EvaluationRequestId == request.Id))
            .EvaluatorUnitSpecialismId);
        Assert.Equal(EvaluationStatus.Assigned, request.Status);
        Assert.Equal(AssignmentResult.UnitSpecialismRequired,
            await routing.AssignWithOutcomeAsync(actor.Id.ToString(), retake.Id, evaluator.Id.ToString()));
        Assert.Equal(SpecialismWriteResult.Success,
            await specialisms.GrantAsync(evaluator.Id, unit.Id, actor.Id));
        Assert.Equal(AssignmentResult.Success,
            await routing.AssignWithOutcomeAsync(actor.Id.ToString(), retake.Id, evaluator.Id.ToString()));
        Assert.Equal(3, await db.EvaluatorAssignments.CountAsync());
        Assert.NotEqual(grant.Id, (await db.EvaluatorAssignments.SingleAsync(x => x.EvaluationRequestId == retake.Id))
            .EvaluatorUnitSpecialismId);
        var roleRequest = new EvaluationRequest
        {
            StudentUserId = request.StudentUserId,
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = task.Id,
            RubricTemplateId = rubric.Id,
            QualificationVersionId = version.Id,
            AssessmentScopeId = academicScope.Id,
            Status = EvaluationStatus.PendingAssignment
        };
        db.EvaluationRequests.Add(roleRequest);
        await db.SaveChangesAsync();
        Assert.True((await users.RemoveFromRoleAsync(evaluator, PlatformRoles.Assessor)).Succeeded);
        Assert.Empty((await specialisms.EligibleAsync(roleRequest.Id)).Candidates);
        Assert.Equal(AssignmentResult.EvaluatorNotEligible,
            await routing.AssignWithOutcomeAsync(actor.Id.ToString(), roleRequest.Id, evaluator.Id.ToString()));
        Assert.True((await users.AddToRoleAsync(evaluator, PlatformRoles.Assessor)).Succeeded);
        evaluator.IsFrozen = true;
        Assert.True((await users.UpdateAsync(evaluator)).Succeeded);
        Assert.Empty((await specialisms.EligibleAsync(roleRequest.Id)).Candidates);
        Assert.Equal(AssignmentResult.EvaluatorNotEligible,
            await routing.AssignWithOutcomeAsync(actor.Id.ToString(), roleRequest.Id, evaluator.Id.ToString()));
    }

    [Fact]
    [Trait("Category", "PostgreSQLAssessment")]
    public async Task Concurrent_grants_are_unique_and_revoke_preserves_history_for_regrant()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("evaluator_specialisms");
        await using var provider = Services(database.ConnectionString);
        Guid actorId;
        Guid evaluatorId;
        Guid unitId;
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var role = new IdentityRole<Guid> { Name = PlatformRoles.Assessor, NormalizedName = "ASSESSOR" };
            db.Roles.Add(role);
            await db.SaveChangesAsync();
            var actor = new ApplicationUser { UserName = "admin@example.test", DisplayName = "Admin" };
            var evaluator = new ApplicationUser { UserName = "assessor@example.test", DisplayName = "Assessor" };
            Assert.True((await users.CreateAsync(actor)).Succeeded);
            Assert.True((await users.CreateAsync(evaluator)).Succeeded);
            Assert.True((await users.AddToRoleAsync(evaluator, PlatformRoles.Assessor)).Succeeded);
            var qualification = new Qualification { Code = "TEST-Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
            var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "test" };
            var unit = new UnitDefinition
            {
                QualificationVersion = version,
                Code = "U1",
                ArabicTitle = "وحدة",
                EnglishTitle = "Unit",
                IsActive = true
            };
            db.UnitDefinitions.Add(unit);
            await db.SaveChangesAsync();
            actorId = actor.Id;
            evaluatorId = evaluator.Id;
            unitId = unit.Id;
            var service = new EvaluatorSpecialismService(db, users);
            Assert.Equal(SpecialismWriteResult.EvaluatorNotEligible,
                await service.GrantAsync(Guid.NewGuid(), unitId, actorId));
            Assert.Equal(SpecialismWriteResult.UnitNotFound,
                await service.GrantAsync(evaluatorId, Guid.NewGuid(), actorId));
            evaluator.IsFrozen = true;
            Assert.True((await users.UpdateAsync(evaluator)).Succeeded);
            Assert.Equal(SpecialismWriteResult.EvaluatorNotEligible,
                await service.GrantAsync(evaluatorId, unitId, actorId));
            evaluator.IsFrozen = false;
            Assert.True((await users.UpdateAsync(evaluator)).Succeeded);
        }

        async Task<SpecialismWriteResult> GrantInScope()
        {
            using var scope = provider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            return await new EvaluatorSpecialismService(db, users).GrantAsync(evaluatorId, unitId, actorId);
        }

        var concurrent = await Task.WhenAll(GrantInScope(), GrantInScope());
        Assert.Equal(1, concurrent.Count(x => x == SpecialismWriteResult.Success));
        Assert.Equal(1, concurrent.Count(x => x == SpecialismWriteResult.AlreadyActive));

        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var service = new EvaluatorSpecialismService(db, users);
            var original = await db.EvaluatorUnitSpecialisms.SingleAsync();
            Assert.Equal(SpecialismWriteResult.Success, await service.RevokeAsync(original.Id, actorId, "Changed staffing"));
            Assert.Equal(SpecialismWriteResult.AlreadyRevoked, await service.RevokeAsync(original.Id, actorId, null));
            Assert.Equal(actorId, original.RevokedByUserId);
            Assert.NotNull(original.RevokedAtUtc);
        }
        Assert.Equal(SpecialismWriteResult.Success, await GrantInScope());
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BetccoDbContext>();
            Assert.Equal(2, await db.EvaluatorUnitSpecialisms.CountAsync());
            Assert.Equal(1, await db.EvaluatorUnitSpecialisms.CountAsync(x => x.RevokedAtUtc == null));
        }
    }

    [Fact]
    public void Management_and_candidate_routes_keep_their_separate_policies()
    {
        Assert.Equal("SystemAdmin", typeof(AdminEvaluatorSpecialismsController)
            .GetCustomAttribute<AuthorizeAttribute>()?.Policy);
        Assert.Equal("CourseReviewer", typeof(EvaluationsController)
            .GetMethod(nameof(EvaluationsController.EligibleEvaluators))?
            .GetCustomAttribute<AuthorizeAttribute>()?.Policy);
        Assert.Equal("CourseReviewer", typeof(EvaluationsController)
            .GetMethod(nameof(EvaluationsController.Assign))?
            .GetCustomAttribute<AuthorizeAttribute>()?.Policy);
    }

    private static ServiceProvider Services(string connectionString)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<BetccoDbContext>(options => options.UseNpgsql(connectionString));
        services.AddIdentityCore<ApplicationUser>()
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<BetccoDbContext>();
        return services.BuildServiceProvider();
    }

    private sealed class NullStorage : Betcco.Application.Common.IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType,
            CancellationToken cancellationToken = default) => Task.FromResult("unused");
        public Task<Stream?> OpenPrivateReadAsync(string storageKey,
            CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
    }

    private sealed class CleanScanner : Betcco.Application.Common.IFileSecurityScanner
    {
        public Task<Betcco.Application.Common.FileScanResult> ScanAsync(Stream content,
            CancellationToken cancellationToken = default) => Task.FromResult(
                new Betcco.Application.Common.FileScanResult(Betcco.Application.Common.FileScanOutcome.Clean));
    }
}
