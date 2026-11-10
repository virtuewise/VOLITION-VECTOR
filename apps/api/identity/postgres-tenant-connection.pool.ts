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

const ACCOUNT_OWNED_TABLES = [
  "account_profiles",
  "account_audit_events",
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
  readonly owns_account_tables: boolean;
  readonly member_of_account_owner_role: boolean;
  readonly member_of_privileged_role: boolean;
  readonly all_tenant_tables_force_rls: boolean;
  readonly all_account_tables_force_rls: boolean;
  readonly can_read_external_identities: boolean;
  readonly can_read_accounts: boolean;
  readonly can_read_account_profiles: boolean;
  readonly can_write_account_profiles: boolean;
  readonly can_mutate_account_profiles: boolean;
  readonly can_read_account_audit_events: boolean;
  readonly can_insert_account_audit_events: boolean;
  readonly can_mutate_account_audit_events: boolean;
  readonly can_read_private_identity_email: boolean;
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
 * Adapts node-postgres to the tenant and account transaction ports. The pool
 * refuses to start with a superuser, BYPASSRLS/replication role, tenant- or
 * account-table owner, or role that can assume one of those privileged roles.
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
           FROM pg_class AS c
           JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
           WHERE nsp.nspname = 'public'
             AND c.relname = ANY($2::text[])
             AND c.relowner = r.oid
         ) AS owns_account_tables,
         EXISTS (
           SELECT 1
           FROM pg_class AS c
           JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
           WHERE nsp.nspname = 'public'
             AND c.relname = ANY($2::text[])
             AND pg_has_role(r.oid, c.relowner, 'MEMBER')
         ) AS member_of_account_owner_role,
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
         (
           SELECT count(*) = cardinality($2::text[])
           FROM pg_class AS c
           JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
           WHERE nsp.nspname = 'public'
             AND c.relname = ANY($2::text[])
             AND c.relrowsecurity
             AND c.relforcerowsecurity
         ) AS all_account_tables_force_rls,
         (
           has_column_privilege(current_user, 'public.external_identities', 'account_id', 'SELECT')
           AND has_column_privilege(current_user, 'public.external_identities', 'issuer', 'SELECT')
           AND has_column_privilege(current_user, 'public.external_identities', 'subject', 'SELECT')
         ) AS can_read_external_identities,
         (
           has_column_privilege(current_user, 'public.accounts', 'id', 'SELECT')
           AND has_column_privilege(current_user, 'public.accounts', 'status', 'SELECT')
         ) AS can_read_accounts,
         has_table_privilege(current_user, 'public.account_profiles', 'SELECT')
           AS can_read_account_profiles,
         (
           has_table_privilege(current_user, 'public.account_profiles', 'INSERT')
           AND has_table_privilege(current_user, 'public.account_profiles', 'UPDATE')
         ) AS can_write_account_profiles,
         (
           has_table_privilege(current_user, 'public.account_profiles', 'DELETE')
           OR has_table_privilege(current_user, 'public.account_profiles', 'TRUNCATE')
         ) AS can_mutate_account_profiles,
         has_table_privilege(current_user, 'public.account_audit_events', 'SELECT')
           AS can_read_account_audit_events,
         has_table_privilege(current_user, 'public.account_audit_events', 'INSERT')
           AS can_insert_account_audit_events,
         (
           has_table_privilege(current_user, 'public.account_audit_events', 'UPDATE')
           OR has_table_privilege(current_user, 'public.account_audit_events', 'DELETE')
           OR has_table_privilege(current_user, 'public.account_audit_events', 'TRUNCATE')
         ) AS can_mutate_account_audit_events,
         (
           has_column_privilege(current_user, 'public.external_identities', 'email', 'SELECT')
           OR has_column_privilege(current_user, 'public.external_identities', 'email_verified', 'SELECT')
         ) AS can_read_private_identity_email
       FROM pg_roles AS r
       WHERE r.rolname = current_user`,
      [[...TENANT_OWNED_TABLES], [...ACCOUNT_OWNED_TABLES]],
    );

    const runtimeRole = result.rows[0];
    if (
      !runtimeRole ||
      runtimeRole.is_superuser ||
      runtimeRole.bypasses_rls ||
      runtimeRole.is_replication_role ||
      runtimeRole.owns_tenant_tables ||
      runtimeRole.member_of_tenant_owner_role ||
      runtimeRole.owns_account_tables ||
      runtimeRole.member_of_account_owner_role ||
      runtimeRole.member_of_privileged_role ||
      !runtimeRole.all_tenant_tables_force_rls ||
      !runtimeRole.all_account_tables_force_rls ||
      !runtimeRole.can_read_external_identities ||
      !runtimeRole.can_read_accounts ||
      !runtimeRole.can_read_account_profiles ||
      !runtimeRole.can_write_account_profiles ||
      runtimeRole.can_mutate_account_profiles ||
      runtimeRole.can_read_account_audit_events ||
      !runtimeRole.can_insert_account_audit_events ||
      runtimeRole.can_mutate_account_audit_events ||
      runtimeRole.can_read_private_identity_email
    ) {
      throw new Error(
        "DATABASE_URL role must be non-privileged and non-owner, use minimal " +
          "identity-column SELECT grants, private account-profile RLS, " +
          "append-only account audit access, and exclude private identity email fields.",
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
