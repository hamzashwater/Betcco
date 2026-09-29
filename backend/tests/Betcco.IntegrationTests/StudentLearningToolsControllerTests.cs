using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Domain.Commerce;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Learning;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.IntegrationTests;

public sealed class StudentLearningToolsControllerTests
{
    [Fact]
    public async Task Pending_actions_include_only_the_authenticated_student()
    {
        await using var db = CreateDb();
        var own = Request("student-1", EvaluationStatus.Draft);
        own.AssessmentScopeId = Guid.NewGuid();
        var ownOriginal = Request("student-1", EvaluationStatus.Completed);
        var foreign = Request("student-2", EvaluationStatus.NeedsRevision);
        var foreignOriginal = Request("student-2", EvaluationStatus.Completed);
        db.EvaluationRequests.AddRange(own, ownOriginal, foreign, foreignOriginal);
        db.ResitAuthorizations.AddRange(Authorization(ownOriginal), Authorization(foreignOriginal));
        await db.SaveChangesAsync();

        using var document = await OverviewDocument(db);
        var actions = document.RootElement.GetProperty("pendingActions");
        Assert.Equal(2, actions.GetArrayLength());
        Assert.Equal(new[] { ownOriginal.Id.ToString(), own.Id.ToString() },
            actions.EnumerateArray().Select(action => action.GetProperty("evaluationRequestId").GetString()));
    }

    [Fact]
    public async Task Standard_draft_excludes_historical_retake_and_resit_requests()
    {
        await using var db = CreateDb();
        var standard = Request("student-1", EvaluationStatus.Draft);
        standard.AssessmentScopeId = Guid.NewGuid();
        var unscoped = Request("student-1", EvaluationStatus.Draft);
        var retake = Request("student-1", EvaluationStatus.Draft);
        retake.RetakeOfEvaluationRequestId = Guid.NewGuid();
        var original = Request("student-1", EvaluationStatus.Completed);
        var resit = Request("student-1", EvaluationStatus.Draft);
        var waiting = new[] { EvaluationStatus.PendingPayment, EvaluationStatus.PendingAssignment,
            EvaluationStatus.Assigned, EvaluationStatus.UnderReview, EvaluationStatus.Completed }
            .Select(status => Request("student-1", status)).ToArray();
        db.EvaluationRequests.AddRange([standard, unscoped, retake, original, resit, .. waiting]);
        db.ResitAuthorizations.Add(Authorization(original, resit));
        await db.SaveChangesAsync();

        using var document = await OverviewDocument(db);
        var drafts = document.RootElement.GetProperty("pendingActions").EnumerateArray()
            .Where(action => action.GetProperty("kind").GetString() == "EvaluationDraft").ToArray();
        Assert.Equal(standard.Id.ToString(), Assert.Single(drafts).GetProperty("evaluationRequestId").GetString());
        Assert.Equal("U1", drafts[0].GetProperty("academic").GetProperty("unitCode").GetString());
        Assert.Equal(2, document.RootElement.GetProperty("pendingActions").GetArrayLength());
    }

    [Fact]
    public async Task Revision_uses_active_effective_deadline_without_private_reason()
    {
        await using var db = CreateDb();
        var revision = Request("student-1", EvaluationStatus.NeedsRevision);
        var baseDue = DateTimeOffset.UtcNow.AddDays(2);
        revision.RevisionDueAtUtc = baseDue;
        db.EvaluationRequests.Add(revision);
        await db.SaveChangesAsync();

        using (var before = await OverviewDocument(db))
        {
            var action = Assert.Single(before.RootElement.GetProperty("pendingActions").EnumerateArray());
            Assert.Equal("EvaluationRevision", action.GetProperty("kind").GetString());
            Assert.Equal(baseDue, action.GetProperty("effectiveDueAtUtc").GetDateTimeOffset());
        }

        var extendedDue = baseDue.AddDays(3);
        var adjustment = new EvaluationRevisionDeadlineAdjustment
        {
            EvaluationRequestId = revision.Id,
            BaseDueAtUtcSnapshot = baseDue,
            ExtendedDueAtUtc = extendedDue,
            GrantedByUserId = Guid.NewGuid(),
            Reason = "Private accommodation"
        };
        db.EvaluationRevisionDeadlineAdjustments.Add(adjustment);
        await db.SaveChangesAsync();

        using var after = await OverviewDocument(db);
        var revised = Assert.Single(after.RootElement.GetProperty("pendingActions").EnumerateArray());
        Assert.Equal(extendedDue, revised.GetProperty("effectiveDueAtUtc").GetDateTimeOffset());
        Assert.DoesNotContain("Private accommodation", after.RootElement.GetRawText());

        adjustment.RevokedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        using var revoked = await OverviewDocument(db);
        Assert.Equal(baseDue, Assert.Single(revoked.RootElement.GetProperty("pendingActions").EnumerateArray())
            .GetProperty("effectiveDueAtUtc").GetDateTimeOffset());
    }

    [Fact]
    public async Task Revision_excludes_historical_retake_resit_expired_and_used_attempt()
    {
        await using var db = CreateDb();
        var standard = Request("student-1", EvaluationStatus.NeedsRevision);
        standard.RevisionDueAtUtc = DateTimeOffset.UtcNow.AddDays(2);
        var retake = Request("student-1", EvaluationStatus.NeedsRevision);
        retake.RetakeOfEvaluationRequestId = Guid.NewGuid();
        var original = Request("student-1", EvaluationStatus.Completed);
        var resit = Request("student-1", EvaluationStatus.NeedsRevision);
        var expired = Request("student-1", EvaluationStatus.NeedsRevision);
        expired.RevisionDueAtUtc = DateTimeOffset.UtcNow.AddDays(-1);
        var usedAttempt = Request("student-1", EvaluationStatus.NeedsRevision);
        usedAttempt.SubmissionAttemptNumber = 2;
        db.EvaluationRequests.AddRange(standard, retake, original, resit, expired, usedAttempt);
        db.ResitAuthorizations.Add(Authorization(original, resit));
        await db.SaveChangesAsync();

        using var document = await OverviewDocument(db);
        var action = Assert.Single(document.RootElement.GetProperty("pendingActions").EnumerateArray());
        Assert.Equal("EvaluationRevision", action.GetProperty("kind").GetString());
        Assert.Equal(standard.Id.ToString(), action.GetProperty("evaluationRequestId").GetString());
    }

    [Fact]
    public async Task Resit_opportunity_excludes_revoked_and_foreign_authorizations_and_private_fields()
    {
        await using var db = CreateDb();
        var own = Request("student-1", EvaluationStatus.Completed);
        var revokedOriginal = Request("student-1", EvaluationStatus.Completed);
        var foreign = Request("student-2", EvaluationStatus.Completed);
        db.EvaluationRequests.AddRange(own, revokedOriginal, foreign);
        var active = Authorization(own);
        var revoked = Authorization(revokedOriginal);
        revoked.RevokedAtUtc = DateTimeOffset.UtcNow;
        revoked.RevocationReason = "Private revocation";
        db.ResitAuthorizations.AddRange(active, revoked, Authorization(foreign));
        await db.SaveChangesAsync();

        using var document = await OverviewDocument(db);
        var action = Assert.Single(document.RootElement.GetProperty("pendingActions").EnumerateArray());
        Assert.Equal("ResitAuthorized", action.GetProperty("kind").GetString());
        Assert.Equal(active.Id.ToString(), action.GetProperty("authorizationId").GetString());
        Assert.Equal(own.Id.ToString(), action.GetProperty("originalEvaluationRequestId").GetString());
        var json = document.RootElement.GetRawText();
        Assert.DoesNotContain("reason", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("authorizedBy", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("revocationReason", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Activated_resit_draft_excludes_non_actionable_linked_request()
    {
        await using var db = CreateDb();
        var original = Request("student-1", EvaluationStatus.Completed);
        var draft = Request("student-1", EvaluationStatus.Draft);
        var completedOriginal = Request("student-1", EvaluationStatus.Completed);
        var completed = Request("student-1", EvaluationStatus.Completed);
        db.EvaluationRequests.AddRange(original, draft, completedOriginal, completed);
        db.ResitAuthorizations.AddRange(Authorization(original, draft), Authorization(completedOriginal, completed));
        await db.SaveChangesAsync();

        using var document = await OverviewDocument(db);
        var action = Assert.Single(document.RootElement.GetProperty("pendingActions").EnumerateArray());
        Assert.Equal("ResitDraft", action.GetProperty("kind").GetString());
        Assert.Equal(draft.Id.ToString(), action.GetProperty("evaluationRequestId").GetString());
        Assert.Equal(original.Id.ToString(), action.GetProperty("originalEvaluationRequestId").GetString());
    }

    [Fact]
    public async Task Pending_actions_are_bounded_and_deterministically_prioritized()
    {
        await using var db = CreateDb();
        var start = DateTimeOffset.UtcNow;
        var lateRevision = Request("student-1", EvaluationStatus.NeedsRevision);
        lateRevision.RevisionDueAtUtc = start.AddDays(3);
        var earlyRevision = Request("student-1", EvaluationStatus.NeedsRevision);
        earlyRevision.RevisionDueAtUtc = start.AddDays(1);
        var authorizedOriginal = Request("student-1", EvaluationStatus.Completed);
        var original = Request("student-1", EvaluationStatus.Completed);
        var resitDraft = Request("student-1", EvaluationStatus.Draft);
        var drafts = Enumerable.Range(0, 10).Select(index =>
        {
            var request = Request("student-1", EvaluationStatus.Draft);
            request.AssessmentScopeId = Guid.NewGuid();
            request.CreatedAtUtc = start.AddMinutes(index);
            return request;
        }).ToArray();
        db.EvaluationRequests.AddRange([lateRevision, earlyRevision, authorizedOriginal, original, resitDraft, .. drafts]);
        db.ResitAuthorizations.AddRange(Authorization(authorizedOriginal), Authorization(original, resitDraft));
        await db.SaveChangesAsync();
        for (var index = 0; index < drafts.Length; index++)
            drafts[index].CreatedAtUtc = start.AddMinutes(index);
        await db.SaveChangesAsync();

        using var first = await OverviewDocument(db);
        using var second = await OverviewDocument(db);
        var actions = first.RootElement.GetProperty("pendingActions").EnumerateArray().ToArray();
        Assert.Equal(8, actions.Length);
        Assert.Equal(new[] { "EvaluationRevision", "EvaluationRevision", "ResitAuthorized", "ResitDraft", "EvaluationDraft", "EvaluationDraft", "EvaluationDraft", "EvaluationDraft" },
            actions.Select(action => action.GetProperty("kind").GetString()).ToArray());
        Assert.Equal(earlyRevision.Id.ToString(), actions[0].GetProperty("evaluationRequestId").GetString());
        Assert.Equal(lateRevision.Id.ToString(), actions[1].GetProperty("evaluationRequestId").GetString());
        Assert.Equal(drafts.Take(4).Select(request => request.Id.ToString()),
            actions.Skip(4).Select(action => action.GetProperty("evaluationRequestId").GetString()));
        Assert.Equal(first.RootElement.GetProperty("pendingActions").GetRawText(),
            second.RootElement.GetProperty("pendingActions").GetRawText());
    }

    [Fact]
    public async Task Pending_actions_projection_executes_against_postgres()
    {
        await using var database = await PostgresTestDatabase.CreateAsync("student_pending_actions");
        await using var db = database.CreateContext();
        var ownRevision = Request("student-1", EvaluationStatus.NeedsRevision);
        var foreignRevision = Request("student-2", EvaluationStatus.NeedsRevision);
        var original = Request("student-1", EvaluationStatus.Completed);
        var resitDraft = Request("student-1", EvaluationStatus.Draft);
        var staff = new ApplicationUser { DisplayName = "Staff", UserName = "staff-pending-actions@betcco.test", Email = "staff-pending-actions@betcco.test" };
        ownRevision.RevisionDueAtUtc = DateTimeOffset.UtcNow.AddDays(2);
        foreignRevision.RevisionDueAtUtc = DateTimeOffset.UtcNow.AddDays(1);
        db.Users.Add(staff);
        db.EvaluationRequests.AddRange(ownRevision, foreignRevision, original, resitDraft);
        var authorization = Authorization(original, resitDraft);
        authorization.AuthorizedByUserId = staff.Id;
        db.ResitAuthorizations.Add(authorization);
        db.EvaluationRevisionDeadlineAdjustments.Add(new EvaluationRevisionDeadlineAdjustment
        {
            EvaluationRequestId = ownRevision.Id,
            BaseDueAtUtcSnapshot = ownRevision.RevisionDueAtUtc.Value,
            ExtendedDueAtUtc = ownRevision.RevisionDueAtUtc.Value.AddDays(1),
            GrantedByUserId = staff.Id,
            Reason = "Private adjustment"
        });
        await db.SaveChangesAsync();

        using var document = await OverviewDocument(db);
        var actions = document.RootElement.GetProperty("pendingActions").EnumerateArray().ToArray();
        Assert.Equal(new[] { "EvaluationRevision", "ResitDraft" },
            actions.Select(action => action.GetProperty("kind").GetString()));
        Assert.Equal(ownRevision.RevisionDueAtUtc.Value.AddDays(1).ToUnixTimeMilliseconds(),
            actions[0].GetProperty("effectiveDueAtUtc").GetDateTimeOffset().ToUnixTimeMilliseconds());
        Assert.Equal(ownRevision.Id.ToString(), actions[0].GetProperty("evaluationRequestId").GetString());
        Assert.Equal(resitDraft.Id.ToString(), actions[1].GetProperty("evaluationRequestId").GetString());
        Assert.DoesNotContain("Private adjustment", document.RootElement.GetRawText());
    }

    [Fact]
    public async Task Overview_derives_milestones_only_from_saved_learning_activity()
    {
        await using var db = CreateDb();
        var course = new Course
        {
            Slug = "real-progress",
            ArabicTitle = "تقدم فعلي",
            EnglishTitle = "Real progress",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            IsFree = true,
            Status = CourseStatus.Published
        };
        var module = new CourseModule
        {
            Course = course,
            ArabicTitle = "وحدة",
            EnglishTitle = "Module",
            IsPublished = true
        };
        var lesson = new Lesson
        {
            CourseModule = module,
            ArabicTitle = "درس",
            EnglishTitle = "Lesson",
            IsPublished = true
        };
        db.AddRange(course, module, lesson);
        await db.SaveChangesAsync();
        db.Enrollments.Add(new Enrollment { StudentUserId = "student-1", CourseId = course.Id });
        db.LessonProgresses.Add(new LessonProgress { StudentUserId = "student-1", LessonId = lesson.Id, IsCompleted = true });
        await db.SaveChangesAsync();
        var controller = new StudentLearningToolsController(db, null!, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, "student-1")], "Test"))
                }
            }
        };

        var result = await controller.Overview("ar", CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(response.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        var milestones = document.RootElement.GetProperty("achievements");
        Assert.True(milestones[0].GetProperty("isCompleted").GetBoolean());
        Assert.Equal(1, milestones[0].GetProperty("currentValue").GetInt32());
        Assert.False(milestones[1].GetProperty("isCompleted").GetBoolean());
        Assert.False(milestones[2].GetProperty("isCompleted").GetBoolean());
    }

    [Fact]
    public async Task Purchase_history_is_scoped_to_the_authenticated_student()
    {
        await using var db = CreateDb();
        var ownPayment = new Payment
        {
            UserId = "student-1",
            Purpose = "CoursePurchase",
            Status = PaymentStatus.Paid,
            Total = 25,
            Currency = "JOD"
        };
        db.Payments.AddRange(
            ownPayment,
            new Payment
            {
                UserId = "student-2",
                Purpose = "Evaluation",
                Status = PaymentStatus.Paid,
                Total = 50,
                Currency = "JOD"
            });
        await db.SaveChangesAsync();
        var controller = new StudentLearningToolsController(db, null!, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, "student-1")], "Test"))
                }
            }
        };

        var result = await controller.Purchases(1, 20, CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(response.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(1, items.GetArrayLength());
        Assert.Equal(ownPayment.Id.ToString(), items[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task Entitlements_are_scoped_to_active_student_access_and_project_credit_state()
    {
        await using var db = CreateDb();
        var payment = new Payment
        {
            UserId = "student-1",
            Purpose = "CourseCart",
            Status = PaymentStatus.Paid,
            Total = 40m,
            Currency = "JOD"
        };
        var permanentCourse = Course("permanent", "Permanent course");
        var timedCourse = Course("timed", "Timed course");
        var expiredCourse = Course("expired", "Expired course");
        var foreignCourse = Course("foreign", "Foreign course");
        var permanentEnrollment = new Enrollment
        {
            StudentUserId = "student-1",
            Course = permanentCourse,
            PaymentId = payment.Id
        };
        var timedEnrollment = new Enrollment
        {
            StudentUserId = "student-1",
            Course = timedCourse,
            AccessEndsAtUtc = DateTimeOffset.UtcNow.AddDays(10)
        };
        var expiredEnrollment = new Enrollment
        {
            StudentUserId = "student-1",
            Course = expiredCourse,
            AccessEndsAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5)
        };
        var foreignEnrollment = new Enrollment
        {
            StudentUserId = "student-2",
            Course = foreignCourse
        };
        var availableUnit = Unit("U1", "Available unit");
        var consumedUnit = Unit("U2", "Consumed unit");
        var revokedUnit = Unit("U3", "Revoked unit");
        var permanentGrant = new CourseAccessGrant
        {
            StudentUserId = "student-1",
            Course = permanentCourse,
            PaymentId = payment.Id,
            SourceType = CourseAccessGrantSource.CoursePurchase,
            SourceId = payment.Id,
            GrantedAtUtc = DateTimeOffset.UtcNow,
            ValidFromUtc = DateTimeOffset.UtcNow
        };
        db.AddRange(payment, permanentCourse, timedCourse, expiredCourse, foreignCourse, permanentEnrollment, timedEnrollment, expiredEnrollment, foreignEnrollment, permanentGrant, availableUnit, consumedUnit, revokedUnit);
        await db.SaveChangesAsync();
        db.IncludedEvaluationEntitlements.AddRange(
            new IncludedEvaluationEntitlement
            {
                StudentUserId = "student-1",
                EnrollmentId = permanentEnrollment.Id,
                UnitDefinitionId = availableUnit.Id,
                GrantedByPaymentId = payment.Id
            },
            new IncludedEvaluationEntitlement
            {
                StudentUserId = "student-1",
                EnrollmentId = permanentEnrollment.Id,
                UnitDefinitionId = consumedUnit.Id,
                GrantedByPaymentId = payment.Id,
                ConsumedByEvaluationRequestId = Guid.NewGuid(),
                ConsumedAtUtc = DateTimeOffset.UtcNow
            },
            new IncludedEvaluationEntitlement
            {
                StudentUserId = "student-1",
                EnrollmentId = permanentEnrollment.Id,
                UnitDefinitionId = revokedUnit.Id,
                GrantedByPaymentId = payment.Id,
                RevokedByRefundId = Guid.NewGuid(),
                RevokedAtUtc = DateTimeOffset.UtcNow
            },
            new IncludedEvaluationEntitlement
            {
                StudentUserId = "student-2",
                EnrollmentId = foreignEnrollment.Id,
                UnitDefinitionId = availableUnit.Id,
                GrantedByPaymentId = Guid.NewGuid()
            });
        await db.SaveChangesAsync();

        var controller = Controller(db, "student-1");
        var result = await controller.Entitlements("en", CancellationToken.None);

        var response = Assert.IsType<OkObjectResult>(result);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(response.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(2, items.GetArrayLength());
        Assert.DoesNotContain(items.EnumerateArray(), item => item.GetProperty("courseTitle").GetString() == "Expired course");
        Assert.DoesNotContain(items.EnumerateArray(), item => item.GetProperty("courseTitle").GetString() == "Foreign course");

        var permanent = Assert.Single(items.EnumerateArray(), item => item.GetProperty("courseTitle").GetString() == "Permanent course");
        Assert.Equal("Permanent", permanent.GetProperty("accessType").GetString());
        Assert.Equal("CourseCart", permanent.GetProperty("sourcePurpose").GetString());
        Assert.Equal(payment.Id.ToString(), permanent.GetProperty("sourcePaymentId").GetString());
        var credits = permanent.GetProperty("includedEvaluationCredits");
        Assert.Equal(3, credits.GetArrayLength());
        Assert.Contains(credits.EnumerateArray(), item => item.GetProperty("unitCode").GetString() == "U1" && item.GetProperty("status").GetString() == "Available");
        Assert.Contains(credits.EnumerateArray(), item => item.GetProperty("unitCode").GetString() == "U2" && item.GetProperty("status").GetString() == "Consumed");
        Assert.Contains(credits.EnumerateArray(), item => item.GetProperty("unitCode").GetString() == "U3" && item.GetProperty("status").GetString() == "Revoked");

        var timed = Assert.Single(items.EnumerateArray(), item => item.GetProperty("courseTitle").GetString() == "Timed course");
        Assert.Equal("Timed", timed.GetProperty("accessType").GetString());
        Assert.Equal("DirectEnrollment", timed.GetProperty("sourcePurpose").GetString());
        Assert.Equal(JsonValueKind.String, timed.GetProperty("accessEndsAtUtc").ValueKind);
    }

    [Fact]
    public async Task Archived_legacy_lesson_history_is_hidden_from_student_tools_and_questions()
    {
        await using var db = CreateDb();
        var course = new Course
        {
            Slug = "archived-lesson",
            ArabicTitle = "دورة",
            EnglishTitle = "Course",
            ArabicDescription = "وصف",
            EnglishDescription = "Description",
            Status = CourseStatus.Published
        };
        var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Unit", IsPublished = true };
        var archived = new Lesson
        {
            CourseModule = module,
            ArabicTitle = "قديم",
            EnglishTitle = "Historical",
            Type = LessonType.LegacyArchived,
            IsPublished = true
        };
        var regular = new Lesson
        {
            CourseModule = module,
            ArabicTitle = "نص",
            EnglishTitle = "Text",
            Type = LessonType.Text,
            IsPublished = true
        };
        db.AddRange(course, module, archived, regular,
            new Enrollment { StudentUserId = "student-1", CourseId = course.Id },
            new LessonNote { StudentUserId = "student-1", LessonId = archived.Id, Body = "Historical note" },
            new LessonBookmark { StudentUserId = "student-1", LessonId = archived.Id },
            new LessonProgress { StudentUserId = "student-1", LessonId = archived.Id, IsCompleted = true });
        await db.SaveChangesAsync();
        var context = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, "student-1"), new Claim(ClaimTypes.Role, "Student")], "Test"))
            }
        };
        var tools = new StudentLearningToolsController(db, null!, null!) { ControllerContext = context };
        var overview = Assert.IsType<OkObjectResult>(await tools.Overview("en", CancellationToken.None));
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(overview.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
        Assert.Empty(document.RootElement.GetProperty("notes").EnumerateArray());
        Assert.Empty(document.RootElement.GetProperty("bookmarks").EnumerateArray());

        var community = new CourseCommunityController(db, null!) { ControllerContext = context };
        Assert.IsType<BadRequestObjectResult>(await community.Ask(course.Id,
            new AskCourseQuestionRequest("Question", archived.Id), CancellationToken.None));
        Assert.IsType<CreatedResult>(await community.Ask(course.Id,
            new AskCourseQuestionRequest("Question", regular.Id), CancellationToken.None));
    }

    private static StudentLearningToolsController Controller(BetccoDbContext db, string studentId) => new(db, null!, null!)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, studentId)], "Test"))
            }
        }
    };

    private static async Task<JsonDocument> OverviewDocument(BetccoDbContext db)
    {
        var result = Assert.IsType<OkObjectResult>(await Controller(db, "student-1").Overview("en", CancellationToken.None));
        return JsonDocument.Parse(JsonSerializer.Serialize(result.Value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
    }

    private static EvaluationRequest Request(string studentId, EvaluationStatus status) => new()
    {
        StudentUserId = studentId,
        GradeId = Guid.NewGuid(),
        SpecializationId = Guid.NewGuid(),
        TaskTypeId = Guid.NewGuid(),
        RubricTemplateId = Guid.NewGuid(),
        Status = status,
        AssessmentScopeSnapshotJson = SnapshotJson()
    };

    private static ResitAuthorization Authorization(EvaluationRequest original, EvaluationRequest? resit = null) => new()
    {
        OriginalEvaluationRequestId = original.Id,
        ResitEvaluationRequestId = resit?.Id,
        AuthorizedByUserId = Guid.NewGuid(),
        AuthorizedAtUtc = DateTimeOffset.UtcNow,
        ActivatedAtUtc = resit is null ? null : DateTimeOffset.UtcNow,
        Reason = "Private authorization rationale"
    };

    private static string SnapshotJson()
    {
        var now = DateTimeOffset.UtcNow;
        return JsonSerializer.Serialize(new AssessmentScopeSnapshot(
            AssessmentScopeSnapshot.Version,
            new QualificationAcademicSnapshot("Q", "مؤهل", "Qualification", "V1", "source", now.AddYears(-1), null),
            new UnitAcademicSnapshot("U1", "وحدة", "Unit", "source"),
            new AssessmentDefinitionAcademicSnapshot("A1", 1, "مهمة", "Assignment", "source", now.AddMonths(-1)),
            new ScopeAcademicSnapshot(1, now.AddMonths(-1), "G", "صف", "Grade", "S", "تخصص", "Specialization"),
            [new AimAcademicSnapshot("A", "هدف", "Aim", "شرح", "Description", "source", 1)],
            [new CriterionAcademicSnapshot("A.P1", "Pass", "A", "معيار", "Criterion", "source", 1)],
            new RubricAcademicSnapshot("روبرك", "Rubric", 1, "v1", ["A.P1"])));
    }

    private static Course Course(string slug, string englishTitle) => new()
    {
        Slug = slug,
        ArabicTitle = englishTitle,
        EnglishTitle = englishTitle,
        ArabicDescription = "Description",
        EnglishDescription = "Description",
        Status = CourseStatus.Published
    };

    private static UnitDefinition Unit(string code, string title) => new()
    {
        Source = AcademicSource.AdminCustom,
        Code = code,
        ArabicTitle = title,
        EnglishTitle = title,
        SourceReference = $"test:{code}",
        IsActive = true
    };

    private static BetccoDbContext CreateDb() => new(new DbContextOptionsBuilder<BetccoDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);
}
