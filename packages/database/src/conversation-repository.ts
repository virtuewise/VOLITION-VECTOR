import { normalizeTenantId } from "./tenant-context.js";
import {
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
  type TenantTransactionClient,
} from "./tenant-transaction.js";

export type ConversationStatus = "open" | "closed";
export type ConversationParticipantType = "applicant" | "organization";

export interface OpenApplicationConversationInput {
  readonly organizationId: string;
  readonly opportunityApplicationId: string;
  readonly organizationAccountId: string;
}

export interface SendConversationMessageInput {
  readonly organizationId: string;
  readonly conversationId: string;
  readonly senderAccountId: string;
  readonly body: string;
}

export interface ConversationAuthorizationInput {
  readonly organizationAccountId: string;
  readonly organizationId: string;
  readonly role: ConversationMembershipRole;
  readonly membershipStatus: ConversationMembershipStatus;
  readonly applicationStatus:
    "submitted" | "withdrawn" | "shortlisted" | "rejected" | "accepted";
}

export type ConversationAuthorizer = (
  input: ConversationAuthorizationInput,
) => boolean;

export interface ConversationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly opportunityApplicationId: string;
  readonly createdByAccountId: string;
  readonly status: ConversationStatus;
  readonly createdAt: Date;
  readonly lastMessageAt: Date | null;
}

export interface ConversationMessageRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly conversationId: string;
  readonly senderAccountId: string;
  readonly body: string;
  readonly createdAt: Date;
}

interface ConversationRow {
  readonly id: string;
  readonly organization_id: string;
  readonly opportunity_application_id: string;
  readonly created_by_account_id: string;
  readonly status: ConversationStatus;
  readonly created_at: Date;
  readonly last_message_at?: Date | null;
}

interface MessageRow {
  readonly id: string;
  readonly organization_id: string;
  readonly conversation_id: string;
  readonly sender_account_id: string;
  readonly body: string;
  readonly created_at: Date;
}

interface ApplicationRow {
  readonly applicant_account_id: string;
  readonly status:
    "submitted" | "withdrawn" | "shortlisted" | "rejected" | "accepted";
}

interface MembershipRow {
  readonly role: unknown;
  readonly status: unknown;
}

type ConversationMembershipRole = "owner" | "admin" | "member" | "viewer";
type ConversationMembershipStatus = "active" | "suspended" | "revoked";

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function isRole(value: unknown): value is ConversationMembershipRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

function isMembershipStatus(
  value: unknown,
): value is ConversationMembershipStatus {
  return value === "active" || value === "suspended" || value === "revoked";
}

function mapConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    opportunityApplicationId: row.opportunity_application_id,
    createdByAccountId: row.created_by_account_id,
    status: row.status,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at ?? null,
  };
}

function mapMessage(row: MessageRow): ConversationMessageRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    senderAccountId: row.sender_account_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export class ConversationAuthorizationError extends Error {
  constructor() {
    super("Conversation action is not permitted.");
    this.name = "ConversationAuthorizationError";
  }
}

export class ConversationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationInputError";
  }
}

export class ConversationConflictError extends Error {
  constructor() {
    super("Conversation is unavailable or already exists.");
    this.name = "ConversationConflictError";
  }
}

async function setOrganizationActor(
  client: TenantTransactionClient,
  accountId: string,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.account_id', $1, true), " +
      "set_config('app.actor_type', 'organization', true)",
    [accountId],
  );
}

async function setParticipantActor(
  client: TenantTransactionClient,
  accountId: string,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.account_id', $1, true), " +
      "set_config('app.actor_type', 'participant', true)",
    [accountId],
  );
}

async function withParticipantReadTransaction<T>(
  pool: TenantConnectionPool,
  accountId: string,
  work: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  const normalizedAccountId = normalizeTenantId(accountId);
  const client = await pool.connect();
  let transactionStarted = false;
  let releaseError: Error | undefined;

  try {
    try {
      await client.query("BEGIN");
      transactionStarted = true;
    } catch (error) {
      releaseError =
        error instanceof Error
          ? error
          : new Error("Failed to establish participant read transaction.");
      throw error;
    }

    await setParticipantActor(client, normalizedAccountId);
    const result = await work(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Failed to roll back participant read transaction.");
      }
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

export class PostgresConversationRepository {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly authorizeOpen: ConversationAuthorizer = () => false,
  ) {}

  async openForApplication(
    input: OpenApplicationConversationInput,
  ): Promise<ConversationRecord> {
    const organizationId = normalizeTenantId(input.organizationId);
    const organizationAccountId = normalizeTenantId(
      input.organizationAccountId,
    );
    const applicationId = normalizeTenantId(input.opportunityApplicationId);

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      await setOrganizationActor(client, organizationAccountId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["organization-memberships:" + organizationId],
      );

      const membership = firstRow<MembershipRow>(
        await client.query(
          "SELECT role, status FROM organization_memberships " +
            "WHERE organization_id = $1 AND account_id = $2 FOR UPDATE",
          [organizationId, organizationAccountId],
        ),
      );
      if (
        !membership ||
        !isRole(membership.role) ||
        !isMembershipStatus(membership.status)
      ) {
        throw new ConversationAuthorizationError();
      }

      const application = firstRow<ApplicationRow>(
        await client.query(
          "SELECT applicant_account_id, status FROM opportunity_applications " +
            "WHERE organization_id = $1 AND id = $2 FOR UPDATE",
          [organizationId, applicationId],
        ),
      );
      if (!application) throw new ConversationConflictError();

      if (
        !this.authorizeOpen({
          organizationAccountId,
          organizationId,
          role: membership.role,
          membershipStatus: membership.status,
          applicationStatus: application.status,
        })
      ) {
        throw new ConversationAuthorizationError();
      }

      const conversation = firstRow<ConversationRow>(
        await client.query(
          "INSERT INTO conversations " +
            "(organization_id, opportunity_application_id, created_by_account_id) " +
            "VALUES ($1, $2, $3) ON CONFLICT (opportunity_application_id) DO NOTHING " +
            "RETURNING id, organization_id, opportunity_application_id, " +
            "created_by_account_id, status, created_at",
          [organizationId, applicationId, organizationAccountId],
        ),
      );
      if (!conversation) throw new ConversationConflictError();

      await client.query(
        "INSERT INTO conversation_participants " +
          "(organization_id, conversation_id, account_id, participant_type) " +
          "VALUES ($1, $2, $3, 'applicant'), ($1, $2, $4, 'organization') " +
          "ON CONFLICT (conversation_id, account_id) DO NOTHING",
        [
          organizationId,
          conversation.id,
          application.applicant_account_id,
          organizationAccountId,
        ],
      );

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'conversation.opened', 'conversation', $3, $4::jsonb)",
        [
          organizationId,
          organizationAccountId,
          conversation.id,
          JSON.stringify({ opportunityApplicationId: applicationId }),
        ],
      );

      return mapConversation(conversation);
    });
  }

  async sendMessage(
    input: SendConversationMessageInput,
  ): Promise<ConversationMessageRecord> {
    const organizationId = normalizeTenantId(input.organizationId);
    const conversationId = normalizeTenantId(input.conversationId);
    const senderAccountId = normalizeTenantId(input.senderAccountId);
    const body = input.body.trim();
    if (body.length < 1 || body.length > 5_000) {
      throw new ConversationInputError(
        "Conversation messages must be 1 to 5000 characters.",
      );
    }

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      await setParticipantActor(client, senderAccountId);
      const conversation = firstRow<ConversationRow>(
        await client.query(
          "SELECT id, organization_id, opportunity_application_id, " +
            "created_by_account_id, status, created_at " +
            "FROM conversations WHERE organization_id = $1 AND id = $2 " +
            "AND status = 'open' FOR SHARE",
          [organizationId, conversationId],
        ),
      );
      if (!conversation) throw new ConversationConflictError();

      const participant = firstRow<{ readonly account_id: string }>(
        await client.query(
          "SELECT account_id FROM conversation_participants " +
            "WHERE organization_id = $1 AND conversation_id = $2 AND account_id = $3",
          [organizationId, conversationId, senderAccountId],
        ),
      );
      if (!participant) throw new ConversationAuthorizationError();

      const message = firstRow<MessageRow>(
        await client.query(
          "INSERT INTO messages " +
            "(organization_id, conversation_id, sender_account_id, body) " +
            "VALUES ($1, $2, $3, $4) RETURNING *",
          [organizationId, conversationId, senderAccountId, body],
        ),
      );
      if (!message)
        throw new Error("Conversation message insert returned no record.");

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'conversation.message.sent', 'message', $3, $4::jsonb)",
        [
          organizationId,
          senderAccountId,
          message.id,
          JSON.stringify({ conversationId }),
        ],
      );

      return mapMessage(message);
    });
  }

  async listMine(
    accountId: string,
    limit = 20,
    offset = 0,
  ): Promise<readonly ConversationRecord[]> {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10_000
    ) {
      throw new ConversationInputError("Conversation pagination is invalid.");
    }

    return withParticipantReadTransaction(
      this.pool,
      accountId,
      async (client) => {
        const result = await client.query(
          "SELECT conversation.id, conversation.organization_id, " +
            "conversation.opportunity_application_id, conversation.created_by_account_id, " +
            "conversation.status, conversation.created_at, " +
            "(SELECT max(message.created_at) FROM messages AS message " +
            " WHERE message.organization_id = conversation.organization_id " +
            " AND message.conversation_id = conversation.id) AS last_message_at " +
            "FROM conversations AS conversation " +
            "JOIN conversation_participants AS participant " +
            "ON participant.organization_id = conversation.organization_id " +
            "AND participant.conversation_id = conversation.id " +
            "WHERE participant.account_id = $1 " +
            "ORDER BY coalesce((SELECT max(message.created_at) FROM messages AS message " +
            " WHERE message.organization_id = conversation.organization_id " +
            " AND message.conversation_id = conversation.id), conversation.created_at) DESC " +
            "LIMIT $2 OFFSET $3",
          [normalizeTenantId(accountId), limit, offset],
        );
        return (result.rows as readonly ConversationRow[]).map(mapConversation);
      },
    );
  }

  async listMessages(
    accountId: string,
    conversationId: string,
    limit = 50,
    offset = 0,
  ): Promise<readonly ConversationMessageRecord[]> {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10_000
    ) {
      throw new ConversationInputError("Message pagination is invalid.");
    }

    const normalizedConversationId = normalizeTenantId(conversationId);
    return withParticipantReadTransaction(
      this.pool,
      accountId,
      async (client) => {
        const result = await client.query(
          "SELECT id, organization_id, conversation_id, sender_account_id, body, created_at " +
            "FROM messages WHERE conversation_id = $1 " +
            "ORDER BY created_at ASC, id LIMIT $2 OFFSET $3",
          [normalizedConversationId, limit, offset],
        );
        return (result.rows as readonly MessageRow[]).map(mapMessage);
      },
    );
  }
}
