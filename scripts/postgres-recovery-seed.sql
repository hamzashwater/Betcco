\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "AspNetUsers" ("Id", "DisplayName", "IsFrozen", "MustChangePassword", "Email", "NormalizedEmail", "UserName", "NormalizedUserName", "EmailConfirmed", "PhoneNumberConfirmed", "TwoFactorEnabled", "LockoutEnabled", "AccessFailedCount")
VALUES ('a1000000-0000-4000-8000-000000000001', 'Recovery Drill Synthetic Student', false, false, 'recovery-drill@example.invalid', 'RECOVERY-DRILL@EXAMPLE.INVALID', 'recovery-drill@example.invalid', 'RECOVERY-DRILL@EXAMPLE.INVALID', true, false, false, true, 0)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "LearningTracks" ("Id", "Slug", "ArabicName", "EnglishName", "IsBtecFocused", "IsVisible", "SortOrder", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('a2000000-0000-4000-8000-000000000001', 'recovery-drill-track', 'مسار اختبار الاستعادة', 'Recovery Drill Track', true, true, 999, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "Grades" ("Id", "Slug", "ArabicName", "EnglishName", "LearningTrackId", "IsVisible", "SortOrder", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('a3000000-0000-4000-8000-000000000001', 'recovery-drill-grade', 'صف اختبار الاستعادة', 'Recovery Drill Grade', 'a2000000-0000-4000-8000-000000000001', true, 999, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "Specializations" ("Id", "Slug", "ArabicName", "EnglishName", "LearningTrackId", "IsVisible", "SortOrder", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('a4000000-0000-4000-8000-000000000001', 'recovery-drill-specialization', 'تخصص اختبار الاستعادة', 'Recovery Drill Specialization', 'a2000000-0000-4000-8000-000000000001', true, 999, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "Courses" ("Id", "Slug", "ArabicTitle", "EnglishTitle", "ArabicDescription", "EnglishDescription", "LearningTrackId", "GradeId", "SpecializationId", "Status", "Price", "Currency", "IsFree", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('a5000000-0000-4000-8000-000000000001', 'recovery-drill-course', 'مقرر اختبار الاستعادة', 'Recovery Drill Course', 'بيانات اصطناعية لاختبار الاستعادة', 'Synthetic recovery drill data', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 0, 25.00, 'JOD', false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "Enrollments" ("Id", "StudentUserId", "CourseId", "EnrolledAtUtc", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('a6000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "TaskTypes" ("Id", "ArabicName", "EnglishName", "IsActive", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('a7000000-0000-4000-8000-000000000001', 'تقييم اختبار الاستعادة', 'Recovery Drill Evaluation', true, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "RubricTemplates" ("Id", "ArabicTitle", "EnglishTitle", "GradeId", "SpecializationId", "TaskTypeId", "Version", "AssessmentRuleSetVersion", "AssessmentRuleSetJson", "IsActive", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('a8000000-0000-4000-8000-000000000001', 'معيار اختبار الاستعادة', 'Recovery Drill Rubric', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 1, 'btec-internal-v1', '{}', true, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "EvaluationRequests" ("Id", "StudentUserId", "GradeId", "SpecializationId", "TaskTypeId", "RubricTemplateId", "Status", "Price", "Currency", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted", "CriteriaSnapshotJson", "EvaluatorCriteriaPlanJson", "AssessmentRuleSetVersion", "AssessmentRuleSetSnapshotJson", "SectionResultsJson", "SubmissionAttemptNumber")
VALUES ('a9000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 0, 12.50, 'JOD', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false, '[]', '[]', 'btec-internal-v1', '{}', '[]', 1)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "LedgerAccounts" ("Id", "Code", "Currency", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted") VALUES
('aa000000-0000-4000-8000-000000000001', 0, 'JOD', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false),
('aa000000-0000-4000-8000-000000000002', 1, 'JOD', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "LedgerTransactions" ("Id", "EventType", "Currency", "BusinessEventReference", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted")
VALUES ('ab000000-0000-4000-8000-000000000001', 0, 'JOD', 'postgres-recovery-drill:synthetic-sale:v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "LedgerEntries" ("Id", "LedgerTransactionId", "LedgerAccountId", "Side", "Amount", "Currency", "CreatedAtUtc", "UpdatedAtUtc", "IsDeleted") VALUES
('ac000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 0, 25.00, 'JOD', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false),
('ac000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000002', 1, 25.00, 'JOD', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false)
ON CONFLICT ("Id") DO NOTHING;

COMMIT;
