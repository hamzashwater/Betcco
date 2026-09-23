using Betcco.Application.Courses;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class CourseAuthoringServiceTests
{
    [Fact]
    public async Task Teacher_can_build_a_draft_then_submit_review_and_publish_after_quality_gate()
    {
        await using var db = CreateDb();
        var track = new LearningTrack
        {
            Slug = "btec",
            ArabicName = "BTEC",
            EnglishName = "BTEC",
            IsBtecFocused = false
        };
        var specialization = new Specialization
        {
            Slug = "information-technology",
            ArabicName = "تكنولوجيا المعلومات",
            EnglishName = "Information Technology",
            LearningTrack = track
        };
        var proposedSubject = new Subject
        {
            Slug = "programming",
            ArabicName = "البرمجة",
            EnglishName = "Programming",
            Specialization = specialization,
            IsVisible = false,
            CreatedByUserId = "teacher-1"
        };
        db.AddRange(track, specialization, proposedSubject);
        await db.SaveChangesAsync();

        var authoring = new CourseAuthoringService(db);
        var courseId = await authoring.CreateDraftAsync(
            "teacher-1",
            new CreateCourseCommand(
                "أساسيات البرمجة",
                "Programming foundations",
                "وصف قصير",
                "Short summary",
                track.Id,
                null,
                specialization.Id,
                proposedSubject.Id,
                12m,
                false));

        var moduleId = await authoring.AddModuleAsync(
            "teacher-1",
            new CreateModuleCommand(courseId, "الوحدة الأولى", "Module one", 1));
        Assert.NotNull(moduleId);

        var aimId = await authoring.AddLearningAimAsync(
            "teacher-1",
            new CreateLearningAimCommand(
                moduleId!.Value,
                "A",
                "هدف التعلم أ",
                "Learning aim A",
                null,
                null,
                1));
        Assert.NotNull(aimId);
        Assert.NotNull(await authoring.AddCriterionAsync(
            "teacher-1",
            new CreateBtecCriterionCommand(
                moduleId.Value,
                aimId,
                "A.P1",
                "Pass",
                "يطبق المتطلبات الأساسية",
                "Applies the core requirements",
                null,
                null,
                1)));

        var lessonId = await authoring.AddLessonAsync(
            "teacher-1",
            new CreateLessonCommand(
                moduleId!.Value,
                "الدرس الأول",
                "Lesson one",
                "محتوى الدرس",
                "Lesson body",
                "Text",
                600,
                true,
                1,
                aimId));
        Assert.NotNull(lessonId);

        Assert.True(await authoring.UpdateLessonAsync(
            "teacher-1",
            lessonId!.Value,
            new UpdateLessonCommand(
                "الدرس الأول المعدل",
                "Updated lesson one",
                "محتوى الدرس المعدل",
                "Updated lesson body",
                "Text",
                720,
                true,
                1)));
        Assert.True(await authoring.AddLessonResourceAsync(
            "teacher-1",
            new AddLessonResourceCommand(
                lessonId.Value,
                "worksheet.pdf",
                "2026/08/private-resource",
                "application/pdf",
                true)));
        Assert.True(await authoring.AddOutcomeAsync(
            "teacher-1",
            new AddOutcomeCommand(courseId, "تطبيق المفاهيم", "Apply the concepts", 1)));

        var incompleteQuality = await authoring.SubmitForReviewAsync("teacher-1", courseId);
        Assert.NotNull(incompleteQuality);
        Assert.False(incompleteQuality.Passed);
        Assert.Contains(incompleteQuality.Reasons, reason => reason.Contains("cover", StringComparison.OrdinalIgnoreCase));

        Assert.True(await authoring.SetPresentationAsync(
            "teacher-1",
            new SetCoursePresentationCommand(
                courseId,
                "2026/08/course-cover",
                "image/png",
                "Programming foundations",
                "Course SEO description")));
        Assert.True(await authoring.UpdateCourseAsync(
            "teacher-1",
            courseId,
            new UpdateCourseCommand(
                "أساسيات البرمجة لطلاب BTEC",
                "Programming foundations for BTEC learners",
                "تعلّم مفاهيم البرمجة الأساسية ثم طبّقها من خلال دروس عملية ومهام واضحة تقيس مهاراتك.",
                "Learn core programming concepts and apply them through practical lessons and clear assignments that measure your skills.",
                12m,
                false)));

        var quality = await authoring.SubmitForReviewAsync("teacher-1", courseId);
        Assert.NotNull(quality);
        Assert.True(quality.Passed);
        Assert.False(await authoring.UpdateCourseAsync(
            "teacher-1",
            courseId,
            new UpdateCourseCommand(
                "عنوان مختلف",
                "Different title",
                "وصف",
                "Description",
                12m,
                false)));

        Assert.True(await authoring.ReviewAsync("admin-1", courseId, true, null));
        Assert.True((await db.Subjects.SingleAsync(item => item.Id == proposedSubject.Id)).IsVisible);
        Assert.Contains(db.AuditLogs, item => item.Action == "TeacherSubjectApproved" && item.EntityId == proposedSubject.Id.ToString());
        Assert.True(await authoring.PublishAsync("admin-1", courseId));

        var course = await db.Courses
            .Include(item => item.Modules)
            .ThenInclude(item => item.Lessons)
            .ThenInclude(item => item.Resources)
            .SingleAsync(item => item.Id == courseId);
        Assert.Equal(CourseStatus.Published, course.Status);
        Assert.Equal("image/png", course.CoverImageContentType);
        Assert.Single(course.Modules);
        Assert.Single(course.Modules.Single().Lessons.Single().Resources);
    }

    [Fact]
    public async Task Teacher_can_manage_a_btec_unit_hierarchy_without_cross_course_access()
    {
        await using var db = CreateDb();
        var track = new LearningTrack
        {
            Slug = "btec-hierarchy",
            ArabicName = "BTEC",
            EnglishName = "BTEC",
            IsBtecFocused = true
        };
        db.LearningTracks.Add(track);
        var unit = AddPublishedUnit(db);
        await db.SaveChangesAsync();
        var (grade, specialization, planId, entryId) = await PlanForUnitAsync(db, track, unit);
        var authoring = new CourseAuthoringService(db);
        var courseId = await authoring.CreateDraftAsync("teacher-1", new CreateCourseCommand(
            "دورة BTEC", "BTEC course", "وصف عربي", "Course description", track.Id, grade.Id, specialization.Id, null, 0m, true, planId));

        Assert.Null(await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(
            courseId, "وحدة حرة", "Free unit", 1, "FREE")));
        var moduleId = await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(
            courseId, "ignored", "ignored", 1, "WRONG", DeliveryPlanEntryId: entryId));
        Assert.NotNull(moduleId);
        var delivery = await db.CourseModules.Include(x => x.LearningAims).Include(x => x.Criteria)
            .SingleAsync(x => x.Id == moduleId);
        Assert.Equal(unit.Id, delivery.UnitDefinitionId);
        Assert.Equal(unit.Code, delivery.UnitCode);
        Assert.Equal(unit.ArabicTitle, delivery.ArabicTitle);
        Assert.Equal(unit.EnglishTitle, delivery.EnglishTitle);
        Assert.Single(delivery.LearningAims);
        Assert.Single(delivery.Criteria);
        Assert.Equal(unit.LearningAims.Single().Id, delivery.LearningAims.Single().LearningAimDefinitionId);
        Assert.Equal(unit.LearningAims.Single().Criteria.Single().Id, delivery.Criteria.Single().AssessmentCriterionDefinitionId);
        var aimId = delivery.LearningAims.Single().Id;
        Assert.Null(await authoring.AddLearningAimAsync("teacher-1", new CreateLearningAimCommand(
            moduleId!.Value, "B", "هدف", "Aim", null, null, 2)));
        Assert.Null(await authoring.AddCriterionAsync("teacher-1", new CreateBtecCriterionCommand(
            moduleId.Value, aimId, "A.P2", "Pass", "وصف", "Description", null, null, 2)));
        var topicId = await authoring.AddTopicAsync("teacher-1", new CreateTopicCommand(
            aimId, "موضوع أ.1", "Topic A.1", "وصف", "Description", 1));
        Assert.NotNull(topicId);

        var lessonId = await authoring.AddLessonAsync("teacher-1", new CreateLessonCommand(
            moduleId.Value, "درس مرتبط", "Linked lesson", "النص", "Body", "Text", 300, false, 1, aimId, topicId));
        Assert.NotNull(lessonId);
        Assert.False(await authoring.DeleteTopicAsync("teacher-2", topicId.Value));
        Assert.True(await authoring.DeleteTopicAsync("teacher-1", topicId.Value));

        var lessonAfterTopicDeletion = await db.Lessons.SingleAsync(item => item.Id == lessonId.Value);
        Assert.Null(lessonAfterTopicDeletion.BtecTopicId);
        Assert.Null(await authoring.DuplicateModuleAsync("teacher-1", moduleId.Value));
        Assert.Null(await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(
            courseId, "", "", 2, UnitDefinitionId: unit.Id)));
        Assert.Equal(moduleId.Value, (await db.Lessons.SingleAsync(x => x.Id == lessonId)).CourseModuleId);
    }

    [Fact]
    public async Task Canonical_units_are_version_bound_and_can_be_delivered_in_different_courses()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "canonical", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        db.LearningTracks.Add(track);
        var first = AddPublishedUnit(db);
        var otherVersion = AddPublishedUnit(db, "UNIT-2", "2027", "QUAL");
        var otherQualification = AddPublishedUnit(db, "UNIT-3", "2026", "OTHER");
        await db.SaveChangesAsync();
        var (grade, specialization, planId, entryId) = await PlanForUnitAsync(db, track, first);
        var authoring = new CourseAuthoringService(db);
        var courseId = await authoring.CreateDraftAsync("teacher-1", new CreateCourseCommand(
            "دورة", "Course", "وصف", "Description", track.Id, grade.Id, specialization.Id, null, 0, true, planId));
        var secondCourseId = await authoring.CreateDraftAsync("teacher-1", new CreateCourseCommand(
            "دورة أخرى", "Other course", "وصف", "Description", track.Id, grade.Id, specialization.Id, null, 0, true, planId));

        Assert.Null(await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(courseId, "", "", 1, UnitDefinitionId: Guid.NewGuid())));
        Assert.Null(await authoring.AddModuleAsync("teacher-2", new CreateModuleCommand(courseId, "", "", 1, UnitDefinitionId: first.Id)));
        Assert.NotNull(await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(courseId, "", "", 1, DeliveryPlanEntryId: entryId)));
        Assert.Null(await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(courseId, "", "", 2, UnitDefinitionId: otherVersion.Id)));
        Assert.Null(await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(courseId, "", "", 2, UnitDefinitionId: otherQualification.Id)));
        Assert.NotNull(await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(secondCourseId, "", "", 1, DeliveryPlanEntryId: entryId)));
        Assert.Equal(first.QualificationVersionId, (await db.Courses.SingleAsync(x => x.Id == courseId)).QualificationVersionId);
    }

    [Fact]
    public async Task Legacy_link_preserves_lesson_identity_and_rejects_ambiguous_structure()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "legacy-link", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var unit = AddPublishedUnit(db);
        var course = new Course
        {
            Slug = "legacy-course",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            TeacherUserId = "teacher-1",
            IsFree = true
        };
        var module = new CourseModule { Course = course, ArabicTitle = "قديم", EnglishTitle = "Legacy", UnitCode = "OLD" };
        var lesson = new Lesson { CourseModule = module, ArabicTitle = "درس", EnglishTitle = "Lesson", Type = LessonType.Text };
        var progress = new LessonProgress { LessonId = lesson.Id, StudentUserId = "student-1", IsCompleted = true, LastPositionSeconds = 80 };
        var assignment = new CourseAssignment
        {
            Course = course,
            CourseModule = module,
            ArabicTitle = "واجب",
            EnglishTitle = "Assignment",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            DueAtUtc = DateTimeOffset.UtcNow.AddDays(7)
        };
        var submission = new CourseAssignmentSubmission { CourseAssignment = assignment, StudentUserId = "student-1" };
        var extension = new CourseAssignmentDeadlineExtension
        {
            CourseAssignment = assignment,
            StudentUserId = "student-1",
            GrantedByUserId = "teacher-1",
            GrantedAtUtc = DateTimeOffset.UtcNow,
            Reason = "Approved accommodation",
            BaseDueAtUtcSnapshot = assignment.DueAtUtc!.Value,
            ExtendedDueAtUtc = assignment.DueAtUtc.Value.AddDays(2)
        };
        var ambiguous = new CourseModule { Course = course, ArabicTitle = "آخر", EnglishTitle = "Other" };
        var legacyAim = new BtecLearningAim { CourseModule = ambiguous, Code = "A", ArabicTitle = "قديم", EnglishTitle = "Legacy" };
        db.AddRange(track, course, module, lesson, progress, assignment, submission, extension, ambiguous, legacyAim);
        await db.SaveChangesAsync();
        var authoring = new CourseAuthoringService(db);

        Assert.False(await authoring.LinkModuleToUnitAsync("teacher-2", module.Id, unit.Id));
        Assert.False(await authoring.LinkModuleToUnitAsync("teacher-1", ambiguous.Id, unit.Id));
        Assert.True(await authoring.LinkModuleToUnitAsync("teacher-1", module.Id, unit.Id));
        Assert.Equal(unit.Id, (await db.CourseModules.SingleAsync(x => x.Id == module.Id)).UnitDefinitionId);
        Assert.Equal(module.Id, (await db.Lessons.SingleAsync(x => x.Id == lesson.Id)).CourseModuleId);
        Assert.True((await db.LessonProgresses.SingleAsync(x => x.Id == progress.Id)).IsCompleted);
        Assert.Equal(module.Id, (await db.CourseAssignments.SingleAsync(x => x.Id == assignment.Id)).CourseModuleId);
        Assert.Equal(assignment.Id, (await db.CourseAssignmentSubmissions.SingleAsync(x => x.Id == submission.Id)).CourseAssignmentId);
        Assert.Equal(extension.ExtendedDueAtUtc, (await db.CourseAssignmentDeadlineExtensions.SingleAsync(x => x.Id == extension.Id)).ExtendedDueAtUtc);
        Assert.Null((await db.CourseModules.SingleAsync(x => x.Id == ambiguous.Id)).UnitDefinitionId);
        Assert.Single(await db.BtecLearningAims.Where(x => x.CourseModuleId == module.Id).ToListAsync());
    }

    [Fact]
    public async Task Teacher_can_create_a_course_activity_that_uses_the_standard_lesson_access_workflow()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec-activity", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course
        {
            Slug = "activity-course",
            ArabicTitle = "دورة نشاط",
            EnglishTitle = "Activity course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Draft,
            IsFree = true
        };
        var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Unit", PublicationStatus = ContentPublicationStatus.Draft };
        db.AddRange(track, course, module);
        await db.SaveChangesAsync();
        var authoring = new CourseAuthoringService(db);

        var activityId = await authoring.AddLessonAsync("teacher-1", new CreateLessonCommand(
            module.Id, "نشاط تطبيقي", "Applied activity", "نفّذ النشاط", "Complete the activity", "Activity", 900, false, 1,
            PublicationStatus: "Draft"));

        Assert.NotNull(activityId);
        Assert.Equal(LessonType.Activity, (await db.Lessons.SingleAsync(item => item.Id == activityId)).Type);
    }

    [Fact]
    public async Task Quality_gate_accepts_course_essentials_without_optional_btec_or_english_fields()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "btec-essentials", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = false };
        db.LearningTracks.Add(track);
        await db.SaveChangesAsync();
        var authoring = new CourseAuthoringService(db);

        var courseId = await authoring.CreateDraftAsync("teacher-1", new CreateCourseCommand(
            "أساسيات الشبكات", "", "دورة عملية للمبتدئين في أساسيات الشبكات.", "", track.Id, null, null, null, 0m, true));
        var moduleId = await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(courseId, "الوحدة الأولى", "", 1));
        Assert.NotNull(moduleId);
        var lessonId = await authoring.AddLessonAsync("teacher-1", new CreateLessonCommand(
            moduleId!.Value, "ابدأ هنا", "", "محتوى الدرس الأول", "", "Text", 0, true, 1));
        Assert.NotNull(lessonId);
        Assert.True(await authoring.SetPresentationAsync("teacher-1", new SetCoursePresentationCommand(
            courseId, "2026/08/essentials-cover", "image/png", null, null)));

        var result = await authoring.SubmitForReviewAsync("teacher-1", courseId);

        Assert.NotNull(result);
        Assert.True(result.Passed);
        var course = await db.Courses.SingleAsync(item => item.Id == courseId);
        Assert.Equal(course.ArabicTitle, course.EnglishTitle);
        Assert.Equal(course.ArabicDescription, course.EnglishDescription);
    }

    [Fact]
    public async Task Teacher_can_attach_a_private_streaming_video_to_an_editable_owned_lesson()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "video-track", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
        var course = new Course
        {
            Slug = "private-video-course",
            ArabicTitle = "دورة فيديو",
            EnglishTitle = "Video course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Draft,
            IsFree = true
        };
        var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var lesson = new Lesson { CourseModule = module, ArabicTitle = "درس", EnglishTitle = "Lesson", Type = LessonType.Text };
        db.AddRange(track, course, module, lesson);
        await db.SaveChangesAsync();
        var authoring = new CourseAuthoringService(db);

        Assert.Null(await authoring.AddLessonVideoAsync("teacher-2", new AddLessonVideoCommand(lesson.Id, "lesson.mp4", "2026/08/video", "video/mp4")));
        var video = await authoring.AddLessonVideoAsync("teacher-1", new AddLessonVideoCommand(lesson.Id, "lesson.mp4", "2026/08/video", "video/mp4"));

        Assert.NotNull(video);
        Assert.Empty(video.DeletionOperationIds);
        var persistedLesson = await db.Lessons.Include(item => item.Resources).SingleAsync(item => item.Id == lesson.Id);
        var resource = Assert.Single(persistedLesson.Resources);
        Assert.Equal(LessonType.Video, persistedLesson.Type);
        Assert.Equal(video.VideoId!.Value.ToString(), persistedLesson.VideoReference);
        Assert.Equal(video.VideoId, resource.Id);
        Assert.False(resource.IsDownloadable);
        Assert.Equal("video/mp4", resource.ContentType);
        Assert.Contains(db.AuditLogs, item => item.Action == "CourseLessonVideoUploaded" && item.ActorUserId == "teacher-1");
    }

    [Fact]
    public async Task Replacing_and_removing_video_preserves_shared_copies_until_the_last_reference_is_removed()
    {
        await using var db = CreateDb();
        var course = new Course
        {
            Slug = "video-lifecycle",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = "owner",
            Status = CourseStatus.Draft,
            IsFree = true
        };
        var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var lesson = new Lesson { CourseModule = module, ArabicTitle = "درس", EnglishTitle = "Lesson", Type = LessonType.Text };
        db.AddRange(course, module, lesson);
        await db.SaveChangesAsync();
        var authoring = new CourseAuthoringService(db);

        var first = Assert.IsType<LessonVideoChangeResult>(await authoring.AddLessonVideoAsync("owner",
            new AddLessonVideoCommand(lesson.Id, "first.mp4", "objects/first", "video/mp4")));
        var copy = new Lesson { CourseModule = module, ArabicTitle = "نسخة", EnglishTitle = "Copy", Type = LessonType.Video };
        var copiedVideo = new LessonResource
        {
            Lesson = copy,
            DisplayName = "first.mp4",
            StorageKey = "objects/first",
            ContentType = "video/mp4",
            ScanStatus = UploadScanStatus.Clean,
            IsDownloadable = false
        };
        copy.Resources.Add(copiedVideo);
        copy.VideoReference = copiedVideo.Id.ToString();
        db.Lessons.Add(copy);
        await db.SaveChangesAsync();

        Assert.Null(await authoring.AddLessonVideoAsync("foreign",
            new AddLessonVideoCommand(lesson.Id, "foreign.mp4", "objects/foreign", "video/mp4")));
        Assert.Null(await authoring.RemoveLessonVideoAsync("foreign", lesson.Id));
        var replacement = Assert.IsType<LessonVideoChangeResult>(await authoring.AddLessonVideoAsync("owner",
            new AddLessonVideoCommand(lesson.Id, "second.webm", "objects/second", "video/webm")));
        Assert.Empty(replacement.DeletionOperationIds);
        Assert.Equal(replacement.VideoId!.Value.ToString(), lesson.VideoReference);
        Assert.DoesNotContain(db.LessonResources, item => item.Id == first.VideoId);

        var removedCopy = Assert.IsType<LessonVideoChangeResult>(await authoring.RemoveLessonVideoAsync("owner", copy.Id));
        Assert.Single(removedCopy.DeletionOperationIds);
        Assert.Contains(db.StorageLifecycleOperations, item => item.Id == removedCopy.DeletionOperationIds[0]
            && item.StorageKey == "objects/first" && item.Action == StorageLifecycleAction.Delete);

        var removed = Assert.IsType<LessonVideoChangeResult>(await authoring.RemoveLessonVideoAsync("owner", lesson.Id));
        Assert.Single(removed.DeletionOperationIds);
        Assert.Contains(db.StorageLifecycleOperations, item => item.Id == removed.DeletionOperationIds[0]
            && item.StorageKey == "objects/second" && item.Action == StorageLifecycleAction.Delete);
        Assert.Null(lesson.VideoReference);
        Assert.Equal(LessonType.Text, lesson.Type);
    }

    [Fact]
    public async Task Deleting_a_lesson_queues_its_unshared_video_for_private_storage_cleanup()
    {
        await using var db = CreateDb();
        var course = new Course
        {
            Slug = "delete-video-lesson",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = "owner",
            Status = CourseStatus.Draft,
            IsFree = true
        };
        var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Unit" };
        var lesson = new Lesson { CourseModule = module, ArabicTitle = "درس", EnglishTitle = "Lesson", Type = LessonType.Video };
        db.AddRange(course, module, lesson);
        await db.SaveChangesAsync();
        var authoring = new CourseAuthoringService(db);
        Assert.NotNull(await authoring.AddLessonVideoAsync("owner", new AddLessonVideoCommand(lesson.Id, "first.mp4", "objects/lesson", "video/mp4")));

        Assert.False(await authoring.DeleteLessonAsync("foreign", lesson.Id));
        Assert.True(await authoring.DeleteLessonAsync("owner", lesson.Id));
        Assert.Contains(db.StorageLifecycleOperations, item => item.StorageKey == "objects/lesson"
            && item.Action == StorageLifecycleAction.Delete && item.Status == StorageLifecycleStatus.Pending);
    }

    private static UnitDefinition AddPublishedUnit(BetccoDbContext db, string code = "UNIT-1", string versionCode = "2026", string qualificationCode = "QUAL")
    {
        var qualification = new Qualification { Code = qualificationCode, ArabicName = "مؤهل", EnglishName = "Qualification" };
        var version = new QualificationVersion
        {
            Qualification = qualification,
            VersionCode = versionCode,
            SourceReference = "Approved specification",
            EffectiveFromUtc = DateTimeOffset.UtcNow
        };
        var unit = new UnitDefinition
        {
            QualificationVersion = version,
            Code = code,
            ArabicTitle = "الوحدة المعتمدة",
            EnglishTitle = "Canonical unit",
            IsActive = true,
            PublishedAtUtc = DateTimeOffset.UtcNow
        };
        var aim = new LearningAimDefinition
        {
            UnitDefinition = unit,
            Code = "A",
            ArabicTitle = "هدف معتمد",
            EnglishTitle = "Canonical aim",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            SourceReference = "Approved specification"
        };
        var criterion = new AssessmentCriterionDefinition
        {
            LearningAimDefinition = aim,
            Code = "A.P1",
            Band = BtecCriterionBand.Pass,
            ArabicDescription = "معيار معتمد",
            EnglishDescription = "Canonical criterion",
            SourceReference = "Approved specification"
        };
        db.AddRange(qualification, version, unit, aim, criterion);
        return unit;
    }

    private static async Task<(Grade Grade, Specialization Specialization, Guid PlanId, Guid EntryId)> PlanForUnitAsync(
        BetccoDbContext db, LearningTrack track, UnitDefinition unit)
    {
        var specialization = new Specialization { LearningTrackId = track.Id, Slug = "it", ArabicName = "تقنية المعلومات", EnglishName = "IT" };
        var grade = new Grade { LearningTrackId = track.Id, Slug = "g11", ArabicName = "الحادي عشر", EnglishName = "Grade 11" };
        db.AddRange(specialization, grade);
        unit.QualificationVersion!.Qualification!.SpecializationId = specialization.Id;
        await db.SaveChangesAsync();
        var planning = new DeliveryPlanningService(db);
        var year = await planning.CreateAcademicYearAsync(new("AY-2026", new(2026, 1, 1), new(2026, 12, 31)), "admin");
        var term = await planning.CreateTermAsync(new(year.Id, "T1", new(2026, 1, 1), new(2026, 6, 30), 10), "admin");
        var plan = await planning.CreatePlanAsync(new(unit.QualificationVersionId, year.Id, grade.Id), "admin");
        plan = await planning.AddEntryAsync(plan.Plan.Id, new(unit.Id, term.Id), "admin");
        return (grade, specialization, plan.Plan.Id, Assert.Single(plan.Entries).Id);
    }

    private static BetccoDbContext CreateDb() => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
}
