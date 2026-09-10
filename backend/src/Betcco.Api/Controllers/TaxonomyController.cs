using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/taxonomy")]
public sealed class TaxonomyController(BetccoDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var tracks = await db.LearningTracks.AsNoTracking().Where(x => x.IsVisible).OrderBy(x => x.SortOrder).Select(x => new { x.Id, x.Slug, name = locale.StartsWith("ar") ? x.ArabicName : x.EnglishName, x.IsBtecFocused }).ToListAsync(cancellationToken);
        var grades = await db.Grades.AsNoTracking().Where(x => x.IsVisible).OrderBy(x => x.SortOrder).Select(x => new { x.Id, x.LearningTrackId, x.Slug, name = locale.StartsWith("ar") ? x.ArabicName : x.EnglishName }).ToListAsync(cancellationToken);
        var specializations = await db.Specializations.AsNoTracking().Where(x => x.IsVisible).OrderBy(x => x.SortOrder).Select(x => new { x.Id, x.LearningTrackId, x.Slug, name = locale.StartsWith("ar") ? x.ArabicName : x.EnglishName, x.AccentColor }).ToListAsync(cancellationToken);
        var teacherUserId = User.IsInRole("Teacher") ? User.FindFirstValue(ClaimTypes.NameIdentifier) : null;
        var subjects = await db.Subjects.AsNoTracking()
            .Where(subject => subject.IsVisible || (teacherUserId != null && subject.CreatedByUserId == teacherUserId))
            .OrderBy(subject => subject.SortOrder)
            .Select(subject => new
            {
                subject.Id,
                subject.SpecializationId,
                subject.Slug,
                name = locale.StartsWith("ar") ? subject.ArabicName : subject.EnglishName,
                isPendingReview = !subject.IsVisible
            })
            .ToListAsync(cancellationToken);
        var taskTypes = await db.TaskTypes.AsNoTracking()
            .Where(item => item.IsActive)
            .OrderBy(item => item.ArabicName)
            .Select(item => new { item.Id, name = locale.StartsWith("ar") ? item.ArabicName : item.EnglishName })
            .ToListAsync(cancellationToken);
        return Ok(new { tracks, grades, specializations, subjects, taskTypes });
    }

    [AllowAnonymous]
    [HttpGet("tracks/{slug}")]
    public async Task<ActionResult<PublicTrackDetail>> GetTrack(
        string slug,
        [FromQuery] string locale = "ar",
        CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var track = await db.LearningTracks.AsNoTracking()
            .Where(item => item.IsVisible && item.Slug == slug)
            .Select(item => new
            {
                item.Id,
                item.Slug,
                Name = arabic ? item.ArabicName : item.EnglishName,
                Description = arabic ? item.ArabicDescription : item.EnglishDescription,
                item.IsBtecFocused
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (track is null) return NotFound();

        var publishedCourses = db.Courses.AsNoTracking()
            .Where(course => course.LearningTrackId == track.Id && course.Status == CourseStatus.Published);
        var courseCount = await publishedCourses.CountAsync(cancellationToken);
        var moduleQuery = db.CourseModules.AsNoTracking().Where(module =>
            module.Course!.LearningTrackId == track.Id
            && module.Course.Status == CourseStatus.Published
            && module.IsPublished);
        var moduleCount = await moduleQuery.CountAsync(cancellationToken);
        var guidedLearningHours = await moduleQuery.SumAsync(
            module => (int?)module.GuidedLearningHours,
            cancellationToken) ?? 0;
        var lessonCount = await db.Lessons.AsNoTracking().CountAsync(lesson =>
            lesson.IsPublished
            && lesson.CourseModule!.IsPublished
            && lesson.CourseModule.Course!.LearningTrackId == track.Id
            && lesson.CourseModule.Course.Status == CourseStatus.Published,
            cancellationToken);
        var grades = await db.Grades.AsNoTracking()
            .Where(grade => grade.IsVisible && grade.LearningTrackId == track.Id)
            .OrderBy(grade => grade.SortOrder)
            .Select(grade => new TrackTaxonomyItem(grade.Slug, arabic ? grade.ArabicName : grade.EnglishName))
            .ToListAsync(cancellationToken);
        var specializations = await db.Specializations.AsNoTracking()
            .Where(specialization => specialization.IsVisible && specialization.LearningTrackId == track.Id)
            .OrderBy(specialization => specialization.SortOrder)
            .Select(specialization => new TrackTaxonomyItem(specialization.Slug, arabic ? specialization.ArabicName : specialization.EnglishName))
            .ToListAsync(cancellationToken);
        var subjects = await db.Subjects.AsNoTracking()
            .Where(subject => subject.IsVisible && subject.Specialization!.LearningTrackId == track.Id)
            .OrderBy(subject => subject.SortOrder)
            .Select(subject => new TrackTaxonomyItem(subject.Slug, arabic ? subject.ArabicName : subject.EnglishName))
            .ToListAsync(cancellationToken);

        return Ok(new PublicTrackDetail(
            track.Slug,
            track.Name,
            track.Description,
            track.IsBtecFocused,
            courseCount,
            moduleCount,
            lessonCount,
            guidedLearningHours,
            grades,
            specializations,
            subjects));
    }

    [Authorize(Policy = "Student")]
    [HttpGet("evaluation-options")]
    public async Task<IActionResult> EvaluationOptions(CancellationToken cancellationToken = default) => Ok(new
    {
        grades = await db.Grades.AsNoTracking().Where(x => x.IsVisible).Select(x => new { x.Id, x.ArabicName, x.EnglishName }).ToListAsync(cancellationToken),
        specializations = await db.Specializations.AsNoTracking().Where(x => x.IsVisible).Select(x => new { x.Id, x.ArabicName, x.EnglishName }).ToListAsync(cancellationToken),
        taskTypes = await db.TaskTypes.AsNoTracking().Where(x => x.IsActive).Select(x => new { x.Id, x.ArabicName, x.EnglishName }).ToListAsync(cancellationToken),
        rubrics = await db.RubricTemplates.Include(x => x.Criteria).AsNoTracking().Where(x => x.IsActive).Select(x => new { x.Id, x.GradeId, x.SpecializationId, x.TaskTypeId, x.ArabicTitle, x.EnglishTitle, criteria = x.Criteria.Select(c => new { c.Code, c.ArabicDescription, c.EnglishDescription }) }).ToListAsync(cancellationToken)
    });
}

public sealed record TrackTaxonomyItem(string Slug, string Name);
public sealed record PublicTrackDetail(
    string Slug,
    string Name,
    string? Description,
    bool IsBtecFocused,
    int CourseCount,
    int ModuleCount,
    int LessonCount,
    int GuidedLearningHours,
    IReadOnlyCollection<TrackTaxonomyItem> Grades,
    IReadOnlyCollection<TrackTaxonomyItem> Specializations,
    IReadOnlyCollection<TrackTaxonomyItem> Subjects);
