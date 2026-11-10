import { describe, expect, it, vi } from "vitest";
import { withAccountTransaction } from "./account-transaction.js";
import type { TenantConnectionPool } from "./tenant-transaction.js";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

function makePool() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const pool = { connect } as unknown as TenantConnectionPool;
  return { pool, connect, query, release };
}

describe("withAccountTransaction", () => {
  it("binds a canonical account ID transaction-locally and commits", async () => {
    const { pool, connect, query, release } = makePool();

    await expect(
      withAccountTransaction(
        pool,
        ` ${ACCOUNT_ID.toUpperCase()} `,
        async (client) => {
          await client.query("SELECT 1");
          return "profile";
        },
      ),
    ).resolves.toBe("profile");

    expect(connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT set_config('app.account_id', $1, true)",
      [ACCOUNT_ID],
    );
    expect(query).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rejects invalid account IDs before acquiring a connection", async () => {
    const { pool, connect } = makePool();

    await expect(
      withAccountTransaction(pool, "not-a-uuid", async () => undefined),
    ).rejects.toBeInstanceOf(TypeError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rolls back failed work and releases the connection", async () => {
    const { pool, query, release } = makePool();
    const failure = new Error("profile write failed");

    await expect(
      withAccountTransaction(pool, ACCOUNT_ID, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("discards a connection when BEGIN leaves protocol state uncertain", async () => {
    const { pool, query, release } = makePool();
    const failure = new Error("connection lost during BEGIN");
    query.mockRejectedValueOnce(failure);

    await expect(
      withAccountTransaction(pool, ACCOUNT_ID, async () => undefined),
    ).rejects.toBe(failure);
    expect(release).toHaveBeenCalledWith(failure);
  });
});
