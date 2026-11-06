import type {
  TenantConnection,
  TenantConnectionPool,
} from "./tenant-transaction.js";
import { describe, expect, it, vi } from "vitest";
import {
  OpportunityApplicationAuthorizationError,
  OpportunityApplicationConflictError,
  OpportunityApplicationInputError,
  PostgresOpportunityApplicationRepository,
} from "./opportunity-application-repository.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicantAccountId = "11111111-1111-4111-8111-111111111111";
const reviewerAccountId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "33333333-3333-4333-8333-333333333333";
const applicationId = "44444444-4444-4444-8444-444444444444";
const timestamp = new Date("2026-11-06T09:00:00.000Z");

function applicationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: applicationId,
    organization_id: organizationId,
    opportunity_id: opportunityId,
    applicant_account_id: applicantAccountId,
    opportunity_slug_snapshot: "senior-engineer",
    opportunity_title_snapshot: "Senior Engineer",
    opportunity_type_snapshot: "employment",
    cover_note: "I am interested in this role.",
    status: "submitted",
    submitted_at: timestamp,
    updated_at: timestamp,
    reviewed_at: null,
    reviewed_by_account_id: null,
    withdrawn_at: null,
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

describe("PostgresOpportunityApplicationRepository", () => {
  it("submits against a published public opportunity and audits the application", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [
        {
          slug: "senior-engineer",
          title: "Senior Engineer",
          opportunity_type: "employment",
        },
      ],
      [applicationRow()],
      [],
      [],
    ]);
    const repository = new PostgresOpportunityApplicationRepository(pool);

    await expect(
      repository.submit({
        organizationId,
        opportunityId,
        applicantAccountId: applicantAccountId.toUpperCase(),
        coverNote: " I am interested in this role. ",
      }),
    ).resolves.toMatchObject({
      id: applicationId,
      status: "submitted",
      opportunityTitle: "Senior Engineer",
    });

    expect(query.mock.calls[1]?.[1]).toEqual([organizationId]);
    expect(query.mock.calls[2]?.[0]).toContain("app.account_id");
    expect(query.mock.calls[2]?.[1]).toEqual([applicantAccountId]);
    expect(query.mock.calls[3]?.[0]).toContain("status = 'published'");
    expect(query.mock.calls[4]?.[0]).toContain(
      "ON CONFLICT (opportunity_id, applicant_account_id) DO NOTHING",
    );
    expect(query.mock.calls[5]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[6]?.[0]).toBe("COMMIT");
  });

  it("rejects an application when the opportunity is not publicly available", async () => {
    const { pool, query } = createTransactionalPool([[], [], [], []]);
    const repository = new PostgresOpportunityApplicationRepository(pool);

    await expect(
      repository.submit({
        organizationId,
        opportunityId,
        applicantAccountId,
      }),
    ).rejects.toBeInstanceOf(OpportunityApplicationConflictError);

    expect(
      query.mock.calls.some(([sql]) =>
        sql.startsWith("INSERT INTO opportunity_applications"),
      ),
    ).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("rejects oversized cover notes before opening a transaction", async () => {
    const { pool, connect } = createTransactionalPool([]);
    const repository = new PostgresOpportunityApplicationRepository(pool);

    await expect(
      repository.submit({
        organizationId,
        opportunityId,
        applicantAccountId,
        coverNote: "x".repeat(5_001),
      }),
    ).rejects.toBeInstanceOf(OpportunityApplicationInputError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("allows only the applicant to withdraw a submitted application", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [applicationRow({ status: "withdrawn", withdrawn_at: timestamp })],
      [],
      [],
    ]);
    const repository = new PostgresOpportunityApplicationRepository(pool);

    await expect(
      repository.withdraw({
        organizationId,
        applicationId,
        applicantAccountId,
      }),
    ).resolves.toMatchObject({ id: applicationId, status: "withdrawn" });

    expect(query.mock.calls[2]?.[0]).toContain("app.actor_type");
    expect(query.mock.calls[3]?.[0]).toContain(
      "applicant_account_id = $3 AND status = 'submitted'",
    );
    expect(query.mock.calls[4]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[5]?.[0]).toBe("COMMIT");
  });

  it("denies member reviewers before updating an application", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [],
      [{ role: "member", status: "active" }],
    ]);
    const authorizeReview = vi.fn(() => false);
    const repository = new PostgresOpportunityApplicationRepository(
      pool,
      authorizeReview,
    );

    await expect(
      repository.review({
        organizationId,
        applicationId,
        reviewerAccountId,
        decision: "shortlisted",
      }),
    ).rejects.toBeInstanceOf(OpportunityApplicationAuthorizationError);

    expect(authorizeReview).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        sql.startsWith("UPDATE opportunity_applications"),
      ),
    ).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("revalidates an admin reviewer and audits the review decision", async () => {
    const { pool, query } = createTransactionalPool([
      [],
      [],
      [],
      [],
      [{ role: "admin", status: "active" }],
      [applicationRow()],
      [
        applicationRow({
          status: "accepted",
          reviewed_at: timestamp,
          reviewed_by_account_id: reviewerAccountId,
        }),
      ],
      [],
      [],
    ]);
    const authorizeReview = vi.fn(() => true);
    const repository = new PostgresOpportunityApplicationRepository(
      pool,
      authorizeReview,
    );

    await expect(
      repository.review({
        organizationId,
        applicationId,
        reviewerAccountId,
        decision: "accepted",
      }),
    ).resolves.toMatchObject({ id: applicationId, status: "accepted" });

    expect(authorizeReview).toHaveBeenCalledWith({
      reviewerAccountId,
      organizationId,
      role: "admin",
      membershipStatus: "active",
      currentStatus: "submitted",
      decision: "accepted",
    });
    expect(query.mock.calls[6]?.[0]).toContain("reviewed_by_account_id = $4");
    expect(query.mock.calls[7]?.[0]).toContain("INSERT INTO audit_events");
    expect(query.mock.calls[8]?.[0]).toBe("COMMIT");
  });

  it("lists only the authenticated applicant's records through account RLS", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [applicationRow()] });
    const release = vi.fn();
    const connection: TenantConnection = { query, release };
    const pool: TenantConnectionPool = {
      connect: vi.fn(async () => connection),
    };
    const repository = new PostgresOpportunityApplicationRepository(pool);

    await expect(
      repository.listMine(applicantAccountId),
    ).resolves.toMatchObject([{ id: applicationId, applicantAccountId }]);

    expect(query.mock.calls[1]?.[0]).toContain("app.account_id");
    expect(query.mock.calls[2]?.[0]).toContain("FROM opportunity_applications");
    expect(release).toHaveBeenCalledOnce();
  });
});
