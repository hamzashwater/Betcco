using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class AcademicCatalogueTests
{
    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Authoring_mapping_publication_and_rubric_compatibility_are_enforced()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("academic_authoring");
        await using var db = database.CreateContext();
        Assert.False(db.Database.HasPendingModelChanges());
        var track = new LearningTrack { Slug = "academic", ArabicName = "مسار", EnglishName = "Track" };
        var grade = new Grade { Slug = "g", ArabicName = "صف", EnglishName = "Grade", LearningTrack = track };
        var specialization = new Specialization { Slug = "s", ArabicName = "تخصص", EnglishName = "Specialization", LearningTrack = track };
        var qualification = new Qualification { Code = "Q", ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion { Qualification = qualification, VersionCode = "V1", SourceReference = "Approved test reference" };
        var secondVersion = new QualificationVersion { Qualification = qualification, VersionCode = "V2", SourceReference = "Second test reference" };
        var rubric = new RubricTemplate { ArabicTitle = "روبرك", EnglishTitle = "Rubric" };
        rubric.Criteria.Add(new RubricCriterion { Code = "A.P1", ArabicDescription = "معيار", EnglishDescription = "Criterion" });
        var outside = new RubricCriterion { Code = "B.P1", ArabicDescription = "خارج", EnglishDescription = "Outside" };
        rubric.Criteria.Add(outside);
        db.AddRange(track, grade, specialization, qualification, version, secondVersion, rubric);
        await db.SaveChangesAsync();

        var service = new AcademicCatalogueService(db);
        var unitId = await service.SaveUnitAsync(null, new(version.Id, "U1", "وحدة", "Unit", "Approved unit source"), "admin", default);
        var otherUnitId = await service.SaveUnitAsync(null, new(secondVersion.Id, "U1", "وحدة أخرى", "Other Unit", "Approved other source"), "admin", default);
        var aimId = await service.SaveAimAsync(null, new(unitId, "A", "هدف", "Aim", "وصف", "Description", "Approved aim source", 1), "admin", default);
        var otherAimId = await service.SaveAimAsync(null, new(otherUnitId, "A", "هدف", "Aim", "وصف", "Description", "Approved aim source", 1), "admin", default);
        var criterionId = await service.SaveCriterionAsync(null, new(aimId, "A.P1", BtecCriterionBand.Pass, "وصف", "Description", "Approved criterion source", 1), "admin", default);
        await service.SaveCriterionAsync(null, new(aimId, "A.M1", BtecCriterionBand.Merit, "وصف", "Description", "Approved criterion source", 2), "admin", default);
        await service.SaveCriterionAsync(null, new(aimId, "A.D1", BtecCriterionBand.Distinction, "وصف", "Description", "Approved criterion source", 3), "admin", default);
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SaveCriterionAsync(null,
            new(Guid.NewGuid(), "A.P2", BtecCriterionBand.Pass, "وصف", "Description", "Source", 4), "admin", default));
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SaveCriterionAsync(null,
            new(aimId, "A.M1", (BtecCriterionBand)99, "وصف", "Description", "Source", 2), "admin", default));
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SaveCriterionAsync(null,
            new(aimId, "A.P1", BtecCriterionBand.Pass, "وصف", "Description", "Source", 2), "admin", default));
        var definitionId = await service.SaveDefinitionAsync(null, new(unitId, "ASSIGNMENT", 1, "تقييم", "Assessment", null), "admin", default);
        Assert.Contains("MissingCriteria", await service.ValidateDefinitionAsync(definitionId, default));
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SetMappingsAsync(definitionId, new([aimId, aimId], [criterionId]), "admin", default));
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SetMappingsAsync(definitionId, new([otherAimId], [criterionId]), "admin", default));
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SetMappingsAsync(definitionId, new([aimId, otherAimId], [criterionId]), "admin", default));
        await service.SetMappingsAsync(definitionId, new([aimId], [criterionId]), "admin", default);
        var wrongUnitMapping = new AssessmentDefinitionAim
        {
            AssessmentDefinitionId = definitionId,
            UnitDefinitionId = unitId,
            LearningAimDefinitionId = otherAimId
        };
        db.AssessmentDefinitionAims.Add(wrongUnitMapping);
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.Entry(wrongUnitMapping).State = EntityState.Detached;
        Assert.Contains("MissingSource", await service.ValidateDefinitionAsync(definitionId, default));
        await service.SaveDefinitionAsync(definitionId, new(unitId, "ASSIGNMENT", 1, "تقييم", "Assessment", "Approved assignment source"), "admin", default);
        version.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Contains("InactiveQualificationVersion", await service.ValidateDefinitionAsync(definitionId, default));
        version.IsActive = true;
        await db.SaveChangesAsync();
        Assert.Empty(await service.ValidateDefinitionAsync(definitionId, default));
        await service.PublishDefinitionAsync(definitionId, "admin", default);
        Assert.True((await db.AssessmentDefinitions.SingleAsync(x => x.Id == definitionId)).IsActive);
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SaveAimAsync(aimId,
            new(unitId, "A", "هدف", "Changed", "وصف", "Description", "Source", 1), "admin", default));

        var scopeId = await service.SaveScopeAsync(null, new(definitionId, grade.Id, specialization.Id, rubric.Id, 1), "admin", default);
        Assert.Contains("RubricMismatch", await service.ValidateScopeAsync(scopeId, default));
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.ActivateScopeAsync(scopeId, "admin", default));
        rubric.QualificationVersionId = secondVersion.Id;
        await db.SaveChangesAsync();
        Assert.Contains("RubricMismatch", await service.ValidateScopeAsync(scopeId, default));
        rubric.QualificationVersionId = version.Id;
        await db.SaveChangesAsync();
        Assert.Contains("RubricCriteriaMismatch", await service.ValidateScopeAsync(scopeId, default));
        db.RubricCriteria.Remove(outside);
        await db.SaveChangesAsync();
        Assert.Empty(await service.ValidateScopeAsync(scopeId, default));
        await service.ActivateScopeAsync(scopeId, "admin", default);
        Assert.True((await db.AssessmentScopes.SingleAsync(x => x.Id == scopeId)).IsActive);
        Assert.NotNull((await db.AssessmentScopes.SingleAsync(x => x.Id == scopeId)).PublishedAtUtc);
        await Assert.ThrowsAsync<AcademicCatalogueException>(() => service.SaveScopeAsync(scopeId,
            new(definitionId, grade.Id, specialization.Id, rubric.Id, 1), "admin", default));
    }

    [Theory]
    [InlineData(PlatformRoles.Student, false)]
    [InlineData(PlatformRoles.Teacher, false)]
    [InlineData(PlatformRoles.Admin, true)]
    public async Task Catalogue_policy_uses_admin_only_capability(string role, bool expected)
    {
        var policy = (AuthorizeAttribute)Attribute.GetCustomAttribute(typeof(AdminAcademicCatalogueController), typeof(AuthorizeAttribute))!;
        Assert.Equal("SystemAdmin", policy.Policy);
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, role)], "Test"));
        var context = new AuthorizationHandlerContext([new PlatformPermissionRequirement(PlatformPermissions.ManageUsers)], principal, null);
        await new PlatformPermissionAuthorizationHandler().HandleAsync(context);
        Assert.Equal(expected, context.HasSucceeded);
    }
}
