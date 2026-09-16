using Betcco.Application.Courses;
using Betcco.Domain.Common;
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
            IsBtecFocused = true
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
        await db.SaveChangesAsync();
        var authoring = new CourseAuthoringService(db);
        var courseId = await authoring.CreateDraftAsync("teacher-1", new CreateCourseCommand(
            "دورة BTEC", "BTEC course", "وصف عربي", "Course description", track.Id, null, null, null, 0m, true));

        var moduleId = await authoring.AddModuleAsync("teacher-1", new CreateModuleCommand(
            courseId, "الوحدة أ", "Unit A", 1, "UNIT-1", "وصف الوحدة", "Unit description", 30, 3, "Level 3"));
        Assert.NotNull(moduleId);
        var aimId = await authoring.AddLearningAimAsync("teacher-1", new CreateLearningAimCommand(
            moduleId!.Value, "A", "هدف التعلم أ", "Learning aim A", "وصف", "Description", 1));
        Assert.NotNull(aimId);
        var topicId = await authoring.AddTopicAsync("teacher-1", new CreateTopicCommand(
            aimId!.Value, "موضوع أ.1", "Topic A.1", "وصف", "Description", 1));
        Assert.NotNull(topicId);
        var criterionId = await authoring.AddCriterionAsync("teacher-1", new CreateBtecCriterionCommand(
            moduleId.Value, aimId.Value, "A.P1", "Pass", "يطبق المهارة", "Applies the skill", "دليل عربي", "English evidence", 1));
        Assert.NotNull(criterionId);
        Assert.Null(await authoring.AddCriterionAsync("teacher-1", new CreateBtecCriterionCommand(
            moduleId.Value, aimId.Value, "A.P2", "Merit", "وصف", "Description", null, null, 2)));

        var lessonId = await authoring.AddLessonAsync("teacher-1", new CreateLessonCommand(
            moduleId.Value, "درس مرتبط", "Linked lesson", "النص", "Body", "Text", 300, false, 1, aimId, topicId));
        Assert.NotNull(lessonId);
        Assert.False(await authoring.DeleteTopicAsync("teacher-2", topicId.Value));
        Assert.True(await authoring.DeleteTopicAsync("teacher-1", topicId.Value));

        var lessonAfterTopicDeletion = await db.Lessons.SingleAsync(item => item.Id == lessonId.Value);
        Assert.Null(lessonAfterTopicDeletion.BtecTopicId);
        var duplicateUnitId = await authoring.DuplicateModuleAsync("teacher-1", moduleId.Value);
        Assert.NotNull(duplicateUnitId);

        var clonedUnit = await db.CourseModules
            .Include(item => item.LearningAims).ThenInclude(item => item.Topics)
            .Include(item => item.Criteria)
            .Include(item => item.Lessons)
            .SingleAsync(item => item.Id == duplicateUnitId!.Value);
        Assert.Equal(ContentPublicationStatus.Draft, clonedUnit.PublicationStatus);
        Assert.False(clonedUnit.IsPublished);
        Assert.Single(clonedUnit.LearningAims);
        Assert.Single(clonedUnit.Criteria);
        Assert.Single(clonedUnit.Lessons);
        Assert.Equal(ContentPublicationStatus.Draft, clonedUnit.Lessons.Single().PublicationStatus);
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
        var track = new LearningTrack { Slug = "btec-essentials", ArabicName = "BTEC", EnglishName = "BTEC", IsBtecFocused = true };
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

    private static BetccoDbContext CreateDb() => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
}
