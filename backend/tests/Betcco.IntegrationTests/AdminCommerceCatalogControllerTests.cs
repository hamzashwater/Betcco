using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class AdminCommerceCatalogControllerTests
{
    [Fact]
    public async Task Invalid_membership_plan_slug_is_rejected_without_persistence()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course
        {
            Slug = "published-course",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            Status = CourseStatus.Published
        };
        db.AddRange(track, course);
        await db.SaveChangesAsync();
        var controller = new AdminCommerceCatalogController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "admin")], "test"))
                }
            }
        };

        var result = await controller.CreateMembership(new UpsertMembershipPlanRequest(
            "invalid-membership\n", "اشتراك", "Membership", "وصف", "Description",
            ["ميزة"], ["Feature"], 20m, BillingInterval.Monthly, false, [course.Id]), CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.False(await db.MembershipPlans.AnyAsync());
        Assert.False(await db.AuditLogs.AnyAsync());
    }
}
