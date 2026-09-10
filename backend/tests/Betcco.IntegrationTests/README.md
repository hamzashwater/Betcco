# BETCCO integration tests

The integration-test project contains two deliberately different test layers.

- Fast EF InMemory tests verify orchestration, validation, authorization, and business rules that do not depend on database behavior.
- Tests with `Category=PostgreSQLFinance` verify migrations, concurrent connections, serializable transactions, row locking, optimistic concurrency, and PostgreSQL constraints for critical finance workflows.

The PostgreSQL finance slice and `RegistrationAtomicityPostgresTests` require `BETCCO_TEST_POSTGRES_ADMIN`. The value must be an administrative connection to a disposable non-production PostgreSQL server where the test process may create and drop uniquely named temporary databases. The tests never use the configured database for application data.

PostgreSQL finance tests intentionally fail with a clear configuration error when the variable is unavailable. They do not skip. `quality.yml` supplies the connection to its ephemeral PostgreSQL service, making the PostgreSQL finance slice and SE-006 CI/release required.

Run the required database slice locally with:

```powershell
dotnet test backend/tests/Betcco.IntegrationTests/Betcco.IntegrationTests.csproj --filter "Category=PostgreSQLFinance|FullyQualifiedName~RegistrationAtomicityPostgresTests"
```

For local fast feedback when PostgreSQL is intentionally unavailable, run only the InMemory layer:

```powershell
dotnet test backend/tests/Betcco.IntegrationTests/Betcco.IntegrationTests.csproj --filter "Category!=PostgreSQLFinance&FullyQualifiedName!~RegistrationAtomicityPostgresTests"
```

The existing concurrency-oriented InMemory tests remain useful for fast orchestration coverage, but they do not prove database guarantees. In particular, concurrency claims in `CouponRedemptionIntegrityTests`, `PaymentLifecycleTests`, `PaymentSessionRecoveryTests`, `RefundFoundationTests`, `LedgerFoundationTests`, `WalletAccountingTests`, and `PayoutExecutionFoundationTests` are backed by the PostgreSQL finance slice for database-sensitive guarantees.
