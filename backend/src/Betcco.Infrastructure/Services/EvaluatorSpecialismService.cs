using Betcco.Application.Common;
using Betcco.Application.Evaluations;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Betcco.Infrastructure.Services;

public sealed class EvaluatorSpecialismService(BetccoDbContext db, UserManager<ApplicationUser> users)
    : IEvaluatorSpecialismService
{
    public async Task<EvaluatorSpecialismPage> ListAsync(Guid? evaluatorUserId, int page, int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.EvaluatorUnitSpecialisms.AsNoTracking()
            .Where(x => evaluatorUserId == null || x.EvaluatorUserId == evaluatorUserId);
        var count = await query.CountAsync(cancellationToken);
        var items = await (from grant in query
                           join evaluator in db.Users.AsNoTracking() on grant.EvaluatorUserId equals evaluator.Id
                           join unit in db.UnitDefinitions.AsNoTracking() on grant.UnitDefinitionId equals unit.Id
                           orderby grant.GrantedAtUtc descending, grant.Id descending
                           select new EvaluatorSpecialismView(grant.Id, grant.EvaluatorUserId, evaluator.DisplayName,
                               unit.Id, unit.Code, unit.EnglishTitle, unit.ArabicTitle, unit.QualificationVersionId,
                               grant.GrantedAtUtc, grant.RevokedAtUtc, grant.RevokeReason))
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return new EvaluatorSpecialismPage(items, page, pageSize, count);
    }

    public async Task<IReadOnlyList<EvaluatorStaffOption>> ListStaffAsync(CancellationToken cancellationToken = default) =>
        await (from user in db.Users.AsNoTracking()
               join membership in db.UserRoles.AsNoTracking() on user.Id equals membership.UserId
               join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
               where !user.IsFrozen && (role.Name == PlatformRoles.Teacher || role.Name == PlatformRoles.Assessor)
               select new { user.Id, user.DisplayName })
            .Distinct().OrderBy(x => x.DisplayName).ThenBy(x => x.Id)
            .Take(500).Select(x => new EvaluatorStaffOption(x.Id, x.DisplayName))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<EvaluatorUnitOption>> ListUnitsAsync(CancellationToken cancellationToken = default) =>
        await db.UnitDefinitions.AsNoTracking().Where(x => x.IsActive)
            .OrderBy(x => x.Code).ThenBy(x => x.EnglishTitle)
            .Select(x => new EvaluatorUnitOption(x.Id, x.Code, x.EnglishTitle,
                x.ArabicTitle, x.QualificationVersionId,
                x.QualificationVersion!.Qualification!.Code,
                x.QualificationVersion.VersionCode))
            .Take(500).ToListAsync(cancellationToken);

    public async Task<SpecialismWriteResult> GrantAsync(Guid evaluatorUserId, Guid unitDefinitionId,
        Guid actorUserId, CancellationToken cancellationToken = default)
    {
        if (actorUserId == Guid.Empty || !await db.Users.AnyAsync(x => x.Id == actorUserId, cancellationToken))
            return SpecialismWriteResult.InvalidActor;
        var evaluator = await users.FindByIdAsync(evaluatorUserId.ToString());
        if (evaluator is null || evaluator.IsFrozen
            || !(await users.IsInRoleAsync(evaluator, PlatformRoles.Teacher)
                || await users.IsInRoleAsync(evaluator, PlatformRoles.Assessor)))
            return SpecialismWriteResult.EvaluatorNotEligible;
        if (!await db.UnitDefinitions.AnyAsync(x => x.Id == unitDefinitionId, cancellationToken))
            return SpecialismWriteResult.UnitNotFound;
        if (await db.EvaluatorUnitSpecialisms.AnyAsync(x => x.EvaluatorUserId == evaluatorUserId
            && x.UnitDefinitionId == unitDefinitionId && x.RevokedAtUtc == null, cancellationToken))
            return SpecialismWriteResult.AlreadyActive;

        var grant = new EvaluatorUnitSpecialism
        {
            EvaluatorUserId = evaluatorUserId,
            UnitDefinitionId = unitDefinitionId,
            GrantedByUserId = actorUserId,
            GrantedAtUtc = DateTimeOffset.UtcNow
        };
        db.EvaluatorUnitSpecialisms.Add(grant);
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actorUserId.ToString(),
            Action = "EvaluatorUnitSpecialismGranted",
            EntityType = nameof(EvaluatorUnitSpecialism),
            EntityId = grant.Id.ToString(),
            Outcome = "Success"
        });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return SpecialismWriteResult.Success;
        }
        catch (DbUpdateException error) when (error.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "IX_EvaluatorUnitSpecialisms_EvaluatorUserId_UnitDefinitionId"
        })
        {
            db.ChangeTracker.Clear();
            return SpecialismWriteResult.AlreadyActive;
        }
    }

    public async Task<SpecialismWriteResult> RevokeAsync(Guid grantId, Guid actorUserId, string? reason,
        CancellationToken cancellationToken = default)
    {
        if (actorUserId == Guid.Empty || !await db.Users.AnyAsync(x => x.Id == actorUserId, cancellationToken))
            return SpecialismWriteResult.InvalidActor;
        reason = reason?.Trim();
        if (reason?.Length > 500) return SpecialismWriteResult.Conflict;
        var grant = await db.EvaluatorUnitSpecialisms.SingleOrDefaultAsync(x => x.Id == grantId, cancellationToken);
        if (grant is null) return SpecialismWriteResult.GrantNotFound;
        if (grant.RevokedAtUtc is not null) return SpecialismWriteResult.AlreadyRevoked;
        grant.RevokedAtUtc = DateTimeOffset.UtcNow;
        grant.RevokedByUserId = actorUserId;
        grant.RevokeReason = reason;
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actorUserId.ToString(),
            Action = "EvaluatorUnitSpecialismRevoked",
            EntityType = nameof(EvaluatorUnitSpecialism),
            EntityId = grant.Id.ToString(),
            Outcome = "Success"
        });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return SpecialismWriteResult.Success;
        }
        catch (DbUpdateConcurrencyException)
        {
            db.ChangeTracker.Clear();
            return SpecialismWriteResult.AlreadyRevoked;
        }
    }

    public async Task<(AssignmentResult Result, IReadOnlyList<EligibleEvaluatorView> Candidates)> EligibleAsync(
        Guid evaluationRequestId, CancellationToken cancellationToken = default)
    {
        var request = await db.EvaluationRequests.AsNoTracking().SingleOrDefaultAsync(
            x => x.Id == evaluationRequestId, cancellationToken);
        if (request is null || request.Status != Betcco.Domain.Common.EvaluationStatus.PendingAssignment)
            return (AssignmentResult.RequestNotAssignable, []);
        var unitId = await ResolveUnitIdAsync(db, request, cancellationToken);
        if (unitId is null) return (AssignmentResult.AcademicMappingRequired, []);
        var candidates = await (from grant in db.EvaluatorUnitSpecialisms.AsNoTracking()
                                join user in db.Users.AsNoTracking() on grant.EvaluatorUserId equals user.Id
                                join membership in db.UserRoles.AsNoTracking() on user.Id equals membership.UserId
                                join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
                                where grant.UnitDefinitionId == unitId && grant.RevokedAtUtc == null && !user.IsFrozen
                                    && (role.Name == PlatformRoles.Teacher || role.Name == PlatformRoles.Assessor)
                                select new { user.Id, user.DisplayName })
            .Distinct().OrderBy(x => x.DisplayName).ThenBy(x => x.Id)
            .Take(500).Select(x => new EligibleEvaluatorView(x.Id, x.DisplayName))
            .ToListAsync(cancellationToken);
        return (AssignmentResult.Success, candidates);
    }

    internal static async Task<Guid?> ResolveUnitIdAsync(BetccoDbContext db, EvaluationRequest request,
        CancellationToken cancellationToken)
    {
        if (request.AssessmentScopeId is null || request.QualificationVersionId is null)
            return null;
        return await db.AssessmentScopes.AsNoTracking()
            .Where(x => x.Id == request.AssessmentScopeId
                && x.GradeId == request.GradeId
                && x.SpecializationId == request.SpecializationId
                && x.RubricTemplateId == request.RubricTemplateId
                && x.AssessmentDefinition!.UnitDefinition!.QualificationVersionId == request.QualificationVersionId)
            .Select(x => (Guid?)x.AssessmentDefinition!.UnitDefinitionId)
            .SingleOrDefaultAsync(cancellationToken);
    }
}
