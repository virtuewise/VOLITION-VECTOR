import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresTenantConnectionPool } from "./postgres-tenant-connection.pool.js";

function makePool(roleRows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows: roleRows });
  const connect = vi.fn();
  const end = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn();
  const pool = { query, connect, end, on } as unknown as Pool;
  return { pool, query, connect, end, on };
}

describe("PostgresTenantConnectionPool", () => {
  it("accepts a non-owner runtime role with forced RLS", async () => {
    const { pool, query } = makePool([
      {
        is_superuser: false,
        bypasses_rls: false,
        owns_tenant_tables: false,
        all_tenant_tables_force_rls: true,
      },
    ]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).resolves.toBeUndefined();
    expect(query.mock.calls[0]?.[0]).toContain("rolbypassrls");
    expect(query.mock.calls[0]?.[0]).toContain("relowner");
    expect(query.mock.calls[0]?.[0]).toContain("relforcerowsecurity");
  });

  it.each([
    {
      is_superuser: true,
      bypasses_rls: false,
      owns_tenant_tables: false,
        all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: true,
      owns_tenant_tables: false,
        all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: false,
      owns_tenant_tables: true,
      all_tenant_tables_force_rls: true,
    },
    {
      is_superuser: false,
      bypasses_rls: false,
      owns_tenant_tables: false,
      all_tenant_tables_force_rls: false,
    },
  ])("rejects an unsafe PostgreSQL runtime role", async (role) => {
    const { pool } = makePool([role]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /non-superuser, non-owner role/,
    );
  });

  it("rejects a role lookup that returns no current role", async () => {
    const { pool } = makePool([]);
    const adapter = new PostgresTenantConnectionPool(pool);

    await expect(adapter.onModuleInit()).rejects.toThrow(
      /non-superuser, non-owner role/,
    );
  });

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
