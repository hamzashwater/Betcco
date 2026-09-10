using Betcco.Application.Quizzes;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class QuestionBankServiceTests
{
    [Fact]
    public async Task Bank_question_keeps_server_validated_subject_unit_and_learning_aim_context()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var subject = new Subject { Slug = "programming", ArabicName = "البرمجة", EnglishName = "Programming" };
        var course = new Course
        {
            Slug = "context-question-bank-course",
            ArabicTitle = "دورة السياق",
            EnglishTitle = "Context course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            Subject = subject,
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Draft
        };
        var unit = new CourseModule { Course = course, ArabicTitle = "الوحدة الأولى", EnglishTitle = "Unit one" };
        var aim = new BtecLearningAim
        {
            CourseModule = unit,
            Code = "A",
            ArabicTitle = "الهدف أ",
            EnglishTitle = "Aim A"
        };
        db.AddRange(subject, course, unit, aim);
        await db.SaveChangesAsync();
        var service = new QuestionBankService(db);

        var questionId = await service.CreateAsync("teacher-1", new SaveQuestionBankQuestionCommand(
            course.Id, "SingleChoice", "سؤال", "Question", ["A", "B"], ["A"], null, "foundation", 2,
            unit.Id, aim.Id));

        Assert.NotNull(questionId);
        var question = Assert.Single((await service.ListAsync("teacher-1", course.Id))!);
        Assert.Equal(subject.Id, question.SubjectId);
        Assert.Equal(unit.Id, question.CourseModuleId);
        Assert.Equal(aim.Id, question.BtecLearningAimId);

        var generatedQuizId = await service.GenerateRandomQuizAsync("teacher-1", new GenerateRandomQuizCommand(
            course.Id, null, "اختبار عشوائي", "Random quiz", 1, 50m,
            Tag: "foundation", Difficulty: 2, CourseModuleId: unit.Id, BtecLearningAimId: aim.Id, Type: "SingleChoice"));
        Assert.NotNull(generatedQuizId);
        Assert.Equal("SingleChoice", (await db.QuizQuestions.SingleAsync(item => item.QuizId == generatedQuizId)).Type.ToString());

        var invalid = await service.CreateAsync("teacher-1", new SaveQuestionBankQuestionCommand(
            course.Id, "SingleChoice", "سؤال", "Question", ["A", "B"], ["A"], null, "foundation", 2,
            Guid.NewGuid(), aim.Id));
        Assert.Null(invalid);
    }

    [Fact]
    public async Task Matching_bank_questions_require_complete_unambiguous_pairs()
    {
        await using var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        var course = new Course
        {
            Slug = "question-bank-course",
            ArabicTitle = "بنك الأسئلة",
            EnglishTitle = "Question bank",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrackId = Guid.NewGuid(),
            TeacherUserId = "teacher-1",
            Status = CourseStatus.Draft
        };
        db.Courses.Add(course);
        await db.SaveChangesAsync();
        var service = new QuestionBankService(db);

        var invalid = await service.CreateAsync("teacher-1", new SaveQuestionBankQuestionCommand(
            course.Id, "Matching", "طابق", "Match", ["A", "B"], ["A => 1", "B => 1"], null, "unit-1", 2));
        Assert.Null(invalid);

        var created = await service.CreateAsync("teacher-1", new SaveQuestionBankQuestionCommand(
            course.Id, "Matching", "طابق", "Match", ["A", "B"], [" A => 1 ", "B=>2"], null, "unit-1", 2));
        Assert.NotNull(created);
        var question = Assert.Single((await service.ListAsync("teacher-1", course.Id))!);
        Assert.Equal(["A => 1", "B => 2"], question.CorrectAnswers);
    }
}
