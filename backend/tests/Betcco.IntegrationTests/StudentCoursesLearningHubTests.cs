using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Learning;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class StudentCoursesLearningHubTests
{
    [Fact]
    public void Endpoint_requires_the_student_policy()
    {
        var attribute = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(LearningController)
            .GetMethod(nameof(LearningController.MyCourses))!
            .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)));

        Assert.Equal("Student", attribute.Policy);
    }

    [Fact]
    public async Task Visible_courses_are_owned_active_published_and_access_is_server_owned()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(pageSize: 20);

        Assert.Equal(5, result.TotalCount);
        Assert.DoesNotContain(result.Items, item => item.LocalizedTitle is "Other student" or "Expired" or "Unpublished");
        var locked = Assert.Single(result.Items, item => item.LocalizedTitle == "Locked course");
        Assert.False(locked.AccessAvailable);
        Assert.Equal("AvailableOnDate", locked.AccessReason);
        Assert.NotNull(locked.AccessAvailableAtUtc);
    }

    [Fact]
    public async Task Published_counts_progress_state_cover_and_teacher_are_returned_without_storage_keys()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(search: "progress");
        var course = Assert.Single(result.Items);

        Assert.Equal(1, course.PublishedModuleCount);
        Assert.Equal(3, course.TotalLessons);
        Assert.Equal(1, course.CompletedLessons);
        Assert.Equal(33.33m, course.ProgressPercent);
        Assert.Equal("InProgress", course.ProgressState);
        Assert.True(course.HasCover);
        Assert.Equal("Teacher One", course.TeacherName);
        Assert.DoesNotContain("secret/storage", JsonSerializer.Serialize(result), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("NotStarted", "Not started")]
    [InlineData("InProgress", "Progress course")]
    [InlineData("Completed", "Completed course")]
    public async Task Progress_filter_uses_server_computed_state_before_pagination(string filter, string expectedTitle)
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(pageSize: 1, search: expectedTitle, progress: filter);

        Assert.Equal(1, result.TotalCount);
        Assert.Equal(expectedTitle, Assert.Single(result.Items).LocalizedTitle);
        Assert.Equal(filter, result.Items[0].ProgressState);
    }

    [Theory]
    [InlineData("english title", "English title")]
    [InlineData("عنوان عربي", "English title")]
    [InlineData("  PROGRESS  ", "Progress course")]
    public async Task Search_is_trimmed_case_insensitive_bilingual_and_applied_before_pagination(string search, string expectedTitle)
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(pageSize: 1, search: search);

        Assert.Equal(1, result.TotalCount);
        Assert.Equal(expectedTitle, Assert.Single(result.Items).LocalizedTitle);
    }

    [Fact]
    public async Task Sorting_is_deterministic_and_applied_before_pagination()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var title = await fixture.GetAsync(pageSize: 20, sort: "Title");
        var progress = await fixture.GetAsync(pageSize: 20, sort: "Progress");
        var recent = await fixture.GetAsync(pageSize: 20, sort: "Recent");

        Assert.Equal(title.Items.Select(item => item.LocalizedTitle).Order(StringComparer.Ordinal), title.Items.Select(item => item.LocalizedTitle));
        Assert.Equal("Completed course", progress.Items[0].LocalizedTitle);
        Assert.Equal("Progress course", recent.Items[0].LocalizedTitle);
        Assert.Equal(title.Items.Select(item => item.CourseId).Distinct().Count(), title.Items.Count);
    }

    [Fact]
    public async Task Pagination_and_summary_cover_the_complete_matching_set()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var first = await fixture.GetAsync(page: 1, pageSize: 2);
        var second = await fixture.GetAsync(page: 2, pageSize: 2);

        Assert.Equal(5, first.TotalCount);
        Assert.Equal(2, first.Items.Count);
        Assert.Equal(2, second.Items.Count);
        Assert.Empty(first.Items.Select(item => item.CourseId).Intersect(second.Items.Select(item => item.CourseId)));
        Assert.Equal(5, first.Summary.TotalCourses);
        Assert.Equal(3, first.Summary.NotStarted);
        Assert.Equal(1, first.Summary.InProgress);
        Assert.Equal(1, first.Summary.Completed);
    }

    [Fact]
    public async Task Course_without_published_lessons_is_zero_percent_and_not_started()
    {
        await using var fixture = await HubFixture.CreateAsync();
        var empty = HubFixture.AddCourse(fixture.Db, "empty", "دورة فارغة", "Empty course", null, 0);
        fixture.Db.Enrollments.Add(HubFixture.Enrollment(
            empty.Course,
            HubFixture.StudentId,
            DateTimeOffset.UtcNow));
        await fixture.Db.SaveChangesAsync();

        var result = await fixture.GetAsync(search: "Empty course");
        var course = Assert.Single(result.Items);

        Assert.Equal(0, course.TotalLessons);
        Assert.Equal(0m, course.ProgressPercent);
        Assert.Equal("NotStarted", course.ProgressState);
    }

    [Fact]
    public async Task Arabic_locale_returns_the_arabic_localized_title()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(locale: "ar", search: "English title");

        Assert.Equal("عنوان عربي", Assert.Single(result.Items).LocalizedTitle);
    }

    [Fact]
    public async Task Page_beyond_the_result_set_is_empty_without_changing_totals()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(page: 99, pageSize: 2);

        Assert.Empty(result.Items);
        Assert.Equal(5, result.TotalCount);
        Assert.Equal(5, result.Summary.TotalCourses);
    }

    [Fact]
    public async Task Search_scopes_both_results_and_summary()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(search: "course");

        Assert.Equal(3, result.TotalCount);
        Assert.Equal(3, result.Summary.TotalCourses);
        Assert.Equal(1, result.Summary.Completed);
        Assert.Equal(1, result.Summary.InProgress);
        Assert.Equal(1, result.Summary.NotStarted);
    }

    [Fact]
    public async Task Progress_filter_does_not_distort_the_matching_search_summary()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(progress: "Completed");

        Assert.Single(result.Items);
        Assert.Equal(1, result.TotalCount);
        Assert.Equal(5, result.Summary.TotalCourses);
    }

    [Fact]
    public async Task Recent_sort_uses_progress_then_enrollment_as_the_fallback()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(pageSize: 20, sort: "Recent");

        Assert.Equal(
            ["Progress course", "Completed course", "Locked course", "English title", "Not started"],
            result.Items.Select(item => item.LocalizedTitle));
    }

    [Fact]
    public async Task Another_students_progress_is_not_counted()
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.GetAsync(search: "Progress course");
        var course = Assert.Single(result.Items);

        Assert.Equal(1, course.CompletedLessons);
        Assert.Equal(33.33m, course.ProgressPercent);
    }

    [Theory]
    [InlineData(0, 12, null, "All", "Recent")]
    [InlineData(1, 0, null, "All", "Recent")]
    [InlineData(1, 51, null, "All", "Recent")]
    [InlineData(100001, 12, null, "All", "Recent")]
    [InlineData(1, 12, null, "Unknown", "Recent")]
    [InlineData(1, 12, null, "All", "Unknown")]
    public async Task Invalid_query_values_are_rejected(int page, int pageSize, string? search, string progress, string sort)
    {
        await using var fixture = await HubFixture.CreateAsync();

        var result = await fixture.Controller.MyCourses("en", page, pageSize, search, progress, sort);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Search_length_and_maximum_page_size_are_enforced()
    {
        await using var fixture = await HubFixture.CreateAsync();

        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.MyCourses("en", search: new string('x', 201)));
        var maximum = Assert.IsType<OkObjectResult>(await fixture.Controller.MyCourses("en", pageSize: 50));
        Assert.Equal(50, Assert.IsType<StudentCoursesLearningHubResult>(maximum.Value).PageSize);
    }

    private sealed class HubFixture : IAsyncDisposable
    {
        internal const string StudentId = "student-1";

        private HubFixture(BetccoDbContext db, LearningController controller)
        {
            Db = db;
            Controller = controller;
        }

        public BetccoDbContext Db { get; }
        public LearningController Controller { get; }

        public static async Task<HubFixture> CreateAsync()
        {
            var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);
            var teacher = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = "teacher@betcco.test",
                Email = "teacher@betcco.test",
                DisplayName = "Teacher One"
            };
            db.Users.Add(teacher);

            var completed = AddCourse(db, "completed", "دورة مكتملة", "Completed course", teacher.Id.ToString(), 2);
            var progress = AddCourse(db, "progress", "دورة التقدم", "Progress course", teacher.Id.ToString(), 3, includeUnpublishedModule: true, cover: true);
            var notStarted = AddCourse(db, "not-started", "لم تبدأ", "Not started", null, 1);
            var bilingual = AddCourse(db, "bilingual", "عنوان عربي", "English title", null, 1);
            var locked = AddCourse(db, "locked", "دورة مقفلة", "Locked course", null, 1);
            var expired = AddCourse(db, "expired", "منتهية", "Expired", null, 1);
            var unpublished = AddCourse(db, "unpublished", "غير منشورة", "Unpublished", null, 1, status: CourseStatus.Draft);
            var foreign = AddCourse(db, "foreign", "لطالب آخر", "Other student", null, 1);

            var now = DateTimeOffset.UtcNow;
            db.Enrollments.AddRange(
                Enrollment(completed.Course, StudentId, now.AddDays(-10)),
                Enrollment(progress.Course, StudentId, now.AddDays(-9)),
                Enrollment(notStarted.Course, StudentId, now.AddDays(-8)),
                Enrollment(bilingual.Course, StudentId, now.AddDays(-7)),
                Enrollment(locked.Course, StudentId, now.AddDays(-6)),
                Enrollment(expired.Course, StudentId, now.AddDays(-5), now.AddMinutes(-1)),
                Enrollment(unpublished.Course, StudentId, now.AddDays(-4)),
                Enrollment(foreign.Course, "student-2", now.AddDays(-3)));
            db.LessonProgresses.AddRange(completed.PublishedLessons.Select(lesson => new LessonProgress
            {
                StudentUserId = StudentId,
                LessonId = lesson.Id,
                IsCompleted = true,
                LastVisitedAtUtc = now.AddDays(-2)
            }));
            db.LessonProgresses.Add(new LessonProgress
            {
                StudentUserId = StudentId,
                LessonId = progress.PublishedLessons[0].Id,
                IsCompleted = true,
                LastVisitedAtUtc = now.AddMinutes(-5)
            });
            db.LessonProgresses.Add(new LessonProgress
            {
                StudentUserId = "student-2",
                LessonId = progress.PublishedLessons[1].Id,
                IsCompleted = true,
                LastVisitedAtUtc = now
            });
            db.ContentAccessRules.Add(new ContentAccessRule
            {
                CourseId = locked.Course.Id,
                TargetType = LearningContentType.Course,
                TargetId = locked.Course.Id,
                ReleaseMode = ContentReleaseMode.SpecificDate,
                SpecificDateUtc = now.AddDays(2)
            });
            await db.SaveChangesAsync();

            var access = new ContentAccessService(db);
            var hub = new StudentCoursesLearningHubService(db, access);
            var player = new StudentCoursePlayerService(db, access);
            var controller = new LearningController(db, null!, access, hub, player)
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        User = new ClaimsPrincipal(new ClaimsIdentity(
                            [new Claim(ClaimTypes.NameIdentifier, StudentId)], "Test"))
                    }
                }
            };
            return new HubFixture(db, controller);
        }

        public async Task<StudentCoursesLearningHubResult> GetAsync(
            int page = 1,
            int pageSize = 12,
            string? search = null,
            string progress = "All",
            string sort = "Recent",
            string locale = "en")
        {
            var response = Assert.IsType<OkObjectResult>(await Controller.MyCourses(locale, page, pageSize, search, progress, sort));
            return Assert.IsType<StudentCoursesLearningHubResult>(response.Value);
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();

        internal static Enrollment Enrollment(Course course, string studentId, DateTimeOffset enrolled, DateTimeOffset? ends = null) => new()
        {
            Course = course,
            CourseId = course.Id,
            StudentUserId = studentId,
            EnrolledAtUtc = enrolled,
            AccessEndsAtUtc = ends
        };

        internal static SeededCourse AddCourse(
            BetccoDbContext db,
            string slug,
            string arabicTitle,
            string englishTitle,
            string? teacherUserId,
            int lessonCount,
            bool includeUnpublishedModule = false,
            bool cover = false,
            CourseStatus status = CourseStatus.Published)
        {
            var course = new Course
            {
                Slug = slug,
                ArabicTitle = arabicTitle,
                EnglishTitle = englishTitle,
                ArabicDescription = "وصف",
                EnglishDescription = "Description",
                LearningTrackId = Guid.NewGuid(),
                TeacherUserId = teacherUserId,
                IsFree = true,
                Status = status,
                CoverImageKey = cover ? $"secret/storage/{slug}.jpg" : null,
                CoverImageContentType = cover ? "image/jpeg" : null
            };
            var module = new CourseModule
            {
                Course = course,
                CourseId = course.Id,
                ArabicTitle = "وحدة",
                EnglishTitle = "Module",
                IsPublished = true
            };
            var lessons = Enumerable.Range(1, lessonCount).Select(index => new Lesson
            {
                CourseModule = module,
                CourseModuleId = module.Id,
                ArabicTitle = $"درس {index}",
                EnglishTitle = $"Lesson {index}",
                Type = LessonType.Text,
                IsPublished = true
            }).ToArray();
            db.AddRange(course, module);
            db.AddRange(lessons);
            if (includeUnpublishedModule)
            {
                var draftModule = new CourseModule
                {
                    Course = course,
                    CourseId = course.Id,
                    ArabicTitle = "مسودة",
                    EnglishTitle = "Draft",
                    IsPublished = false
                };
                db.AddRange(draftModule, new Lesson
                {
                    CourseModule = draftModule,
                    CourseModuleId = draftModule.Id,
                    ArabicTitle = "غير منشور",
                    EnglishTitle = "Unpublished",
                    IsPublished = true
                });
            }
            return new SeededCourse(course, lessons);
        }
    }

    internal sealed record SeededCourse(Course Course, Lesson[] PublishedLessons);
}
