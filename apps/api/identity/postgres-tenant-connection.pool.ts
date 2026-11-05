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
  "audit_events",
] as const;

interface RuntimeRoleRow extends QueryResultRow {
  readonly is_superuser: boolean;
  readonly bypasses_rls: boolean;
  readonly owns_tenant_tables: boolean;
  readonly all_tenant_tables_force_rls: boolean;
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
 * start when DATABASE_URL authenticates as a superuser, BYPASSRLS role or
 * owner of a tenant-protected table.
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
         role.rolsuper AS is_superuser,
         role.rolbypassrls AS bypasses_rls,
         EXISTS (
           SELECT 1
           FROM pg_class AS relation
           JOIN pg_namespace AS schema
             ON schema.oid = relation.relnamespace
           WHERE schema.nspname = 'public'
             AND relation.relname = ANY($1::text[])
             AND relation.relowner = role.oid
         ) AS owns_tenant_tables,
         (
           SELECT count(*) = cardinality($1::text[])
           FROM pg_class AS relation
           JOIN pg_namespace AS schema
             ON schema.oid = relation.relnamespace
           WHERE schema.nspname = 'public'
             AND relation.relname = ANY($1::text[])
             AND relation.relrowsecurity
             AND relation.relforcerowsecurity
         ) AS all_tenant_tables_force_rls
       FROM pg_roles AS role
       WHERE role.rolname = current_user`,
      [[...TENANT_OWNED_TABLES]],
    );

    const runtimeRole = result.rows[0];
    if (
      !runtimeRole ||
      runtimeRole.is_superuser ||
      runtimeRole.bypasses_rls ||
      runtimeRole.owns_tenant_tables ||
      !runtimeRole.all_tenant_tables_force_rls
    ) {
      throw new Error(
        "DATABASE_URL must use a non-superuser, non-owner role without BYPASSRLS, and all tenant tables must enforce RLS.",
      );
    }
  }

  async connect(): Promise<TenantConnection> {
    return new PostgresTenantConnection(await this.pool.connect());
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export function createPostgresTenantConnectionPool(
  connectionString: string,
): PostgresTenantConnectionPool {
  if (!connectionString.trim()) {
    throw new Error("DATABASE_URL must not be empty.");
  }

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
