\set ON_ERROR_STOP on
DO $$
DECLARE
  debit_total numeric;
  credit_total numeric;
  ledger_row_count integer;
BEGIN
  IF to_regclass('public."__EFMigrationsHistory"') IS NULL THEN
    RAISE EXCEPTION 'EF migration history table is missing';
  END IF;
  IF (SELECT max("MigrationId") FROM "__EFMigrationsHistory") <> '20260929131246_AddCourseAccessGrantProvenance' THEN
    RAISE EXCEPTION 'The expected latest BETCCO migration is not present';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "AspNetUsers" WHERE "Id" = 'a1000000-0000-4000-8000-000000000001' AND "DisplayName" = 'Recovery Drill Synthetic Student') THEN
    RAISE EXCEPTION 'Synthetic identity state is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Courses" WHERE "Id" = 'a5000000-0000-4000-8000-000000000001' AND "EnglishTitle" = 'Recovery Drill Course') THEN
    RAISE EXCEPTION 'Synthetic catalogue state is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Enrollments" WHERE "Id" = 'a6000000-0000-4000-8000-000000000001' AND "StudentUserId" = 'a1000000-0000-4000-8000-000000000001' AND "CourseId" = 'a5000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Synthetic learning state is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "EvaluationRequests" WHERE "Id" = 'a9000000-0000-4000-8000-000000000001' AND "Price" = 12.50 AND "Currency" = 'JOD') THEN
    RAISE EXCEPTION 'Synthetic evaluation state or exact price is missing';
  END IF;

  SELECT count(*),
         coalesce(sum(entry."Amount") FILTER (WHERE entry."Side" = 0), 0),
         coalesce(sum(entry."Amount") FILTER (WHERE entry."Side" = 1), 0)
    INTO ledger_row_count, debit_total, credit_total
    FROM "LedgerEntries" entry
    JOIN "LedgerTransactions" transaction ON transaction."Id" = entry."LedgerTransactionId"
   WHERE transaction."Id" = 'ab000000-0000-4000-8000-000000000001';
  IF ledger_row_count <> 2 OR debit_total <> 25.00 OR credit_total <> 25.00 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Synthetic ledger rows are missing or the JOD 25.00 debit/credit totals do not balance';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM "LedgerEntries" entry
      JOIN "LedgerTransactions" transaction ON transaction."Id" = entry."LedgerTransactionId"
      JOIN "LedgerAccounts" account ON account."Id" = entry."LedgerAccountId"
     WHERE transaction."Id" = 'ab000000-0000-4000-8000-000000000001'
       AND (entry."Amount" <= 0 OR entry."Currency" <> 'JOD' OR transaction."Currency" <> 'JOD' OR account."Currency" <> 'JOD')
  ) THEN
    RAISE EXCEPTION 'Synthetic ledger amounts must be positive and consistently denominated in JOD';
  END IF;
END $$;

SELECT json_build_object(
  'latestMigration', (SELECT max("MigrationId") FROM "__EFMigrationsHistory"),
  'migrationIds', (SELECT json_agg("MigrationId" ORDER BY "MigrationId") FROM "__EFMigrationsHistory"),
  'syntheticUserCount', (SELECT count(*) FROM "AspNetUsers" WHERE "Id" = 'a1000000-0000-4000-8000-000000000001'),
  'syntheticCourseCount', (SELECT count(*) FROM "Courses" WHERE "Id" = 'a5000000-0000-4000-8000-000000000001'),
  'syntheticEnrollmentCount', (SELECT count(*) FROM "Enrollments" WHERE "Id" = 'a6000000-0000-4000-8000-000000000001'),
  'evaluationPrice', (SELECT "Price" FROM "EvaluationRequests" WHERE "Id" = 'a9000000-0000-4000-8000-000000000001'),
  'evaluationCurrency', (SELECT "Currency" FROM "EvaluationRequests" WHERE "Id" = 'a9000000-0000-4000-8000-000000000001'),
  'ledgerEntryCount', (SELECT count(*) FROM "LedgerEntries" WHERE "LedgerTransactionId" = 'ab000000-0000-4000-8000-000000000001'),
  'debitTotal', (SELECT sum("Amount") FROM "LedgerEntries" WHERE "LedgerTransactionId" = 'ab000000-0000-4000-8000-000000000001' AND "Side" = 0),
  'creditTotal', (SELECT sum("Amount") FROM "LedgerEntries" WHERE "LedgerTransactionId" = 'ab000000-0000-4000-8000-000000000001' AND "Side" = 1)
)::text;
