using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class EvaluatorSpecialismAssignmentTests
{
    [Fact]
    public async Task Assignment_requires_matching_active_unit_grant_and_preserves_its_evidence()
    {
        await using var db = NewContext();
        var (request, unit, evaluatorId) = await SeedAsync(db);
        var service = new EvaluationService(db, new NullStorage(), new CleanScanner());

        Assert.Equal(AssignmentResult.UnitSpecialismRequired,
            await service.AssignWithOutcomeAsync("reviewer", request.Id, evaluatorId.ToString()));
        var otherUnit = new UnitDefinition
        {
            QualificationVersionId = unit.QualificationVersionId,
            Code = "U2",
            EnglishTitle = "Other",
            ArabicTitle = "أخرى"
        };
        db.UnitDefinitions.Add(otherUnit);
        var wrongGrant = new EvaluatorUnitSpecialism
        {
            EvaluatorUserId = evaluatorId,
            UnitDefinitionId = otherUnit.Id,
            GrantedByUserId = evaluatorId
        };
        db.EvaluatorUnitSpecialisms.Add(wrongGrant);
        await db.SaveChangesAsync();
        Assert.Equal(AssignmentResult.UnitSpecialismRequired,
            await service.AssignWithOutcomeAsync("reviewer", request.Id, evaluatorId.ToString()));

        var grant = new EvaluatorUnitSpecialism
        {
            EvaluatorUserId = evaluatorId,
            UnitDefinitionId = unit.Id,
            GrantedByUserId = evaluatorId
        };
        db.EvaluatorUnitSpecialisms.Add(grant);
        await db.SaveChangesAsync();
        Assert.Equal(AssignmentResult.Success,
            await service.AssignWithOutcomeAsync("reviewer", request.Id, evaluatorId.ToString()));
        var assignment = await db.EvaluatorAssignments.SingleAsync();
        Assert.Equal(grant.Id, assignment.EvaluatorUnitSpecialismId);
        Assert.Equal(EvaluationStatus.Assigned, request.Status);

        grant.RevokedAtUtc = DateTimeOffset.UtcNow;
        grant.RevokedByUserId = evaluatorId;
        await db.SaveChangesAsync();
        Assert.Equal(grant.Id, (await db.EvaluatorAssignments.SingleAsync()).EvaluatorUnitSpecialismId);
        Assert.Equal(EvaluationStatus.Assigned, request.Status);
    }

    [Fact]
    public async Task Legacy_and_mismatched_version_requests_cannot_be_assigned()
    {
        await using var db = NewContext();
        var (request, unit, evaluatorId) = await SeedAsync(db);
        db.EvaluatorUnitSpecialisms.Add(new EvaluatorUnitSpecialism
        {
            EvaluatorUserId = evaluatorId,
            UnitDefinitionId = unit.Id,
            GrantedByUserId = evaluatorId
        });
        await db.SaveChangesAsync();
        var service = new EvaluationService(db, new NullStorage(), new CleanScanner());

        request.AssessmentScopeId = null;
        await db.SaveChangesAsync();
        Assert.Equal(AssignmentResult.AcademicMappingRequired,
            await service.AssignWithOutcomeAsync("reviewer", request.Id, evaluatorId.ToString()));
        request.AssessmentScopeId = (await db.AssessmentScopes.SingleAsync()).Id;
        request.QualificationVersionId = Guid.NewGuid();
        await db.SaveChangesAsync();
        Assert.Equal(AssignmentResult.AcademicMappingRequired,
            await service.AssignWithOutcomeAsync("reviewer", request.Id, evaluatorId.ToString()));
        Assert.Empty(await db.EvaluatorAssignments.ToListAsync());
    }

    [Fact]
    public async Task Linked_resit_excludes_every_original_evaluator_and_authorizer_from_listing_and_assignment()
    {
        await using var db = NewContext();
        var (original, unit, originalEvaluatorId) = await SeedAsync(db);
        var secondOriginalEvaluatorId = Guid.NewGuid();
        var authorizerId = Guid.NewGuid();
        var independentId = Guid.NewGuid();
        var ungrantedId = Guid.NewGuid();
        var frozenId = Guid.NewGuid();
        var wrongRoleId = Guid.NewGuid();
        var assessorRole = await db.Roles.SingleAsync();
        foreach (var (id, name) in new[]
                 {
                     (secondOriginalEvaluatorId, "Second original"),
                     (authorizerId, "Authorizer"),
                     (independentId, "Independent"),
                     (ungrantedId, "No grant"),
                     (frozenId, "Frozen")
                 })
        {
            db.Users.Add(new ApplicationUser
            {
                Id = id,
                UserName = $"{id:N}@example.test",
                DisplayName = name,
                IsFrozen = id == frozenId
            });
            db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = id, RoleId = assessorRole.Id });
        }
        db.Users.Add(new ApplicationUser
        {
            Id = wrongRoleId,
            UserName = $"{wrongRoleId:N}@example.test",
            DisplayName = "Wrong role"
        });
        foreach (var id in new[]
                 { originalEvaluatorId, secondOriginalEvaluatorId, authorizerId, independentId, frozenId, wrongRoleId })
            db.EvaluatorUnitSpecialisms.Add(new EvaluatorUnitSpecialism
            {
                EvaluatorUserId = id,
                UnitDefinitionId = unit.Id,
                GrantedByUserId = authorizerId
            });
        original.Status = EvaluationStatus.Completed;
        db.EvaluatorAssignments.AddRange(
            new EvaluatorAssignment
            {
                EvaluationRequestId = original.Id,
                EvaluatorUserId = originalEvaluatorId.ToString(),
                AssignedByUserId = authorizerId.ToString()
            },
            new EvaluatorAssignment
            {
                EvaluationRequestId = original.Id,
                EvaluatorUserId = secondOriginalEvaluatorId.ToString(),
                AssignedByUserId = authorizerId.ToString()
            });
        var resit = new EvaluationRequest
        {
            StudentUserId = original.StudentUserId,
            GradeId = original.GradeId,
            SpecializationId = original.SpecializationId,
            TaskTypeId = original.TaskTypeId,
            RubricTemplateId = original.RubricTemplateId,
            QualificationVersionId = original.QualificationVersionId,
            AssessmentScopeId = original.AssessmentScopeId,
            Status = EvaluationStatus.PendingAssignment
        };
        db.EvaluationRequests.Add(resit);
        db.ResitAuthorizations.Add(new ResitAuthorization
        {
            OriginalEvaluationRequestId = original.Id,
            ResitEvaluationRequestId = resit.Id,
            AuthorizedByUserId = authorizerId,
            ActivatedAtUtc = DateTimeOffset.UtcNow,
            Reason = "Private reason"
        });
        await db.SaveChangesAsync();

        var specialisms = new EvaluatorSpecialismService(db, null!);
        var candidates = await specialisms.EligibleAsync(resit.Id);
        Assert.Equal(AssignmentResult.Success, candidates.Result);
        Assert.Equal(independentId, Assert.Single(candidates.Candidates).Id);
        var service = new EvaluationService(db, new NullStorage(), new CleanScanner());
        Assert.Equal(AssignmentResult.UnitSpecialismRequired,
            await service.AssignWithOutcomeAsync(authorizerId.ToString(), resit.Id, ungrantedId.ToString()));
        Assert.Equal(AssignmentResult.EvaluatorNotEligible,
            await service.AssignWithOutcomeAsync(authorizerId.ToString(), resit.Id, frozenId.ToString()));
        Assert.Equal(AssignmentResult.EvaluatorNotEligible,
            await service.AssignWithOutcomeAsync(authorizerId.ToString(), resit.Id, wrongRoleId.ToString()));
        resit.QualificationVersionId = Guid.NewGuid();
        await db.SaveChangesAsync();
        Assert.Equal(AssignmentResult.AcademicMappingRequired, (await specialisms.EligibleAsync(resit.Id)).Result);
        Assert.Equal(AssignmentResult.AcademicMappingRequired,
            await service.AssignWithOutcomeAsync(authorizerId.ToString(), resit.Id, independentId.ToString()));
        resit.QualificationVersionId = original.QualificationVersionId;
        await db.SaveChangesAsync();
        foreach (var id in new[] { originalEvaluatorId, secondOriginalEvaluatorId, authorizerId })
        {
            Assert.Equal(AssignmentResult.ResitIndependenceRequired,
                await service.AssignWithOutcomeAsync(authorizerId.ToString(), resit.Id, id.ToString()));
            Assert.False(await db.EvaluatorAssignments.AnyAsync(x => x.EvaluationRequestId == resit.Id));
            Assert.Equal(EvaluationStatus.PendingAssignment, resit.Status);
            Assert.False(await db.AssessmentAuditEvents.AnyAsync(x => x.EvaluationRequestId == resit.Id));
            Assert.False(await db.AuditLogs.AnyAsync(x => x.EntityId == resit.Id.ToString()));
        }

        var controller = new EvaluationsController(service, null!, null!, db, null!, specialisms)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, authorizerId.ToString())], "test"));
        var response = await controller.Assign(resit.Id, new AssignEvaluatorRequest(authorizerId.ToString()), default);
        var conflict = Assert.IsType<ConflictObjectResult>(response);
        Assert.Equal("{\"code\":\"RESIT_EVALUATOR_INDEPENDENCE_REQUIRED\"}",
            JsonSerializer.Serialize(conflict.Value));

        Assert.Equal(AssignmentResult.Success,
            await service.AssignWithOutcomeAsync(authorizerId.ToString(), resit.Id, independentId.ToString()));
        var assignment = await db.EvaluatorAssignments.SingleAsync(x => x.EvaluationRequestId == resit.Id);
        Assert.Equal(independentId.ToString(), assignment.EvaluatorUserId);
        Assert.Equal(authorizerId.ToString(), assignment.AssignedByUserId);
        Assert.Equal(await db.EvaluatorUnitSpecialisms.Where(x => x.EvaluatorUserId == independentId)
            .Select(x => x.Id).SingleAsync(), assignment.EvaluatorUnitSpecialismId);
        Assert.Equal(EvaluationStatus.Assigned, resit.Status);
        Assert.True(await db.AssessmentAuditEvents.AnyAsync(x => x.EvaluationRequestId == resit.Id
            && x.EventType == "AssessorAssigned"));
        Assert.True(await db.AuditLogs.AnyAsync(x => x.EntityId == resit.Id.ToString()
            && x.Action == "EvaluatorAssigned"));

        var normal = new EvaluationRequest
        {
            StudentUserId = original.StudentUserId,
            GradeId = original.GradeId,
            SpecializationId = original.SpecializationId,
            TaskTypeId = original.TaskTypeId,
            RubricTemplateId = original.RubricTemplateId,
            QualificationVersionId = original.QualificationVersionId,
            AssessmentScopeId = original.AssessmentScopeId,
            Status = EvaluationStatus.PendingAssignment
        };
        db.EvaluationRequests.Add(normal);
        await db.SaveChangesAsync();
        Assert.Contains((await specialisms.EligibleAsync(normal.Id)).Candidates, x => x.Id == originalEvaluatorId);
        Assert.Equal(AssignmentResult.Success,
            await service.AssignWithOutcomeAsync(authorizerId.ToString(), normal.Id, originalEvaluatorId.ToString()));
    }

    private static BetccoDbContext NewContext() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static async Task<(EvaluationRequest Request, UnitDefinition Unit, Guid EvaluatorId)> SeedAsync(
        BetccoDbContext db)
    {
        var evaluatorId = Guid.NewGuid();
        var role = new IdentityRole<Guid> { Name = PlatformRoles.Assessor, NormalizedName = "ASSESSOR" };
        db.Users.Add(new ApplicationUser
        {
            Id = evaluatorId,
            UserName = "assessor@example.test",
            DisplayName = "Assessor"
        });
        db.Roles.Add(role);
        db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = evaluatorId, RoleId = role.Id });
        var qualification = new Qualification { Code = "Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion
        {
            Qualification = qualification,
            VersionCode = "V1",
            SourceReference = "test"
        };
        var unit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = "U1",
            EnglishTitle = "Unit",
            ArabicTitle = "وحدة"
        };
        var definition = new AssessmentDefinition
        {
            UnitDefinition = unit,
            Code = "A1",
            EnglishTitle = "Assessment",
            ArabicTitle = "تقييم"
        };
        var gradeId = Guid.NewGuid();
        var specializationId = Guid.NewGuid();
        var rubricId = Guid.NewGuid();
        var scope = new AssessmentScope
        {
            AssessmentDefinition = definition,
            GradeId = gradeId,
            SpecializationId = specializationId,
            RubricTemplateId = rubricId
        };
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = gradeId,
            SpecializationId = specializationId,
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = rubricId,
            QualificationVersionId = version.Id,
            AssessmentScope = scope,
            Status = EvaluationStatus.PendingAssignment
        };
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();
        return (request, unit, evaluatorId);
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
