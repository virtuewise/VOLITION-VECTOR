import type {
  TenantConnection,
  TenantConnectionPool,
} from "@volition/database";
import { describe, expect, it } from "vitest";
import { InvitationAuthorizationError } from "@volition/database";
import { PostgresInvitationRepositoryAdapter } from "./postgres-invitation.repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";
const tokenHash = new Uint8Array(32).fill(9);

function createPool(responses: readonly unknown[][]) {
  let index = 0;
  const query = async () => ({ rows: responses[index++] ?? [] });
  const release = () => undefined;
  const connection: TenantConnection = { query, release };
  const pool: TenantConnectionPool = {
    connect: async () => connection,
  };
  return pool;
}

describe("PostgresInvitationRepositoryAdapter", () => {
  it("allows an active owner to invite a non-owner role", async () => {
    const pool = createPool([
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
          expires_at: new Date("2026-11-13T00:00:00Z"),
        },
      ],
      [],
    ]);
    const repository = new PostgresInvitationRepositoryAdapter(pool);

    await expect(
      repository.createPendingInvitation({
        organizationId,
        invitedEmail: "person@example.test",
        role: "admin",
        tokenHash,
        invitedByAccountId: actorAccountId,
        expiresAt: new Date("2026-11-13T00:00:00Z"),
      }),
    ).resolves.toMatchObject({ id: "invitation-1" });
  });

  it("denies an active member from inviting an administrator", async () => {
    const pool = createPool([
      [],
      [],
      [],
      [{ role: "member", status: "active" }],
      [{ active_owner_count: 1 }],
    ]);
    const repository = new PostgresInvitationRepositoryAdapter(pool);

    await expect(
      repository.createPendingInvitation({
        organizationId,
        invitedEmail: "person@example.test",
        role: "admin",
        tokenHash,
        invitedByAccountId: actorAccountId,
        expiresAt: new Date("2026-11-13T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(InvitationAuthorizationError);
  });
});
