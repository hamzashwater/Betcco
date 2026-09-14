using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using Betcco.Api.Controllers;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Betcco.IntegrationTests;

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class AssessmentPdfTestCollection
{
    public const string Name = "Assessment PDF";
}

[Collection(AssessmentPdfTestCollection.Name)]
public sealed class AssessmentPdfReportServiceTests
{
    [Fact]
    public async Task Successful_export_uses_persisted_academic_state_and_writes_audit_after_rendering()
    {
        await using var db = CreateContext();
        var student = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "student@betcco.test",
            DisplayName = "Student Example"
        };
        var request = Request(student.Id.ToString());
        request.Status = EvaluationStatus.Completed;
        request.CalculatedGrade = EvaluationGrade.Distinction;
        request.SubmissionAttemptNumber = 2;
        request.QualificationVersionSnapshotJson = """
            {"qualificationCode":"BTEC-L3-IT","versionCode":"2026","sourceReference":"SR-2026","effectiveFromUtc":"2026-01-01T00:00:00+00:00"}
            """;
        request.CriterionResults.Add(new CriterionResult
        {
            CriterionCode = "P1",
            Achievement = CriterionAchievement.NotAchieved,
            Evidence = "Stored evidence",
            Comment = "Stored decision comment"
        });
        request.AuthenticityDeclarations.Add(new AuthenticityDeclaration
        {
            StudentUserId = student.Id.ToString(),
            AttemptNumber = 2,
            PolicyVersion = "auth-v2",
            StatementSnapshot = "I confirm this is my own work."
        });
        request.InternalVerifications.Add(new InternalVerification
        {
            VerifierUserId = Guid.NewGuid().ToString(),
            Decision = "Accepted",
            Comment = "Decision checked"
        });
        var plan = new InternalVerificationPlan { SelectionRationale = "Risk-based sample" };
        request.InternalVerificationSamples.Add(new InternalVerificationSample
        {
            InternalVerificationPlan = plan,
            SubmissionAttemptNumber = 2,
            SelectedByUserId = Guid.NewGuid().ToString(),
            AssignedVerifierUserId = Guid.NewGuid().ToString(),
            SelectionRationale = "Representative completed assessment",
            Status = InternalVerificationSampleStatus.Accepted,
            DecisionComment = "Sample accepted",
            DecidedAtUtc = DateTimeOffset.UtcNow
        });
        request.ResubmissionAuthorizations.Add(new ResubmissionAuthorization
        {
            AuthorizedByUserId = Guid.NewGuid().ToString(),
            AttemptNumber = 2,
            RuleSetVersion = request.AssessmentRuleSetVersion,
            Reason = "One further submission was authorized.",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(7),
            SubmittedAtUtc = DateTimeOffset.UtcNow
        });
        request.Appeals.Add(new EvaluationAppeal
        {
            StudentUserId = student.Id.ToString(),
            Reason = "Please review the criterion decision.",
            Status = EvaluationAppealStatus.Upheld,
            DecisionRationale = "Evidence supported the appeal.",
            ReviewedAtUtc = DateTimeOffset.UtcNow
        });
        db.AddRange(student, request);
        await db.SaveChangesAsync();
        var renderer = new CapturingRenderer();
        var service = new AssessmentPdfReportService(db, new Eligibility(isLeadVerifier: true), renderer);

        var result = await service.CreateAsync("lead-verifier", request.Id, "en-GB");

        Assert.NotNull(result);
        Assert.Equal("%PDF-test", Encoding.ASCII.GetString(result.Content));
        var rendered = Assert.IsType<AssessmentPdfReportModel>(renderer.Report);
        Assert.False(rendered.IsArabic);
        Assert.Equal("Student Example", rendered.StudentDisplayName);
        Assert.Equal("Distinction", rendered.OverallOutcome);
        Assert.Equal("NotAchieved", Assert.Single(rendered.Criteria).Achievement);
        Assert.Equal("BTEC-L3-IT", rendered.Qualification?.Code);
        Assert.Equal("2026", rendered.Qualification?.VersionCode);
        Assert.Equal(AssessmentPdfQualificationSnapshotStatus.Available, rendered.Qualification?.SnapshotStatus);
        Assert.Equal("I confirm this is my own work.", Assert.Single(rendered.Declarations).Statement);
        Assert.Single(rendered.Verifications);
        Assert.Single(rendered.VerificationSamples);
        Assert.Single(rendered.Resubmissions);
        Assert.Single(rendered.Appeals);
        Assert.DoesNotContain(student.Id.ToString(), rendered.StudentDisplayName ?? string.Empty);

        var audit = Assert.Single(await db.AuditLogs.Where(item => item.Action == "AssessmentPdfReportExported").ToListAsync());
        Assert.Equal("lead-verifier", audit.ActorUserId);
        Assert.Equal("EvaluationRequest", audit.EntityType);
        Assert.Equal(request.Id.ToString(), audit.EntityId);
        Assert.Equal("Success", audit.Outcome);
    }

    [Fact]
    public async Task Missing_assessment_returns_null_without_render_or_audit()
    {
        await using var db = CreateContext();
        var renderer = new CapturingRenderer();
        var service = new AssessmentPdfReportService(db, new Eligibility(isLeadVerifier: true), renderer);

        var result = await service.CreateAsync("lead-verifier", Guid.NewGuid(), "en");

        Assert.Null(result);
        Assert.Null(renderer.Report);
        Assert.Empty(await db.AuditLogs.ToListAsync());
    }

    [Fact]
    public async Task Unauthorized_actor_cannot_render_an_assessment_by_identifier()
    {
        await using var db = CreateContext();
        var request = Request(Guid.NewGuid().ToString());
        db.Add(request);
        await db.SaveChangesAsync();
        var renderer = new CapturingRenderer();
        var service = new AssessmentPdfReportService(db, new Eligibility(isLeadVerifier: false), renderer);

        var result = await service.CreateAsync("ordinary-user", request.Id, "en");

        Assert.Null(result);
        Assert.Null(renderer.Report);
        Assert.Empty(await db.AuditLogs.ToListAsync());
    }

    [Fact]
    public async Task Renderer_failure_does_not_write_a_successful_export_audit()
    {
        await using var db = CreateContext();
        var request = Request(Guid.NewGuid().ToString());
        db.Add(request);
        await db.SaveChangesAsync();
        var service = new AssessmentPdfReportService(db, new Eligibility(isLeadVerifier: true), new ThrowingRenderer());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync("lead-verifier", request.Id, "en"));

        Assert.Empty(await db.AuditLogs.Where(item => item.Action == "AssessmentPdfReportExported").ToListAsync());
    }

    [Theory]
    [InlineData("{invalid", AssessmentPdfQualificationSnapshotStatus.Malformed)]
    [InlineData("{\"legacyUnknown\":true}", AssessmentPdfQualificationSnapshotStatus.Unsupported)]
    public async Task Historical_qualification_snapshot_failure_is_safe_and_never_exposes_raw_json(
        string snapshot,
        AssessmentPdfQualificationSnapshotStatus expectedStatus)
    {
        await using var db = CreateContext();
        var request = Request(Guid.NewGuid().ToString());
        request.QualificationVersionSnapshotJson = snapshot;
        db.Add(request);
        await db.SaveChangesAsync();
        var renderer = new CapturingRenderer();
        var service = new AssessmentPdfReportService(db, new Eligibility(isLeadVerifier: true), renderer);

        var result = await service.CreateAsync("lead-verifier", request.Id, "ar-JO");

        Assert.NotNull(result);
        var rendered = Assert.IsType<AssessmentPdfReportModel>(renderer.Report);
        Assert.True(rendered.IsArabic);
        Assert.Equal(expectedStatus, rendered.Qualification?.SnapshotStatus);
        Assert.DoesNotContain(snapshot, rendered.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Controller_requires_the_assessment_appeal_reviewer_policy()
    {
        var attribute = Assert.Single(typeof(AssessmentPdfReportsController).GetCustomAttributes<AuthorizeAttribute>());

        Assert.Equal("AssessmentAppealReviewer", attribute.Policy);
    }

    private static BetccoDbContext CreateContext() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private static EvaluationRequest Request(string studentUserId) => new()
    {
        StudentUserId = studentUserId,
        GradeId = Guid.NewGuid(),
        SpecializationId = Guid.NewGuid(),
        TaskTypeId = Guid.NewGuid(),
        RubricTemplateId = Guid.NewGuid(),
        AssessmentRuleSetVersion = "btec-rule-v3",
        AssessmentRuleSetSnapshotJson = "{}"
    };

    private sealed class Eligibility(bool isLeadVerifier) : IAssessorEligibilityService
    {
        public Task<bool> IsEligibleAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> IsEligibleVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> IsEligibleLeadVerifierAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(isLeadVerifier);
    }

    private sealed class CapturingRenderer : IAssessmentPdfRenderer
    {
        public bool IsConfigured => true;
        public string? UnavailableReason => null;
        public AssessmentPdfReportModel? Report { get; private set; }

        public byte[] Render(AssessmentPdfReportModel report)
        {
            Report = report;
            return "%PDF-test"u8.ToArray();
        }
    }

    private sealed class ThrowingRenderer : IAssessmentPdfRenderer
    {
        public bool IsConfigured => true;
        public string? UnavailableReason => null;
        public byte[] Render(AssessmentPdfReportModel report) => throw new InvalidOperationException("Expected renderer failure.");
    }
}

[Collection(AssessmentPdfTestCollection.Name)]
public sealed partial class QuestPdfAssessmentReportRendererTests
{
    [Theory]
    [InlineData(false, "assessment-report-en.pdf")]
    [InlineData(true, "assessment-report-ar.pdf")]
    public void Renderer_generates_English_and_Arabic_reports(bool isArabic, string outputFileName)
    {
        var renderer = CreateConfiguredRenderer();

        var pdf = renderer.Render(Report(isArabic));

        AssertPdf(pdf);
        WriteVisualArtifact(outputFileName, pdf);
    }

    [Fact]
    public void Content_heavy_report_renders_across_multiple_pages_without_layout_failure()
    {
        var renderer = CreateConfiguredRenderer();
        var report = Report(isArabic: false, criterionCount: 120, relatedRecordCount: 8);

        var pdf = renderer.Render(report);

        AssertPdf(pdf);
        Assert.True(PdfPageCount(pdf) > 1, "The content-heavy report should contain multiple PDF pages.");
        WriteVisualArtifact("assessment-report-multipage.pdf", pdf);
    }

    [Fact]
    public void Renderer_factory_fails_closed_for_disabled_or_invalid_configuration()
    {
        var disabled = AssessmentPdfRendererFactory.Create(Configuration(new Dictionary<string, string?>
        {
            ["AssessmentReports:PdfProvider"] = "Disabled"
        }));
        var invalidLicense = AssessmentPdfRendererFactory.Create(Configuration(new Dictionary<string, string?>
        {
            ["AssessmentReports:PdfProvider"] = "QuestPdf",
            ["AssessmentReports:QuestPdfLicense"] = "Unconfirmed"
        }));
        var missingFont = AssessmentPdfRendererFactory.Create(Configuration(new Dictionary<string, string?>
        {
            ["AssessmentReports:PdfProvider"] = "QuestPdf",
            ["AssessmentReports:QuestPdfLicense"] = "Community",
            ["AssessmentReports:FontDirectory"] = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()),
            ["AssessmentReports:FontFamily"] = "Missing Font"
        }));
        var (fontDirectory, _) = TestFont();
        var invalidFamily = AssessmentPdfRendererFactory.Create(Configuration(new Dictionary<string, string?>
        {
            ["AssessmentReports:PdfProvider"] = "QuestPdf",
            ["AssessmentReports:QuestPdfLicense"] = "Community",
            ["AssessmentReports:FontDirectory"] = fontDirectory,
            ["AssessmentReports:FontFamily"] = $"Missing Font {Guid.NewGuid():N}"
        }));

        Assert.False(disabled.IsConfigured);
        Assert.False(invalidLicense.IsConfigured);
        Assert.False(missingFont.IsConfigured);
        Assert.False(invalidFamily.IsConfigured);
    }

    private static IAssessmentPdfRenderer CreateConfiguredRenderer()
    {
        var (fontDirectory, fontFamily) = TestFont();
        var renderer = AssessmentPdfRendererFactory.Create(Configuration(new Dictionary<string, string?>
        {
            ["AssessmentReports:PdfProvider"] = "QuestPdf",
            ["AssessmentReports:QuestPdfLicense"] = "Community",
            ["AssessmentReports:FontDirectory"] = fontDirectory,
            ["AssessmentReports:FontFamily"] = fontFamily
        }));
        Assert.True(renderer.IsConfigured, renderer.UnavailableReason);
        return renderer;
    }

    private static AssessmentPdfReportModel Report(bool isArabic, int criterionCount = 3, int relatedRecordCount = 2)
    {
        var now = new DateTimeOffset(2026, 9, 14, 10, 30, 0, TimeSpan.Zero);
        return new AssessmentPdfReportModel(
            isArabic,
            Guid.Parse("4ba8fcad-a192-44d1-aee8-6127f3f91f42"),
            isArabic ? "الطالب التجريبي" : "Example Student",
            "Completed",
            "Merit",
            2,
            "btec-rule-v3",
            new AssessmentPdfQualification(
                AssessmentPdfQualificationSnapshotStatus.Available,
                "BTEC-L3-IT",
                "تقنية المعلومات",
                "Information Technology",
                "2026",
                "SR-2026",
                now.AddMonths(-8),
                null),
            now.AddDays(-30),
            now,
            Enumerable.Range(1, criterionCount)
                .Select(index => new AssessmentPdfCriterion(
                    $"{(index % 3 == 0 ? "D" : index % 2 == 0 ? "M" : "P")}{index}",
                    index % 4 == 0 ? "NotAchieved" : "Achieved",
                    isArabic ? $"دليل أكاديمي محفوظ للمعيار رقم {index}." : $"Persisted academic evidence for criterion {index}.",
                    isArabic ? "ملاحظة قرار محفوظة." : "Stored decision comment."))
                .ToArray(),
            Enumerable.Range(1, relatedRecordCount)
                .Select(index => new AssessmentPdfDeclaration(index, "auth-v2", isArabic ? "أقر بأن هذا العمل من إنجازي." : "I confirm this is my own work.", now.AddDays(-index)))
                .ToArray(),
            Enumerable.Range(1, relatedRecordCount)
                .Select(index => new AssessmentPdfVerification(index % 2 == 0 ? "ReturnedToAssessor" : "Accepted", isArabic ? "ملاحظة تحقق محفوظة." : "Stored verification comment.", now.AddDays(-index)))
                .ToArray(),
            Enumerable.Range(1, relatedRecordCount)
                .Select(index => new AssessmentPdfVerificationSample(index, isArabic ? "عينة تمثيلية." : "Representative sample.", "Accepted", "Checked", now.AddDays(-index), now.AddDays(-index + 1)))
                .ToArray(),
            Enumerable.Range(1, relatedRecordCount)
                .Select(index => new AssessmentPdfResubmission(index + 1, "btec-rule-v3", isArabic ? "تفويض موثق لإعادة التسليم." : "Documented resubmission authorization.", now.AddDays(-index), now.AddDays(index), now, null))
                .ToArray(),
            Enumerable.Range(1, relatedRecordCount)
                .Select(index => new AssessmentPdfAppeal(index % 2 == 0 ? "Rejected" : "Upheld", isArabic ? "سبب استئناف أكاديمي." : "Academic appeal reason.", isArabic ? "مبرر قرار الاستئناف." : "Appeal decision rationale.", now.AddDays(-index), now))
                .ToArray());
    }

    private static (string Directory, string Family) TestFont()
    {
        var candidates = new[]
        {
            (Path: @"C:\Windows\Fonts\arial.ttf", Family: "Arial"),
            (Path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", Family: "DejaVu Sans"),
            (Path: "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf", Family: "Noto Sans Arabic")
        };
        var candidate = candidates.FirstOrDefault(item => File.Exists(item.Path));
        if (string.IsNullOrWhiteSpace(candidate.Path))
            throw new InvalidOperationException("No test font with Arabic glyph support is available.");
        return (Path.GetDirectoryName(candidate.Path)!, candidate.Family);
    }

    private static IConfiguration Configuration(IReadOnlyDictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static void AssertPdf(byte[] pdf)
    {
        Assert.True(pdf.Length > 1_000);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(pdf, 0, 5));
    }

    private static int PdfPageCount(byte[] pdf) =>
        PdfPageRegex().Matches(Encoding.ASCII.GetString(pdf)).Count;

    private static void WriteVisualArtifact(string fileName, byte[] pdf)
    {
        var outputDirectory = Environment.GetEnvironmentVariable("BETCCO_PDF_VISUAL_OUTPUT");
        if (string.IsNullOrWhiteSpace(outputDirectory)) return;
        Directory.CreateDirectory(outputDirectory);
        File.WriteAllBytes(Path.Combine(outputDirectory, fileName), pdf);
    }

    [GeneratedRegex(@"/Type\s*/Page\b", RegexOptions.CultureInvariant)]
    private static partial Regex PdfPageRegex();
}
