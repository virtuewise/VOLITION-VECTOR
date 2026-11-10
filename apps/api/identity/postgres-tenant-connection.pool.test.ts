import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  assertDatabaseTlsConfiguration,
  PostgresTenantConnectionPool,
} from "./postgres-tenant-connection.pool.js";

const SAFE_ACCOUNT_ROLE_DEFAULTS = {
  owns_account_tables: false,
  member_of_account_owner_role: false,
  all_account_tables_force_rls: true,
  can_read_account_profiles: true,
  can_write_account_profiles: true,
  can_insert_account_audit_events: true,
  can_mutate_account_audit_events: false,
};

function makePool(roleRows: unknown[] = []) {
  const rows = roleRows.map((role) =>
    Object.assign({}, SAFE_ACCOUNT_ROLE_DEFAULTS, role as object),
  );
  const query = vi.fn().mockResolvedValue({ rows });
  const connect = vi.fn();
  const end = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn();
  const pool = { query, connect, end, on } as unknown as Pool;
  return { pool, query, connect, end, on };
}

describe("PostgresTenantConnectionPool", () => {
  it("requires hostname-verified TLS for production URLs", () => {
    expect(() =>
      assertDatabaseTlsConfiguration(
        "postgres://runtime:secret@db.example.test/app",
        "production",
      ),
    ).toThrow(/sslmode=verify-full/);
    expect(() =>
      assertDatabaseTlsConfiguration(
        "postgres://runtime:secret@db.example.test/app?sslmode=require",
        "production",
      ),
    ).toThrow(/sslmode=verify-full/);
    expect(() =>
      assertDatabaseTlsConfiguration(
        "postgres://runtime:secret@db.example.test/app?sslmode=verify-full",
        "production",
      ),
    ).not.toThrow();
    expect(() =>
      assertDatabaseTlsConfiguration(
        "postgres://runtime:secret@localhost/app",
        "development",
      ),
    ).not.toThrow();
  });

  it("accepts a least-privilege role with forced tenant RLS", async () => {
    const { pool, query } = makePool([
      {
        is_superuser: false,
        bypasses_rls: false,
        is_replication_role: false,
        owns_tenant_tables: false,
        member_of_tenant_owner_role: false,
        member_of_privileged_role: false,
        all_tenant_tables_force_rls: true,
        can_read_external_identities: true,
        can_read_accounts: true,
        can_read_private_identity_email: false,
      },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).resolves.toBeUndefined();
    expect(query.mock.calls[0]?.[0]).toContain("rolbypassrls");
    expect(query.mock.calls[0]?.[0]).toContain("relowner");
    expect(query.mock.calls[0]?.[0]).toContain("pg_has_role");
    expect(query.mock.calls[0]?.[0]).toContain("relforcerowsecurity");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain(
      "organization_invitation_rate_limits",
    );
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("opportunities");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("opportunity_applications");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("project_workspaces");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("project_milestones");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("journal_entries");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("journal_entry_lines");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("trust_evidence");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("trust_evidence_decisions");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("conversations");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain(
      "conversation_participants",
    );
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("messages");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("service_listings");
    expect(query.mock.calls[0]?.[1]?.[0]).toContain("outbox_events");
    expect(query.mock.calls[0]?.[1]?.[1]).toContain("account_profiles");
    expect(query.mock.calls[0]?.[1]?.[1]).toContain("account_audit_events");
    expect(query.mock.calls[0]?.[0]).toContain("all_account_tables_force_rls");
    expect(query.mock.calls[0]?.[0]).toContain("can_insert_account_audit_events");
  });

  it("rejects account-owned tables without forced account RLS", async () => {
    const { pool } = makePool([{ all_account_tables_force_rls: false }]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /private account-profile RLS/,
    );
  });

  it("rejects missing account profile or audit insert grants", async () => {
    const { pool } = makePool([
      {
        can_read_account_profiles: false,
        can_insert_account_audit_events: false,
      },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /private account-profile RLS/,
    );
  });

  it("rejects runtime mutation privileges on account audit events", async () => {
    const { pool } = makePool([{ can_mutate_account_audit_events: true }]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /append-only account audit access/,
    );
  });

  it("rejects a runtime role that owns account tables or can assume their owner", async () => {
    const { pool } = makePool([
      { owns_account_tables: true },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /non-privileged and non-owner/,
    );
  });

  it("rejects a runtime role without external identity lookup grants", async () => {
    const { pool } = makePool([
      {
        is_superuser: false,
        bypasses_rls: false,
        is_replication_role: false,
        owns_tenant_tables: false,
        member_of_tenant_owner_role: false,
        member_of_privileged_role: false,
        all_tenant_tables_force_rls: true,
        can_read_external_identities: false,
        can_read_accounts: true,
        can_read_private_identity_email: false,
      },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /minimal identity-column SELECT grants/,
    );
  });

  it("rejects a runtime role without account identity lookup columns", async () => {
    const { pool } = makePool([
      {
        is_superuser: false,
        bypasses_rls: false,
        is_replication_role: false,
        owns_tenant_tables: false,
        member_of_tenant_owner_role: false,
        member_of_privileged_role: false,
        all_tenant_tables_force_rls: true,
        can_read_external_identities: true,
        can_read_accounts: false,
        can_read_private_identity_email: false,
      },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /minimal identity-column SELECT grants/,
    );
  });

  it("rejects a runtime role with private external identity email access", async () => {
    const { pool } = makePool([
      {
        is_superuser: false,
        bypasses_rls: false,
        is_replication_role: false,
        owns_tenant_tables: false,
        member_of_tenant_owner_role: false,
        member_of_privileged_role: false,
        all_tenant_tables_force_rls: true,
        can_read_external_identities: true,
        can_read_accounts: true,
        can_read_private_identity_email: true,
      },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /exclude private identity email fields/,
    );
  });

  it.each([
    {
      is_superuser: true,
      bypasses_rls: false,
      is_replication_role: false,
      owns_tenant_tables: false,
      member_of_tenant_owner_role: false,
      member_of_privileged_role: false,
      all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: true,
      is_replication_role: false,
      owns_tenant_tables: false,
      member_of_tenant_owner_role: false,
      member_of_privileged_role: false,
      all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: false,
      is_replication_role: true,
      owns_tenant_tables: false,
      member_of_tenant_owner_role: false,
      member_of_privileged_role: false,
      all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: false,
      is_replication_role: false,
      owns_tenant_tables: true,
      member_of_tenant_owner_role: false,
      member_of_privileged_role: false,
      all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: false,
      is_replication_role: false,
      owns_tenant_tables: false,
      member_of_tenant_owner_role: true,
      member_of_privileged_role: false,
      all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: false,
      is_replication_role: false,
      owns_tenant_tables: false,
      member_of_tenant_owner_role: false,
      member_of_privileged_role: true,
      all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: false,
      is_replication_role: false,
      owns_tenant_tables: false,
      member_of_tenant_owner_role: false,
      member_of_privileged_role: false,
      all_tenant_tables_force_rls: false,
    },
  ])("rejects an unsafe PostgreSQL runtime role", async (role) => {
    const { pool } = makePool([role]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /DATABASE_URL role must/,
    );
  });

  it("rejects a role lookup that returns no current role", async () => {
    const { pool } = makePool([]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /DATABASE_URL role must/,
    );
  });

  it("resolves a single active account by exact issuer and subject", async () => {
    const { pool, query } = makePool([
      {
        account_id: "7f9a6b2c-1111-4111-8111-111111111111",
        account_status: "active",
      },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(
      adapter.resolveActiveAccountId(
        "https://issuer.example/user_management/client",
        "user_123",
      ),
    ).resolves.toBe("7f9a6b2c-1111-4111-8111-111111111111");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM external_identities"),
      ["https://issuer.example/user_management/client", "user_123"],
    );
  });

  it.each([
    { rows: [] },
    {
      rows: [
        {
          account_id: "7f9a6b2c-1111-4111-8111-111111111111",
          account_status: "suspended",
        },
      ],
    },
    {
      rows: [
        {
          account_id: "7f9a6b2c-1111-4111-8111-111111111111",
          account_status: "active",
        },
        {
          account_id: "8f9a6b2c-1111-4111-8111-111111111112",
          account_status: "active",
        },
      ],
    },
  ])(
    "rejects missing, inactive or non-unique external identity mappings",
    async ({ rows }) => {
      const { pool } = makePool(rows);
      const adapter = new PostgresTenantConnectionPool(pool);

      await expect(
        adapter.resolveActiveAccountId(
          "https://issuer.example/user_management/client",
          "user_123",
        ),
      ).resolves.toBeNull();
    },
  );

  it("adapts parameterized queries and forwards connection discard errors", async () => {
    const clientQuery = vi.fn().mockResolvedValue({
      rows: [{ account_id: "11111111-1111-4111-8111-111111111111" }],
    });
    const release = vi.fn();
    const client = { query: clientQuery, release } as unknown as PoolClient;
    const { pool, connect } = makePool();
    connect.mockResolvedValue(client);
    const adapter = new PostgresTenantConnectionPool(pool);

    const connection = await adapter.connect();
    const result = await connection.query("SELECT $1", ["tenant-id"]);
    const protocolError = new Error("uncertain connection state");
    connection.release(protocolError);

    expect(clientQuery).toHaveBeenCalledWith("SELECT $1", ["tenant-id"]);
    expect(result.rows).toEqual([
      { account_id: "11111111-1111-4111-8111-111111111111" },
    ]);
    expect(release).toHaveBeenCalledWith(protocolError);
  });

  it("closes the underlying pool during Nest shutdown", async () => {
    const { pool, end } = makePool();
    const adapter = new PostgresTenantConnectionPool(pool);

    await adapter.onModuleDestroy();

    expect(end).toHaveBeenCalledOnce();
  });
});
