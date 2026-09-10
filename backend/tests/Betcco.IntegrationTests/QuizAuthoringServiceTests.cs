using Betcco.Application.Quizzes;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class QuizAuthoringServiceTests
{
    [Fact]
    public async Task Teacher_can_publish_a_valid_quiz_but_cannot_edit_it_after_student_attempts()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "academic", ArabicName = "أكاديمي", EnglishName = "Academic" };
        var course = new Course
        {
            Slug = "quiz-course",
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
        var unit = new CourseModule { Course = course, CourseId = course.Id, ArabicTitle = "وحدة", EnglishTitle = "Unit", SortOrder = 1, IsPublished = true };
        var lesson = new Lesson
        {
            CourseModule = unit,
            CourseModuleId = unit.Id,
            ArabicTitle = "اختبار",
            EnglishTitle = "Quiz",
            ArabicBody = "",
            EnglishBody = "",
            Type = LessonType.Quiz,
            SortOrder = 1,
            IsPublished = true
        };
        db.AddRange(track, course, unit, lesson);
        await db.SaveChangesAsync();

        var service = new QuizAuthoringService(db);
        var quizId = await service.CreateAsync("teacher-1", new CreateQuizCommand(course.Id, lesson.Id, "اختبار الوحدة", "Unit quiz", 70m, 2));
        Assert.NotNull(quizId);
        Assert.Null(await service.CreateAsync("teacher-2", new CreateQuizCommand(course.Id, lesson.Id, "غير مسموح", "Denied", 70m, 2)));
        Assert.True(await service.SetPublicationStatusAsync("teacher-1", quizId!.Value, "Scheduled", DateTimeOffset.UtcNow.AddHours(2)));
        var scheduled = await db.Quizzes.SingleAsync(item => item.Id == quizId.Value);
        Assert.Equal(ContentPublicationStatus.Scheduled, scheduled.PublicationStatus);
        Assert.False(scheduled.IsPublished);
        Assert.True(await service.SetPublicationStatusAsync("teacher-1", quizId.Value, "Draft", null));
        Assert.Null(await service.AddQuestionAsync("teacher-1", new CreateQuizQuestionCommand(quizId!.Value, "SingleChoice", "سؤال", "Question", ["A", "B"], ["C"], 1)));

        var questionId = await service.AddQuestionAsync("teacher-1", new CreateQuizQuestionCommand(quizId.Value, "SingleChoice", "ما الإجابة؟", "Which answer?", ["A", "B"], ["B"], 1));
        Assert.NotNull(questionId);
        Assert.True(await service.PublishAsync("teacher-1", quizId.Value, true));

        var storedQuestion = await db.QuizQuestions.SingleAsync(question => question.Id == questionId!.Value);
        Assert.Equal(QuizQuestionType.SingleChoice, storedQuestion.Type);
        Assert.True(await service.PublishAsync("teacher-1", quizId.Value, false));
        db.QuizAttempts.Add(new QuizAttempt { StudentUserId = "student-1", QuizId = quizId.Value, ScorePercent = 100m, Passed = true });
        await db.SaveChangesAsync();
        Assert.False(await service.PublishAsync("teacher-1", quizId.Value, false));
        Assert.False(await service.DeleteQuestionAsync("teacher-1", questionId.Value));
    }

    [Fact]
    public async Task Teacher_can_create_valid_ordering_and_matching_questions()
    {
        await using var db = CreateDb();
        var track = new LearningTrack { Slug = "quiz-types", ArabicName = "أكاديمي", EnglishName = "Academic" };
        var course = new Course
        {
            Slug = "quiz-types-course",
            ArabicTitle = "دورة أنواع الاختبارات",
            EnglishTitle = "Quiz types course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            LearningTrackId = track.Id,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Published,
            IsFree = true
        };
        db.AddRange(track, course);
        await db.SaveChangesAsync();
        var service = new QuizAuthoringService(db);
        var quizId = await service.CreateAsync("teacher-1", new CreateQuizCommand(course.Id, null, "أنواع", "Types", 50m, null));
        Assert.NotNull(quizId);

        Assert.NotNull(await service.AddQuestionAsync("teacher-1", new CreateQuizQuestionCommand(
            quizId!.Value, "Ordering", "رتّب", "Order", ["ثالث", "أول", "ثان"], ["أول", "ثان", "ثالث"], 1)));
        Assert.NotNull(await service.AddQuestionAsync("teacher-1", new CreateQuizQuestionCommand(
            quizId.Value, "Matching", "طابق", "Match", ["CPU", "RAM"], ["CPU => المعالج", "RAM => ذاكرة مؤقتة"], 2)));
        Assert.Null(await service.AddQuestionAsync("teacher-1", new CreateQuizQuestionCommand(
            quizId.Value, "Matching", "غير صالح", "Invalid", ["CPU", "RAM"], ["CPU => المعالج", "CPU => ذاكرة"], 3)));
    }

    private static BetccoDbContext CreateDb() => new(
        new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
}
