import { describe, expect, it, vi } from "vitest";
import {
  withTenantTransaction,
  type TenantConnection,
  type TenantConnectionPool,
} from "./tenant-transaction.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createPool() {
  const query = vi.fn(
    async (_statement: string, _parameters?: readonly unknown[]) => ({
      rows: [] as readonly unknown[],
    }),
  );
  const release = vi.fn();
  const client: TenantConnection = { query, release };
  const connect = vi.fn(async () => client);
  const pool: TenantConnectionPool = { connect };
  return { pool, query, release, connect };
}

describe("withTenantTransaction", () => {
  it("sets a parameterized, transaction-local tenant before work", async () => {
    const { pool, query, release } = createPool();
    const work = vi.fn(async () => "result");

    await expect(withTenantTransaction(pool, tenantId, work)).resolves.toBe(
      "result",
    );

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.tenant_id', $1, true)", [tenantId]],
      ["COMMIT"],
    ]);
    expect(work).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back when tenant work fails and preserves the original error", async () => {
    const { pool, query, release } = createPool();
    const failure = new Error("query failed");
    const work = vi.fn(async () => {
      throw failure;
    });

    await expect(withTenantTransaction(pool, tenantId, work)).rejects.toBe(
      failure,
    );

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects an invalid tenant before acquiring a connection", async () => {
    const { pool, connect } = createPool();

    await expect(
      withTenantTransaction(pool, "invalid-tenant", async () => "unused"),
    ).rejects.toThrow(TypeError);

    expect(connect).not.toHaveBeenCalled();
  });

  it("rolls back if setting tenant context fails", async () => {
    const { pool, query, release } = createPool();
    query.mockImplementationOnce(async () => ({ rows: [] }));
    query.mockImplementationOnce(async () => {
      throw new Error("set_config failed");
    });

    await expect(
      withTenantTransaction(pool, tenantId, async () => "unused"),
    ).rejects.toThrow("set_config failed");

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
