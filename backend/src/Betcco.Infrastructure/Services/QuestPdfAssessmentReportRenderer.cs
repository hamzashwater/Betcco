using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// Optional server-side PDF renderer. It is created only after deployment
/// configuration declares a valid QuestPDF license tier and an Arabic-capable
/// font directory; default deployments use the disabled renderer instead.
/// </summary>
public sealed class QuestPdfAssessmentReportRenderer(string fontFamily) : IAssessmentPdfRenderer
{
    public bool IsConfigured => true;
    public string? UnavailableReason => null;

    public byte[] Render(AssessmentPdfReportModel report) => Document.Create(document =>
    {
        document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(32);
            page.PageColor(Colors.White);
            page.DefaultTextStyle(style => style.FontFamily(fontFamily).FontSize(10));
            if (report.IsArabic) page.ContentFromRightToLeft();

            page.Header().Column(column =>
            {
                column.Item().Text("BETCCO").FontSize(20).Bold().FontColor(Colors.Blue.Darken3);
                column.Item().Text(report.IsArabic ? "تقرير التقييم الأكاديمي" : "Academic assessment report").FontSize(15).SemiBold();
                column.Item().PaddingTop(4).Text(report.IsArabic
                    ? "سجل صادر للخدمة الأكاديمية والتدقيق الداخلي - لا يغير القرار الأكاديمي."
                    : "An academic quality-assurance record - it does not alter the academic decision.").FontColor(Colors.Grey.Darken1);
            });

            page.Content().PaddingVertical(16).Column(column =>
            {
                column.Spacing(10);
                Section(column, report.IsArabic ? "ملخص الطلب" : "Request summary", summary =>
                {
                    summary.Item().Text($"{(report.IsArabic ? "معرف الطلب" : "Request ID")}: {report.EvaluationRequestId}");
                    summary.Item().Text($"{(report.IsArabic ? "معرف الطالب" : "Student ID")}: {report.StudentUserId}");
                    summary.Item().Text($"{(report.IsArabic ? "الحالة" : "Status")}: {report.Status}");
                    summary.Item().Text($"{(report.IsArabic ? "المحاولة" : "Attempt")}: {report.AttemptNumber}");
                    summary.Item().Text($"{(report.IsArabic ? "النتيجة" : "Outcome")}: {report.CalculatedOutcome ?? "—"}");
                    summary.Item().Text($"{(report.IsArabic ? "نسخة القاعدة" : "Rule-set version")}: {report.AssessmentRuleSetVersion}");
                });
                if (!string.IsNullOrWhiteSpace(report.QualificationVersionSnapshotJson))
                {
                    Section(column, report.IsArabic ? "نسخة إصدار المؤهل" : "Qualification-version snapshot", section =>
                        section.Item().Text(report.QualificationVersionSnapshotJson).FontSize(8).FontColor(Colors.Grey.Darken2));
                }
                Section(column, report.IsArabic ? "قرارات المعايير" : "Criterion decisions", section =>
                {
                    if (report.Criteria.Count == 0)
                        section.Item().Text(report.IsArabic ? "لا توجد قرارات معايير مسجلة." : "No criterion decisions are recorded.");
                    foreach (var criterion in report.Criteria)
                    {
                        section.Item().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).PaddingBottom(5).Column(item =>
                        {
                            item.Item().Text($"{criterion.Code} · {criterion.Achievement}").Bold();
                            if (!string.IsNullOrWhiteSpace(criterion.Evidence)) item.Item().Text(criterion.Evidence).FontColor(Colors.Grey.Darken2);
                            if (!string.IsNullOrWhiteSpace(criterion.Comment)) item.Item().Text(criterion.Comment).FontColor(Colors.Grey.Darken2);
                        });
                    }
                });
                Section(column, report.IsArabic ? "إقرارات الأصالة" : "Originality declarations", section =>
                {
                    if (report.Declarations.Count == 0)
                        section.Item().Text(report.IsArabic ? "لا يوجد إقرار مسجل." : "No declaration is recorded.");
                    foreach (var declaration in report.Declarations)
                        section.Item().Text($"{(report.IsArabic ? "المحاولة" : "Attempt")} {declaration.AttemptNumber} · {declaration.PolicyVersion} · {declaration.DeclaredAtUtc:O}");
                });
                Section(column, report.IsArabic ? "التحقق الداخلي" : "Internal verification", section =>
                {
                    if (report.Verifications.Count == 0)
                        section.Item().Text(report.IsArabic ? "لا يوجد قرار تحقق مسجل." : "No verification decision is recorded.");
                    foreach (var verification in report.Verifications)
                    {
                        section.Item().Text($"{verification.Decision} · {verification.VerifiedAtUtc:O}").Bold();
                        if (!string.IsNullOrWhiteSpace(verification.Comment)) section.Item().Text(verification.Comment).FontColor(Colors.Grey.Darken2);
                    }
                });
                Section(column, report.IsArabic ? "الاستئنافات" : "Appeals", section =>
                {
                    if (report.Appeals.Count == 0)
                        section.Item().Text(report.IsArabic ? "لا توجد استئنافات مسجلة." : "No appeals are recorded.");
                    foreach (var appeal in report.Appeals)
                    {
                        section.Item().Text($"{appeal.Status} · {appeal.CreatedAtUtc:O}").Bold();
                        section.Item().Text(appeal.Reason).FontColor(Colors.Grey.Darken2);
                        if (!string.IsNullOrWhiteSpace(appeal.DecisionRationale)) section.Item().Text(appeal.DecisionRationale).FontColor(Colors.Grey.Darken2);
                    }
                });
            });

            page.Footer().AlignCenter().Text(report.IsArabic
                ? "BETCCO - تقرير داخلي سري"
                : "BETCCO - confidential internal report").FontSize(8).FontColor(Colors.Grey.Darken1);
        });
    }).GeneratePdf();

    private static void Section(ColumnDescriptor column, string title, Action<ColumnDescriptor> content) =>
        column.Item().Border(1).BorderColor(Colors.Grey.Lighten2).Padding(10).Column(section =>
        {
            section.Item().Text(title).FontSize(12).SemiBold().FontColor(Colors.Blue.Darken3);
            section.Item().PaddingTop(6).Column(content);
        });
}

/// <summary>
/// Keeps PDF production opt-in. A deployment must explicitly identify the
/// licensed QuestPDF tier and package an Arabic-capable font before a report
/// can be rendered. This avoids silently using a server-dependent font or
/// assuming a commercial-license entitlement.
/// </summary>
public static class AssessmentPdfRendererFactory
{
    public static IAssessmentPdfRenderer Create(IConfiguration configuration)
    {
        if (!string.Equals(configuration["AssessmentReports:PdfProvider"], "QuestPdf", StringComparison.OrdinalIgnoreCase))
            return new DisabledAssessmentPdfRenderer("The PDF provider is disabled. Set AssessmentReports:PdfProvider to QuestPdf after deployment review.");

        var licenseValue = configuration["AssessmentReports:QuestPdfLicense"];
        if (!Enum.TryParse<LicenseType>(licenseValue, ignoreCase: true, out var license)
            || license is not (LicenseType.Community or LicenseType.Professional or LicenseType.Enterprise))
            return new DisabledAssessmentPdfRenderer("A confirmed QuestPDF license tier is required before PDF reporting can be enabled.");

        var fontDirectory = configuration["AssessmentReports:FontDirectory"];
        var fontFamily = configuration["AssessmentReports:FontFamily"];
        if (string.IsNullOrWhiteSpace(fontDirectory) || !Directory.Exists(fontDirectory) || string.IsNullOrWhiteSpace(fontFamily))
            return new DisabledAssessmentPdfRenderer("An accessible deployment font directory and Arabic-capable font family are required before PDF reporting can be enabled.");

        QuestPDF.Settings.License = license;
        QuestPDF.Settings.UseEnvironmentFonts = false;
        QuestPDF.Settings.CheckIfAllTextGlyphsAreAvailable = true;
        QuestPDF.Settings.FontDiscoveryPaths.Add(fontDirectory);
        return new QuestPdfAssessmentReportRenderer(fontFamily);
    }
}
