import { describe, expect, it } from "vitest";
import {
  insertOutboxEvent,
  OutboxEventInputError,
  type OutboxEventRecord,
} from "./outbox-repository.js";
import type {
  TenantQueryResult,
  TenantTransactionClient,
} from "./tenant-transaction.js";

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAYLOAD = { projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const OCCURRED_AT = new Date("2026-11-07T10:00:00.000Z");
const CREATED_AT = new Date("2026-11-07T10:00:01.000Z");

const returnedRecord: OutboxEventRecord = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  organizationId: ORGANIZATION_ID,
  idempotencyKey: "project-created-1",
  eventName: "project.workspace.created",
  aggregateType: "project_workspace",
  aggregateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  schemaVersion: 1,
  payload: PAYLOAD,
  occurredAt: OCCURRED_AT,
  createdAt: CREATED_AT,
};

const validInput = {
  organizationId: ORGANIZATION_ID,
  idempotencyKey: "project-created-1",
  eventName: "project.workspace.created",
  aggregateType: "project_workspace",
  aggregateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  payload: PAYLOAD,
} as const;

class FakeClient implements TenantTransactionClient {
  readonly statements: Array<{
    readonly sql: string;
    readonly parameters: readonly unknown[];
  }> = [];

  constructor(
    private readonly rows: readonly unknown[] = [returnedRecordToRow()],
  ) {}

  async query(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<TenantQueryResult> {
    this.statements.push({ sql: statement, parameters });
    return { rows: this.rows };
  }
}

function returnedRecordToRow() {
  return {
    id: returnedRecord.id,
    organization_id: returnedRecord.organizationId,
    idempotency_key: returnedRecord.idempotencyKey,
    event_name: returnedRecord.eventName,
    aggregate_type: returnedRecord.aggregateType,
    aggregate_id: returnedRecord.aggregateId,
    schema_version: returnedRecord.schemaVersion,
    payload: returnedRecord.payload,
    occurred_at: returnedRecord.occurredAt,
    created_at: returnedRecord.createdAt,
  };
}

describe("insertOutboxEvent", () => {
  it("inserts a versioned event envelope on the caller's transaction client", async () => {
    const client = new FakeClient();

    await expect(insertOutboxEvent(client, validInput)).resolves.toEqual(
      returnedRecord,
    );

    expect(client.statements).toHaveLength(1);
    expect(client.statements[0]?.sql).toContain("INSERT INTO outbox_events");
    expect(client.statements[0]?.sql).toContain("RETURNING id");
    expect(client.statements[0]?.parameters).toEqual([
      ORGANIZATION_ID,
      "project-created-1",
      "project.workspace.created",
      "project_workspace",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      1,
      JSON.stringify(PAYLOAD),
    ]);
    expect(client.statements[0]?.sql).not.toMatch(
      /\b(BEGIN|COMMIT|ROLLBACK)\b/,
    );
  });

  it("rejects invalid event envelope fields before querying", async () => {
    const cases = [
      { ...validInput, idempotencyKey: " " },
      { ...validInput, eventName: "Project.Created" },
      { ...validInput, aggregateType: " " },
      { ...validInput, aggregateId: " " },
      { ...validInput, schemaVersion: 0 },
      { ...validInput, schemaVersion: 32_768 },
    ];

    for (const input of cases) {
      const client = new FakeClient();
      await expect(insertOutboxEvent(client, input)).rejects.toBeInstanceOf(
        OutboxEventInputError,
      );
      expect(client.statements).toHaveLength(0);
    }
  });

  it("rejects non-object and non-serializable payloads", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    for (const payload of [null, [], circular]) {
      const client = new FakeClient();
      await expect(
        insertOutboxEvent(client, {
          ...validInput,
          payload: payload as Readonly<Record<string, unknown>>,
        }),
      ).rejects.toBeInstanceOf(OutboxEventInputError);
      expect(client.statements).toHaveLength(0);
    }
  });

  it("rejects invalid tenant IDs before querying", async () => {
    const client = new FakeClient();
    await expect(
      insertOutboxEvent(client, {
        ...validInput,
        organizationId: "not-a-uuid",
      }),
    ).rejects.toThrow();
    expect(client.statements).toHaveLength(0);
  });

  it("fails when the database returns no inserted row", async () => {
    const client = new FakeClient([]);
    await expect(insertOutboxEvent(client, validInput)).rejects.toThrow(
      "did not return the inserted outbox event",
    );
  });
});
