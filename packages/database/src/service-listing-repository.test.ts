import type {
  TenantConnection,
  TenantConnectionPool,
} from "./tenant-transaction.js";
import { describe, expect, it, vi } from "vitest";
import {
  PostgresServiceListingRepository,
  ServiceListingAuthorizationError,
  ServiceListingInputError,
} from "./service-listing-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";
const serviceListingId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-11-06T09:00:00.000Z");

function serviceRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: serviceListingId,
    organization_id: organizationId,
    created_by_account_id: actorAccountId,
    slug: "remote-consulting",
    title: "Remote Consulting",
    summary: "Expert consulting for product teams",
    description: "A detailed consulting service description",
    category: "consulting",
    status: "draft",
    visibility: "public",
    delivery_mode: "remote",
    pricing_model: "hourly",
    price_amount: "125.00",
    price_currency: "USD",
    location_label: null,
    expires_at: null,
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

describe("PostgresServiceListingRepository", () => {
  it("creates a draft under the tenant lock and writes an audit event", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [{ role: "member", status: "active" }],
      [serviceRow()],
      [],
      [],
    ]);
    const authorize = vi.fn(() => true);
    const repository = new PostgresServiceListingRepository(pool, authorize);

    await expect(
      repository.createDraft({
        organizationId: organizationId.toUpperCase(),
        actorAccountId: actorAccountId.toUpperCase(),
        slug: "remote-consulting",
        title: " Remote Consulting ",
        summary: " Expert consulting for product teams ",
        description: " A detailed consulting service description ",
        category: "consulting",
        deliveryMode: "remote",
        pricingModel: "hourly",
        priceAmount: 125,
        priceCurrency: "usd",
      }),
    ).resolves.toMatchObject({
      id: serviceListingId,
      status: "draft",
      pricingModel: "hourly",
    });

    expect(query.mock.calls[1]?.[1]).toEqual([organizationId]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "organization-memberships:" + organizationId,
    ]);
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

  it("denies draft creation when the authorizer rejects the actor", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [{ role: "viewer", status: "active" }],
    ]);
    const repository = new PostgresServiceListingRepository(pool, () => false);

    await expect(
      repository.createDraft({
        organizationId,
        actorAccountId,
        slug: "remote-consulting",
        title: "Remote Consulting",
        summary: "Expert consulting",
        description: "A detailed consulting service description",
        category: "consulting",
        deliveryMode: "remote",
        pricingModel: "quote",
      }),
    ).rejects.toBeInstanceOf(ServiceListingAuthorizationError);

    expect(
      query.mock.calls.some(([statement]) =>
        statement.startsWith("INSERT INTO service_listings"),
      ),
    ).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("requires a currency and amount for priced service models", async () => {
    const { pool, connect } = createTransactionalPool([]);
    const repository = new PostgresServiceListingRepository(pool, () => true);

    await expect(
      repository.createDraft({
        organizationId,
        actorAccountId,
        slug: "remote-consulting",
        title: "Remote Consulting",
        summary: "Expert consulting",
        description: "A detailed consulting service description",
        category: "consulting",
        deliveryMode: "remote",
        pricingModel: "fixed",
      }),
    ).rejects.toBeInstanceOf(ServiceListingInputError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("publishes an authorized draft and audits the state transition", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [{ role: "admin", status: "active" }],
      [serviceRow()],
      [serviceRow({ status: "published", published_at: createdAt })],
      [],
      [],
    ]);
    const authorize = vi.fn(() => true);
    const repository = new PostgresServiceListingRepository(pool, authorize);

    await expect(
      repository.publish({
        organizationId,
        actorAccountId,
        serviceListingId,
      }),
    ).resolves.toMatchObject({ id: serviceListingId, status: "published" });

    expect(authorize).toHaveBeenCalledWith({
      actorAccountId,
      organizationId,
      role: "admin",
      membershipStatus: "active",
      action: "publish",
      isCreator: true,
      currentStatus: "draft",
    });
    expect(query.mock.calls[5]?.[0]).toContain("status = 'published'");
    expect(query.mock.calls[6]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[7]?.[0]).toBe("COMMIT");
  });

  it("searches only through the restricted public service view", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: serviceListingId,
          organization_id: organizationId,
          slug: "remote-consulting",
          title: "Remote Consulting",
          summary: "Expert consulting",
          category: "consulting",
          delivery_mode: "remote",
          pricing_model: "hourly",
          price_amount: "125.00",
          price_currency: "USD",
          location_label: null,
          published_at: createdAt,
          expires_at: null,
        },
      ],
    });
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresServiceListingRepository(pool, () => true);

    await expect(
      repository.listPublic({
        category: "consulting",
        deliveryMode: "remote",
        query: "product teams",
        limit: 10,
        offset: 0,
      }),
    ).resolves.toMatchObject([
      { id: serviceListingId, category: "consulting", pricingModel: "hourly" },
    ]);

    expect(query.mock.calls[0]?.[0]).toContain("FROM public_service_listings");
    expect(query.mock.calls[0]?.[0]).toContain("search_document @@");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "consulting",
      "remote",
      "product teams",
      10,
      0,
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
