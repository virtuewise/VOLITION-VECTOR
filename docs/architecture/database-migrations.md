# Database migration operations

## Source of truth

Versioned PostgreSQL SQL migrations live in `packages/database/prisma/migrations/<timestamp>_<name>/migration.sql`. The directory name is retained for historical compatibility; this repository does not use Prisma Migrate or a Prisma schema file.

The API's migration command is compiled from `apps/api/src/scripts/migrate.ts`:

```sh
pnpm --filter @volition/api... run build
pnpm --filter @volition/api db:migrate
```

It requires `DATABASE_MIGRATION_URL`, a dedicated migration-owner connection. It must never use the restricted application runtime role.

## Runner guarantees

- Acquires a PostgreSQL advisory lock so concurrent deploy jobs cannot apply the same migration simultaneously.
- Applies each SQL file in lexical migration-directory order, with one transaction per migration.
- Records successful migrations in `public.vv_schema_migrations` with a SHA-256 checksum and timestamp.
- Skips an already-applied migration only when its checksum still matches.
- Fails closed if an applied migration file is edited; create a new migration instead.
- Supports a verified pre-runner baseline by inserting a migration name with a NULL checksum. The next successful runner invocation seals that row to the current file checksum without reapplying the SQL.
- Does not run automatically during API startup. Runtime application credentials do not receive DDL privileges or access to the migration ledger. The API startup guard also rejects public-schema CREATE, inherited default table/sequence grants, access to the migration ledger, and mutation privileges on append-only audit/journal/outbox/evidence-decision tables.

## Environment separation

- `DATABASE_MIGRATION_URL`: migration-owner secret available only to a controlled migration job or operator session.
- `DATABASE_URL`: non-owner, non-superuser, non-replication application role with no `BYPASSRLS`, minimal identity-column reads and tenant-scoped table grants.
- Never store the migration-owner URL in the runtime API environment, expose it to a web app, or print either URL in CI logs.

## CI

The PostgreSQL tenant-security workflow builds and runs the migration command twice against a fresh PostgreSQL service. The second invocation verifies idempotency. It then provisions a deliberately restricted test role, verifies the actual API runtime-role startup guard against that live PostgreSQL connection, and runs the RLS, identity mapping, immutable audit/journal/outbox and cross-tenant integration suite. An isolated overprivileged probe role verifies that append-only triggers still reject audit UPDATE/DELETE/TRUNCATE without granting those privileges to the application runtime role.

## Existing Staging baseline

The Neon branch `preview/feat/workos-staging-auth-flow` was provisioned before this runner existed. Its checked-in migrations were applied successfully as one transaction and its schema, forced tenant RLS and restricted `vv_runtime` grants were verified. The matching migration names are recorded with NULL checksums as a one-time baseline; the next controlled migration-runner invocation seals the checksums. The Neon `main` branch and Production environment remain untouched.

## Controlled Staging execution

After this change is merged, `.github/workflows/database-migrate-staging.yml` exposes a manual-only workflow. It runs only from `main`, requires the operator to type `APPLY`, serializes runs, and reads `DATABASE_MIGRATION_URL` from the GitHub `staging` environment secret. Configure that environment with an authorized reviewer and add the migration-owner URL there; do not add it to Vercel or the API runtime environment. The workflow builds and runs the migration command without printing the connection string.

The Staging Neon branch already has a verified baseline ledger. Its 13 NULL-checksum rows are intentionally sealed by the first controlled run; the runner does not reapply those SQL files. Subsequent runs compare checksums and apply only new migrations. Production migration execution is deliberately not provided by this workflow.
