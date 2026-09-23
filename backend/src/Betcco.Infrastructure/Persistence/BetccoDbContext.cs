using Betcco.Domain.Commerce;
using Betcco.Domain.Assessments;
using Betcco.Domain.Common;
using Betcco.Domain.Evaluations;
using Betcco.Domain.Identity;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Persistence;

public sealed class BetccoDbContext(
    DbContextOptions<BetccoDbContext> options,
    IHttpContextAccessor? httpContextAccessor = null)
    : IdentityDbContext<ApplicationUser, Microsoft.AspNetCore.Identity.IdentityRole<Guid>, Guid>(options), IDataProtectionKeyContext
{
    private readonly IHttpContextAccessor? httpContextAccessor = httpContextAccessor;
    public DbSet<LearningTrack> LearningTracks => Set<LearningTrack>();
    public DbSet<Grade> Grades => Set<Grade>();
    public DbSet<Specialization> Specializations => Set<Specialization>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<CourseModule> CourseModules => Set<CourseModule>();
    public DbSet<BtecLearningAim> BtecLearningAims => Set<BtecLearningAim>();
    public DbSet<BtecTopic> BtecTopics => Set<BtecTopic>();
    public DbSet<BtecCriterion> BtecCriteria => Set<BtecCriterion>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<LessonResource> LessonResources => Set<LessonResource>();
    public DbSet<CourseLearningOutcome> CourseLearningOutcomes => Set<CourseLearningOutcome>();
    public DbSet<CourseSkill> CourseSkills => Set<CourseSkill>();
    public DbSet<LiveSession> LiveSessions => Set<LiveSession>();
    public DbSet<LiveSessionAttendance> LiveSessionAttendances => Set<LiveSessionAttendance>();
    public DbSet<Enrollment> Enrollments => Set<Enrollment>();
    public DbSet<ContentAccessRule> ContentAccessRules => Set<ContentAccessRule>();
    public DbSet<ContentPrerequisite> ContentPrerequisites => Set<ContentPrerequisite>();
    public DbSet<LessonProgress> LessonProgresses => Set<LessonProgress>();
    public DbSet<LessonNote> LessonNotes => Set<LessonNote>();
    public DbSet<LessonBookmark> LessonBookmarks => Set<LessonBookmark>();
    public DbSet<PersonalCalendarEntry> PersonalCalendarEntries => Set<PersonalCalendarEntry>();
    public DbSet<CourseQuestion> CourseQuestions => Set<CourseQuestion>();
    public DbSet<CourseQuestionReply> CourseQuestionReplies => Set<CourseQuestionReply>();
    public DbSet<CourseAnnouncement> CourseAnnouncements => Set<CourseAnnouncement>();
    public DbSet<CourseAnnouncementRecipient> CourseAnnouncementRecipients => Set<CourseAnnouncementRecipient>();
    public DbSet<CourseCertificate> CourseCertificates => Set<CourseCertificate>();
    public DbSet<Cart> Carts => Set<Cart>();
    public DbSet<CartItem> CartItems => Set<CartItem>();
    public DbSet<Coupon> Coupons => Set<Coupon>();
    public DbSet<CouponCourse> CouponCourses => Set<CouponCourse>();
    public DbSet<CouponRedemption> CouponRedemptions => Set<CouponRedemption>();
    public DbSet<CoursePackage> CoursePackages => Set<CoursePackage>();
    public DbSet<PackageCourse> PackageCourses => Set<PackageCourse>();
    public DbSet<MembershipPlan> MembershipPlans => Set<MembershipPlan>();
    public DbSet<MembershipPlanCourse> MembershipPlanCourses => Set<MembershipPlanCourse>();
    public DbSet<UserMembership> UserMemberships => Set<UserMembership>();
    public DbSet<CourseSubscriptionPlan> CourseSubscriptionPlans => Set<CourseSubscriptionPlan>();
    public DbSet<UserCourseSubscription> UserCourseSubscriptions => Set<UserCourseSubscription>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentStatusTransition> PaymentStatusTransitions => Set<PaymentStatusTransition>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<RefundStatusTransition> RefundStatusTransitions => Set<RefundStatusTransition>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<CreditNote> CreditNotes => Set<CreditNote>();
    public DbSet<FiscalDocumentSubmission> FiscalDocumentSubmissions => Set<FiscalDocumentSubmission>();
    public DbSet<FiscalDocumentSubmissionTransition> FiscalDocumentSubmissionTransitions => Set<FiscalDocumentSubmissionTransition>();
    public DbSet<ProviderReconciliationCase> ProviderReconciliationCases => Set<ProviderReconciliationCase>();
    public DbSet<PaymentDispute> PaymentDisputes => Set<PaymentDispute>();
    public DbSet<WebhookEvent> WebhookEvents => Set<WebhookEvent>();
    public DbSet<WalletTransaction> WalletTransactions => Set<WalletTransaction>();
    public DbSet<LedgerAccount> LedgerAccounts => Set<LedgerAccount>();
    public DbSet<LedgerTransaction> LedgerTransactions => Set<LedgerTransaction>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<CourseSaleAllocation> CourseSaleAllocations => Set<CourseSaleAllocation>();
    public DbSet<PayoutRequest> PayoutRequests => Set<PayoutRequest>();
    public DbSet<PayoutStatusTransition> PayoutStatusTransitions => Set<PayoutStatusTransition>();
    public DbSet<TaskType> TaskTypes => Set<TaskType>();
    public DbSet<RubricTemplate> RubricTemplates => Set<RubricTemplate>();
    public DbSet<Qualification> Qualifications => Set<Qualification>();
    public DbSet<QualificationVersion> QualificationVersions => Set<QualificationVersion>();
    public DbSet<UnitDefinition> UnitDefinitions => Set<UnitDefinition>();
    public DbSet<LearningAimDefinition> LearningAimDefinitions => Set<LearningAimDefinition>();
    public DbSet<AssessmentCriterionDefinition> AssessmentCriterionDefinitions => Set<AssessmentCriterionDefinition>();
    public DbSet<AssessmentDefinitionAim> AssessmentDefinitionAims => Set<AssessmentDefinitionAim>();
    public DbSet<AssessmentDefinitionCriterion> AssessmentDefinitionCriteria => Set<AssessmentDefinitionCriterion>();
    public DbSet<AssessmentDefinition> AssessmentDefinitions => Set<AssessmentDefinition>();
    public DbSet<AssessmentScope> AssessmentScopes => Set<AssessmentScope>();
    public DbSet<RubricCriterion> RubricCriteria => Set<RubricCriterion>();
    public DbSet<EvaluationRequest> EvaluationRequests => Set<EvaluationRequest>();
    public DbSet<SubmissionFile> SubmissionFiles => Set<SubmissionFile>();
    public DbSet<EvaluatorAssignment> EvaluatorAssignments => Set<EvaluatorAssignment>();
    public DbSet<EvaluatorUnitSpecialism> EvaluatorUnitSpecialisms => Set<EvaluatorUnitSpecialism>();
    public DbSet<CriterionResult> CriterionResults => Set<CriterionResult>();
    public DbSet<EvaluationEvidence> EvaluationEvidenceItems => Set<EvaluationEvidence>();
    public DbSet<EvaluationFeedback> EvaluationFeedbackItems => Set<EvaluationFeedback>();
    public DbSet<InternalVerification> InternalVerifications => Set<InternalVerification>();
    public DbSet<InternalVerificationPlan> InternalVerificationPlans => Set<InternalVerificationPlan>();
    public DbSet<InternalVerificationSample> InternalVerificationSamples => Set<InternalVerificationSample>();
    public DbSet<EvaluationAppeal> EvaluationAppeals => Set<EvaluationAppeal>();
    public DbSet<AuthenticityDeclaration> AuthenticityDeclarations => Set<AuthenticityDeclaration>();
    public DbSet<AssessmentAuditEvent> AssessmentAuditEvents => Set<AssessmentAuditEvent>();
    public DbSet<ResubmissionAuthorization> ResubmissionAuthorizations => Set<ResubmissionAuthorization>();
    public DbSet<RetakeAuthorization> RetakeAuthorizations => Set<RetakeAuthorization>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();
    public DbSet<LegalDocument> LegalDocuments => Set<LegalDocument>();
    public DbSet<LegalAcceptance> LegalAcceptances => Set<LegalAcceptance>();
    public DbSet<DataSubjectRequest> DataSubjectRequests => Set<DataSubjectRequest>();
    public DbSet<DataSubjectFulfillment> DataSubjectFulfillments => Set<DataSubjectFulfillment>();
    public DbSet<DataPortabilityExport> DataPortabilityExports => Set<DataPortabilityExport>();
    public DbSet<DataProcessingRestriction> DataProcessingRestrictions => Set<DataProcessingRestriction>();
    public DbSet<ConsentRecord> ConsentRecords => Set<ConsentRecord>();
    public DbSet<GuardianInvitation> GuardianInvitations => Set<GuardianInvitation>();
    public DbSet<GuardianRelationship> GuardianRelationships => Set<GuardianRelationship>();
    public DbSet<GuardianConsent> GuardianConsents => Set<GuardianConsent>();
    public DbSet<RetentionPolicy> RetentionPolicies => Set<RetentionPolicy>();
    public DbSet<LegalHold> LegalHolds => Set<LegalHold>();
    public DbSet<PrivacyExecutionJob> PrivacyExecutionJobs => Set<PrivacyExecutionJob>();
    public DbSet<ProcessingActivity> ProcessingActivities => Set<ProcessingActivity>();
    public DbSet<SubprocessorRecord> SubprocessorRecords => Set<SubprocessorRecord>();
    public DbSet<SubprocessorProcessingActivity> SubprocessorProcessingActivities => Set<SubprocessorProcessingActivity>();
    public DbSet<SecurityIncident> SecurityIncidents => Set<SecurityIncident>();
    public DbSet<BreachAssessment> BreachAssessments => Set<BreachAssessment>();
    public DbSet<BreachNotificationDeadline> BreachNotificationDeadlines => Set<BreachNotificationDeadline>();
    public DbSet<SupportTicket> SupportTickets => Set<SupportTicket>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<TicketMessage> TicketMessages => Set<TicketMessage>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<BlogPost> BlogPosts => Set<BlogPost>();
    public DbSet<TeacherPublicProfile> TeacherPublicProfiles => Set<TeacherPublicProfile>();
    public DbSet<PlatformRating> PlatformRatings => Set<PlatformRating>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<TeacherInvitation> TeacherInvitations => Set<TeacherInvitation>();
    public DbSet<StudentDeviceBinding> StudentDeviceBindings => Set<StudentDeviceBinding>();
    public DbSet<RegistrationEmailOutboxMessage> RegistrationEmailOutboxMessages => Set<RegistrationEmailOutboxMessage>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();
    public DbSet<StorageLifecycleOperation> StorageLifecycleOperations => Set<StorageLifecycleOperation>();
    public DbSet<Quiz> Quizzes => Set<Quiz>();
    public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();
    public DbSet<QuestionBankQuestion> QuestionBankQuestions => Set<QuestionBankQuestion>();
    public DbSet<QuizAttempt> QuizAttempts => Set<QuizAttempt>();
    public DbSet<QuizAttemptQuestionGrade> QuizAttemptQuestionGrades => Set<QuizAttemptQuestionGrade>();
    public DbSet<CourseAssignment> CourseAssignments => Set<CourseAssignment>();
    public DbSet<CourseAssignmentDeadlineExtension> CourseAssignmentDeadlineExtensions => Set<CourseAssignmentDeadlineExtension>();
    public DbSet<CourseAssignmentCriterion> CourseAssignmentCriteria => Set<CourseAssignmentCriterion>();
    public DbSet<CourseAssignmentResource> CourseAssignmentResources => Set<CourseAssignmentResource>();
    public DbSet<CourseAssignmentSubmission> CourseAssignmentSubmissions => Set<CourseAssignmentSubmission>();
    public DbSet<CourseAssignmentSubmissionVersion> CourseAssignmentSubmissionVersions => Set<CourseAssignmentSubmissionVersion>();
    public DbSet<CourseAssignmentSubmissionFile> CourseAssignmentSubmissionFiles => Set<CourseAssignmentSubmissionFile>();
    public DbSet<CourseAssignmentCriterionResult> CourseAssignmentCriterionResults => Set<CourseAssignmentCriterionResult>();
    public DbSet<CourseAssignmentFeedback> CourseAssignmentFeedbackItems => Set<CourseAssignmentFeedback>();

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnsureAssessmentAuditEventsAreAppendOnly();
        EnsureConsentRecordsAreAppendOnly();
        EnsureGuardianConsentsAreAppendOnly();
        EnsureDataSubjectFulfillmentsAreControlled();
        EnsureDataPortabilityExportsAreControlled();
        EnsureDataProcessingRestrictionsAreControlled();
        EnsureReferencedRetentionPoliciesAreImmutable();
        EnsureLegalAcceptancesAreAppendOnly();
        EnsureAcceptedLegalDocumentSnapshotsAreImmutable();
        EnsureProcessingActivitiesPreserveHistory();
        EnsureSubprocessorRecordsPreserveHistory();
        EnsureSubprocessorActivityLinksPreserveHistory();
        EnsureFinancialLedgerIsAppendOnly();
        EnsurePayoutsAreControlled();
        EnsureRefundsAreControlled();
        EnsureReconciliationCasesAreControlled();
        EnsureDisputesAreControlled();
        EnsureCommercialDocumentsAreAppendOnly();
        EnsureFiscalSubmissionsAreControlled();
        EnsureDoubleEntryLedgerIsBalancedAndAppendOnly();
        EnsurePaymentTransitionsAndFinalizedSnapshotsAreProtected();
        EnsureCartFinalizationIsControlled();
        EnsureInternalVerificationSamplesAreControlled();
        StampEntities();
        EnrichAuditLogs();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    private void EnrichAuditLogs()
    {
        var request = httpContextAccessor?.HttpContext;
        foreach (var audit in ChangeTracker.Entries<AuditLog>()
                     .Where(entry => entry.State == EntityState.Added)
                     .Select(entry => entry.Entity))
        {
            audit.CorrelationId ??= request?.TraceIdentifier;
            audit.IpAddress ??= request?.Connection.RemoteIpAddress?.ToString();
            audit.UserAgent ??= Trim(audit.UserAgent ?? request?.Request.Headers.UserAgent.ToString(), 512);
            audit.OldValuesJson = Trim(audit.OldValuesJson, 16_000);
            audit.NewValuesJson = Trim(audit.NewValuesJson, 16_000);
            audit.MetadataJson = Trim(audit.MetadataJson, 16_000);
        }
    }

    private static string? Trim(string? value, int maximum) => string.IsNullOrWhiteSpace(value)
        ? null
        : value.Trim()[..Math.Min(value.Trim().Length, maximum)];

    private void EnsureAssessmentAuditEventsAreAppendOnly()
    {
        var invalidChange = ChangeTracker.Entries<AssessmentAuditEvent>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidChange is not null)
            throw new InvalidOperationException("Assessment audit events are append-only and cannot be changed or deleted.");
    }

    private void EnsureConsentRecordsAreAppendOnly()
    {
        var invalidChange = ChangeTracker.Entries<ConsentRecord>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidChange is not null)
            throw new InvalidOperationException("Consent records are append-only and cannot be changed or deleted.");
    }

    private void EnsureDataSubjectFulfillmentsAreControlled()
    {
        foreach (var entry in ChangeTracker.Entries<DataSubjectFulfillment>()
                     .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Data-subject fulfillment evidence cannot be deleted.");

            var allowed = new HashSet<string>(StringComparer.Ordinal)
            {
                nameof(DataSubjectFulfillment.Status),
                nameof(DataSubjectFulfillment.ReleasedAtUtc),
                nameof(DataSubjectFulfillment.ReleasedByUserId)
            };
            if (entry.Properties.Any(property => property.IsModified && !allowed.Contains(property.Metadata.Name)) ||
                entry.OriginalValues.GetValue<DataSubjectFulfillmentStatus>(nameof(DataSubjectFulfillment.Status)) != DataSubjectFulfillmentStatus.Generated ||
                entry.Entity.Status != DataSubjectFulfillmentStatus.Released)
            {
                throw new InvalidOperationException("Fulfillment evidence is immutable except for the controlled access-release transition.");
            }
        }
    }

    private void EnsureDataProcessingRestrictionsAreControlled()
    {
        foreach (var entry in ChangeTracker.Entries<DataProcessingRestriction>()
                     .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Data-processing restriction evidence cannot be deleted.");

            var allowed = new HashSet<string>(StringComparer.Ordinal)
            {
                nameof(DataProcessingRestriction.Status),
                nameof(DataProcessingRestriction.ReleasedAtUtc),
                nameof(DataProcessingRestriction.ReleasedByUserId),
                nameof(DataProcessingRestriction.ReleaseReason)
            };
            if (entry.Properties.Any(property => property.IsModified && !allowed.Contains(property.Metadata.Name)) ||
                entry.OriginalValues.GetValue<DataProcessingRestrictionStatus>(nameof(DataProcessingRestriction.Status)) != DataProcessingRestrictionStatus.Active ||
                entry.Entity.Status != DataProcessingRestrictionStatus.Released)
            {
                throw new InvalidOperationException("Restriction evidence is immutable except for the controlled release transition.");
            }
        }
    }

    private void EnsureDataPortabilityExportsAreControlled()
    {
        foreach (var entry in ChangeTracker.Entries<DataPortabilityExport>()
                     .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Data-portability export evidence cannot be deleted.");

            var originalStatus = entry.OriginalValues.GetValue<DataPortabilityExportStatus>(nameof(DataPortabilityExport.Status));
            var allowed = originalStatus == DataPortabilityExportStatus.Generated
                ? new HashSet<string>(StringComparer.Ordinal)
                {
                    nameof(DataPortabilityExport.Status),
                    nameof(DataPortabilityExport.ReleasedAtUtc),
                    nameof(DataPortabilityExport.ReleasedByUserId)
                }
                : originalStatus == DataPortabilityExportStatus.Released
                    ? new HashSet<string>(StringComparer.Ordinal)
                    {
                        nameof(DataPortabilityExport.DownloadedAtUtc),
                        nameof(DataPortabilityExport.DownloadedByUserId),
                        nameof(DataPortabilityExport.DownloadCount)
                    }
                    : [];
            if (entry.Properties.Any(property => property.IsModified && !allowed.Contains(property.Metadata.Name)) ||
                (originalStatus == DataPortabilityExportStatus.Generated && entry.Entity.Status != DataPortabilityExportStatus.Released) ||
                (originalStatus == DataPortabilityExportStatus.Released && entry.Entity.Status != DataPortabilityExportStatus.Released))
            {
                throw new InvalidOperationException("Portability-export evidence is immutable except for controlled release and download recording.");
            }
        }
    }

    private void EnsureLegalAcceptancesAreAppendOnly()
    {
        var invalidChange = ChangeTracker.Entries<LegalAcceptance>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidChange is not null)
            throw new InvalidOperationException("Legal acceptances are append-only and cannot be changed or deleted.");
    }

    private void EnsureGuardianConsentsAreAppendOnly()
    {
        var invalidChange = ChangeTracker.Entries<GuardianConsent>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidChange is not null)
            throw new InvalidOperationException("Guardian consent records are append-only and cannot be changed or deleted.");
    }

    private void EnsureReferencedRetentionPoliciesAreImmutable()
    {
        var changedPolicies = ChangeTracker.Entries<RetentionPolicy>()
            .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted)
            .ToArray();
        if (changedPolicies.Length == 0) return;

        var policyIds = changedPolicies.Select(entry => entry.Entity.Id).ToArray();
        var referencedPolicyIds = PrivacyExecutionJobs.AsNoTracking()
            .Where(job => policyIds.Contains(job.RetentionPolicyId))
            .Select(job => job.RetentionPolicyId)
            .ToHashSet();
        if (referencedPolicyIds.Count == 0) return;

        foreach (var entry in changedPolicies.Where(entry => referencedPolicyIds.Contains(entry.Entity.Id)))
        {
            if (entry.State == EntityState.Deleted ||
                entry.Property(nameof(RetentionPolicy.PolicyKey)).IsModified ||
                entry.Property(nameof(RetentionPolicy.Version)).IsModified ||
                entry.Property(nameof(RetentionPolicy.DataCategoryOrPurpose)).IsModified ||
                entry.Property(nameof(RetentionPolicy.RetentionRule)).IsModified ||
                entry.Property(nameof(RetentionPolicy.LegalOrBusinessBasis)).IsModified ||
                entry.Property(nameof(RetentionPolicy.ActionAfterExpiry)).IsModified ||
                entry.Property(nameof(RetentionPolicy.ExecutionCategory)).IsModified ||
                entry.Property(nameof(RetentionPolicy.IsEnabled)).IsModified ||
                entry.Property(nameof(RetentionPolicy.EffectiveAtUtc)).IsModified)
            {
                throw new InvalidOperationException("A retention policy referenced by a privacy execution job is immutable. Create a new version instead.");
            }
        }
    }

    private void EnsureAcceptedLegalDocumentSnapshotsAreImmutable()
    {
        var changedDocuments = ChangeTracker.Entries<LegalDocument>()
            .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted)
            .ToArray();
        if (changedDocuments.Length == 0) return;

        var documentIds = changedDocuments.Select(entry => entry.Entity.Id).ToArray();
        var acceptedDocumentIds = LegalAcceptances.AsNoTracking()
            .Where(acceptance => documentIds.Contains(acceptance.LegalDocumentId))
            .Select(acceptance => acceptance.LegalDocumentId)
            .ToHashSet();
        acceptedDocumentIds.UnionWith(GuardianConsents.AsNoTracking()
            .Where(consent => consent.LegalDocumentId.HasValue && documentIds.Contains(consent.LegalDocumentId.Value))
            .Select(consent => consent.LegalDocumentId!.Value));

        foreach (var entry in changedDocuments)
        {
            if (!acceptedDocumentIds.Contains(entry.Entity.Id)) continue;
            if (entry.State == EntityState.Deleted ||
                entry.Property(nameof(LegalDocument.Slug)).IsModified ||
                entry.Property(nameof(LegalDocument.Version)).IsModified ||
                entry.Property(nameof(LegalDocument.ArabicTitle)).IsModified ||
                entry.Property(nameof(LegalDocument.EnglishTitle)).IsModified ||
                entry.Property(nameof(LegalDocument.ArabicContent)).IsModified ||
                entry.Property(nameof(LegalDocument.EnglishContent)).IsModified ||
                entry.Property(nameof(LegalDocument.EffectiveAtUtc)).IsModified ||
                entry.Property(nameof(LegalDocument.IsPublished)).IsModified ||
                entry.Property(nameof(LegalDocument.RequiresReacceptance)).IsModified)
            {
                throw new InvalidOperationException("An accepted legal-document version is immutable. Create a new version instead.");
            }
        }
    }

    private void EnsureProcessingActivitiesPreserveHistory()
    {
        foreach (var entry in ChangeTracker.Entries<ProcessingActivity>()
                     .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Processing-activity history cannot be deleted.");

            var originalStatus = entry.OriginalValues.GetValue<ProcessingActivityStatus>(nameof(ProcessingActivity.Status));
            if (originalStatus == ProcessingActivityStatus.Draft) continue;
            if (originalStatus == ProcessingActivityStatus.Archived)
                throw new InvalidOperationException("An archived processing-activity version is immutable.");

            var permittedArchiveTransition = entry.Entity.Status == ProcessingActivityStatus.Archived
                && !entry.Entity.IsCurrent
                && entry.Property(nameof(ProcessingActivity.Status)).IsModified
                && entry.Property(nameof(ProcessingActivity.IsCurrent)).IsModified
                && entry.Properties.Where(property => property.IsModified)
                    .All(property => property.Metadata.Name is nameof(ProcessingActivity.Status)
                        or nameof(ProcessingActivity.IsCurrent)
                        or nameof(ProcessingActivity.UpdatedAtUtc)
                        or nameof(ProcessingActivity.UpdatedByUserId));
            if (!permittedArchiveTransition)
                throw new InvalidOperationException("An active processing-activity version is immutable. Create a new version instead.");
        }
    }

    private void EnsureSubprocessorRecordsPreserveHistory()
    {
        foreach (var entry in ChangeTracker.Entries<SubprocessorRecord>()
                     .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Subprocessor-record history cannot be deleted.");

            var originalStatus = entry.OriginalValues.GetValue<SubprocessorRecordStatus>(nameof(SubprocessorRecord.Status));
            if (originalStatus == SubprocessorRecordStatus.Draft) continue;
            if (originalStatus == SubprocessorRecordStatus.Archived)
                throw new InvalidOperationException("An archived subprocessor-record version is immutable.");

            var changedProperties = entry.Properties.Where(property => property.IsModified)
                .Select(property => property.Metadata.Name).ToHashSet(StringComparer.Ordinal);
            var onlyTransitionFieldsChanged = changedProperties.All(name => name is nameof(SubprocessorRecord.Status)
                or nameof(SubprocessorRecord.IsCurrent)
                or nameof(SubprocessorRecord.UpdatedAtUtc)
                or nameof(SubprocessorRecord.UpdatedByUserId));
            var permittedTransition = originalStatus switch
            {
                SubprocessorRecordStatus.Active =>
                    entry.Entity.Status == SubprocessorRecordStatus.Suspended && entry.Entity.IsCurrent ||
                    entry.Entity.Status == SubprocessorRecordStatus.Archived && !entry.Entity.IsCurrent,
                SubprocessorRecordStatus.Suspended =>
                    entry.Entity.Status == SubprocessorRecordStatus.Active && entry.Entity.IsCurrent ||
                    entry.Entity.Status == SubprocessorRecordStatus.Archived && !entry.Entity.IsCurrent,
                _ => false
            };
            if (!onlyTransitionFieldsChanged || !permittedTransition)
                throw new InvalidOperationException("An active or suspended subprocessor-record version is immutable except for a permitted lifecycle transition.");
        }
    }

    private void EnsureSubprocessorActivityLinksPreserveHistory()
    {
        var changedLinks = ChangeTracker.Entries<SubprocessorProcessingActivity>()
            .Where(entry => entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToArray();
        if (changedLinks.Length == 0) return;

        var recordIds = changedLinks.Select(entry => entry.Entity.SubprocessorRecordId).Distinct().ToArray();
        var nonDraftRecordIds = SubprocessorRecords.AsNoTracking()
            .Where(record => recordIds.Contains(record.Id) && record.Status != SubprocessorRecordStatus.Draft)
            .Select(record => record.Id)
            .ToHashSet();
        if (nonDraftRecordIds.Count > 0)
            throw new InvalidOperationException("Processing-activity links are immutable once a subprocessor-record version is active, suspended, or archived.");
    }

    private void EnsureFinancialLedgerIsAppendOnly()
    {
        var invalidTransaction = ChangeTracker.Entries<WalletTransaction>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidTransaction is not null)
            throw new InvalidOperationException("Wallet ledger entries are append-only and cannot be changed or deleted.");

        var invalidAllocation = ChangeTracker.Entries<CourseSaleAllocation>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidAllocation is not null)
            throw new InvalidOperationException("Course sale allocations are append-only and cannot be changed or deleted.");
    }

    private void EnsurePayoutsAreControlled()
    {
        var invalidTransition = ChangeTracker.Entries<PayoutStatusTransition>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidTransition is not null)
            throw new InvalidOperationException("Payout transition history is append-only and cannot be changed or deleted.");

        var addedAuditLogs = ChangeTracker.Entries<AuditLog>().Where(entry => entry.State == EntityState.Added).Select(entry => entry.Entity).ToArray();

        foreach (var entry in ChangeTracker.Entries<PayoutRequest>().Where(entry => entry.State == EntityState.Modified))
        {
            var status = entry.Property(request => request.Status);
            if (status.IsModified)
            {
                var previousStatus = status.OriginalValue;
                var newStatus = status.CurrentValue;
                var hasTransitionEvidence = ChangeTracker.Entries<PayoutStatusTransition>().Any(transition =>
                    transition.State == EntityState.Added
                    && transition.Entity.PayoutRequestId == entry.Entity.Id
                    && transition.Entity.PreviousStatus == previousStatus
                    && transition.Entity.NewStatus == newStatus);
                if (!PayoutWorkflow.CanTransition(previousStatus, newStatus) || !hasTransitionEvidence)
                    throw new InvalidOperationException("Payout status changes require an allowed server-controlled transition with append-only evidence.");

                var expectedAudit = newStatus switch
                {
                    PayoutStatus.Approved => "TeacherPayoutApproved",
                    PayoutStatus.Rejected => "TeacherPayoutRejected",
                    PayoutStatus.Processing => "TeacherPayoutExecutionInitiated",
                    PayoutStatus.Paid => "TeacherPayoutProviderConfirmed",
                    PayoutStatus.Failed => "TeacherPayoutExecutionFailed",
                    PayoutStatus.ProviderResultUnknown => "TeacherPayoutProviderResultUnknown",
                    PayoutStatus.Settled => "TeacherPayoutInternallySettled",
                    _ => throw new InvalidOperationException("Unsupported payout transition.")
                };
                if (!addedAuditLogs.Any(audit => audit.Action == expectedAudit && audit.EntityType == nameof(PayoutRequest) && audit.EntityId == entry.Entity.Id.ToString()))
                    throw new InvalidOperationException("Payout status changes require audit evidence.");
            }

            var protectedProperties = new[]
            {
                nameof(PayoutRequest.Amount),
                nameof(PayoutRequest.Currency),
                nameof(PayoutRequest.Method),
                nameof(PayoutRequest.DestinationEncrypted),
                nameof(PayoutRequest.DestinationMasked),
                nameof(PayoutRequest.IdempotencyKey),
                nameof(PayoutRequest.TeacherUserId)
            };
            if (protectedProperties.Any(property => entry.Property(property).IsModified))
                throw new InvalidOperationException("Payout request financial and destination evidence cannot be rewritten.");

            if (!status.IsModified && entry.Properties.Any(property => property.IsModified && property.Metadata.Name is not nameof(PayoutRequest.UpdatedAtUtc) and not nameof(PayoutRequest.UpdatedByUserId)))
                throw new InvalidOperationException("Payout execution evidence may only change through a controlled status transition.");
        }
    }

    private void EnsureRefundsAreControlled()
    {
        var invalidTransition = ChangeTracker.Entries<RefundStatusTransition>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidTransition is not null)
            throw new InvalidOperationException("Refund status history is append-only and cannot be changed or deleted.");

        foreach (var entry in ChangeTracker.Entries<Refund>().Where(entry => entry.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Refund records cannot be deleted.");
            var allowed = new HashSet<string>(StringComparer.Ordinal)
            {
                nameof(Refund.Status), nameof(Refund.ProviderRefundReference), nameof(Refund.ProviderName), nameof(Refund.ProviderStatusCode),
                nameof(Refund.ProviderFailureCode), nameof(Refund.ProviderInitiatedAtUtc), nameof(Refund.ProviderVerifiedAtUtc),
                nameof(Refund.ProviderResultUnknownAtUtc), nameof(Refund.FailureCode), nameof(Refund.InternallyRecordedByUserId),
                nameof(Refund.InternallyRecordedAtUtc), nameof(Refund.UpdatedAtUtc), nameof(Refund.UpdatedByUserId)
            };
            if (entry.Properties.Any(property => property.IsModified && !allowed.Contains(property.Metadata.Name)))
                throw new InvalidOperationException("Refund evidence cannot be rewritten.");

            var status = entry.Property(refund => refund.Status);
            if (status.IsModified && (!RefundWorkflow.CanTransition(status.OriginalValue, status.CurrentValue) ||
                !ChangeTracker.Entries<RefundStatusTransition>().Any(transition => transition.State == EntityState.Added && transition.Entity.RefundId == entry.Entity.Id && transition.Entity.PreviousStatus == status.OriginalValue && transition.Entity.NewStatus == status.CurrentValue)))
                throw new InvalidOperationException("Refund state changes require an allowed server-controlled transition with append-only evidence.");
        }
    }

    private void EnsureReconciliationCasesAreControlled()
    {
        foreach (var entry in ChangeTracker.Entries<ProviderReconciliationCase>().Where(x => x.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted) throw new InvalidOperationException("Reconciliation cases cannot be deleted.");
            var allowed = new HashSet<string>(StringComparer.Ordinal) { nameof(ProviderReconciliationCase.Status), nameof(ProviderReconciliationCase.ResolutionCode), nameof(ProviderReconciliationCase.ResolutionNote), nameof(ProviderReconciliationCase.ResolvedByUserId), nameof(ProviderReconciliationCase.ResolvedAtUtc), nameof(ProviderReconciliationCase.UpdatedAtUtc), nameof(ProviderReconciliationCase.UpdatedByUserId) };
            if (entry.Properties.Any(p => p.IsModified && !allowed.Contains(p.Metadata.Name))) throw new InvalidOperationException("Reconciliation evidence cannot be rewritten.");
            if (entry.OriginalValues.GetValue<ProviderReconciliationCaseStatus>(nameof(ProviderReconciliationCase.Status)) == ProviderReconciliationCaseStatus.Resolved) throw new InvalidOperationException("Resolved reconciliation cases cannot be rewritten.");
        }
    }
    private void EnsureDisputesAreControlled()
    {
        var addedAuditLogs = ChangeTracker.Entries<AuditLog>().Where(entry => entry.State == EntityState.Added).Select(entry => entry.Entity).ToArray();
        foreach (var dispute in ChangeTracker.Entries<PaymentDispute>().Where(entry => entry.State == EntityState.Added))
        {
            if (!addedAuditLogs.Any(audit => audit.Action == "PaymentDisputeOpened" && audit.EntityType == nameof(PaymentDispute) && audit.EntityId == dispute.Entity.Id.ToString()))
                throw new InvalidOperationException("Dispute creation requires audit evidence.");
        }

        foreach (var entry in ChangeTracker.Entries<PaymentDispute>().Where(x => x.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted) throw new InvalidOperationException("Dispute evidence cannot be deleted.");
            var allowed = new[] { nameof(PaymentDispute.Status), nameof(PaymentDispute.ResolutionCode), nameof(PaymentDispute.ResolutionNote), nameof(PaymentDispute.ResolvedByUserId), nameof(PaymentDispute.ResolvedAtUtc), nameof(PaymentDispute.UpdatedAtUtc), nameof(PaymentDispute.UpdatedByUserId) };
            if (entry.Properties.Any(p => p.IsModified && !allowed.Contains(p.Metadata.Name)) || entry.OriginalValues.GetValue<PaymentDisputeStatus>(nameof(PaymentDispute.Status)) == PaymentDisputeStatus.Resolved) throw new InvalidOperationException("Dispute evidence cannot be rewritten.");

            var resolutionChanged = entry.Property(x => x.ResolutionCode).IsModified
                || entry.Property(x => x.ResolutionNote).IsModified
                || entry.Property(x => x.ResolvedByUserId).IsModified
                || entry.Property(x => x.ResolvedAtUtc).IsModified;
            if (entry.Property(x => x.Status).IsModified)
            {
                var transition = (entry.OriginalValues.GetValue<PaymentDisputeStatus>(nameof(PaymentDispute.Status)), entry.Entity.Status);
                if (transition is not (PaymentDisputeStatus.Open, PaymentDisputeStatus.UnderReview)
                    and not (PaymentDisputeStatus.UnderReview, PaymentDisputeStatus.Resolved))
                    throw new InvalidOperationException("Dispute status changes must follow the controlled Open, UnderReview, Resolved lifecycle.");

                var expectedAudit = transition.Item2 == PaymentDisputeStatus.UnderReview ? "PaymentDisputeMovedToReview" : "PaymentDisputeResolved";
                if (!addedAuditLogs.Any(audit => audit.Action == expectedAudit && audit.EntityType == nameof(PaymentDispute) && audit.EntityId == entry.Entity.Id.ToString()))
                    throw new InvalidOperationException("Dispute status changes require audit evidence.");

                if (transition.Item2 == PaymentDisputeStatus.Resolved && (string.IsNullOrWhiteSpace(entry.Entity.ResolutionCode) || string.IsNullOrWhiteSpace(entry.Entity.ResolvedByUserId) || entry.Entity.ResolvedAtUtc is null))
                    throw new InvalidOperationException("Resolved disputes require controlled resolution evidence.");
            }
            else if (resolutionChanged) throw new InvalidOperationException("Dispute resolution evidence may only be set while resolving a dispute.");
        }
    }

    private void EnsureCommercialDocumentsAreAppendOnly()
    {
        if (ChangeTracker.Entries<Invoice>().Any(entry => entry.State is EntityState.Modified or EntityState.Deleted)
            || ChangeTracker.Entries<CreditNote>().Any(entry => entry.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Issued commercial documents are append-only and cannot be changed or deleted.");

        if (ChangeTracker.Entries<InvoiceLine>().Any(entry => entry.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Invoice-line snapshots are append-only and cannot be changed or deleted.");
    }

    private void EnsureFiscalSubmissionsAreControlled()
    {
        if (ChangeTracker.Entries<FiscalDocumentSubmissionTransition>().Any(entry => entry.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Fiscal submission transition history is append-only and cannot be changed or deleted.");

        foreach (var entry in ChangeTracker.Entries<FiscalDocumentSubmission>().Where(entry => entry.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Fiscal submission evidence cannot be deleted.");
            var allowed = new HashSet<string>(StringComparer.Ordinal)
            {
                nameof(FiscalDocumentSubmission.Status), nameof(FiscalDocumentSubmission.ConfirmedAtUtc), nameof(FiscalDocumentSubmission.ProviderReference),
                nameof(FiscalDocumentSubmission.ProviderStatusCode), nameof(FiscalDocumentSubmission.FailureCode), nameof(FiscalDocumentSubmission.UpdatedAtUtc), nameof(FiscalDocumentSubmission.UpdatedByUserId)
            };
            if (entry.Properties.Any(property => property.IsModified && !allowed.Contains(property.Metadata.Name)))
                throw new InvalidOperationException("Fiscal submission evidence cannot be rewritten.");
            var status = entry.Property(submission => submission.Status);
            if (status.IsModified && !ChangeTracker.Entries<FiscalDocumentSubmissionTransition>().Any(transition => transition.State == EntityState.Added && transition.Entity.FiscalDocumentSubmissionId == entry.Entity.Id && transition.Entity.PreviousStatus == status.OriginalValue && transition.Entity.NewStatus == status.CurrentValue))
                throw new InvalidOperationException("Fiscal submission state changes require append-only transition evidence.");
        }
    }

    private void EnsureDoubleEntryLedgerIsBalancedAndAppendOnly()
    {
        var invalidAccount = ChangeTracker.Entries<LedgerAccount>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidAccount is not null)
            throw new InvalidOperationException("Ledger accounts are append-only and cannot be changed or deleted.");

        var invalidTransaction = ChangeTracker.Entries<LedgerTransaction>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidTransaction is not null)
            throw new InvalidOperationException("Ledger transactions are append-only and cannot be changed or deleted.");

        var invalidEntry = ChangeTracker.Entries<LedgerEntry>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidEntry is not null)
            throw new InvalidOperationException("Ledger entries are append-only and cannot be changed or deleted.");

        var addedTransactions = ChangeTracker.Entries<LedgerTransaction>()
            .Where(entry => entry.State == EntityState.Added)
            .Select(entry => entry.Entity)
            .ToArray();
        var addedTransactionIds = addedTransactions.Select(transaction => transaction.Id).ToHashSet();
        var addedEntries = ChangeTracker.Entries<LedgerEntry>()
            .Where(entry => entry.State == EntityState.Added)
            .Select(entry => entry.Entity)
            .ToArray();
        if (addedEntries.Any(entry => !addedTransactionIds.Contains(entry.LedgerTransactionId)))
            throw new InvalidOperationException("Ledger entries may only be created with a new ledger transaction.");

        var accountCurrencies = ChangeTracker.Entries<LedgerAccount>()
            .Where(entry => entry.State == EntityState.Added)
            .ToDictionary(entry => entry.Entity.Id, entry => entry.Entity.Currency);
        var accountIds = addedEntries.Select(entry => entry.LedgerAccountId).Where(id => !accountCurrencies.ContainsKey(id)).Distinct().ToArray();
        if (accountIds.Length > 0)
        {
            foreach (var account in LedgerAccounts.AsNoTracking().Where(account => accountIds.Contains(account.Id)).Select(account => new { account.Id, account.Currency }))
                accountCurrencies[account.Id] = account.Currency;
        }

        foreach (var transaction in addedTransactions)
        {
            var entries = addedEntries.Where(entry => entry.LedgerTransactionId == transaction.Id).ToArray();
            if (entries.Length < 2
                || !entries.Any(entry => entry.Side == LedgerEntrySide.Debit)
                || !entries.Any(entry => entry.Side == LedgerEntrySide.Credit)
                || entries.Any(entry => !Enum.IsDefined(entry.Side) || entry.Amount <= 0m || !string.Equals(entry.Currency, transaction.Currency, StringComparison.OrdinalIgnoreCase))
                || entries.Any(entry => !accountCurrencies.TryGetValue(entry.LedgerAccountId, out var currency) || !string.Equals(currency, transaction.Currency, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException("A ledger transaction must contain positive debit and credit entries in its account currency.");

            var debitTotal = entries.Where(entry => entry.Side == LedgerEntrySide.Debit).Sum(entry => entry.Amount);
            var creditTotal = entries.Where(entry => entry.Side == LedgerEntrySide.Credit).Sum(entry => entry.Amount);
            if (debitTotal != creditTotal)
                throw new InvalidOperationException("A ledger transaction must balance exactly: total debits must equal total credits.");
        }
    }

    private void EnsurePaymentTransitionsAndFinalizedSnapshotsAreProtected()
    {
        var invalidTransition = ChangeTracker.Entries<PaymentStatusTransition>()
            .FirstOrDefault(entry => entry.State is EntityState.Modified or EntityState.Deleted);
        if (invalidTransition is not null)
            throw new InvalidOperationException("Payment transition history is append-only and cannot be changed or deleted.");

        foreach (var entry in ChangeTracker.Entries<Payment>().Where(entry => entry.State == EntityState.Modified))
        {
            var status = entry.Property(payment => payment.Status);
            if (status.IsModified)
            {
                var previousStatus = status.OriginalValue;
                var newStatus = status.CurrentValue;
                var hasTransitionEvidence = ChangeTracker.Entries<PaymentStatusTransition>().Any(transition =>
                    transition.State == EntityState.Added
                    && transition.Entity.PaymentId == entry.Entity.Id
                    && transition.Entity.PreviousStatus == previousStatus
                    && transition.Entity.NewStatus == newStatus);

                if (!PaymentWorkflow.CanTransition(previousStatus, newStatus) || !hasTransitionEvidence)
                    throw new InvalidOperationException("Payment status changes require an allowed server-controlled transition with append-only evidence.");
            }

            if (entry.OriginalValues.GetValue<PaymentStatus>(nameof(Payment.Status)) != PaymentStatus.Paid)
                continue;

            var protectedProperties = new[]
            {
                nameof(Payment.Subtotal),
                nameof(Payment.Discount),
                nameof(Payment.Tax),
                nameof(Payment.Total),
                nameof(Payment.Currency),
                nameof(Payment.Provider),
                nameof(Payment.ProviderPaymentId),
                nameof(Payment.CouponId),
                nameof(Payment.CouponCode),
                nameof(Payment.PaidAtUtc)
            };
            if (protectedProperties.Any(property => entry.Property(property).IsModified))
                throw new InvalidOperationException("A finalized payment's trusted financial snapshot cannot be changed.");
        }
    }

    private void EnsureCartFinalizationIsControlled()
    {
        foreach (var entry in ChangeTracker.Entries<Cart>().Where(entry => entry.State == EntityState.Modified))
        {
            var status = entry.Property(cart => cart.Status);
            if (status.IsModified
                && (status.OriginalValue != CartStatus.Open
                    || status.CurrentValue != CartStatus.Closed
                    || entry.Entity.ClosedAtUtc is null
                    || entry.Entity.ClosedByPaymentId is null))
                throw new InvalidOperationException("A cart can only be closed once by trusted payment finalization.");

            if (status.OriginalValue != CartStatus.Closed) continue;
            var protectedProperties = new[]
            {
                nameof(Cart.OwnerKey),
                nameof(Cart.UserId),
                nameof(Cart.Currency),
                nameof(Cart.Status),
                nameof(Cart.ClosedAtUtc),
                nameof(Cart.ClosedByPaymentId)
            };
            if (protectedProperties.Any(property => entry.Property(property).IsModified))
                throw new InvalidOperationException("A closed cart cannot be changed or reopened.");
        }
    }

    private void EnsureInternalVerificationSamplesAreControlled()
    {
        var deletedSample = ChangeTracker.Entries<InternalVerificationSample>()
            .FirstOrDefault(entry => entry.State == EntityState.Deleted);
        if (deletedSample is not null)
            throw new InvalidOperationException("Internal verification samples cannot be deleted once selected.");

        foreach (var entry in ChangeTracker.Entries<InternalVerificationSample>().Where(entry => entry.State == EntityState.Modified))
        {
            var originalStatus = entry.OriginalValues.GetValue<InternalVerificationSampleStatus>(nameof(InternalVerificationSample.Status));
            var currentStatus = entry.CurrentValues.GetValue<InternalVerificationSampleStatus>(nameof(InternalVerificationSample.Status));
            var changedProperties = entry.Properties.Where(property => property.IsModified).Select(property => property.Metadata.Name).ToHashSet(StringComparer.Ordinal);
            var allowedProperties = new HashSet<string>(StringComparer.Ordinal)
            {
                nameof(InternalVerificationSample.Status),
                nameof(InternalVerificationSample.DecisionComment),
                nameof(InternalVerificationSample.DecidedAtUtc),
                "UpdatedAtUtc"
            };
            if (originalStatus != InternalVerificationSampleStatus.Pending
                || currentStatus == InternalVerificationSampleStatus.Pending
                || changedProperties.Except(allowedProperties).Any())
                throw new InvalidOperationException("An internal verification sample can only record one final decision.");
        }
    }

    private void StampEntities()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries().Where(entry => entry.Entity is Betcco.Domain.Common.Entity))
        {
            var entity = (Betcco.Domain.Common.Entity)entry.Entity;
            if (entry.State == EntityState.Added) entity.CreatedAtUtc = now;
            if (entry.State is EntityState.Added or EntityState.Modified) entity.UpdatedAtUtc = now;
        }
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<LearningTrack>().HasIndex(x => x.Slug).IsUnique();
        builder.Entity<Grade>().HasIndex(x => new { x.LearningTrackId, x.Slug }).IsUnique();
        builder.Entity<Specialization>().HasIndex(x => new { x.LearningTrackId, x.Slug }).IsUnique();
        builder.Entity<Subject>().HasIndex(x => x.Slug).IsUnique();
        builder.Entity<Course>().HasIndex(x => x.Slug).IsUnique();
        builder.Entity<Course>().HasIndex(x => new { x.Status, x.PublishedAtUtc });
        builder.Entity<Course>().HasIndex(x => new { x.Status, x.ScheduledPublishAtUtc });
        builder.Entity<CourseModule>().HasIndex(x => new { x.CourseId, x.SortOrder });
        builder.Entity<CourseModule>().HasIndex(x => new { x.CourseId, x.UnitCode }).IsUnique().HasFilter("\"UnitCode\" IS NOT NULL");
        builder.Entity<BtecLearningAim>().HasIndex(x => new { x.CourseModuleId, x.Code }).IsUnique();
        builder.Entity<BtecLearningAim>().HasIndex(x => new { x.CourseModuleId, x.SortOrder });
        builder.Entity<BtecTopic>().HasIndex(x => new { x.BtecLearningAimId, x.SortOrder });
        builder.Entity<BtecCriterion>().HasIndex(x => new { x.CourseModuleId, x.Code }).IsUnique();
        builder.Entity<BtecCriterion>().HasIndex(x => new { x.BtecLearningAimId, x.SortOrder });
        builder.Entity<Enrollment>().HasIndex(x => new { x.StudentUserId, x.CourseId }).IsUnique();
        builder.Entity<Enrollment>().HasIndex(x => new { x.StudentUserId, x.AccessEndsAtUtc });
        builder.Entity<ContentAccessRule>().HasIndex(x => new { x.CourseId, x.TargetType, x.TargetId }).IsUnique();
        builder.Entity<ContentAccessRule>().HasIndex(x => new { x.CourseId, x.ReleaseMode });
        builder.Entity<ContentPrerequisite>().HasIndex(x => new { x.CourseId, x.TargetType, x.TargetId });
        builder.Entity<ContentPrerequisite>().HasIndex(x => new { x.TargetType, x.TargetId, x.RequiredContentType, x.RequiredContentId }).IsUnique();
        builder.Entity<LessonProgress>().HasIndex(x => new { x.StudentUserId, x.LessonId }).IsUnique();
        builder.Entity<LessonBookmark>().HasIndex(x => new { x.StudentUserId, x.LessonId }).IsUnique();
        builder.Entity<LessonNote>().HasIndex(x => new { x.StudentUserId, x.LessonId }).IsUnique();
        builder.Entity<PersonalCalendarEntry>().HasIndex(x => new { x.StudentUserId, x.StartsAtUtc });
        builder.Entity<CourseQuestion>().HasIndex(x => new { x.CourseId, x.CreatedAtUtc });
        builder.Entity<CourseQuestionReply>().HasIndex(x => new { x.CourseQuestionId, x.CreatedAtUtc });
        builder.Entity<CourseAnnouncement>().HasIndex(x => new { x.CourseId, x.IsPublished, x.PublishedAtUtc });
        builder.Entity<CourseAnnouncement>().HasIndex(x => new { x.CourseModuleId, x.PublishedAtUtc });
        builder.Entity<CourseAnnouncementRecipient>().HasIndex(x => new { x.CourseAnnouncementId, x.StudentUserId }).IsUnique();
        builder.Entity<CourseCertificate>().HasIndex(x => new { x.StudentUserId, x.CourseId }).IsUnique();
        builder.Entity<CourseCertificate>().HasIndex(x => x.VerificationCode).IsUnique();
        builder.Entity<Cart>().HasIndex(x => x.OwnerKey).IsUnique();
        builder.Entity<CartItem>().HasIndex(x => new { x.CartId, x.ItemType, x.ReferenceId }).IsUnique();
        builder.Entity<Coupon>().HasIndex(x => x.Code).IsUnique();
        builder.Entity<CouponCourse>().HasIndex(x => new { x.CouponId, x.CourseId }).IsUnique();
        builder.Entity<CouponRedemption>().HasIndex(x => x.PaymentId).IsUnique();
        builder.Entity<CouponRedemption>().HasIndex(x => new { x.CouponId, x.UserId, x.CreatedAtUtc });
        builder.Entity<CoursePackage>().HasIndex(x => x.Slug).IsUnique();
        builder.Entity<CoursePackage>().HasIndex(x => new { x.IsPublished, x.AvailableFromUtc, x.AvailableUntilUtc });
        builder.Entity<AuditLog>().HasIndex(x => new { x.CreatedAtUtc, x.Action });
        builder.Entity<PackageCourse>().HasIndex(x => new { x.CoursePackageId, x.CourseId }).IsUnique();
        builder.Entity<MembershipPlan>().HasIndex(x => x.Slug).IsUnique();
        builder.Entity<MembershipPlanCourse>().HasIndex(x => new { x.MembershipPlanId, x.CourseId }).IsUnique();
        builder.Entity<UserMembership>().HasIndex(x => new { x.StudentUserId, x.EndsAtUtc, x.Status });
        builder.Entity<UserMembership>().HasIndex(x => x.PaymentId).IsUnique();
        builder.Entity<CourseSubscriptionPlan>().HasIndex(x => new { x.CourseId, x.Interval }).IsUnique();
        builder.Entity<UserCourseSubscription>().HasIndex(x => new { x.StudentUserId, x.EndsAtUtc, x.Status });
        builder.Entity<UserCourseSubscription>().HasIndex(x => x.PaymentId).IsUnique();
        builder.Entity<BlogPost>().HasIndex(x => x.Slug).IsUnique();
        builder.Entity<BlogPost>().HasIndex(x => new { x.IsPublished, x.PublishedAtUtc });
        builder.Entity<TeacherPublicProfile>().HasIndex(x => x.TeacherUserId).IsUnique();
        builder.Entity<PlatformRating>().HasIndex(x => x.StudentUserId).IsUnique();
        builder.Entity<PlatformRating>().HasIndex(x => new { x.IsPublished, x.AllowPublicDisplay, x.UpdatedAtUtc });
        builder.Entity<LiveSession>().HasIndex(x => new { x.IsPublished, x.StartsAtUtc });
        builder.Entity<LiveSessionAttendance>().HasIndex(x => new { x.LiveSessionId, x.StudentUserId }).IsUnique();
        builder.Entity<Payment>().HasIndex(x => x.IdempotencyKey).IsUnique().HasFilter("\"IdempotencyKey\" IS NOT NULL");
        builder.Entity<Payment>().HasIndex(x => new { x.Provider, x.ProviderPaymentId }).IsUnique().HasFilter("\"ProviderPaymentId\" IS NOT NULL");
        builder.Entity<Payment>().Property(x => x.ProviderSessionStatus).IsConcurrencyToken();
        builder.Entity<Payment>().Property(x => x.ProviderSessionFailureCode).HasMaxLength(100);
        builder.Entity<Payment>().HasIndex(x => new { x.ProviderSessionStatus, x.ProviderSessionAttemptedAtUtc });
        builder.Entity<Payment>().HasOne(x => x.Coupon).WithMany().HasForeignKey(x => x.CouponId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Payment>().HasIndex(x => x.CouponId);
        builder.Entity<Payment>().HasIndex(x => x.ActiveCartId).HasDatabaseName("IX_Payments_ActiveCourseCartReference").IsUnique().HasFilter("\"Purpose\" = 'CourseCart' AND \"Status\" = 1 AND \"ActiveCartId\" IS NOT NULL");
        builder.Entity<PaymentStatusTransition>().HasOne(x => x.Payment).WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PaymentStatusTransition>().HasIndex(x => x.PaymentId);
        builder.Entity<PaymentStatusTransition>().HasIndex(x => new { x.PaymentId, x.ProviderEventReference }).IsUnique().HasFilter("\"ProviderEventReference\" IS NOT NULL");
        builder.Entity<Refund>().HasOne(x => x.Payment).WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Refund>().HasIndex(x => new { x.PaymentId, x.IdempotencyKey }).IsUnique();
        builder.Entity<Refund>().HasIndex(x => new { x.PaymentId, x.Status, x.CreatedAtUtc });
        builder.Entity<RefundStatusTransition>().HasOne(x => x.Refund).WithMany().HasForeignKey(x => x.RefundId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<RefundStatusTransition>().HasIndex(x => new { x.RefundId, x.CreatedAtUtc });
        builder.Entity<Refund>().Property(x => x.Currency).HasMaxLength(8);
        builder.Entity<Refund>().Property(x => x.ReasonCode).HasMaxLength(100);
        builder.Entity<Refund>().Property(x => x.Note).HasMaxLength(1_000);
        builder.Entity<Refund>().Property(x => x.RequestedByUserId).HasMaxLength(64);
        builder.Entity<Refund>().Property(x => x.InternallyRecordedByUserId).HasMaxLength(64);
        builder.Entity<Refund>().Property(x => x.IdempotencyKey).HasMaxLength(128);
        builder.Entity<Refund>().Property(x => x.ProviderRefundReference).HasMaxLength(200);
        builder.Entity<Refund>().Property(x => x.ProviderName).HasMaxLength(32);
        builder.Entity<Refund>().Property(x => x.ProviderStatusCode).HasMaxLength(64);
        builder.Entity<Refund>().Property(x => x.ProviderFailureCode).HasMaxLength(100);
        builder.Entity<Refund>().Property(x => x.CorrelationReference).HasMaxLength(200);
        builder.Entity<Refund>().Property(x => x.FailureCode).HasMaxLength(100);
        builder.Entity<Invoice>().HasOne(x => x.Payment).WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Invoice>().HasIndex(x => x.PaymentId).IsUnique();
        builder.Entity<Invoice>().HasIndex(x => x.Number).IsUnique();
        builder.Entity<Invoice>().Property(x => x.Number).HasMaxLength(64);
        builder.Entity<Invoice>().Property(x => x.CustomerUserId).HasMaxLength(64);
        builder.Entity<Invoice>().Property(x => x.Currency).HasMaxLength(8);
        builder.Entity<Invoice>().Property(x => x.CorrelationReference).HasMaxLength(200);
        builder.Entity<Invoice>().Property(x => x.ExternalFiscalReference).HasMaxLength(200);
        builder.Entity<Invoice>().Property(x => x.ExternalFiscalStatus).HasMaxLength(64);
        builder.Entity<InvoiceLine>().HasOne(x => x.Invoice).WithMany(x => x.Lines).HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<InvoiceLine>().HasIndex(x => new { x.InvoiceId, x.Sequence }).IsUnique();
        builder.Entity<InvoiceLine>().Property(x => x.ItemType).HasMaxLength(64);
        builder.Entity<InvoiceLine>().Property(x => x.SnapshotJson).HasMaxLength(16_000);
        builder.Entity<CreditNote>().HasOne(x => x.Invoice).WithMany().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<CreditNote>().HasOne(x => x.Refund).WithMany().HasForeignKey(x => x.RefundId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<CreditNote>().HasIndex(x => x.RefundId).IsUnique();
        builder.Entity<CreditNote>().HasIndex(x => x.Number).IsUnique();
        builder.Entity<CreditNote>().Property(x => x.Number).HasMaxLength(64);
        builder.Entity<CreditNote>().Property(x => x.Currency).HasMaxLength(8);
        builder.Entity<CreditNote>().Property(x => x.CorrelationReference).HasMaxLength(200);
        builder.Entity<CreditNote>().Property(x => x.ExternalFiscalReference).HasMaxLength(200);
        builder.Entity<CreditNote>().Property(x => x.ExternalFiscalStatus).HasMaxLength(64);
        builder.Entity<FiscalDocumentSubmission>().HasOne(x => x.Invoice).WithMany().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<FiscalDocumentSubmission>().HasOne(x => x.CreditNote).WithMany().HasForeignKey(x => x.CreditNoteId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<FiscalDocumentSubmission>().HasIndex(x => x.BusinessIdentity).IsUnique();
        builder.Entity<FiscalDocumentSubmission>().HasIndex(x => new { x.Status, x.AttemptedAtUtc });
        builder.Entity<FiscalDocumentSubmission>().ToTable(table => table.HasCheckConstraint("CK_FiscalDocumentSubmissions_ExactlyOneSource", "(\"InvoiceId\" IS NOT NULL AND \"CreditNoteId\" IS NULL) OR (\"InvoiceId\" IS NULL AND \"CreditNoteId\" IS NOT NULL)"));
        builder.Entity<FiscalDocumentSubmission>().Property(x => x.Provider).HasMaxLength(64);
        builder.Entity<FiscalDocumentSubmission>().Property(x => x.BusinessIdentity).HasMaxLength(300);
        builder.Entity<FiscalDocumentSubmission>().Property(x => x.CorrelationReference).HasMaxLength(200);
        builder.Entity<FiscalDocumentSubmission>().Property(x => x.ProviderReference).HasMaxLength(200);
        builder.Entity<FiscalDocumentSubmission>().Property(x => x.ProviderStatusCode).HasMaxLength(100);
        builder.Entity<FiscalDocumentSubmission>().Property(x => x.FailureCode).HasMaxLength(100);
        builder.Entity<FiscalDocumentSubmissionTransition>().HasOne(x => x.FiscalDocumentSubmission).WithMany().HasForeignKey(x => x.FiscalDocumentSubmissionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<FiscalDocumentSubmissionTransition>().HasIndex(x => new { x.FiscalDocumentSubmissionId, x.CreatedAtUtc });
        builder.Entity<FiscalDocumentSubmissionTransition>().Property(x => x.ProviderReference).HasMaxLength(200);
        builder.Entity<FiscalDocumentSubmissionTransition>().Property(x => x.ResultCode).HasMaxLength(100);
        builder.Entity<FiscalDocumentSubmissionTransition>().Property(x => x.CorrelationReference).HasMaxLength(200);
        builder.Entity<ProviderReconciliationCase>().HasIndex(x => x.BusinessIdentity).IsUnique();
        builder.Entity<ProviderReconciliationCase>().HasIndex(x => new { x.Status, x.CreatedAtUtc });
        builder.Entity<ProviderReconciliationCase>().Property(x => x.BusinessIdentity).HasMaxLength(300);
        builder.Entity<PaymentDispute>().HasIndex(x => x.BusinessIdentity).IsUnique();
        builder.Entity<PaymentDispute>().HasIndex(x => new { x.PaymentId, x.Status });
        builder.Entity<PaymentDispute>().Property(x => x.Provider).HasMaxLength(32);
        builder.Entity<PaymentDispute>().Property(x => x.ProviderDisputeReference).HasMaxLength(200);
        builder.Entity<PaymentDispute>().Property(x => x.Category).HasMaxLength(100);
        builder.Entity<PaymentDispute>().Property(x => x.Currency).HasMaxLength(8);
        builder.Entity<PaymentDispute>().Property(x => x.ReasonCode).HasMaxLength(100);
        builder.Entity<PaymentDispute>().Property(x => x.Note).HasMaxLength(1_000);
        builder.Entity<PaymentDispute>().Property(x => x.BusinessIdentity).HasMaxLength(400);
        builder.Entity<PaymentDispute>().Property(x => x.ResolutionCode).HasMaxLength(100);
        builder.Entity<PaymentDispute>().Property(x => x.ResolutionNote).HasMaxLength(1_000);
        builder.Entity<PaymentDispute>().Property(x => x.ResolvedByUserId).HasMaxLength(64);
        builder.Entity<WebhookEvent>().HasIndex(x => new { x.Provider, x.ProviderEventId }).IsUnique();
        builder.Entity<CourseSaleAllocation>().HasIndex(x => new { x.PaymentId, x.CourseId }).IsUnique();
        builder.Entity<LedgerAccount>().HasIndex(x => new { x.Code, x.Currency }).IsUnique();
        builder.Entity<LedgerTransaction>().HasOne(x => x.Payment).WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<LedgerTransaction>().HasOne(x => x.Refund).WithMany().HasForeignKey(x => x.RefundId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<LedgerTransaction>().HasOne(x => x.PayoutRequest).WithMany().HasForeignKey(x => x.PayoutRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<LedgerTransaction>().HasIndex(x => x.PaymentId).IsUnique().HasFilter("\"PaymentId\" IS NOT NULL");
        builder.Entity<LedgerTransaction>().HasIndex(x => x.RefundId).IsUnique().HasFilter("\"RefundId\" IS NOT NULL");
        builder.Entity<LedgerTransaction>().HasIndex(x => x.BusinessEventReference).IsUnique();
        builder.Entity<LedgerEntry>().HasOne(x => x.LedgerTransaction).WithMany(x => x.Entries).HasForeignKey(x => x.LedgerTransactionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<LedgerEntry>().HasOne(x => x.LedgerAccount).WithMany().HasForeignKey(x => x.LedgerAccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<LedgerEntry>().HasOne(x => x.CourseSaleAllocation).WithMany().HasForeignKey(x => x.CourseSaleAllocationId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<LedgerEntry>().HasIndex(x => x.LedgerTransactionId);
        builder.Entity<LedgerEntry>().HasIndex(x => x.CourseSaleAllocationId);
        builder.Entity<LedgerEntry>().ToTable(table =>
        {
            table.HasCheckConstraint("CK_LedgerEntries_AmountPositive", "\"Amount\" > 0");
            table.HasCheckConstraint("CK_LedgerEntries_Side", "\"Side\" IN (0, 1)");
        });
        builder.Entity<PayoutRequest>().HasIndex(x => new { x.TeacherUserId, x.Status });
        builder.Entity<PayoutRequest>().HasIndex(x => new { x.TeacherUserId, x.IdempotencyKey }).IsUnique().HasFilter("\"IdempotencyKey\" IS NOT NULL");
        builder.Entity<PayoutRequest>().Property(x => x.Status).IsConcurrencyToken();
        builder.Entity<PayoutRequest>().Property(x => x.ProviderName).HasMaxLength(64);
        builder.Entity<PayoutRequest>().Property(x => x.ProviderResultCode).HasMaxLength(100);
        builder.Entity<PayoutRequest>().Property(x => x.ExecutionFailureCode).HasMaxLength(100);
        builder.Entity<PayoutRequest>().HasIndex(x => new { x.ProviderName, x.ProviderPayoutReference }).IsUnique().HasFilter("\"ProviderPayoutReference\" IS NOT NULL");
        builder.Entity<PayoutStatusTransition>().HasOne(x => x.PayoutRequest).WithMany().HasForeignKey(x => x.PayoutRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PayoutStatusTransition>().HasIndex(x => new { x.PayoutRequestId, x.CreatedAtUtc });
        builder.Entity<PayoutStatusTransition>().Property(x => x.Provider).HasMaxLength(64);
        builder.Entity<PayoutStatusTransition>().Property(x => x.ProviderTransferReference).HasMaxLength(200);
        builder.Entity<PayoutStatusTransition>().Property(x => x.ResultCode).HasMaxLength(100);
        builder.Entity<PayoutStatusTransition>().Property(x => x.CorrelationId).HasMaxLength(200);
        builder.Entity<WalletTransaction>().HasIndex(x => new { x.UserId, x.CreatedAtUtc });
        builder.Entity<WalletTransaction>().HasIndex(x => new { x.PayoutRequestId, x.Type }).IsUnique().HasFilter("\"PayoutRequestId\" IS NOT NULL");
        builder.Entity<WalletTransaction>().HasOne(x => x.Refund).WithMany().HasForeignKey(x => x.RefundId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<WalletTransaction>().HasIndex(x => new { x.RefundId, x.UserId, x.Type }).IsUnique().HasFilter("\"RefundId\" IS NOT NULL");
        builder.Entity<SiteSetting>().HasIndex(x => x.Key).IsUnique();
        builder.Entity<Notification>().HasIndex(x => new { x.UserId, x.DeduplicationKey }).IsUnique().HasFilter("\"DeduplicationKey\" IS NOT NULL");
        builder.Entity<LegalDocument>().Property(x => x.IsCurrent).HasDefaultValue(true);
        builder.Entity<LegalDocument>().HasIndex(x => new { x.Slug, x.Version }).IsUnique();
        builder.Entity<LegalDocument>().HasIndex(x => x.Slug).IsUnique().HasFilter("\"IsCurrent\"");
        builder.Entity<LegalAcceptance>().HasIndex(x => new { x.UserId, x.LegalDocumentId, x.Version }).IsUnique();
        builder.Entity<DataSubjectRequest>().HasIndex(x => new { x.OwnerUserId, x.Status, x.CreatedAtUtc });
        builder.Entity<DataSubjectRequest>().HasIndex(x => new { x.OwnerUserId, x.RequestType }).IsUnique()
            .HasFilter("\"Status\" IN (0, 1, 2)");
        builder.Entity<DataSubjectRequest>().HasIndex(x => new { x.Status, x.CreatedAtUtc });
        builder.Entity<DataSubjectRequest>().Property(x => x.OwnerUserId).HasMaxLength(64);
        builder.Entity<DataSubjectRequest>().Property(x => x.Description).HasMaxLength(2_000);
        builder.Entity<DataSubjectRequest>().Property(x => x.AssignedToUserId).HasMaxLength(64);
        builder.Entity<DataSubjectRequest>().Property(x => x.ResolutionSummary).HasMaxLength(2_000);
        builder.Entity<DataSubjectRequest>().Property(x => x.IdentityVerifiedByUserId).HasMaxLength(64);
        builder.Entity<DataSubjectFulfillment>().HasIndex(x => x.DataSubjectRequestId).IsUnique();
        builder.Entity<DataSubjectFulfillment>().HasIndex(x => new { x.RequestType, x.Status, x.GeneratedAtUtc });
        builder.Entity<DataSubjectFulfillment>().Property(x => x.EvidenceJson).HasMaxLength(4_000);
        builder.Entity<DataSubjectFulfillment>().Property(x => x.GeneratedByUserId).HasMaxLength(64);
        builder.Entity<DataSubjectFulfillment>().Property(x => x.ReleasedByUserId).HasMaxLength(64);
        builder.Entity<DataSubjectFulfillment>().HasOne<DataSubjectRequest>().WithMany()
            .HasForeignKey(x => x.DataSubjectRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<DataPortabilityExport>().HasIndex(x => x.DataSubjectRequestId).IsUnique();
        builder.Entity<DataPortabilityExport>().HasIndex(x => new { x.SubjectUserId, x.ExpiresAtUtc });
        builder.Entity<DataPortabilityExport>().Property(x => x.SubjectUserId).HasMaxLength(64);
        builder.Entity<DataPortabilityExport>().Property(x => x.RequestedByUserId).HasMaxLength(64);
        builder.Entity<DataPortabilityExport>().Property(x => x.GeneratedByUserId).HasMaxLength(64);
        builder.Entity<DataPortabilityExport>().Property(x => x.ExportFormat).HasMaxLength(40);
        builder.Entity<DataPortabilityExport>().Property(x => x.ExportVersion).HasMaxLength(64);
        builder.Entity<DataPortabilityExport>().Property(x => x.StorageKey).HasMaxLength(512);
        builder.Entity<DataPortabilityExport>().Property(x => x.ReleasedByUserId).HasMaxLength(64);
        builder.Entity<DataPortabilityExport>().Property(x => x.DownloadedByUserId).HasMaxLength(64);
        builder.Entity<DataPortabilityExport>().Property(x => x.FailureReason).HasMaxLength(2_000);
        builder.Entity<DataPortabilityExport>().HasOne<DataSubjectRequest>().WithMany()
            .HasForeignKey(x => x.DataSubjectRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<DataPortabilityExport>().HasOne<DataSubjectFulfillment>().WithMany()
            .HasForeignKey(x => x.DataSubjectFulfillmentId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<StorageLifecycleOperation>().Property(x => x.StagingKey).HasMaxLength(512);
        builder.Entity<StorageLifecycleOperation>().Property(x => x.StorageKey).HasMaxLength(512);
        builder.Entity<StorageLifecycleOperation>().Property(x => x.LastErrorCategory).HasMaxLength(200);
        builder.Entity<StorageLifecycleOperation>().HasIndex(x => new { x.Status, x.NextAttemptAtUtc });
        builder.Entity<StorageLifecycleOperation>().HasIndex(x => x.StagingKey);
        builder.Entity<DataProcessingRestriction>().HasIndex(x => x.DataSubjectRequestId).IsUnique();
        builder.Entity<DataProcessingRestriction>().HasIndex(x => new { x.SubjectUserId, x.Status, x.ProcessingScope });
        builder.Entity<DataProcessingRestriction>().Property(x => x.SubjectUserId).HasMaxLength(64);
        builder.Entity<DataProcessingRestriction>().Property(x => x.ProcessingScope).HasMaxLength(100);
        builder.Entity<DataProcessingRestriction>().Property(x => x.Reason).HasMaxLength(2_000);
        builder.Entity<DataProcessingRestriction>().Property(x => x.ReleasedByUserId).HasMaxLength(64);
        builder.Entity<DataProcessingRestriction>().Property(x => x.ReleaseReason).HasMaxLength(2_000);
        builder.Entity<DataProcessingRestriction>().HasOne<DataSubjectRequest>().WithMany()
            .HasForeignKey(x => x.DataSubjectRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<ConsentRecord>().HasIndex(x => new { x.UserId, x.Purpose, x.CreatedAtUtc });
        builder.Entity<ConsentRecord>().Property(x => x.UserId).HasMaxLength(64);
        builder.Entity<ConsentRecord>().Property(x => x.PolicyVersion).HasMaxLength(80);
        builder.Entity<ConsentRecord>().Property(x => x.CaptureMethod).HasMaxLength(80);
        builder.Entity<ConsentRecord>().Property(x => x.IpAddress).HasMaxLength(64);
        builder.Entity<ConsentRecord>().Property(x => x.UserAgent).HasMaxLength(512);
        builder.Entity<GuardianInvitation>().HasIndex(x => new { x.StudentUserId, x.Status });
        builder.Entity<GuardianInvitation>().HasIndex(x => new { x.RecipientEmail, x.Status, x.ExpiresAtUtc });
        builder.Entity<GuardianInvitation>().HasIndex(x => x.TokenHash).IsUnique();
        builder.Entity<GuardianInvitation>().Property(x => x.StudentUserId).HasMaxLength(64);
        builder.Entity<GuardianInvitation>().Property(x => x.RecipientEmail).HasMaxLength(320);
        builder.Entity<GuardianInvitation>().Property(x => x.TokenHash).HasMaxLength(64);
        builder.Entity<GuardianInvitation>().Property(x => x.AcceptedByUserId).HasMaxLength(64);
        builder.Entity<GuardianInvitation>().Property(x => x.RevokedByUserId).HasMaxLength(64);
        builder.Entity<GuardianInvitation>().Property(x => x.RevocationReason).HasMaxLength(1_000);
        builder.Entity<GuardianInvitation>().Property(x => x.Status).IsConcurrencyToken();
        builder.Entity<GuardianRelationship>().HasIndex(x => x.GuardianInvitationId).IsUnique();
        builder.Entity<GuardianRelationship>().HasIndex(x => new { x.GuardianUserId, x.StudentUserId, x.Status });
        builder.Entity<GuardianRelationship>().Property(x => x.StudentUserId).HasMaxLength(64);
        builder.Entity<GuardianRelationship>().Property(x => x.GuardianUserId).HasMaxLength(64);
        builder.Entity<GuardianRelationship>().Property(x => x.RevokedByUserId).HasMaxLength(64);
        builder.Entity<GuardianRelationship>().Property(x => x.RevocationReason).HasMaxLength(1_000);
        builder.Entity<GuardianRelationship>().HasOne<GuardianInvitation>().WithOne()
            .HasForeignKey<GuardianRelationship>(x => x.GuardianInvitationId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<GuardianConsent>().HasIndex(x => new { x.GuardianRelationshipId, x.Capability, x.DecidedAtUtc });
        builder.Entity<GuardianConsent>().HasIndex(x => new { x.GuardianUserId, x.StudentUserId, x.Capability, x.DecidedAtUtc });
        builder.Entity<GuardianConsent>().Property(x => x.StudentUserId).HasMaxLength(64);
        builder.Entity<GuardianConsent>().Property(x => x.GuardianUserId).HasMaxLength(64);
        builder.Entity<GuardianConsent>().Property(x => x.ActorUserId).HasMaxLength(64);
        builder.Entity<GuardianConsent>().Property(x => x.Capability).HasMaxLength(120);
        builder.Entity<GuardianConsent>().Property(x => x.DecisionReason).HasMaxLength(1_000);
        builder.Entity<GuardianConsent>().Property(x => x.LegalDocumentVersion).HasMaxLength(64);
        builder.Entity<GuardianConsent>().Property(x => x.CaptureMethod).HasMaxLength(80);
        builder.Entity<GuardianConsent>().HasOne<GuardianRelationship>().WithMany()
            .HasForeignKey(x => x.GuardianRelationshipId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<GuardianConsent>().HasOne<LegalDocument>().WithMany()
            .HasForeignKey(x => x.LegalDocumentId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<RetentionPolicy>().HasIndex(x => new { x.PolicyKey, x.Version }).IsUnique();
        builder.Entity<RetentionPolicy>().HasIndex(x => x.PolicyKey).IsUnique().HasFilter("\"IsCurrent\"");
        builder.Entity<RetentionPolicy>().HasIndex(x => new { x.IsEnabled, x.IsCurrent, x.EffectiveAtUtc });
        builder.Entity<RetentionPolicy>().Property(x => x.PolicyKey).HasMaxLength(100);
        builder.Entity<RetentionPolicy>().Property(x => x.Version).HasMaxLength(64);
        builder.Entity<RetentionPolicy>().Property(x => x.DataCategoryOrPurpose).HasMaxLength(300);
        builder.Entity<RetentionPolicy>().Property(x => x.RetentionRule).HasMaxLength(2_000);
        builder.Entity<RetentionPolicy>().Property(x => x.LegalOrBusinessBasis).HasMaxLength(2_000);
        builder.Entity<LegalHold>().HasIndex(x => new { x.SubjectUserId, x.Status, x.ScopePolicyKey });
        builder.Entity<LegalHold>().Property(x => x.SubjectUserId).HasMaxLength(64);
        builder.Entity<LegalHold>().Property(x => x.ScopePolicyKey).HasMaxLength(100);
        builder.Entity<LegalHold>().Property(x => x.Reason).HasMaxLength(2_000);
        builder.Entity<LegalHold>().Property(x => x.ReleasedByUserId).HasMaxLength(64);
        builder.Entity<LegalHold>().Property(x => x.ReleaseReason).HasMaxLength(2_000);
        builder.Entity<PrivacyExecutionJob>().HasIndex(x => new { x.DataSubjectRequestId, x.RetentionPolicyId }).IsUnique();
        builder.Entity<PrivacyExecutionJob>().HasIndex(x => new { x.SubjectUserId, x.Status, x.UpdatedAtUtc });
        builder.Entity<PrivacyExecutionJob>().Property(x => x.SubjectUserId).HasMaxLength(64);
        builder.Entity<PrivacyExecutionJob>().Property(x => x.RetentionPolicyVersion).HasMaxLength(64);
        builder.Entity<PrivacyExecutionJob>().Property(x => x.RetentionRuleSnapshot).HasMaxLength(2_000);
        builder.Entity<PrivacyExecutionJob>().Property(x => x.EligibilityReason).HasMaxLength(2_000);
        builder.Entity<PrivacyExecutionJob>().Property(x => x.EvaluatedByUserId).HasMaxLength(64);
        builder.Entity<PrivacyExecutionJob>().Property(x => x.FailureDetail).HasMaxLength(2_000);
        builder.Entity<PrivacyExecutionJob>().HasOne<DataSubjectRequest>().WithMany()
            .HasForeignKey(x => x.DataSubjectRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PrivacyExecutionJob>().HasOne<RetentionPolicy>().WithMany()
            .HasForeignKey(x => x.RetentionPolicyId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PrivacyExecutionJob>().HasOne<LegalHold>().WithMany()
            .HasForeignKey(x => x.BlockingLegalHoldId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<ProcessingActivity>().Property(x => x.IsCurrent).HasDefaultValue(false);
        builder.Entity<ProcessingActivity>().HasIndex(x => new { x.Code, x.Version }).IsUnique();
        builder.Entity<ProcessingActivity>().HasIndex(x => x.Code).IsUnique().HasFilter("\"IsCurrent\"");
        builder.Entity<ProcessingActivity>().HasIndex(x => new { x.Status, x.EffectiveAtUtc });
        builder.Entity<ProcessingActivity>().Property(x => x.Code).HasMaxLength(100);
        builder.Entity<ProcessingActivity>().Property(x => x.Version).HasMaxLength(64);
        builder.Entity<ProcessingActivity>().Property(x => x.Name).HasMaxLength(300);
        builder.Entity<ProcessingActivity>().Property(x => x.Description).HasMaxLength(4_000);
        builder.Entity<ProcessingActivity>().Property(x => x.ProcessingPurpose).HasMaxLength(2_000);
        builder.Entity<ProcessingActivity>().Property(x => x.DataSubjectCategoriesJson).HasMaxLength(4_000);
        builder.Entity<ProcessingActivity>().Property(x => x.PersonalDataCategoriesJson).HasMaxLength(4_000);
        builder.Entity<ProcessingActivity>().Property(x => x.SpecialCategoryClassification).HasMaxLength(500);
        builder.Entity<ProcessingActivity>().Property(x => x.LegalOrProcessingBasis).HasMaxLength(2_000);
        builder.Entity<ProcessingActivity>().Property(x => x.DataSourcesJson).HasMaxLength(4_000);
        builder.Entity<ProcessingActivity>().Property(x => x.RecipientCategoriesJson).HasMaxLength(4_000);
        builder.Entity<ProcessingActivity>().Property(x => x.RelatedSystemModule).HasMaxLength(160);
        builder.Entity<ProcessingActivity>().Property(x => x.TransferConfiguration).HasMaxLength(2_000);
        builder.Entity<ProcessingActivity>().Property(x => x.SecurityControlReferences).HasMaxLength(2_000);
        builder.Entity<ProcessingActivity>().Property(x => x.OwnerRole).HasMaxLength(120);
        builder.Entity<ProcessingActivity>().Property(x => x.CreatedByUserId).HasMaxLength(64);
        builder.Entity<ProcessingActivity>().Property(x => x.UpdatedByUserId).HasMaxLength(64);
        builder.Entity<ProcessingActivity>().HasOne<RetentionPolicy>().WithMany()
            .HasForeignKey(x => x.RetentionPolicyId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<SubprocessorRecord>().Property(x => x.IsCurrent).HasDefaultValue(false);
        builder.Entity<SubprocessorRecord>().HasIndex(x => new { x.Code, x.Version }).IsUnique();
        builder.Entity<SubprocessorRecord>().HasIndex(x => x.Code).IsUnique().HasFilter("\"IsCurrent\"");
        builder.Entity<SubprocessorRecord>().HasIndex(x => new { x.Status, x.EffectiveAtUtc });
        builder.Entity<SubprocessorRecord>().Property(x => x.Code).HasMaxLength(100);
        builder.Entity<SubprocessorRecord>().Property(x => x.Version).HasMaxLength(64);
        builder.Entity<SubprocessorRecord>().Property(x => x.Name).HasMaxLength(300);
        builder.Entity<SubprocessorRecord>().Property(x => x.ProviderLegalEntityName).HasMaxLength(300);
        builder.Entity<SubprocessorRecord>().Property(x => x.ServiceDescription).HasMaxLength(4_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.ProcessingPurpose).HasMaxLength(2_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.PersonalDataCategoriesJson).HasMaxLength(4_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.DataSubjectCategoriesJson).HasMaxLength(4_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.HostingRegionOrCountry).HasMaxLength(300);
        builder.Entity<SubprocessorRecord>().Property(x => x.TransferConfiguration).HasMaxLength(2_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.RelatedSystemModule).HasMaxLength(160);
        builder.Entity<SubprocessorRecord>().Property(x => x.ContractDpaStatusOrReference).HasMaxLength(2_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.SecurityControlReferences).HasMaxLength(2_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.RetentionDeletionCommitments).HasMaxLength(2_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.FurtherSubprocessorConfiguration).HasMaxLength(2_000);
        builder.Entity<SubprocessorRecord>().Property(x => x.OwnerRole).HasMaxLength(120);
        builder.Entity<SubprocessorRecord>().Property(x => x.CreatedByUserId).HasMaxLength(64);
        builder.Entity<SubprocessorRecord>().Property(x => x.UpdatedByUserId).HasMaxLength(64);
        builder.Entity<SubprocessorProcessingActivity>().HasIndex(x => new { x.SubprocessorRecordId, x.ProcessingActivityId }).IsUnique();
        builder.Entity<SubprocessorProcessingActivity>().HasIndex(x => x.ProcessingActivityId);
        builder.Entity<SubprocessorProcessingActivity>().HasOne<SubprocessorRecord>().WithMany()
            .HasForeignKey(x => x.SubprocessorRecordId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<SubprocessorProcessingActivity>().HasOne<ProcessingActivity>().WithMany()
            .HasForeignKey(x => x.ProcessingActivityId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<SecurityIncident>().HasIndex(x => new { x.Status, x.Severity, x.DetectedAtUtc });
        builder.Entity<SecurityIncident>().Property(x => x.Title).HasMaxLength(240);
        builder.Entity<SecurityIncident>().Property(x => x.Summary).HasMaxLength(4_000);
        builder.Entity<SecurityIncident>().Property(x => x.CreatedByUserId).HasMaxLength(64);
        builder.Entity<SecurityIncident>().Property(x => x.ReasonCode).HasMaxLength(80);
        builder.Entity<SecurityIncident>().Property(x => x.AssignedToUserId).HasMaxLength(64);
        builder.Entity<SecurityIncident>().Property(x => x.ClosureSummary).HasMaxLength(2_000);
        builder.Entity<BreachAssessment>().HasIndex(x => x.SecurityIncidentId).IsUnique();
        builder.Entity<BreachAssessment>().Property(x => x.LegalConfirmedByUserId).HasMaxLength(64);
        builder.Entity<BreachAssessment>().Property(x => x.LegalDecisionSummary).HasMaxLength(2_000);
        builder.Entity<BreachAssessment>().HasOne(x => x.SecurityIncident).WithOne(x => x.BreachAssessment)
            .HasForeignKey<BreachAssessment>(x => x.SecurityIncidentId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<BreachNotificationDeadline>().HasIndex(x => new { x.Audience, x.DueAtUtc });
        builder.Entity<BreachNotificationDeadline>().HasIndex(x => new { x.BreachAssessmentId, x.Audience }).IsUnique();
        builder.Entity<BreachNotificationDeadline>().Property(x => x.RecordedByUserId).HasMaxLength(64);
        builder.Entity<BreachNotificationDeadline>().Property(x => x.RecordNote).HasMaxLength(1_000);
        builder.Entity<UserSession>().HasIndex(x => new { x.UserId, x.RevokedAtUtc, x.LastActiveAtUtc });
        builder.Entity<TeacherInvitation>().HasIndex(x => new { x.TeacherUserId, x.Status });
        builder.Entity<TeacherInvitation>().HasIndex(x => new { x.Email, x.Status, x.ExpiresAtUtc });
        builder.Entity<StudentDeviceBinding>().HasIndex(x => x.StudentUserId).IsUnique().HasFilter("\"IsActive\" = true");
        builder.Entity<StudentDeviceBinding>().HasIndex(x => x.DeviceHash).IsUnique();
        builder.Entity<RegistrationEmailOutboxMessage>().HasIndex(x => x.UserId).IsUnique();
        builder.Entity<RegistrationEmailOutboxMessage>().HasIndex(x => new { x.Status, x.NextAttemptAtUtc });
        builder.Entity<RegistrationEmailOutboxMessage>().Property(x => x.RecipientEmail).HasMaxLength(320);
        builder.Entity<RegistrationEmailOutboxMessage>().Property(x => x.LastFailureCode).HasMaxLength(120);
        builder.Entity<RegistrationEmailOutboxMessage>().Property(x => x.ProtectedConfirmationToken).HasMaxLength(4_096);
        builder.Entity<RegistrationEmailOutboxMessage>().HasOne<ApplicationUser>().WithOne()
            .HasForeignKey<RegistrationEmailOutboxMessage>(x => x.UserId)
            .HasPrincipalKey<ApplicationUser>(x => x.Id)
            .OnDelete(DeleteBehavior.Restrict);
        builder.Entity<QuizAttempt>().HasIndex(x => new { x.StudentUserId, x.QuizId, x.CreatedAtUtc });
        builder.Entity<Quiz>().HasIndex(x => new { x.CourseId, x.PublicationStatus, x.AvailableFromUtc });
        builder.Entity<QuizAttemptQuestionGrade>().HasIndex(x => new { x.QuizAttemptId, x.QuizQuestionId }).IsUnique();
        builder.Entity<QuizQuestion>().HasOne(x => x.ImageResource).WithMany().HasForeignKey(x => x.ImageResourceId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<QuestionBankQuestion>().HasIndex(x => new { x.TeacherUserId, x.CourseId, x.UpdatedAtUtc });
        builder.Entity<QuestionBankQuestion>().HasIndex(x => new { x.TeacherUserId, x.CourseId, x.SubjectId, x.CourseModuleId, x.BtecLearningAimId });
        builder.Entity<QuestionBankQuestion>().HasOne(x => x.ImageResource).WithMany().HasForeignKey(x => x.ImageResourceId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<QuestionBankQuestion>().HasOne(x => x.Subject).WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.SetNull);
        builder.Entity<QuestionBankQuestion>().HasOne(x => x.CourseModule).WithMany().HasForeignKey(x => x.CourseModuleId).OnDelete(DeleteBehavior.SetNull);
        builder.Entity<QuestionBankQuestion>().HasOne(x => x.BtecLearningAim).WithMany().HasForeignKey(x => x.BtecLearningAimId).OnDelete(DeleteBehavior.SetNull);
        builder.Entity<CourseAssignment>().HasIndex(x => new { x.CourseId, x.IsPublished, x.DueAtUtc });
        builder.Entity<CourseAssignment>().HasIndex(x => new { x.CourseId, x.PublicationStatus, x.AvailableFromUtc });
        builder.Entity<CourseAssignment>().HasIndex(x => x.LessonId).IsUnique().HasFilter("\"LessonId\" IS NOT NULL");
        builder.Entity<CourseAssignmentDeadlineExtension>().Property(x => x.StudentUserId).HasMaxLength(64);
        builder.Entity<CourseAssignmentDeadlineExtension>().Property(x => x.GrantedByUserId).HasMaxLength(64);
        builder.Entity<CourseAssignmentDeadlineExtension>().Property(x => x.RevokedByUserId).HasMaxLength(64);
        builder.Entity<CourseAssignmentDeadlineExtension>().Property(x => x.Reason).HasMaxLength(500);
        builder.Entity<CourseAssignmentDeadlineExtension>().Property(x => x.RevocationReason).HasMaxLength(500);
        builder.Entity<CourseAssignmentDeadlineExtension>().HasOne(x => x.CourseAssignment).WithMany(x => x.DeadlineExtensions).HasForeignKey(x => x.CourseAssignmentId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<CourseAssignmentDeadlineExtension>().HasIndex(x => new { x.CourseAssignmentId, x.StudentUserId }).IsUnique().HasFilter("\"RevokedAtUtc\" IS NULL");
        builder.Entity<CourseAssignmentCriterion>().HasIndex(x => new { x.CourseAssignmentId, x.Code }).IsUnique();
        builder.Entity<CourseAssignmentResource>().HasIndex(x => new { x.CourseAssignmentId, x.DisplayName });
        builder.Entity<CourseAssignmentSubmission>().HasIndex(x => new { x.CourseAssignmentId, x.StudentUserId }).IsUnique();
        builder.Entity<CourseAssignmentSubmission>().HasIndex(x => new { x.Status, x.UpdatedAtUtc });
        builder.Entity<CourseAssignmentSubmissionVersion>().HasIndex(x => new { x.CourseAssignmentSubmissionId, x.VersionNumber }).IsUnique();
        builder.Entity<CourseAssignmentSubmissionFile>().HasIndex(x => new { x.CourseAssignmentSubmissionVersionId, x.StorageKey }).IsUnique();
        builder.Entity<CourseAssignmentCriterionResult>().HasIndex(x => new { x.CourseAssignmentSubmissionId, x.CourseAssignmentCriterionId }).IsUnique();
        builder.Entity<Qualification>().Property(x => x.Code).HasMaxLength(64);
        builder.Entity<Qualification>().Property(x => x.ArabicName).HasMaxLength(256);
        builder.Entity<Qualification>().Property(x => x.EnglishName).HasMaxLength(256);
        builder.Entity<Qualification>().HasIndex(x => x.Code).IsUnique();
        builder.Entity<QualificationVersion>().Property(x => x.VersionCode).HasMaxLength(64);
        builder.Entity<QualificationVersion>().Property(x => x.SourceReference).HasMaxLength(2_048);
        builder.Entity<QualificationVersion>().HasIndex(x => new { x.QualificationId, x.VersionCode }).IsUnique();
        builder.Entity<QualificationVersion>().HasOne(x => x.Qualification).WithMany(x => x.Versions).HasForeignKey(x => x.QualificationId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<UnitDefinition>().Property(x => x.Code).HasMaxLength(64);
        builder.Entity<UnitDefinition>().Property(x => x.EnglishTitle).HasMaxLength(256);
        builder.Entity<UnitDefinition>().Property(x => x.ArabicTitle).HasMaxLength(256);
        builder.Entity<UnitDefinition>().Property(x => x.SourceReference).HasMaxLength(2_048);
        builder.Entity<UnitDefinition>().HasIndex(x => new { x.QualificationVersionId, x.Code }).IsUnique();
        builder.Entity<UnitDefinition>().HasOne(x => x.QualificationVersion).WithMany(x => x.UnitDefinitions).HasForeignKey(x => x.QualificationVersionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentDefinition>().Property(x => x.Code).HasMaxLength(64);
        builder.Entity<AssessmentDefinition>().Property(x => x.EnglishTitle).HasMaxLength(256);
        builder.Entity<AssessmentDefinition>().Property(x => x.ArabicTitle).HasMaxLength(256);
        builder.Entity<AssessmentDefinition>().Property(x => x.SourceReference).HasMaxLength(2_048);
        builder.Entity<AssessmentDefinition>().HasIndex(x => new { x.UnitDefinitionId, x.Code, x.Version }).IsUnique();
        builder.Entity<AssessmentDefinition>().HasOne(x => x.UnitDefinition).WithMany(x => x.AssessmentDefinitions).HasForeignKey(x => x.UnitDefinitionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<LearningAimDefinition>().Property(x => x.Code).HasMaxLength(64);
        builder.Entity<LearningAimDefinition>().Property(x => x.ArabicTitle).HasMaxLength(256);
        builder.Entity<LearningAimDefinition>().Property(x => x.EnglishTitle).HasMaxLength(256);
        builder.Entity<LearningAimDefinition>().Property(x => x.ArabicDescription).HasMaxLength(4_000);
        builder.Entity<LearningAimDefinition>().Property(x => x.EnglishDescription).HasMaxLength(4_000);
        builder.Entity<LearningAimDefinition>().Property(x => x.SourceReference).HasMaxLength(2_048);
        builder.Entity<LearningAimDefinition>().HasIndex(x => new { x.UnitDefinitionId, x.Code }).IsUnique();
        builder.Entity<LearningAimDefinition>().HasAlternateKey(x => new { x.Id, x.UnitDefinitionId });
        builder.Entity<LearningAimDefinition>().HasOne(x => x.UnitDefinition).WithMany(x => x.LearningAims).HasForeignKey(x => x.UnitDefinitionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentCriterionDefinition>().Property(x => x.Code).HasMaxLength(64);
        builder.Entity<AssessmentCriterionDefinition>().Property(x => x.ArabicDescription).HasMaxLength(4_000);
        builder.Entity<AssessmentCriterionDefinition>().Property(x => x.EnglishDescription).HasMaxLength(4_000);
        builder.Entity<AssessmentCriterionDefinition>().Property(x => x.SourceReference).HasMaxLength(2_048);
        builder.Entity<AssessmentCriterionDefinition>().Property(x => x.Band).HasConversion<string>().HasMaxLength(24);
        builder.Entity<AssessmentCriterionDefinition>().ToTable(table => table.HasCheckConstraint("CK_AssessmentCriterionDefinitions_Band", "\"Band\" IN ('Pass', 'Merit', 'Distinction')"));
        builder.Entity<AssessmentCriterionDefinition>().HasIndex(x => new { x.LearningAimDefinitionId, x.Code }).IsUnique();
        builder.Entity<AssessmentCriterionDefinition>().HasAlternateKey(x => new { x.Id, x.LearningAimDefinitionId });
        builder.Entity<AssessmentCriterionDefinition>().HasOne(x => x.LearningAimDefinition).WithMany(x => x.Criteria).HasForeignKey(x => x.LearningAimDefinitionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentDefinition>().HasAlternateKey(x => new { x.Id, x.UnitDefinitionId });
        builder.Entity<AssessmentDefinitionAim>().HasKey(x => new { x.AssessmentDefinitionId, x.LearningAimDefinitionId });
        builder.Entity<AssessmentDefinitionAim>().HasOne<AssessmentDefinition>().WithMany(x => x.AimMappings)
            .HasForeignKey(x => new { x.AssessmentDefinitionId, x.UnitDefinitionId })
            .HasPrincipalKey(x => new { x.Id, x.UnitDefinitionId }).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentDefinitionAim>().HasOne<LearningAimDefinition>().WithMany()
            .HasForeignKey(x => new { x.LearningAimDefinitionId, x.UnitDefinitionId })
            .HasPrincipalKey(x => new { x.Id, x.UnitDefinitionId }).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentDefinitionCriterion>().HasKey(x => new { x.AssessmentDefinitionId, x.AssessmentCriterionDefinitionId });
        builder.Entity<AssessmentDefinitionCriterion>().HasOne<AssessmentDefinition>().WithMany(x => x.CriterionMappings)
            .HasForeignKey(x => x.AssessmentDefinitionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentDefinitionCriterion>().HasOne<AssessmentDefinitionAim>().WithMany()
            .HasForeignKey(x => new { x.AssessmentDefinitionId, x.LearningAimDefinitionId })
            .HasPrincipalKey(x => new { x.AssessmentDefinitionId, x.LearningAimDefinitionId }).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentDefinitionCriterion>().HasOne<AssessmentCriterionDefinition>().WithMany()
            .HasForeignKey(x => new { x.AssessmentCriterionDefinitionId, x.LearningAimDefinitionId })
            .HasPrincipalKey(x => new { x.Id, x.LearningAimDefinitionId }).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentScope>().HasIndex(x => new { x.AssessmentDefinitionId, x.GradeId, x.SpecializationId, x.Version }).IsUnique();
        builder.Entity<AssessmentScope>().HasIndex(x => x.GradeId);
        builder.Entity<AssessmentScope>().HasIndex(x => x.SpecializationId);
        builder.Entity<AssessmentScope>().HasIndex(x => x.RubricTemplateId);
        builder.Entity<AssessmentScope>().HasOne(x => x.AssessmentDefinition).WithMany(x => x.Scopes).HasForeignKey(x => x.AssessmentDefinitionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentScope>().HasOne<Grade>().WithMany().HasForeignKey(x => x.GradeId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentScope>().HasOne<Specialization>().WithMany().HasForeignKey(x => x.SpecializationId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AssessmentScope>().HasOne<RubricTemplate>().WithMany().HasForeignKey(x => x.RubricTemplateId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<RubricTemplate>().HasOne(x => x.QualificationVersion).WithMany(x => x.RubricTemplates).HasForeignKey(x => x.QualificationVersionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<EvaluationRequest>().Property(x => x.QualificationVersionSnapshotJson).HasMaxLength(8_000);
        builder.Entity<EvaluationRequest>().HasOne(x => x.AssessmentScope).WithMany(x => x.EvaluationRequests).HasForeignKey(x => x.AssessmentScopeId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<EvaluationRequest>().HasIndex(x => x.QualificationVersionId);
        builder.Entity<EvaluationRequest>().HasOne(x => x.RetakeOfEvaluationRequest).WithMany(x => x.Retakes)
            .HasForeignKey(x => x.RetakeOfEvaluationRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<EvaluationRequest>().HasIndex(x => x.RetakeOfEvaluationRequestId).IsUnique()
            .HasFilter("\"RetakeOfEvaluationRequestId\" IS NOT NULL");
        builder.Entity<CourseAssignmentFeedback>().HasIndex(x => new { x.CourseAssignmentSubmissionId, x.CreatedAtUtc });
        builder.Entity<EvaluatorAssignment>().HasIndex(x => x.EvaluationRequestId).IsUnique();
        builder.Entity<EvaluatorUnitSpecialism>().Property(x => x.RevokeReason).HasMaxLength(500);
        builder.Entity<EvaluatorUnitSpecialism>().Property(x => x.RevokedAtUtc).IsConcurrencyToken();
        builder.Entity<EvaluatorUnitSpecialism>().HasOne<ApplicationUser>().WithMany()
            .HasForeignKey(x => x.EvaluatorUserId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<EvaluatorUnitSpecialism>().HasOne<ApplicationUser>().WithMany()
            .HasForeignKey(x => x.GrantedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<EvaluatorUnitSpecialism>().HasOne<ApplicationUser>().WithMany()
            .HasForeignKey(x => x.RevokedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<EvaluatorUnitSpecialism>().HasOne(x => x.UnitDefinition).WithMany()
            .HasForeignKey(x => x.UnitDefinitionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<EvaluatorUnitSpecialism>().HasIndex(x => new { x.EvaluatorUserId, x.UnitDefinitionId })
            .IsUnique().HasFilter("\"RevokedAtUtc\" IS NULL");
        builder.Entity<EvaluatorUnitSpecialism>().HasIndex(x => new { x.UnitDefinitionId, x.RevokedAtUtc, x.EvaluatorUserId });
        builder.Entity<EvaluatorAssignment>().HasOne(x => x.EvaluatorUnitSpecialism).WithMany()
            .HasForeignKey(x => x.EvaluatorUnitSpecialismId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<SubmissionFile>().HasIndex(x => new { x.EvaluationRequestId, x.StorageKey }).IsUnique();
        builder.Entity<EvaluationEvidence>().HasIndex(x => new { x.EvaluationRequestId, x.CriterionCode }).IsUnique();
        builder.Entity<EvaluationFeedback>().HasIndex(x => new { x.EvaluationRequestId, x.CreatedAtUtc });
        builder.Entity<InternalVerification>().HasIndex(x => new { x.EvaluationRequestId, x.VerifiedAtUtc });
        builder.Entity<InternalVerificationPlan>().Property(x => x.SelectionRationale).HasMaxLength(2_000);
        builder.Entity<InternalVerificationPlan>().HasIndex(x => new { x.IsActive, x.ActiveFromUtc, x.ActiveUntilUtc });
        builder.Entity<InternalVerificationPlan>().HasIndex(x => new { x.AssessorUserId, x.GradeId, x.SpecializationId, x.TaskTypeId });
        builder.Entity<InternalVerificationSample>().Property(x => x.SelectedByUserId).HasMaxLength(128);
        builder.Entity<InternalVerificationSample>().Property(x => x.AssignedVerifierUserId).HasMaxLength(128);
        builder.Entity<InternalVerificationSample>().Property(x => x.SelectionRationale).HasMaxLength(2_000);
        builder.Entity<InternalVerificationSample>().Property(x => x.DecisionComment).HasMaxLength(4_000);
        builder.Entity<InternalVerificationSample>().HasIndex(x => new { x.EvaluationRequestId, x.SubmissionAttemptNumber }).IsUnique();
        builder.Entity<InternalVerificationSample>().HasIndex(x => new { x.AssignedVerifierUserId, x.Status, x.SelectedAtUtc });
        builder.Entity<InternalVerificationSample>().HasOne(x => x.EvaluationRequest).WithMany(x => x.InternalVerificationSamples).HasForeignKey(x => x.EvaluationRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<InternalVerificationSample>().HasOne(x => x.InternalVerificationPlan).WithMany(x => x.Samples).HasForeignKey(x => x.InternalVerificationPlanId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<EvaluationAppeal>().Property(x => x.StudentUserId).HasMaxLength(128);
        builder.Entity<EvaluationAppeal>().Property(x => x.Reason).HasMaxLength(4_000);
        builder.Entity<EvaluationAppeal>().Property(x => x.ReviewedByUserId).HasMaxLength(128);
        builder.Entity<EvaluationAppeal>().Property(x => x.DecisionRationale).HasMaxLength(4_000);
        builder.Entity<EvaluationAppeal>().HasIndex(x => new { x.EvaluationRequestId, x.Status });
        builder.Entity<EvaluationAppeal>().HasIndex(x => new { x.StudentUserId, x.CreatedAtUtc });
        builder.Entity<EvaluationAppeal>().HasIndex(x => x.EvaluationRequestId).IsUnique().HasFilter("\"Status\" IN (0, 1)");
        builder.Entity<EvaluationAppeal>().HasOne(x => x.EvaluationRequest).WithMany(x => x.Appeals).HasForeignKey(x => x.EvaluationRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AuthenticityDeclaration>().HasIndex(x => new { x.EvaluationRequestId, x.AttemptNumber }).IsUnique();
        builder.Entity<AuthenticityDeclaration>().HasIndex(x => new { x.StudentUserId, x.DeclaredAtUtc });
        builder.Entity<AssessmentAuditEvent>().HasIndex(x => new { x.EvaluationRequestId, x.OccurredAtUtc });
        builder.Entity<AssessmentAuditEvent>().HasIndex(x => new { x.ActorUserId, x.OccurredAtUtc });
        builder.Entity<ResubmissionAuthorization>().HasIndex(x => new { x.EvaluationRequestId, x.AttemptNumber }).IsUnique();
        builder.Entity<ResubmissionAuthorization>().HasIndex(x => new { x.DueAtUtc, x.SubmittedAtUtc, x.RevokedAtUtc });
        builder.Entity<RetakeAuthorization>().Property(x => x.AuthorizedByUserId).HasMaxLength(128);
        builder.Entity<RetakeAuthorization>().Property(x => x.Reason).HasMaxLength(2_000);
        builder.Entity<RetakeAuthorization>().HasIndex(x => x.OriginalEvaluationRequestId).IsUnique();
        builder.Entity<RetakeAuthorization>().HasIndex(x => x.RetakeEvaluationRequestId).IsUnique();
        builder.Entity<RetakeAuthorization>().HasOne(x => x.OriginalEvaluationRequest).WithOne(x => x.RetakeAuthorization)
            .HasForeignKey<RetakeAuthorization>(x => x.OriginalEvaluationRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<RetakeAuthorization>().HasOne(x => x.RetakeEvaluationRequest).WithMany()
            .HasForeignKey(x => x.RetakeEvaluationRequestId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<RetakeAuthorization>().HasOne(x => x.RetakeAssessmentScope).WithMany()
            .HasForeignKey(x => x.RetakeAssessmentScopeId).OnDelete(DeleteBehavior.Restrict);

        foreach (var entity in builder.Model.GetEntityTypes().Where(type => type.ClrType.Namespace?.StartsWith("Betcco.Domain", StringComparison.Ordinal) == true))
        {
            builder.Entity(entity.ClrType).Property("CreatedAtUtc").HasColumnType("timestamp with time zone");
            builder.Entity(entity.ClrType).Property("UpdatedAtUtc").HasColumnType("timestamp with time zone");
        }
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        EnsureAssessmentAuditEventsAreAppendOnly();
        EnsureConsentRecordsAreAppendOnly();
        EnsureGuardianConsentsAreAppendOnly();
        EnsureDataSubjectFulfillmentsAreControlled();
        EnsureDataPortabilityExportsAreControlled();
        EnsureDataProcessingRestrictionsAreControlled();
        EnsureReferencedRetentionPoliciesAreImmutable();
        EnsureLegalAcceptancesAreAppendOnly();
        EnsureAcceptedLegalDocumentSnapshotsAreImmutable();
        EnsureProcessingActivitiesPreserveHistory();
        EnsureSubprocessorRecordsPreserveHistory();
        EnsureSubprocessorActivityLinksPreserveHistory();
        EnsureFinancialLedgerIsAppendOnly();
        EnsurePayoutsAreControlled();
        EnsureRefundsAreControlled();
        EnsureReconciliationCasesAreControlled();
        EnsureDisputesAreControlled();
        EnsureCommercialDocumentsAreAppendOnly();
        EnsureFiscalSubmissionsAreControlled();
        EnsureDoubleEntryLedgerIsBalancedAndAppendOnly();
        EnsurePaymentTransitionsAndFinalizedSnapshotsAreProtected();
        EnsureCartFinalizationIsControlled();
        EnsureInternalVerificationSamplesAreControlled();
        StampEntities();
        EnrichAuditLogs();
        return base.SaveChangesAsync(cancellationToken);
    }
}
