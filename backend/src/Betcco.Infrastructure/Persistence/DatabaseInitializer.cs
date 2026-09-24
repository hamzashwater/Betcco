using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Persistence;

public sealed class DatabaseInitializer(
    BetccoDbContext db,
    RoleManager<IdentityRole<Guid>> roleManager,
    UserManager<ApplicationUser> userManager,
    IConfiguration configuration)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await db.Database.MigrateAsync(cancellationToken);
        foreach (var role in new[]
        {
            PlatformRoles.Admin,
            PlatformRoles.Teacher,
            PlatformRoles.Student,
            PlatformRoles.Assessor,
            PlatformRoles.InternalVerifier,
            PlatformRoles.LeadInternalVerifier,
            PlatformRoles.CourseReviewer,
            PlatformRoles.FinanceAdmin,
            PlatformRoles.SupportAdmin,
            PlatformRoles.SystemAdmin
        })
        {
            if (!await roleManager.RoleExistsAsync(role)) await roleManager.CreateAsync(new IdentityRole<Guid>(role));
        }

        if (!await db.SiteSettings.AnyAsync(cancellationToken))
        {
            db.SiteSettings.AddRange(
                Setting("BrandName", "BETCCO", "BETCCO"),
                Setting("BrandShortName", "BETCCO", "BETCCO"),
                Setting("BrandTagline", "BETCCO — تعلّم. طبّق. حقق المعايير.", "BETCCO — Learn. Apply. Achieve."),
                Setting("BrandSecondaryMessage", "من الدرس إلى المهمة، ومن المهمة إلى تحقيق المعايير — كل ما يحتاجه طالب BTEC في مكان واحد.", "From learning to assignments and assessment criteria — everything a BTEC student needs in one place."),
                Setting("LegalDisclaimer", "BETCCO منصة تعليمية مستقلة ولا تدّعي ارتباطًا رسميًا بـ Pearson أو BTEC.", "BETCCO is an independent educational platform and does not claim official affiliation with Pearson or BTEC."),
                Setting("SupportEmail", "support@example.test", "support@example.test"));
        }
        await EnsureOperationalSettingsAsync(cancellationToken);
        await EnsureLegalSettingsAsync(cancellationToken);
        await EnsureLegalDocumentsAsync(cancellationToken);

        if (!await db.LearningTracks.AnyAsync(cancellationToken))
        {
            var btec = new LearningTrack { Slug = "btec", ArabicName = "BTEC والمهني", EnglishName = "BTEC & Vocational", ArabicDescription = "مسار BETCCO الأساسي لطلاب BTEC والتعليم المهني.", EnglishDescription = "BETCCO's primary track for BTEC and vocational students.", IsBtecFocused = true, SortOrder = 1 };
            var academic = new LearningTrack { Slug = "academic", ArabicName = "الأكاديمي", EnglishName = "Academic", ArabicDescription = "مسار للمحتوى الأكاديمي العام.", EnglishDescription = "A track for general academic learning.", SortOrder = 2 };
            var grade10 = new Grade { Slug = "grade-10", ArabicName = "العاشر", EnglishName = "Grade 10", LearningTrack = btec, SortOrder = 1 };
            var it = new Specialization { Slug = "information-technology", ArabicName = "تكنولوجيا المعلومات", EnglishName = "Information Technology", AccentColor = "#22d3ee", LearningTrack = btec, SortOrder = 1 };
            var programming = new Subject { Slug = "programming", ArabicName = "البرمجة", EnglishName = "Programming", Specialization = it, SortOrder = 1 };
            var course = new Course { Slug = "btec-programming-foundations", ArabicTitle = "أساسيات البرمجة لطلاب BTEC", EnglishTitle = "BTEC Programming Foundations", ArabicDescription = "تعلم البرمجة من المفاهيم إلى تطبيق المهارات ضمن معايير واضحة.", EnglishDescription = "Learn programming from core concepts to applied skills with clear criteria.", LearningTrack = btec, Grade = grade10, Specialization = it, Subject = programming, TeacherUserId = "seed-teacher", Status = CourseStatus.Published, Price = 12m, CoverImageKey = "seed/btec-programming-cover", SeoTitle = "BETCCO | أساسيات البرمجة BTEC", SeoDescription = "دورة BETCCO لأساسيات البرمجة لطلاب BTEC.", PublishedAtUtc = DateTimeOffset.UtcNow };
            var module = new CourseModule { Course = course, ArabicTitle = "ابدأ بالتفكير البرمجي", EnglishTitle = "Start with computational thinking", IsPublished = true, SortOrder = 1 };
            module.Lessons.Add(new Lesson { ArabicTitle = "ما هي الخوارزمية؟", EnglishTitle = "What is an algorithm?", ArabicBody = "محتوى الدرس النموذجي.", EnglishBody = "Sample lesson content.", Type = LessonType.Text, DurationSeconds = 900, IsPreview = true, IsPublished = true, SortOrder = 1 });
            module.Lessons.Add(new Lesson { ArabicTitle = "مهمة تطبيقية", EnglishTitle = "Applied assignment", Type = LessonType.Assignment, DurationSeconds = 900, IsPublished = true, SortOrder = 3 });
            course.LearningOutcomes.Add(new CourseLearningOutcome { ArabicText = "فهم الخوارزميات الأساسية.", EnglishText = "Understand fundamental algorithms.", SortOrder = 1 });
            course.Skills.Add(new CourseSkill { ArabicText = "حل المشكلات", EnglishText = "Problem solving", SortOrder = 1 });
            db.AddRange(btec, academic, grade10, it, programming, course, module);
            db.TaskTypes.Add(new TaskType { ArabicName = "مهمة برمجية", EnglishName = "Programming assignment" });
        }

        await db.SaveChangesAsync(cancellationToken);
        await EnsureSchoolTaxonomyAsync(db, cancellationToken);
        await PearsonAcademicCatalogueSeed.ApplyAsync(db, cancellationToken);
        var rubric = await db.RubricTemplates.Include(x => x.Criteria).SingleOrDefaultAsync(x => x.ArabicTitle == "معايير مهمة البرمجة", cancellationToken);
        if (rubric is null)
        {
            var grade = await db.Grades.OrderBy(x => x.SortOrder).FirstAsync(cancellationToken);
            var specialization = await db.Specializations.OrderBy(x => x.SortOrder).FirstAsync(cancellationToken);
            var taskType = await db.TaskTypes.FirstAsync(cancellationToken);
            rubric = new RubricTemplate { ArabicTitle = "معايير مهمة البرمجة", EnglishTitle = "Programming Assignment Criteria", GradeId = grade.Id, SpecializationId = specialization.Id, TaskTypeId = taskType.Id };
            db.RubricTemplates.Add(rubric);
        }
        // A complete task is divided into A, B, and C. Criterion identifiers
        // remain unique across the task (for example A.P1 and B.P1), which lets
        // the server preserve an unambiguous assessment snapshot.
        if (!rubric.Criteria.Any(x => x.Code.StartsWith("A.", StringComparison.OrdinalIgnoreCase)))
        {
            var legacyCriteria = rubric.Criteria.Where(x => x.Code is "P1" or "M1" or "D1").ToArray();
            if (legacyCriteria.Length > 0) db.RubricCriteria.RemoveRange(legacyCriteria);
            db.RubricCriteria.AddRange(CreateStructuredProgrammingCriteria(rubric.Id));
        }
        await db.SaveChangesAsync(cancellationToken);
        await SeedAdministratorAsync();
    }

    private async Task SeedAdministratorAsync()
    {
        var email = configuration["SEED_ADMIN_EMAIL"];
        var password = configuration["SEED_ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password) || await userManager.FindByEmailAsync(email) is not null) return;
        var user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true, DisplayName = "BETCCO Administrator", MustChangePassword = true };
        var result = await userManager.CreateAsync(user, password);
        if (result.Succeeded) await userManager.AddToRoleAsync(user, PlatformRoles.Admin);
    }

    private static IReadOnlyCollection<RubricCriterion> CreateStructuredProgrammingCriteria(Guid rubricTemplateId)
    {
        var criteria = new List<RubricCriterion>();
        var sections = new[]
        {
            (Code: "A", Arabic: "القسم أ", English: "Section A"),
            (Code: "B", Arabic: "القسم ب", English: "Section B"),
            (Code: "C", Arabic: "القسم ج", English: "Section C")
        };

        foreach (var (sectionCode, arabicSection, englishSection) in sections)
        {
            var sectionOrder = (sectionCode[0] - 'A') * 10;
            for (var number = 1; number <= 4; number++)
            {
                criteria.Add(new RubricCriterion
                {
                    RubricTemplateId = rubricTemplateId,
                    Code = $"{sectionCode}.P{number}",
                    ArabicDescription = $"{arabicSection} — معيار النجاح P{number}: يطبق متطلبات المهمة الأساسية بصورة صحيحة.",
                    EnglishDescription = $"{englishSection} — Pass criterion P{number}: apply the core task requirements correctly.",
                    SortOrder = sectionOrder + number
                });
            }
            for (var number = 1; number <= 3; number++)
            {
                criteria.Add(new RubricCriterion
                {
                    RubricTemplateId = rubricTemplateId,
                    Code = $"{sectionCode}.M{number}",
                    ArabicDescription = $"{arabicSection} — معيار التفوق M{number}: يفسر ويبرر القرارات التقنية بوضوح.",
                    EnglishDescription = $"{englishSection} — Merit criterion M{number}: explain and justify technical decisions clearly.",
                    SortOrder = sectionOrder + 4 + number
                });
            }
            for (var number = 1; number <= 3; number++)
            {
                criteria.Add(new RubricCriterion
                {
                    RubricTemplateId = rubricTemplateId,
                    Code = $"{sectionCode}.D{number}",
                    ArabicDescription = $"{arabicSection} — معيار الامتياز D{number}: يحلل الحل ويطوره بتبرير تقني متقدم.",
                    EnglishDescription = $"{englishSection} — Distinction criterion D{number}: analyse and improve the solution with advanced technical justification.",
                    SortOrder = sectionOrder + 7 + number
                });
            }
        }

        return criteria;
    }

    public static async Task EnsureSchoolTaxonomyAsync(BetccoDbContext db, CancellationToken cancellationToken = default)
    {
        var tracks = await db.LearningTracks
            .Where(x => x.Slug == "btec" || x.Slug == "academic")
            .ToListAsync(cancellationToken);

        foreach (var track in tracks)
        {
            await EnsureGradeAsync(db, track, "grade-10", "العاشر", "Grade 10", 1, cancellationToken);
            await EnsureGradeAsync(db, track, "first-secondary", "الأول الثانوي", "First Secondary", 2, cancellationToken);
            await EnsureGradeAsync(db, track, "tawjihi", "الثاني الثانوي (التوجيهي)", "Tawjihi", 3, cancellationToken);

            await EnsureSpecializationAsync(db, track, "information-technology", "تكنولوجيا المعلومات (IT)", "Information Technology (IT)", "#22d3ee", 1, cancellationToken);
            await EnsureSpecializationAsync(db, track, "business", "الأعمال", "Business", "#f59e0b", 2, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task EnsureGradeAsync(BetccoDbContext db, LearningTrack track, string slug, string arabicName, string englishName, int sortOrder, CancellationToken cancellationToken)
    {
        var grade = await db.Grades.SingleOrDefaultAsync(x => x.LearningTrackId == track.Id && x.Slug == slug, cancellationToken);
        if (grade is null)
        {
            db.Grades.Add(new Grade { LearningTrackId = track.Id, Slug = slug, ArabicName = arabicName, EnglishName = englishName, SortOrder = sortOrder });
            return;
        }

        // Preserve administrator edits and archival on subsequent startups.
    }

    private static async Task EnsureSpecializationAsync(BetccoDbContext db, LearningTrack track, string slug, string arabicName, string englishName, string accentColor, int sortOrder, CancellationToken cancellationToken)
    {
        var specialization = await db.Specializations.SingleOrDefaultAsync(x => x.LearningTrackId == track.Id && x.Slug == slug, cancellationToken);
        if (specialization is null)
        {
            db.Specializations.Add(new Specialization { LearningTrackId = track.Id, Slug = slug, ArabicName = arabicName, EnglishName = englishName, AccentColor = accentColor, SortOrder = sortOrder });
            return;
        }

        // Preserve administrator edits and archival on subsequent startups.
    }

    private async Task EnsureLegalSettingsAsync(CancellationToken cancellationToken)
    {
        var defaults = new[]
        {
            Setting("LegalOwnerName", "HAMZA QAHIR ALSHWATER", "HAMZA QAHIR ALSHWATER"),
            Setting("LegalRegistrationNumber", "يُستكمل قبل النشر", "Complete before publication"),
            Setting("LegalAddress", "يُستكمل قبل النشر", "Complete before publication"),
            Setting("PrivacyEmail", "privacy@example.test", "privacy@example.test"),
            Setting("ComplaintsEmail", "complaints@example.test", "complaints@example.test"),
            Setting("CopyrightEmail", "copyright@example.test", "copyright@example.test"),
              Setting("SecurityEmail", "security@example.test", "security@example.test"),
              Setting("BtecDisclaimer", "BETCCO منصة تعليمية مستقلة تقدم مواد مساندة للدارسين في برامج ومساقات BTEC. لا تمثل المنصة Pearson ولا تدّعي أنها Pearson BTEC Approved Centre أو أنها جهة مانحة لشهادات Pearson، ما لم يتم الإعلان صراحة عن اعتماد رسمي موثق.", "BETCCO is an independent educational platform that provides supporting materials to learners in BTEC programmes and courses. It does not represent Pearson, claim to be a Pearson BTEC Approved Centre, or award Pearson certificates unless a documented official accreditation is expressly announced."),
              Setting("LegalPackageVersion", "1.0", "1.0"),
            Setting("LegalLastUpdated", "25/08/2026", "2026-08-25"),
            Setting("LegalJurisdiction", "المملكة الأردنية الهاشمية", "Hashemite Kingdom of Jordan")
        };
        var keys = defaults.Select(setting => setting.Key).ToArray();
        var existing = await db.SiteSettings.Where(setting => keys.Contains(setting.Key)).Select(setting => setting.Key).ToListAsync(cancellationToken);
        db.SiteSettings.AddRange(defaults.Where(setting => !existing.Contains(setting.Key, StringComparer.Ordinal)));
    }

    private async Task EnsureOperationalSettingsAsync(CancellationToken cancellationToken)
    {
        var defaults = new[]
        {
            Setting("PlatformCommissionPercent", "30", "30"),
            // Tax needs a jurisdiction-specific decision. It remains zero until
            // an administrator configures the legally applicable percentage.
            Setting("SalesTaxPercent", "0", "0")
        };
        var keys = defaults.Select(setting => setting.Key).ToArray();
        var existing = await db.SiteSettings.Where(setting => keys.Contains(setting.Key)).Select(setting => setting.Key).ToListAsync(cancellationToken);
        db.SiteSettings.AddRange(defaults.Where(setting => !existing.Contains(setting.Key, StringComparer.Ordinal)));
    }

    private async Task EnsureLegalDocumentsAsync(CancellationToken cancellationToken)
    {
        var slugs = LegalPackageSeed.Documents.Select(document => document.Slug).ToArray();
        var existing = await db.LegalDocuments.Where(document => slugs.Contains(document.Slug)).Select(document => document.Slug).ToListAsync(cancellationToken);
        db.LegalDocuments.AddRange(LegalPackageSeed.Documents.Where(document => !existing.Contains(document.Slug, StringComparer.Ordinal)));
    }

    private static SiteSetting Setting(string key, string arabic, string english) => new() { Key = key, ArabicValue = arabic, EnglishValue = english };
}
