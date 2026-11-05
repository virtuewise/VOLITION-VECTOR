import { describe, expect, it, vi } from "vitest";
import type { TenantConnection, TenantConnectionPool } from "./tenant-transaction.js";
import {
  PostgresMembershipRepository,
  type MembershipMutationPolicyInput,
} from "./membership-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";
const targetAccountId = "22222222-2222-4222-8222-222222222222";

function createPool(responses: readonly unknown[][] = []) {
  let responseIndex = 0;
  const query = vi.fn(async (_sql: string, _parameters?: readonly unknown[]) => ({
    rows: (responses[responseIndex++] ?? []) as readonly unknown[],
  }));
  const release = vi.fn();
  const client: TenantConnection = { query, release };
  const connect = vi.fn(async () => client);
  const pool: TenantConnectionPool = { connect };
  return { pool, query, release };
}

const actor = { id: "actor-membership", account_id: actorAccountId, role: "owner", status: "active" };
const target = { id: "target-membership", account_id: targetAccountId, role: "member", status: "active" };

describe("PostgresMembershipRepository", () => {
  it("locks the tenant membership set, rechecks policy, mutates and audits in one transaction", async () => {
    const authorize = vi.fn((_input: MembershipMutationPolicyInput) => true);
    const { pool, query, release } = createPool([
      [], [], [], [actor], [target], [{ active_owner_count: 1 }],
      [{ ...target, role: "viewer" }], [], [],
    ]);
    const repository = new PostgresMembershipRepository(pool, authorize);

    await expect(repository.mutate({
      organizationId, actorAccountId, targetAccountId, action: "change-role", requestedRole: "viewer",
    })).resolves.toEqual({
      membershipId: "target-membership", role: "viewer", status: "active",
    });

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("account_id = $2 FOR UPDATE"),
      expect.stringContaining("account_id = $2 FOR UPDATE"),
      expect.stringContaining("active_owner_count"),
      expect.stringContaining("UPDATE organization_memberships"),
      expect.stringContaining("INSERT INTO audit_events"),
      "COMMIT",
    ]);
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      actorAccountId, targetAccountId, activeOwnerCount: 1, action: "change-role",
    }));
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("does not write when the shared authorization policy denies the mutation", async () => {
    const authorize = vi.fn(() => false);
    const { pool, query } = createPool([[], [], [], [actor], [target], [{ active_owner_count: 1 }]]);
    const repository = new PostgresMembershipRepository(pool, authorize);

    await expect(repository.mutate({
      organizationId, actorAccountId, targetAccountId, action: "revoke",
    })).resolves.toBeNull();

    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("fails closed when the actor or target membership is missing", async () => {
    const authorize = vi.fn(() => true);
    const { pool, query } = createPool([[], [], [], [], [target], [{ active_owner_count: 1 }]]);
    const repository = new PostgresMembershipRepository(pool, authorize);

    await expect(repository.mutate({
      organizationId, actorAccountId, targetAccountId, action: "suspend",
    })).resolves.toBeNull();

    expect(authorize).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it("rejects self-mutation and role fields on non-role actions before connecting", async () => {
    const authorize = vi.fn(() => true);
    const { pool } = createPool();
    const repository = new PostgresMembershipRepository(pool, authorize);

    await expect(repository.mutate({
      organizationId, actorAccountId, targetAccountId: actorAccountId, action: "revoke",
    })).resolves.toBeNull();
    await expect(repository.mutate({
      organizationId, actorAccountId, targetAccountId, action: "suspend", requestedRole: "admin",
    })).resolves.toBeNull();
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
