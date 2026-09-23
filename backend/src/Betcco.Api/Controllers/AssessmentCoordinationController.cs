using Betcco.Application.Evaluations;
using Betcco.Domain.Common;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "CourseReviewer")]
[Route("api/v1/assessment-coordination")]
public sealed class AssessmentCoordinationController(
    BetccoDbContext db,
    IEvaluatorSpecialismService specialisms) : ControllerBase
{
    private static readonly EvaluationStatus[] ActiveStatuses =
    [
        EvaluationStatus.PendingAssignment,
        EvaluationStatus.Assigned,
        EvaluationStatus.UnderReview,
        EvaluationStatus.NeedsRevision
    ];

    [HttpGet("queue")]
    public async Task<ActionResult<AssessmentCoordinationPage>> Queue(
        [FromQuery] string? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (page is < 1 or > 1000 || pageSize is < 1 or > 50)
            return BadRequest(new { code = "INVALID_PAGE" });

        EvaluationStatus? selectedStatus = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ActiveStatuses.FirstOrDefault(value =>
                string.Equals(value.ToString(), status, StringComparison.OrdinalIgnoreCase));
            if (!ActiveStatuses.Contains(parsed))
                return BadRequest(new { code = "INVALID_STATUS" });
            selectedStatus = parsed;
        }

        var query = db.EvaluationRequests.AsNoTracking()
            .Where(request => ActiveStatuses.Contains(request.Status));
        if (selectedStatus is not null)
            query = query.Where(request => request.Status == selectedStatus);

        var totalCount = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderByDescending(request => request.UpdatedAtUtc)
            .ThenByDescending(request => request.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(request => new
            {
                request.Id,
                request.Status,
                request.CreatedAtUtc,
                request.UpdatedAtUtc,
                request.AssessmentScopeId,
                request.QualificationVersionId,
                request.GradeId,
                request.SpecializationId,
                request.RubricTemplateId,
                request.RetakeOfEvaluationRequestId
            })
            .ToListAsync(cancellationToken);

        var requestIds = rows.Select(row => row.Id).ToArray();
        var scopeIds = rows.Where(row => row.AssessmentScopeId is not null)
            .Select(row => row.AssessmentScopeId!.Value).Distinct().ToArray();
        var academicContexts = await db.AssessmentScopes.AsNoTracking()
            .Where(scope => scopeIds.Contains(scope.Id))
            .Select(scope => new
            {
                scope.Id,
                scope.GradeId,
                scope.SpecializationId,
                scope.RubricTemplateId,
                scope.AssessmentDefinition!.UnitDefinition!.QualificationVersionId,
                QualificationCode = scope.AssessmentDefinition.UnitDefinition.QualificationVersion!.Qualification!.Code,
                QualificationVersionCode = scope.AssessmentDefinition.UnitDefinition.QualificationVersion.VersionCode,
                UnitCode = scope.AssessmentDefinition.UnitDefinition.Code,
                UnitArabicTitle = scope.AssessmentDefinition.UnitDefinition.ArabicTitle,
                UnitEnglishTitle = scope.AssessmentDefinition.UnitDefinition.EnglishTitle
            })
            .ToDictionaryAsync(scope => scope.Id, cancellationToken);
        var assignments = await db.EvaluatorAssignments.AsNoTracking()
            .Where(assignment => requestIds.Contains(assignment.EvaluationRequestId))
            .Select(assignment => new
            {
                assignment.EvaluationRequestId,
                assignment.EvaluatorUserId,
                assignment.AssignedAtUtc
            })
            .ToListAsync(cancellationToken);
        var assignmentByRequest = assignments.ToDictionary(item => item.EvaluationRequestId);
        var evaluatorIds = assignments
            .Select(item => Guid.TryParse(item.EvaluatorUserId, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToArray();
        var evaluatorNames = await db.Users.AsNoTracking()
            .Where(user => evaluatorIds.Contains(user.Id))
            .Select(user => new { user.Id, user.DisplayName })
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);

        var items = new List<AssessmentCoordinationItem>(rows.Count);
        foreach (var row in rows)
        {
            string? blocker = null;
            bool? hasEligibleEvaluator = null;
            if (row.Status == EvaluationStatus.PendingAssignment)
            {
                // Reuse the same canonical mapping and active-grant checks as
                // the existing candidate endpoint. Assignment rechecks them.
                var (result, candidates) = await specialisms.EligibleAsync(row.Id, cancellationToken);
                blocker = result switch
                {
                    AssignmentResult.AcademicMappingRequired => "AcademicMappingRequired",
                    AssignmentResult.Success when candidates.Count == 0 => "NoEligibleEvaluator",
                    AssignmentResult.RequestNotAssignable => "StateChanged",
                    _ => null
                };
                if (result == AssignmentResult.Success)
                    hasEligibleEvaluator = candidates.Count > 0;
            }

            assignmentByRequest.TryGetValue(row.Id, out var assignment);
            var evaluatorName = assignment is not null
                && Guid.TryParse(assignment.EvaluatorUserId, out var evaluatorId)
                && evaluatorNames.TryGetValue(evaluatorId, out var displayName)
                    ? displayName : null;
            var academic = row.AssessmentScopeId is Guid scopeId
                && academicContexts.TryGetValue(scopeId, out var context)
                && context.QualificationVersionId == row.QualificationVersionId
                && context.GradeId == row.GradeId
                && context.SpecializationId == row.SpecializationId
                && context.RubricTemplateId == row.RubricTemplateId
                && blocker != "AcademicMappingRequired"
                    ? context : null;
            items.Add(new AssessmentCoordinationItem(
                row.Id, row.Status.ToString(), row.CreatedAtUtc, row.UpdatedAtUtc,
                row.RetakeOfEvaluationRequestId is not null,
                academic?.QualificationCode, academic?.QualificationVersionCode,
                academic?.UnitCode, academic?.UnitArabicTitle, academic?.UnitEnglishTitle,
                evaluatorName, assignment?.AssignedAtUtc, hasEligibleEvaluator, blocker));
        }

        return Ok(new AssessmentCoordinationPage(items, page, pageSize, totalCount));
    }
}

public sealed record AssessmentCoordinationItem(
    Guid Id, string Status, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc,
    bool IsRetake, string? QualificationCode, string? QualificationVersionCode,
    string? UnitCode, string? UnitArabicTitle, string? UnitEnglishTitle,
    string? EvaluatorDisplayName, DateTimeOffset? AssignedAtUtc,
    bool? HasEligibleEvaluator, string? BlockerCode);

public sealed record AssessmentCoordinationPage(
    IReadOnlyList<AssessmentCoordinationItem> Items, int Page, int PageSize, int TotalCount);
