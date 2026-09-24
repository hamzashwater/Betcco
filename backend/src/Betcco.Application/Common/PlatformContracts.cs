using Betcco.Domain.Platform;

namespace Betcco.Application.Common;

public static class PlatformRoles
{
    public const string Admin = "Admin";
    public const string Teacher = "Teacher";
    public const string Student = "Student";
    public const string Assessor = "Assessor";
    public const string InternalVerifier = "InternalVerifier";
    public const string LeadInternalVerifier = "LeadInternalVerifier";
    public const string CourseReviewer = "CourseReviewer";
    public const string FinanceAdmin = "FinanceAdmin";
    public const string SupportAdmin = "SupportAdmin";
    public const string SystemAdmin = "SystemAdmin";
}

/// <summary>
/// Stable capability names used by authorization policies. Controllers depend
/// on these permissions rather than duplicating role lists at every route.
/// </summary>
public static class PlatformPermissions
{
    public const string Learn = "learning.read";
    public const string CourseAuthor = "course.author";
    public const string Assess = "assessment.assess";
    public const string VerifyAssessments = "assessment.verify";
    public const string PlanInternalVerification = "assessment.internal-verification.plan";
    public const string ReviewAssessmentAppeals = "assessment.appeals.review";
    public const string ReviewCourses = "course.review";
    public const string ManageFinance = "finance.manage";
    public const string ManageSupport = "support.manage";
    public const string ManageUsers = "users.manage";
    public const string FreezeStudentTeacher = "users.freeze.student-teacher";
    public const string ManagePrivacy = "privacy.manage";
    public const string ManageSecurityIncidents = "security-incidents.manage";
}

public sealed record CurrentUser(string Id, string Email, IReadOnlyCollection<string> Roles)
{
    public bool IsInRole(string role) => Roles.Contains(role, StringComparer.Ordinal);
}

public interface ICurrentUserAccessor
{
    CurrentUser? User { get; }
}

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default);
}

/// <summary>
/// Capability identifiers for the guardian foundation. The relationship
/// capability grants no student information; future student-data capabilities
/// must be added deliberately and checked through IGuardianAccessAuthorizer.
/// </summary>
public static class GuardianAccessCapabilities
{
    public const string RelationshipManagement = "guardian.relationship.manage";

    public static bool IsSupported(string capability) =>
        string.Equals(capability, RelationshipManagement, StringComparison.Ordinal);
}

/// <summary>
/// Deny-by-default boundary for any future guardian-facing student resource.
/// Callers must provide the guardian, student, and explicit capability rather
/// than relying on a role or UI visibility.
/// </summary>
public interface IGuardianAccessAuthorizer
{
    Task<bool> CanAccessAsync(
        string guardianUserId,
        string studentUserId,
        string capability,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Safe boundary for non-critical platform email events. Learning and payment
/// state is committed before this adapter is invoked, so an unavailable mail
/// provider never rolls back a student's work.
/// </summary>
public interface IEmailNotificationService
{
    Task SendAsync(PlatformEmailNotification notification, CancellationToken cancellationToken = default);
}

/// <summary>
/// Dispatches the non-critical reminder events that are driven by the server
/// clock. The implementation must be idempotent because background services
/// can be restarted or run more than once.
/// </summary>
public interface IUpcomingDeadlineNotificationService
{
    Task<int> DispatchAsync(CancellationToken cancellationToken = default);
}

public sealed record PlatformEmailNotification(
    string EventName,
    string RecipientEmail,
    string Subject,
    string Heading,
    string Body);

public interface IFileStorage
{
    Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default);
    Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default);

    async Task<StagedPrivateFile> StagePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        var key = await SavePrivateAsync(content, contentType, cancellationToken);
        return new StagedPrivateFile(key, key, contentType, content.CanSeek ? content.Length : null, DateTimeOffset.UtcNow);
    }

    Task FinalizePrivateAsync(StagedPrivateFile file, CancellationToken cancellationToken = default) => Task.CompletedTask;

    async Task<bool> ExistsPrivateAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        await using var content = await OpenPrivateReadAsync(storageKey, cancellationToken);
        return content is not null;
    }

    Task DeletePrivateAsync(string storageKey, CancellationToken cancellationToken = default) => Task.CompletedTask;

    IAsyncEnumerable<StagedPrivateFile> ListStagedAsync(DateTimeOffset createdBeforeUtc, CancellationToken cancellationToken = default) =>
        EmptyStagedFiles();

    private static async IAsyncEnumerable<StagedPrivateFile> EmptyStagedFiles()
    {
        await Task.CompletedTask;
        yield break;
    }
}

public sealed record StagedPrivateFile(
    string StagingKey,
    string StorageKey,
    string ContentType,
    long? ContentLength,
    DateTimeOffset CreatedAtUtc);

public interface IStorageLifecycleCoordinator
{
    StorageLifecycleOperation EnqueueFinalization(StagedPrivateFile file);
    StorageLifecycleOperation EnqueueDeletion(string storageKey);
    Task<bool> TryProcessNowAsync(Guid operationId, CancellationToken cancellationToken = default);
    Task DiscardStagedAsync(StagedPrivateFile file, CancellationToken cancellationToken = default);
    Task<int> ProcessPendingAsync(CancellationToken cancellationToken = default);
    Task<int> CleanOrphanedStagingAsync(DateTimeOffset createdBeforeUtc, CancellationToken cancellationToken = default);
}

public enum FileScanOutcome { Clean, Rejected, Unavailable }

public sealed record FileScanResult(FileScanOutcome Outcome, string? Detail = null)
{
    public bool IsClean => Outcome == FileScanOutcome.Clean;
}

/// <summary>Scans a private upload before it can become available to a user or evaluator.</summary>
public interface IFileSecurityScanner
{
    Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default);
}

public interface IAiProvider
{
    bool IsConfigured { get; }
    Task<AiCompletion> CompleteAsync(AiPrompt prompt, CancellationToken cancellationToken = default);
}

public sealed record AiPrompt(Guid CourseId, Guid? LessonId, string Mode, string Message, IReadOnlyCollection<string> Sources);
public sealed record AiCompletion(string Text, IReadOnlyCollection<string> Citations);

public sealed record SchoolIntegrationStatus(string Provider, bool IsConfigured, bool IsReachable, string Message);

/// <summary>Boundary for school SIS/LMS integrations. No student data leaves BETCCO without an administrator-initiated action.</summary>
public interface ISchoolIntegrationProvider
{
    Task<SchoolIntegrationStatus> GetStatusAsync(bool testConnection, CancellationToken cancellationToken = default);
}

/// <summary>
/// Describes a live-class provider without coupling learning workflows to a
/// vendor SDK. BETCCO presently supports administrator-supplied HTTPS links;
/// a future provider can add managed meeting creation behind this boundary.
/// </summary>
public sealed record LiveSessionProviderInfo(
    string Id,
    string ArabicName,
    string EnglishName,
    bool SupportsManagedMeetings,
    string ArabicDescription,
    string EnglishDescription);

public sealed record LiveSessionProviderValidation(bool IsValid, string? ProviderId, string? Error);

public interface ILiveSessionProvider
{
    LiveSessionProviderInfo Info { get; }
    bool Matches(string provider);
    LiveSessionProviderValidation Validate(string? joinUrl, string? recordingUrl);
}

public interface ILiveSessionProviderCatalog
{
    IReadOnlyCollection<LiveSessionProviderInfo> List();
    LiveSessionProviderValidation Validate(string? provider, string? joinUrl, string? recordingUrl);
}
