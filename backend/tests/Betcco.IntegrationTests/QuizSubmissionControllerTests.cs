using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Application.Learning;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class QuizSubmissionControllerTests
{
    [Fact]
    public async Task Matching_and_ordering_are_scored_by_the_server()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var track = new LearningTrack { Slug = "quiz-submission", ArabicName = "أكاديمي", EnglishName = "Academic" };
        var course = new Course
        {
            Slug = "quiz-submission-course",
            ArabicTitle = "دورة الاختبار",
            EnglishTitle = "Quiz course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            LearningTrackId = track.Id,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Published,
            IsFree = true
        };
        var quiz = new Quiz
        {
            CourseId = course.Id,
            ArabicTitle = "اختبار",
            EnglishTitle = "Quiz",
            IsPublished = true,
            PublicationStatus = ContentPublicationStatus.Published
        };
        var ordering = new QuizQuestion
        {
            Quiz = quiz,
            QuizId = quiz.Id,
            Type = QuizQuestionType.Ordering,
            ArabicText = "رتب المراحل",
            EnglishText = "Order the stages",
            OptionsJson = "[\"Third\",\"First\",\"Second\"]",
            CorrectAnswersJson = "[\"First\",\"Second\",\"Third\"]",
            SortOrder = 1
        };
        var matching = new QuizQuestion
        {
            Quiz = quiz,
            QuizId = quiz.Id,
            Type = QuizQuestionType.Matching,
            ArabicText = "طابق المصطلحات",
            EnglishText = "Match the terms",
            OptionsJson = "[\"CPU\",\"RAM\"]",
            CorrectAnswersJson = "[\"CPU => Processor\",\"RAM => Temporary memory\"]",
            SortOrder = 2
        };
        var activeAttempt = new QuizAttempt { StudentUserId = "student-1", QuizId = quiz.Id, StartedAtUtc = DateTimeOffset.UtcNow };
        db.AddRange(track, course, quiz, ordering, matching, activeAttempt, new Enrollment { StudentUserId = "student-1", Course = course, CourseId = course.Id });
        await db.SaveChangesAsync();

        var controller = new QuizzesController(db, new NullFileStorage(), new AllowAllContentAccess())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "student-1")], "test"))
                }
            }
        };
        var response = await controller.Submit(quiz.Id, new SubmitQuizRequest(activeAttempt.Id, new Dictionary<Guid, string[]>
        {
            [ordering.Id] = ["First", "Second", "Third"],
            [matching.Id] = ["CPU => Processor", "RAM => Temporary memory"]
        }), CancellationToken.None);

        Assert.IsType<OkObjectResult>(response);
        var attempt = await db.QuizAttempts.SingleAsync();
        Assert.Equal(100m, attempt.ScorePercent);
        Assert.True(attempt.Passed);

        course.Status = CourseStatus.Archived;
        await db.SaveChangesAsync();
        Assert.IsType<NotFoundResult>(await controller.List(course.Id, "ar", CancellationToken.None));
    }

    [Fact]
    public async Task Essay_and_code_answers_are_held_for_teacher_grading_before_a_final_score_is_released()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var track = new LearningTrack { Slug = "manual-quiz", ArabicName = "مسار", EnglishName = "Track" };
        var course = new Course
        {
            Slug = "manual-quiz-course",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            LearningTrackId = track.Id,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Published,
            IsFree = true
        };
        var quiz = new Quiz { CourseId = course.Id, ArabicTitle = "اختبار", EnglishTitle = "Quiz", PassMark = 70, IsPublished = true, PublicationStatus = ContentPublicationStatus.Published };
        var automatic = new QuizQuestion { Quiz = quiz, QuizId = quiz.Id, Type = QuizQuestionType.SingleChoice, ArabicText = "س", EnglishText = "Q", OptionsJson = "[\"A\",\"B\"]", CorrectAnswersJson = "[\"A\"]", SortOrder = 1 };
        var essay = new QuizQuestion { Quiz = quiz, QuizId = quiz.Id, Type = QuizQuestionType.Essay, ArabicText = "مقال", EnglishText = "Essay", OptionsJson = "[]", CorrectAnswersJson = "[]", SortOrder = 2 };
        var code = new QuizQuestion { Quiz = quiz, QuizId = quiz.Id, Type = QuizQuestionType.CodeQuestion, ArabicText = "كود", EnglishText = "Code", OptionsJson = "[]", CorrectAnswersJson = "[]", SortOrder = 3 };
        var attempt = new QuizAttempt { StudentUserId = "student-1", QuizId = quiz.Id, StartedAtUtc = DateTimeOffset.UtcNow };
        db.AddRange(track, course, quiz, automatic, essay, code, attempt, new Enrollment { StudentUserId = "student-1", Course = course, CourseId = course.Id });
        await db.SaveChangesAsync();

        var studentController = new QuizzesController(db, new NullFileStorage(), new AllowAllContentAccess())
        {
            ControllerContext = new ControllerContext { HttpContext = HttpContextFor("student-1") }
        };
        Assert.IsType<OkObjectResult>(await studentController.Submit(quiz.Id, new SubmitQuizRequest(attempt.Id, new Dictionary<Guid, string[]>
        {
            [automatic.Id] = ["A"],
            [essay.Id] = ["A concise explanation"],
            [code.Id] = ["for i in range(10): print(i)"]
        }), CancellationToken.None));
        var submitted = await db.QuizAttempts.SingleAsync();
        Assert.True(submitted.RequiresManualReview);
        Assert.False(submitted.Passed);
        Assert.Equal(33.33m, submitted.ScorePercent);

        var teacherController = new TeacherQuizzesController(new Betcco.Infrastructure.Services.QuizAuthoringService(db), db)
        {
            ControllerContext = new ControllerContext { HttpContext = HttpContextFor("teacher-1") }
        };
        var graded = await teacherController.GradeManualAttempt(attempt.Id, new ManualQuizGradeRequest([
            new ManualQuizQuestionGrade(essay.Id, 100, "Strong explanation"),
            new ManualQuizQuestionGrade(code.Id, 60, "Works; add a clearer variable name.")
        ]), CancellationToken.None);

        Assert.IsType<OkObjectResult>(graded);
        var finalized = await db.QuizAttempts.SingleAsync();
        Assert.False(finalized.RequiresManualReview);
        Assert.True(finalized.Passed);
        Assert.Equal(86.67m, finalized.ScorePercent);
        Assert.Equal(2, await db.QuizAttemptQuestionGrades.CountAsync());
        Assert.Single(await db.Notifications.ToListAsync());

        var latestResult = await studentController.List(course.Id, "en", CancellationToken.None);
        var latestJson = JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(latestResult).Value);
        Assert.Contains("\"RequiresManualReview\":false", latestJson);
        Assert.Contains("Strong explanation", latestJson);
    }

    private static DefaultHttpContext HttpContextFor(string userId) => new()
    {
        User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId)], "test"))
    };

    private sealed class NullFileStorage : IFileStorage
    {
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => Task.FromResult("unused");
    }

    private sealed class AllowAllContentAccess : IContentAccessService
    {
        public Task<ContentAccessDecision> CanAccessAsync(string studentUserId, Guid courseId, LearningContentType contentType, Guid contentId, CancellationToken cancellationToken = default) => Task.FromResult(new ContentAccessDecision(true));
        public Task<ContentAccessDecision> CanAccessCourseAsync(string studentUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult(new ContentAccessDecision(true));
        public Task<IReadOnlyCollection<ContentReleaseConfiguration>> GetRulesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyCollection<ContentReleaseConfiguration>>([]);
        public Task<IReadOnlyCollection<ContentPrerequisiteConfiguration>> GetPrerequisitesAsync(string teacherUserId, Guid courseId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyCollection<ContentPrerequisiteConfiguration>>([]);
        public Task<bool> SetReleaseRuleAsync(string teacherUserId, ContentReleaseConfiguration configuration, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<Guid?> AddPrerequisiteAsync(string teacherUserId, ContentPrerequisiteConfiguration configuration, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(Guid.NewGuid());
        public Task<bool> RemovePrerequisiteAsync(string teacherUserId, Guid courseId, Guid prerequisiteId, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }
}
