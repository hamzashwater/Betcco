using System.Data;
using Betcco.Application.Courses;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class CourseAuthoringService(BetccoDbContext db) : ICourseAuthoringService
{
    public async Task<Guid> CreateDraftAsync(string teacherUserId, CreateCourseCommand command, CancellationToken cancellationToken = default)
    {
        var arabicTitle = RequiredText(command.ArabicTitle);
        var arabicDescription = RequiredText(command.ArabicDescription);
        var englishTitle = OptionalText(command.EnglishTitle) ?? arabicTitle;
        var englishDescription = OptionalText(command.EnglishDescription) ?? arabicDescription;
        var slug = await UniqueSlugAsync(englishTitle, null, cancellationToken);
        var course = new Course
        {
            Slug = slug,
            ArabicTitle = arabicTitle,
            EnglishTitle = englishTitle,
            ArabicDescription = arabicDescription,
            EnglishDescription = englishDescription,
            LearningTrackId = command.LearningTrackId,
            GradeId = command.GradeId,
            SpecializationId = command.SpecializationId,
            SubjectId = command.SubjectId,
            TeacherUserId = teacherUserId,
            IsFree = command.IsFree,
            Price = command.IsFree ? 0 : command.Price,
            Status = CourseStatus.Draft
        };
        db.Courses.Add(course);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseDraftCreated", nameof(Course), course.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return course.Id;
    }

    public async Task<bool> UpdateCourseAsync(string teacherUserId, Guid courseId, UpdateCourseCommand command, CancellationToken cancellationToken = default)
    {
        var course = await OwnedCourseAsync(teacherUserId, courseId, cancellationToken);
        var arabicTitle = OptionalText(command.ArabicTitle);
        var arabicDescription = OptionalText(command.ArabicDescription);
        if (course is null || !IsEditable(course.Status) || arabicTitle is null || arabicDescription is null || (!command.IsFree && command.Price <= 0)) return false;
        var englishTitle = OptionalText(command.EnglishTitle) ?? arabicTitle;
        var englishDescription = OptionalText(command.EnglishDescription) ?? arabicDescription;

        course.ArabicTitle = arabicTitle;
        course.EnglishTitle = englishTitle;
        course.ArabicDescription = arabicDescription;
        course.EnglishDescription = englishDescription;
        course.IsFree = command.IsFree;
        course.Price = command.IsFree ? 0 : command.Price;
        course.Slug = await UniqueSlugAsync(course.EnglishTitle, course.Id, cancellationToken);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseDraftUpdated", nameof(Course), course.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddModuleAsync(string teacherUserId, CreateModuleCommand command, CancellationToken cancellationToken = default)
        => await InCanonicalTransactionAsync(
            () => AddModuleCoreAsync(teacherUserId, command, cancellationToken),
            (Guid?)null,
            cancellationToken);

    private async Task<Guid?> AddModuleCoreAsync(string teacherUserId, CreateModuleCommand command, CancellationToken cancellationToken)
    {
        var course = await db.Courses.Include(x => x.LearningTrack)
            .SingleOrDefaultAsync(x => x.Id == command.CourseId && x.TeacherUserId == teacherUserId, cancellationToken);
        var arabicTitle = OptionalText(command.ArabicTitle);
        if (course is null
            || !IsEditable(course.Status)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)) return null;

        var isBtec = course.LearningTrack?.IsBtecFocused == true;
        if (isBtec != command.UnitDefinitionId.HasValue || (!isBtec && arabicTitle is null)) return null;
        UnitDefinition? unit = null;
        if (command.UnitDefinitionId is { } unitId)
        {
            unit = await CanonicalUnitAsync(unitId, cancellationToken);
            if (unit is null || !CanUseVersion(course, unit)) return null;
            if (await db.CourseModules.AnyAsync(x => x.CourseId == course.Id && x.UnitDefinitionId == unit.Id, cancellationToken)) return null;
        }
        var englishTitle = OptionalText(command.EnglishTitle) ?? arabicTitle;

        var unitCode = unit?.Code ?? NormalizeOptionalCode(command.UnitCode);
        if (unitCode is not null && await db.CourseModules.AnyAsync(x => x.CourseId == course.Id && x.UnitCode == unitCode, cancellationToken)) return null;
        if (unit is not null) course.QualificationVersionId ??= unit.QualificationVersionId;
        var module = new CourseModule
        {
            CourseId = course.Id,
            UnitDefinitionId = unit?.Id,
            ArabicTitle = unit?.ArabicTitle ?? arabicTitle!,
            EnglishTitle = unit?.EnglishTitle ?? englishTitle!,
            UnitCode = unitCode,
            ArabicDescription = TrimOrNull(command.ArabicDescription),
            EnglishDescription = TrimOrNull(command.EnglishDescription),
            GuidedLearningHours = NonNegativeOrNull(command.GuidedLearningHours),
            Credits = NonNegativeOrNull(command.Credits),
            QualificationLevel = TrimOrNull(command.QualificationLevel),
            SortOrder = Math.Max(0, command.SortOrder),
            PublicationStatus = publicationStatus,
            AvailableFromUtc = command.AvailableFromUtc,
            IsPublished = publicationStatus == ContentPublicationStatus.Published
        };
        if (unit is not null) AddCanonicalStructure(module, unit);
        db.CourseModules.Add(module);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseUnitAdded", nameof(CourseModule), module.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return module.Id;
    }

    public async Task<bool> LinkModuleToUnitAsync(string teacherUserId, Guid moduleId, Guid unitDefinitionId, CancellationToken cancellationToken = default)
        => await InCanonicalTransactionAsync(
            () => LinkModuleToUnitCoreAsync(teacherUserId, moduleId, unitDefinitionId, cancellationToken),
            false,
            cancellationToken);

    private async Task<bool> LinkModuleToUnitCoreAsync(string teacherUserId, Guid moduleId, Guid unitDefinitionId, CancellationToken cancellationToken)
    {
        var module = await db.CourseModules.Include(x => x.Course).ThenInclude(x => x!.LearningTrack)
            .SingleOrDefaultAsync(x => x.Id == moduleId && x.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (module is null || !IsEditable(module.Course!.Status) || module.Course.LearningTrack?.IsBtecFocused != true
            || module.UnitDefinitionId is not null
            || await db.BtecLearningAims.AnyAsync(x => x.CourseModuleId == moduleId, cancellationToken)
            || await db.BtecCriteria.AnyAsync(x => x.CourseModuleId == moduleId, cancellationToken)
            || await db.CourseAssignments.AnyAsync(x => x.CourseModuleId == moduleId && x.Criteria.Any(), cancellationToken)) return false;
        var unit = await CanonicalUnitAsync(unitDefinitionId, cancellationToken);
        if (unit is null || !CanUseVersion(module.Course, unit)
            || await db.CourseModules.AnyAsync(x => x.CourseId == module.CourseId && x.UnitDefinitionId == unit.Id, cancellationToken)
            || await db.CourseModules.AnyAsync(x => x.CourseId == module.CourseId && x.Id != moduleId && x.UnitCode == unit.Code, cancellationToken)) return false;
        module.Course.QualificationVersionId ??= unit.QualificationVersionId;
        module.UnitDefinitionId = unit.Id;
        module.ArabicTitle = unit.ArabicTitle;
        module.EnglishTitle = unit.EnglishTitle;
        module.UnitCode = unit.Code;
        AddCanonicalStructure(module, unit);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseUnitLinkedToCanonical", nameof(CourseModule), module.Id.ToString(), unit.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> UpdateModuleAsync(string teacherUserId, Guid moduleId, UpdateModuleCommand command, CancellationToken cancellationToken = default)
    {
        var module = await db.CourseModules.Include(x => x.Course).SingleOrDefaultAsync(x => x.Id == moduleId && x.Course!.TeacherUserId == teacherUserId, cancellationToken);
        var arabicTitle = OptionalText(command.ArabicTitle);
        if (module is null
            || !IsEditable(module.Course!.Status)
            || (module.UnitDefinitionId is null && arabicTitle is null)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)) return false;
        var englishTitle = OptionalText(command.EnglishTitle) ?? arabicTitle;
        var unitCode = module.UnitDefinitionId is null ? NormalizeOptionalCode(command.UnitCode) : module.UnitCode;
        if (unitCode is not null && await db.CourseModules.AnyAsync(x => x.CourseId == module.CourseId && x.UnitCode == unitCode && x.Id != module.Id, cancellationToken)) return false;
        if (module.UnitDefinitionId is null)
        {
            module.ArabicTitle = arabicTitle!;
            module.EnglishTitle = englishTitle!;
            module.UnitCode = unitCode;
        }
        module.ArabicDescription = TrimOrNull(command.ArabicDescription);
        module.EnglishDescription = TrimOrNull(command.EnglishDescription);
        module.GuidedLearningHours = NonNegativeOrNull(command.GuidedLearningHours);
        module.Credits = NonNegativeOrNull(command.Credits);
        if (module.UnitDefinitionId is null) module.QualificationLevel = TrimOrNull(command.QualificationLevel);
        module.SortOrder = Math.Max(0, command.SortOrder);
        module.PublicationStatus = publicationStatus;
        module.AvailableFromUtc = command.AvailableFromUtc;
        module.IsPublished = publicationStatus == ContentPublicationStatus.Published;
        db.AuditLogs.Add(Audit(teacherUserId, "CourseUnitUpdated", nameof(CourseModule), module.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteModuleAsync(string teacherUserId, Guid moduleId, CancellationToken cancellationToken = default)
    {
        var module = await db.CourseModules.Include(x => x.Course).SingleOrDefaultAsync(x => x.Id == moduleId && x.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (module is null || !IsEditable(module.Course!.Status)) return false;
        var lessonIds = await db.Lessons.Where(item => item.CourseModuleId == moduleId).Select(item => item.Id).ToArrayAsync(cancellationToken);
        var videoKeys = await db.LessonResources
            .Where(item => lessonIds.Contains(item.LessonId) && (item.ContentType == "video/mp4" || item.ContentType == "video/webm"))
            .Select(item => item.StorageKey).Distinct().ToArrayAsync(cancellationToken);
        foreach (var key in videoKeys)
        {
            if (await db.LessonResources.AnyAsync(item => item.StorageKey == key && !lessonIds.Contains(item.LessonId), cancellationToken)) continue;
            EnqueueVideoDeletion(key);
        }
        db.CourseModules.Remove(module);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseUnitDeleted", nameof(CourseModule), moduleId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> DuplicateModuleAsync(string teacherUserId, Guid moduleId, CancellationToken cancellationToken = default)
    {
        var source = await db.CourseModules
            .Include(x => x.Course)
            .Include(x => x.LearningAims).ThenInclude(x => x.Topics)
            .Include(x => x.Criteria)
            .Include(x => x.Lessons).ThenInclude(x => x.Resources)
            .SingleOrDefaultAsync(x => x.Id == moduleId && x.Course!.TeacherUserId == teacherUserId, cancellationToken);
        // A canonical unit is delivered once per course. Copying its lessons is
        // possible, but cloning the unit would create a second academic identity.
        if (source is null || !IsEditable(source.Course!.Status) || source.UnitDefinitionId is not null) return null;

        var clone = new CourseModule
        {
            CourseId = source.CourseId,
            ArabicTitle = $"نسخة من {source.ArabicTitle}",
            EnglishTitle = $"Copy of {source.EnglishTitle}",
            UnitCode = await UniqueUnitCodeAsync(source.CourseId, source.UnitCode, cancellationToken),
            ArabicDescription = source.ArabicDescription,
            EnglishDescription = source.EnglishDescription,
            GuidedLearningHours = source.GuidedLearningHours,
            Credits = source.Credits,
            QualificationLevel = source.QualificationLevel,
            SortOrder = source.SortOrder + 1,
            PublicationStatus = ContentPublicationStatus.Draft,
            IsPublished = false
        };
        var aims = new Dictionary<Guid, BtecLearningAim>();
        foreach (var sourceAim in source.LearningAims)
        {
            var aim = new BtecLearningAim
            {
                CourseModuleId = clone.Id,
                Code = sourceAim.Code,
                ArabicTitle = sourceAim.ArabicTitle,
                EnglishTitle = sourceAim.EnglishTitle,
                ArabicDescription = sourceAim.ArabicDescription,
                EnglishDescription = sourceAim.EnglishDescription,
                SortOrder = sourceAim.SortOrder,
                PublicationStatus = ContentPublicationStatus.Draft
            };
            aims[sourceAim.Id] = aim;
            clone.LearningAims.Add(aim);
        }
        var topics = new Dictionary<Guid, BtecTopic>();
        foreach (var sourceAim in source.LearningAims)
            foreach (var sourceTopic in sourceAim.Topics)
            {
                var topic = new BtecTopic
                {
                    BtecLearningAimId = aims[sourceAim.Id].Id,
                    ArabicTitle = sourceTopic.ArabicTitle,
                    EnglishTitle = sourceTopic.EnglishTitle,
                    ArabicDescription = sourceTopic.ArabicDescription,
                    EnglishDescription = sourceTopic.EnglishDescription,
                    SortOrder = sourceTopic.SortOrder,
                    PublicationStatus = ContentPublicationStatus.Draft
                };
                topics[sourceTopic.Id] = topic;
                aims[sourceAim.Id].Topics.Add(topic);
            }
        foreach (var sourceCriterion in source.Criteria)
        {
            clone.Criteria.Add(new BtecCriterion
            {
                CourseModuleId = clone.Id,
                BtecLearningAimId = sourceCriterion.BtecLearningAimId is { } aimId ? aims[aimId].Id : null,
                Code = sourceCriterion.Code,
                Band = sourceCriterion.Band,
                ArabicDescription = sourceCriterion.ArabicDescription,
                EnglishDescription = sourceCriterion.EnglishDescription,
                ArabicEvidenceGuidance = sourceCriterion.ArabicEvidenceGuidance,
                EnglishEvidenceGuidance = sourceCriterion.EnglishEvidenceGuidance,
                SortOrder = sourceCriterion.SortOrder,
                PublicationStatus = ContentPublicationStatus.Draft
            });
        }
        foreach (var sourceLesson in source.Lessons)
        {
            var lesson = new Lesson
            {
                CourseModuleId = clone.Id,
                BtecLearningAimId = sourceLesson.BtecLearningAimId is { } aimId ? aims[aimId].Id : null,
                BtecTopicId = sourceLesson.BtecTopicId is { } topicId ? topics[topicId].Id : null,
                ArabicTitle = sourceLesson.ArabicTitle,
                EnglishTitle = sourceLesson.EnglishTitle,
                ArabicBody = sourceLesson.ArabicBody,
                EnglishBody = sourceLesson.EnglishBody,
                Type = sourceLesson.Type,
                DurationSeconds = sourceLesson.DurationSeconds,
                IsPreview = sourceLesson.IsPreview,
                IsPublished = false,
                PublicationStatus = ContentPublicationStatus.Draft,
                SortOrder = sourceLesson.SortOrder,
                VideoReference = Guid.TryParse(sourceLesson.VideoReference, out _) ? null : sourceLesson.VideoReference
            };
            foreach (var resource in sourceLesson.Resources)
            {
                var copiedResource = new LessonResource
                {
                    DisplayName = resource.DisplayName,
                    StorageKey = resource.StorageKey,
                    ContentType = resource.ContentType,
                    ExternalUrl = resource.ExternalUrl,
                    ScanStatus = resource.ScanStatus,
                    IsDownloadable = resource.IsDownloadable
                };
                lesson.Resources.Add(copiedResource);
                if (Guid.TryParse(sourceLesson.VideoReference, out var sourceVideoId) && sourceVideoId == resource.Id)
                    lesson.VideoReference = copiedResource.Id.ToString();
            }
            clone.Lessons.Add(lesson);
        }

        db.CourseModules.Add(clone);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseUnitDuplicated", nameof(CourseModule), clone.Id.ToString(), moduleId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return clone.Id;
    }

    public async Task<Guid?> AddLearningAimAsync(string teacherUserId, CreateLearningAimCommand command, CancellationToken cancellationToken = default)
    {
        var module = await OwnedModuleAsync(teacherUserId, command.ModuleId, cancellationToken);
        if (module is null
            || !IsEditable(module.Course!.Status)
            || module.Course.LearningTrack?.IsBtecFocused == true
            || string.IsNullOrWhiteSpace(command.Code)
            || string.IsNullOrWhiteSpace(command.ArabicTitle)
            || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)) return null;
        var code = command.Code.Trim().ToUpperInvariant();
        if (await db.BtecLearningAims.AnyAsync(x => x.CourseModuleId == module.Id && x.Code == code, cancellationToken)) return null;
        var aim = new BtecLearningAim
        {
            CourseModuleId = module.Id,
            Code = code,
            ArabicTitle = command.ArabicTitle.Trim(),
            EnglishTitle = command.EnglishTitle.Trim(),
            ArabicDescription = TrimOrNull(command.ArabicDescription),
            EnglishDescription = TrimOrNull(command.EnglishDescription),
            SortOrder = Math.Max(0, command.SortOrder),
            PublicationStatus = publicationStatus,
            AvailableFromUtc = command.AvailableFromUtc
        };
        db.BtecLearningAims.Add(aim);
        db.AuditLogs.Add(Audit(teacherUserId, "BtecLearningAimAdded", nameof(BtecLearningAim), aim.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return aim.Id;
    }

    public async Task<bool> UpdateLearningAimAsync(string teacherUserId, Guid learningAimId, UpdateLearningAimCommand command, CancellationToken cancellationToken = default)
    {
        var aim = await db.BtecLearningAims.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == learningAimId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (aim is null
            || !IsEditable(aim.CourseModule!.Course!.Status)
            || aim.CourseModule.UnitDefinitionId is not null
            || string.IsNullOrWhiteSpace(command.Code)
            || string.IsNullOrWhiteSpace(command.ArabicTitle)
            || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)) return false;
        var code = command.Code.Trim().ToUpperInvariant();
        if (await db.BtecLearningAims.AnyAsync(x => x.CourseModuleId == aim.CourseModuleId && x.Code == code && x.Id != aim.Id, cancellationToken)) return false;
        aim.Code = code;
        aim.ArabicTitle = command.ArabicTitle.Trim();
        aim.EnglishTitle = command.EnglishTitle.Trim();
        aim.ArabicDescription = TrimOrNull(command.ArabicDescription);
        aim.EnglishDescription = TrimOrNull(command.EnglishDescription);
        aim.SortOrder = Math.Max(0, command.SortOrder);
        aim.PublicationStatus = publicationStatus;
        aim.AvailableFromUtc = command.AvailableFromUtc;
        db.AuditLogs.Add(Audit(teacherUserId, "BtecLearningAimUpdated", nameof(BtecLearningAim), aim.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteLearningAimAsync(string teacherUserId, Guid learningAimId, CancellationToken cancellationToken = default)
    {
        var aim = await db.BtecLearningAims.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == learningAimId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (aim is null || !IsEditable(aim.CourseModule!.Course!.Status) || aim.CourseModule.UnitDefinitionId is not null) return false;
        var topicIds = await db.BtecTopics.Where(x => x.BtecLearningAimId == aim.Id).Select(x => x.Id).ToArrayAsync(cancellationToken);
        var lessons = await db.Lessons.Where(x => x.BtecLearningAimId == aim.Id || (x.BtecTopicId.HasValue && topicIds.Contains(x.BtecTopicId.Value))).ToListAsync(cancellationToken);
        foreach (var lesson in lessons) { lesson.BtecLearningAimId = null; lesson.BtecTopicId = null; }
        var criteria = await db.BtecCriteria.Where(x => x.BtecLearningAimId == aim.Id).ToListAsync(cancellationToken);
        foreach (var criterion in criteria) criterion.BtecLearningAimId = null;
        db.BtecLearningAims.Remove(aim);
        db.AuditLogs.Add(Audit(teacherUserId, "BtecLearningAimDeleted", nameof(BtecLearningAim), learningAimId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddTopicAsync(string teacherUserId, CreateTopicCommand command, CancellationToken cancellationToken = default)
    {
        var aim = await OwnedLearningAimAsync(teacherUserId, command.LearningAimId, cancellationToken);
        if (aim is null
            || !IsEditable(aim.CourseModule!.Course!.Status)
            || string.IsNullOrWhiteSpace(command.ArabicTitle)
            || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)) return null;
        var topic = new BtecTopic
        {
            BtecLearningAimId = aim.Id,
            ArabicTitle = command.ArabicTitle.Trim(),
            EnglishTitle = command.EnglishTitle.Trim(),
            ArabicDescription = TrimOrNull(command.ArabicDescription),
            EnglishDescription = TrimOrNull(command.EnglishDescription),
            SortOrder = Math.Max(0, command.SortOrder),
            PublicationStatus = publicationStatus,
            AvailableFromUtc = command.AvailableFromUtc
        };
        db.BtecTopics.Add(topic);
        db.AuditLogs.Add(Audit(teacherUserId, "BtecTopicAdded", nameof(BtecTopic), topic.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return topic.Id;
    }

    public async Task<bool> UpdateTopicAsync(string teacherUserId, Guid topicId, UpdateTopicCommand command, CancellationToken cancellationToken = default)
    {
        var topic = await db.BtecTopics.Include(x => x.BtecLearningAim).ThenInclude(x => x!.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == topicId && x.BtecLearningAim!.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (topic is null
            || !IsEditable(topic.BtecLearningAim!.CourseModule!.Course!.Status)
            || string.IsNullOrWhiteSpace(command.ArabicTitle)
            || string.IsNullOrWhiteSpace(command.EnglishTitle)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)) return false;
        topic.ArabicTitle = command.ArabicTitle.Trim();
        topic.EnglishTitle = command.EnglishTitle.Trim();
        topic.ArabicDescription = TrimOrNull(command.ArabicDescription);
        topic.EnglishDescription = TrimOrNull(command.EnglishDescription);
        topic.SortOrder = Math.Max(0, command.SortOrder);
        topic.PublicationStatus = publicationStatus;
        topic.AvailableFromUtc = command.AvailableFromUtc;
        db.AuditLogs.Add(Audit(teacherUserId, "BtecTopicUpdated", nameof(BtecTopic), topic.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteTopicAsync(string teacherUserId, Guid topicId, CancellationToken cancellationToken = default)
    {
        var topic = await db.BtecTopics.Include(x => x.BtecLearningAim).ThenInclude(x => x!.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == topicId && x.BtecLearningAim!.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (topic is null || !IsEditable(topic.BtecLearningAim!.CourseModule!.Course!.Status)) return false;
        var lessons = await db.Lessons.Where(x => x.BtecTopicId == topic.Id).ToListAsync(cancellationToken);
        foreach (var lesson in lessons) lesson.BtecTopicId = null;
        db.BtecTopics.Remove(topic);
        db.AuditLogs.Add(Audit(teacherUserId, "BtecTopicDeleted", nameof(BtecTopic), topicId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddCriterionAsync(string teacherUserId, CreateBtecCriterionCommand command, CancellationToken cancellationToken = default)
    {
        var module = await OwnedModuleAsync(teacherUserId, command.ModuleId, cancellationToken);
        if (module is null
            || !IsEditable(module.Course!.Status)
            || module.Course.LearningTrack?.IsBtecFocused == true
            || !TryCriterion(command.Code, command.Band, out var code, out var band)
            || string.IsNullOrWhiteSpace(command.ArabicDescription)
            || string.IsNullOrWhiteSpace(command.EnglishDescription)
            || !TryPublicationStatus(command.PublicationStatus, null, out var publicationStatus)) return null;
        if (command.LearningAimId is { } aimId && !await db.BtecLearningAims.AnyAsync(x => x.Id == aimId && x.CourseModuleId == module.Id, cancellationToken)) return null;
        if (await db.BtecCriteria.AnyAsync(x => x.CourseModuleId == module.Id && x.Code == code, cancellationToken)) return null;
        var criterion = new BtecCriterion
        {
            CourseModuleId = module.Id,
            BtecLearningAimId = command.LearningAimId,
            Code = code,
            Band = band,
            ArabicDescription = command.ArabicDescription.Trim(),
            EnglishDescription = command.EnglishDescription.Trim(),
            ArabicEvidenceGuidance = TrimOrNull(command.ArabicEvidenceGuidance),
            EnglishEvidenceGuidance = TrimOrNull(command.EnglishEvidenceGuidance),
            SortOrder = Math.Max(0, command.SortOrder),
            PublicationStatus = publicationStatus
        };
        db.BtecCriteria.Add(criterion);
        db.AuditLogs.Add(Audit(teacherUserId, "BtecCriterionAdded", nameof(BtecCriterion), criterion.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return criterion.Id;
    }

    public async Task<bool> UpdateCriterionAsync(string teacherUserId, Guid criterionId, UpdateBtecCriterionCommand command, CancellationToken cancellationToken = default)
    {
        var criterion = await db.BtecCriteria.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == criterionId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (criterion is null
            || !IsEditable(criterion.CourseModule!.Course!.Status)
            || criterion.CourseModule.UnitDefinitionId is not null
            || !TryCriterion(command.Code, command.Band, out var code, out var band)
            || string.IsNullOrWhiteSpace(command.ArabicDescription)
            || string.IsNullOrWhiteSpace(command.EnglishDescription)
            || !TryPublicationStatus(command.PublicationStatus, null, out var publicationStatus)) return false;
        if (await db.BtecCriteria.AnyAsync(x => x.CourseModuleId == criterion.CourseModuleId && x.Code == code && x.Id != criterion.Id, cancellationToken)) return false;
        criterion.Code = code;
        criterion.Band = band;
        criterion.ArabicDescription = command.ArabicDescription.Trim();
        criterion.EnglishDescription = command.EnglishDescription.Trim();
        criterion.ArabicEvidenceGuidance = TrimOrNull(command.ArabicEvidenceGuidance);
        criterion.EnglishEvidenceGuidance = TrimOrNull(command.EnglishEvidenceGuidance);
        criterion.SortOrder = Math.Max(0, command.SortOrder);
        criterion.PublicationStatus = publicationStatus;
        db.AuditLogs.Add(Audit(teacherUserId, "BtecCriterionUpdated", nameof(BtecCriterion), criterion.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteCriterionAsync(string teacherUserId, Guid criterionId, CancellationToken cancellationToken = default)
    {
        var criterion = await db.BtecCriteria.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == criterionId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (criterion is null || !IsEditable(criterion.CourseModule!.Course!.Status) || criterion.CourseModule.UnitDefinitionId is not null) return false;
        db.BtecCriteria.Remove(criterion);
        db.AuditLogs.Add(Audit(teacherUserId, "BtecCriterionDeleted", nameof(BtecCriterion), criterionId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> AddLessonAsync(string teacherUserId, CreateLessonCommand command, CancellationToken cancellationToken = default)
    {
        var module = await db.CourseModules.Include(x => x.Course).SingleOrDefaultAsync(x => x.Id == command.ModuleId && x.Course!.TeacherUserId == teacherUserId, cancellationToken);
        var arabicTitle = OptionalText(command.ArabicTitle);
        if (module is null
            || !IsEditable(module.Course!.Status)
            || arabicTitle is null
            || !Enum.TryParse<LessonType>(command.Type, true, out var lessonType)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)) return null;
        var englishTitle = OptionalText(command.EnglishTitle) ?? arabicTitle;
        if (!await HasValidLessonLocationAsync(module.Id, command.LearningAimId, command.TopicId, cancellationToken)) return null;
        var lesson = new Lesson
        {
            CourseModuleId = module.Id,
            BtecLearningAimId = command.LearningAimId,
            BtecTopicId = command.TopicId,
            ArabicTitle = arabicTitle,
            EnglishTitle = englishTitle,
            ArabicBody = TrimOrNull(command.ArabicBody),
            EnglishBody = TrimOrNull(command.EnglishBody),
            Type = lessonType,
            DurationSeconds = Math.Max(0, command.DurationSeconds),
            IsPreview = command.IsPreview,
            IsPublished = publicationStatus == ContentPublicationStatus.Published,
            PublicationStatus = publicationStatus,
            AvailableFromUtc = command.AvailableFromUtc,
            SortOrder = Math.Max(0, command.SortOrder)
        };
        db.Lessons.Add(lesson);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLessonAdded", nameof(Lesson), lesson.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return lesson.Id;
    }

    public async Task<bool> UpdateLessonAsync(string teacherUserId, Guid lessonId, UpdateLessonCommand command, CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == lessonId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        var arabicTitle = OptionalText(command.ArabicTitle);
        if (lesson is null
            || !IsEditable(lesson.CourseModule!.Course!.Status)
            || arabicTitle is null
            || !Enum.TryParse<LessonType>(command.Type, true, out var lessonType)
            || !TryPublicationStatus(command.PublicationStatus, command.AvailableFromUtc, out var publicationStatus)
            || !await HasValidLessonLocationAsync(lesson.CourseModuleId, command.LearningAimId, command.TopicId, cancellationToken)) return false;
        var englishTitle = OptionalText(command.EnglishTitle) ?? arabicTitle;
        lesson.ArabicTitle = arabicTitle;
        lesson.EnglishTitle = englishTitle;
        lesson.ArabicBody = command.ArabicBody?.Trim();
        lesson.EnglishBody = command.EnglishBody?.Trim();
        lesson.Type = lessonType;
        lesson.DurationSeconds = Math.Max(0, command.DurationSeconds);
        lesson.IsPreview = command.IsPreview;
        lesson.BtecLearningAimId = command.LearningAimId;
        lesson.BtecTopicId = command.TopicId;
        lesson.PublicationStatus = publicationStatus;
        lesson.AvailableFromUtc = command.AvailableFromUtc;
        lesson.IsPublished = publicationStatus == ContentPublicationStatus.Published;
        lesson.SortOrder = Math.Max(0, command.SortOrder);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLessonUpdated", nameof(Lesson), lesson.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteLessonAsync(string teacherUserId, Guid lessonId, CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == lessonId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (lesson is null || !IsEditable(lesson.CourseModule!.Course!.Status)) return false;
        var videoKeys = await db.LessonResources
            .Where(item => item.LessonId == lessonId && (item.ContentType == "video/mp4" || item.ContentType == "video/webm"))
            .Select(item => item.StorageKey).Distinct().ToArrayAsync(cancellationToken);
        foreach (var key in videoKeys)
        {
            if (!await db.LessonResources.AnyAsync(item => item.StorageKey == key && item.LessonId != lessonId, cancellationToken))
                EnqueueVideoDeletion(key);
        }
        db.Lessons.Remove(lesson);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLessonDeleted", nameof(Lesson), lessonId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Guid?> DuplicateLessonAsync(string teacherUserId, Guid lessonId, CancellationToken cancellationToken = default)
    {
        var source = await db.Lessons
            .Include(x => x.CourseModule).ThenInclude(x => x!.Course)
            .Include(x => x.Resources)
            .SingleOrDefaultAsync(x => x.Id == lessonId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (source is null || !IsEditable(source.CourseModule!.Course!.Status)) return null;
        var clone = new Lesson
        {
            CourseModuleId = source.CourseModuleId,
            BtecLearningAimId = source.BtecLearningAimId,
            BtecTopicId = source.BtecTopicId,
            ArabicTitle = $"نسخة من {source.ArabicTitle}",
            EnglishTitle = $"Copy of {source.EnglishTitle}",
            ArabicBody = source.ArabicBody,
            EnglishBody = source.EnglishBody,
            Type = source.Type,
            DurationSeconds = source.DurationSeconds,
            IsPreview = source.IsPreview,
            IsPublished = false,
            PublicationStatus = ContentPublicationStatus.Draft,
            SortOrder = source.SortOrder + 1,
            VideoReference = Guid.TryParse(source.VideoReference, out _) ? null : source.VideoReference
        };
        foreach (var resource in source.Resources)
        {
            var copiedResource = new LessonResource
            {
                DisplayName = resource.DisplayName,
                StorageKey = resource.StorageKey,
                ContentType = resource.ContentType,
                ExternalUrl = resource.ExternalUrl,
                ScanStatus = resource.ScanStatus,
                IsDownloadable = resource.IsDownloadable
            };
            clone.Resources.Add(copiedResource);
            if (Guid.TryParse(source.VideoReference, out var sourceVideoId) && sourceVideoId == resource.Id)
                clone.VideoReference = copiedResource.Id.ToString();
        }
        db.Lessons.Add(clone);
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLessonDuplicated", nameof(Lesson), clone.Id.ToString(), lessonId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return clone.Id;
    }

    public async Task<bool> AddLessonResourceAsync(string teacherUserId, AddLessonResourceCommand command, CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == command.LessonId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (lesson is null || !IsEditable(lesson.CourseModule!.Course!.Status) || string.IsNullOrWhiteSpace(command.DisplayName) || string.IsNullOrWhiteSpace(command.StorageKey) || string.IsNullOrWhiteSpace(command.ContentType)) return false;
        db.LessonResources.Add(new LessonResource
        {
            LessonId = lesson.Id,
            DisplayName = command.DisplayName.Trim(),
            StorageKey = command.StorageKey,
            ContentType = command.ContentType,
            ScanStatus = UploadScanStatus.Clean,
            IsDownloadable = command.IsDownloadable
        });
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLessonResourceAdded", nameof(LessonResource), command.LessonId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<LessonVideoChangeResult?> AddLessonVideoAsync(string teacherUserId, AddLessonVideoCommand command, CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons
            .Include(x => x.CourseModule).ThenInclude(x => x!.Course)
            .Include(x => x.Resources)
            .SingleOrDefaultAsync(x => x.Id == command.LessonId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (lesson is null || !IsEditable(lesson.CourseModule!.Course!.Status)
            || string.IsNullOrWhiteSpace(command.DisplayName) || command.DisplayName.Trim().Length > 240
            || string.IsNullOrWhiteSpace(command.StorageKey)
            || command.ContentType is not ("video/mp4" or "video/webm"))
            return null;

        var deletions = new List<Guid>();
        var previous = CurrentVideo(lesson);
        if (previous is not null)
        {
            db.LessonResources.Remove(previous);
            if (!await db.LessonResources.AnyAsync(item => item.StorageKey == previous.StorageKey && item.Id != previous.Id, cancellationToken))
                deletions.Add(EnqueueVideoDeletion(previous.StorageKey));
        }

        var video = new LessonResource
        {
            LessonId = lesson.Id,
            DisplayName = command.DisplayName.Trim(),
            StorageKey = command.StorageKey,
            ContentType = command.ContentType,
            ScanStatus = UploadScanStatus.Clean,
            // Videos use the protected streaming endpoint rather than a
            // downloadable resource URL.
            IsDownloadable = false
        };
        db.LessonResources.Add(video);
        lesson.Type = LessonType.Video;
        lesson.VideoReference = video.Id.ToString();
        db.AuditLogs.Add(Audit(teacherUserId, previous is null ? "CourseLessonVideoUploaded" : "CourseLessonVideoReplaced", nameof(LessonResource), video.Id.ToString(), lesson.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return new LessonVideoChangeResult(video.Id, deletions);
    }

    public async Task<LessonVideoChangeResult?> RemoveLessonVideoAsync(string teacherUserId, Guid lessonId, CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons
            .Include(item => item.CourseModule).ThenInclude(item => item!.Course)
            .Include(item => item.Resources)
            .SingleOrDefaultAsync(item => item.Id == lessonId && item.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (lesson is null || !IsEditable(lesson.CourseModule!.Course!.Status)) return null;
        var previous = CurrentVideo(lesson);
        if (previous is null) return null;

        var deletions = new List<Guid>();
        db.LessonResources.Remove(previous);
        lesson.VideoReference = null;
        lesson.Type = LessonType.Text;
        if (!await db.LessonResources.AnyAsync(item => item.StorageKey == previous.StorageKey && item.Id != previous.Id, cancellationToken))
            deletions.Add(EnqueueVideoDeletion(previous.StorageKey));
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLessonVideoRemoved", nameof(LessonResource), previous.Id.ToString(), lesson.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return new LessonVideoChangeResult(null, deletions);
    }

    private static LessonResource? CurrentVideo(Lesson lesson) =>
        Guid.TryParse(lesson.VideoReference, out var videoId)
            ? lesson.Resources.SingleOrDefault(item => item.Id == videoId
                && item.ContentType is "video/mp4" or "video/webm")
            : null;

    private Guid EnqueueVideoDeletion(string storageKey)
    {
        var operation = new StorageLifecycleOperation
        {
            Action = StorageLifecycleAction.Delete,
            StorageKey = storageKey
        };
        db.StorageLifecycleOperations.Add(operation);
        return operation.Id;
    }

    public async Task<bool> AddLessonResourceLinkAsync(string teacherUserId, AddLessonResourceLinkCommand command, CancellationToken cancellationToken = default)
    {
        var lesson = await db.Lessons.Include(x => x.CourseModule).ThenInclude(x => x!.Course)
            .SingleOrDefaultAsync(x => x.Id == command.LessonId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
        if (lesson is null || !IsEditable(lesson.CourseModule!.Course!.Status)
            || string.IsNullOrWhiteSpace(command.DisplayName) || command.DisplayName.Trim().Length > 240
            || !Uri.TryCreate(command.ExternalUrl, UriKind.Absolute, out var link) || link.Scheme != Uri.UriSchemeHttps)
            return false;
        db.LessonResources.Add(new LessonResource
        {
            LessonId = lesson.Id,
            DisplayName = command.DisplayName.Trim(),
            StorageKey = string.Empty,
            ContentType = "text/uri-list",
            ExternalUrl = link.AbsoluteUri,
            ScanStatus = UploadScanStatus.Clean,
            IsDownloadable = true
        });
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLessonResourceLinkAdded", nameof(LessonResource), command.LessonId.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> SetPresentationAsync(string teacherUserId, SetCoursePresentationCommand command, CancellationToken cancellationToken = default)
    {
        var course = await OwnedCourseAsync(teacherUserId, command.CourseId, cancellationToken);
        if (course is null || !IsEditable(course.Status) || string.IsNullOrWhiteSpace(command.CoverImageKey) || string.IsNullOrWhiteSpace(command.CoverImageContentType)) return false;
        course.CoverImageKey = command.CoverImageKey;
        course.CoverImageContentType = command.CoverImageContentType;
        course.SeoTitle = command.SeoTitle?.Trim();
        course.SeoDescription = command.SeoDescription?.Trim();
        db.AuditLogs.Add(Audit(teacherUserId, "CoursePresentationUpdated", nameof(Course), course.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> AddOutcomeAsync(string teacherUserId, AddOutcomeCommand command, CancellationToken cancellationToken = default)
    {
        var course = await OwnedCourseAsync(teacherUserId, command.CourseId, cancellationToken);
        if (course is null || !IsEditable(course.Status) || string.IsNullOrWhiteSpace(command.ArabicText) || string.IsNullOrWhiteSpace(command.EnglishText)) return false;
        db.CourseLearningOutcomes.Add(new CourseLearningOutcome { CourseId = course.Id, ArabicText = command.ArabicText.Trim(), EnglishText = command.EnglishText.Trim(), SortOrder = command.SortOrder });
        db.AuditLogs.Add(Audit(teacherUserId, "CourseLearningOutcomeAdded", nameof(Course), course.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<QualityGateResult?> SubmitForReviewAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default)
    {
        var course = await CompleteCourseForQualityAsync(x => x.Id == courseId && x.TeacherUserId == teacherUserId, cancellationToken);
        if (course is null || !IsEditable(course.Status)) return null;
        var result = CheckQuality(course);
        if (!result.Passed) return result;
        course.Status = CourseStatus.SubmittedForReview;
        db.AuditLogs.Add(Audit(teacherUserId, "CourseSubmittedForReview", nameof(Course), course.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<bool> ReviewAsync(string adminUserId, Guid courseId, bool approved, string? reason, CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.Include(item => item.Subject).SingleOrDefaultAsync(x => x.Id == courseId && x.Status == CourseStatus.SubmittedForReview, cancellationToken);
        if (course is null) return false;
        course.Status = approved ? CourseStatus.Approved : CourseStatus.Rejected;
        if (approved && course.Subject is { IsVisible: false } subject && subject.CreatedByUserId == course.TeacherUserId)
        {
            subject.IsVisible = true;
            subject.UpdatedByUserId = adminUserId;
            db.AuditLogs.Add(Audit(adminUserId, "TeacherSubjectApproved", nameof(Subject), subject.Id.ToString()));
        }
        db.AuditLogs.Add(Audit(adminUserId, approved ? "CourseApproved" : "CourseRejected", nameof(Course), course.Id.ToString(), reason));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> PublishAsync(string adminUserId, Guid courseId, CancellationToken cancellationToken = default)
    {
        var course = await CompleteCourseForQualityAsync(x => x.Id == courseId && x.Status == CourseStatus.Approved, cancellationToken);
        if (course is null || !CheckQuality(course).Passed) return false;
        course.Status = CourseStatus.Published;
        course.PublishedAtUtc = DateTimeOffset.UtcNow;
        course.ScheduledPublishAtUtc = null;
        db.AuditLogs.Add(Audit(adminUserId, "CoursePublished", nameof(Course), course.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> ScheduleAsync(string adminUserId, Guid courseId, DateTimeOffset publishAtUtc, CancellationToken cancellationToken = default)
    {
        var course = await CompleteCourseForQualityAsync(x => x.Id == courseId && x.Status == CourseStatus.Approved, cancellationToken);
        if (course is null || publishAtUtc <= DateTimeOffset.UtcNow || !CheckQuality(course).Passed) return false;
        course.Status = CourseStatus.Scheduled;
        course.ScheduledPublishAtUtc = publishAtUtc;
        db.AuditLogs.Add(Audit(adminUserId, "CourseScheduled", nameof(Course), course.Id.ToString(), publishAtUtc.ToString("O")));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> ArchiveAsync(string adminUserId, Guid courseId, CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.SingleOrDefaultAsync(x => x.Id == courseId
            && (x.Status == CourseStatus.Published || x.Status == CourseStatus.Scheduled || x.Status == CourseStatus.Approved), cancellationToken);
        if (course is null) return false;
        course.Status = CourseStatus.Archived;
        course.ScheduledPublishAtUtc = null;
        db.AuditLogs.Add(Audit(adminUserId, "CourseArchived", nameof(Course), course.Id.ToString()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static QualityGateResult CheckQuality(Course course)
    {
        var reasons = new List<string>();
        if (string.IsNullOrWhiteSpace(course.ArabicTitle)) reasons.Add("Course title is required.");
        if (string.IsNullOrWhiteSpace(course.ArabicDescription)) reasons.Add("Course description is required.");
        if (string.IsNullOrWhiteSpace(course.CoverImageKey)) reasons.Add("A processed, safe cover image is required.");
        if (!course.IsFree && course.Price <= 0) reasons.Add("A paid course needs a valid price.");
        if (!course.Modules.Any(x => x.IsPublished && x.Lessons.Any(y => y.IsPublished))) reasons.Add("At least one published module and lesson are required.");
        if (course.Modules.SelectMany(x => x.Lessons).Any(x => x.Type == LessonType.Video && x.DurationSeconds <= 0)) reasons.Add("Published video lessons need a duration.");
        return new QualityGateResult(reasons.Count == 0, reasons);
    }

    private static string RequiredText(string? value) => OptionalText(value)
        ?? throw new ArgumentException("A required course field is missing.", nameof(value));

    private static string? OptionalText(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<UnitDefinition?> CanonicalUnitAsync(Guid id, CancellationToken cancellationToken)
    {
        var unit = await db.UnitDefinitions.AsNoTracking()
            .Include(x => x.QualificationVersion).ThenInclude(x => x!.Qualification)
            .Include(x => x.LearningAims).ThenInclude(x => x.Criteria)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (unit is null || !unit.IsActive || unit.PublishedAtUtc is null
            || unit.QualificationVersion is not { IsActive: true, Qualification: { IsActive: true } }) return null;
        // The delivery criterion code is unique within a unit. Reject catalogue
        // definitions that cannot be represented without collapsing two codes.
        var codes = unit.LearningAims.SelectMany(x => x.Criteria).Select(x => x.Code).ToArray();
        return codes.Distinct(StringComparer.OrdinalIgnoreCase).Count() == codes.Length ? unit : null;
    }

    private static bool CanUseVersion(Course course, UnitDefinition unit) =>
        course.QualificationVersionId is null || course.QualificationVersionId == unit.QualificationVersionId;

    private async Task<T> InCanonicalTransactionAsync<T>(Func<Task<T>> work, T rejected, CancellationToken cancellationToken)
    {
        if (!db.Database.IsRelational()) return await work();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var result = await work();
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch (Exception ex) when (IsCanonicalWriteConflict(ex))
        {
            return rejected;
        }
    }

    private static bool IsCanonicalWriteConflict(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres
                && postgres.SqlState is PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.UniqueViolation) return true;
        }
        return false;
    }

    private void AddCanonicalStructure(CourseModule module, UnitDefinition unit)
    {
        foreach (var definition in unit.LearningAims.OrderBy(x => x.SortOrder))
        {
            var aim = new BtecLearningAim
            {
                CourseModule = module,
                LearningAimDefinitionId = definition.Id,
                Code = definition.Code,
                ArabicTitle = definition.ArabicTitle,
                EnglishTitle = definition.EnglishTitle,
                ArabicDescription = definition.ArabicDescription,
                EnglishDescription = definition.EnglishDescription,
                SortOrder = definition.SortOrder,
                PublicationStatus = ContentPublicationStatus.Published
            };
            module.LearningAims.Add(aim);
            db.BtecLearningAims.Add(aim);
            foreach (var criterionDefinition in definition.Criteria.OrderBy(x => x.SortOrder))
            {
                var criterion = new BtecCriterion
                {
                    CourseModule = module,
                    BtecLearningAim = aim,
                    AssessmentCriterionDefinitionId = criterionDefinition.Id,
                    Code = criterionDefinition.Code,
                    Band = criterionDefinition.Band,
                    ArabicDescription = criterionDefinition.ArabicDescription,
                    EnglishDescription = criterionDefinition.EnglishDescription,
                    SortOrder = criterionDefinition.SortOrder,
                    PublicationStatus = ContentPublicationStatus.Published
                };
                module.Criteria.Add(criterion);
                db.BtecCriteria.Add(criterion);
            }
        }
    }

    private async Task<Course?> OwnedCourseAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken) => await db.Courses.SingleOrDefaultAsync(x => x.Id == courseId && x.TeacherUserId == teacherUserId, cancellationToken);
    private async Task<Course?> CompleteCourseForQualityAsync(System.Linq.Expressions.Expression<Func<Course, bool>> predicate, CancellationToken cancellationToken) => await db.Courses
        .Include(x => x.LearningTrack)
        .Include(x => x.Modules).ThenInclude(x => x.Lessons)
        .Include(x => x.Modules).ThenInclude(x => x.LearningAims)
        .Include(x => x.Modules).ThenInclude(x => x.Criteria)
        .Include(x => x.LearningOutcomes)
        .SingleOrDefaultAsync(predicate, cancellationToken);
    private async Task<CourseModule?> OwnedModuleAsync(string teacherUserId, Guid moduleId, CancellationToken cancellationToken) => await db.CourseModules
        .Include(x => x.Course).ThenInclude(x => x!.LearningTrack)
        .SingleOrDefaultAsync(x => x.Id == moduleId && x.Course!.TeacherUserId == teacherUserId, cancellationToken);
    private async Task<BtecLearningAim?> OwnedLearningAimAsync(string teacherUserId, Guid learningAimId, CancellationToken cancellationToken) => await db.BtecLearningAims.Include(x => x.CourseModule).ThenInclude(x => x!.Course).SingleOrDefaultAsync(x => x.Id == learningAimId && x.CourseModule!.Course!.TeacherUserId == teacherUserId, cancellationToken);
    private static bool IsEditable(CourseStatus status) => status is CourseStatus.Draft or CourseStatus.Rejected;

    private async Task<bool> HasValidLessonLocationAsync(Guid moduleId, Guid? learningAimId, Guid? topicId, CancellationToken cancellationToken)
    {
        if (learningAimId is { } aimId && !await db.BtecLearningAims.AnyAsync(x => x.Id == aimId && x.CourseModuleId == moduleId, cancellationToken)) return false;
        if (topicId is not { } selectedTopicId) return true;
        return await db.BtecTopics.AnyAsync(x => x.Id == selectedTopicId
            && x.BtecLearningAim!.CourseModuleId == moduleId
            && (!learningAimId.HasValue || x.BtecLearningAimId == learningAimId.Value), cancellationToken);
    }

    private static bool TryPublicationStatus(string? rawStatus, DateTimeOffset? availableFromUtc, out ContentPublicationStatus status)
    {
        if (!Enum.TryParse(rawStatus, true, out status)) return false;
        if (status == ContentPublicationStatus.Scheduled) return availableFromUtc is { } at && at > DateTimeOffset.UtcNow;
        return !availableFromUtc.HasValue;
    }

    private static bool TryCriterion(string? rawCode, string? rawBand, out string code, out BtecCriterionBand band)
    {
        code = string.Empty;
        band = default;
        if (string.IsNullOrWhiteSpace(rawCode) || !Enum.TryParse(rawBand, true, out band)) return false;
        var normalized = rawCode.Trim().ToUpperInvariant();
        var separator = normalized.IndexOf('.', StringComparison.Ordinal);
        if (separator <= 0 || separator == normalized.Length - 1 || normalized.IndexOf('.', separator + 1) >= 0) return false;
        var suffix = normalized[(separator + 1)..];
        if (suffix.Length < 2 || suffix[0] is not ('P' or 'M' or 'D') || !int.TryParse(suffix[1..], out var number) || number <= 0) return false;
        var expectedBand = suffix[0] switch
        {
            'P' => BtecCriterionBand.Pass,
            'M' => BtecCriterionBand.Merit,
            _ => BtecCriterionBand.Distinction
        };
        if (band != expectedBand) return false;
        code = normalized;
        return true;
    }

    private async Task<string?> UniqueUnitCodeAsync(Guid courseId, string? sourceCode, CancellationToken cancellationToken)
    {
        var code = NormalizeOptionalCode(sourceCode);
        if (code is null) return null;
        var candidate = $"{code}-COPY";
        var suffix = 2;
        while (await db.CourseModules.AnyAsync(x => x.CourseId == courseId && x.UnitCode == candidate, cancellationToken)) candidate = $"{code}-COPY-{suffix++}";
        return candidate;
    }

    private static string? NormalizeOptionalCode(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToUpperInvariant();
    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static int? NonNegativeOrNull(int? value) => value is null ? null : Math.Max(0, value.Value);
    private async Task<string> UniqueSlugAsync(string title, Guid? excludingCourseId, CancellationToken cancellationToken)
    {
        var baseSlug = string.Concat(title.ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-')).Trim('-');
        if (string.IsNullOrWhiteSpace(baseSlug)) baseSlug = "course";
        var candidate = baseSlug;
        var suffix = 2;
        while (await db.Courses.AnyAsync(x => x.Slug == candidate && x.Id != excludingCourseId, cancellationToken)) candidate = $"{baseSlug}-{suffix++}";
        return candidate;
    }
    private static AuditLog Audit(string actor, string action, string entityType, string entityId, string? metadata = null) => new() { ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId, Outcome = "Success", MetadataJson = metadata };
}
