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

const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_PAYLOAD_DEPTH = 8;
const MAX_OBJECT_KEYS = 64;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 4_096;

const RESTRICTED_FIELD_TOKENS = new Set([
  "address",
  "authorization",
  "bank",
  "card",
  "cardholder",
  "cookie",
  "credential",
  "cvv",
  "cvc",
  "dob",
  "email",
  "iban",
  "pan",
  "password",
  "passwd",
  "passport",
  "phone",
  "routing",
  "secret",
  "ssn",
  "swift",
  "token",
  "username",
]);

const RESTRICTED_FIELD_PAIRS = [
  ["access", "key"],
  ["account", "number"],
  ["api", "key"],
  ["bank", "account"],
  ["card", "number"],
  ["client", "secret"],
  ["date", "birth"],
  ["evidence", "locator"],
  ["family", "name"],
  ["file", "path"],
  ["first", "name"],
  ["full", "name"],
  ["given", "name"],
  ["government", "id"],
  ["identity", "document"],
  ["identity", "number"],
  ["last", "name"],
  ["license", "number"],
  ["national", "id"],
  ["object", "key"],
  ["payee", "name"],
  ["personal", "data"],
  ["private", "key"],
  ["provider", "payload"],
  ["raw", "payload"],
  ["raw", "response"],
  ["signed", "url"],
  ["social", "security"],
  ["sort", "code"],
  ["storage", "key"],
  ["tax", "id"],
  ["webhook", "body"],
  ["beneficiary", "name"],
] as const;

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

function isRestrictedPayloadField(fieldName: string): boolean {
  const normalized = fieldName
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
  const tokens = new Set(normalized.split("_").filter(Boolean));

  if ([...tokens].some((token) => RESTRICTED_FIELD_TOKENS.has(token))) {
    return true;
  }

  return RESTRICTED_FIELD_PAIRS.some(
    ([first, second]) => tokens.has(first) && tokens.has(second),
  );
}

function validateJsonValue(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): void {
  if (depth > MAX_PAYLOAD_DEPTH) {
    throw new OutboxEventInputError(
      "Outbox payload exceeds structural limits.",
    );
  }

  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      throw new OutboxEventInputError(
        "Outbox payload exceeds structural limits.",
      );
    }
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new OutboxEventInputError(
        "Outbox payload must contain finite numbers.",
      );
    }
    return;
  }

  if (typeof value !== "object") {
    throw new OutboxEventInputError(
      "Outbox payload must contain only plain JSON values.",
    );
  }

  if (ancestors.has(value)) {
    throw new OutboxEventInputError("Outbox payload must not contain cycles.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        value.length > MAX_ARRAY_ITEMS ||
        Reflect.ownKeys(value).length !== value.length + 1
      ) {
        throw new OutboxEventInputError(
          "Outbox payload exceeds structural limits.",
        );
      }

      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (
          descriptor === undefined ||
          descriptor.enumerable !== true ||
          !("value" in descriptor)
        ) {
          throw new OutboxEventInputError(
            "Outbox payload must contain plain JSON arrays.",
          );
        }
        validateJsonValue(descriptor.value, depth + 1, ancestors);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new OutboxEventInputError(
        "Outbox payload must contain plain JSON objects.",
      );
    }

    const keys = Reflect.ownKeys(value);
    if (
      keys.length > MAX_OBJECT_KEYS ||
      keys.some((key) => typeof key !== "string")
    ) {
      throw new OutboxEventInputError(
        "Outbox payload exceeds structural limits.",
      );
    }

    for (const key of keys as string[]) {
      if (
        !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) ||
        isRestrictedPayloadField(key)
      ) {
        throw new OutboxEventInputError(
          "Outbox payload contains a restricted or invalid field.",
        );
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        throw new OutboxEventInputError(
          "Outbox payload must contain plain JSON properties.",
        );
      }

      validateJsonValue(descriptor.value, depth + 1, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function serializePayload(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  const value = payload === undefined ? {} : payload;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OutboxEventInputError("Outbox payload must be a JSON object.");
  }

  try {
    validateJsonValue(value, 0, new WeakSet<object>());
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") {
      throw new OutboxEventInputError(
        "Outbox payload must serialize to a JSON object.",
      );
    }
    if (new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) {
      throw new OutboxEventInputError(
        `Outbox payload must not exceed ${MAX_PAYLOAD_BYTES} UTF-8 bytes.`,
      );
    }
    return serialized;
  } catch (error) {
    if (error instanceof OutboxEventInputError) {
      throw error;
    }
    throw new OutboxEventInputError(
      "Outbox payload must contain only supported JSON values.",
    );
  }
}

/**
 * Insert an immutable event envelope using the caller's existing transaction.
 *
 * This function deliberately does not open, commit or roll back a transaction.
 * Callers must use the same transaction client for the domain mutation, audit
 * event and outbox event so all records commit or roll back together. The
 * database tenant policy independently rejects a mismatched organization ID.
 * Payloads are bounded and reject fields commonly used for secrets, direct
 * contact/identity data, payment credentials and private storage locators.
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
