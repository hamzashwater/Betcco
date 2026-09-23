using System.Reflection;
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
