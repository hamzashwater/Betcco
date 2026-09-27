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

    [Fact]
    public async Task Mine_links_only_owned_resits_and_keeps_their_results_separate()
    {
        await using var db = NewContext();
        var now = DateTimeOffset.UtcNow;
        var original = NewRequest("student", now, status: EvaluationStatus.Completed);
        var resit = NewRequest("student", now.AddMinutes(1), status: EvaluationStatus.Completed);
        var otherOriginal = NewRequest("other-student", now.AddMinutes(2));
        var otherResit = NewRequest("other-student", now.AddMinutes(3));
        var normal = NewRequest("student", now.AddMinutes(4));
        var retake = NewRequest("student", now.AddMinutes(5));
        retake.RetakeOfEvaluationRequestId = normal.Id;
        original.CalculatedGrade = EvaluationGrade.NotYetAchieved;
        original.SectionResultsJson = "[{\"Section\":\"Original\",\"Grade\":\"NotYetAchieved\"}]";
        resit.CalculatedGrade = EvaluationGrade.Pass;
        resit.SectionResultsJson = "[{\"Section\":\"Resit\",\"Grade\":\"Pass\"}]";
        db.EvaluationRequests.AddRange(original, resit, otherOriginal, otherResit, normal, retake);
        db.ResitAuthorizations.AddRange(
            Link(original, resit), Link(otherOriginal, otherResit));
        foreach (var request in new[] { original, resit })
        {
            db.CriterionResults.Add(new CriterionResult
            {
                EvaluationRequestId = request.Id,
                CriterionCode = "A.P1",
                Achievement = CriterionAchievement.Achieved,
                Evidence = $"result-{request.Id}",
                Comment = $"comment-{request.Id}"
            });
            db.EvaluationFeedbackItems.Add(new EvaluationFeedback
            {
                EvaluationRequestId = request.Id,
                AuthorUserId = "teacher",
                Body = $"feedback-{request.Id}"
            });
        }
        await db.SaveChangesAsync();
        foreach (var (request, index) in new[] { original, resit, otherOriginal, otherResit, normal, retake }
            .Select((request, index) => (request, index)))
            request.CreatedAtUtc = now.AddMinutes(index);
        await db.SaveChangesAsync();

        var page = Page(await ControllerFor(db, "student").Mine(1, 2));
        Assert.Equal(4, page.TotalCount);
        Assert.True(page.HasNextPage);
        Assert.Equal(new[] { retake.Id, normal.Id }, page.Items.Select(item => item.Id));
        var all = Page(await ControllerFor(db, "student").Mine(1, 50));
        Assert.Equal(new[] { retake.Id, normal.Id, resit.Id, original.Id }, all.Items.Select(item => item.Id));
        Assert.All(all.Items, item => Assert.DoesNotContain(item.Id, new[] { otherOriginal.Id, otherResit.Id }));
        Assert.False(all.Items.Single(item => item.Id == normal.Id).IsResit);
        Assert.Null(all.Items.Single(item => item.Id == normal.Id).ResitOfEvaluationRequestId);
        Assert.True(all.Items.Single(item => item.Id == retake.Id).IsRetake);
        Assert.Equal(normal.Id, all.Items.Single(item => item.Id == retake.Id).RetakeOfEvaluationRequestId);
        Assert.False(all.Items.Single(item => item.Id == retake.Id).IsResit);
        Assert.Null(all.Items.Single(item => item.Id == retake.Id).ResitOfEvaluationRequestId);

        var originalItem = all.Items.Single(item => item.Id == original.Id);
        var resitItem = all.Items.Single(item => item.Id == resit.Id);
        Assert.NotEqual(originalItem.Id, resitItem.Id);
        Assert.False(originalItem.IsResit);
        Assert.Null(originalItem.ResitOfEvaluationRequestId);
        Assert.False(resitItem.IsRetake);
        Assert.Null(resitItem.RetakeOfEvaluationRequestId);
        Assert.True(resitItem.IsResit);
        Assert.Equal(original.Id, resitItem.ResitOfEvaluationRequestId);
        Assert.Equal("NotYetAchieved", originalItem.CalculatedGrade);
        Assert.Equal("Pass", resitItem.CalculatedGrade);
        Assert.Equal("Original", Assert.Single(originalItem.SectionResults).Section);
        Assert.Equal("Resit", Assert.Single(resitItem.SectionResults).Section);
        foreach (var item in new[] { originalItem, resitItem })
        {
            Assert.Equal($"result-{item.Id}", Assert.Single(item.Results).Evidence);
            Assert.Equal($"comment-{item.Id}", Assert.Single(item.Results).Comment);
            Assert.Equal($"feedback-{item.Id}", Assert.Single(item.Feedback).Body);
        }
        var serialized = JsonSerializer.Serialize(all, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.DoesNotContain("private staff rationale", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("authorizedByUserId", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("revocationReason", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("revokedByUserId", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(otherOriginal.Id.ToString(), serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Linked_resit_identity_is_visible_before_completion_but_result_is_hidden()
    {
        await using var db = NewContext();
        var original = NewRequest("student", DateTimeOffset.UtcNow);
        var resit = NewRequest("student", DateTimeOffset.UtcNow.AddMinutes(1), status: EvaluationStatus.UnderReview);
        resit.CalculatedGrade = EvaluationGrade.Pass;
        resit.SectionResultsJson = "[{\"Section\":\"A\",\"Grade\":\"Pass\"}]";
        db.EvaluationRequests.AddRange(original, resit);
        db.ResitAuthorizations.Add(Link(original, resit));
        db.CriterionResults.Add(new CriterionResult
        {
            EvaluationRequestId = resit.Id,
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.Achieved
        });
        await db.SaveChangesAsync();

        var item = Page(await ControllerFor(db, "student").Mine()).Items.Single(x => x.Id == resit.Id);
        Assert.True(item.IsResit);
        Assert.Equal(original.Id, item.ResitOfEvaluationRequestId);
        Assert.Null(item.CalculatedGrade);
        Assert.Empty(item.SectionResults);
        Assert.Empty(item.Results);
        var detail = DetailJson(await ControllerFor(db, "student").Get(resit.Id, default));
        Assert.True(detail.GetProperty("isResit").GetBoolean());
        Assert.Equal(original.Id, detail.GetProperty("resitOfEvaluationRequestId").GetGuid());
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("calculatedGrade").ValueKind);
        Assert.Empty(detail.GetProperty("sectionResults").EnumerateArray());
        Assert.Empty(detail.GetProperty("results").EnumerateArray());
    }

    [Fact]
    public async Task Detail_links_the_owner_and_assigned_assessor_and_preserves_existing_access_rules()
    {
        await using var db = NewContext();
        var original = NewRequest("student", DateTimeOffset.UtcNow, status: EvaluationStatus.Completed);
        var resit = NewRequest("student", DateTimeOffset.UtcNow.AddMinutes(1), status: EvaluationStatus.Completed);
        original.CalculatedGrade = EvaluationGrade.NotYetAchieved;
        resit.CalculatedGrade = EvaluationGrade.Pass;
        db.EvaluationRequests.AddRange(original, resit);
        db.ResitAuthorizations.Add(Link(original, resit));
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = resit.Id,
            EvaluatorUserId = "assessor",
            AssignedByUserId = "coordinator"
        });
        await db.SaveChangesAsync();

        var owner = ControllerFor(db, "student");
        var resitJson = DetailJson(await owner.Get(resit.Id, default));
        Assert.True(resitJson.GetProperty("isResit").GetBoolean());
        Assert.Equal(original.Id, resitJson.GetProperty("resitOfEvaluationRequestId").GetGuid());
        Assert.Equal("Pass", resitJson.GetProperty("calculatedGrade").GetString());
        var originalJson = DetailJson(await owner.Get(original.Id, default));
        Assert.False(originalJson.GetProperty("isResit").GetBoolean());
        Assert.Equal(JsonValueKind.Null, originalJson.GetProperty("resitOfEvaluationRequestId").ValueKind);
        Assert.Equal("NotYetAchieved", originalJson.GetProperty("calculatedGrade").GetString());
        Assert.IsType<NotFoundResult>(await ControllerFor(db, "other-student").Get(resit.Id, default));

        var assessor = ControllerFor(db, "assessor", "Assessor");
        var staffJson = DetailJson(await assessor.Get(resit.Id, default));
        Assert.True(staffJson.GetProperty("isResit").GetBoolean());
        Assert.Equal(original.Id, staffJson.GetProperty("resitOfEvaluationRequestId").GetGuid());
        Assert.IsType<NotFoundResult>(await ControllerFor(db, "unassigned", "Assessor").Get(resit.Id, default));
        foreach (var json in new[] { resitJson, originalJson, staffJson })
        {
            var text = json.GetRawText();
            Assert.DoesNotContain("Private staff rationale", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("authorizedByUserId", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("revocationReason", text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Staff_lists_identify_linked_resit_without_private_authorization_fields()
    {
        await using var db = NewContext();
        var original = NewRequest("student", DateTimeOffset.UtcNow, status: EvaluationStatus.Completed);
        var resit = NewRequest("student", DateTimeOffset.UtcNow.AddMinutes(1),
            status: EvaluationStatus.PendingAssignment);
        var normal = NewRequest("student", DateTimeOffset.UtcNow.AddMinutes(2),
            status: EvaluationStatus.PendingAssignment);
        db.EvaluationRequests.AddRange(original, resit, normal);
        db.ResitAuthorizations.Add(Link(original, resit));
        await db.SaveChangesAsync();

        var pending = JsonSerializer.SerializeToElement(
            Assert.IsType<OkObjectResult>(await ControllerFor(db, "reviewer", "CourseReviewer")
                .PendingAssignment(default)).Value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var pendingResit = pending.EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == resit.Id);
        var pendingNormal = pending.EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == normal.Id);
        Assert.True(pendingResit.GetProperty("isResit").GetBoolean());
        Assert.Equal(original.Id, pendingResit.GetProperty("resitOfEvaluationRequestId").GetGuid());
        Assert.False(pendingNormal.GetProperty("isResit").GetBoolean());
        Assert.Equal(JsonValueKind.Null, pendingNormal.GetProperty("resitOfEvaluationRequestId").ValueKind);

        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = resit.Id,
            EvaluatorUserId = "assessor",
            AssignedByUserId = "reviewer"
        });
        resit.Status = EvaluationStatus.Assigned;
        await db.SaveChangesAsync();
        var assigned = JsonSerializer.SerializeToElement(
            Assert.IsType<OkObjectResult>(await ControllerFor(db, "assessor", "Assessor")
                .Assigned(default)).Value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var assignedResit = Assert.Single(assigned.EnumerateArray());
        Assert.True(assignedResit.GetProperty("isResit").GetBoolean());
        Assert.Equal(original.Id, assignedResit.GetProperty("resitOfEvaluationRequestId").GetGuid());
        foreach (var json in new[] { pending, assigned })
        {
            var serialized = json.GetRawText();
            Assert.DoesNotContain("Private staff rationale", serialized, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("authorizedByUserId", serialized, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("revocationReason", serialized, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static ResitAuthorization Link(EvaluationRequest original, EvaluationRequest resit) => new()
    {
        OriginalEvaluationRequestId = original.Id,
        ResitEvaluationRequestId = resit.Id,
        AuthorizedByUserId = Guid.NewGuid(),
        AuthorizedAtUtc = DateTimeOffset.UtcNow,
        ActivatedAtUtc = DateTimeOffset.UtcNow,
        Reason = "Private staff rationale"
    };

    private static JsonElement DetailJson(IActionResult result) => JsonSerializer.SerializeToElement(
        Assert.IsType<OkObjectResult>(result).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

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

    private static EvaluationsController ControllerFor(BetccoDbContext db, string student, string role = "Student")
    {
        var controller = new EvaluationsController(null!, null!, null!, db, null!, null!)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, student), new Claim(ClaimTypes.Role, role)], "test"));
        return controller;
    }

    private static StudentEvaluationPage Page(IActionResult result) =>
        Assert.IsType<StudentEvaluationPage>(Assert.IsType<OkObjectResult>(result).Value);
}
