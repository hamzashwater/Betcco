using System.Security.Claims;
using Betcco.Api.Authorization;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class AssessmentCoordinationTests
{
    [Fact]
    public void Queue_uses_existing_reviewer_permission_without_granting_assessment_or_verification()
    {
        var policy = typeof(AssessmentCoordinationController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true)
            .Cast<AuthorizeAttribute>().Single().Policy;
        Assert.Equal("CourseReviewer", policy);

        static ClaimsPrincipal UserIn(string role) => new(new ClaimsIdentity(
            [new Claim(ClaimTypes.Role, role)], "test"));
        Assert.True(PlatformPermissionAuthorizationHandler.HasPermission(
            UserIn(PlatformRoles.CourseReviewer), PlatformPermissions.ReviewCourses));
        foreach (var role in new[] { PlatformRoles.Student, PlatformRoles.Assessor,
                     PlatformRoles.InternalVerifier, PlatformRoles.LeadInternalVerifier })
            Assert.False(PlatformPermissionAuthorizationHandler.HasPermission(
                UserIn(role), PlatformPermissions.ReviewCourses));
        Assert.False(PlatformPermissionAuthorizationHandler.HasPermission(
            UserIn(PlatformRoles.CourseReviewer), PlatformPermissions.Assess));
        Assert.False(PlatformPermissionAuthorizationHandler.HasPermission(
            UserIn(PlatformRoles.CourseReviewer), PlatformPermissions.VerifyAssessments));
    }

    [Fact]
    public async Task Queue_is_bounded_filters_states_and_preserves_legacy_and_retake_mapping()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var evaluatorId = Guid.NewGuid();
        var role = new IdentityRole<Guid> { Name = PlatformRoles.Assessor, NormalizedName = "ASSESSOR" };
        db.Roles.Add(role);
        db.Users.Add(new ApplicationUser
        {
            Id = evaluatorId,
            UserName = "assessor@example.test",
            DisplayName = "Assessor One"
        });
        db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = evaluatorId, RoleId = role.Id });
        var qualification = new Qualification
        { Code = "Q", EnglishName = "Qualification", ArabicName = "مؤهل" };
        var version = new QualificationVersion
        { Qualification = qualification, VersionCode = "V1", SourceReference = "test" };
        var unit = new UnitDefinition
        { QualificationVersion = version, Code = "U1", EnglishTitle = "Unit", ArabicTitle = "وحدة" };
        var definition = new AssessmentDefinition
        { UnitDefinition = unit, Code = "A1", EnglishTitle = "Assessment", ArabicTitle = "تقييم" };
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
        EvaluationRequest Request(EvaluationStatus status, AssessmentScope? academicScope = null) => new()
        {
            StudentUserId = "private-student",
            GradeId = gradeId,
            SpecializationId = specializationId,
            RubricTemplateId = rubricId,
            QualificationVersionId = version.Id,
            AssessmentScope = academicScope,
            Status = status,
            StudentComment = "private-comment"
        };
        var pending = Request(EvaluationStatus.PendingAssignment, scope);
        var assigned = Request(EvaluationStatus.Assigned, scope);
        var legacy = Request(EvaluationStatus.PendingAssignment);
        var completed = Request(EvaluationStatus.Completed, scope);
        var retake = Request(EvaluationStatus.PendingAssignment, scope);
        retake.RetakeOfEvaluationRequestId = completed.Id;
        db.EvaluationRequests.AddRange(pending, assigned, legacy, completed, retake);
        db.EvaluatorUnitSpecialisms.Add(new EvaluatorUnitSpecialism
        { EvaluatorUserId = evaluatorId, UnitDefinitionId = unit.Id, GrantedByUserId = evaluatorId });
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = assigned.Id,
            EvaluatorUserId = evaluatorId.ToString(),
            AssignedByUserId = "reviewer"
        });
        await db.SaveChangesAsync();

        var controller = new AssessmentCoordinationController(db, new EvaluatorSpecialismService(db, null!));
        Assert.IsType<BadRequestObjectResult>((await controller.Queue(page: 0)).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.Queue(pageSize: 51)).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.Queue(status: "Completed")).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.Queue(status: "2")).Result);

        var all = Assert.IsType<AssessmentCoordinationPage>(
            Assert.IsType<OkObjectResult>((await controller.Queue(pageSize: 10)).Result).Value);
        Assert.Equal(4, all.TotalCount);
        Assert.DoesNotContain(all.Items, item => item.Id == completed.Id);
        Assert.Contains(all.Items, item => item.Id == pending.Id && item.HasEligibleEvaluator == true
            && item.UnitCode == "U1" && item.QualificationCode == "Q");
        Assert.Contains(all.Items, item => item.Id == assigned.Id && item.EvaluatorDisplayName == "Assessor One");
        Assert.Contains(all.Items, item => item.Id == legacy.Id
            && item.BlockerCode == "AcademicMappingRequired" && item.UnitCode is null);
        Assert.Contains(all.Items, item => item.Id == retake.Id && item.IsRetake
            && item.HasEligibleEvaluator == true);
        Assert.DoesNotContain(typeof(AssessmentCoordinationItem).GetProperties(), property =>
            property.Name.Contains("Student", StringComparison.OrdinalIgnoreCase)
            || property.Name.Contains("Comment", StringComparison.OrdinalIgnoreCase));

        var page = Assert.IsType<AssessmentCoordinationPage>(
            Assert.IsType<OkObjectResult>((await controller.Queue(
                status: "PendingAssignment", page: 2, pageSize: 1)).Result).Value);
        Assert.Equal(3, page.TotalCount);
        Assert.Single(page.Items);
        Assert.Equal("PendingAssignment", page.Items[0].Status);

        var grant = await db.EvaluatorUnitSpecialisms.SingleAsync();
        grant.RevokedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        var afterRevocation = Assert.IsType<AssessmentCoordinationPage>(
            Assert.IsType<OkObjectResult>((await controller.Queue(pageSize: 10)).Result).Value);
        Assert.Contains(afterRevocation.Items, item => item.Id == pending.Id
            && item.BlockerCode == "NoEligibleEvaluator");
        Assert.Contains(afterRevocation.Items, item => item.Id == assigned.Id
            && item.EvaluatorDisplayName == "Assessor One");
    }
}
