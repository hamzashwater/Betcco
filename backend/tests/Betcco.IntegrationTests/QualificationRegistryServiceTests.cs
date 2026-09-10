using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class QualificationRegistryServiceTests
{
    [Fact]
    public async Task Registry_requires_a_unique_source_version_and_snapshots_it_when_an_evaluation_is_created()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var registry = new QualificationRegistryService(db);
        var qualification = await registry.CreateQualificationAsync("system-admin", new CreateQualificationCommand(
            "BTEC-L3-IT",
            "بيتك المستوى الثالث في تقنية المعلومات",
            "BTEC Level 3 Information Technology"));

        Assert.NotNull(qualification);
        Assert.Null(await registry.CreateQualificationAsync("system-admin", new CreateQualificationCommand(
            "BTEC-L3-IT",
            "اسم مختلف",
            "Different name")));
        Assert.Null(await registry.CreateVersionAsync("system-admin", new CreateQualificationVersionCommand(
            qualification!.Id,
            "2026",
            "short",
            DateTimeOffset.UtcNow,
            null)));
        var version = await registry.CreateVersionAsync("system-admin", new CreateQualificationVersionCommand(
            qualification.Id,
            "2026",
            "Centre-approved specification reference: BTEC International Level 3 IT 2026.",
            DateTimeOffset.UtcNow.AddDays(-1),
            null));

        Assert.NotNull(version);
        var track = new LearningTrack
        {
            Slug = "btec",
            ArabicName = "بيتك",
            EnglishName = "BTEC",
            IsBtecFocused = true
        };
        var grade = new Grade
        {
            Slug = "grade",
            ArabicName = "الصف",
            EnglishName = "Grade",
            LearningTrackId = track.Id
        };
        var specialization = new Specialization
        {
            Slug = "it",
            ArabicName = "تقنية المعلومات",
            EnglishName = "Information Technology",
            LearningTrackId = track.Id
        };
        var taskType = new TaskType { ArabicName = "مهمة", EnglishName = "Assignment" };
        var rubric = new RubricTemplate
        {
            ArabicTitle = "روبرك",
            EnglishTitle = "Rubric",
            GradeId = grade.Id,
            SpecializationId = specialization.Id,
            TaskTypeId = taskType.Id,
            AssessmentRuleSetJson = BtecAssessmentRuleSet.DefaultJson
        };
        db.AddRange(track, grade, specialization, taskType, rubric);
        await db.SaveChangesAsync();

        Assert.True(await registry.AssignToRubricAsync("system-admin", rubric.Id, version!.Id));
        var evaluationService = new EvaluationService(db, new NoopStorage(), new CleanScanner());
        var evaluation = await evaluationService.CreateDraftAsync("student", new CreateEvaluationCommand(
            grade.Id,
            specialization.Id,
            taskType.Id,
            rubric.Id,
            "Please review my evidence."));

        Assert.NotNull(evaluation);
        var request = await db.EvaluationRequests.SingleAsync();
        Assert.Equal(version.Id, request.QualificationVersionId);
        Assert.Contains("BTEC-L3-IT", request.QualificationVersionSnapshotJson);
        Assert.Contains(await db.AuditLogs.ToListAsync(), item => item.Action == "RubricQualificationVersionAssigned");
    }

    private sealed class NoopStorage : IFileStorage
    {
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => Task.FromResult("unused");
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
    }

    private sealed class CleanScanner : IFileSecurityScanner
    {
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default) =>
            Task.FromResult(new FileScanResult(FileScanOutcome.Clean));
    }
}
