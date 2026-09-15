using System.Security.Claims;
using Betcco.Api.Controllers;
using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class StudentCoursePlayerTests
{
    [Fact]
    public async Task Resume_target_and_progress_are_owned_by_the_server_and_scoped_to_the_student()
    {
        await using var fixture = await PlayerFixture.CreateAsync();

        var result = Assert.IsType<StudentCoursePlayerResult>(
            await fixture.Service.GetAsync(PlayerFixture.StudentId, fixture.Course.Id, "en", null));

        Assert.Equal(fixture.Second.Id, result.ResumeLessonId);
        Assert.Equal(fixture.Second.Id, result.CurrentLessonId);
        var second = Assert.Single(result.Modules.SelectMany(module => module.Lessons), lesson => lesson.Id == fixture.Second.Id);
        Assert.False(second.IsCompleted);
        Assert.Equal(42, second.LastPositionSeconds);
        Assert.NotNull(second.LastVisitedAtUtc);
        Assert.DoesNotContain(result.Modules.SelectMany(module => module.Lessons), lesson => lesson.LastPositionSeconds == 99);
    }

    [Fact]
    public async Task Authorized_deep_link_becomes_current_and_navigation_skips_locked_lessons()
    {
        await using var fixture = await PlayerFixture.CreateAsync();

        var result = Assert.IsType<StudentCoursePlayerResult>(
            await fixture.Service.GetAsync(PlayerFixture.StudentId, fixture.Course.Id, "en", fixture.Fourth.Id));

        Assert.Equal(fixture.Fourth.Id, result.CurrentLessonId);
        Assert.Equal(fixture.Second.Id, result.PreviousLessonId);
        Assert.Null(result.NextLessonId);
        Assert.False(result.RequestedLessonRejected);
    }

    [Fact]
    public async Task Locked_deep_link_is_rejected_without_returning_protected_material()
    {
        await using var fixture = await PlayerFixture.CreateAsync();

        var result = Assert.IsType<StudentCoursePlayerResult>(
            await fixture.Service.GetAsync(PlayerFixture.StudentId, fixture.Course.Id, "en", fixture.Locked.Id));

        Assert.True(result.RequestedLessonRejected);
        Assert.Equal(fixture.Second.Id, result.CurrentLessonId);
        var locked = Assert.Single(result.Modules.SelectMany(module => module.Lessons), lesson => lesson.Id == fixture.Locked.Id);
        Assert.True(locked.IsLocked);
        Assert.Null(locked.Body);
        Assert.Null(locked.Video);
        Assert.Empty(locked.Resources);
    }

    [Fact]
    public async Task Invalid_deep_link_is_rejected_and_resume_remains_authoritative()
    {
        await using var fixture = await PlayerFixture.CreateAsync();

        var result = Assert.IsType<StudentCoursePlayerResult>(
            await fixture.Service.GetAsync(PlayerFixture.StudentId, fixture.Course.Id, "en", Guid.NewGuid()));

        Assert.True(result.RequestedLessonRejected);
        Assert.Equal(fixture.Second.Id, result.CurrentLessonId);
    }

    [Fact]
    public async Task Player_endpoint_passes_the_deep_link_to_the_authoritative_student_service()
    {
        await using var fixture = await PlayerFixture.CreateAsync();
        var controller = new LearningController(fixture.Db, null!, fixture.Access, null!, fixture.Service)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [
                        new Claim(ClaimTypes.NameIdentifier, PlayerFixture.StudentId),
                        new Claim(ClaimTypes.Role, "Student")
                    ], "Test"))
                }
            }
        };

        var response = Assert.IsType<OkObjectResult>(
            await controller.Player(fixture.Course.Id, "en", fixture.Locked.Id));
        var result = Assert.IsType<StudentCoursePlayerResult>(response.Value);

        Assert.True(result.RequestedLessonRejected);
        Assert.Equal(fixture.Second.Id, result.CurrentLessonId);
    }

    [Fact]
    public async Task Video_completion_requires_eighty_percent_and_position_is_clamped()
    {
        await using var fixture = await PlayerFixture.CreateAsync();

        var below = Assert.IsType<StudentLessonProgressResult>(
            await fixture.Service.SaveProgressAsync(PlayerFixture.StudentId, fixture.Second.Id, 79, true));
        var threshold = Assert.IsType<StudentLessonProgressResult>(
            await fixture.Service.SaveProgressAsync(PlayerFixture.StudentId, fixture.Second.Id, 80, true));
        var bounded = Assert.IsType<StudentLessonProgressResult>(
            await fixture.Service.SaveProgressAsync(PlayerFixture.StudentId, fixture.Second.Id, 500, false));

        Assert.False(below.IsCompleted);
        Assert.True(threshold.IsCompleted);
        Assert.True(bounded.IsCompleted);
        Assert.Equal(100, bounded.LastPositionSeconds);
    }

    [Fact]
    public async Task Ordinary_progress_save_cannot_reopen_a_completed_lesson()
    {
        await using var fixture = await PlayerFixture.CreateAsync();

        var result = Assert.IsType<StudentLessonProgressResult>(
            await fixture.Service.SaveProgressAsync(PlayerFixture.StudentId, fixture.First.Id, 0, false));

        Assert.True(result.IsCompleted);
    }

    [Fact]
    public async Task Locked_or_expired_access_cannot_write_progress_or_open_the_player()
    {
        await using var fixture = await PlayerFixture.CreateAsync();

        Assert.Null(await fixture.Service.SaveProgressAsync(
            PlayerFixture.StudentId,
            fixture.Locked.Id,
            10,
            true));
        fixture.Enrollment.AccessEndsAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
        await fixture.Db.SaveChangesAsync();

        Assert.Null(await fixture.Service.GetAsync(PlayerFixture.StudentId, fixture.Course.Id, "en", null));
        Assert.Null(await fixture.Service.SaveProgressAsync(
            PlayerFixture.StudentId,
            fixture.Second.Id,
            50,
            false));
    }

    private sealed class PlayerFixture : IAsyncDisposable
    {
        internal const string StudentId = "student-1";

        private PlayerFixture(
            BetccoDbContext db,
            StudentCoursePlayerService service,
            ContentAccessService access,
            Course course,
            Enrollment enrollment,
            Lesson first,
            Lesson second,
            Lesson locked,
            Lesson fourth)
        {
            Db = db;
            Service = service;
            Access = access;
            Course = course;
            Enrollment = enrollment;
            First = first;
            Second = second;
            Locked = locked;
            Fourth = fourth;
        }

        internal BetccoDbContext Db { get; }
        internal StudentCoursePlayerService Service { get; }
        internal ContentAccessService Access { get; }
        internal Course Course { get; }
        internal Enrollment Enrollment { get; }
        internal Lesson First { get; }
        internal Lesson Second { get; }
        internal Lesson Locked { get; }
        internal Lesson Fourth { get; }

        internal static async Task<PlayerFixture> CreateAsync()
        {
            var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);
            var course = new Course
            {
                Slug = "resume-course",
                ArabicTitle = "دورة الاستئناف",
                EnglishTitle = "Resume course",
                ArabicDescription = "وصف",
                EnglishDescription = "Description",
                LearningTrackId = Guid.NewGuid(),
                IsFree = true,
                Status = CourseStatus.Published
            };
            var module = new CourseModule
            {
                Course = course,
                CourseId = course.Id,
                ArabicTitle = "الوحدة",
                EnglishTitle = "Unit",
                IsPublished = true,
                SortOrder = 1
            };
            course.Modules.Add(module);
            var first = Lesson(module, "First", 1, LessonType.Text, 0);
            var second = Lesson(module, "Second video", 2, LessonType.Video, 100, withVideo: true);
            var locked = Lesson(module, "Locked", 3, LessonType.Text, 0, withResource: true);
            var fourth = Lesson(module, "Fourth", 4, LessonType.Text, 0);
            var enrollment = new Enrollment
            {
                StudentUserId = StudentId,
                Course = course,
                CourseId = course.Id,
                EnrolledAtUtc = DateTimeOffset.UtcNow.AddDays(-5)
            };
            db.AddRange(course, enrollment);
            var now = DateTimeOffset.UtcNow;
            db.LessonProgresses.AddRange(
                new LessonProgress
                {
                    StudentUserId = StudentId,
                    LessonId = first.Id,
                    IsCompleted = true,
                    LastVisitedAtUtc = now.AddHours(-2)
                },
                new LessonProgress
                {
                    StudentUserId = StudentId,
                    LessonId = second.Id,
                    LastPositionSeconds = 42,
                    LastVisitedAtUtc = now.AddMinutes(-5)
                },
                new LessonProgress
                {
                    StudentUserId = "student-2",
                    LessonId = fourth.Id,
                    LastPositionSeconds = 99,
                    LastVisitedAtUtc = now
                });
            db.ContentAccessRules.Add(new ContentAccessRule
            {
                CourseId = course.Id,
                TargetType = LearningContentType.Lesson,
                TargetId = locked.Id,
                ReleaseMode = ContentReleaseMode.SpecificDate,
                SpecificDateUtc = now.AddDays(1)
            });
            await db.SaveChangesAsync();
            var access = new ContentAccessService(db);
            var service = new StudentCoursePlayerService(db, access);
            return new PlayerFixture(db, service, access, course, enrollment, first, second, locked, fourth);
        }

        private static Lesson Lesson(
            CourseModule module,
            string title,
            int sortOrder,
            LessonType type,
            int duration,
            bool withVideo = false,
            bool withResource = false)
        {
            var lesson = new Lesson
            {
                CourseModule = module,
                CourseModuleId = module.Id,
                ArabicTitle = $"عربي {title}",
                EnglishTitle = title,
                ArabicBody = $"محتوى {title}",
                EnglishBody = $"Body {title}",
                Type = type,
                DurationSeconds = duration,
                IsPublished = true,
                SortOrder = sortOrder
            };
            module.Lessons.Add(lesson);
            if (withVideo || withResource)
            {
                var resource = new LessonResource
                {
                    Lesson = lesson,
                    LessonId = lesson.Id,
                    DisplayName = withVideo ? "lesson.mp4" : "private.pdf",
                    StorageKey = "private/storage/key",
                    ContentType = withVideo ? "video/mp4" : "application/pdf",
                    ScanStatus = UploadScanStatus.Clean
                };
                lesson.Resources.Add(resource);
                if (withVideo) lesson.VideoReference = resource.Id.ToString();
            }
            return lesson;
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
