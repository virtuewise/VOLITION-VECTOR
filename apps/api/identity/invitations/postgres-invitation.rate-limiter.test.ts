import { createHash } from "node:crypto";
import type {
  TenantConnection,
  TenantConnectionPool,
} from "@volition/database";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INVITATION_RATE_LIMITS,
  InvitationRateLimitExceededError,
  PostgresInvitationRateLimiter,
} from "./postgres-invitation.rate-limiter.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";
const invitedEmail = "person@example.test";

function createPool(responses: readonly unknown[][]) {
  let index = 0;
  const query = vi.fn(
    async (_statement: string, _parameters?: readonly unknown[]) => ({
      rows: responses[index++] ?? [],
    }),
  );
  const release = vi.fn();
  const connection: TenantConnection = { query, release };
  const connect = vi.fn(async () => connection);
  const pool: TenantConnectionPool = { connect };
  return { pool, query, connect, release };
}

describe("PostgresInvitationRateLimiter", () => {
  it("uses tenant-scoped, domain-separated hashes for actor and email scopes", async () => {
    const { pool, query } = createPool([
      [],
      [],
      [],
      [{ attempt_count: 1, retry_after_seconds: 3600 }],
      [{ attempt_count: 1, retry_after_seconds: 86400 }],
      [],
    ]);
    const limiter = new PostgresInvitationRateLimiter(pool);

    await expect(
      limiter.assertAllowed({
        organizationId: organizationId.toUpperCase(),
        actorAccountId,
        invitedEmail: " Person@Example.Test ",
      }),
    ).resolves.toBeUndefined();

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      expect.stringContaining("DELETE FROM organization_invitation_rate_limits"),
      expect.stringContaining("INSERT INTO organization_invitation_rate_limits"),
      expect.stringContaining("INSERT INTO organization_invitation_rate_limits"),
      "COMMIT",
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual([organizationId]);
    expect(query.mock.calls[3]?.[1]).toEqual([
      organizationId,
      "actor",
      createHash("sha256").update("actor:" + actorAccountId).digest(),
      DEFAULT_INVITATION_RATE_LIMITS.actorWindowMs,
    ]);
    expect(query.mock.calls[4]?.[1]).toEqual([
      organizationId,
      "email",
      createHash("sha256").update("email:" + invitedEmail).digest(),
      DEFAULT_INVITATION_RATE_LIMITS.emailWindowMs,
    ]);
    expect(
      query.mock.calls.flatMap(([, parameters]) => parameters ?? []),
    ).not.toContain(invitedEmail);
  });

  it("commits the attempt counters before returning a scoped actor retry time", async () => {
    const { pool, query } = createPool([
      [],
      [],
      [],
      [{ attempt_count: 11, retry_after_seconds: 1200 }],
      [{ attempt_count: 2, retry_after_seconds: 86400 }],
      [],
    ]);
    const limiter = new PostgresInvitationRateLimiter(pool);

    await expect(
      limiter.assertAllowed({ organizationId, actorAccountId, invitedEmail }),
    ).rejects.toMatchObject({
      name: "InvitationRateLimitExceededError",
      retryAfterSeconds: 1200,
    });

    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("enforces the per-email window even when the actor remains below quota", async () => {
    const { pool } = createPool([
      [],
      [],
      [],
      [{ attempt_count: 2, retry_after_seconds: 1800 }],
      [{ attempt_count: 4, retry_after_seconds: 240 }],
      [],
    ]);
    const limiter = new PostgresInvitationRateLimiter(pool);

    await expect(
      limiter.assertAllowed({ organizationId, actorAccountId, invitedEmail }),
    ).rejects.toMatchObject({
      name: "InvitationRateLimitExceededError",
      retryAfterSeconds: 240,
    });
  });

  it("rejects invalid actor, tenant and email input before connecting", async () => {
    const { pool, connect } = createPool([]);
    const limiter = new PostgresInvitationRateLimiter(pool);

    await expect(
      limiter.assertAllowed({
        organizationId,
        actorAccountId: "not-a-uuid",
        invitedEmail,
      }),
    ).rejects.toThrow(/valid actor UUID/);
    await expect(
      limiter.assertAllowed({
        organizationId: "not-a-tenant",
        actorAccountId,
        invitedEmail,
      }),
    ).rejects.toThrow(/organization UUID/);
    await expect(
      limiter.assertAllowed({
        organizationId,
        actorAccountId,
        invitedEmail: "not-an-email",
      }),
    ).rejects.toThrow(/valid actor UUID/);

    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects non-positive rate-limit configuration", () => {
    const { pool } = createPool([]);

    expect(
      () =>
        new PostgresInvitationRateLimiter(pool, {
          actorWindowMs: 0,
          actorMaxAttempts: 10,
          emailWindowMs: 86_400_000,
          emailMaxAttempts: 3,
        }),
    ).toThrow(/positive integers/);
  });
});
