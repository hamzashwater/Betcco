using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class TeacherTaxonomyControllerTests
{
    [Fact]
    public async Task Teacher_can_propose_a_subject_for_the_selected_specialization()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var track = new LearningTrack { Slug = "btec", ArabicName = "BTEC", EnglishName = "BTEC" };
        var specialization = new Specialization
        {
            Slug = "it",
            ArabicName = "تكنولوجيا المعلومات",
            EnglishName = "Information Technology",
            LearningTrack = track
        };
        db.AddRange(track, specialization);
        await db.SaveChangesAsync();
        var controller = new TeacherTaxonomyController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, "teacher-1"), new Claim(ClaimTypes.Role, "Teacher")],
                        "Test"))
                }
            }
        };

        var result = await controller.CreateSubject(
            new CreateTeacherSubjectRequest(specialization.Id, "الأمن السيبراني", "Cybersecurity"),
            CancellationToken.None);

        Assert.IsType<CreatedResult>(result);
        var subject = await db.Subjects.SingleAsync();
        Assert.Equal("teacher-1", subject.CreatedByUserId);
        Assert.Equal(specialization.Id, subject.SpecializationId);
        Assert.False(subject.IsVisible);
        Assert.Contains(db.AuditLogs, item => item.Action == "TeacherSubjectProposed" && item.EntityId == subject.Id.ToString());
    }
}
