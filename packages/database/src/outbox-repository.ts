import { normalizeTenantId } from "./tenant-context.js";
import type { TenantTransactionClient } from "./tenant-transaction.js";

export interface OutboxEventInput {
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly eventName: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly schemaVersion?: number;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface OutboxEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly eventName: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly schemaVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

interface OutboxEventRow {
  readonly id: string;
  readonly organization_id: string;
  readonly idempotency_key: string;
  readonly event_name: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly schema_version: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurred_at: Date;
  readonly created_at: Date;
}

export class OutboxEventInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxEventInputError";
  }
}

function requiredText(
  value: string,
  field: string,
  maximumLength: number,
  pattern?: RegExp,
): string {
  if (typeof value !== "string") {
    throw new OutboxEventInputError(`${field} must be text.`);
  }

  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > maximumLength ||
    (pattern !== undefined && !pattern.test(normalized))
  ) {
    throw new OutboxEventInputError(`${field} is invalid.`);
  }

  return normalized;
}

function serializePayload(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  const value = payload ?? {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OutboxEventInputError("Outbox payload must be a JSON object.");
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new OutboxEventInputError("Outbox payload must be a plain JSON object.");
  }

  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") {
      throw new Error("Payload did not serialize to JSON.");
    }
    return serialized;
  } catch {
    throw new OutboxEventInputError("Outbox payload must be serializable JSON.");
  }
}

/**
 * Insert an immutable event envelope using the caller's existing transaction.
 *
 * This function deliberately does not open, commit or roll back a transaction.
 * Callers must use the same transaction client for the domain mutation, audit
 * event and outbox event so all records commit or roll back together. The
 * database tenant policy independently rejects a mismatched organization ID.
 */
export async function insertOutboxEvent(
  client: TenantTransactionClient,
  input: OutboxEventInput,
): Promise<OutboxEventRecord> {
  const organizationId = normalizeTenantId(input.organizationId);
  const idempotencyKey = requiredText(
    input.idempotencyKey,
    "Outbox idempotency key",
    200,
  );
  const eventName = requiredText(
    input.eventName,
    "Outbox event name",
    160,
    /^[a-z][a-z0-9_.-]{0,159}$/,
  );
  const aggregateType = requiredText(
    input.aggregateType,
    "Outbox aggregate type",
    120,
    /^[a-z][a-z0-9_.-]{0,119}$/,
  );
  const aggregateId = requiredText(
    input.aggregateId,
    "Outbox aggregate ID",
    200,
  );
  const schemaVersion = input.schemaVersion ?? 1;
  if (
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > 32_767
  ) {
    throw new OutboxEventInputError("Outbox schema version is invalid.");
  }
  const payload = serializePayload(input.payload);

  const result = await client.query(
    "INSERT INTO outbox_events (" +
      "organization_id, idempotency_key, event_name, aggregate_type, " +
      "aggregate_id, schema_version, payload" +
      ") VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) " +
      "RETURNING id, organization_id, idempotency_key, event_name, " +
      "aggregate_type, aggregate_id, schema_version, payload, " +
      "occurred_at, created_at",
    [
      organizationId,
      idempotencyKey,
      eventName,
      aggregateType,
      aggregateId,
      schemaVersion,
      payload,
    ],
  );

  const row = result.rows[0] as OutboxEventRow | undefined;
  if (!row) {
    throw new Error("The database did not return the inserted outbox event.");
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    idempotencyKey: row.idempotency_key,
    eventName: row.event_name,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    schemaVersion: row.schema_version,
    payload: row.payload,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}
