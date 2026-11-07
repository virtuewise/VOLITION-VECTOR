import { Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type {
  TenantConnection,
  TenantConnectionPool,
  TenantQueryResult,
} from "@volition/database";

const TENANT_OWNED_TABLES = [
  "organizations",
  "organization_memberships",
  "organization_invitations",
  "organization_invitation_rate_limits",
  "opportunities",
  "opportunity_applications",
  "conversations",
  "conversation_participants",
  "messages",
  "project_workspaces",
  "project_milestones",
  "journal_entries",
  "journal_entry_lines",
  "trust_evidence",
  "trust_evidence_decisions",
  "service_listings",
  "audit_events",
  "outbox_events",
] as const;

interface ExternalIdentityAccountRow extends QueryResultRow {
  readonly account_id: string;
  readonly account_status: string;
}

interface RuntimeRoleRow extends QueryResultRow {
  readonly is_superuser: boolean;
  readonly bypasses_rls: boolean;
  readonly is_replication_role: boolean;
  readonly owns_tenant_tables: boolean;
  readonly member_of_tenant_owner_role: boolean;
  readonly member_of_privileged_role: boolean;
  readonly all_tenant_tables_force_rls: boolean;
  readonly can_read_external_identities: boolean;
  readonly can_read_accounts: boolean;
}

class PostgresTenantConnection implements TenantConnection {
  constructor(private readonly client: PoolClient) {}

  async query(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<TenantQueryResult> {
    const result = await this.client.query(
      statement,
      parameters === undefined ? undefined : [...parameters],
    );
    return { rows: result.rows };
  }

  release(error?: Error): void {
    this.client.release(error);
  }
}

/**
 * Adapts node-postgres to the tenant transaction port. The pool refuses to
 * start with a superuser, BYPASSRLS/replication role, tenant-table owner, or
 * role that can assume one of those privileged roles.
 */
export class PostgresTenantConnectionPool
  implements TenantConnectionPool, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PostgresTenantConnectionPool.name);

  constructor(private readonly pool: Pool) {
    this.pool.on("error", (error) => {
      this.logger.error(
        "Unexpected error from an idle PostgreSQL client.",
        error.stack,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    const result = await this.pool.query<RuntimeRoleRow>(
      `SELECT
         r.rolsuper AS is_superuser,
         r.rolbypassrls AS bypasses_rls,
         r.rolreplication AS is_replication_role,
         EXISTS (
           SELECT 1
           FROM pg_class AS c
           JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
           WHERE nsp.nspname = 'public'
             AND c.relname = ANY($1::text[])
             AND c.relowner = r.oid
         ) AS owns_tenant_tables,
         EXISTS (
           SELECT 1
           FROM pg_class AS c
           JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
           WHERE nsp.nspname = 'public'
             AND c.relname = ANY($1::text[])
             AND pg_has_role(r.oid, c.relowner, 'MEMBER')
         ) AS member_of_tenant_owner_role,
         EXISTS (
           SELECT 1
           FROM pg_roles AS privileged
           WHERE (
             privileged.rolsuper OR
             privileged.rolbypassrls OR
             privileged.rolreplication
           )
             AND pg_has_role(r.oid, privileged.oid, 'MEMBER')
         ) AS member_of_privileged_role,
         (
           SELECT count(*) = cardinality($1::text[])
           FROM pg_class AS c
           JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
           WHERE nsp.nspname = 'public'
             AND c.relname = ANY($1::text[])
             AND c.relrowsecurity
             AND c.relforcerowsecurity
         ) AS all_tenant_tables_force_rls,
         has_table_privilege(current_user, 'public.external_identities', 'SELECT') AS can_read_external_identities,
         has_table_privilege(current_user, 'public.accounts', 'SELECT') AS can_read_accounts
       FROM pg_roles AS r
       WHERE r.rolname = current_user`,
      [[...TENANT_OWNED_TABLES]],
    );

    const runtimeRole = result.rows[0];
    if (
      !runtimeRole ||
      runtimeRole.is_superuser ||
      runtimeRole.bypasses_rls ||
      runtimeRole.is_replication_role ||
      runtimeRole.owns_tenant_tables ||
      runtimeRole.member_of_tenant_owner_role ||
      runtimeRole.member_of_privileged_role ||
      !runtimeRole.all_tenant_tables_force_rls ||
      !runtimeRole.can_read_external_identities ||
      !runtimeRole.can_read_accounts
    ) {
      throw new Error(
        "DATABASE_URL must use a non-privileged, non-owner PostgreSQL role with identity-table SELECT access and forced tenant RLS.",
      );
    }
  }

  async resolveActiveAccountId(
    issuer: string,
    subject: string,
  ): Promise<string | null> {
    const result = await this.pool.query<ExternalIdentityAccountRow>(
      `SELECT a.id::text AS account_id, a.status AS account_status
       FROM external_identities AS ei
       JOIN accounts AS a ON a.id = ei.account_id
       WHERE ei.issuer = $1 AND ei.subject = $2
       LIMIT 2`,
      [issuer, subject],
    );

    // The unique (issuer, subject) constraint is authoritative; fail closed
    // if schema drift or corruption ever makes the lookup non-unique.
    if (
      result.rows.length !== 1 ||
      result.rows[0]?.account_status !== "active"
    ) {
      return null;
    }
    return result.rows[0].account_id;
  }

  async connect(): Promise<TenantConnection> {
    return new PostgresTenantConnection(await this.pool.connect());
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export function assertDatabaseTlsConfiguration(
  connectionString: string,
  nodeEnvironment = process.env["NODE_ENV"],
): void {
  if (nodeEnvironment !== "production") return;

  let sslMode: string | null;
  try {
    sslMode = new URL(connectionString).searchParams.get("sslmode");
  } catch {
    throw new Error(
      "Production DATABASE_URL must be a PostgreSQL URL with sslmode=verify-full.",
    );
  }

  if (sslMode !== "verify-full") {
    throw new Error(
      "Production DATABASE_URL must specify sslmode=verify-full.",
    );
  }
}

export function createPostgresTenantConnectionPool(
  connectionString: string,
): PostgresTenantConnectionPool {
  if (!connectionString.trim()) {
    throw new Error("DATABASE_URL must not be empty.");
  }
  assertDatabaseTlsConfiguration(connectionString);

  return new PostgresTenantConnectionPool(
    new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: "volition-api",
    }),
  );
}
