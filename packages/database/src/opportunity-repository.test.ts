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
    expect(query.mock.calls[5]?.[0]).toContain("status = 'published'");
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
});
