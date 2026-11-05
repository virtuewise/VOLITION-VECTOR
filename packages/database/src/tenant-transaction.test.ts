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
  const release = vi.fn((_error?: Error) => undefined);
  const client: TenantConnection = { query, release };
  const connect = vi.fn(async () => client);
  const pool: TenantConnectionPool = { connect };
  return { pool, query, release, connect };
}

type QueryMock = ReturnType<typeof createPool>["query"];

function expectStatements(query: QueryMock, expected: string[]) {
  expect(query.mock.calls.map(([statement]) => statement)).toEqual(expected);
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
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back when tenant work fails and preserves the original error", async () => {
    const { pool, query, release } = createPool();
    const failure = new Error("query failed");
    const work = vi.fn(async () => {
      throw failure;
    });

    const operation = withTenantTransaction(pool, tenantId, work);
    await expect(operation).rejects.toBe(failure);

    expectStatements(query, [
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rejects an invalid tenant before acquiring a connection", async () => {
    const { pool, connect } = createPool();

    const operation = withTenantTransaction(
      pool,
      "invalid-tenant",
      async () => "unused",
    );
    await expect(operation).rejects.toThrow(TypeError);

    expect(connect).not.toHaveBeenCalled();
  });

  it("does not run tenant work when setting tenant context fails", async () => {
    const { pool, query, release } = createPool();
    const work = vi.fn(async () => "unused");
    query.mockImplementationOnce(async () => ({ rows: [] }));
    query.mockImplementationOnce(async () => {
      throw new Error("set_config failed");
    });

    const operation = withTenantTransaction(pool, tenantId, work);
    await expect(operation).rejects.toThrow("set_config failed");

    expectStatements(query, [
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "ROLLBACK",
    ]);
    expect(work).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("discards a connection when BEGIN fails with uncertain state", async () => {
    const { pool, query, release } = createPool();
    const failure = new Error("connection lost during BEGIN");
    query.mockRejectedValueOnce(failure);

    const operation = withTenantTransaction(
      pool,
      tenantId,
      async () => "unused",
    );
    await expect(operation).rejects.toBe(failure);

    expectStatements(query, ["BEGIN"]);
    expect(release).toHaveBeenCalledWith(failure);
  });

  it("discards a connection when rollback fails", async () => {
    const { pool, query, release } = createPool();
    const operationFailure = new Error("tenant query failed");
    const rollbackFailure = new Error("connection lost during rollback");
    query.mockImplementationOnce(async () => ({ rows: [] }));
    query.mockImplementationOnce(async () => ({ rows: [] }));
    query.mockRejectedValueOnce(operationFailure);
    query.mockRejectedValueOnce(rollbackFailure);

    const operation = withTenantTransaction(pool, tenantId, async () => {
      throw operationFailure;
    });
    await expect(operation).rejects.toBe(operationFailure);

    expectStatements(query, [
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledWith(rollbackFailure);
  });
});
