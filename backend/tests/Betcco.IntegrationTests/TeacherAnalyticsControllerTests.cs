using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class TeacherAnalyticsControllerTests
{
    [Fact]
    public async Task Default_contract_remains_teacher_protected_and_limited_to_eight_attention_students()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();
        var authorization = Assert.IsType<AuthorizeAttribute>(Assert.Single(typeof(TeacherAnalyticsController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)));
        Assert.Equal("Teacher", authorization.Policy);

        var unauthorized = new TeacherAnalyticsController(fixture.Db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        Assert.IsType<UnauthorizedResult>(await unauthorized.Get(CancellationToken.None));

        var json = await GetJsonAsync(fixture.Controller);
        Assert.Equal(9, json.GetProperty("studentsAtRiskCount").GetInt32());
        Assert.Equal(8, json.GetProperty("studentsAtRisk").GetArrayLength());
        Assert.False(json.TryGetProperty("filteredStudentsAtRiskCount", out _));
    }

    [Fact]
    public async Task Follow_up_results_are_bounded_paged_counted_and_isolated_to_the_teacher()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, page: 2, pageSize: 3);

        Assert.Equal(9, json.GetProperty("studentsAtRiskCount").GetInt32());
        Assert.Equal(9, json.GetProperty("filteredStudentsAtRiskCount").GetInt32());
        Assert.Equal(2, json.GetProperty("page").GetInt32());
        Assert.Equal(3, json.GetProperty("pageSize").GetInt32());
        Assert.Equal(3, json.GetProperty("studentsAtRisk").GetArrayLength());
        Assert.DoesNotContain("Foreign student", json.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(0, 25)]
    [InlineData(1, 0)]
    [InlineData(1, 101)]
    public async Task Invalid_paging_is_rejected(int page, int pageSize)
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var result = await fixture.Controller.Get(CancellationToken.None, followUp: true, page: page, pageSize: pageSize);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task A_large_valid_page_returns_an_empty_bounded_page_without_overflow()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, page: int.MaxValue, pageSize: 100);

        Assert.Equal(0, json.GetProperty("studentsAtRisk").GetArrayLength());
        Assert.Equal(9, json.GetProperty("filteredStudentsAtRiskCount").GetInt32());
    }

    [Theory]
    [InlineData("Unknown", null, "priority")]
    [InlineData(null, "UnknownReason", "priority")]
    [InlineData(null, null, "unknownSort")]
    public async Task Invalid_filters_and_sort_are_rejected(string? attention, string? reason, string sort)
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var result = await fixture.Controller.Get(
            CancellationToken.None,
            followUp: true,
            attention: attention,
            reason: reason,
            sort: sort);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task An_excessive_search_value_is_rejected()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var result = await fixture.Controller.Get(
            CancellationToken.None,
            followUp: true,
            search: new string('a', 201));

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Theory]
    [InlineData("High", 1)]
    [InlineData("Medium", 8)]
    public async Task Attention_filter_uses_the_existing_server_classification(string attention, int expectedCount)
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, attention: attention);

        Assert.Equal(expectedCount, json.GetProperty("filteredStudentsAtRiskCount").GetInt32());
        Assert.All(json.GetProperty("studentsAtRisk").EnumerateArray(), student =>
            Assert.Equal(attention, student.GetProperty("riskLevel").GetString()));
    }

    [Theory]
    [InlineData("LowProgress")]
    [InlineData("MissedAssignments")]
    [InlineData("Inactive14Days")]
    public async Task Reason_filter_matches_only_existing_server_reasons(string reason)
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, reason: reason);

        Assert.True(json.GetProperty("filteredStudentsAtRiskCount").GetInt32() > 0);
        Assert.All(json.GetProperty("studentsAtRisk").EnumerateArray(), student =>
            Assert.Contains(reason, student.GetProperty("reasons").EnumerateArray().Select(item => item.GetString())));
    }

    [Fact]
    public async Task Name_search_is_applied_before_pagination_across_the_complete_result_set()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, pageSize: 1, search: "celine");

        Assert.Equal(1, json.GetProperty("filteredStudentsAtRiskCount").GetInt32());
        Assert.Equal("Celine assignments", json.GetProperty("studentsAtRisk")[0].GetProperty("studentName").GetString());
    }

    [Theory]
    [InlineData("priority", "Alice high")]
    [InlineData("progress", "Basma progress")]
    [InlineData("missedAssignments", "Celine assignments")]
    [InlineData("lastActivity", "Evan inactive")]
    public async Task Sorting_is_deterministic_and_keeps_missing_values_distinct(string sort, string expectedFirst)
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, sort: sort);
        var students = json.GetProperty("studentsAtRisk").EnumerateArray().ToArray();

        Assert.Equal(expectedFirst, students[0].GetProperty("studentName").GetString());
        if (sort == "lastActivity")
            Assert.Equal(JsonValueKind.Null, students[^1].GetProperty("lastActiveAtUtc").ValueKind);
    }

    [Fact]
    public async Task Retrieval_filters_do_not_change_server_risk_level_or_reasons()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, search: "Alice", attention: "High");
        var student = json.GetProperty("studentsAtRisk")[0];

        Assert.Equal("High", student.GetProperty("riskLevel").GetString());
        Assert.Equal(
            ["LowProgress", "MissedAssignments", "Inactive14Days"],
            student.GetProperty("reasons").EnumerateArray().Select(item => item.GetString()!).ToArray());
    }

    [Fact]
    public async Task Active_student_extension_does_not_count_as_a_missed_assignment_in_teacher_follow_up()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();
        var assignment = await fixture.Db.CourseAssignments.OrderBy(item => item.EnglishTitle).FirstAsync();
        var student = await fixture.Db.Users.SingleAsync(item => item.DisplayName == "Alice high");
        fixture.Db.CourseAssignmentDeadlineExtensions.Add(new CourseAssignmentDeadlineExtension
        {
            CourseAssignmentId = assignment.Id,
            StudentUserId = student.Id.ToString(),
            BaseDueAtUtcSnapshot = assignment.DueAtUtc!.Value,
            ExtendedDueAtUtc = DateTimeOffset.UtcNow.AddDays(1),
            GrantedByUserId = "teacher-1",
            GrantedAtUtc = DateTimeOffset.UtcNow,
            Reason = "Operational adjustment"
        });
        await fixture.Db.SaveChangesAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, search: "Alice");
        var row = json.GetProperty("studentsAtRisk")[0];
        Assert.Equal(0, row.GetProperty("missedAssignments").GetInt32());
        Assert.DoesNotContain(row.GetProperty("reasons").EnumerateArray(), reason => reason.GetString() == "MissedAssignments");
    }

    [Fact]
    public async Task Formative_nya_signals_are_filterable_and_include_attempt_context()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();
        var course = await fixture.Db.Courses.SingleAsync(item => item.TeacherUserId == "teacher-1");
        var unit = await fixture.Db.CourseModules.SingleAsync(item => item.CourseId == course.Id);
        var student = await fixture.Db.Users.SingleAsync(item => item.DisplayName == "Basma progress");
        var aim = new BtecLearningAim
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            Code = "A",
            ArabicTitle = "الهدف أ",
            EnglishTitle = "Aim A",
            PublicationStatus = ContentPublicationStatus.Published
        };
        var practice = new CourseAssignment
        {
            Course = course,
            CourseId = course.Id,
            CourseModule = unit,
            CourseModuleId = unit.Id,
            BtecLearningAim = aim,
            BtecLearningAimId = aim.Id,
            Purpose = CourseAssignmentPurpose.LearningAimPractice,
            ArabicTitle = "تدريب أ",
            EnglishTitle = "Aim A practice",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            MaxSubmissionAttempts = 3,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        var submission = new CourseAssignmentSubmission
        {
            CourseAssignment = practice,
            CourseAssignmentId = practice.Id,
            StudentUserId = student.Id.ToString(),
            Status = CourseAssignmentSubmissionStatus.Finalized,
            CurrentVersionNumber = 2,
            TrainingOutcome = TrainingOutcome.NotYetAchieved
        };
        submission.Versions.Add(new CourseAssignmentSubmissionVersion
        {
            CourseAssignmentSubmission = submission,
            CourseAssignmentSubmissionId = submission.Id,
            VersionNumber = 1,
            TrainingOutcome = TrainingOutcome.NotYetAchieved,
            ReviewedAtUtc = DateTimeOffset.UtcNow.AddDays(-2)
        });
        submission.Versions.Add(new CourseAssignmentSubmissionVersion
        {
            CourseAssignmentSubmission = submission,
            CourseAssignmentSubmissionId = submission.Id,
            VersionNumber = 2,
            TrainingOutcome = TrainingOutcome.NotYetAchieved,
            ReviewedAtUtc = DateTimeOffset.UtcNow.AddDays(-1)
        });
        var foreignCourse = await fixture.Db.Courses.SingleAsync(item => item.TeacherUserId == "teacher-2");
        var foreignUnit = await fixture.Db.CourseModules.SingleAsync(item => item.CourseId == foreignCourse.Id);
        var foreignStudent = await fixture.Db.Users.SingleAsync(item => item.DisplayName == "Foreign student");
        var foreignAim = new BtecLearningAim
        {
            CourseModule = foreignUnit,
            CourseModuleId = foreignUnit.Id,
            Code = "A",
            ArabicTitle = "هدف خارجي",
            EnglishTitle = "Foreign Aim",
            PublicationStatus = ContentPublicationStatus.Published
        };
        var foreignPractice = new CourseAssignment
        {
            Course = foreignCourse,
            CourseId = foreignCourse.Id,
            CourseModule = foreignUnit,
            CourseModuleId = foreignUnit.Id,
            BtecLearningAim = foreignAim,
            BtecLearningAimId = foreignAim.Id,
            Purpose = CourseAssignmentPurpose.LearningAimPractice,
            ArabicTitle = "تدريب خارجي",
            EnglishTitle = "Foreign practice",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            MaxSubmissionAttempts = 2,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        var foreignSubmission = new CourseAssignmentSubmission
        {
            CourseAssignment = foreignPractice,
            CourseAssignmentId = foreignPractice.Id,
            StudentUserId = foreignStudent.Id.ToString(),
            Status = CourseAssignmentSubmissionStatus.Finalized,
            CurrentVersionNumber = 1,
            TrainingOutcome = TrainingOutcome.NotYetAchieved
        };
        foreignSubmission.Versions.Add(new CourseAssignmentSubmissionVersion
        {
            CourseAssignmentSubmission = foreignSubmission,
            CourseAssignmentSubmissionId = foreignSubmission.Id,
            VersionNumber = 1,
            TrainingOutcome = TrainingOutcome.NotYetAchieved
        });
        fixture.Db.AddRange(aim, practice, submission, foreignAim, foreignPractice, foreignSubmission);
        await fixture.Db.SaveChangesAsync();

        var json = await GetJsonAsync(fixture.Controller, followUp: true, reason: "OneAttemptRemaining");
        var row = Assert.Single(json.GetProperty("studentsAtRisk").EnumerateArray());

        Assert.Equal("Basma progress", row.GetProperty("studentName").GetString());
        var reasons = row.GetProperty("reasons").EnumerateArray().Select(item => item.GetString()).ToArray();
        Assert.Contains("NotYetAchieved", reasons);
        Assert.Contains("RepeatedNotYetAchieved", reasons);
        Assert.Contains("OneAttemptRemaining", reasons);
        var signal = Assert.Single(row.GetProperty("formativeSignals").EnumerateArray());
        Assert.Equal("NotYetAchieved", signal.GetProperty("reason").GetString());
        Assert.Equal("Aim A", signal.GetProperty("learningAimEnglishTitle").GetString());
        Assert.Equal("NotYetAchieved", signal.GetProperty("latestOutcome").GetString());
        Assert.Equal("NotYetAchieved", signal.GetProperty("bestOutcome").GetString());
        Assert.Equal(2, signal.GetProperty("attemptsUsed").GetInt32());
        Assert.Equal(3, signal.GetProperty("maxAttempts").GetInt32());
        Assert.Equal(1, signal.GetProperty("attemptsRemaining").GetInt32());
    }

    [Fact]
    public async Task Completed_aims_surface_final_practice_readiness_then_submitted_final_review()
    {
        await using var fixture = await AnalyticsFixture.CreateAsync();
        var course = await fixture.Db.Courses.SingleAsync(item => item.TeacherUserId == "teacher-1");
        var unit = await fixture.Db.CourseModules.SingleAsync(item => item.CourseId == course.Id);
        var student = await fixture.Db.Users.SingleAsync(item => item.DisplayName == "Dalia active");
        var lessons = await fixture.Db.Lessons.Where(item => item.CourseModuleId == unit.Id).ToArrayAsync();
        var aim = new BtecLearningAim
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            Code = "A",
            ArabicTitle = "الهدف أ",
            EnglishTitle = "Aim A",
            PublicationStatus = ContentPublicationStatus.Published
        };
        foreach (var lesson in lessons)
        {
            lesson.BtecLearningAim = aim;
            lesson.BtecLearningAimId = aim.Id;
        }
        var practice = new CourseAssignment
        {
            Course = course,
            CourseId = course.Id,
            CourseModule = unit,
            CourseModuleId = unit.Id,
            BtecLearningAim = aim,
            BtecLearningAimId = aim.Id,
            Purpose = CourseAssignmentPurpose.LearningAimPractice,
            ArabicTitle = "تدريب أ",
            EnglishTitle = "Aim A practice",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            MaxSubmissionAttempts = 2,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        var practiceSubmission = new CourseAssignmentSubmission
        {
            CourseAssignment = practice,
            CourseAssignmentId = practice.Id,
            StudentUserId = student.Id.ToString(),
            Status = CourseAssignmentSubmissionStatus.Finalized,
            CurrentVersionNumber = 1,
            TrainingOutcome = TrainingOutcome.Merit
        };
        practiceSubmission.Versions.Add(new CourseAssignmentSubmissionVersion
        {
            CourseAssignmentSubmission = practiceSubmission,
            CourseAssignmentSubmissionId = practiceSubmission.Id,
            VersionNumber = 1,
            TrainingOutcome = TrainingOutcome.Merit,
            ReviewedAtUtc = DateTimeOffset.UtcNow.AddHours(-2)
        });
        var finalPractice = new CourseAssignment
        {
            Course = course,
            CourseId = course.Id,
            CourseModule = unit,
            CourseModuleId = unit.Id,
            Purpose = CourseAssignmentPurpose.ComprehensivePractice,
            ArabicTitle = "التدريب النهائي",
            EnglishTitle = "Final Unit Practice",
            ArabicInstructions = "تعليمات",
            EnglishInstructions = "Instructions",
            MaxSubmissionAttempts = 1,
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        fixture.Db.AddRange(aim, practice, practiceSubmission, finalPractice);
        await fixture.Db.SaveChangesAsync();

        var readyJson = await GetJsonAsync(fixture.Controller, followUp: true, reason: "ReadyForFinalPractice");
        var readyRow = Assert.Single(readyJson.GetProperty("studentsAtRisk").EnumerateArray());
        Assert.Equal("Dalia active", readyRow.GetProperty("studentName").GetString());
        Assert.Equal(
            "ReadyForFinalPractice",
            Assert.Single(readyRow.GetProperty("formativeSignals").EnumerateArray()).GetProperty("reason").GetString());

        var finalSubmission = new CourseAssignmentSubmission
        {
            CourseAssignment = finalPractice,
            CourseAssignmentId = finalPractice.Id,
            StudentUserId = student.Id.ToString(),
            Status = CourseAssignmentSubmissionStatus.Submitted,
            CurrentVersionNumber = 1,
            SubmittedAtUtc = DateTimeOffset.UtcNow
        };
        fixture.Db.Add(finalSubmission);
        await fixture.Db.SaveChangesAsync();

        var submittedJson = await GetJsonAsync(fixture.Controller, followUp: true, reason: "AwaitingFinalReview");
        var submittedRow = Assert.Single(submittedJson.GetProperty("studentsAtRisk").EnumerateArray());
        Assert.Equal("Dalia active", submittedRow.GetProperty("studentName").GetString());
        Assert.Equal(
            "AwaitingFinalReview",
            Assert.Single(submittedRow.GetProperty("formativeSignals").EnumerateArray()).GetProperty("reason").GetString());
    }

    private static async Task<JsonElement> GetJsonAsync(
        TeacherAnalyticsController controller,
        bool followUp = false,
        int page = 1,
        int pageSize = 25,
        string? search = null,
        string? attention = null,
        string? reason = null,
        string sort = "priority")
    {
        var result = Assert.IsType<OkObjectResult>(await controller.Get(
            CancellationToken.None,
            followUp,
            page,
            pageSize,
            search,
            attention,
            reason,
            sort));
        return JsonSerializer.SerializeToElement(result.Value);
    }

    private sealed class AnalyticsFixture : IAsyncDisposable
    {
        private AnalyticsFixture(BetccoDbContext db)
        {
            Db = db;
            Controller = new TeacherAnalyticsController(db)
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        User = new ClaimsPrincipal(new ClaimsIdentity(
                            [new Claim(ClaimTypes.NameIdentifier, "teacher-1")],
                            "test"))
                    }
                }
            };
        }

        public BetccoDbContext Db { get; }
        public TeacherAnalyticsController Controller { get; }

        public static async Task<AnalyticsFixture> CreateAsync()
        {
            var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);
            var course = Course("teacher-risk-course", "teacher-1");
            var unit = new CourseModule
            {
                Course = course,
                CourseId = course.Id,
                ArabicTitle = "وحدة",
                EnglishTitle = "Unit",
                IsPublished = true
            };
            var lessons = Enumerable.Range(1, 3).Select(index => new Lesson
            {
                CourseModule = unit,
                CourseModuleId = unit.Id,
                ArabicTitle = $"درس {index}",
                EnglishTitle = $"Lesson {index}",
                Type = LessonType.Text,
                IsPublished = true
            }).ToArray();
            var assignments = Enumerable.Range(1, 3).Select(index => new CourseAssignment
            {
                Course = course,
                CourseId = course.Id,
                ArabicTitle = $"مهمة {index}",
                EnglishTitle = $"Assignment {index}",
                ArabicInstructions = "تعليمات",
                EnglishInstructions = "Instructions",
                DueAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
                IsPublished = true
            }).ToArray();
            var students = new[]
            {
                User("Alice high"),
                User("Basma progress"),
                User("Celine assignments"),
                User("Dalia active"),
                User("Evan inactive")
            }.Concat(Enumerable.Range(1, 5).Select(index => User($"Extra {index:00}"))).ToArray();
            var ids = students.ToDictionary(student => student.DisplayName, student => student.Id.ToString());

            db.AddRange(course, unit);
            db.AddRange(lessons);
            db.AddRange(assignments);
            db.AddRange(students);
            db.AddRange(students.Select(student => new Enrollment
            {
                Course = course,
                CourseId = course.Id,
                StudentUserId = student.Id.ToString()
            }));

            db.Add(new LessonProgress { StudentUserId = ids["Alice high"], LessonId = lessons[0].Id, IsCompleted = true });
            foreach (var name in new[] { "Celine assignments", "Dalia active", "Evan inactive" })
                foreach (var lesson in lessons)
                    db.Add(new LessonProgress { StudentUserId = ids[name], LessonId = lesson.Id, IsCompleted = true });
            foreach (var name in new[] { "Basma progress", "Dalia active", "Evan inactive" }.Concat(Enumerable.Range(1, 5).Select(index => $"Extra {index:00}")))
                foreach (var assignment in assignments)
                    db.Add(new CourseAssignmentSubmission
                    {
                        CourseAssignment = assignment,
                        CourseAssignmentId = assignment.Id,
                        StudentUserId = ids[name],
                        Status = CourseAssignmentSubmissionStatus.Submitted,
                        SubmittedAtUtc = DateTimeOffset.UtcNow.AddDays(-1)
                    });
            foreach (var assignment in assignments.Skip(1))
                db.Add(new CourseAssignmentSubmission
                {
                    CourseAssignment = assignment,
                    CourseAssignmentId = assignment.Id,
                    StudentUserId = ids["Alice high"],
                    Status = CourseAssignmentSubmissionStatus.Submitted,
                    SubmittedAtUtc = DateTimeOffset.UtcNow.AddDays(-1)
                });
            db.AddRange(
                new UserSession { UserId = ids["Alice high"], DeviceName = "Test", BrowserName = "Test", LastActiveAtUtc = DateTimeOffset.UtcNow.AddDays(-30) },
                new UserSession { UserId = ids["Evan inactive"], DeviceName = "Test", BrowserName = "Test", LastActiveAtUtc = DateTimeOffset.UtcNow.AddDays(-40) });

            var foreignCourse = Course("foreign-risk-course", "teacher-2");
            var foreignUnit = new CourseModule
            {
                Course = foreignCourse,
                CourseId = foreignCourse.Id,
                ArabicTitle = "وحدة أخرى",
                EnglishTitle = "Other unit",
                IsPublished = true
            };
            var foreignLesson = new Lesson
            {
                CourseModule = foreignUnit,
                CourseModuleId = foreignUnit.Id,
                ArabicTitle = "درس آخر",
                EnglishTitle = "Other lesson",
                Type = LessonType.Text,
                IsPublished = true
            };
            var foreignStudent = User("Foreign student");
            db.AddRange(
                foreignCourse,
                foreignUnit,
                foreignLesson,
                foreignStudent,
                new Enrollment { Course = foreignCourse, CourseId = foreignCourse.Id, StudentUserId = foreignStudent.Id.ToString() });
            await db.SaveChangesAsync();
            return new AnalyticsFixture(db);
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();

        private static ApplicationUser User(string displayName)
        {
            var id = Guid.NewGuid();
            return new ApplicationUser
            {
                Id = id,
                UserName = $"{id:N}@betcco.test",
                Email = $"{id:N}@betcco.test",
                DisplayName = displayName
            };
        }

        private static Course Course(string slug, string teacherUserId) => new()
        {
            Slug = slug,
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = teacherUserId,
            IsFree = true,
            Status = CourseStatus.Published
        };
    }
}
