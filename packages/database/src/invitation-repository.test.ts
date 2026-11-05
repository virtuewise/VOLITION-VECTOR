import { describe, expect, it, vi } from "vitest";
import type { TenantConnection, TenantConnectionPool } from "./tenant-transaction.js";
import { PostgresInvitationRepository } from "./invitation-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountId = "22222222-2222-4222-8222-222222222222";
const tokenHash = new Uint8Array(32).fill(7);
const invitedEmail = "person@example.test";

function createPool(responses: readonly unknown[][] = []) {
  let responseIndex = 0;
  const query = vi.fn(async (_sql: string, _parameters?: readonly unknown[]) => ({
    rows: (responses[responseIndex++] ?? []) as readonly unknown[],
  }));
  const release = vi.fn();
  const client: TenantConnection = { query, release };
  const connect = vi.fn(async () => client);
  const pool: TenantConnectionPool = { connect };
  return { pool, query, release, connect };
}

describe("PostgresInvitationRepository", () => {
  it("serializes invitation replacement and persists only the hash", async () => {
    const { pool, query } = createPool([
      [], [], [], [], [{ id: "invitation-1", expires_at: new Date("2026-11-12T00:00:00Z") }],
    ]);
    const repository = new PostgresInvitationRepository(pool);
    await expect(repository.createPendingInvitation({
      organizationId, invitedEmail, role: "member", tokenHash,
      invitedByAccountId: accountId, expiresAt: new Date("2026-11-12T00:00:00Z"),
    })).resolves.toMatchObject({ id: "invitation-1" });

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      expect.stringContaining("UPDATE organization_invitations"),
      expect.stringContaining("INSERT INTO organization_invitations"),
      "COMMIT",
    ]);
    expect(query.mock.calls[4]?.[1]).toContain(tokenHash);
  });

  it("rejects a token lookup that does not resolve an invitation", async () => {
    const { pool, query, release } = createPool([[], [], []]);
    const repository = new PostgresInvitationRepository(pool);
    await expect(repository.acceptPendingInvitationAtomically({
      tokenHash, accountId, verifiedEmail: invitedEmail,
    })).resolves.toBe(false);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT set_config('app.invitation_token_hash', encode($1::bytea, 'hex'), true)",
      expect.stringContaining("SELECT organization_id"),
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("creates membership, consumes the invitation and appends audit in one transaction", async () => {
    const { pool, query, release } = createPool([
      [], [], [{ organization_id: organizationId }], [], [{
        id: "invitation-1", invited_email: invitedEmail, role: "member",
        accepted_at: null, revoked_at: null, not_expired: true,
      }], [{ id: accountId }], [{ id: "membership-1" }],
      [{ id: "invitation-1" }], [], [],
    ]);
    const repository = new PostgresInvitationRepository(pool);
    await expect(repository.acceptPendingInvitationAtomically({
      tokenHash, accountId, verifiedEmail: invitedEmail,
    })).resolves.toBe(true);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT set_config('app.invitation_token_hash', encode($1::bytea, 'hex'), true)",
      expect.stringContaining("SELECT organization_id"),
      "SELECT set_config('app.tenant_id', $1, true)",
      expect.stringContaining("FOR UPDATE"),
      expect.stringContaining("FROM accounts"),
      expect.stringContaining("INSERT INTO organization_memberships"),
      expect.stringContaining("UPDATE organization_invitations"),
      expect.stringContaining("INSERT INTO audit_events"),
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back and creates no membership for an expired invitation", async () => {
    const { pool, query } = createPool([
      [], [], [{ organization_id: organizationId }], [], [{
        id: "invitation-1", invited_email: invitedEmail, role: "member",
        accepted_at: null, revoked_at: null, not_expired: false,
      }],
    ]);
    const repository = new PostgresInvitationRepository(pool);
    await expect(repository.acceptPendingInvitationAtomically({
      tokenHash, accountId, verifiedEmail: invitedEmail,
    })).resolves.toBe(false);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT set_config('app.invitation_token_hash', encode($1::bytea, 'hex'), true)",
      expect.stringContaining("SELECT organization_id"),
      "SELECT set_config('app.tenant_id', $1, true)",
      expect.stringContaining("FOR UPDATE"),
      "ROLLBACK",
    ]);
  });
});
