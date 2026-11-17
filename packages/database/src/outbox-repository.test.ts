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

  it("rejects non-object and cyclic payloads", async () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

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

  it("rejects restricted fields at every nesting level", async () => {
    const payloads: Readonly<Record<string, unknown>>[] = [
      { accessToken: "not-for-events" },
      { nested: { refresh_token: "not-for-events" } },
      { contactEmail: "person@example.test" },
      { paymentCardNumber: "4111111111111111" },
      { evidenceLocator: "private/object/key" },
      { signedUrl: "https://storage.example.test/private" },
      { phoneNumber: "+10000000000" },
      { dateOfBirth: "2000-01-01" },
      { firstName: "Ada" },
      { governmentId: "restricted-id" },
      { routingNumber: "restricted-routing" },
      { iban: "restricted-iban" },
      { beneficiaryName: "Ada" },
      { FirstName: "Ada" },
      { GovernmentID: "restricted-id" },
      { APIKey: "not-for-events" },
      { IBAN: "restricted-iban" },
      { fullName: "Ada Lovelace" },
      { customerName: "Ada Lovelace" },
      { recipientName: "Ada Lovelace" },
      { displayName: "Ada Lovelace" },
      { contactName: "Ada Lovelace" },
      { birthDate: "2000-01-01" },
      { mobileNumber: "+10000000000" },
      { telephoneNumber: "+10000000000" },
      { postalCode: "12345" },
      { zipCode: "12345" },
      { healthStatus: "restricted" },
      { genderIdentity: "restricted" },
      { biometricTemplate: "restricted" },
      { ethnicity: "restricted" },
      { politicalOpinion: "restricted" },
      { religiousBelief: "restricted" },
      { EMAILADDRESS: "person@example.test" },
      { GENDERIDENTITY: "restricted" },
      { HEALTHSTATUS: "restricted" },
      { POLITICALOPINION: "restricted" },
    ];

    for (const payload of payloads) {
      const client = new FakeClient();
      await expect(
        insertOutboxEvent(client, { ...validInput, payload }),
      ).rejects.toThrow("restricted or invalid field");
      expect(client.statements).toHaveLength(0);
    }
  });

  it("rejects acronym and delimiter variants of restricted keys", async () => {
    const fieldNames = [
      "APIKey",
      "ApiKey",
      "api_key",
      "api-key",
      "api.key",
      "APIKEY",
      "FIRSTNAME",
      "FULLNAME",
      "ACCOUNTNO",
      "accountNo",
    ];
    for (const fieldName of fieldNames) {
      const client = new FakeClient();
      const payload = { [fieldName]: "not-for-events" };

      await expect(
        insertOutboxEvent(client, { ...validInput, payload }),
      ).rejects.toThrow("restricted or invalid field");
      expect(client.statements).toHaveLength(0);
    }
  });

  it("bounds shared-object traversal before serialization", async () => {
    const shared = { value: "x".repeat(1_000) };
    const branch = {
      first: shared,
      second: shared,
      third: shared,
      fourth: shared,
      fifth: shared,
      sixth: shared,
      seventh: shared,
      eighth: shared,
    };
    const payload = {
      first: branch,
      second: branch,
      third: branch,
    };
    const client = new FakeClient();

    await expect(
      insertOutboxEvent(client, { ...validInput, payload }),
    ).rejects.toBeInstanceOf(OutboxEventInputError);
    expect(client.statements).toHaveLength(0);
  });

  it("caps total visited JSON nodes across nested collections", async () => {
    const payload = {
      groups: Array.from({ length: 100 }, () =>
        Array.from({ length: 100 }, () => null),
      ),
    };
    const client = new FakeClient();

    await expect(
      insertOutboxEvent(client, { ...validInput, payload }),
    ).rejects.toBeInstanceOf(OutboxEventInputError);
    expect(client.statements).toHaveLength(0);
  });

  it("allows stable internal identifiers and non-sensitive metadata", async () => {
    const client = new FakeClient();
    const payload = {
      accountId: ORGANIZATION_ID,
      externalKey: "provider-reference",
      status: "active",
      source: "api",
    };

    await expect(
      insertOutboxEvent(client, { ...validInput, payload }),
    ).resolves.toEqual(returnedRecord);

    expect(client.statements[0]?.parameters[6]).toBe(JSON.stringify(payload));
  });

  it("rejects unsupported JavaScript values and accessor properties", async () => {
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => "computed",
    });

    const symbolProperty: Record<string, unknown> = { safe: "value" };
    Object.defineProperty(symbolProperty, Symbol("hidden"), {
      enumerable: true,
      value: "not-json",
    });

    const inherited = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    inherited["safe"] = "value";

    const payloads: unknown[] = [
      { value: undefined },
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: 1n },
      { value: Symbol("not-json") },
      { value: () => "not-json" },
      { value: new Date("2026-11-07T10:00:00.000Z") },
      { values: new Array(1) },
      accessor,
      symbolProperty,
      inherited,
    ];

    for (const payload of payloads) {
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

  it("enforces payload depth, collection and UTF-8 size bounds", async () => {
    const tooDeep: Record<string, unknown> = {};
    let current = tooDeep;
    for (let index = 0; index < 9; index += 1) {
      const child: Record<string, unknown> = {};
      current["child"] = child;
      current = child;
    }
    current["value"] = true;

    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`field${index}`, index]),
    );
    const tooManyItems = { values: Array.from({ length: 101 }, (_, i) => i) };
    const tooManyBytes = {
      first: "a".repeat(4_096),
      second: "b".repeat(4_096),
      third: "c".repeat(4_096),
      fourth: "d".repeat(4_096),
    };

    for (const payload of [tooDeep, tooManyKeys, tooManyItems, tooManyBytes]) {
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
