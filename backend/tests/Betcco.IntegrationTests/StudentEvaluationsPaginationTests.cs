using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class StudentEvaluationsPaginationTests
{
    [Fact]
    public async Task Default_page_is_bounded_to_the_owner_and_has_stable_order_and_count()
    {
        await using var db = NewContext();
        var start = DateTimeOffset.UtcNow.AddDays(-1);
        var owned = Enumerable.Range(0, 23)
            .Select(index => NewRequest("student", start.AddMinutes(index))).ToArray();
        var other = NewRequest("other-student", start.AddDays(1));
        db.EvaluationRequests.AddRange(owned);
        db.EvaluationRequests.Add(other);
        await db.SaveChangesAsync();
        for (var index = 0; index < owned.Length; index++)
            owned[index].CreatedAtUtc = start.AddMinutes(index);
        other.CreatedAtUtc = start.AddDays(1);
        await db.SaveChangesAsync();

        var page = Page(await ControllerFor(db, "student").Mine());

        Assert.Equal(1, page.Page);
        Assert.Equal(20, page.PageSize);
        Assert.Equal(23, page.TotalCount);
        Assert.True(page.HasNextPage);
        Assert.Equal(owned.Reverse().Take(20).Select(item => item.Id), page.Items.Select(item => item.Id));
        Assert.DoesNotContain(page.Items, item => item.Id == other.Id);

        var tiedAt = start.AddDays(2);
        var lower = NewRequest("student", tiedAt, Guid.Parse("00000000-0000-0000-0000-000000000001"));
        var higher = NewRequest("student", tiedAt, Guid.Parse("00000000-0000-0000-0000-000000000002"));
        db.EvaluationRequests.AddRange(lower, higher);
        await db.SaveChangesAsync();
        lower.CreatedAtUtc = tiedAt;
        higher.CreatedAtUtc = tiedAt;
        await db.SaveChangesAsync();
        var tiedPage = Page(await ControllerFor(db, "student").Mine(1, 2));
        Assert.Equal(new[] { higher.Id, lower.Id }, tiedPage.Items.Select(item => item.Id));
    }

    [Fact]
    public async Task Requested_page_contains_only_its_own_nested_data_and_out_of_range_is_empty()
    {
        await using var db = NewContext();
        var start = DateTimeOffset.UtcNow.AddDays(-1);
        var owned = Enumerable.Range(0, 6)
            .Select(index => NewRequest("student", start.AddMinutes(index), status: EvaluationStatus.Completed)).ToArray();
        var other = NewRequest("other-student", start.AddDays(1), status: EvaluationStatus.Completed);
        db.EvaluationRequests.AddRange([.. owned, other]);
        foreach (var request in owned.Append(other))
        {
            db.EvaluationEvidenceItems.Add(new EvaluationEvidence
            {
                EvaluationRequestId = request.Id,
                CriterionCode = "A.P1",
                Narrative = $"evidence-{request.Id}"
            });
            db.EvaluationFeedbackItems.Add(new EvaluationFeedback
            {
                EvaluationRequestId = request.Id,
                AuthorUserId = "teacher",
                Body = $"feedback-{request.Id}"
            });
            db.CriterionResults.Add(new CriterionResult
            {
                EvaluationRequestId = request.Id,
                CriterionCode = "A.P1",
                Achievement = CriterionAchievement.Achieved,
                Evidence = $"result-{request.Id}"
            });
        }
        await db.SaveChangesAsync();
        for (var index = 0; index < owned.Length; index++)
            owned[index].CreatedAtUtc = start.AddMinutes(index);
        other.CreatedAtUtc = start.AddDays(1);
        await db.SaveChangesAsync();

        var page = Page(await ControllerFor(db, "student").Mine(2, 2));
        Assert.Equal(6, page.TotalCount);
        Assert.Equal(2, page.Page);
        Assert.Equal(2, page.PageSize);
        Assert.True(page.HasNextPage);
        Assert.Equal(new[] { owned[3].Id, owned[2].Id }, page.Items.Select(item => item.Id));
        Assert.All(page.Items, item =>
        {
            Assert.Equal($"evidence-{item.Id}", Assert.Single(item.Evidence).Narrative);
            Assert.Equal($"feedback-{item.Id}", Assert.Single(item.Feedback).Body);
            Assert.Equal($"result-{item.Id}", Assert.Single(item.Results).Evidence);
        });

        var outOfRange = Page(await ControllerFor(db, "student").Mine(4, 2));
        Assert.Empty(outOfRange.Items);
        Assert.Equal(6, outOfRange.TotalCount);
        Assert.Equal(4, outOfRange.Page);
        Assert.Equal(2, outOfRange.PageSize);
        Assert.False(outOfRange.HasNextPage);
        var extreme = Page(await ControllerFor(db, "student").Mine(int.MaxValue, 50));
        Assert.Empty(extreme.Items);
        Assert.Equal(6, extreme.TotalCount);
    }

    [Fact]
    public async Task Bounds_are_enforced_and_fifty_is_the_maximum_page_size()
    {
        await using var db = NewContext();
        var start = DateTimeOffset.UtcNow.AddDays(-1);
        db.EvaluationRequests.AddRange(Enumerable.Range(0, 51)
            .Select(index => NewRequest("student", start.AddMinutes(index))));
        await db.SaveChangesAsync();
        var controller = ControllerFor(db, "student");

        Assert.IsType<BadRequestObjectResult>(await controller.Mine(0, 20));
        Assert.IsType<BadRequestObjectResult>(await controller.Mine(1, 0));
        Assert.IsType<BadRequestObjectResult>(await controller.Mine(1, 51));
        var first = Page(await controller.Mine(1, 50));
        Assert.Equal(50, first.Items.Count);
        Assert.Equal(51, first.TotalCount);
        Assert.True(first.HasNextPage);
        var second = Page(await controller.Mine(2, 50));
        Assert.Single(second.Items);
        Assert.False(second.HasNextPage);
    }

    [Fact]
    public async Task Result_visibility_and_effective_revision_deadline_match_the_existing_contract()
    {
        await using var db = NewContext();
        var start = DateTimeOffset.UtcNow.AddDays(-1);
        var assigned = NewRequest("student", start);
        var revision = NewRequest("student", start.AddMinutes(1), status: EvaluationStatus.NeedsRevision);
        var baseDue = start.AddDays(2);
        revision.Price = 5;
        revision.Currency = "JOD";
        revision.StudentComment = "Please review this assignment.";
        revision.SubmissionAttemptNumber = 1;
        revision.RevisionDueAtUtc = baseDue;
        revision.CalculatedGrade = EvaluationGrade.Pass;
        revision.SectionResultsJson = "[{\"Section\":\"A\",\"Grade\":\"Pass\"}]";
        revision.CriteriaSnapshotJson = "[\"A.P1\"]";
        revision.EvaluatorCriteriaPlanJson = "[\"A.P1\"]";
        revision.AssessmentScopeSnapshotJson = JsonSerializer.Serialize(new AssessmentScopeSnapshot(
            AssessmentScopeSnapshot.Version,
            new QualificationAcademicSnapshot("Q", "مؤهل", "Qualification", "V1", "source", start, null),
            new UnitAcademicSnapshot("U1", "وحدة", "Unit", null),
            new AssessmentDefinitionAcademicSnapshot("A", 1, "تقييم", "Assessment", null, null),
            new ScopeAcademicSnapshot(1, null, "G", "صف", "Grade", "S", "تخصص", "Specialization"),
            [new AimAcademicSnapshot("A", "هدف", "Aim", "وصف", "Description", "source", 1)],
            [new CriterionAcademicSnapshot("A.P1", "Pass", "A", "معيار", "Criterion", "source", 1)],
            new RubricAcademicSnapshot("تقييم", "Assessment", 1, "v1", ["A.P1"])));
        assigned.CalculatedGrade = EvaluationGrade.Merit;
        assigned.SectionResultsJson = revision.SectionResultsJson;
        db.EvaluationRequests.AddRange(assigned, revision);
        foreach (var request in new[] { assigned, revision })
            db.CriterionResults.Add(new CriterionResult
            {
                EvaluationRequestId = request.Id,
                CriterionCode = "A.P1",
                Achievement = CriterionAchievement.Achieved
            });
        db.EvaluationRevisionDeadlineAdjustments.AddRange(
            Adjustment(revision.Id, baseDue, baseDue.AddDays(1), start.AddHours(1)),
            Adjustment(revision.Id, baseDue, baseDue.AddDays(3), start.AddHours(2), revoked: true),
            Adjustment(revision.Id, baseDue, baseDue.AddDays(2), start.AddHours(3)));
        await db.SaveChangesAsync();

        var page = Page(await ControllerFor(db, "student").Mine());
        var visible = page.Items.Single(item => item.Id == revision.Id);
        Assert.Equal("Pass", visible.CalculatedGrade);
        Assert.Equal("Pass", Assert.Single(visible.SectionResults).Grade);
        Assert.Equal("A.P1", Assert.Single(visible.Results).CriterionCode);
        Assert.Equal(baseDue.AddDays(2), visible.EffectiveRevisionDueAtUtc);
        Assert.Equal(baseDue, visible.RevisionDueAtUtc);
        Assert.Equal("Please review this assignment.", visible.StudentComment);
        Assert.Equal("U1", visible.Academic?.UnitCode);
        Assert.Equal(new[] { "A.P1" }, visible.Criteria);
        Assert.Equal(new[] { "A.P1" }, visible.SelectedCriteria);
        Assert.False(visible.IsRetake);
        Assert.Null(visible.RetakeOfEvaluationRequestId);
        var hidden = page.Items.Single(item => item.Id == assigned.Id);
        Assert.Null(hidden.CalculatedGrade);
        Assert.Empty(hidden.SectionResults);
        Assert.Empty(hidden.Results);
    }

    private static EvaluationRevisionDeadlineAdjustment Adjustment(Guid requestId, DateTimeOffset baseDue,
        DateTimeOffset extendedDue, DateTimeOffset grantedAt, bool revoked = false) => new()
        {
            EvaluationRequestId = requestId,
            BaseDueAtUtcSnapshot = baseDue,
            ExtendedDueAtUtc = extendedDue,
            GrantedAtUtc = grantedAt,
            GrantedByUserId = Guid.NewGuid(),
            Reason = "Documented adjustment",
            RevokedAtUtc = revoked ? grantedAt.AddMinutes(1) : null
        };

    private static EvaluationRequest NewRequest(string student, DateTimeOffset createdAt, Guid? id = null,
        EvaluationStatus status = EvaluationStatus.Draft) => new()
        {
            Id = id ?? Guid.NewGuid(),
            StudentUserId = student,
            Status = status,
            CreatedAtUtc = createdAt,
            GradeId = Guid.NewGuid(),
            SpecializationId = Guid.NewGuid(),
            TaskTypeId = Guid.NewGuid(),
            RubricTemplateId = Guid.NewGuid()
        };

    private static BetccoDbContext NewContext() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static EvaluationsController ControllerFor(BetccoDbContext db, string student)
    {
        var controller = new EvaluationsController(null!, null!, null!, db, null!, null!)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, student), new Claim(ClaimTypes.Role, "Student")], "test"));
        return controller;
    }

    private static StudentEvaluationPage Page(IActionResult result) =>
        Assert.IsType<StudentEvaluationPage>(Assert.IsType<OkObjectResult>(result).Value);
}
