import type {
  TenantConnection,
  TenantConnectionPool,
} from "./tenant-transaction.js";
import { describe, expect, it, vi } from "vitest";
import {
  OpportunityAuthorizationError,
  OpportunityInputError,
  PostgresOpportunityRepository,
} from "./opportunity-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-11-06T09:00:00.000Z");

function opportunityRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: opportunityId,
    organization_id: organizationId,
    created_by_account_id: actorAccountId,
    slug: "senior-engineer",
    title: "Senior Engineer",
    summary: "Build reliable software",
    description: "A detailed opportunity description",
    opportunity_type: "employment",
    status: "draft",
    visibility: "public",
    location_label: "Johannesburg",
    is_remote: true,
    compensation_min: "90000.00",
    compensation_max: "120000.00",
    compensation_currency: "ZAR",
    starts_at: null,
    expires_at: new Date("2026-12-06T00:00:00.000Z"),
    published_at: null,
    created_at: createdAt,
    updated_at: createdAt,
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

describe("PostgresOpportunityRepository", () => {
  it("creates a draft under the canonical tenant lock and appends an audit event", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [{ role: "member", status: "active" }],
      [opportunityRow()],
      [],
      [],
    ]);
    const authorize = vi.fn(() => true);
    const repository = new PostgresOpportunityRepository(pool, authorize);

    await expect(
      repository.createDraft({
        organizationId: organizationId.toUpperCase(),
        actorAccountId: actorAccountId.toUpperCase(),
        slug: "senior-engineer",
        title: " Senior Engineer ",
        summary: " Build reliable software ",
        description: " A detailed opportunity description ",
        opportunityType: "employment",
        visibility: "public",
        locationLabel: "Johannesburg",
        isRemote: true,
        compensationMin: 90_000,
        compensationMax: 120_000,
        compensationCurrency: "zar",
        expiresAt: new Date("2026-12-06T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      id: opportunityId,
      status: "draft",
      opportunityType: "employment",
    });

    expect(query.mock.calls[1]?.[1]).toEqual([organizationId]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "organization-memberships:" + organizationId,
    ]);
    expect(query.mock.calls[3]?.[1]).toEqual([organizationId, actorAccountId]);
    expect(authorize).toHaveBeenCalledWith({
      actorAccountId,
      organizationId,
      role: "member",
      membershipStatus: "active",
      action: "create",
      isCreator: true,
      currentStatus: null,
    });
    expect(query.mock.calls[5]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[6]?.[0]).toBe("COMMIT");
  });

  it("rejects an already-expired draft before opening a tenant transaction", async () => {
    const { pool, connect } = createTransactionalPool([]);
    const repository = new PostgresOpportunityRepository(pool, () => true);

    await expect(
      repository.createDraft({
        organizationId,
        actorAccountId,
        slug: "expired-role",
        title: "Expired role",
        summary: "This role has expired",
        description: "An expired opportunity must not be published.",
        opportunityType: "employment",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(OpportunityInputError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("denies draft creation when the policy callback rejects the actor", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [{ role: "viewer", status: "active" }],
    ]);
    const repository = new PostgresOpportunityRepository(pool, () => false);

    await expect(
      repository.createDraft({
        organizationId,
        actorAccountId,
        slug: "senior-engineer",
        title: "Senior Engineer",
        summary: "Build reliable software",
        description: "A detailed opportunity description",
        opportunityType: "employment",
      }),
    ).rejects.toBeInstanceOf(OpportunityAuthorizationError);

    expect(
      query.mock.calls.some(([statement]) =>
        statement.startsWith("INSERT INTO opportunities"),
      ),
    ).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("publishes an authorized draft and records the transition", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [{ role: "owner", status: "active" }],
      [opportunityRow()],
      [opportunityRow({ status: "published", published_at: createdAt })],
      [],
      [],
    ]);
    const authorize = vi.fn(() => true);
    const repository = new PostgresOpportunityRepository(pool, authorize);

    await expect(
      repository.publish({ organizationId, actorAccountId, opportunityId }),
    ).resolves.toMatchObject({ id: opportunityId, status: "published" });

    expect(authorize).toHaveBeenCalledWith({
      actorAccountId,
      organizationId,
      role: "owner",
      membershipStatus: "active",
      action: "publish",
      isCreator: true,
      currentStatus: "draft",
    });
    expect(query.mock.calls[5]?.[0]).toContain("SET status = $3");
    expect(query.mock.calls[5]?.[1]).toEqual([
      organizationId,
      opportunityId,
      "published",
      ["draft", "paused"],
    ]);
    expect(query.mock.calls[6]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[7]?.[0]).toBe("COMMIT");
  });

  it("returns no public data from an untrusted listing view", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: opportunityId, slug: "senior-engineer" }],
    });
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresOpportunityRepository(pool, () => true);

    await expect(
      repository.listPublic({
        query: "senior engineer",
        opportunityType: "employment",
        limit: 10,
        offset: 0,
      }),
    ).resolves.toEqual([{ id: opportunityId, slug: "senior-engineer" }]);

    expect(query.mock.calls[0]?.[0]).toContain("FROM public_opportunities");
    expect(query.mock.calls[0]?.[0]).toContain("search_document @@");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "employment",
      "senior engineer",
      10,
      0,
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects invalid pagination before acquiring a connection", async () => {
    const { pool, connect } = createTransactionalPool([]);

    const repository = new PostgresOpportunityRepository(pool, () => true);

    await expect(repository.listPublic({ limit: 100 })).rejects.toBeInstanceOf(
      OpportunityInputError,
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it("updates a creator member's draft and audits the changed fields", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [{ role: "member", status: "active" }],
      [opportunityRow()],
      [opportunityRow({ title: "Updated Senior Engineer" })],
      [],
      [],
    ]);
    const authorize = vi.fn(() => true);
    const repository = new PostgresOpportunityRepository(pool, authorize);

    await expect(
      repository.updateDraft({
        organizationId,
        actorAccountId,
        opportunityId,
        title: "Updated Senior Engineer",
        summary: "Updated summary",
        description: "Updated description",
      }),
    ).resolves.toMatchObject({ title: "Updated Senior Engineer" });

    expect(authorize).toHaveBeenCalledWith({
      actorAccountId,
      organizationId,
      role: "member",
      membershipStatus: "active",
      action: "edit",
      isCreator: true,
      currentStatus: "draft",
    });
    expect(query.mock.calls[5]?.[0]).toContain("status IN ('draft', 'paused')");
    expect(query.mock.calls[6]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[7]?.[0]).toBe("COMMIT");
  });

  it.each([
    {
      action: "pause" as const,
      source: "published" as const,
      target: "paused" as const,
    },
    {
      action: "close" as const,
      source: "paused" as const,
      target: "closed" as const,
    },
    {
      action: "archive" as const,
      source: "closed" as const,
      target: "archived" as const,
    },
  ])(
    "audits the $action lifecycle transition",
    async ({ action, source, target }) => {
      const { pool, query } = createTransactionalPool([
        [],
        [],
        [],
        [{ role: "owner", status: "active" }],
        [opportunityRow({ status: source })],
        [opportunityRow({ status: target })],
        [],
        [],
      ]);
      const authorize = vi.fn(() => true);
      const repository = new PostgresOpportunityRepository(pool, authorize);

      await expect(
        repository[action]({ organizationId, actorAccountId, opportunityId }),
      ).resolves.toMatchObject({ status: target });

      expect(authorize).toHaveBeenCalledWith({
        actorAccountId,
        organizationId,
        role: "owner",
        membershipStatus: "active",
        action,
        isCreator: true,
        currentStatus: source,
      });
      expect(query.mock.calls[5]?.[1]).toEqual([
        organizationId,
        opportunityId,
        target,
        action === "pause"
          ? ["published"]
          : action === "close"
            ? ["published", "paused"]
            : ["draft", "paused", "closed"],
      ]);
      expect(query.mock.calls[6]?.[0]).toContain("INSERT INTO audit_events");
      expect(query.mock.calls[7]?.[0]).toBe("COMMIT");
    },
  );

  it("exports a bounded snapshot from the public projection in one read-only transaction", async () => {
    const capturedAt = new Date("2026-11-28T08:00:00.000Z");
    const rows = [
      {
        id: opportunityId,
        slug: "senior-engineer",
        title: "Senior Engineer",
        summary: "Build reliable software",
        opportunity_type: "employment",
        location_label: "Johannesburg",
        is_remote: true,
        compensation_min: "90000.00",
        compensation_max: "120000.00",
        compensation_currency: "ZAR",
        published_at: createdAt,
        expires_at: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        slug: "community-solar",
        title: "Community Solar Project",
        summary: "Develop local solar capacity",
        opportunity_type: "project",
        location_label: null,
        is_remote: false,
        compensation_min: null,
        compensation_max: null,
        compensation_currency: null,
        published_at: createdAt,
        expires_at: new Date("2026-12-01T00:00:00.000Z"),
      },
    ];
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ captured_at: capturedAt }] })
      .mockResolvedValueOnce({ rows });
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresOpportunityRepository(pool, () => true);

    const snapshot = await repository.createPublicCorpusSnapshot();

    expect(snapshot).toMatchObject({
      schemaVersion: "1.0.0",
      corpusSnapshotAt: capturedAt.toISOString(),
      sourcePolicy: "public-opportunity-projection-only",
      recordCount: 2,
    });
    expect(snapshot.corpusSnapshotId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(snapshot.sha256).toMatch(/^[0-9a-f]{64}$/);
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(snapshot.records)),
    );
    const expectedHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(snapshot.sha256).toBe(expectedHash);
    expect(snapshot.records.map((record) => record.id)).toEqual([
      opportunityId,
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect(snapshot.records[0]).not.toHaveProperty("organizationId");
    expect(snapshot.records[0]).not.toHaveProperty("description");

    expect(query.mock.calls[0]?.[0]).toBe(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(query.mock.calls[1]?.[0]).toContain("statement_timestamp()");
    expect(query.mock.calls[2]?.[0]).toContain("FROM public_opportunities");
    expect(query.mock.calls[2]?.[0]).toContain("ORDER BY id ASC");
    expect(query.mock.calls[2]?.[0]).toContain("expires_at > $1");
    expect(query.mock.calls[2]?.[0]).not.toContain("organization_id");
    expect(query.mock.calls[2]?.[0]).not.toContain("description");
    expect(query.mock.calls[2]?.[1]).toEqual([capturedAt, 100, 0]);
    expect(query.mock.calls[3]?.[0]).toBe("COMMIT");
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("set_config('app.tenant_id'"),
      ),
    ).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back a failed public corpus page without returning a partial snapshot", async () => {
    const capturedAt = new Date("2026-11-28T08:00:00.000Z");
    const failure = new Error("public snapshot page failed");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ captured_at: capturedAt }] })
      .mockRejectedValueOnce(failure);
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresOpportunityRepository(pool, () => true);

    await expect(repository.createPublicCorpusSnapshot()).rejects.toBe(failure);

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SELECT statement_timestamp() AS captured_at",
      expect.stringContaining("FROM public_opportunities"),
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("fails closed rather than truncating a public corpus above 10000 records", async () => {
    const capturedAt = new Date("2026-11-28T08:00:00.000Z");
    const publicRow = (index: number) => ({
      id: "00000000-0000-4000-8000-" + index.toString(16).padStart(12, "0"),
      slug: "public-opportunity-" + index,
      title: "Public opportunity",
      summary: "Public summary",
      opportunity_type: "employment",
      location_label: null,
      is_remote: false,
      compensation_min: null,
      compensation_max: null,
      compensation_currency: null,
      published_at: createdAt,
      expires_at: null,
    });
    const query = vi.fn(
      async (statement: string, parameters?: readonly unknown[]) => {
        if (statement.includes("statement_timestamp()")) {
          return { rows: [{ captured_at: capturedAt }] };
        }
        if (statement.includes("FROM public_opportunities")) {
          const offset = Number(parameters?.[2] ?? 0);
          const count = offset < 10_000 ? 100 : 1;
          return {
            rows: Array.from({ length: count }, (_, index) =>
              publicRow(offset + index + 1),
            ),
          };
        }
        return { rows: [] };
      },
    );
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresOpportunityRepository(pool, () => true);

    await expect(repository.createPublicCorpusSnapshot()).rejects.toThrow(
      "exceeds the 10000-record limit",
    );

    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledWith(undefined);
  });
});
