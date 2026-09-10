using System.Security.Claims;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Route("api/v1/public")]
public sealed class PublicContentController(BetccoDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("blog")]
    public async Task<IActionResult> Blog([FromQuery] string locale = "ar", [FromQuery] int page = 1, [FromQuery] int pageSize = 12, CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var posts = db.BlogPosts.AsNoTracking().Where(x => x.IsPublished).OrderByDescending(x => x.PublishedAtUtc);
        var count = await posts.CountAsync(cancellationToken);
        var items = await posts.Skip((page - 1) * pageSize).Take(pageSize).Select(x => new
        {
            x.Slug,
            title = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? x.ArabicTitle : x.EnglishTitle,
            excerpt = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? x.ArabicExcerpt : x.EnglishExcerpt,
            x.PublishedAtUtc
        }).ToListAsync(cancellationToken);
        return Ok(new { items, page, pageSize, totalCount = count });
    }

    [AllowAnonymous]
    [HttpGet("blog/{slug}")]
    public async Task<IActionResult> BlogPost(string slug, [FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var post = await db.BlogPosts.AsNoTracking().SingleOrDefaultAsync(x => x.Slug == slug && x.IsPublished, cancellationToken);
        if (post is null) return NotFound();
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        return Ok(new
        {
            post.Slug,
            title = arabic ? post.ArabicTitle : post.EnglishTitle,
            excerpt = arabic ? post.ArabicExcerpt : post.EnglishExcerpt,
            body = arabic ? post.ArabicBody : post.EnglishBody,
            post.PublishedAtUtc
        });
    }

    [AllowAnonymous]
    [HttpGet("teachers")]
    public async Task<IActionResult> Teachers([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var profiles = await db.TeacherPublicProfiles.AsNoTracking().Where(x => x.IsPublic).OrderBy(x => x.CreatedAtUtc).ToListAsync(cancellationToken);
        var userIds = profiles.Select(x => Guid.TryParse(x.TeacherUserId, out var id) ? id : Guid.Empty).Where(x => x != Guid.Empty).ToArray();
        var users = await db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id) && !x.IsFrozen).Select(x => new { x.Id, x.DisplayName }).ToListAsync(cancellationToken);
        var courses = await db.Courses.AsNoTracking().Where(x => x.Status == Betcco.Domain.Common.CourseStatus.Published && x.TeacherUserId != null).Select(x => new { x.TeacherUserId, x.Slug, x.ArabicTitle, x.EnglishTitle }).ToListAsync(cancellationToken);
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var items = profiles.Join(users, profile => profile.TeacherUserId, user => user.Id.ToString(), (profile, user) => new
        {
            id = user.Id,
            user.DisplayName,
            bio = arabic ? profile.ArabicBio : profile.EnglishBio,
            specializations = arabic ? profile.ArabicSpecializations : profile.EnglishSpecializations,
            courses = courses.Where(course => course.TeacherUserId == user.Id.ToString()).Select(course => new
            {
                course.Slug,
                title = arabic ? course.ArabicTitle : course.EnglishTitle
            })
        });
        return Ok(items);
    }

    [AllowAnonymous]
    [HttpGet("packages")]
    public async Task<IActionResult> Packages([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var packages = await db.CoursePackages.AsNoTracking()
            .Include(x => x.Courses).ThenInclude(x => x.Course)
            .Where(x => x.IsPublished && (x.AvailableFromUtc == null || x.AvailableFromUtc <= now) && (x.AvailableUntilUtc == null || x.AvailableUntilUtc > now))
            .OrderBy(x => x.Price)
            .ToListAsync(cancellationToken);
        return Ok(packages.Select(package => new
        {
            package.Id,
            package.Slug,
            title = arabic ? package.ArabicTitle : package.EnglishTitle,
            description = arabic ? package.ArabicDescription : package.EnglishDescription,
            package.Price,
            package.Currency,
            originalPrice = package.Courses.Where(x => x.Course != null && x.Course.Status == Betcco.Domain.Common.CourseStatus.Published).Sum(x => x.Course!.IsFree ? 0 : x.Course.Price),
            discountAmount = Math.Max(0, package.Courses.Where(x => x.Course != null && x.Course.Status == Betcco.Domain.Common.CourseStatus.Published).Sum(x => x.Course!.IsFree ? 0 : x.Course.Price) - package.Price),
            package.AvailableFromUtc,
            package.AvailableUntilUtc,
            courses = package.Courses.Where(x => x.Course?.Status == Betcco.Domain.Common.CourseStatus.Published).Select(x => new
            {
                x.Course!.Slug,
                title = arabic ? x.Course.ArabicTitle : x.Course.EnglishTitle
            })
        }));
    }

    [HttpGet("courses")]
    public async Task<IActionResult> PublishedCourses([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        return Ok(await db.Courses.AsNoTracking().Where(x => x.Status == Betcco.Domain.Common.CourseStatus.Published).OrderBy(x => x.ArabicTitle).Select(x => new
        {
            x.Id,
            title = arabic ? x.ArabicTitle : x.EnglishTitle,
            x.Price,
            x.Currency
        }).ToListAsync(cancellationToken));
    }

    [AllowAnonymous]
    [HttpGet("live-sessions")]
    public async Task<IActionResult> LiveSessions([FromQuery] string locale = "ar", CancellationToken cancellationToken = default)
    {
        var arabic = locale.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
        var sessions = await db.LiveSessions.AsNoTracking().Include(x => x.Course)
            .Where(x => x.IsPublished && x.EndsAtUtc > DateTimeOffset.UtcNow)
            .OrderBy(x => x.StartsAtUtc).ToListAsync(cancellationToken);
        return Ok(sessions.Select(session => new
        {
            session.Id,
            title = arabic ? session.ArabicTitle : session.EnglishTitle,
            description = arabic ? session.ArabicDescription : session.EnglishDescription,
            session.Provider,
            session.RecordingUrl,
            session.StartsAtUtc,
            session.EndsAtUtc,
            session.Capacity,
            course = session.Course is null ? null : new
            {
                session.Course.Slug,
                title = arabic ? session.Course.ArabicTitle : session.Course.EnglishTitle
            }
        }));
    }

    [Authorize]
    [HttpGet("live-sessions/{sessionId:guid}/join")]
    public async Task<IActionResult> JoinLiveSession(Guid sessionId, CancellationToken cancellationToken)
    {
        var session = await db.LiveSessions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == sessionId && x.IsPublished, cancellationToken);
        if (session is null || string.IsNullOrWhiteSpace(session.JoinUrl)) return NotFound();
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var isAdmin = User.IsInRole(PlatformRoles.Admin);
        var isHost = session.HostUserId == userId;
        var hasAudienceAccess = session.CourseId is null
            ? User.IsInRole(PlatformRoles.Student)
            : await db.Enrollments.AnyAsync(x => x.CourseId == session.CourseId && x.StudentUserId == userId && (x.AccessEndsAtUtc == null || x.AccessEndsAtUtc > DateTimeOffset.UtcNow), cancellationToken);
        if (!isAdmin && !isHost && !hasAudienceAccess) return NotFound();
        if (User.IsInRole(PlatformRoles.Student))
        {
            var attendance = await db.LiveSessionAttendances.SingleOrDefaultAsync(item => item.LiveSessionId == sessionId && item.StudentUserId == userId, cancellationToken);
            if (attendance is null)
            {
                var status = DateTimeOffset.UtcNow > session.StartsAtUtc.AddMinutes(10)
                    ? LiveAttendanceStatus.Late
                    : LiveAttendanceStatus.Present;
                db.LiveSessionAttendances.Add(new LiveSessionAttendance { LiveSessionId = sessionId, StudentUserId = userId, Status = status });
                await db.SaveChangesAsync(cancellationToken);
            }
            else if (attendance.Status != LiveAttendanceStatus.Excused)
            {
                attendance.Status = DateTimeOffset.UtcNow > session.StartsAtUtc.AddMinutes(10)
                    ? LiveAttendanceStatus.Late
                    : LiveAttendanceStatus.Present;
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        return Ok(new { joinUrl = session.JoinUrl, recordingUrl = session.RecordingUrl });
    }
}

[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/v1/admin/content")]
public sealed class AdminContentController(BetccoDbContext db, UserManager<ApplicationUser> userManager, ILiveSessionProviderCatalog liveSessionProviders) : ControllerBase
{
    [HttpGet("blog")]
    public async Task<IActionResult> Blog(CancellationToken cancellationToken) => Ok(await db.BlogPosts.AsNoTracking().OrderByDescending(x => x.UpdatedAtUtc).Select(x => new { x.Id, x.Slug, x.ArabicTitle, x.EnglishTitle, x.IsPublished, x.PublishedAtUtc }).ToListAsync(cancellationToken));

    [HttpPost("blog")]
    public async Task<IActionResult> CreateBlog(UpsertBlogPostRequest request, CancellationToken cancellationToken)
    {
        if (!IsValid(request)) return BadRequest(new { message = "Provide a unique URL slug and complete Arabic and English article fields." });
        if (await db.BlogPosts.AnyAsync(x => x.Slug == request.Slug, cancellationToken)) return Conflict(new { message = "This article URL is already in use." });
        var post = new BlogPost { Slug = request.Slug, ArabicTitle = request.ArabicTitle.Trim(), EnglishTitle = request.EnglishTitle.Trim(), ArabicExcerpt = request.ArabicExcerpt.Trim(), EnglishExcerpt = request.EnglishExcerpt.Trim(), ArabicBody = request.ArabicBody.Trim(), EnglishBody = request.EnglishBody.Trim(), AuthorUserId = UserId, IsPublished = request.IsPublished, PublishedAtUtc = request.IsPublished ? DateTimeOffset.UtcNow : null };
        db.BlogPosts.Add(post);
        db.AuditLogs.Add(Audit("BlogPostCreated", nameof(BlogPost), post.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/public/blog/{post.Slug}", new { post.Id, post.Slug });
    }

    [HttpPut("blog/{postId:guid}")]
    public async Task<IActionResult> UpdateBlog(Guid postId, UpsertBlogPostRequest request, CancellationToken cancellationToken)
    {
        if (!IsValid(request)) return BadRequest(new { message = "Provide a unique URL slug and complete Arabic and English article fields." });
        var post = await db.BlogPosts.SingleOrDefaultAsync(x => x.Id == postId, cancellationToken);
        if (post is null) return NotFound();
        if (await db.BlogPosts.AnyAsync(x => x.Id != postId && x.Slug == request.Slug, cancellationToken)) return Conflict(new { message = "This article URL is already in use." });
        post.Slug = request.Slug; post.ArabicTitle = request.ArabicTitle.Trim(); post.EnglishTitle = request.EnglishTitle.Trim(); post.ArabicExcerpt = request.ArabicExcerpt.Trim(); post.EnglishExcerpt = request.EnglishExcerpt.Trim(); post.ArabicBody = request.ArabicBody.Trim(); post.EnglishBody = request.EnglishBody.Trim();
        post.IsPublished = request.IsPublished;
        post.PublishedAtUtc = request.IsPublished ? post.PublishedAtUtc ?? DateTimeOffset.UtcNow : null;
        db.AuditLogs.Add(Audit("BlogPostUpdated", nameof(BlogPost), post.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("teachers")]
    public async Task<IActionResult> Teachers(CancellationToken cancellationToken)
    {
        var teacherRole = await db.Roles.Where(x => x.Name == PlatformRoles.Teacher).Select(x => x.Id).SingleAsync(cancellationToken);
        var teacherIds = await db.UserRoles.Where(x => x.RoleId == teacherRole).Select(x => x.UserId).ToArrayAsync(cancellationToken);
        var profiles = await db.TeacherPublicProfiles.AsNoTracking().ToDictionaryAsync(x => x.TeacherUserId, cancellationToken);
        var teachers = await db.Users.AsNoTracking().Where(x => teacherIds.Contains(x.Id)).OrderBy(x => x.DisplayName).Select(x => new { x.Id, x.DisplayName, x.Email, x.IsFrozen }).ToListAsync(cancellationToken);
        return Ok(teachers.Select(teacher => new
        {
            teacher.Id,
            teacher.DisplayName,
            teacher.Email,
            teacher.IsFrozen,
            profile = profiles.TryGetValue(teacher.Id.ToString(), out var profile) ? new { profile.ArabicBio, profile.EnglishBio, profile.ArabicSpecializations, profile.EnglishSpecializations, profile.IsPublic } : null
        }));
    }

    [HttpPut("teachers/{teacherId:guid}/profile")]
    public async Task<IActionResult> UpdateTeacherProfile(Guid teacherId, UpsertTeacherProfileRequest request, CancellationToken cancellationToken)
    {
        var teacher = await userManager.FindByIdAsync(teacherId.ToString());
        if (teacher is null || !await userManager.IsInRoleAsync(teacher, PlatformRoles.Teacher)) return NotFound();
        if (!Within(request.ArabicBio, 2500) || !Within(request.EnglishBio, 2500) || !Within(request.ArabicSpecializations, 500) || !Within(request.EnglishSpecializations, 500)) return BadRequest(new { message = "Profile fields are too long." });
        var profile = await db.TeacherPublicProfiles.SingleOrDefaultAsync(x => x.TeacherUserId == teacher.Id.ToString(), cancellationToken);
        if (profile is null)
        {
            profile = new TeacherPublicProfile { TeacherUserId = teacher.Id.ToString() };
            db.TeacherPublicProfiles.Add(profile);
        }
        profile.ArabicBio = Trim(request.ArabicBio); profile.EnglishBio = Trim(request.EnglishBio); profile.ArabicSpecializations = Trim(request.ArabicSpecializations); profile.EnglishSpecializations = Trim(request.EnglishSpecializations); profile.IsPublic = request.IsPublic;
        db.AuditLogs.Add(Audit("TeacherPublicProfileUpdated", nameof(TeacherPublicProfile), profile.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("packages")]
    public async Task<IActionResult> Packages(CancellationToken cancellationToken) => Ok(await db.CoursePackages.AsNoTracking().Include(x => x.Courses).OrderByDescending(x => x.UpdatedAtUtc).Select(x => new { x.Id, x.Slug, x.ArabicTitle, x.EnglishTitle, x.ArabicDescription, x.EnglishDescription, x.Price, x.Currency, x.IsPublished, x.AvailableFromUtc, x.AvailableUntilUtc, courseIds = x.Courses.Select(course => course.CourseId) }).ToListAsync(cancellationToken));

    [HttpPost("packages")]
    public async Task<IActionResult> CreatePackage(UpsertPackageRequest request, CancellationToken cancellationToken)
    {
        if (!IsValid(request) || request.Price < 0 || request.CourseIds.Count == 0 || (request.AvailableFromUtc is not null && request.AvailableUntilUtc is not null && request.AvailableFromUtc >= request.AvailableUntilUtc)) return BadRequest(new { message = "Provide complete package details, a price, published courses, and a valid availability window." });
        if (await db.CoursePackages.AnyAsync(x => x.Slug == request.Slug, cancellationToken)) return Conflict(new { message = "This package URL is already in use." });
        var courses = await db.Courses.Where(x => request.CourseIds.Distinct().Contains(x.Id) && x.Status == Betcco.Domain.Common.CourseStatus.Published).Select(x => x.Id).ToListAsync(cancellationToken);
        if (courses.Count != request.CourseIds.Distinct().Count()) return BadRequest(new { message = "A package can contain only published courses." });
        var package = new CoursePackage { Slug = request.Slug, ArabicTitle = request.ArabicTitle.Trim(), EnglishTitle = request.EnglishTitle.Trim(), ArabicDescription = request.ArabicDescription.Trim(), EnglishDescription = request.EnglishDescription.Trim(), Price = request.Price, Currency = "JOD", AvailableFromUtc = request.AvailableFromUtc, AvailableUntilUtc = request.AvailableUntilUtc, IsPublished = request.IsPublished };
        foreach (var courseId in courses) package.Courses.Add(new PackageCourse { CourseId = courseId });
        db.CoursePackages.Add(package);
        db.AuditLogs.Add(Audit("CoursePackageCreated", nameof(CoursePackage), package.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/public/packages", new { package.Id, package.Slug });
    }

    [HttpPut("packages/{packageId:guid}")]
    public async Task<IActionResult> UpdatePackage(Guid packageId, UpsertPackageRequest request, CancellationToken cancellationToken)
    {
        if (!IsValid(request) || request.Price < 0 || request.CourseIds is null || request.CourseIds.Count == 0 || (request.AvailableFromUtc is not null && request.AvailableUntilUtc is not null && request.AvailableFromUtc >= request.AvailableUntilUtc)) return BadRequest(new { message = "Provide complete package details, a price, published courses, and a valid availability window." });
        var package = await db.CoursePackages.Include(item => item.Courses).SingleOrDefaultAsync(item => item.Id == packageId, cancellationToken);
        if (package is null) return NotFound();
        if (await db.CoursePackages.AnyAsync(item => item.Id != packageId && item.Slug == request.Slug, cancellationToken)) return Conflict(new { message = "This package URL is already in use." });
        var requestedCourseIds = request.CourseIds.Distinct().ToArray();
        var courses = await db.Courses.Where(course => requestedCourseIds.Contains(course.Id) && course.Status == Betcco.Domain.Common.CourseStatus.Published).Select(course => course.Id).ToListAsync(cancellationToken);
        if (courses.Count != requestedCourseIds.Length) return BadRequest(new { message = "A package can contain only published courses." });

        var oldValues = new { package.Slug, package.Price, package.IsPublished, package.AvailableFromUtc, package.AvailableUntilUtc, courseIds = package.Courses.Select(item => item.CourseId).Order().ToArray() };
        package.Slug = request.Slug;
        package.ArabicTitle = request.ArabicTitle.Trim();
        package.EnglishTitle = request.EnglishTitle.Trim();
        package.ArabicDescription = request.ArabicDescription.Trim();
        package.EnglishDescription = request.EnglishDescription.Trim();
        package.Price = request.Price;
        package.AvailableFromUtc = request.AvailableFromUtc;
        package.AvailableUntilUtc = request.AvailableUntilUtc;
        package.IsPublished = request.IsPublished;
        var existingCourseIds = package.Courses.Select(item => item.CourseId).ToHashSet();
        var removedLinks = package.Courses.Where(item => !requestedCourseIds.Contains(item.CourseId)).ToArray();
        foreach (var removedLink in removedLinks) package.Courses.Remove(removedLink);
        db.PackageCourses.RemoveRange(removedLinks);
        foreach (var courseId in courses.Where(courseId => !existingCourseIds.Contains(courseId))) db.PackageCourses.Add(new PackageCourse { CoursePackageId = package.Id, CourseId = courseId });
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = UserId,
            Action = "CoursePackageUpdated",
            EntityType = nameof(CoursePackage),
            EntityId = package.Id.ToString(),
            Outcome = "Success",
            OldValuesJson = System.Text.Json.JsonSerializer.Serialize(oldValues),
            NewValuesJson = System.Text.Json.JsonSerializer.Serialize(new { package.Slug, package.Price, package.IsPublished, package.AvailableFromUtc, package.AvailableUntilUtc, courseIds = courses.Order().ToArray() })
        });
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("live-sessions")]
    public async Task<IActionResult> LiveSessions(CancellationToken cancellationToken) => Ok(await db.LiveSessions.AsNoTracking().OrderByDescending(x => x.UpdatedAtUtc).Select(x => new { x.Id, x.CourseId, x.HostUserId, x.ArabicTitle, x.EnglishTitle, x.Provider, x.RecordingUrl, x.StartsAtUtc, x.EndsAtUtc, x.Capacity, x.IsPublished }).ToListAsync(cancellationToken));

    [HttpGet("live-session-providers")]
    public IActionResult LiveSessionProviders() => Ok(liveSessionProviders.List());

    [HttpGet("live-sessions/{sessionId:guid}/attendance")]
    public async Task<IActionResult> LiveSessionAttendance(Guid sessionId, CancellationToken cancellationToken)
    {
        if (!await db.LiveSessions.AsNoTracking().AnyAsync(item => item.Id == sessionId, cancellationToken)) return NotFound();
        var rows = await db.LiveSessionAttendances.AsNoTracking().Where(item => item.LiveSessionId == sessionId).OrderBy(item => item.JoinedAtUtc).ToListAsync(cancellationToken);
        var ids = rows.Select(item => item.StudentUserId).ToArray();
        var names = await db.Users.AsNoTracking().Where(user => ids.Contains(user.Id.ToString())).ToDictionaryAsync(user => user.Id.ToString(), user => user.DisplayName, cancellationToken);
        return Ok(rows.Select(item => new { item.Id, item.StudentUserId, studentName = names.GetValueOrDefault(item.StudentUserId, "Student"), status = item.Status.ToString(), item.JoinedAtUtc, item.LeftAtUtc, item.MarkedAtUtc }));
    }

    [HttpPut("live-sessions/{sessionId:guid}/attendance")]
    public async Task<IActionResult> MarkLiveSessionAttendance(Guid sessionId, MarkLiveSessionAttendanceRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<LiveAttendanceStatus>(request.Status, true, out var status)
            || !Guid.TryParse(request.StudentUserId, out var studentId))
            return BadRequest(new { message = "Choose a valid student and attendance status." });
        var session = await db.LiveSessions.SingleOrDefaultAsync(item => item.Id == sessionId, cancellationToken);
        if (session is null) return NotFound();
        var student = await userManager.FindByIdAsync(studentId.ToString());
        if (student is null || !await userManager.IsInRoleAsync(student, PlatformRoles.Student)) return BadRequest(new { message = "Choose a student account." });
        if (session.CourseId is not null && !await db.Enrollments.AnyAsync(item => item.CourseId == session.CourseId && item.StudentUserId == student.Id.ToString(), cancellationToken))
            return BadRequest(new { message = "The student is not enrolled in the session course." });
        var attendance = await db.LiveSessionAttendances.SingleOrDefaultAsync(item => item.LiveSessionId == sessionId && item.StudentUserId == student.Id.ToString(), cancellationToken);
        if (attendance is null)
        {
            attendance = new LiveSessionAttendance { LiveSessionId = sessionId, StudentUserId = student.Id.ToString(), JoinedAtUtc = session.StartsAtUtc };
            db.LiveSessionAttendances.Add(attendance);
        }
        attendance.Status = status;
        attendance.MarkedAtUtc = DateTimeOffset.UtcNow;
        attendance.MarkedByUserId = UserId;
        db.AuditLogs.Add(Audit("LiveSessionAttendanceMarked", nameof(LiveSessionAttendance), attendance.Id));
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("courses")]
    public async Task<IActionResult> Courses(CancellationToken cancellationToken) => Ok(await db.Courses.AsNoTracking().Where(x => x.Status == Betcco.Domain.Common.CourseStatus.Published).OrderBy(x => x.ArabicTitle).Select(x => new { x.Id, x.ArabicTitle, x.EnglishTitle, x.Price, x.Currency }).ToListAsync(cancellationToken));

    [HttpPost("live-sessions")]
    public async Task<IActionResult> CreateLiveSession(CreateLiveSessionRequest request, CancellationToken cancellationToken)
    {
        if (!Within(request.ArabicTitle, 180) || !Within(request.EnglishTitle, 180) || string.IsNullOrWhiteSpace(request.Provider) || request.EndsAtUtc <= request.StartsAtUtc || request.Capacity is < 1 or > 5000) return BadRequest(new { message = "Provide valid session details and timing." });
        if (!Guid.TryParse(request.HostUserId, out var hostId) || await userManager.FindByIdAsync(hostId.ToString()) is null) return BadRequest(new { message = "Choose a valid host." });
        if (request.CourseId is not null && !await db.Courses.AnyAsync(x => x.Id == request.CourseId && x.Status == Betcco.Domain.Common.CourseStatus.Published, cancellationToken)) return BadRequest(new { message = "Choose a published course or leave it empty for a public student session." });
        var provider = liveSessionProviders.Validate(request.Provider, request.JoinUrl, request.RecordingUrl);
        if (!provider.IsValid) return BadRequest(new { message = provider.Error });
        var session = new LiveSession { CourseId = request.CourseId, HostUserId = hostId.ToString(), ArabicTitle = request.ArabicTitle.Trim(), EnglishTitle = request.EnglishTitle.Trim(), ArabicDescription = Trim(request.ArabicDescription), EnglishDescription = Trim(request.EnglishDescription), Provider = provider.ProviderId!, JoinUrl = Trim(request.JoinUrl), RecordingUrl = Trim(request.RecordingUrl), StartsAtUtc = request.StartsAtUtc, EndsAtUtc = request.EndsAtUtc, Capacity = request.Capacity, IsPublished = request.IsPublished };
        db.LiveSessions.Add(session);
        db.AuditLogs.Add(Audit("LiveSessionCreated", nameof(LiveSession), session.Id));
        await db.SaveChangesAsync(cancellationToken);
        return Created($"/api/v1/public/live-sessions", new { session.Id });
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private AuditLog Audit(string action, string entityType, Guid id) => new() { ActorUserId = UserId, Action = action, EntityType = entityType, EntityId = id.ToString(), Outcome = "Success" };
    private static bool IsValid(UpsertBlogPostRequest request) => IsSlug(request.Slug) && Within(request.ArabicTitle, 180) && Within(request.EnglishTitle, 180) && Within(request.ArabicExcerpt, 600) && Within(request.EnglishExcerpt, 600) && Within(request.ArabicBody, 25000) && Within(request.EnglishBody, 25000);
    private static bool IsValid(UpsertPackageRequest request) => IsSlug(request.Slug) && Within(request.ArabicTitle, 180) && Within(request.EnglishTitle, 180) && Within(request.ArabicDescription, 2500) && Within(request.EnglishDescription, 2500);
    private static bool IsSlug(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 120 && System.Text.RegularExpressions.Regex.IsMatch(value, "^[a-z0-9]+(?:-[a-z0-9]+)*$");
    private static bool Within(string? value, int maximum) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= maximum;
    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record UpsertBlogPostRequest(string Slug, string ArabicTitle, string EnglishTitle, string ArabicExcerpt, string EnglishExcerpt, string ArabicBody, string EnglishBody, bool IsPublished);
public sealed record UpsertTeacherProfileRequest(string? ArabicBio, string? EnglishBio, string? ArabicSpecializations, string? EnglishSpecializations, bool IsPublic);
public sealed record UpsertPackageRequest(string Slug, string ArabicTitle, string EnglishTitle, string ArabicDescription, string EnglishDescription, decimal Price, bool IsPublished, IReadOnlyCollection<Guid> CourseIds, DateTimeOffset? AvailableFromUtc = null, DateTimeOffset? AvailableUntilUtc = null);
public sealed record CreateLiveSessionRequest(Guid? CourseId, string HostUserId, string ArabicTitle, string EnglishTitle, string? ArabicDescription, string? EnglishDescription, string Provider, string? JoinUrl, string? RecordingUrl, DateTimeOffset StartsAtUtc, DateTimeOffset EndsAtUtc, int? Capacity, bool IsPublished);
public sealed record MarkLiveSessionAttendanceRequest(string StudentUserId, string Status);
