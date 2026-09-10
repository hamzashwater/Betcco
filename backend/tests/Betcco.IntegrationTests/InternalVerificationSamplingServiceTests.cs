using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class InternalVerificationSamplingServiceTests
{
    [Fact]
    public async Task Lead_verifier_selects_an_independent_sample_and_its_decision_is_recorded_once()
    {
        await using var db = CreateContext();
        var grade = new Grade { Slug = "grade", ArabicName = "الصف", EnglishName = "Grade", LearningTrackId = Guid.NewGuid() };
        var specialization = new Specialization { Slug = "it", ArabicName = "تقنية", EnglishName = "IT", LearningTrackId = grade.LearningTrackId };
        var taskType = new TaskType { ArabicName = "مهمة", EnglishName = "Assignment" };
        var request = new EvaluationRequest
        {
            StudentUserId = "student",
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = taskType.Id,
            RubricTemplateId = Guid.NewGuid(),
            Status = EvaluationStatus.UnderReview,
            CalculatedGrade = EvaluationGrade.Pass,
            AssessmentRuleSetVersion = "btec-internal-v1",
            AssessmentRuleSetSnapshotJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.AddRange(grade, specialization, taskType, request);
        db.EvaluatorAssignments.Add(new EvaluatorAssignment
        {
            EvaluationRequestId = request.Id,
            EvaluatorUserId = "assessor",
            AssignedByUserId = "reviewer"
        });
        db.CriterionResults.Add(new CriterionResult
        {
            EvaluationRequestId = request.Id,
            CriterionCode = "A.P1",
            Achievement = CriterionAchievement.Achieved
        });
        await db.SaveChangesAsync();

        var eligibility = new EligibleAcademicStaff();
        var sampling = new InternalVerificationSamplingService(db, eligibility);
        var plan = await sampling.CreatePlanAsync("lead-verifier", new CreateInternalVerificationPlanCommand(
            "assessor",
            grade.Id,
            specialization.Id,
            taskType.Id,
            nameof(EvaluationGrade.Pass),
            "Initial sample for a newly active assessor and task scope.",
            null));

        Assert.NotNull(plan);
        var candidates = await sampling.ListCandidatesAsync("lead-verifier", plan!.Id, 10);
        Assert.Single(candidates!);
        Assert.True(await sampling.SelectSampleAsync("lead-verifier", plan.Id, new SelectInternalVerificationSampleCommand(
            request.Id,
            "verifier",
            "New assessor outcome requires independent internal verification.")));
        Assert.False(await sampling.SelectSampleAsync("lead-verifier", plan.Id, new SelectInternalVerificationSampleCommand(
            request.Id,
            "assessor",
            "The assigned assessor must never verify their own assessment.")));

        var sample = await db.InternalVerificationSamples.SingleAsync();
        Assert.Equal(InternalVerificationSampleStatus.Pending, sample.Status);
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(), item => item.EventType == "InternalVerificationSampleSelected");

        var evaluations = new EvaluationService(db, new NullFileStorage(), new CleanFileScanner(), eligibility);
        Assert.True(await evaluations.VerifyAsync("verifier", request.Id, true, "Independent verification accepted.", null));

        Assert.Equal(EvaluationStatus.Completed, request.Status);
        Assert.Equal(InternalVerificationSampleStatus.Accepted, sample.Status);
        Assert.Equal("Independent verification accepted.", sample.DecisionComment);
        Assert.NotNull(sample.DecidedAtUtc);
        Assert.Contains(await db.AssessmentAuditEvents.ToListAsync(), item => item.EventType == "InternalVerificationSampleResolved");

        sample.SelectionRationale = "This would rewrite historical sampling evidence.";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task A_non_lead_verifier_cannot_create_or_view_sampling_plans()
    {
        await using var db = CreateContext();
        var service = new InternalVerificationSamplingService(db, new EligibleAcademicStaff());
        var command = new CreateInternalVerificationPlanCommand(
            "assessor",
            null,
            null,
            null,
            null,
            "A documented scope is required for every proposed sample.",
            null);

        Assert.Null(await service.CreatePlanAsync("verifier", command));
        Assert.Null(await service.ListCandidatesAsync("verifier", Guid.NewGuid(), 10));
    }

    private static BetccoDbContext CreateContext() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private sealed class EligibleAcademicStaff : IAssessorEligibilityService
    {
        public Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(userId == "assessor");

        public Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(userId is "verifier" or "lead-verifier");

        public Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(userId == "lead-verifier");
    }

    private sealed class NullFileStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => Task.FromResult("unused");
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
    }

    private sealed class CleanFileScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }
}
