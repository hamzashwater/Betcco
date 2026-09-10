using System.Text.Json;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Privacy;

/// <summary>
/// Evaluates one reviewed erasure/concealment request against configured policy
/// and active holds. It creates evidence only: no table data, identities,
/// financial records, or academic records are removed or transformed here.
/// </summary>
public sealed class PrivacyExecutionService(BetccoDbContext db) : IPrivacyExecutionService
{
    public async Task<PrivacyExecutionEvaluationResult> EvaluateAsync(
        EvaluatePrivacyExecutionCommand command,
        CancellationToken cancellationToken = default)
    {
        var request = await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == command.DataSubjectRequestId, cancellationToken);
        if (request is null)
            return new(null, "PRIVACY_REQUEST_NOT_FOUND", "The privacy request was not found.");
        if (request.RequestType != DataSubjectRequestType.ErasureOrConcealment)
            return new(null, "PRIVACY_REQUEST_TYPE_INVALID", "Only erasure or concealment requests can be evaluated for this workflow.");
        if (request.IdentityVerifiedAtUtc is null)
            return new(null, "PRIVACY_IDENTITY_VERIFICATION_REQUIRED", "Verify the requester's identity before evaluating privacy execution.");
        if (request.Status is DataSubjectRequestStatus.Completed or DataSubjectRequestStatus.Rejected or DataSubjectRequestStatus.Cancelled)
            return new(null, "PRIVACY_REQUEST_FINAL", "A final privacy request cannot be evaluated for execution.");

        var policy = await db.RetentionPolicies.SingleOrDefaultAsync(item => item.Id == command.RetentionPolicyId, cancellationToken);
        if (policy is null)
            return new(null, "RETENTION_POLICY_NOT_FOUND", "The retention policy was not found.");

        var job = await db.PrivacyExecutionJobs.SingleOrDefaultAsync(item =>
            item.DataSubjectRequestId == request.Id && item.RetentionPolicyId == policy.Id,
            cancellationToken);
        var created = job is null;
        if (job is null)
        {
            job = new PrivacyExecutionJob
            {
                DataSubjectRequestId = request.Id,
                SubjectUserId = request.OwnerUserId,
                RetentionPolicyId = policy.Id,
                RetentionPolicyVersion = policy.Version,
                RetentionRuleSnapshot = policy.RetentionRule,
                ActionAfterExpiry = policy.ActionAfterExpiry,
                ExecutionCategory = policy.ExecutionCategory,
                Status = PrivacyExecutionJobStatus.NotEligible,
                EligibilityReason = command.EligibilityReason,
                EvaluatedAtUtc = DateTimeOffset.UtcNow,
                EvaluatedByUserId = command.ActorUserId,
                CreatedByUserId = command.ActorUserId
            };
            db.PrivacyExecutionJobs.Add(job);
        }

        job.EvaluatedAtUtc = DateTimeOffset.UtcNow;
        job.EvaluatedByUserId = command.ActorUserId;
        job.EligibilityReason = command.EligibilityReason;
        job.FailureDetail = null;
        job.BlockingLegalHoldId = null;
        job.ExecutionCategory = policy.ExecutionCategory;

        if (!policy.IsCurrent || !policy.IsEnabled || policy.EffectiveAtUtc > job.EvaluatedAtUtc)
        {
            job.Status = PrivacyExecutionJobStatus.Failed;
            job.FailureDetail = "No active retention policy is available for this evaluation.";
        }
        else if (!command.IsEligible)
        {
            job.Status = PrivacyExecutionJobStatus.NotEligible;
        }
        else
        {
            var hold = await db.LegalHolds.AsNoTracking()
                .Where(item => item.SubjectUserId == request.OwnerUserId &&
                    item.Status == LegalHoldStatus.Active &&
                    (item.ScopePolicyKey == null || item.ScopePolicyKey == policy.PolicyKey))
                .OrderByDescending(item => item.CreatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
            if (hold is not null)
            {
                job.Status = PrivacyExecutionJobStatus.BlockedByLegalHold;
                job.BlockingLegalHoldId = hold.Id;
            }
            else
            {
                job.Status = PrivacyExecutionJobStatus.AwaitingManualExecution;
            }
        }

        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = created ? "PrivacyExecutionJobCreated" : "PrivacyExecutionJobReevaluated",
            EntityType = nameof(PrivacyExecutionJob),
            EntityId = job.Id.ToString(),
            MetadataJson = JsonSerializer.Serialize(new
            {
                job.DataSubjectRequestId,
                job.RetentionPolicyId,
                job.RetentionPolicyVersion,
                job.ActionAfterExpiry,
                job.ExecutionCategory,
                job.Status,
                legalHoldBlocked = job.BlockingLegalHoldId.HasValue
            }),
            Outcome = "Success"
        });
        await db.SaveChangesAsync(cancellationToken);
        return new(job);
    }
}
