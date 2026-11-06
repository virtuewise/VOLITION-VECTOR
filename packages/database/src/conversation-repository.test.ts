import type {
  TenantConnection,
  TenantConnectionPool,
} from "./tenant-transaction.js";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationAuthorizationError,
  ConversationConflictError,
  ConversationInputError,
  PostgresConversationRepository,
} from "./conversation-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationAccountId = "11111111-1111-4111-8111-111111111111";
const applicantAccountId = "22222222-2222-4222-8222-222222222222";
const applicationId = "33333333-3333-4333-8333-333333333333";
const conversationId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const timestamp = new Date("2026-11-06T09:00:00.000Z");

function conversationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: conversationId,
    organization_id: organizationId,
    opportunity_application_id: applicationId,
    created_by_account_id: organizationAccountId,
    status: "open",
    created_at: timestamp,
    last_message_at: timestamp,
    ...overrides,
  };
}

function messageRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: messageId,
    organization_id: organizationId,
    conversation_id: conversationId,
    sender_account_id: applicantAccountId,
    body: "Thank you for considering my application.",
    created_at: timestamp,
    ...overrides,
  };
}

function createTransactionalPool(responses: readonly unknown[][]) {
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

describe("PostgresConversationRepository", () => {
  it("opens a conversation only for an authorized progressed application", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [],
      [{ role: "admin", status: "active" }],
      [{ applicant_account_id: applicantAccountId, status: "shortlisted" }],
      [conversationRow()],
      [],
      [],
      [],
    ]);
    const authorizeOpen = vi.fn(() => true);
    const repository = new PostgresConversationRepository(pool, authorizeOpen);

    await expect(
      repository.openForApplication({
        organizationId,
        opportunityApplicationId: applicationId,
        organizationAccountId,
      }),
    ).resolves.toMatchObject({
      id: conversationId,
      opportunityApplicationId: applicationId,
      status: "open",
    });

    expect(authorizeOpen).toHaveBeenCalledWith({
      organizationAccountId,
      organizationId,
      role: "admin",
      membershipStatus: "active",
      applicationStatus: "shortlisted",
    });
    expect(query.mock.calls[6]?.[0]).toContain("INSERT INTO conversations");
    expect(query.mock.calls[7]?.[0]).toContain("INSERT INTO conversation_participants");
    expect(query.mock.calls[8]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[9]?.[0]).toBe("COMMIT");
  });

  it("denies opening a conversation for an unprogressed application", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [],
      [{ role: "admin", status: "active" }],
      [{ applicant_account_id: applicantAccountId, status: "submitted" }],
    ]);
    const authorizeOpen = vi.fn(() => false);
    const repository = new PostgresConversationRepository(pool, authorizeOpen);

    await expect(
      repository.openForApplication({
        organizationId,
        opportunityApplicationId: applicationId,
        organizationAccountId,
      }),
    ).rejects.toBeInstanceOf(ConversationAuthorizationError);

    expect(
      query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO conversations")),
    ).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("sends a message only after rechecking participant membership", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [conversationRow()],
      [{ account_id: applicantAccountId }],
      [messageRow()],
      [],
      [],
    ]);
    const repository = new PostgresConversationRepository(pool);

    await expect(
      repository.sendMessage({
        organizationId,
        conversationId,
        senderAccountId: applicantAccountId,
        body: " Thank you for considering my application. ",
      }),
    ).resolves.toMatchObject({
      id: messageId,
      senderAccountId: applicantAccountId,
      body: "Thank you for considering my application.",
    });

    expect(query.mock.calls[2]?.[0]).toContain("app.actor_type");
    expect(query.mock.calls[4]?.[1]).toEqual([
      organizationId,
      conversationId,
      applicantAccountId,
    ]);
    expect(query.mock.calls[5]?.[0]).toContain("INSERT INTO messages");
    expect(query.mock.calls[6]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[7]?.[0]).toBe("COMMIT");
  });

  it("rejects messages from accounts that are not conversation participants", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [conversationRow()],
      [],
    ]);
    const repository = new PostgresConversationRepository(pool);

    await expect(
      repository.sendMessage({
        organizationId,
        conversationId,
        senderAccountId: organizationAccountId,
        body: "Unauthorized",
      }),
    ).rejects.toBeInstanceOf(ConversationAuthorizationError);

    expect(
      query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO messages")),
    ).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("rejects empty or oversized message bodies before connecting", async () => {
    const { pool, connect } = createTransactionalPool([]);
    const repository = new PostgresConversationRepository(pool);

    await expect(
      repository.sendMessage({
        organizationId,
        conversationId,
        senderAccountId: applicantAccountId,
        body: "   ",
      }),
    ).rejects.toBeInstanceOf(ConversationInputError);
    await expect(
      repository.sendMessage({
        organizationId,
        conversationId,
        senderAccountId: applicantAccountId,
        body: "x".repeat(5_001),
      }),
    ).rejects.toBeInstanceOf(ConversationInputError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("lists only conversations visible to the account-scoped RLS context", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [conversationRow()] });
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresConversationRepository(pool);

    await expect(repository.listMine(applicantAccountId)).resolves.toMatchObject([
      { id: conversationId, organizationId },
    ]);

    expect(query.mock.calls[1]?.[0]).toContain("app.account_id");
    expect(query.mock.calls[2]?.[0]).toContain("conversation_participants");
    expect(release).toHaveBeenCalledOnce();
  });

  it("lists messages only for the participant account", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [messageRow()] });
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresConversationRepository(pool);

    await expect(
      repository.listMessages(applicantAccountId, conversationId),
    ).resolves.toMatchObject([{ id: messageId, senderAccountId: applicantAccountId }]);

    expect(query.mock.calls[2]?.[0]).toContain("FROM messages");
    expect(query.mock.calls[2]?.[1]).toEqual([conversationId, 50, 0]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns a conflict when the application cannot be found", async () => {
    const { pool } = createTransactionalPool([[], [], [], [], [{ role: "admin", status: "active" }], []]);
    const repository = new PostgresConversationRepository(pool, () => true);

    await expect(
      repository.openForApplication({
        organizationId,
        opportunityApplicationId: applicationId,
        organizationAccountId,
      }),
    ).rejects.toBeInstanceOf(ConversationConflictError);
  });
});
