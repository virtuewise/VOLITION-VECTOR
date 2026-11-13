import { describe, expect, it, vi } from "vitest";
import { PostgresAccountOrganizationRepository } from "./account-organization-repository.js";
import type { TenantConnectionPool } from "./tenant-transaction.js";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

function makePool(
  queryImplementation: (
    statement: string,
    parameters?: readonly unknown[],
  ) => Promise<{ rows: unknown[] }> = async () => ({ rows: [] }),
) {
  const query = vi.fn(queryImplementation);
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  return {
    pool: { connect } as unknown as TenantConnectionPool,
    connect,
    query,
    release,
  };
}

describe("PostgresAccountOrganizationRepository", () => {
  it("returns only active organization summaries for the transaction-local account", async () => {
    const { pool, query, release } = makePool(async (statement) =>
      statement.includes("FROM organization_memberships")
        ? {
            rows: [
              {
                organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                name: "Alpha Studio",
                slug: "alpha-studio",
                role: "owner",
              },
              {
                organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                name: "Beta Services",
                slug: "beta-services",
                role: "viewer",
              },
            ],
          }
        : { rows: [] },
    );
    const repository = new PostgresAccountOrganizationRepository(pool);

    await expect(repository.listForAccount(ACCOUNT_ID)).resolves.toEqual([
      {
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Alpha Studio",
        slug: "alpha-studio",
        role: "owner",
      },
      {
        organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Beta Services",
        slug: "beta-services",
        role: "viewer",
      },
    ]);

    expect(query).toHaveBeenCalledWith(
      "SELECT set_config('app.account_id', $1, true)",
      [ACCOUNT_ID],
    );
    const discoveryQuery = query.mock.calls.find(([statement]) =>
      statement.includes("FROM organization_memberships"),
    );
    expect(discoveryQuery?.[1]).toEqual([ACCOUNT_ID]);
    expect(discoveryQuery?.[0]).toContain("membership.status = 'active'");
    expect(discoveryQuery?.[0]).toContain("organization.status = 'active'");
    expect(discoveryQuery?.[0]).toContain("account.status = 'active'");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns an empty list when the account has no active organizations", async () => {
    const { pool } = makePool();
    const repository = new PostgresAccountOrganizationRepository(pool);

    await expect(repository.listForAccount(ACCOUNT_ID)).resolves.toEqual([]);
  });

  it("rejects malformed database rows instead of returning unsafe summaries", async () => {
    const { pool } = makePool(async (statement) =>
      statement.includes("FROM organization_memberships")
        ? {
            rows: [
              {
                organization_id: "not-a-uuid",
                name: "Organization",
                slug: "organization",
                role: "superuser",
              },
            ],
          }
        : { rows: [] },
    );
    const repository = new PostgresAccountOrganizationRepository(pool);

    await expect(repository.listForAccount(ACCOUNT_ID)).rejects.toThrow(
      "invalid record",
    );
  });

  it("rejects an invalid account before acquiring a connection", async () => {
    const { pool, connect } = makePool();
    const repository = new PostgresAccountOrganizationRepository(pool);

    await expect(repository.listForAccount("not-a-uuid")).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
});
