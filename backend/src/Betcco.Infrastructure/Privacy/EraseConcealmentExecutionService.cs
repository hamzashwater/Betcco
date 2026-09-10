using System.Text.Json;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Privacy;

/// <summary>
/// Executes the only currently supported erase/concealment operation: setting
/// nullable demographic profile fields to null. It never deletes an account,
/// changes credentials, or mutates academic, financial, audit, legal, or
/// security records. Which configured policy may select this operation
/// Requires legal review.
/// </summary>
public sealed class EraseConcealmentExecutionService(
    BetccoDbContext db,
    IDataProcessingRestrictionChecker restrictionChecker) : IEraseConcealmentExecutionService
{
    public async Task<EraseConcealmentExecutionResult> ExecuteAsync(
        Guid privacyExecutionJobId,
        string actorUserId,
        CancellationToken cancellationToken = default)
    {
        var job = await db.PrivacyExecutionJobs.SingleOrDefaultAsync(item => item.Id == privacyExecutionJobId, cancellationToken);
        if (job is null) return new(null, FailureCode: "PRIVACY_EXECUTION_JOB_NOT_FOUND", FailureMessage: "The privacy execution job was not found.");

        var request = await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == job.DataSubjectRequestId, cancellationToken);
        if (request is null || request.RequestType != DataSubjectRequestType.ErasureOrConcealment)
            return new(job, FailureCode: "PRIVACY_REQUEST_TYPE_INVALID", FailureMessage: "This execution job is not for an erase or concealment request.");
        if (request.IdentityVerifiedAtUtc is null)
            return new(job, FailureCode: "PRIVACY_IDENTITY_VERIFICATION_REQUIRED", FailureMessage: "Verify the requester's identity before execution.");
        if (request.Status != DataSubjectRequestStatus.InReview)
            return new(job, FailureCode: "PRIVACY_REQUEST_NOT_READY", FailureMessage: "Only an in-review request can be executed.");

        var existingFulfillment = await db.DataSubjectFulfillments.SingleOrDefaultAsync(item => item.DataSubjectRequestId == request.Id, cancellationToken);
        if (job.Status == PrivacyExecutionJobStatus.Completed && existingFulfillment?.RequestType == DataSubjectRequestType.ErasureOrConcealment && existingFulfillment.Status == DataSubjectFulfillmentStatus.Applied)
            return new(job, existingFulfillment);
        if (job.Status != PrivacyExecutionJobStatus.AwaitingManualExecution)
            return new(job, FailureCode: "PRIVACY_EXECUTION_REEVALUATION_REQUIRED", FailureMessage: "Reevaluate the request before this operation can be executed.");
        if (existingFulfillment is not null)
            return new(job, FailureCode: "PRIVACY_FULFILLMENT_INVALID", FailureMessage: "Unexpected fulfillment evidence already exists for this request.");

        var policy = await db.RetentionPolicies.SingleOrDefaultAsync(item => item.Id == job.RetentionPolicyId, cancellationToken);
        if (policy is null || !policy.IsCurrent || !policy.IsEnabled || policy.EffectiveAtUtc > DateTimeOffset.UtcNow)
            return await BlockAsync(job, PrivacyExecutionJobStatus.Failed, null, "No active retention policy is available for execution.", actorUserId, cancellationToken);
        if (policy.ExecutionCategory != PrivacyExecutionCategory.ProfileDemographics || policy.ActionAfterExpiry != RetentionActionAfterExpiry.Conceal)
            return await BlockAsync(job, PrivacyExecutionJobStatus.NotEligible, null, "The configured action is not supported for the requested execution category.", actorUserId, cancellationToken);

        var legalHold = await db.LegalHolds.AsNoTracking()
            .Where(item => item.SubjectUserId == request.OwnerUserId && item.Status == LegalHoldStatus.Active &&
                (item.ScopePolicyKey == null || item.ScopePolicyKey == policy.PolicyKey))
            .OrderByDescending(item => item.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        if (legalHold is not null)
            return await BlockAsync(job, PrivacyExecutionJobStatus.BlockedByLegalHold, legalHold.Id, "An active legal hold blocks this configured category.", actorUserId, cancellationToken);
        if (await restrictionChecker.IsRestrictedAsync(request.OwnerUserId, policy.PolicyKey, cancellationToken))
            return await BlockAsync(job, PrivacyExecutionJobStatus.BlockedByProcessingRestriction, null, "An active processing restriction blocks this configured category.", actorUserId, cancellationToken);

        if (!Guid.TryParse(request.OwnerUserId, out var userId))
            return await BlockAsync(job, PrivacyExecutionJobStatus.Failed, null, "The subject account identifier is unavailable.", actorUserId, cancellationToken);
        var user = await db.Users.SingleOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (user is null)
            return await BlockAsync(job, PrivacyExecutionJobStatus.Failed, null, "The subject account is unavailable.", actorUserId, cancellationToken);

        // Deliberately retain ApplicationUser.Id, credentials, email, user name,
        // display name, phone data, consent history, and all related records.
        // Only these nullable demographics are a configured technical category.
        user.CountryCode = null;
        user.Gender = null;
        user.DateOfBirth = null;

        var completedAt = DateTimeOffset.UtcNow;
        var fulfillment = new DataSubjectFulfillment
        {
            DataSubjectRequestId = request.Id,
            RequestType = DataSubjectRequestType.ErasureOrConcealment,
            Status = DataSubjectFulfillmentStatus.Applied,
            EvidenceJson = JsonSerializer.Serialize(new
            {
                executionCategory = policy.ExecutionCategory.ToString(),
                configuredAction = policy.ActionAfterExpiry.ToString(),
                policyKey = policy.PolicyKey,
                policyVersion = policy.Version,
                concealedFields = new[] { "CountryCode", "Gender", "DateOfBirth" },
                retainedCategories = new[] { "account-identifier", "credentials-and-authentication", "contact-phone", "display-identity", "consent-history", "legal-acceptance-history", "academic-records", "financial-records", "audit-history", "security-history" },
                beforeValuesRecorded = false,
                completedAtUtc = completedAt,
                legalReview = "Requires legal review"
            }),
            GeneratedAtUtc = completedAt,
            GeneratedByUserId = actorUserId,
            CreatedByUserId = actorUserId
        };
        job.Status = PrivacyExecutionJobStatus.Completed;
        job.BlockingLegalHoldId = null;
        job.FailureDetail = null;
        job.EvaluatedAtUtc = completedAt;
        job.EvaluatedByUserId = actorUserId;
        db.DataSubjectFulfillments.Add(fulfillment);
        Audit("PrivacyProfileDemographicsConcealed", job, actorUserId, new
        {
            job.DataSubjectRequestId,
            job.RetentionPolicyId,
            policy.PolicyKey,
            policy.Version,
            job.ExecutionCategory,
            job.ActionAfterExpiry,
            concealedFieldCount = 3
        }, "Success");
        await db.SaveChangesAsync(cancellationToken);
        return new(job, fulfillment);
    }

    private async Task<EraseConcealmentExecutionResult> BlockAsync(
        PrivacyExecutionJob job,
        PrivacyExecutionJobStatus status,
        Guid? legalHoldId,
        string detail,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        job.Status = status;
        job.BlockingLegalHoldId = legalHoldId;
        job.FailureDetail = detail;
        job.EvaluatedAtUtc = DateTimeOffset.UtcNow;
        job.EvaluatedByUserId = actorUserId;
        Audit("PrivacyEraseConcealmentExecutionBlocked", job, actorUserId, new { job.DataSubjectRequestId, job.RetentionPolicyId, job.Status, legalHoldBlocked = legalHoldId.HasValue }, "Blocked");
        await db.SaveChangesAsync(cancellationToken);
        return new(job, FailureCode: "PRIVACY_EXECUTION_BLOCKED", FailureMessage: detail);
    }

    private void Audit(string action, PrivacyExecutionJob job, string actorUserId, object metadata, string outcome) => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = actorUserId,
        Action = action,
        EntityType = nameof(PrivacyExecutionJob),
        EntityId = job.Id.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = outcome
    });
}
