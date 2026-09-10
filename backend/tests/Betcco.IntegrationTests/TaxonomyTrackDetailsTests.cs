using Betcco.Api.Controllers;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class TaxonomyTrackDetailsTests
{
    [Fact]
    public async Task Public_track_detail_uses_only_published_learning_content()
    {
        await using var db = CreateDb();
        var track = new LearningTrack
        {
            Slug = "btec",
            ArabicName = "بيتك",
            EnglishName = "BTEC",
            ArabicDescription = "وصف المسار",
            EnglishDescription = "Track description",
            IsBtecFocused = true
        };
        var grade = new Grade { Slug = "grade-12", ArabicName = "التوجيهي", EnglishName = "Grade 12", LearningTrack = track };
        var specialization = new Specialization { Slug = "it", ArabicName = "تكنولوجيا المعلومات", EnglishName = "IT", LearningTrack = track };
        var subject = new Subject { Slug = "programming", ArabicName = "برمجة", EnglishName = "Programming", Specialization = specialization };
        var published = new Course
        {
            Slug = "published-course",
            ArabicTitle = "دورة منشورة",
            EnglishTitle = "Published course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            Status = CourseStatus.Published,
            IsFree = true
        };
        var draft = new Course
        {
            Slug = "draft-course",
            ArabicTitle = "مسودة",
            EnglishTitle = "Draft",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            LearningTrack = track,
            Status = CourseStatus.Draft,
            IsFree = true
        };
        var publishedModule = new CourseModule { Course = published, ArabicTitle = "وحدة", EnglishTitle = "Unit", IsPublished = true, GuidedLearningHours = 12 };
        var hiddenModule = new CourseModule { Course = published, ArabicTitle = "مخفية", EnglishTitle = "Hidden", IsPublished = false, GuidedLearningHours = 8 };
        db.AddRange(track, grade, specialization, subject, published, draft, publishedModule, hiddenModule);
        db.Lessons.AddRange(
            new Lesson { CourseModule = publishedModule, ArabicTitle = "درس", EnglishTitle = "Lesson", IsPublished = true },
            new Lesson { CourseModule = hiddenModule, ArabicTitle = "مخفي", EnglishTitle = "Hidden", IsPublished = true });
        await db.SaveChangesAsync();

        var result = await new TaxonomyController(db).GetTrack("btec", "ar");

        var response = Assert.IsType<OkObjectResult>(result.Result);
        var detail = Assert.IsType<PublicTrackDetail>(response.Value);
        Assert.Equal("وصف المسار", detail.Description);
        Assert.Equal(1, detail.CourseCount);
        Assert.Equal(1, detail.ModuleCount);
        Assert.Equal(1, detail.LessonCount);
        Assert.Equal(12, detail.GuidedLearningHours);
        Assert.Contains(detail.Specializations, item => item.Slug == "it");
        Assert.Contains(detail.Subjects, item => item.Slug == "programming");
    }

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
