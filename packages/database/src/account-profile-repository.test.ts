import { describe, expect, it, vi } from "vitest";
import { PostgresAccountProfileRepository } from "./account-profile-repository.js";
import type { TenantConnectionPool } from "./tenant-transaction.js";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const UPDATED_AT = new Date("2026-11-10T08:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    account_id: ACCOUNT_ID,
    display_name: "Current Name",
    locale: "en",
    time_zone: "UTC",
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

function makePool(
  queryImplementation: (
    statement: string,
    parameters?: readonly unknown[],
  ) => Promise<{ rows: unknown[] }> = async () => ({ rows: [] }),
) {
  const query = vi.fn(queryImplementation);
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  return {
    pool: { connect } as unknown as TenantConnectionPool,
    connect,
    query,
    release,
  };
}

describe("PostgresAccountProfileRepository", () => {
  it("reads only the profile bound to the transaction-local account context", async () => {
    const { pool, query } = makePool(async (statement) =>
      statement.includes("FROM account_profiles")
        ? { rows: [row()] }
        : { rows: [] },
    );
    const repository = new PostgresAccountProfileRepository(pool);

    await expect(repository.getForAccount(ACCOUNT_ID)).resolves.toEqual({
      accountId: ACCOUNT_ID,
      displayName: "Current Name",
      locale: "en",
      timeZone: "UTC",
      updatedAt: UPDATED_AT,
    });

    expect(query).toHaveBeenCalledWith(
      "SELECT set_config('app.account_id', $1, true)",
      [ACCOUNT_ID],
    );
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("FROM account_profiles"),
      ),
    ).toBe(true);
  });

  it("updates the profile and audits changed field names without storing values", async () => {
    const saved = row({ display_name: "Updated Name" });
    const { pool, query } = makePool(async (statement) => {
      if (statement.includes("FOR UPDATE")) return { rows: [row()] };
      if (statement.includes("INSERT INTO account_profiles")) {
        return { rows: [saved] };
      }
      return { rows: [] };
    });
    const repository = new PostgresAccountProfileRepository(pool);

    await expect(
      repository.updateForAccount({
        accountId: ACCOUNT_ID,
        displayName: " Updated Name ",
      }),
    ).resolves.toMatchObject({ displayName: "Updated Name" });

    const auditCall = query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO account_audit_events"),
    );
    expect(auditCall?.[1]?.[1]).toBe("account.profile.updated");
    expect(auditCall?.[1]?.[2]).toBe(
      JSON.stringify({ changedFields: ["displayName"] }),
    );
    expect(auditCall?.[1]?.[2]).not.toContain("Updated Name");
  });

  it("does not emit an audit event for a no-op update", async () => {
    const { pool, query } = makePool(async (statement) =>
      statement.includes("FOR UPDATE") ? { rows: [row()] } : { rows: [] },
    );
    const repository = new PostgresAccountProfileRepository(pool);

    await expect(
      repository.updateForAccount({
        accountId: ACCOUNT_ID,
        displayName: "Current Name",
      }),
    ).resolves.toMatchObject({ displayName: "Current Name" });

    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO account_profiles"),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO account_audit_events"),
      ),
    ).toBe(false);
  });

  it("creates a private profile with safe defaults for omitted fields", async () => {
    const saved = row({
      display_name: "New Person",
      locale: "en",
      time_zone: "UTC",
    });
    const { pool, query } = makePool(async (statement) =>
      statement.includes("FOR UPDATE")
        ? { rows: [] }
        : statement.includes("INSERT INTO account_profiles")
          ? { rows: [saved] }
          : { rows: [] },
    );
    const repository = new PostgresAccountProfileRepository(pool);

    await expect(
      repository.updateForAccount({
        accountId: ACCOUNT_ID,
        displayName: "New Person",
      }),
    ).resolves.toMatchObject({
      displayName: "New Person",
      locale: "en",
      timeZone: "UTC",
    });

    const insertCall = query.mock.calls.find(([statement]) =>
      statement.includes("INSERT INTO account_profiles"),
    );
    expect(insertCall?.[1]).toEqual([ACCOUNT_ID, "New Person", "en", "UTC"]);
  });

  it.each([
    { displayName: "" },
    { displayName: "x".repeat(121) },
    { displayName: "Bad\nName" },
    { locale: "en_US" },
    { timeZone: "Mars/Olympus" },
  ])("rejects invalid profile values before opening a transaction", async (patch) => {
    const { pool, connect } = makePool();
    const repository = new PostgresAccountProfileRepository(pool);

    await expect(
      repository.updateForAccount({
        accountId: ACCOUNT_ID,
        ...patch,
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects an empty patch before opening a transaction", async () => {
    const { pool, connect } = makePool();
    const repository = new PostgresAccountProfileRepository(pool);

    await expect(
      repository.updateForAccount({ accountId: ACCOUNT_ID }),
    ).rejects.toThrow("At least one profile field");
    expect(connect).not.toHaveBeenCalled();
  });
});
