import type {
  TenantConnection,
  TenantConnectionPool,
} from "@volition/database";
import { describe, expect, it, vi } from "vitest";
import { PostgresMembershipMutationCommand } from "./postgres-membership-mutation.command.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";
const targetAccountId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";

function makePool(rows: readonly unknown[][]) {
  const pending = [...rows];
  const query = vi.fn(
    async (_statement: string, _parameters?: readonly unknown[]) => ({
      rows: pending.shift() ?? [],
    }),
  );
  const release = vi.fn();
  const client: TenantConnection = { query, release };
  const connect = vi.fn(async () => client);
  const pool: TenantConnectionPool = { connect };
  return { pool, query, release };
}

describe("PostgresMembershipMutationCommand", () => {
  it("uses the shared policy and repository for an authorized role change", async () => {
    const { pool, query } = makePool([
      [],
      [],
      [],
      [
        {
          id: "44444444-4444-4444-8444-444444444444",
          account_id: actorAccountId,
          role: "owner",
          status: "active",
        },
      ],
      [
        {
          id: membershipId,
          account_id: targetAccountId,
          role: "member",
          status: "active",
        },
      ],
      [{ active_owner_count: 1 }],
      [
        {
          id: membershipId,
          account_id: targetAccountId,
          role: "viewer",
          status: "active",
        },
      ],
      [],
      [],
    ]);
    const command = new PostgresMembershipMutationCommand(pool);

    await expect(
      command.mutate({
        organizationId,
        actorAccountId,
        targetAccountId,
        action: "change-role",
        requestedRole: "viewer",
      }),
    ).resolves.toEqual({
      membershipId,
      role: "viewer",
      status: "active",
    });

    expect(
      query.mock.calls.some(([statement]) => statement.startsWith("UPDATE")),
    ).toBe(true);
    expect(
      query.mock.calls.some(([statement]) =>
        statement.startsWith("INSERT INTO audit_events"),
      ),
    ).toBe(true);
  });

  it("denies revoking the final active owner without issuing a write", async () => {
    const { pool, query } = makePool([
      [],
      [],
      [],
      [
        {
          id: "44444444-4444-4444-8444-444444444444",
          account_id: actorAccountId,
          role: "owner",
          status: "active",
        },
      ],
      [
        {
          id: membershipId,
          account_id: targetAccountId,
          role: "owner",
          status: "active",
        },
      ],
      [{ active_owner_count: 1 }],
      [],
    ]);
    const command = new PostgresMembershipMutationCommand(pool);

    await expect(
      command.mutate({
        organizationId,
        actorAccountId,
        targetAccountId,
        action: "revoke",
      }),
    ).resolves.toBeNull();

    expect(
      query.mock.calls.some(([statement]) => statement.startsWith("UPDATE")),
    ).toBe(false);
    expect(
      query.mock.calls.some(([statement]) =>
        statement.startsWith("INSERT INTO audit_events"),
      ),
    ).toBe(false);
  });
});
