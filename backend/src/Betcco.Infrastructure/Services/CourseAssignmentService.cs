using Betcco.Application.Assignments;
using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Application.Learning;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json;

namespace Betcco.Infrastructure.Services;

public sealed class CourseAssignmentService(
    BetccoDbContext db,
    IFileStorage storage,
    IFileSecurityScanner scanner,
    IEmailNotificationService emailNotifications,
    IContentAccessService contentAccess,
    IStorageLifecycleCoordinator? storageLifecycle = null,
    ICourseAssignmentDeadlineResolver? deadlineResolver = null) : ICourseAssignmentService
{
    private readonly ICourseAssignmentDeadlineResolver deadlineResolverService = deadlineResolver ?? new CourseAssignmentDeadlineResolver(db);
    public async Task<PracticeCreationResult> CreateComprehensivePracticeAsync(string teacherUserId, CreateComprehensivePracticeCommand command, CancellationToken cancellationToken = default)
    {
        var module = await db.CourseModules.AsNoTracking().Include(x => x.Course)
            .SingleOrDefaultAsync(x => x.Id == command.CourseModuleId, cancellationToken);
        if (module?.UnitDefinitionId is null || module.Course?.TeacherUserId != teacherUserId
            || !CanManageAssignments(module.Course.Status)
            || !ValidComprehensiveContent(command.ArabicTitle, command.EnglishTitle,
                command.ArabicInstructions, command.EnglishInstructions, command.DueAtUtc))
            return new PracticeCreationResult(PracticeCreateStatus.Invalid);
        if (await db.CourseAssignments.AnyAsync(x => x.CourseModuleId == module.Id
            && x.Purpose == CourseAssignmentPurpose.ComprehensivePractice, cancellationToken))
            return new PracticeCreationResult(PracticeCreateStatus.Conflict);
        var assignment = new CourseAssignment
        {
            CourseId = module.CourseId,
            CourseModuleId = module.Id,
            Purpose = CourseAssignmentPurpose.ComprehensivePractice,
            ArabicTitle = command.ArabicTitle.Trim(),
            EnglishTitle = command.EnglishTitle.Trim(),
            ArabicInstructions = command.ArabicInstructions.Trim(),
            EnglishInstructions = command.EnglishInstructions.Trim(),
            DueAtUtc = command.DueAtUtc,
            MaxScore = null,
            MaxSubmissionAttempts = 1,
            AllowResubmission = false,
            IsPublished = false,
            PublicationStatus = ContentPublicationStatus.Draft
        };
        db.CourseAssignments.Add(assignment);
        db.AuditLogs.Add(Audit(teacherUserId, "ComprehensivePracticeCreated", nameof(CourseAssignment), assignment.Id.ToString()));
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateException error) when (error.InnerException is PostgresException postgres
            && postgres.SqlState == PostgresErrorCodes.UniqueViolation
            && postgres.ConstraintName == "IX_CourseAssignments_CourseModuleId_ComprehensivePractice")
        {
            return new PracticeCreationResult(PracticeCreateStatus.Conflict);
        }
        return new PracticeCreationResult(PracticeCreateStatus.Created, assignment.Id);
    }

    public async Task<bool> UpdateComprehensivePracticeAsync(string teacherUserId, Guid assignmentId, UpdateComprehensivePracticeCommand command, CancellationToken cancellationToken = default)
    {
        var assignment = await OwnedAssignmentAsync(teacherUserId, assignmentId, cancellationToken);
        if (assignment is null || assignment.Purpose != CourseAssignmentPurpose.ComprehensivePractice
            || assignment.IsPublished || assignment.PublicationStatus != ContentPublicationStatus.Draft
            || await db.CourseAssignmentSubmissions.AnyAsync(x => x.CourseAssignmentId == assignmentId, cancellationToken)
            || !ValidComprehensiveContent(command.ArabicTitle, command.EnglishTitle,
                command.ArabicInstructions, command.EnglishInstructions, command.DueAtUtc)
            || assignment.DueAtUtc != command.DueAtUtc
                && await db.CourseAssignmentDeadlineExtensions.AnyAsync(x => x.CourseAssignmentId == assignmentId && x.RevokedAtUtc == null, cancellationToken))
            return false;
        assignment.ArabicTitle = command.ArabicTitle.Trim();
        assignment.EnglishTitle = command.EnglishTitle.Trim();
        assignment.ArabicInstructions = command.ArabicInstructions.Trim();
        assignment.EnglishInstructions = command.EnglishInstructions.Trim();
        assignment.DueAtUtc = command.DueAtUtc;
        db.AuditLogs.Add(Audit(teacherUserId, "ComprehensivePracticeUpdated", nameof(CourseAssignment), assignment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> CreatePracticeAsync(string teacherUserId, CreateLearningAimPracticeCommand command, CancellationToken cancellationToken = default)
    {
        var aim = await db.BtecLearningAims.AsNoTracking()
            .Include(x => x.LearningAimDefinition)
            .Include(x => x.CourseModule).ThenInclude(x => x!.Course)
            .SingleOrDefaultAsync(x => x.Id == command.LearningAimId, cancellationToken);
        if (aim?.CourseModule?.UnitDefinitionId is null
            || aim.LearningAimDefinition?.UnitDefinitionId != aim.CourseModule.UnitDefinitionId
            || aim.CourseModule.Course?.TeacherUserId != teacherUserId
            || !CanManageAssignments(aim.CourseModule.Course.Status)
            || string.IsNullOrWhiteSpace(command.ArabicTitle) || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || string.IsNullOrWhiteSpace(command.ArabicInstructions) || string.IsNullOrWhiteSpace(command.EnglishInstructions)
            || command.ArabicTitle.Length > 256 || command.EnglishTitle.Length > 256
            || command.ArabicInstructions.Length > 4_000 || command.EnglishInstructions.Length > 4_000
            || command.MaxSubmissionAttempts is < 1 or > 10
            || command.DueAtUtc <= DateTimeOffset.UtcNow
            || await db.CourseAssignments.AnyAsync(x => x.Purpose == CourseAssignmentPurpose.LearningAimPractice
                && x.BtecLearningAimId == command.LearningAimId, cancellationToken)) return null;
        var assignment = new CourseAssignment
        {
            CourseId = aim.CourseModule.CourseId,
            CourseModuleId = aim.CourseModuleId,
            BtecLearningAimId = aim.Id,
            Purpose = CourseAssignmentPurpose.LearningAimPractice,
            ArabicTitle = command.ArabicTitle.Trim(),
            EnglishTitle = command.EnglishTitle.Trim(),
            ArabicInstructions = command.ArabicInstructions.Trim(),
            EnglishInstructions = command.EnglishInstructions.Trim(),
            DueAtUtc = command.DueAtUtc,
            MaxScore = null,
            MaxSubmissionAttempts = command.MaxSubmissionAttempts,
            AllowResubmission = false,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        db.CourseAssignments.Add(assignment);
        db.AuditLogs.Add(Audit(teacherUserId, "LearningAimPracticeCreated", nameof(CourseAssignment), assignment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return assignment.Id;
    }

    public async Task<bool> UpdatePracticeAttemptLimitAsync(string teacherUserId, Guid assignmentId,
        UpdateLearningAimPracticeAttemptLimitCommand command, CancellationToken cancellationToken = default)
    {
        if (command.MaxSubmissionAttempts is < 1 or > 10) return false;
        var assignment = await OwnedAssignmentAsync(teacherUserId, assignmentId, cancellationToken);
        if (assignment is null
            || assignment.Purpose != CourseAssignmentPurpose.LearningAimPractice
            || !CanManageAssignments(assignment.Course!.Status)) return false;
        var highestStartedAttempt = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Where(x => x.CourseAssignmentId == assignmentId)
            .Select(x => (int?)x.CurrentVersionNumber)
            .MaxAsync(cancellationToken) ?? 0;
        if (command.MaxSubmissionAttempts < highestStartedAttempt) return false;
        assignment.MaxSubmissionAttempts = command.MaxSubmissionAttempts;
        db.AuditLogs.Add(Audit(teacherUserId, "LearningAimPracticeAttemptLimitUpdated",
            nameof(CourseAssignment), assignment.Id.ToString(), command.MaxSubmissionAttempts.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public Task<PracticeReviewResult> ReviewPracticeAsync(string teacherUserId, Guid submissionId, ReviewLearningAimPracticeCommand command, CancellationToken cancellationToken = default) =>
        ReviewTrainingPracticeAsync(teacherUserId, submissionId, command, CourseAssignmentPurpose.LearningAimPractice, cancellationToken);

    public Task<PracticeReviewResult> ReviewComprehensivePracticeAsync(string teacherUserId, Guid submissionId, ReviewLearningAimPracticeCommand command, CancellationToken cancellationToken = default) =>
        ReviewTrainingPracticeAsync(teacherUserId, submissionId, command, CourseAssignmentPurpose.ComprehensivePractice, cancellationToken);

    private async Task<PracticeReviewResult> ReviewTrainingPracticeAsync(string teacherUserId, Guid submissionId, ReviewLearningAimPracticeCommand command, CourseAssignmentPurpose purpose, CancellationToken cancellationToken)
    {
        var submission = await db.CourseAssignmentSubmissions.AsNoTracking()
            .Where(x => x.Id == submissionId
                && x.CourseAssignment!.Purpose == purpose
                && x.CourseAssignment.Course!.TeacherUserId == teacherUserId)
            .Select(x => new
            {
                x.StudentUserId,
                x.Status,
                x.CurrentVersionNumber,
                x.CourseAssignment!.CourseId,
                x.CourseAssignment.Purpose
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (submission is null || !Enum.TryParse<TrainingOutcome>(command.TrainingOutcome, true, out var outcome)
            || !Enum.IsDefined(outcome)
            || string.IsNullOrWhiteSpace(command.Strengths) || string.IsNullOrWhiteSpace(command.Gaps)
            || string.IsNullOrWhiteSpace(command.ImprovementGuidance)
            || command.Strengths.Length > 4_000 || command.Gaps.Length > 4_000
            || command.ImprovementGuidance.Length > 4_000
            || !await db.Enrollments.AnyAsync(x => x.CourseId == submission.CourseId
                && x.StudentUserId == submission.StudentUserId, cancellationToken)) return PracticeReviewResult.Invalid;
        if (submission.Status != CourseAssignmentSubmissionStatus.Submitted)
            return submission.Status == CourseAssignmentSubmissionStatus.Finalized ? PracticeReviewResult.Conflict : PracticeReviewResult.Invalid;

        var now = DateTimeOffset.UtcNow;
        var strengths = command.Strengths.Trim();
        var gaps = command.Gaps.Trim();
        var guidance = command.ImprovementGuidance.Trim();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var updated = await db.CourseAssignmentSubmissions
            .Where(x => x.Id == submissionId && x.Status == CourseAssignmentSubmissionStatus.Submitted
                && x.CourseAssignment!.Purpose == purpose
                && x.CourseAssignment.Course!.TeacherUserId == teacherUserId
                && db.Enrollments.Any(enrollment => enrollment.CourseId == x.CourseAssignment.CourseId
                    && enrollment.StudentUserId == x.StudentUserId))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.Status, CourseAssignmentSubmissionStatus.Finalized)
                .SetProperty(x => x.TrainingOutcome, (TrainingOutcome?)outcome)
                .SetProperty(x => x.TrainingStrengths, strengths)
                .SetProperty(x => x.TrainingGaps, gaps)
                .SetProperty(x => x.TrainingImprovementGuidance, guidance)
                .SetProperty(x => x.GradedAtUtc, now)
                .SetProperty(x => x.UpdatedAtUtc, now), cancellationToken);
        if (updated != 1) return PracticeReviewResult.Conflict;
        if (purpose == CourseAssignmentPurpose.LearningAimPractice)
        {
            var attemptUpdated = await db.CourseAssignmentSubmissionVersions
                .Where(x => x.CourseAssignmentSubmissionId == submissionId
                    && x.VersionNumber == submission.CurrentVersionNumber
                    && x.TrainingOutcome == null)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.TrainingOutcome, (TrainingOutcome?)outcome)
                    .SetProperty(x => x.TrainingStrengths, strengths)
                    .SetProperty(x => x.TrainingGaps, gaps)
                    .SetProperty(x => x.TrainingImprovementGuidance, guidance)
                    .SetProperty(x => x.ReviewedAtUtc, now)
                    .SetProperty(x => x.ReviewedByUserId, teacherUserId)
                    .SetProperty(x => x.UpdatedAtUtc, now), cancellationToken);
            if (attemptUpdated != 1) return PracticeReviewResult.Conflict;
        }
        db.AuditLogs.Add(Audit(teacherUserId, submission.Purpose == CourseAssignmentPurpose.ComprehensivePractice
            ? "ComprehensivePracticeReviewed" : "LearningAimPracticeReviewed", nameof(CourseAssignmentSubmission), submissionId.ToString(), outcome.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return PracticeReviewResult.Finalized;
    }

    public async Task<Guid?> CreateAsync(string teacherUserId, CreateCourseAssignmentCommand command, CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.SingleOrDefaultAsync(course => course.Id == command.CourseId && course.TeacherUserId == teacherUserId, cancellationToken);
        if (course is null
            || !CanManageAssignments(course.Status)
            || string.IsNullOrWhiteSpace(command.ArabicTitle)
            || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || string.IsNullOrWhiteSpace(command.ArabicInstructions)
            || string.IsNullOrWhiteSpace(command.EnglishInstructions)
            || command.MaxSubmissionAttempts is < 1 or > 10
            || command.MaxScore is null or <= 0
            || command.AvailableFromUtc is { } startsAt && command.DueAtUtc is { } dueAt && startsAt >= dueAt
            || !TryNormalizeUploadPolicy(command.MaxFileSizeBytes, command.AllowedFileExtensions, out var allowedExtensions)) return null;
        if (!await HasValidContextAsync(course.Id, command.ModuleId, command.LessonId, command.LearningAimId, cancellationToken)) return null;

        var assignment = new CourseAssignment
        {
            CourseId = course.Id,
            CourseModuleId = command.ModuleId,
            LessonId = command.LessonId,
            BtecLearningAimId = command.LearningAimId,
            ArabicTitle = command.ArabicTitle.Trim(),
            EnglishTitle = command.EnglishTitle.Trim(),
            ArabicInstructions = command.ArabicInstructions.Trim(),
            EnglishInstructions = command.EnglishInstructions.Trim(),
            AvailableFromUtc = command.AvailableFromUtc,
            DueAtUtc = command.DueAtUtc,
            MaxSubmissionAttempts = command.MaxSubmissionAttempts,
            AllowResubmission = command.AllowResubmission,
            MaxFileSizeBytes = command.MaxFileSizeBytes,
            AllowedFileExtensionsJson = JsonSerializer.Serialize(allowedExtensions),
            AssessmentRuleSetVersion = BtecAssessmentRuleSet.Default.Version,
            AssessmentRuleSetJson = BtecAssessmentRuleSet.DefaultJson,
            MaxScore = command.MaxScore,
            IsPublished = false,
            PublicationStatus = ContentPublicationStatus.Draft
        };
        db.CourseAssignments.Add(assignment);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentCreated", nameof(CourseAssignment), assignment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return assignment.Id;
    }

    public async Task<bool> UpdateAsync(string teacherUserId, Guid assignmentId, UpdateCourseAssignmentCommand command, CancellationToken cancellationToken = default)
    {
        var assignment = await OwnedAssignmentAsync(teacherUserId, assignmentId, cancellationToken);
        if (assignment is null || assignment.Purpose != CourseAssignmentPurpose.Coursework
            || assignment.PublicationStatus != ContentPublicationStatus.Draft
            || string.IsNullOrWhiteSpace(command.ArabicTitle)
            || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || string.IsNullOrWhiteSpace(command.ArabicInstructions)
            || string.IsNullOrWhiteSpace(command.EnglishInstructions)
            || command.MaxSubmissionAttempts is < 1 or > 10
            || command.MaxScore is null or <= 0
            || command.AvailableFromUtc is { } startsAt && command.DueAtUtc is { } dueAt && startsAt >= dueAt
            || !TryNormalizeUploadPolicy(command.MaxFileSizeBytes, command.AllowedFileExtensions, out var allowedExtensions)
            || assignment.DueAtUtc != command.DueAtUtc && await db.CourseAssignmentDeadlineExtensions.AnyAsync(extension => extension.CourseAssignmentId == assignmentId && extension.RevokedAtUtc == null, cancellationToken)
            || !await HasValidContextAsync(assignment.CourseId, command.ModuleId, command.LessonId, command.LearningAimId, cancellationToken)) return false;
        assignment.CourseModuleId = command.ModuleId;
        assignment.LessonId = command.LessonId;
        assignment.BtecLearningAimId = command.LearningAimId;
        assignment.ArabicTitle = command.ArabicTitle.Trim();
        assignment.EnglishTitle = command.EnglishTitle.Trim();
        assignment.ArabicInstructions = command.ArabicInstructions.Trim();
        assignment.EnglishInstructions = command.EnglishInstructions.Trim();
        assignment.AvailableFromUtc = command.AvailableFromUtc;
        assignment.DueAtUtc = command.DueAtUtc;
        assignment.MaxSubmissionAttempts = command.MaxSubmissionAttempts;
        assignment.AllowResubmission = command.AllowResubmission;
        assignment.MaxFileSizeBytes = command.MaxFileSizeBytes;
        assignment.AllowedFileExtensionsJson = JsonSerializer.Serialize(allowedExtensions);
        assignment.MaxScore = command.MaxScore;
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentUpdated", nameof(CourseAssignment), assignment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken = default)
    {
        var assignment = await OwnedAssignmentAsync(teacherUserId, assignmentId, cancellationToken);
        if (assignment is null || assignment.Purpose != CourseAssignmentPurpose.Coursework || assignment.PublicationStatus != ContentPublicationStatus.Draft
            || await db.CourseAssignmentSubmissions.AnyAsync(submission => submission.CourseAssignmentId == assignmentId, cancellationToken)
            || await db.CourseAssignmentDeadlineExtensions.AnyAsync(extension => extension.CourseAssignmentId == assignmentId, cancellationToken)) return false;
        db.CourseAssignments.Remove(assignment);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentDeleted", nameof(CourseAssignment), assignmentId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddCriterionAsync(string teacherUserId, AddCourseAssignmentCriterionCommand command, CancellationToken cancellationToken = default)
    {
        var assignment = await OwnedAssignmentAsync(teacherUserId, command.AssignmentId, cancellationToken);
        if (assignment is null || assignment.Purpose is not (CourseAssignmentPurpose.Coursework or CourseAssignmentPurpose.ComprehensivePractice)
            || assignment.Purpose == CourseAssignmentPurpose.Coursework && assignment.PublicationStatus != ContentPublicationStatus.Draft
            || assignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice
                && await db.CourseAssignmentSubmissions.AnyAsync(x => x.CourseAssignmentId == assignment.Id, cancellationToken)) return null;

        string code;
        BtecCriterionBand band;
        string arabicDescription;
        string englishDescription;
        if (command.BtecCriterionId is { } btecCriterionId)
        {
            var source = await db.BtecCriteria.Include(criterion => criterion.CourseModule)
                .Include(criterion => criterion.BtecLearningAim)
                .Include(criterion => criterion.AssessmentCriterionDefinition).ThenInclude(x => x!.LearningAimDefinition)
                .SingleOrDefaultAsync(criterion => criterion.Id == btecCriterionId
                    && criterion.CourseModule!.CourseId == assignment.CourseId
                    && (!assignment.CourseModuleId.HasValue || criterion.CourseModuleId == assignment.CourseModuleId), cancellationToken);
            if (source is null) return null;
            if (source.CourseModule!.UnitDefinitionId is not null && source.AssessmentCriterionDefinition is null) return null;
            if (assignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice
                && (source.CourseModuleId != assignment.CourseModuleId
                    || source.AssessmentCriterionDefinition is null
                    || source.BtecLearningAim is null
                    || source.AssessmentCriterionDefinition?.LearningAimDefinition?.UnitDefinitionId != source.CourseModule.UnitDefinitionId
                    || source.BtecLearningAim.LearningAimDefinitionId != source.AssessmentCriterionDefinition?.LearningAimDefinitionId)) return null;
            code = source.AssessmentCriterionDefinition?.Code ?? source.Code;
            band = source.AssessmentCriterionDefinition?.Band ?? source.Band;
            arabicDescription = source.AssessmentCriterionDefinition?.ArabicDescription ?? source.ArabicDescription;
            englishDescription = source.AssessmentCriterionDefinition?.EnglishDescription ?? source.EnglishDescription;
        }
        else
        {
            if (assignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice) return null;
            if (assignment.CourseModuleId is { } moduleId
                && await db.CourseModules.AnyAsync(x => x.Id == moduleId && x.UnitDefinitionId != null, cancellationToken)) return null;
            if (!TryCriterion(command.Code, command.Band, out code, out band)
                || string.IsNullOrWhiteSpace(command.ArabicDescription)
                || string.IsNullOrWhiteSpace(command.EnglishDescription)) return null;
            arabicDescription = command.ArabicDescription.Trim();
            englishDescription = command.EnglishDescription.Trim();
        }
        if (await db.CourseAssignmentCriteria.AnyAsync(criterion => criterion.CourseAssignmentId == assignment.Id && criterion.Code == code, cancellationToken)) return null;
        var criterion = new CourseAssignmentCriterion
        {
            CourseAssignmentId = assignment.Id,
            BtecCriterionId = command.BtecCriterionId,
            Code = code,
            Band = band,
            ArabicDescription = arabicDescription,
            EnglishDescription = englishDescription,
            SortOrder = Math.Max(0, command.SortOrder)
        };
        db.CourseAssignmentCriteria.Add(criterion);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentCriterionAdded", nameof(CourseAssignmentCriterion), criterion.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return criterion.Id;
    }

    public async Task<bool> DeleteCriterionAsync(string teacherUserId, Guid criterionId, CancellationToken cancellationToken = default)
    {
        var criterion = await db.CourseAssignmentCriteria.Include(item => item.CourseAssignment).ThenInclude(item => item!.Course).SingleOrDefaultAsync(item => item.Id == criterionId && item.CourseAssignment!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (criterion is null || criterion.CourseAssignment!.Purpose is not (CourseAssignmentPurpose.Coursework or CourseAssignmentPurpose.ComprehensivePractice)
            || criterion.CourseAssignment.Purpose == CourseAssignmentPurpose.Coursework && criterion.CourseAssignment.PublicationStatus != ContentPublicationStatus.Draft
            || criterion.CourseAssignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice
                && await db.CourseAssignmentSubmissions.AnyAsync(x => x.CourseAssignmentId == criterion.CourseAssignmentId, cancellationToken)) return false;
        db.CourseAssignmentCriteria.Remove(criterion);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentCriterionDeleted", nameof(CourseAssignmentCriterion), criterionId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> PublishAsync(string teacherUserId, Guid assignmentId, bool publish, CancellationToken cancellationToken = default)
    {
        var assignment = await OwnedAssignmentAsync(teacherUserId, assignmentId, cancellationToken);
        if (assignment is null) return false;
        if (assignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice)
        {
            if (await db.CourseAssignmentSubmissions.AnyAsync(x => x.CourseAssignmentId == assignmentId, cancellationToken)
                || publish && !await CanPublishComprehensiveAsync(assignment, cancellationToken))
                return false;
            assignment.IsPublished = publish;
            assignment.PublicationStatus = publish ? ContentPublicationStatus.Published : ContentPublicationStatus.Draft;
            db.AuditLogs.Add(Audit(teacherUserId, publish ? "ComprehensivePracticePublished" : "ComprehensivePracticeUnpublished",
                nameof(CourseAssignment), assignment.Id.ToString()));
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        if (assignment.Purpose != CourseAssignmentPurpose.Coursework) return false;
        if (publish && !await db.CourseAssignmentCriteria.AnyAsync(criterion => criterion.CourseAssignmentId == assignment.Id, cancellationToken)) return false;
        if (!publish && await db.CourseAssignmentSubmissions.AnyAsync(submission => submission.CourseAssignmentId == assignment.Id && submission.Status != CourseAssignmentSubmissionStatus.Draft, cancellationToken)) return false;
        assignment.IsPublished = publish;
        assignment.PublicationStatus = publish ? ContentPublicationStatus.Published : ContentPublicationStatus.Draft;
        db.AuditLogs.Add(Audit(teacherUserId, publish ? "CourseAssignmentPublished" : "CourseAssignmentUnpublished", nameof(CourseAssignment), assignment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> SetPublicationStatusAsync(string teacherUserId, Guid assignmentId, string publicationStatus, DateTimeOffset? availableFromUtc, CancellationToken cancellationToken = default)
    {
        var assignment = await OwnedAssignmentAsync(teacherUserId, assignmentId, cancellationToken);
        if (assignment is null || assignment.Purpose != CourseAssignmentPurpose.Coursework
            || !TryPublicationStatus(publicationStatus, out var status)
            || status == ContentPublicationStatus.Published && !await db.CourseAssignmentCriteria.AnyAsync(item => item.CourseAssignmentId == assignmentId, cancellationToken)
            || status is ContentPublicationStatus.Archived or ContentPublicationStatus.Scheduled && await db.CourseAssignmentSubmissions.AnyAsync(item => item.CourseAssignmentId == assignmentId && item.Status == CourseAssignmentSubmissionStatus.Submitted, cancellationToken)
            || status == ContentPublicationStatus.Scheduled && availableFromUtc <= DateTimeOffset.UtcNow)
            return false;

        assignment.PublicationStatus = status;
        assignment.IsPublished = status == ContentPublicationStatus.Published;
        assignment.AvailableFromUtc = status == ContentPublicationStatus.Scheduled ? availableFromUtc : assignment.AvailableFromUtc;
        db.AuditLogs.Add(Audit(teacherUserId, $"CourseAssignmentPublication{status}", nameof(CourseAssignment), assignment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> AddResourceAsync(string teacherUserId, Guid assignmentId, string displayName, string storageKey, string contentType, CancellationToken cancellationToken = default)
    {
        var assignment = await OwnedAssignmentAsync(teacherUserId, assignmentId, cancellationToken);
        if (assignment is null || string.IsNullOrWhiteSpace(displayName) || string.IsNullOrWhiteSpace(storageKey) || string.IsNullOrWhiteSpace(contentType)
            || assignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice
                && await db.CourseAssignmentSubmissions.AnyAsync(x => x.CourseAssignmentId == assignment.Id, cancellationToken))
            return false;
        db.CourseAssignmentResources.Add(new CourseAssignmentResource
        {
            CourseAssignmentId = assignment.Id,
            DisplayName = Path.GetFileName(displayName.Trim()),
            StorageKey = storageKey,
            ContentType = contentType.Trim(),
            ScanStatus = UploadScanStatus.Clean
        });
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentResourceAdded", nameof(CourseAssignment), assignment.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteResourceAsync(string teacherUserId, Guid resourceId, CancellationToken cancellationToken = default)
    {
        var resource = await db.CourseAssignmentResources
            .Include(item => item.CourseAssignment).ThenInclude(item => item!.Course)
            .SingleOrDefaultAsync(item => item.Id == resourceId && item.CourseAssignment!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (resource is null
            || resource.CourseAssignment!.Purpose == CourseAssignmentPurpose.ComprehensivePractice
                && await db.CourseAssignmentSubmissions.AnyAsync(x => x.CourseAssignmentId == resource.CourseAssignmentId, cancellationToken))
            return false;
        var deletion = storageLifecycle?.EnqueueDeletion(resource.StorageKey);
        db.CourseAssignmentResources.Remove(resource);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentResourceDeleted", nameof(CourseAssignmentResource), resourceId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        if (deletion is not null) await storageLifecycle!.TryProcessNowAsync(deletion.Id, cancellationToken);
        return true;
    }

    public async Task<CourseAssignmentSubmissionView?> StartSubmissionAsync(string studentUserId, Guid assignmentId, string? comment, CancellationToken cancellationToken = default)
    {
        var assignment = await db.CourseAssignments.AsNoTracking().SingleOrDefaultAsync(item => item.Id == assignmentId && item.PublicationStatus == ContentPublicationStatus.Published && item.IsPublished, cancellationToken);
        if (assignment is null) return null;
        var deadline = await deadlineResolverService.ResolveAsync(assignment.Id, studentUserId, assignment.DueAtUtc, cancellationToken);
        if (assignment.AvailableFromUtc > DateTimeOffset.UtcNow
            || deadline.EffectiveDueAtUtc < DateTimeOffset.UtcNow
            || !await db.Enrollments.AnyAsync(enrollment => enrollment.CourseId == assignment.CourseId && enrollment.StudentUserId == studentUserId && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)) return null;
        if (!(await contentAccess.CanAccessAsync(studentUserId, assignment.CourseId, LearningContentType.Assignment, assignmentId, cancellationToken)).IsAvailable) return null;
        var submission = await db.CourseAssignmentSubmissions.Include(item => item.Versions).SingleOrDefaultAsync(item => item.CourseAssignmentId == assignmentId && item.StudentUserId == studentUserId, cancellationToken);
        var configuredRuleSetJson = string.IsNullOrWhiteSpace(assignment.AssessmentRuleSetJson)
            ? BtecAssessmentRuleSet.DefaultJson
            : assignment.AssessmentRuleSetJson;
        if (!BtecAssessmentRuleSet.TryRead(configuredRuleSetJson, out var configuredRuleSet)) return null;

        if (submission is null)
        {
            submission = new CourseAssignmentSubmission
            {
                CourseAssignmentId = assignmentId,
                StudentUserId = studentUserId,
                CurrentVersionNumber = 1,
                AssessmentRuleSetVersion = configuredRuleSet.Version,
                AssessmentRuleSetSnapshotJson = JsonSerializer.Serialize(configuredRuleSet)
            };
            submission.Versions.Add(new CourseAssignmentSubmissionVersion { VersionNumber = 1, StudentComment = TrimOrNull(comment) });
            db.CourseAssignmentSubmissions.Add(submission);
        }
        else if (submission.Status == CourseAssignmentSubmissionStatus.Draft)
        {
            var version = submission.Versions.Single(item => item.VersionNumber == submission.CurrentVersionNumber);
            version.StudentComment = TrimOrNull(comment);
        }
        else if (assignment.Purpose == CourseAssignmentPurpose.LearningAimPractice
            && submission.Status == CourseAssignmentSubmissionStatus.Finalized
            && submission.CurrentVersionNumber < assignment.MaxSubmissionAttempts)
        {
            submission.CurrentVersionNumber++;
            submission.Status = CourseAssignmentSubmissionStatus.Draft;
            submission.TrainingOutcome = null;
            submission.TrainingStrengths = null;
            submission.TrainingGaps = null;
            submission.TrainingImprovementGuidance = null;
            submission.SubmittedAtUtc = null;
            submission.GradedAtUtc = null;
            db.CourseAssignmentSubmissionVersions.Add(new CourseAssignmentSubmissionVersion
            {
                CourseAssignmentSubmissionId = submission.Id,
                VersionNumber = submission.CurrentVersionNumber,
                StudentComment = TrimOrNull(comment)
            });
        }
        else if (submission.Status == CourseAssignmentSubmissionStatus.NeedsRevision
            && assignment.AllowResubmission
            && submission.CurrentVersionNumber < assignment.MaxSubmissionAttempts)
        {
            submission.CurrentVersionNumber++;
            submission.Status = CourseAssignmentSubmissionStatus.Draft;
            submission.CalculatedGrade = null;
            submission.CalculatedScore = null;
            submission.GradedAtUtc = null;
            // A new attempt is a separate immutable version. Add it directly
            // with its owner id so resubmission works across EF request scopes.
            db.CourseAssignmentSubmissionVersions.Add(new CourseAssignmentSubmissionVersion
            {
                CourseAssignmentSubmissionId = submission.Id,
                VersionNumber = submission.CurrentVersionNumber,
                StudentComment = TrimOrNull(comment)
            });
        }
        else return null;

        db.AuditLogs.Add(Audit(studentUserId, "CourseAssignmentSubmissionStarted", nameof(CourseAssignmentSubmission), submission.Id.ToString(), submission.CurrentVersionNumber.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return new CourseAssignmentSubmissionView(submission.Id, submission.CurrentVersionNumber, submission.Status.ToString());
    }

    public async Task<CourseAssignmentFileAddStatus> AddFileAsync(string studentUserId, Guid submissionId, string originalName, string contentType, long length, Stream content, CancellationToken cancellationToken = default)
    {
        var submission = await db.CourseAssignmentSubmissions.Include(item => item.CourseAssignment).Include(item => item.Versions).SingleOrDefaultAsync(item => item.Id == submissionId && item.StudentUserId == studentUserId && item.Status == CourseAssignmentSubmissionStatus.Draft, cancellationToken);
        if (submission is null || length <= 0) return CourseAssignmentFileAddStatus.SubmissionNotFound;
        if (submission.CourseAssignment!.Purpose is CourseAssignmentPurpose.LearningAimPractice or CourseAssignmentPurpose.ComprehensivePractice
            && !(await contentAccess.CanAccessAsync(studentUserId, submission.CourseAssignment.CourseId,
                LearningContentType.Assignment, submission.CourseAssignmentId, cancellationToken)).IsAvailable)
            return CourseAssignmentFileAddStatus.SubmissionNotFound;
        if (length > submission.CourseAssignment!.MaxFileSizeBytes
            || !AllowsFile(submission.CourseAssignment.AllowedFileExtensionsJson, originalName))
            return CourseAssignmentFileAddStatus.RejectedByAssignmentPolicy;
        if (!FileUploadValidation.TryValidate(content, originalName, out var validation))
            return CourseAssignmentFileAddStatus.Rejected;
        var scan = await scanner.ScanAsync(content, cancellationToken);
        if (scan.Outcome == FileScanOutcome.Rejected) return CourseAssignmentFileAddStatus.Rejected;
        if (!scan.IsClean) return CourseAssignmentFileAddStatus.ScannerUnavailable;
        if (content.CanSeek) content.Position = 0;
        StagedPrivateFile? staged = null;
        StorageLifecycleOperation? finalization = null;
        string storageKey;
        if (storageLifecycle is null)
        {
            storageKey = await storage.SavePrivateAsync(content, validation.DetectedContentType!, cancellationToken);
        }
        else
        {
            staged = await storage.StagePrivateAsync(content, validation.DetectedContentType!, cancellationToken);
            storageKey = staged.StorageKey;
            finalization = storageLifecycle.EnqueueFinalization(staged);
        }
        var version = submission.Versions.Single(item => item.VersionNumber == submission.CurrentVersionNumber);
        // Attach the private file explicitly to the active version. This avoids
        // relying on relationship fix-up when a submission is loaded through a
        // different request scope and keeps the ownership foreign key explicit.
        db.CourseAssignmentSubmissionFiles.Add(new CourseAssignmentSubmissionFile
        {
            CourseAssignmentSubmissionVersionId = version.Id,
            OriginalFileName = Path.GetFileName(originalName),
            StorageKey = storageKey,
            ContentType = validation.DetectedContentType!,
            LengthBytes = length,
            ScanStatus = UploadScanStatus.Clean
        });
        db.AuditLogs.Add(Audit(studentUserId, "CourseAssignmentFileUploaded", nameof(CourseAssignmentSubmission), submission.Id.ToString(), submission.CurrentVersionNumber.ToString()));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            if (staged is not null) await storageLifecycle!.DiscardStagedAsync(staged, cancellationToken);
            throw;
        }
        if (finalization is not null) await storageLifecycle!.TryProcessNowAsync(finalization.Id, cancellationToken);
        return CourseAssignmentFileAddStatus.Added;
    }

    public async Task<bool> SubmitAsync(string studentUserId, Guid submissionId, CancellationToken cancellationToken = default)
    {
        var submission = await db.CourseAssignmentSubmissions
            .Include(item => item.CourseAssignment).ThenInclude(item => item!.Course)
            .Include(item => item.Versions).ThenInclude(item => item.Files)
            .SingleOrDefaultAsync(item => item.Id == submissionId && item.StudentUserId == studentUserId && item.Status == CourseAssignmentSubmissionStatus.Draft, cancellationToken);
        if (submission is null) return false;
        var assignment = submission.CourseAssignment!;
        var deadline = await deadlineResolverService.ResolveAsync(assignment.Id, studentUserId, assignment.DueAtUtc, cancellationToken);
        if (deadline.EffectiveDueAtUtc < DateTimeOffset.UtcNow
            || !await db.Enrollments.AnyAsync(enrollment => enrollment.CourseId == assignment.CourseId && enrollment.StudentUserId == studentUserId && (enrollment.AccessEndsAtUtc == null || enrollment.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken)
            || !(await contentAccess.CanAccessAsync(studentUserId, assignment.CourseId, LearningContentType.Assignment, assignment.Id, cancellationToken)).IsAvailable) return false;
        var version = submission.Versions.Single(item => item.VersionNumber == submission.CurrentVersionNumber);
        if (!version.Files.Any(file => file.ScanStatus == UploadScanStatus.Clean)) return false;
        var now = DateTimeOffset.UtcNow;
        version.SubmittedAtUtc = now;
        submission.SubmittedAtUtc = now;
        submission.Status = CourseAssignmentSubmissionStatus.Submitted;
        var teacherUserId = assignment.Course?.TeacherUserId;
        var comprehensive = assignment.Purpose == CourseAssignmentPurpose.ComprehensivePractice;
        if (!string.IsNullOrWhiteSpace(teacherUserId))
        {
            db.Notifications.Add(new Notification { UserId = teacherUserId, Title = comprehensive ? "Unit Practice ready for review" : "Assignment submission ready", Body = comprehensive ? "A learner submitted Final Unit Practice for review." : "A student submitted coursework for review.", Type = NotificationType.Course, DeepLink = "/teacher/courses" });
        }
        db.AuditLogs.Add(Audit(studentUserId, "CourseAssignmentSubmitted", nameof(CourseAssignmentSubmission), submission.Id.ToString(), submission.CurrentVersionNumber.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(teacherUserId))
        {
            await SendEmailToUserAsync(
                teacherUserId,
                comprehensive ? "ComprehensivePracticeSubmitted" : "AssignmentSubmitted",
                comprehensive ? "BETCCO Unit Practice submitted" : "BETCCO coursework submitted",
                comprehensive ? "Unit Practice is ready for review" : "Coursework is ready for review",
                comprehensive ? "A learner submitted Final Unit Practice in one of your courses." : "A student submitted coursework for review in one of your courses.",
                CancellationToken.None);
        }
        return true;
    }

    public async Task<bool> GradeAsync(string teacherUserId, Guid submissionId, AssignmentGradeCommand command, CancellationToken cancellationToken = default)
    {
        var submission = await db.CourseAssignmentSubmissions
            .Include(item => item.CourseAssignment).ThenInclude(item => item!.Course)
            .Include(item => item.CourseAssignment).ThenInclude(item => item!.Criteria)
            .SingleOrDefaultAsync(item => item.Id == submissionId && item.CourseAssignment!.Course!.TeacherUserId == teacherUserId && item.Status == CourseAssignmentSubmissionStatus.Submitted, cancellationToken);
        if (submission is null || submission.CourseAssignment!.Purpose != CourseAssignmentPurpose.Coursework
            || command.Results.Count != submission.CourseAssignment.Criteria.Count) return false;
        var criteria = submission.CourseAssignment.Criteria.ToDictionary(item => item.Id);
        if (command.Results.Select(item => item.CriterionId).Distinct().Count() != command.Results.Count
            || command.Results.Any(item => !criteria.ContainsKey(item.CriterionId)
                || !Enum.TryParse<CriterionAchievement>(item.Achievement, true, out var achievement)
                || !Enum.IsDefined(achievement))) return false;

        var oldResults = await db.CourseAssignmentCriterionResults.Where(item => item.CourseAssignmentSubmissionId == submission.Id).ToListAsync(cancellationToken);
        db.CourseAssignmentCriterionResults.RemoveRange(oldResults);
        var normalized = new List<(CourseAssignmentCriterion Criterion, CriterionAchievement Achievement)>();
        foreach (var item in command.Results)
        {
            Enum.TryParse<CriterionAchievement>(item.Achievement, true, out var achievement);
            var criterion = criteria[item.CriterionId];
            normalized.Add((criterion, achievement));
            db.CourseAssignmentCriterionResults.Add(new CourseAssignmentCriterionResult
            {
                CourseAssignmentSubmissionId = submission.Id,
                CourseAssignmentCriterionId = criterion.Id,
                Achievement = achievement,
                Score = null,
                Feedback = TrimOrNull(item.Feedback)
            });
        }
        if (!BtecAssessmentRuleSet.TryRead(submission.AssessmentRuleSetSnapshotJson, out var ruleSet)) return false;
        var grade = CalculateGrade(normalized, ruleSet);
        submission.CalculatedGrade = grade;
        submission.CalculatedScore = null;
        submission.GradedAtUtc = DateTimeOffset.UtcNow;
        submission.Status = CourseAssignmentSubmissionStatus.Graded;
        if (!string.IsNullOrWhiteSpace(command.OverallFeedback)) db.CourseAssignmentFeedbackItems.Add(new CourseAssignmentFeedback { CourseAssignmentSubmissionId = submission.Id, AuthorUserId = teacherUserId, Body = command.OverallFeedback.Trim() });
        if (!string.IsNullOrWhiteSpace(command.PrivateTeacherNotes))
            db.CourseAssignmentFeedbackItems.Add(new CourseAssignmentFeedback
            {
                CourseAssignmentSubmissionId = submission.Id,
                AuthorUserId = teacherUserId,
                Body = command.PrivateTeacherNotes.Trim(),
                IsPrivate = true
            });
        db.Notifications.Add(new Notification { UserId = submission.StudentUserId, Title = "Assignment assessed", Body = "Your coursework has new criterion feedback and a calculated result.", Type = NotificationType.Course, DeepLink = "/student/courses" });
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentGraded", nameof(CourseAssignmentSubmission), submission.Id.ToString(), grade.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        await SendEmailToUserAsync(
            submission.StudentUserId,
            "AssignmentGraded",
            "BETCCO coursework assessed",
            "Your coursework has been assessed",
            "Your teacher added criterion feedback and a calculated result to your coursework.",
            CancellationToken.None);
        return true;
    }

    public async Task<bool> RequestRevisionAsync(string teacherUserId, Guid submissionId, string feedback, CancellationToken cancellationToken = default)
    {
        var submission = await db.CourseAssignmentSubmissions.Include(item => item.CourseAssignment).ThenInclude(item => item!.Course).SingleOrDefaultAsync(item => item.Id == submissionId && item.CourseAssignment!.Course!.TeacherUserId == teacherUserId && item.Status == CourseAssignmentSubmissionStatus.Submitted, cancellationToken);
        if (submission is null || submission.CourseAssignment!.Purpose != CourseAssignmentPurpose.Coursework || string.IsNullOrWhiteSpace(feedback)) return false;
        submission.Status = CourseAssignmentSubmissionStatus.NeedsRevision;
        db.CourseAssignmentFeedbackItems.Add(new CourseAssignmentFeedback { CourseAssignmentSubmissionId = submission.Id, AuthorUserId = teacherUserId, Body = feedback.Trim(), RequestsResubmission = true });
        db.Notifications.Add(new Notification { UserId = submission.StudentUserId, Title = "Assignment revision requested", Body = "Review your teacher feedback and submit a new version.", Type = NotificationType.Course, DeepLink = "/student/courses" });
        db.AuditLogs.Add(Audit(teacherUserId, "CourseAssignmentRevisionRequested", nameof(CourseAssignmentSubmission), submission.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        await SendEmailToUserAsync(
            submission.StudentUserId,
            "AssignmentResubmissionRequested",
            "BETCCO coursework revision requested",
            "Your teacher requested a revised submission",
            "Review the feedback in BETCCO and submit a new version before the assignment closes.",
            CancellationToken.None);
        return true;
    }

    private async Task<CourseAssignment?> OwnedAssignmentAsync(string teacherUserId, Guid assignmentId, CancellationToken cancellationToken) => await db.CourseAssignments.Include(item => item.Course).SingleOrDefaultAsync(item => item.Id == assignmentId && item.Course!.TeacherUserId == teacherUserId, cancellationToken);

    private async Task<bool> CanPublishComprehensiveAsync(CourseAssignment assignment, CancellationToken cancellationToken)
    {
        if (assignment.CourseModuleId is not { } moduleId || assignment.LessonId is not null
            || assignment.BtecLearningAimId is not null
            || !ValidComprehensiveContent(assignment.ArabicTitle, assignment.EnglishTitle,
                assignment.ArabicInstructions, assignment.EnglishInstructions, assignment.DueAtUtc))
            return false;
        var unitId = await db.CourseModules.AsNoTracking()
            .Where(x => x.Id == moduleId && x.CourseId == assignment.CourseId)
            .Select(x => x.UnitDefinitionId)
            .SingleOrDefaultAsync(cancellationToken);
        if (unitId is null) return false;
        var links = await db.CourseAssignmentCriteria.AsNoTracking()
            .Include(x => x.BtecCriterion).ThenInclude(x => x!.AssessmentCriterionDefinition).ThenInclude(x => x!.LearningAimDefinition)
            .Include(x => x.BtecCriterion).ThenInclude(x => x!.BtecLearningAim)
            .Where(x => x.CourseAssignmentId == assignment.Id)
            .ToArrayAsync(cancellationToken);
        return links.All(x => x.BtecCriterion is { } source
            && source.BtecLearningAim is { } aim
            && source.AssessmentCriterionDefinition is { } definition
            && definition.LearningAimDefinition is { } learningAim
            && source.CourseModuleId == moduleId
            && aim.CourseModuleId == moduleId
            && learningAim.UnitDefinitionId == unitId
            && aim.LearningAimDefinitionId == definition.LearningAimDefinitionId);
    }

    private static bool ValidComprehensiveContent(string? arabicTitle, string? englishTitle,
        string? arabicInstructions, string? englishInstructions, DateTimeOffset? dueAtUtc) =>
        !string.IsNullOrWhiteSpace(arabicTitle) && !string.IsNullOrWhiteSpace(englishTitle)
        && !string.IsNullOrWhiteSpace(arabicInstructions) && !string.IsNullOrWhiteSpace(englishInstructions)
        && arabicTitle.Length <= 256 && englishTitle.Length <= 256
        && arabicInstructions.Length <= 4_000 && englishInstructions.Length <= 4_000
        && (dueAtUtc is null || dueAtUtc > DateTimeOffset.UtcNow);

    private async Task SendEmailToUserAsync(string userId, string eventName, string subject, string heading, string body, CancellationToken cancellationToken)
    {
        var email = await db.Users.AsNoTracking()
            .Where(user => user.Id.ToString() == userId && user.EmailConfirmed)
            .Select(user => user.Email)
            .SingleOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(email))
            await emailNotifications.SendAsync(new PlatformEmailNotification(eventName, email, subject, heading, body), cancellationToken);
    }

    private async Task<bool> HasValidContextAsync(Guid courseId, Guid? moduleId, Guid? lessonId, Guid? learningAimId, CancellationToken cancellationToken)
    {
        if (moduleId is { } selectedModuleId && !await db.CourseModules.AnyAsync(module => module.Id == selectedModuleId && module.CourseId == courseId, cancellationToken)) return false;
        if (lessonId is { } selectedLessonId && !await db.Lessons.AnyAsync(lesson =>
                lesson.Id == selectedLessonId
                && lesson.CourseModule!.CourseId == courseId
                && lesson.Type == LessonType.Assignment
                && (!moduleId.HasValue || lesson.CourseModuleId == moduleId), cancellationToken)) return false;
        if (learningAimId is { } selectedLearningAimId && !await db.BtecLearningAims.AnyAsync(aim =>
                aim.Id == selectedLearningAimId
                && aim.CourseModule!.CourseId == courseId
                && (!moduleId.HasValue || aim.CourseModuleId == moduleId), cancellationToken)) return false;
        return true;
    }

    private static bool CanManageAssignments(CourseStatus status) => status is CourseStatus.Draft or CourseStatus.Rejected or CourseStatus.Approved or CourseStatus.Published;
    private static bool TryPublicationStatus(string value, out ContentPublicationStatus status) =>
        Enum.TryParse(value, true, out status) && status is ContentPublicationStatus.Draft or ContentPublicationStatus.Published or ContentPublicationStatus.Archived or ContentPublicationStatus.Scheduled;
    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static EvaluationGrade CalculateGrade(
        IReadOnlyCollection<(CourseAssignmentCriterion Criterion, CriterionAchievement Achievement)> results,
        BtecAssessmentRuleSet ruleSet)
    {
        return EvaluationAssessmentCalculator.Calculate(results.Select(result => new CriterionSubmission(
            result.Criterion.Code,
            result.Achievement.ToString(),
            null,
            null)), ruleSet).Grade;
    }
    private static readonly string[] SupportedFileExtensions = [".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".jpeg", ".zip", ".txt"];
    private static bool TryNormalizeUploadPolicy(int maxFileSizeBytes, IReadOnlyCollection<string>? input, out string[] extensions)
    {
        extensions = (input ?? SupportedFileExtensions)
            .Select(value => value?.Trim().ToLowerInvariant() ?? string.Empty)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return maxFileSizeBytes is > 0 and <= 100 * 1024 * 1024
            && extensions.Length > 0
            && extensions.All(value => SupportedFileExtensions.Contains(value, StringComparer.OrdinalIgnoreCase));
    }
    private static bool AllowsFile(string allowedExtensionsJson, string originalName)
    {
        var extension = Path.GetExtension(originalName).ToLowerInvariant();
        if (string.IsNullOrEmpty(extension)) return false;
        try
        {
            return (JsonSerializer.Deserialize<string[]>(allowedExtensionsJson) ?? [])
                .Contains(extension, StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return false;
        }
    }
    private static bool TryCriterion(string? rawCode, string? rawBand, out string code, out BtecCriterionBand band)
    {
        code = string.Empty;
        band = default;
        if (string.IsNullOrWhiteSpace(rawCode) || !Enum.TryParse(rawBand, true, out band)) return false;
        var normalized = rawCode.Trim().ToUpperInvariant();
        var separator = normalized.IndexOf('.', StringComparison.Ordinal);
        if (separator <= 0 || separator == normalized.Length - 1) return false;
        var suffix = normalized[(separator + 1)..];
        if (suffix.Length < 2 || suffix[0] is not ('P' or 'M' or 'D') || !int.TryParse(suffix[1..], out var number) || number <= 0) return false;
        var expected = suffix[0] switch { 'P' => BtecCriterionBand.Pass, 'M' => BtecCriterionBand.Merit, _ => BtecCriterionBand.Distinction };
        if (band != expected) return false;
        code = normalized;
        return true;
    }
    private static AuditLog Audit(string actor, string action, string entityType, string entityId, string? metadata = null) => new() { ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId, Outcome = "Success", MetadataJson = metadata };
}
