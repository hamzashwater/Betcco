using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Identity;
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
