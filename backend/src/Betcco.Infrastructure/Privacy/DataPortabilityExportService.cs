using System.Globalization;
using System.Text;
using System.Text.Json;
using Betcco.Application.Common;
using Betcco.Application.Privacy;
using Betcco.Domain.Common;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Privacy;

/// <summary>
/// Produces a private JSON portability artifact from the same owner-scoped
/// domains used by Access fulfillment. It never exports credentials, session
/// data, staff material, academic submissions, payments, or audit records.
/// </summary>
public sealed class DataPortabilityExportService(
    BetccoDbContext db,
    IFileStorage storage,
    IPrivacySubjectDataService subjectDataService,
    IConfiguration configuration,
    IStorageLifecycleCoordinator? storageLifecycle = null) : IDataPortabilityExportService
{
    private const string ExportFormat = "application/json";
    private const string ExportVersion = "betcco-portability-v1";

    public async Task<DataPortabilityExportResult> GenerateAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default)
    {
        var eligibility = await EligibleRequestAsync(requestId, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var existing = await ExistingAsync(requestId, cancellationToken);
        if (existing is not null) return new(existing);

        var requestedAt = DateTimeOffset.UtcNow;
        var expiresAt = requestedAt.Add(ExportLifetime());
        var data = await subjectDataService.GetSupportedDataAsync(eligibility.Request.OwnerUserId, cancellationToken);
        if (data is null)
            return await RecordGenerationFailureAsync(eligibility.Request, actorUserId, requestedAt, expiresAt, "The supported subject data is unavailable.", cancellationToken);

        string storageKey;
        StagedPrivateFile? staged = null;
        StorageLifecycleOperation? finalization = null;
        try
        {
            var content = JsonSerializer.SerializeToUtf8Bytes(new
            {
                schemaVersion = ExportVersion,
                generatedAtUtc = requestedAt,
                domains = new[] { "profile", "privacy-preferences", "legal-acceptance-history", "optional-consent-history" },
                data
            });
            await using var stream = new MemoryStream(content, writable: false);
            if (storageLifecycle is null)
            {
                storageKey = await storage.SavePrivateAsync(stream, ExportFormat, cancellationToken);
            }
            else
            {
                staged = await storage.StagePrivateAsync(stream, ExportFormat, cancellationToken);
                storageKey = staged.StorageKey;
                finalization = storageLifecycle.EnqueueFinalization(staged);
            }
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return await RecordGenerationFailureAsync(eligibility.Request, actorUserId, requestedAt, expiresAt, "Private export generation failed.", cancellationToken);
        }
        if (string.IsNullOrWhiteSpace(storageKey))
            return await RecordGenerationFailureAsync(eligibility.Request, actorUserId, requestedAt, expiresAt, "Private export storage did not return a storage key.", cancellationToken);

        var fulfillment = new DataSubjectFulfillment
        {
            DataSubjectRequestId = eligibility.Request.Id,
            RequestType = DataSubjectRequestType.Portability,
            Status = DataSubjectFulfillmentStatus.Generated,
            EvidenceJson = JsonSerializer.Serialize(new
            {
                exportFormat = ExportFormat,
                exportVersion = ExportVersion,
                domains = new[] { "profile", "privacy-preferences", "legal-acceptance-history", "optional-consent-history" },
                excluded = new[] { "credentials", "tokens", "security-data", "staff-only-data", "academic-submissions", "payments", "audit-logs", "other-users-data" },
                expiresAtUtc = expiresAt
            }),
            GeneratedAtUtc = requestedAt,
            GeneratedByUserId = actorUserId,
            CreatedByUserId = actorUserId
        };
        var export = new DataPortabilityExport
        {
            DataSubjectRequestId = eligibility.Request.Id,
            DataSubjectFulfillmentId = fulfillment.Id,
            SubjectUserId = eligibility.Request.OwnerUserId,
            Status = DataPortabilityExportStatus.Generated,
            RequestedAtUtc = requestedAt,
            RequestedByUserId = actorUserId,
            GeneratedAtUtc = requestedAt,
            GeneratedByUserId = actorUserId,
            ExportFormat = ExportFormat,
            ExportVersion = ExportVersion,
            StorageKey = storageKey,
            ExpiresAtUtc = expiresAt,
            CreatedByUserId = actorUserId
        };
        db.DataSubjectFulfillments.Add(fulfillment);
        db.DataPortabilityExports.Add(export);
        Audit("DataPortabilityExportGenerated", export, actorUserId, new { export.ExportFormat, export.ExportVersion, export.ExpiresAtUtc });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            if (staged is not null) await storageLifecycle!.DiscardStagedAsync(staged, cancellationToken);
            throw;
        }
        if (finalization is not null) await storageLifecycle!.TryProcessNowAsync(finalization.Id, cancellationToken);
        return new(export);
    }

    public async Task<DataPortabilityExportResult> ReleaseAsync(Guid requestId, string actorUserId, CancellationToken cancellationToken = default)
    {
        var eligibility = await EligibleRequestAsync(requestId, cancellationToken);
        if (eligibility.Request is null) return eligibility.ToResult();
        var export = await ExistingAsync(requestId, cancellationToken);
        if (export is null) return new(null, "PORTABILITY_EXPORT_NOT_GENERATED", "Generate the private export before releasing it.");
        if (export.Status == DataPortabilityExportStatus.Released) return new(export);
        if (export.Status != DataPortabilityExportStatus.Generated || export.DataSubjectFulfillmentId is null)
            return new(null, "PORTABILITY_EXPORT_NOT_RELEASABLE", "This portability export cannot be released.");

        var fulfillment = await db.DataSubjectFulfillments.SingleOrDefaultAsync(item => item.Id == export.DataSubjectFulfillmentId, cancellationToken);
        if (fulfillment?.Status != DataSubjectFulfillmentStatus.Generated)
            return new(null, "PORTABILITY_FULFILLMENT_INVALID", "The required portability fulfillment evidence is unavailable.");

        var releasedAt = DateTimeOffset.UtcNow;
        export.Status = DataPortabilityExportStatus.Released;
        export.ReleasedAtUtc = releasedAt;
        export.ReleasedByUserId = actorUserId;
        fulfillment.Status = DataSubjectFulfillmentStatus.Released;
        fulfillment.ReleasedAtUtc = releasedAt;
        fulfillment.ReleasedByUserId = actorUserId;
        Audit("DataPortabilityExportReleased", export, actorUserId, new { export.ExpiresAtUtc });
        await db.SaveChangesAsync(cancellationToken);
        return new(export);
    }

    public async Task<DataPortabilityDownloadResult> OpenForOwnerDownloadAsync(Guid requestId, string ownerUserId, CancellationToken cancellationToken = default)
    {
        var export = await db.DataPortabilityExports.SingleOrDefaultAsync(item =>
            item.DataSubjectRequestId == requestId && item.SubjectUserId == ownerUserId, cancellationToken);
        if (export is null) return new(null, FailureCode: "PORTABILITY_EXPORT_NOT_FOUND", FailureMessage: "The requested portability export was not found.");
        if (export.Status != DataPortabilityExportStatus.Released || export.StorageKey is null)
            return new(null, FailureCode: "PORTABILITY_EXPORT_NOT_RELEASED", FailureMessage: "The portability export is not available for download.");
        if (export.ExpiresAtUtc <= DateTimeOffset.UtcNow)
            return new(null, FailureCode: "PORTABILITY_EXPORT_EXPIRED", FailureMessage: "The private portability export has expired.");

        var content = await storage.OpenPrivateReadAsync(export.StorageKey, cancellationToken);
        if (content is null)
            return new(null, FailureCode: "PORTABILITY_EXPORT_CONTENT_UNAVAILABLE", FailureMessage: "The private portability export content is unavailable.");

        export.DownloadedAtUtc = DateTimeOffset.UtcNow;
        export.DownloadedByUserId = ownerUserId;
        export.DownloadCount++;
        Audit("DataPortabilityExportDownloaded", export, ownerUserId, new { export.DownloadCount, export.ExpiresAtUtc });
        await db.SaveChangesAsync(cancellationToken);
        return new(content, $"betcco-portability-export-{export.Id:N}.json");
    }

    private async Task<DataPortabilityExportResult> RecordGenerationFailureAsync(
        DataSubjectRequest request,
        string actorUserId,
        DateTimeOffset requestedAt,
        DateTimeOffset expiresAt,
        string reason,
        CancellationToken cancellationToken)
    {
        var export = new DataPortabilityExport
        {
            DataSubjectRequestId = request.Id,
            SubjectUserId = request.OwnerUserId,
            Status = DataPortabilityExportStatus.GenerationFailed,
            RequestedAtUtc = requestedAt,
            RequestedByUserId = actorUserId,
            ExportFormat = ExportFormat,
            ExportVersion = ExportVersion,
            ExpiresAtUtc = expiresAt,
            FailureReason = reason,
            CreatedByUserId = actorUserId
        };
        db.DataPortabilityExports.Add(export);
        Audit("DataPortabilityExportGenerationFailed", export, actorUserId, new { reason }, "Failure");
        await db.SaveChangesAsync(cancellationToken);
        return new(export, "PORTABILITY_EXPORT_GENERATION_FAILED", reason);
    }

    private async Task<EligibleRequest> EligibleRequestAsync(Guid requestId, CancellationToken cancellationToken)
    {
        var request = await db.DataSubjectRequests.SingleOrDefaultAsync(item => item.Id == requestId, cancellationToken);
        if (request is null) return new(null, "PRIVACY_REQUEST_NOT_FOUND", "The privacy request was not found.");
        if (request.RequestType != DataSubjectRequestType.Portability) return new(null, "PRIVACY_REQUEST_TYPE_INVALID", "This request is not a portability request.");
        if (request.IdentityVerifiedAtUtc is null) return new(null, "PRIVACY_IDENTITY_VERIFICATION_REQUIRED", "Verify the requester's identity before generating a portability export.");
        if (request.Status != DataSubjectRequestStatus.InReview) return new(null, "PRIVACY_REQUEST_NOT_READY", "Only an in-review portability request can be fulfilled.");
        return new(request, null, null);
    }

    private Task<DataPortabilityExport?> ExistingAsync(Guid requestId, CancellationToken cancellationToken) =>
        db.DataPortabilityExports.SingleOrDefaultAsync(item => item.DataSubjectRequestId == requestId, cancellationToken);

    private TimeSpan ExportLifetime()
    {
        var configuredHours = configuration["Privacy:PortabilityExportLifetimeHours"];
        return double.TryParse(configuredHours, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var hours) && hours is >= 1 and <= 168
            ? TimeSpan.FromHours(hours)
            : TimeSpan.FromHours(24);
    }

    private void Audit(string action, DataPortabilityExport export, string actorUserId, object metadata, string outcome = "Success") => db.AuditLogs.Add(new AuditLog
    {
        ActorUserId = actorUserId,
        Action = action,
        EntityType = nameof(DataPortabilityExport),
        EntityId = export.Id.ToString(),
        MetadataJson = JsonSerializer.Serialize(metadata),
        Outcome = outcome
    });

    private sealed record EligibleRequest(DataSubjectRequest? Request, string? FailureCode, string? FailureMessage)
    {
        public DataPortabilityExportResult ToResult() => new(null, FailureCode, FailureMessage);
    }
}
