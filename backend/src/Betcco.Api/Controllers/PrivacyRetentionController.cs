using System.Security.Claims;
using System.Text.Json;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Api.Controllers;

/// <summary>
/// Privacy-administration foundation for retention configuration, legal holds,
/// and evidence-only privacy execution. It never deletes, conceals, or
/// transforms user data.
/// </summary>
[ApiController]
[Authorize(Policy = "PrivacyAdmin")]
[Route("api/v1/privacy/admin/retention")]
public sealed class PrivacyRetentionController(
    BetccoDbContext db,
    IPrivacyExecutionService privacyExecutionService,
    IEraseConcealmentExecutionService eraseConcealmentExecutionService) : ControllerBase
{
    [HttpGet("policies/{policyKey}")]
    public async Task<IActionResult> GetActivePolicy(string policyKey, CancellationToken cancellationToken)
    {
        if (!IsPolicyKey(policyKey)) return BadRequest(new { code = "RETENTION_POLICY_KEY_INVALID", message = "Use a valid retention policy key." });
        var policy = await ActivePolicyQuery(policyKey).SingleOrDefaultAsync(cancellationToken);
        return policy is null ? NotFound() : Ok(ToView(policy));
    }

    [HttpPost("policies")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CreatePolicy(CreateRetentionPolicyRequest request, CancellationToken cancellationToken)
    {
        if (!IsPolicyKey(request.PolicyKey) ||
            !IsRequiredText(request.Version, 64) ||
            !IsRequiredText(request.DataCategoryOrPurpose, 300) ||
            !IsRequiredText(request.RetentionRule, 2_000) ||
            !IsRequiredText(request.LegalOrBusinessBasis, 2_000) ||
            !Enum.IsDefined(request.ActionAfterExpiry) ||
            request.ExecutionCategory.HasValue && !Enum.IsDefined(request.ExecutionCategory.Value))
        {
            return BadRequest(new { code = "RETENTION_POLICY_INVALID", message = "Provide a policy key, version, category or purpose, rule, basis, and action." });
        }

        var policyKey = request.PolicyKey.Trim();
        var version = request.Version.Trim();
        if (await db.RetentionPolicies.AnyAsync(policy => policy.PolicyKey == policyKey && policy.Version == version, cancellationToken))
            return Conflict(new { code = "RETENTION_POLICY_VERSION_EXISTS", message = "This retention-policy version already exists." });

        if (request.IsCurrent)
        {
            var previousCurrentPolicies = await db.RetentionPolicies
                .Where(policy => policy.PolicyKey == policyKey && policy.IsCurrent)
                .ToListAsync(cancellationToken);
            foreach (var previous in previousCurrentPolicies) previous.IsCurrent = false;
        }

        var policy = new RetentionPolicy
        {
            PolicyKey = policyKey,
            Version = version,
            DataCategoryOrPurpose = request.DataCategoryOrPurpose.Trim(),
            RetentionRule = request.RetentionRule.Trim(),
            LegalOrBusinessBasis = request.LegalOrBusinessBasis.Trim(),
            ActionAfterExpiry = request.ActionAfterExpiry,
            ExecutionCategory = request.ExecutionCategory,
            IsEnabled = request.IsEnabled,
            IsCurrent = request.IsCurrent,
            EffectiveAtUtc = request.EffectiveAtUtc,
            CreatedByUserId = UserId
        };
        db.RetentionPolicies.Add(policy);
        Audit("RetentionPolicyCreated", nameof(RetentionPolicy), policy.Id, new
        {
            policy.PolicyKey,
            policy.Version,
            policy.IsEnabled,
            policy.IsCurrent,
            policy.EffectiveAtUtc,
            policy.ActionAfterExpiry,
            policy.ExecutionCategory
        });
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetActivePolicy), new { policyKey = policy.PolicyKey }, ToView(policy));
    }

    [HttpPost("legal-holds")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> CreateLegalHold(CreateLegalHoldRequest request, CancellationToken cancellationToken)
    {
        if (!IsUserId(request.SubjectUserId) || !IsOptionalPolicyKey(request.ScopePolicyKey) || !IsRequiredText(request.Reason, 2_000))
            return BadRequest(new { code = "LEGAL_HOLD_INVALID", message = "Provide a subject, optional policy scope, and hold reason." });

        var hold = new LegalHold
        {
            SubjectUserId = request.SubjectUserId.Trim(),
            ScopePolicyKey = string.IsNullOrWhiteSpace(request.ScopePolicyKey) ? null : request.ScopePolicyKey.Trim(),
            Reason = request.Reason.Trim(),
            CreatedByUserId = UserId
        };
        db.LegalHolds.Add(hold);
        Audit("LegalHoldCreated", nameof(LegalHold), hold.Id, new { hold.SubjectUserId, hold.ScopePolicyKey, hold.Status });
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetLegalHold), new { legalHoldId = hold.Id }, ToView(hold));
    }

    [HttpGet("legal-holds/{legalHoldId:guid}")]
    public async Task<IActionResult> GetLegalHold(Guid legalHoldId, CancellationToken cancellationToken)
    {
        var hold = await db.LegalHolds.AsNoTracking().SingleOrDefaultAsync(item => item.Id == legalHoldId, cancellationToken);
        if (hold is null) return NotFound();
        Audit("LegalHoldAdminDetailRead", nameof(LegalHold), hold.Id, new
        {
            authorizationPolicy = "PrivacyAdmin",
            hold.Status,
            hasPolicyScope = hold.ScopePolicyKey is not null
        });
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToView(hold));
    }

    [HttpPost("legal-holds/{legalHoldId:guid}/release")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> ReleaseLegalHold(Guid legalHoldId, ReleaseLegalHoldRequest request, CancellationToken cancellationToken)
    {
        if (!IsRequiredText(request.ReleaseReason, 2_000))
            return BadRequest(new { code = "LEGAL_HOLD_RELEASE_REASON_REQUIRED", message = "A release reason is required." });
        var hold = await db.LegalHolds.SingleOrDefaultAsync(item => item.Id == legalHoldId, cancellationToken);
        if (hold is null) return NotFound();
        if (hold.Status != LegalHoldStatus.Active)
            return Conflict(new { code = "LEGAL_HOLD_NOT_ACTIVE", message = "Only an active legal hold can be released." });

        hold.Status = LegalHoldStatus.Released;
        hold.ReleasedAtUtc = DateTimeOffset.UtcNow;
        hold.ReleasedByUserId = UserId;
        hold.ReleaseReason = request.ReleaseReason.Trim();
        Audit("LegalHoldReleased", nameof(LegalHold), hold.Id, new { hold.SubjectUserId, hold.ScopePolicyKey, hold.Status });
        await db.SaveChangesAsync(cancellationToken);
        // Deliberately no job is run here. A privacy administrator must submit
        // a new evaluation so policy and eligibility are checked again.
        return Ok(ToView(hold));
    }

    [HttpPost("execution-jobs/evaluate")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> EvaluateExecution(EvaluatePrivacyExecutionRequest request, CancellationToken cancellationToken)
    {
        if (!IsRequiredText(request.EligibilityReason, 2_000))
            return BadRequest(new { code = "PRIVACY_EXECUTION_REASON_REQUIRED", message = "Document the reviewed eligibility decision." });

        var result = await privacyExecutionService.EvaluateAsync(new(
            request.DataSubjectRequestId,
            request.RetentionPolicyId,
            request.IsEligible,
            request.EligibilityReason.Trim(),
            UserId), cancellationToken);
        if (result.Job is null)
            return Conflict(new { code = result.FailureCode, message = result.FailureMessage });
        return Ok(ToView(result.Job));
    }

    [HttpPost("execution-jobs/{privacyExecutionJobId:guid}/execute-concealment")]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> ExecuteConcealment(Guid privacyExecutionJobId, CancellationToken cancellationToken)
    {
        var result = await eraseConcealmentExecutionService.ExecuteAsync(privacyExecutionJobId, UserId, cancellationToken);
        if (result.Fulfillment is null)
            return Conflict(new { code = result.FailureCode, message = result.FailureMessage });
        return Ok(new
        {
            job = ToView(result.Job!),
            fulfillment = new
            {
                result.Fulfillment.Id,
                result.Fulfillment.DataSubjectRequestId,
                result.Fulfillment.RequestType,
                result.Fulfillment.Status,
                result.Fulfillment.GeneratedAtUtc,
                result.Fulfillment.GeneratedByUserId
            }
        });
    }

    private IQueryable<RetentionPolicy> ActivePolicyQuery(string policyKey) => db.RetentionPolicies.AsNoTracking()
        .Where(policy => policy.PolicyKey == policyKey && policy.IsCurrent && policy.IsEnabled && policy.EffectiveAtUtc <= DateTimeOffset.UtcNow);

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private void Audit(string action, string entityType, Guid entityId, object metadata) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = UserId,
        Action = action,
        EntityType = entityType,
        EntityId = entityId.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = "Success"
    });

    private static bool IsPolicyKey(string? value) => value is { Length: > 0 and <= 100 } &&
        value.All(character => char.IsLower(character) || char.IsDigit(character) || character == '-');
    private static bool IsOptionalPolicyKey(string? value) => string.IsNullOrWhiteSpace(value) || IsPolicyKey(value.Trim());
    private static bool IsUserId(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 64;
    private static bool IsRequiredText(string? value, int maximum) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= maximum;
    private static RetentionPolicyView ToView(RetentionPolicy policy) => new(policy.Id, policy.PolicyKey, policy.Version, policy.DataCategoryOrPurpose, policy.RetentionRule, policy.LegalOrBusinessBasis, policy.ActionAfterExpiry, policy.IsEnabled, policy.IsCurrent, policy.EffectiveAtUtc, policy.ExecutionCategory);
    private static LegalHoldView ToView(LegalHold hold) => new(hold.Id, hold.SubjectUserId, hold.ScopePolicyKey, hold.Status, hold.CreatedAtUtc, hold.CreatedByUserId, hold.ReleasedAtUtc, hold.ReleasedByUserId, hold.ReleaseReason);
    private static PrivacyExecutionJobView ToView(PrivacyExecutionJob job) => new(job.Id, job.DataSubjectRequestId, job.SubjectUserId, job.RetentionPolicyId, job.RetentionPolicyVersion, job.ActionAfterExpiry, job.Status, job.EvaluatedAtUtc, job.BlockingLegalHoldId, job.FailureDetail, job.ExecutionCategory);
}

public sealed record CreateRetentionPolicyRequest(string PolicyKey, string Version, string DataCategoryOrPurpose, string RetentionRule, string LegalOrBusinessBasis, RetentionActionAfterExpiry ActionAfterExpiry, bool IsEnabled, bool IsCurrent, DateTimeOffset EffectiveAtUtc, PrivacyExecutionCategory? ExecutionCategory = null);
public sealed record RetentionPolicyView(Guid Id, string PolicyKey, string Version, string DataCategoryOrPurpose, string RetentionRule, string LegalOrBusinessBasis, RetentionActionAfterExpiry ActionAfterExpiry, bool IsEnabled, bool IsCurrent, DateTimeOffset EffectiveAtUtc, PrivacyExecutionCategory? ExecutionCategory = null);
public sealed record CreateLegalHoldRequest(string SubjectUserId, string? ScopePolicyKey, string Reason);
public sealed record ReleaseLegalHoldRequest(string ReleaseReason);
public sealed record LegalHoldView(Guid Id, string SubjectUserId, string? ScopePolicyKey, LegalHoldStatus Status, DateTimeOffset CreatedAtUtc, string? CreatedByUserId, DateTimeOffset? ReleasedAtUtc, string? ReleasedByUserId, string? ReleaseReason);
public sealed record EvaluatePrivacyExecutionRequest(Guid DataSubjectRequestId, Guid RetentionPolicyId, bool IsEligible, string EligibilityReason);
public sealed record PrivacyExecutionJobView(Guid Id, Guid DataSubjectRequestId, string SubjectUserId, Guid RetentionPolicyId, string RetentionPolicyVersion, RetentionActionAfterExpiry ActionAfterExpiry, PrivacyExecutionJobStatus Status, DateTimeOffset EvaluatedAtUtc, Guid? BlockingLegalHoldId, string? FailureDetail, PrivacyExecutionCategory? ExecutionCategory = null);
