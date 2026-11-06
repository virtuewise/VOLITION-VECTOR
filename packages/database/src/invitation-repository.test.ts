import { describe, expect, it, vi } from "vitest";
import type {
  TenantConnection,
  TenantConnectionPool,
} from "./tenant-transaction.js";
import {
  InvitationAuthorizationError,
  PostgresInvitationRepository,
} from "./invitation-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountId = "22222222-2222-4222-8222-222222222222";
const tokenHash = new Uint8Array(32).fill(7);
const invitedEmail = "person@example.test";

function createPool(responses: readonly unknown[][] = []) {
  let responseIndex = 0;
  const query = vi.fn(
    async (_sql: string, _parameters?: readonly unknown[]) => ({
      rows: (responses[responseIndex++] ?? []) as readonly unknown[],
    }),
  );
  const release = vi.fn();
  const client: TenantConnection = { query, release };
  const connect = vi.fn(async () => client);
  const pool: TenantConnectionPool = { connect };
  return { pool, query, release, connect };
}

describe("PostgresInvitationRepository", () => {
  it("serializes invitation replacement and persists only the hash", async () => {
    const { pool, query } = createPool([
      [],
      [],
      [],
      [{ role: "owner", status: "active" }],
      [{ active_owner_count: 1 }],
      [],
      [],
      [
        {
          id: "invitation-1",
          expires_at: new Date("2026-11-12T00:00:00Z"),
        },
      ],
    ]);
    const repository = new PostgresInvitationRepository(pool, () => true);
    await expect(
      repository.createPendingInvitation({
        organizationId: organizationId.toUpperCase(),
        invitedEmail,
        role: "member",
        tokenHash,
        invitedByAccountId: accountId,
        expiresAt: new Date("2026-11-12T00:00:00Z"),
      }),
    ).resolves.toMatchObject({ id: "invitation-1" });

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      expect.stringContaining("SELECT role, status FROM organization_memberships"),
      expect.stringContaining("SELECT count(*)::int AS active_owner_count"),
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      expect.stringContaining("UPDATE organization_invitations"),
      expect.stringContaining("INSERT INTO organization_invitations"),
      "COMMIT",
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual([organizationId]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "organization-memberships:" + organizationId,
    ]);
    expect(query.mock.calls[3]?.[1]).toEqual([organizationId, accountId]);
    expect(query.mock.calls[4]?.[1]).toEqual([organizationId]);
    expect(query.mock.calls[5]?.[1]).toEqual([
      "organization-invitations:" + organizationId + ":" + invitedEmail,
    ]);
    expect(query.mock.calls[7]?.[1]).toContain(tokenHash);
  });


  it("denies invitation creation in the transaction when current membership policy rejects", async () => {
    const { pool, query } = createPool([
      [],
      [],
      [],
      [{ role: "member", status: "active" }],
      [{ active_owner_count: 1 }],
    ]);
    const authorize = vi.fn(() => false);
    const repository = new PostgresInvitationRepository(pool, authorize);

    await expect(
      repository.createPendingInvitation({
        organizationId,
        invitedEmail,
        role: "admin",
        tokenHash,
        invitedByAccountId: accountId,
        expiresAt: new Date("2026-11-12T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(InvitationAuthorizationError);

    expect(authorize).toHaveBeenCalledWith({
      actorAccountId: accountId,
      organizationId,
      membershipStatus: "active",
      role: "member",
      requestedRole: "admin",
      activeOwnerCount: 1,
    });
    expect(query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(
      query.mock.calls.some(([sql]) => sql.startsWith("UPDATE organization_invitations")),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO organization_invitations")),
    ).toBe(false);
  });

  it("fails closed when no invitation authorizer is configured", async () => {
    const { pool } = createPool([
      [],
      [],
      [],
      [{ role: "owner", status: "active" }],
      [{ active_owner_count: 1 }],
    ]);
    const repository = new PostgresInvitationRepository(pool);

    await expect(
      repository.createPendingInvitation({
        organizationId,
        invitedEmail,
        role: "member",
        tokenHash,
        invitedByAccountId: accountId,
        expiresAt: new Date("2026-11-12T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(InvitationAuthorizationError);
  });

  it("uses the canonical tenant UUID when revoking an invitation", async () => {
    const { pool, query } = createPool([[], [], []]);
    const repository = new PostgresInvitationRepository(pool);

    await expect(
      repository.revokePendingInvitation({
        organizationId: organizationId.toUpperCase(),
        invitationId: "invitation-1",
        revokedAt: new Date("2026-11-05T10:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();

    expect(query.mock.calls[1]?.[1]).toEqual([organizationId]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      organizationId,
      "invitation-1",
      new Date("2026-11-05T10:00:00.000Z"),
    ]);
  });

  it("rejects a token lookup that does not resolve an invitation", async () => {
    const { pool, query, release } = createPool([[], [], []]);
    const repository = new PostgresInvitationRepository(pool);
    await expect(
      repository.acceptPendingInvitationAtomically({
        tokenHash,
        accountId,
        verifiedEmail: invitedEmail,
      }),
    ).resolves.toBe(false);

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
      [],
      [],
      [{ organization_id: organizationId }],
      [],
      [
        {
          id: "invitation-1",
          invited_email: invitedEmail,
          role: "member",
          accepted_at: null,
          revoked_at: null,
          not_expired: true,
        },
      ],
      [{ id: accountId }],
      [{ id: "membership-1" }],
      [{ id: "invitation-1" }],
      [],
      [],
    ]);
    const repository = new PostgresInvitationRepository(pool);
    await expect(
      repository.acceptPendingInvitationAtomically({
        tokenHash,
        accountId,
        verifiedEmail: invitedEmail,
      }),
    ).resolves.toBe(true);

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
      [],
      [],
      [{ organization_id: organizationId }],
      [],
      [
        {
          id: "invitation-1",
          invited_email: invitedEmail,
          role: "member",
          accepted_at: null,
          revoked_at: null,
          not_expired: false,
        },
      ],
    ]);
    const repository = new PostgresInvitationRepository(pool);
    await expect(
      repository.acceptPendingInvitationAtomically({
        tokenHash,
        accountId,
        verifiedEmail: invitedEmail,
      }),
    ).resolves.toBe(false);

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
