import { describe, expect, it, vi } from "vitest";
import {
  withAccountTransaction,
  type TenantConnection,
  type TenantConnectionPool,
} from "./tenant-transaction.js";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

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

describe("withAccountTransaction", () => {
  it("sets a parameterized transaction-local account context before work", async () => {
    const { pool, query, release } = createPool();
    const work = vi.fn(async () => "result");

    await expect(withAccountTransaction(pool, ACCOUNT_ID, work)).resolves.toBe(
      "result",
    );

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.account_id', $1, true)", [ACCOUNT_ID]],
      ["COMMIT"],
    ]);
    expect(work).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rejects an invalid account before acquiring a connection", async () => {
    const { pool, connect } = createPool();

    await expect(
      withAccountTransaction(pool, "not-an-account", async () => "unused"),
    ).rejects.toThrow(TypeError);

    expect(connect).not.toHaveBeenCalled();
  });

  it("rolls back account work failures and preserves the original error", async () => {
    const { pool, query, release } = createPool();
    const failure = new Error("account query failed");

    await expect(
      withAccountTransaction(pool, ACCOUNT_ID, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN",
      "SELECT set_config('app.account_id', $1, true)",
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });
});
