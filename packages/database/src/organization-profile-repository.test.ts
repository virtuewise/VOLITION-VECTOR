import { describe, expect, it, vi } from "vitest";
import type {
  TenantConnection,
  TenantConnectionPool,
  TenantQueryResult,
} from "./tenant-transaction.js";
import { PostgresOrganizationProfileRepository } from "./organization-profile-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";

const accessRow = {
  organization_id: organizationId,
  account_status: "active",
  organization_status: "active",
  membership_status: "active",
  role: "owner" as const,
};

const profileRow = {
  organization_id: organizationId,
  description: "A research organization",
  website_url: "https://example.test/",
  country_code: "ZA",
  locale: "en-ZA",
  time_zone: "Africa/Johannesburg",
  updated_at: new Date("2026-11-12T08:00:00.000Z"),
};

function makePool(options?: {
  access?: typeof accessRow | null;
  profile?: typeof profileRow | null;
  saved?: typeof profileRow | null;
}) {
  const calls: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const client: TenantConnection = {
    query: async (sql, parameters): Promise<TenantQueryResult> => {
      calls.push(parameters === undefined ? { sql } : { sql, parameters });
      if (sql.includes("FROM organizations AS organization")) {
        return {
          rows: options?.access === null ? [] : [options?.access ?? accessRow],
        };
      }
      if (
        sql.includes("FROM organization_profiles") &&
        sql.includes("FOR UPDATE")
      ) {
        return {
          rows:
            options?.profile === null ? [] : [options?.profile ?? profileRow],
        };
      }
      if (sql.includes("FROM organization_profiles")) {
        return {
          rows:
            options?.profile === null ? [] : [options?.profile ?? profileRow],
        };
      }
      if (sql.includes("INSERT INTO organization_profiles")) {
        return {
          rows: options?.saved === null ? [] : [options?.saved ?? profileRow],
        };
      }
      return { rows: [] };
    },
    release: vi.fn(),
  };
  const pool: TenantConnectionPool = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { pool, calls, client };
}

function authorize(input: {
  accountStatus: string;
  organizationStatus: string;
  membershipStatus: string;
  role: string;
  permission: string;
}) {
  return (
    input.accountStatus === "active" &&
    input.organizationStatus === "active" &&
    input.membershipStatus === "active" &&
    (input.permission === "organization:read" ||
      (input.permission === "organization:update" &&
        (input.role === "owner" || input.role === "admin")))
  );
}

describe("PostgresOrganizationProfileRepository", () => {
  it("reads only after active account, organization and membership authorization", async () => {
    const { pool, calls } = makePool();
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.getForOrganization({ organizationId, actorAccountId }),
    ).resolves.toMatchObject({
      organizationId,
      description: "A research organization",
      countryCode: "ZA",
    });
    expect(
      calls.some((call) => call.sql.includes("set_config('app.tenant_id'")),
    ).toBe(true);
    expect(
      calls.some((call) =>
        call.sql.includes("FOR SHARE OF organization, membership"),
      ),
    ).toBe(true);
  });

  it("returns a safe default profile when an authorized organization has no profile row", async () => {
    const { pool } = makePool({ profile: null });
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.getForOrganization({ organizationId, actorAccountId }),
    ).resolves.toEqual({
      organizationId,
      description: null,
      websiteUrl: null,
      countryCode: null,
      locale: "en",
      timeZone: "UTC",
      updatedAt: null,
    });
  });

  it("fails closed for suspended accounts and never reads the profile", async () => {
    const { pool, calls } = makePool({
      access: { ...accessRow, account_status: "suspended" },
    });
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.getForOrganization({ organizationId, actorAccountId }),
    ).resolves.toBeNull();
    expect(
      calls.some((call) => call.sql.includes("FROM organization_profiles")),
    ).toBe(false);
  });

  it("fails closed when the caller has no active membership", async () => {
    const { pool, calls } = makePool({
      access: { ...accessRow, membership_status: "revoked" },
    });
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.updateForOrganization({
        organizationId,
        actorAccountId,
        description: "Updated description",
      }),
    ).resolves.toBeNull();
    expect(
      calls.some((call) =>
        call.sql.includes("INSERT INTO organization_profiles"),
      ),
    ).toBe(false);
  });

  it("updates a profile and appends only changed field names to the audit event", async () => {
    const saved = {
      ...profileRow,
      description: "Updated description",
    };
    const { pool, calls } = makePool({
      profile: null,
      saved,
    });
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.updateForOrganization({
        organizationId,
        actorAccountId,
        description: "Updated description",
        countryCode: "za",
      }),
    ).resolves.toMatchObject({
      description: "Updated description",
      countryCode: "ZA",
    });

    const audit = calls.find((call) =>
      call.sql.includes("INSERT INTO audit_events"),
    );
    expect(audit).toBeDefined();
    expect(JSON.parse(String(audit?.parameters?.[3]))).toEqual({
      changedFields: ["description", "countryCode"],
    });
  });

  it("does not materialize a first patch that matches virtual defaults", async () => {
    const { pool, calls } = makePool({ profile: null });
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.updateForOrganization({
        organizationId,
        actorAccountId,
        description: null,
        websiteUrl: null,
        countryCode: null,
        locale: "en",
        timeZone: "UTC",
      }),
    ).resolves.toEqual({
      organizationId,
      description: null,
      websiteUrl: null,
      countryCode: null,
      locale: "en",
      timeZone: "UTC",
      updatedAt: null,
    });

    expect(
      calls.some((call) =>
        call.sql.includes("INSERT INTO organization_profiles"),
      ),
    ).toBe(false);
    expect(
      calls.some((call) => call.sql.includes("INSERT INTO audit_events")),
    ).toBe(false);
  });

  it("audits only non-default fields on the first profile patch", async () => {
    const saved = {
      ...profileRow,
      description: null,
      website_url: null,
      country_code: null,
      locale: "en-ZA",
      time_zone: "UTC",
    };
    const { pool, calls } = makePool({ profile: null, saved });
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await repository.updateForOrganization({
      organizationId,
      actorAccountId,
      description: null,
      locale: "en-ZA",
    });

    const audit = calls.find((call) =>
      call.sql.includes("INSERT INTO audit_events"),
    );
    expect(JSON.parse(String(audit?.parameters?.[3]))).toEqual({
      changedFields: ["locale"],
    });
  });

  it("suppresses no-op updates and does not append an audit event", async () => {
    const { pool, calls } = makePool();
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.updateForOrganization({
        organizationId,
        actorAccountId,
        description: profileRow.description,
      }),
    ).resolves.toMatchObject({ description: profileRow.description });
    expect(
      calls.some((call) => call.sql.includes("INSERT INTO audit_events")),
    ).toBe(false);
  });

  it("rejects insecure URLs before opening a transaction", async () => {
    const { pool } = makePool();
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.updateForOrganization({
        organizationId,
        actorAccountId,
        websiteUrl: "http://example.test",
      }),
    ).rejects.toThrow(/HTTPS/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects invalid locale and time-zone values before opening a transaction", async () => {
    const { pool } = makePool();
    const repository = new PostgresOrganizationProfileRepository(
      pool,
      authorize,
    );

    await expect(
      repository.updateForOrganization({
        organizationId,
        actorAccountId,
        locale: "not a locale",
      }),
    ).rejects.toThrow(/BCP 47/);
    await expect(
      repository.updateForOrganization({
        organizationId,
        actorAccountId,
        timeZone: "Mars/Olympus",
      }),
    ).rejects.toThrow(/IANA/);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
