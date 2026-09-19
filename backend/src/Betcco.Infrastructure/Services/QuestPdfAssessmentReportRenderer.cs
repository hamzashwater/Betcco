using System.Text;
using Microsoft.Extensions.Configuration;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

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

    public byte[] Render(AssessmentPdfReportModel report) => CreateDocument(report).GeneratePdf();

    internal void ValidateConfiguredFont() => Document.Create(document =>
    {
        document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(12);
            page.DefaultTextStyle(style => style.FontFamily(fontFamily).FontSize(10));
            page.Content().Text("BETCCO Arabic font check - فحص الخط العربي");
        });
    }).GeneratePdf();

    private IDocument CreateDocument(AssessmentPdfReportModel report) => Document.Create(document =>
    {
        document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(32);
            page.PageColor(Colors.White);
            page.DefaultTextStyle(style => style.FontFamily(fontFamily).FontSize(10).FontColor(Colors.Grey.Darken4));
            if (report.IsArabic) page.ContentFromRightToLeft();
            else page.ContentFromLeftToRight();

            page.Content().Decoration(decoration =>
            {
                decoration.Before().Height(64).PaddingBottom(8).Column(header => ReportHeader(header, report));
                decoration.Content().PaddingVertical(8).Column(column =>
                {
                    AssessmentIdentity(column, report);
                    TaskAndAssessorIdentity(column, report);
                    Qualification(column, report);
                    SubmissionsAndEvidence(column, report);
                    Criteria(column, report);
                    Declarations(column, report);
                    InternalVerification(column, report);
                    Resubmissions(column, report);
                    Appeals(column, report);
                    AuditTrail(column, report);
                });
            });

            page.Footer().Height(22).PaddingTop(6).Element(container => ReportFooter(container, report));
        });
    });

    private static void ReportHeader(ColumnDescriptor column, AssessmentPdfReportModel report)
    {
        column.Item().Text("BETCCO").FontSize(20).Bold().FontColor(Colors.Blue.Darken3);
        column.Item().Text(report.IsArabic ? "تقرير تقييم صادر عن BETCCO" : "BETCCO assessment report").FontSize(15).SemiBold();
        column.Item().PaddingTop(4).Text(report.IsArabic
            ? "سجل أكاديمي لدعم تقديم برامج BTEC والتقييم والتحقق الداخلي"
            : "Academic record supporting BTEC programme delivery, assessment, and internal verification").FontColor(Colors.Grey.Darken1);
    }

    private static void ReportFooter(IContainer container, AssessmentPdfReportModel report) =>
        container.BorderTop(1).BorderColor(Colors.Grey.Lighten2).PaddingTop(4).Row(row =>
        {
            row.RelativeItem().Text(report.IsArabic
                ? "BETCCO - سجل تقييم سري ومضبوط"
                : "BETCCO - confidential controlled assessment record").FontSize(8).FontColor(Colors.Grey.Darken1);
            row.ConstantItem(150).AlignRight().Text(text =>
            {
                text.DefaultTextStyle(style => style.FontSize(8).FontColor(Colors.Grey.Darken1));
                text.Span(report.IsArabic ? "صفحة " : "Page ");
                text.CurrentPageNumber();
                text.Span(report.IsArabic ? " من " : " of ");
                text.TotalPages();
            });
        });

    private static void AssessmentIdentity(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "هوية التقييم" : "Assessment identity", section =>
        {
            Field(section, report.IsArabic ? "مرجع التقييم" : "Assessment reference", report.EvaluationRequestId.ToString(), leftToRight: true);
            Field(section, report.IsArabic ? "اسم الطالب" : "Student name", report.StudentDisplayName ?? Empty(report));
            Field(section, report.IsArabic ? "حالة التقييم" : "Assessment status", LocalizeValue(report.Status, report.IsArabic));
            Field(section, report.IsArabic ? "النتيجة الكلية المعتمدة" : "Authoritative overall outcome", LocalizeValue(report.OverallOutcome, report.IsArabic));
            Field(section, report.IsArabic ? "رقم المحاولة" : "Attempt number", report.AttemptNumber.ToString(), leftToRight: true);
            Field(section, report.IsArabic ? "إصدار قواعد التقييم" : "Assessment rule-set version", report.AssessmentRuleSetVersion, leftToRight: true);
            Field(section, report.IsArabic ? "تاريخ إنشاء سجل التقييم" : "Assessment record created", FormatDate(report.CreatedAtUtc), leftToRight: true);
            Field(section, report.IsArabic ? "تاريخ تصدير التقرير" : "Report exported", FormatDate(report.ExportedAtUtc), leftToRight: true);
            Field(section, report.IsArabic ? "صدّر بواسطة" : "Exported by", report.ExportedByDisplayName ?? Empty(report));
        });

    private static void TaskAndAssessorIdentity(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "المهمة والتقييم" : "Task and assessment", section =>
        {
            var taskType = report.IsArabic
                ? report.TaskIdentity.TaskTypeArabicName ?? report.TaskIdentity.TaskTypeEnglishName
                : report.TaskIdentity.TaskTypeEnglishName ?? report.TaskIdentity.TaskTypeArabicName;
            var rubric = report.IsArabic
                ? report.TaskIdentity.RubricArabicTitle ?? report.TaskIdentity.RubricEnglishTitle
                : report.TaskIdentity.RubricEnglishTitle ?? report.TaskIdentity.RubricArabicTitle;
            Field(section, report.IsArabic ? "نوع المهمة المسجل حاليًا" : "Current registered task type", taskType ?? Empty(report));
            Field(section, report.IsArabic ? "قالب التقييم المسجل حاليًا" : "Current registered rubric", rubric ?? Empty(report));
            Field(section, report.IsArabic ? "إصدار قالب التقييم" : "Rubric version", report.TaskIdentity.RubricVersion?.ToString() ?? Empty(report), leftToRight: true);

            if (report.AssessorAssignments.Count == 0)
            {
                section.Item().PaddingTop(4).Text(report.IsArabic ? "لا يوجد تعيين مقيّم مسجل." : "No assessor assignment is recorded.");
                return;
            }

            foreach (var assignment in report.AssessorAssignments)
            {
                section.Item().EnsureSpace(60).PaddingTop(4).Column(record =>
                {
                    Field(record, report.IsArabic ? "المقيّم" : "Assessor", assignment.AssessorDisplayName ?? Empty(report));
                    Field(record, report.IsArabic ? "عيّن بواسطة" : "Assigned by", assignment.AssignedByDisplayName ?? Empty(report));
                    Field(record, report.IsArabic ? "تاريخ التعيين" : "Assigned", FormatDate(assignment.AssignedAtUtc), leftToRight: true);
                });
            }
        });

    private static void Qualification(ColumnDescriptor column, AssessmentPdfReportModel report)
    {
        Section(column, report.IsArabic ? "المؤهل وإصدار المواصفة" : "Qualification and specification version", section =>
        {
            if (report.Qualification is null)
            {
                section.Item().Text(report.IsArabic ? "لا توجد نسخة مؤهل محفوظة لهذا التقييم." : "No qualification snapshot is stored for this assessment.");
                return;
            }

            if (report.Qualification.SnapshotStatus != AssessmentPdfQualificationSnapshotStatus.Available)
            {
                section.Item().Text(report.IsArabic
                    ? "نسخة المؤهل التاريخية محفوظة، لكن بنيتها غير مدعومة أو غير صالحة للعرض المنظم."
                    : "The historical qualification snapshot is retained, but its structure is unsupported or malformed and cannot be presented safely.")
                    .FontColor(Colors.Grey.Darken1);
                return;
            }

            var qualificationName = report.IsArabic
                ? report.Qualification.ArabicName ?? report.Qualification.EnglishName
                : report.Qualification.EnglishName ?? report.Qualification.ArabicName;
            OptionalField(section, report.IsArabic ? "اسم المؤهل" : "Qualification name", qualificationName);
            OptionalField(section, report.IsArabic ? "رمز المؤهل" : "Qualification code", report.Qualification.Code, leftToRight: true);
            OptionalField(section, report.IsArabic ? "رمز الإصدار" : "Version code", report.Qualification.VersionCode, leftToRight: true);
            OptionalField(section, report.IsArabic ? "مرجع المصدر" : "Source reference", report.Qualification.SourceReference, leftToRight: true);
            OptionalField(section, report.IsArabic ? "ساري من" : "Effective from", FormatDate(report.Qualification.EffectiveFromUtc), leftToRight: true);
            OptionalField(section, report.IsArabic ? "ساري حتى" : "Effective until", FormatDate(report.Qualification.EffectiveUntilUtc), leftToRight: true);
        });
    }

    private static void SubmissionsAndEvidence(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "مراجع التسليم والأدلة" : "Submission and evidence references", section =>
        {
            if (report.Submissions.Count == 0)
            {
                section.Item().Text(report.IsArabic ? "لا توجد ملفات تسليم مسجلة." : "No submission files are recorded.");
            }
            else
            {
                foreach (var submission in report.Submissions)
                {
                    section.Item().EnsureSpace(75).PaddingTop(4).Column(record =>
                    {
                        record.Item().Text(submission.OriginalFileName).Bold();
                        Field(record, report.IsArabic ? "نوع المحتوى" : "Content type", submission.ContentType, leftToRight: true);
                        Field(record, report.IsArabic ? "الحجم" : "Size", FormatFileSize(submission.LengthBytes), leftToRight: true);
                        Field(record, report.IsArabic ? "حالة الفحص" : "Scan status", LocalizeValue(submission.ScanStatus, report.IsArabic));
                        Field(record, report.IsArabic ? "تاريخ التسجيل" : "Recorded", FormatDate(submission.SubmittedAtUtc), leftToRight: true);
                    });
                }
            }

            if (report.EvidenceItems.Count == 0)
            {
                section.Item().PaddingTop(4).Text(report.IsArabic ? "لا توجد مراجع أدلة إضافية مسجلة." : "No additional evidence references are recorded.");
                return;
            }

            section.Item().PaddingTop(6).Text(report.IsArabic ? "أدلة مرتبطة بالمعايير" : "Criterion-linked evidence").SemiBold();
            foreach (var evidence in report.EvidenceItems)
            {
                section.Item().EnsureSpace(55).PaddingTop(4).Column(record =>
                {
                    Field(record, report.IsArabic ? "المعيار" : "Criterion", evidence.CriterionCode, leftToRight: true);
                    Field(record, report.IsArabic ? "وصف الدليل" : "Evidence narrative", evidence.Narrative);
                    Field(record, report.IsArabic ? "تاريخ التسجيل" : "Recorded", FormatDate(evidence.RecordedAtUtc), leftToRight: true);
                });
            }
        });

    private static void Criteria(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "قرارات المعايير" : "Criterion decisions", section =>
        {
            if (report.Criteria.Count == 0)
            {
                section.Item().Text(report.IsArabic ? "لا توجد قرارات معايير مسجلة." : "No criterion decisions are recorded.");
                return;
            }

            section.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(3);
                });
                table.Header(header =>
                {
                    header.Cell().Column(1).Element(TableHeader).Text(report.IsArabic ? "المعيار" : "Criterion");
                    header.Cell().Column(2).Element(TableHeader).Text(report.IsArabic ? "القرار المحفوظ" : "Persisted decision");
                });
                foreach (var criterion in report.Criteria)
                {
                    table.Cell().Column(1).Element(TableCell).Text(criterion.Code);
                    table.Cell().Column(2).Element(TableCell).Text(LocalizeValue(criterion.Achievement, report.IsArabic));
                }
            });

            var criteriaWithDetails = report.Criteria
                .Where(item => !string.IsNullOrWhiteSpace(item.Evidence) || !string.IsNullOrWhiteSpace(item.Comment))
                .ToArray();
            if (criteriaWithDetails.Length == 0) return;

            section.Item().PaddingTop(6).Text(report.IsArabic ? "أدلة القرار وملاحظاته" : "Decision evidence and comments").SemiBold();
            foreach (var criterion in criteriaWithDetails)
            {
                section.Item().EnsureSpace(45).PaddingTop(4).Column(detail =>
                {
                    detail.Item().Text(criterion.Code).Bold();
                    OptionalField(detail, report.IsArabic ? "الدليل" : "Evidence", criterion.Evidence);
                    OptionalField(detail, report.IsArabic ? "الملاحظة" : "Comment", criterion.Comment);
                });
            }
        });

    private static void Declarations(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "إقرارات الأصالة" : "Authenticity declarations", section =>
        {
            if (report.Declarations.Count == 0)
            {
                section.Item().Text(report.IsArabic ? "لا يوجد إقرار أصالة مسجل." : "No authenticity declaration is recorded.");
                return;
            }

            foreach (var declaration in report.Declarations)
            {
                section.Item().EnsureSpace(70).PaddingTop(4).Column(record =>
                {
                    record.Item().Text($"{(report.IsArabic ? "المحاولة" : "Attempt")} {declaration.AttemptNumber}").Bold();
                    Field(record, report.IsArabic ? "إصدار السياسة" : "Policy version", declaration.PolicyVersion, leftToRight: true);
                    Field(record, report.IsArabic ? "نص الإقرار المحفوظ" : "Stored declaration", declaration.Statement);
                    Field(record, report.IsArabic ? "تاريخ الإقرار" : "Declared", FormatDate(declaration.DeclaredAtUtc), leftToRight: true);
                });
            }
        });

    private static void InternalVerification(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "التحقق الداخلي" : "Internal verification", section =>
        {
            if (report.Verifications.Count == 0 && report.VerificationSamples.Count == 0)
            {
                section.Item().Text(report.IsArabic ? "لا يوجد سجل تحقق داخلي." : "No internal-verification record is available.");
                return;
            }

            foreach (var verification in report.Verifications)
            {
                section.Item().EnsureSpace(50).PaddingTop(4).Column(record =>
                {
                    record.Item().Text(LocalizeValue(verification.Decision, report.IsArabic)).Bold();
                    Field(record, report.IsArabic ? "المتحقق" : "Verifier", verification.VerifierDisplayName ?? Empty(report));
                    OptionalField(record, report.IsArabic ? "الملاحظة" : "Comment", verification.Comment);
                    Field(record, report.IsArabic ? "تاريخ القرار" : "Decision recorded", FormatDate(verification.VerifiedAtUtc), leftToRight: true);
                });
            }

            foreach (var sample in report.VerificationSamples)
            {
                section.Item().EnsureSpace(100).PaddingTop(4).Column(record =>
                {
                    record.Item().Text($"{(report.IsArabic ? "عينة المحاولة" : "Attempt sample")} {sample.AttemptNumber}").Bold();
                    Field(record, report.IsArabic ? "اختيرت بواسطة" : "Selected by", sample.SelectedByDisplayName ?? Empty(report));
                    Field(record, report.IsArabic ? "المتحقق المعيّن" : "Assigned verifier", sample.AssignedVerifierDisplayName ?? Empty(report));
                    Field(record, report.IsArabic ? "حالة العينة" : "Sample status", LocalizeValue(sample.Status, report.IsArabic));
                    Field(record, report.IsArabic ? "مبرر الاختيار" : "Selection rationale", sample.SelectionRationale);
                    OptionalField(record, report.IsArabic ? "ملاحظة القرار" : "Decision comment", sample.DecisionComment);
                    Field(record, report.IsArabic ? "تاريخ الاختيار" : "Selected", FormatDate(sample.SelectedAtUtc), leftToRight: true);
                    OptionalField(record, report.IsArabic ? "تاريخ القرار" : "Decided", FormatDate(sample.DecidedAtUtc), leftToRight: true);
                });
            }
        });

    private static void Resubmissions(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "إعادة التسليم والمحاولات" : "Resubmission and attempts", section =>
        {
            Field(section, report.IsArabic ? "المحاولة الحالية" : "Current attempt", report.AttemptNumber.ToString());
            if (report.Resubmissions.Count == 0)
            {
                section.Item().Text(report.IsArabic ? "لا يوجد تفويض إعادة تسليم مسجل." : "No resubmission authorization is recorded.");
                return;
            }

            foreach (var resubmission in report.Resubmissions)
            {
                section.Item().EnsureSpace(120).PaddingTop(4).Column(record =>
                {
                    record.Item().Text($"{(report.IsArabic ? "تفويض المحاولة" : "Attempt authorization")} {resubmission.AttemptNumber}").Bold();
                    Field(record, report.IsArabic ? "المفوّض" : "Authorized by", resubmission.AuthorizedByDisplayName ?? Empty(report));
                    Field(record, report.IsArabic ? "إصدار القواعد" : "Rule-set version", resubmission.RuleSetVersion, leftToRight: true);
                    Field(record, report.IsArabic ? "السبب" : "Reason", resubmission.Reason);
                    Field(record, report.IsArabic ? "تاريخ التفويض" : "Authorized", FormatDate(resubmission.AuthorizedAtUtc), leftToRight: true);
                    Field(record, report.IsArabic ? "الموعد النهائي" : "Due", FormatDate(resubmission.DueAtUtc), leftToRight: true);
                    OptionalField(record, report.IsArabic ? "تاريخ التسليم" : "Submitted", FormatDate(resubmission.SubmittedAtUtc), leftToRight: true);
                    OptionalField(record, report.IsArabic ? "تاريخ الإلغاء" : "Revoked", FormatDate(resubmission.RevokedAtUtc), leftToRight: true);
                });
            }
        });

    private static void Appeals(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "الاستئنافات" : "Appeals", section =>
        {
            if (report.Appeals.Count == 0)
            {
                section.Item().Text(report.IsArabic ? "لا توجد استئنافات مسجلة." : "No appeals are recorded.");
                return;
            }

            foreach (var appeal in report.Appeals)
            {
                section.Item().EnsureSpace(90).PaddingTop(4).Column(record =>
                {
                    record.Item().Text(LocalizeValue(appeal.Status, report.IsArabic)).Bold();
                    OptionalField(record, report.IsArabic ? "راجع بواسطة" : "Reviewed by", appeal.ReviewedByDisplayName);
                    Field(record, report.IsArabic ? "سبب الاستئناف" : "Appeal reason", appeal.Reason);
                    OptionalField(record, report.IsArabic ? "مبرر القرار" : "Decision rationale", appeal.DecisionRationale);
                    Field(record, report.IsArabic ? "تاريخ التقديم" : "Submitted", FormatDate(appeal.CreatedAtUtc), leftToRight: true);
                    OptionalField(record, report.IsArabic ? "تاريخ المراجعة" : "Reviewed", FormatDate(appeal.ReviewedAtUtc), leftToRight: true);
                });
            }
        });

    private static void AuditTrail(ColumnDescriptor column, AssessmentPdfReportModel report) =>
        Section(column, report.IsArabic ? "سجل التقييم والإصدارات" : "Assessment audit and version history", section =>
        {
            if (report.AuditTrail.Count == 0)
            {
                section.Item().Text(report.IsArabic ? "لا توجد أحداث أكاديمية مسجلة." : "No academic audit events are recorded.");
                return;
            }

            foreach (var auditEvent in report.AuditTrail)
            {
                section.Item().EnsureSpace(85).PaddingTop(4).Column(record =>
                {
                    record.Item().Text(LocalizeValue(auditEvent.EventType, report.IsArabic)).Bold();
                    OptionalField(record, report.IsArabic ? "المنفذ" : "Actor", auditEvent.ActorDisplayName);
                    if (!string.IsNullOrWhiteSpace(auditEvent.FromStatus) || !string.IsNullOrWhiteSpace(auditEvent.ToStatus))
                    {
                        Field(record, report.IsArabic ? "تغير الحالة" : "Status change",
                            $"{LocalizeValue(auditEvent.FromStatus, report.IsArabic)} → {LocalizeValue(auditEvent.ToStatus, report.IsArabic)}");
                    }
                    if (auditEvent.AttemptNumber.HasValue)
                        Field(record, report.IsArabic ? "رقم المحاولة" : "Attempt number", auditEvent.AttemptNumber.Value.ToString(), leftToRight: true);
                    OptionalField(record, report.IsArabic ? "السبب" : "Reason", auditEvent.Reason);
                    Field(record, report.IsArabic ? "وقت الحدث" : "Occurred", FormatDate(auditEvent.OccurredAtUtc), leftToRight: true);
                });
            }
        });

    private static void Section(ColumnDescriptor column, string title, Action<ColumnDescriptor> content)
    {
        column.Item().PaddingTop(12).Text(title).FontSize(12).SemiBold().FontColor(Colors.Blue.Darken3);
        column.Item().BorderTop(1).BorderColor(Colors.Grey.Lighten2).Height(1);
        content(column);
    }

    private static void Field(ColumnDescriptor column, string label, string value, bool leftToRight = false) =>
        column.Item().Text(text =>
        {
            text.Span($"{label}: ").SemiBold();
            var valueSpan = text.Span(value);
            if (leftToRight) valueSpan.DirectionFromLeftToRight();
        });

    private static void OptionalField(ColumnDescriptor column, string label, string? value, bool leftToRight = false)
    {
        if (!string.IsNullOrWhiteSpace(value)) Field(column, label, value, leftToRight);
    }

    private static IContainer TableHeader(IContainer container) =>
        container.Background(Colors.Blue.Lighten5).BorderBottom(1).BorderColor(Colors.Grey.Lighten1).Padding(6);

    private static IContainer TableCell(IContainer container) =>
        container.BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(6);

    private static string Empty(AssessmentPdfReportModel report) => report.IsArabic ? "غير متاح" : "Not available";

    private static string FormatDate(DateTimeOffset value) => value.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'");
    private static string? FormatDate(DateTimeOffset? value) => value.HasValue ? FormatDate(value.Value) : null;
    private static string FormatFileSize(long lengthBytes) => $"{lengthBytes:N0} bytes";

    private static string LocalizeValue(string? value, bool isArabic)
    {
        if (string.IsNullOrWhiteSpace(value)) return isArabic ? "غير مسجل" : "Not recorded";
        if (!isArabic) return Humanize(value);

        return value switch
        {
            "Draft" => "مسودة",
            "PendingPayment" => "بانتظار الدفع",
            "Paid" => "مدفوع",
            "PendingAssignment" => "بانتظار التعيين",
            "Assigned" => "مُعيّن",
            "UnderReview" => "قيد المراجعة",
            "NeedsRevision" => "بحاجة إلى مراجعة",
            "Completed" => "مكتمل",
            "Closed" => "مغلق",
            "PaymentFailed" => "فشل الدفع",
            "Cancelled" => "ملغى",
            "Refunded" => "مسترد",
            "NotYetAchieved" => "لم يتحقق بعد",
            "Pass" => "ناجح",
            "Merit" => "جيد جدًا",
            "Distinction" => "امتياز",
            "Achieved" => "متحقق",
            "PartiallyAchieved" => "متحقق جزئيًا",
            "NotAchieved" => "غير متحقق",
            "NotApplicable" => "لا ينطبق",
            "Pending" => "قيد الانتظار",
            "Accepted" => "مقبول",
            "ReturnedToAssessor" => "أعيد إلى المقيّم",
            "Submitted" => "مقدم",
            "Upheld" => "مقبول",
            "Rejected" => "مرفوض",
            "Withdrawn" => "مسحوب",
            _ => value
        };
    }

    private static string Humanize(string value)
    {
        var result = new StringBuilder(value.Length + 8);
        for (var index = 0; index < value.Length; index++)
        {
            if (index > 0 && char.IsUpper(value[index]) && !char.IsUpper(value[index - 1])) result.Append(' ');
            result.Append(value[index]);
        }

        return result.ToString();
    }
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
        if (string.IsNullOrWhiteSpace(fontDirectory) || string.IsNullOrWhiteSpace(fontFamily))
            return new DisabledAssessmentPdfRenderer("An accessible deployment font directory containing fonts and an Arabic-capable font family are required before PDF reporting can be enabled.");

        try
        {
            if (!Directory.Exists(fontDirectory)
                || !Directory.EnumerateFiles(fontDirectory, "*", SearchOption.TopDirectoryOnly).Any(IsSupportedFontFile))
                return new DisabledAssessmentPdfRenderer("An accessible deployment font directory containing fonts and an Arabic-capable font family are required before PDF reporting can be enabled.");
        }
        catch
        {
            return new DisabledAssessmentPdfRenderer("The configured deployment font directory could not be accessed safely.");
        }

        try
        {
            QuestPDF.Settings.License = license;
            QuestPDF.Settings.UseEnvironmentFonts = false;
            QuestPDF.Settings.CheckIfAllTextGlyphsAreAvailable = true;
            if (!QuestPDF.Settings.FontDiscoveryPaths.Contains(fontDirectory, StringComparer.OrdinalIgnoreCase))
                QuestPDF.Settings.FontDiscoveryPaths.Add(fontDirectory);

            var renderer = new QuestPdfAssessmentReportRenderer(fontFamily);
            renderer.ValidateConfiguredFont();
            return renderer;
        }
        catch
        {
            return new DisabledAssessmentPdfRenderer("The configured font family could not render the required English and Arabic report glyphs.");
        }
    }

    private static bool IsSupportedFontFile(string path) =>
        string.Equals(Path.GetExtension(path), ".ttf", StringComparison.OrdinalIgnoreCase)
        || string.Equals(Path.GetExtension(path), ".otf", StringComparison.OrdinalIgnoreCase);
}
