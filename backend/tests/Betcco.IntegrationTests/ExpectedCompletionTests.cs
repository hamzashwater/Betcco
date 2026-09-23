using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class ExpectedCompletionTests
{
    [Fact]
    public void State_boundary_is_on_track_until_the_target_passes()
    {
        var target = new DateTimeOffset(2030, 1, 1, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal(ExpectedCompletionStates.NotSet, ExpectedCompletionStates.Resolve(null, target));
        Assert.Equal(ExpectedCompletionStates.OnTrack, ExpectedCompletionStates.Resolve(target, target));
        Assert.Equal(ExpectedCompletionStates.Overdue,
            ExpectedCompletionStates.Resolve(target, target.AddTicks(1)));
    }

    [Fact]
    [Trait("Category", "PostgreSQLFinance")]
    public async Task Postgres_migration_and_filtered_queue_match_the_model()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("expected_completion");
        await using var db = database.CreateContext();
        Assert.False(db.Database.HasPendingModelChanges());
        var actor = new ApplicationUser { UserName = "reviewer@test.example", DisplayName = "Reviewer" };
        var request = Request(EvaluationStatus.Assigned);
        db.Users.Add(actor);
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();
        var service = Service(db);
        Assert.Equal(ExpectedCompletionWriteResult.Success,
            await service.SetExpectedCompletionAsync(request.Id, DateTimeOffset.UtcNow.AddDays(1),
                "Operational target", actor.Id));
        var onTrack = await service.QueueAsync(null, 1, 10,
            expectedCompletionState: ExpectedCompletionStates.OnTrack);
        Assert.Equal(request.Id, Assert.Single(onTrack.Items).Id);
        Assert.Equal(1, onTrack.TotalCount);
        var overdue = await service.QueueAsync(null, 1, 10,
            expectedCompletionState: ExpectedCompletionStates.Overdue);
        Assert.Empty(overdue.Items);
        Assert.Equal(0, overdue.TotalCount);
        Assert.Single(await db.EvaluationExpectedCompletionRevisions.ToListAsync());
    }

    [Fact]
    public async Task Set_revision_preserves_history_and_retake_is_independent()
    {
        await using var db = NewDb();
        var actor = new ApplicationUser { UserName = "reviewer@test.example", DisplayName = "Reviewer" };
        var original = Request(EvaluationStatus.Assigned);
        var retake = Request(EvaluationStatus.PendingAssignment);
        retake.RetakeOfEvaluationRequestId = original.Id;
        db.Users.Add(actor);
        db.EvaluationRequests.AddRange(original, retake);
        await db.SaveChangesAsync();
        var service = Service(db);
        var first = DateTimeOffset.UtcNow.AddDays(2);
        var second = DateTimeOffset.UtcNow.AddDays(3);

        Assert.Equal(ExpectedCompletionWriteResult.Success,
            await service.SetExpectedCompletionAsync(original.Id, first, "Initial coordination target", actor.Id));
        Assert.Equal(ExpectedCompletionWriteResult.Success,
            await service.SetExpectedCompletionAsync(original.Id, second, "Revised after review", actor.Id));
        var history = await db.EvaluationExpectedCompletionRevisions.AsNoTracking()
            .Where(item => item.EvaluationRequestId == original.Id)
            .OrderBy(item => item.RevisionNumber).ToListAsync();
        Assert.Equal([1, 2], history.Select(item => item.RevisionNumber));
        Assert.Equal([first, second], history.Select(item => item.ExpectedCompletionAtUtc));
        Assert.All(history, item => Assert.Equal(actor.Id, item.RecordedByUserId));
        Assert.Equal(2, await db.AuditLogs.CountAsync(item => item.EntityId == original.Id.ToString()
            && item.Action == "EvaluationExpectedCompletionSet"));
        var page = await service.QueueAsync(null, 1, 10);
        Assert.Contains(page.Items, item => item.Id == original.Id
            && item.ExpectedCompletionAtUtc == second && item.ExpectedCompletionState == ExpectedCompletionStates.OnTrack);
        Assert.Contains(page.Items, item => item.Id == retake.Id && item.IsRetake
            && item.ExpectedCompletionAtUtc == null && item.ExpectedCompletionState == ExpectedCompletionStates.NotSet);
        Assert.DoesNotContain(typeof(AssessmentCoordinationItem).GetProperties(), property =>
            property.Name.Contains("Reason", StringComparison.OrdinalIgnoreCase)
            || property.Name.Contains("Student", StringComparison.OrdinalIgnoreCase)
            || property.Name.Contains("Evidence", StringComparison.OrdinalIgnoreCase)
            || property.Name.Contains("Grade", StringComparison.OrdinalIgnoreCase));
        var trackedRevision = db.EvaluationExpectedCompletionRevisions.Local.Single(item => item.Id == history[0].Id);
        trackedRevision.Reason = "tamper";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Mutation_rejects_inactive_invalid_target_reason_and_actor()
    {
        await using var db = NewDb();
        var actor = new ApplicationUser { UserName = "reviewer@test.example", DisplayName = "Reviewer" };
        var active = Request(EvaluationStatus.NeedsRevision);
        var completed = Request(EvaluationStatus.Completed);
        db.Users.Add(actor);
        db.EvaluationRequests.AddRange(active, completed);
        await db.SaveChangesAsync();
        var service = Service(db);
        var future = DateTimeOffset.UtcNow.AddDays(1);
        Assert.Equal(ExpectedCompletionWriteResult.RequestNotFound,
            await service.SetExpectedCompletionAsync(Guid.NewGuid(), future, "reason", actor.Id));
        Assert.Equal(ExpectedCompletionWriteResult.RequestNotActive,
            await service.SetExpectedCompletionAsync(completed.Id, future, "reason", actor.Id));
        Assert.Equal(ExpectedCompletionWriteResult.InvalidTarget,
            await service.SetExpectedCompletionAsync(active.Id, DateTimeOffset.UtcNow.AddSeconds(-1), "reason", actor.Id));
        Assert.Equal(ExpectedCompletionWriteResult.InvalidTarget,
            await service.SetExpectedCompletionAsync(active.Id, future.ToOffset(TimeSpan.FromHours(3)), "reason", actor.Id));
        Assert.Equal(ExpectedCompletionWriteResult.InvalidReason,
            await service.SetExpectedCompletionAsync(active.Id, future, " ", actor.Id));
        Assert.Equal(ExpectedCompletionWriteResult.InvalidReason,
            await service.SetExpectedCompletionAsync(active.Id, future, new string('x', 501), actor.Id));
        Assert.Equal(ExpectedCompletionWriteResult.InvalidActor,
            await service.SetExpectedCompletionAsync(active.Id, future, "reason", Guid.NewGuid()));
        Assert.Empty(db.EvaluationExpectedCompletionRevisions);
    }

    [Fact]
    public async Task Queue_filters_expected_completion_before_paging()
    {
        await using var db = NewDb();
        var notSet = Request(EvaluationStatus.Assigned);
        var onTrack = Request(EvaluationStatus.UnderReview);
        var overdue = Request(EvaluationStatus.NeedsRevision);
        db.EvaluationRequests.AddRange(notSet, onTrack, overdue);
        db.EvaluationExpectedCompletionRevisions.AddRange(
            new EvaluationExpectedCompletionRevision
            {
                EvaluationRequestId = onTrack.Id,
                RevisionNumber = 1,
                ExpectedCompletionAtUtc = DateTimeOffset.UtcNow.AddDays(1),
                RecordedAtUtc = DateTimeOffset.UtcNow,
                Reason = "test",
                RecordedByUserId = Guid.NewGuid()
            },
            new EvaluationExpectedCompletionRevision
            {
                EvaluationRequestId = overdue.Id,
                RevisionNumber = 1,
                ExpectedCompletionAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
                RecordedAtUtc = DateTimeOffset.UtcNow,
                Reason = "test",
                RecordedByUserId = Guid.NewGuid()
            });
        await db.SaveChangesAsync();
        var service = Service(db);
        foreach (var (state, id) in new[] {
            (ExpectedCompletionStates.NotSet, notSet.Id),
            (ExpectedCompletionStates.OnTrack, onTrack.Id),
            (ExpectedCompletionStates.Overdue, overdue.Id) })
        {
            var page = await service.QueueAsync(null, 1, 1, expectedCompletionState: state);
            Assert.Equal(1, page.TotalCount);
            Assert.Equal(id, Assert.Single(page.Items).Id);
            Assert.Equal(state, page.Items[0].ExpectedCompletionState);
        }
    }

    [Fact]
    public async Task Controller_uses_server_identity_and_validates_filter()
    {
        await using var db = NewDb();
        var actor = new ApplicationUser { UserName = "reviewer@test.example", DisplayName = "Reviewer" };
        var request = Request(EvaluationStatus.PendingAssignment);
        db.Users.Add(actor);
        db.EvaluationRequests.Add(request);
        await db.SaveChangesAsync();
        var controller = new AssessmentCoordinationController(Service(db));
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        Assert.IsType<UnauthorizedResult>((await controller.SetExpectedCompletion(request.Id,
            new SetExpectedCompletionRequest(DateTimeOffset.UtcNow.AddDays(1), "reason"), default)));
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, actor.Id.ToString())], "test"));
        Assert.IsType<NoContentResult>((await controller.SetExpectedCompletion(request.Id,
            new SetExpectedCompletionRequest(DateTimeOffset.UtcNow.AddDays(1), "reason"), default)));
        Assert.IsType<BadRequestObjectResult>((await controller.Queue(expectedCompletionState: "invalid")).Result);
    }

    private static BetccoDbContext NewDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static EvaluationRequest Request(EvaluationStatus status) => new()
    {
        StudentUserId = "private-student",
        Status = status,
        StudentComment = "private-comment"
    };

    private static AssessmentCoordinationService Service(BetccoDbContext db) =>
        new(db, new EvaluatorSpecialismService(db, null!));
}
