import { normalizeTenantId } from "./tenant-context.js";
import {
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
  type TenantTransactionClient,
} from "./tenant-transaction.js";

export type OpportunityApplicationStatus =
  | "submitted"
  | "withdrawn"
  | "shortlisted"
  | "rejected"
  | "accepted";
export type OpportunityApplicationReviewDecision =
  | "shortlisted"
  | "rejected"
  | "accepted";

export interface SubmitOpportunityApplicationInput {
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly applicantAccountId: string;
  readonly coverNote?: string | null;
}

export interface WithdrawOpportunityApplicationInput {
  readonly organizationId: string;
  readonly applicationId: string;
  readonly applicantAccountId: string;
}

export interface ReviewOpportunityApplicationInput {
  readonly organizationId: string;
  readonly applicationId: string;
  readonly reviewerAccountId: string;
  readonly decision: OpportunityApplicationReviewDecision;
}

export interface OpportunityApplicationAuthorizationInput {
  readonly reviewerAccountId: string;
  readonly organizationId: string;
  readonly role: ApplicationMembershipRole;
  readonly membershipStatus: ApplicationMembershipStatus;
  readonly currentStatus: OpportunityApplicationStatus;
  readonly decision: OpportunityApplicationReviewDecision;
}

export type OpportunityApplicationAuthorizer = (
  input: OpportunityApplicationAuthorizationInput,
) => boolean;

export interface OpportunityApplicationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly applicantAccountId: string;
  readonly opportunitySlug: string;
  readonly opportunityTitle: string;
  readonly opportunityType: string;
  readonly coverNote: string | null;
  readonly status: OpportunityApplicationStatus;
  readonly submittedAt: Date;
  readonly updatedAt: Date;
  readonly reviewedAt: Date | null;
  readonly reviewedByAccountId: string | null;
  readonly withdrawnAt: Date | null;
}

interface ApplicationRow {
  readonly id: string;
  readonly organization_id: string;
  readonly opportunity_id: string;
  readonly applicant_account_id: string;
  readonly opportunity_slug_snapshot: string;
  readonly opportunity_title_snapshot: string;
  readonly opportunity_type_snapshot: string;
  readonly cover_note: string | null;
  readonly status: OpportunityApplicationStatus;
  readonly submitted_at: Date;
  readonly updated_at: Date;
  readonly reviewed_at: Date | null;
  readonly reviewed_by_account_id: string | null;
  readonly withdrawn_at: Date | null;
}

interface OpportunityApplicationTargetRow {
  readonly slug: string;
  readonly title: string;
  readonly opportunity_type: string;
}

interface MembershipRow {
  readonly role: unknown;
  readonly status: unknown;
}

type ApplicationMembershipRole = "owner" | "admin" | "member" | "viewer";
type ApplicationMembershipStatus = "active" | "suspended" | "revoked";

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function isMembershipRole(value: unknown): value is ApplicationMembershipRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

function isMembershipStatus(
  value: unknown,
): value is ApplicationMembershipStatus {
  return value === "active" || value === "suspended" || value === "revoked";
}

function mapApplication(row: ApplicationRow): OpportunityApplicationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    opportunityId: row.opportunity_id,
    applicantAccountId: row.applicant_account_id,
    opportunitySlug: row.opportunity_slug_snapshot,
    opportunityTitle: row.opportunity_title_snapshot,
    opportunityType: row.opportunity_type_snapshot,
    coverNote: row.cover_note,
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedByAccountId: row.reviewed_by_account_id,
    withdrawnAt: row.withdrawn_at,
  };
}

export class OpportunityApplicationAuthorizationError extends Error {
  constructor() {
    super("Opportunity application action is not permitted.");
    this.name = "OpportunityApplicationAuthorizationError";
  }
}

export class OpportunityApplicationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityApplicationInputError";
  }
}

export class OpportunityApplicationConflictError extends Error {
  constructor() {
    super("An application already exists or the requested transition is unavailable.");
    this.name = "OpportunityApplicationConflictError";
  }
}

async function setApplicantContext(
  client: TenantTransactionClient,
  accountId: string,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.account_id', $1, true), " +
      "set_config('app.actor_type', 'applicant', true)",
    [accountId],
  );
}

async function setOrganizationContext(
  client: TenantTransactionClient,
  accountId: string,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.account_id', $1, true), " +
      "set_config('app.actor_type', 'organization', true)",
    [accountId],
  );
}

async function withApplicantReadTransaction<T>(
  pool: TenantConnectionPool,
  applicantAccountId: string,
  work: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  const normalizedAccountId = normalizeTenantId(applicantAccountId);
  const client = await pool.connect();
  let transactionStarted = false;
  let releaseError: Error | undefined;

  try {
    try {
      await client.query("BEGIN");
      transactionStarted = true;
    } catch (error) {
      releaseError =
        error instanceof Error
          ? error
          : new Error("Failed to establish applicant read transaction.");
      throw error;
    }

    await setApplicantContext(client, normalizedAccountId);
    const result = await work(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Failed to roll back applicant read transaction.");
      }
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

export class PostgresOpportunityApplicationRepository {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly authorizeReview: OpportunityApplicationAuthorizer = () =>
      false,
  ) {}

  async submit(
    input: SubmitOpportunityApplicationInput,
  ): Promise<OpportunityApplicationRecord> {
    const organizationId = normalizeTenantId(input.organizationId);
    const opportunityId = normalizeTenantId(input.opportunityId);
    const applicantAccountId = normalizeTenantId(input.applicantAccountId);
    const coverNote = input.coverNote?.trim() || null;
    if (coverNote !== null && coverNote.length > 5_000) {
      throw new OpportunityApplicationInputError(
        "Application cover note must be at most 5000 characters.",
      );
    }

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      await setApplicantContext(client, applicantAccountId);
      const opportunity = firstRow<OpportunityApplicationTargetRow>(
        await client.query(
          "SELECT slug, title, opportunity_type FROM opportunities " +
            "WHERE organization_id = $1 AND id = $2 " +
            "AND status = 'published' AND visibility = 'public' " +
            "AND (expires_at IS NULL OR expires_at > clock_timestamp()) " +
            "FOR SHARE",
          [organizationId, opportunityId],
        ),
      );
      if (!opportunity) {
        throw new OpportunityApplicationConflictError();
      }

      const application = firstRow<ApplicationRow>(
        await client.query(
          `INSERT INTO opportunity_applications (
             organization_id, opportunity_id, applicant_account_id,
             opportunity_slug_snapshot, opportunity_title_snapshot,
             opportunity_type_snapshot, cover_note
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (opportunity_id, applicant_account_id) DO NOTHING
           RETURNING *`,
          [
            organizationId,
            opportunityId,
            applicantAccountId,
            opportunity.slug,
            opportunity.title,
            opportunity.opportunity_type,
            coverNote,
          ],
        ),
      );
      if (!application) throw new OpportunityApplicationConflictError();

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'opportunity.application.submitted', " +
          "'opportunity_application', $3, $4::jsonb)",
        [
          organizationId,
          applicantAccountId,
          application.id,
          JSON.stringify({ opportunityId, opportunitySlug: opportunity.slug }),
        ],
      );

      return mapApplication(application);
    });
  }

  async withdraw(
    input: WithdrawOpportunityApplicationInput,
  ): Promise<OpportunityApplicationRecord | null> {
    const organizationId = normalizeTenantId(input.organizationId);
    const applicationId = normalizeTenantId(input.applicationId);
    const applicantAccountId = normalizeTenantId(input.applicantAccountId);

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      await setApplicantContext(client, applicantAccountId);
      const withdrawn = firstRow<ApplicationRow>(
        await client.query(
          "UPDATE opportunity_applications " +
            "SET status = 'withdrawn', withdrawn_at = clock_timestamp(), " +
            "updated_at = clock_timestamp() " +
            "WHERE organization_id = $1 AND id = $2 " +
            "AND applicant_account_id = $3 AND status = 'submitted' " +
            "RETURNING *",
          [organizationId, applicationId, applicantAccountId],
        ),
      );
      if (!withdrawn) return null;

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'opportunity.application.withdrawn', " +
          "'opportunity_application', $3, '{}'::jsonb)",
        [organizationId, applicantAccountId, applicationId],
      );

      return mapApplication(withdrawn);
    });
  }

  async review(
    input: ReviewOpportunityApplicationInput,
  ): Promise<OpportunityApplicationRecord | null> {
    const organizationId = normalizeTenantId(input.organizationId);
    const applicationId = normalizeTenantId(input.applicationId);
    const reviewerAccountId = normalizeTenantId(input.reviewerAccountId);

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      await setOrganizationContext(client, reviewerAccountId);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        "organization-memberships:" + organizationId,
      ]);

      const membership = firstRow<MembershipRow>(
        await client.query(
          "SELECT role, status FROM organization_memberships " +
            "WHERE organization_id = $1 AND account_id = $2 FOR UPDATE",
          [organizationId, reviewerAccountId],
        ),
      );
      if (
        !membership ||
        !isMembershipRole(membership.role) ||
        !isMembershipStatus(membership.status)
      ) {
        throw new OpportunityApplicationAuthorizationError();
      }

      const current = firstRow<ApplicationRow>(
        await client.query(
          "SELECT * FROM opportunity_applications " +
            "WHERE organization_id = $1 AND id = $2 FOR UPDATE",
          [organizationId, applicationId],
        ),
      );
      if (!current) return null;

      if (
        !this.authorizeReview({
          reviewerAccountId,
          organizationId,
          role: membership.role,
          membershipStatus: membership.status,
          currentStatus: current.status,
          decision: input.decision,
        })
      ) {
        throw new OpportunityApplicationAuthorizationError();
      }

      const reviewed = firstRow<ApplicationRow>(
        await client.query(
          "UPDATE opportunity_applications " +
            "SET status = $3, reviewed_at = clock_timestamp(), " +
            "reviewed_by_account_id = $4, updated_at = clock_timestamp() " +
            "WHERE organization_id = $1 AND id = $2 " +
            "AND status IN ('submitted', 'shortlisted') RETURNING *",
          [organizationId, applicationId, input.decision, reviewerAccountId],
        ),
      );
      if (!reviewed) throw new OpportunityApplicationConflictError();

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, $3, 'opportunity_application', $4, $5::jsonb)",
        [
          organizationId,
          reviewerAccountId,
          "opportunity.application." + input.decision,
          applicationId,
          JSON.stringify({ from: current.status, to: input.decision }),
        ],
      );

      return mapApplication(reviewed);
    });
  }

  async listMine(
    applicantAccountId: string,
    limit = 20,
    offset = 0,
  ): Promise<readonly OpportunityApplicationRecord[]> {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10_000
    ) {
      throw new OpportunityApplicationInputError(
        "Application pagination parameters are invalid.",
      );
    }

    return withApplicantReadTransaction(
      this.pool,
      applicantAccountId,
      async (client) => {
        const result = await client.query(
          "SELECT * FROM opportunity_applications " +
            "ORDER BY submitted_at DESC, id LIMIT $1 OFFSET $2",
          [limit, offset],
        );
        return (result.rows as readonly ApplicationRow[]).map(mapApplication);
      },
    );
  }
}
