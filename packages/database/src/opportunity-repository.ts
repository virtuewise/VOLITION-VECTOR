import { normalizeTenantId } from "./tenant-context.js";
import {
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
  type TenantTransactionClient,
} from "./tenant-transaction.js";

export type OpportunityType =
  | "employment"
  | "project"
  | "tender"
  | "partnership"
  | "volunteering";
export type OpportunityStatus =
  | "draft"
  | "published"
  | "paused"
  | "closed"
  | "archived";
export type OpportunityVisibility = "public" | "organization";
export type OpportunityAction = "create" | "publish";

export interface OpportunityAuthorizationInput {
  readonly actorAccountId: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
  readonly membershipStatus: MembershipStatus;
  readonly action: OpportunityAction;
  readonly isCreator: boolean;
  readonly currentStatus: OpportunityStatus | null;
}

export type OpportunityAuthorizer = (
  input: OpportunityAuthorizationInput,
) => boolean;

export interface CreateOpportunityInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly opportunityType: OpportunityType;
  readonly visibility?: OpportunityVisibility;
  readonly locationLabel?: string | null;
  readonly isRemote?: boolean;
  readonly compensationMin?: number | null;
  readonly compensationMax?: number | null;
  readonly compensationCurrency?: string | null;
  readonly startsAt?: Date | null;
  readonly expiresAt?: Date | null;
}

export interface PublishOpportunityInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly opportunityId: string;
}

export interface OpportunityRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly createdByAccountId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly opportunityType: OpportunityType;
  readonly status: OpportunityStatus;
  readonly visibility: OpportunityVisibility;
  readonly locationLabel: string | null;
  readonly isRemote: boolean;
  readonly compensationMin: string | null;
  readonly compensationMax: string | null;
  readonly compensationCurrency: string | null;
  readonly startsAt: Date | null;
  readonly expiresAt: Date | null;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicOpportunityRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly opportunityType: OpportunityType;
  readonly locationLabel: string | null;
  readonly isRemote: boolean;
  readonly compensationMin: string | null;
  readonly compensationMax: string | null;
  readonly compensationCurrency: string | null;
  readonly publishedAt: Date;
  readonly expiresAt: Date | null;
}

interface PublicOpportunityRow {
  readonly id: string;
  readonly organization_id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly opportunity_type: OpportunityType;
  readonly location_label: string | null;
  readonly is_remote: boolean;
  readonly compensation_min: string | null;
  readonly compensation_max: string | null;
  readonly compensation_currency: string | null;
  readonly published_at: Date;
  readonly expires_at: Date | null;
}

function mapPublicOpportunity(row: PublicOpportunityRow): PublicOpportunityRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    opportunityType: row.opportunity_type,
    locationLabel: row.location_label,
    isRemote: row.is_remote,
    compensationMin: row.compensation_min,
    compensationMax: row.compensation_max,
    compensationCurrency: row.compensation_currency,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  };
}

export interface PublicOpportunitySearchInput {
  readonly query?: string;
  readonly opportunityType?: OpportunityType;
  readonly limit?: number;
  readonly offset?: number;
}

export class OpportunityAuthorizationError extends Error {
  constructor() {
    super("Opportunity action is not permitted.");
    this.name = "OpportunityAuthorizationError";
  }
}

export class OpportunityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityInputError";
  }
}

export class OpportunityTransitionError extends Error {
  constructor() {
    super("Opportunity cannot be published in its current state.");
    this.name = "OpportunityTransitionError";
  }
}

interface MembershipRow {
  readonly role: unknown;
  readonly status: unknown;
}

interface OpportunityRow {
  readonly id: string;
  readonly organization_id: string;
  readonly created_by_account_id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly opportunity_type: OpportunityType;
  readonly status: OpportunityStatus;
  readonly visibility: OpportunityVisibility;
  readonly location_label: string | null;
  readonly is_remote: boolean;
  readonly compensation_min: string | null;
  readonly compensation_max: string | null;
  readonly compensation_currency: string | null;
  readonly starts_at: Date | null;
  readonly expires_at: Date | null;
  readonly published_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

type MembershipRole = "owner" | "admin" | "member" | "viewer";
type MembershipStatus = "active" | "suspended" | "revoked";

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function isMembershipRole(value: unknown): value is MembershipRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

function isMembershipStatus(value: unknown): value is MembershipStatus {
  return value === "active" || value === "suspended" || value === "revoked";
}

function isOpportunityType(value: unknown): value is OpportunityType {
  return (
    value === "employment" ||
    value === "project" ||
    value === "tender" ||
    value === "partnership" ||
    value === "volunteering"
  );
}

function isVisibility(value: unknown): value is OpportunityVisibility {
  return value === "public" || value === "organization";
}

function isValidDate(value: Date | null | undefined): boolean {
  return value == null || Number.isFinite(value.getTime());
}

function validateCreateInput(input: CreateOpportunityInput): void {
  if (
    input.slug.length < 3 ||
    input.slug.length > 64 ||
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(input.slug)
  ) {
    throw new OpportunityInputError("A valid lowercase opportunity slug is required.");
  }
  if (input.title.trim().length < 1 || input.title.trim().length > 160) {
    throw new OpportunityInputError("Opportunity title must be 1 to 160 characters.");
  }
  if (input.summary.trim().length < 1 || input.summary.trim().length > 320) {
    throw new OpportunityInputError("Opportunity summary must be 1 to 320 characters.");
  }
  if (
    input.description.trim().length < 1 ||
    input.description.trim().length > 10_000
  ) {
    throw new OpportunityInputError("Opportunity description must be 1 to 10000 characters.");
  }
  if (!isOpportunityType(input.opportunityType)) {
    throw new OpportunityInputError("Opportunity type is invalid.");
  }
  if (!isVisibility(input.visibility ?? "public")) {
    throw new OpportunityInputError("Opportunity visibility is invalid.");
  }
  if (
    input.locationLabel != null &&
    input.locationLabel.trim().length > 200
  ) {
    throw new OpportunityInputError("Opportunity location must be at most 200 characters.");
  }
  if (input.isRemote != null && typeof input.isRemote !== "boolean") {
    throw new OpportunityInputError("Opportunity remote flag must be boolean.");
  }

  const minimum = input.compensationMin ?? null;
  const maximum = input.compensationMax ?? null;
  const currency = input.compensationCurrency?.trim().toUpperCase() ?? null;
  if (
    (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) ||
    (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) ||
    (minimum !== null && maximum !== null && maximum < minimum)
  ) {
    throw new OpportunityInputError("Opportunity compensation range is invalid.");
  }
  if (
    ((minimum !== null || maximum !== null) &&
      (!currency || !/^[A-Z]{3}$/.test(currency))) ||
    (minimum === null && maximum === null && currency !== null)
  ) {
    throw new OpportunityInputError("A three-letter currency is required with compensation.");
  }
  if (!isValidDate(input.startsAt) || !isValidDate(input.expiresAt)) {
    throw new OpportunityInputError("Opportunity dates must be valid.");
  }
  if (
    input.startsAt &&
    input.expiresAt &&
    input.expiresAt.getTime() <= input.startsAt.getTime()
  ) {
    throw new OpportunityInputError("Opportunity expiry must follow its start date.");
  }
}

function mapOpportunity(row: OpportunityRow): OpportunityRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdByAccountId: row.created_by_account_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    opportunityType: row.opportunity_type,
    status: row.status,
    visibility: row.visibility,
    locationLabel: row.location_label,
    isRemote: row.is_remote,
    compensationMin: row.compensation_min,
    compensationMax: row.compensation_max,
    compensationCurrency: row.compensation_currency,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function lockOrganizationMemberships(
  client: TenantTransactionClient,
  organizationId: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    ["organization-memberships:" + organizationId],
  );
}

export class PostgresOpportunityRepository {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly authorize: OpportunityAuthorizer = () => false,
  ) {}

  async createDraft(input: CreateOpportunityInput): Promise<OpportunityRecord> {
    validateCreateInput(input);
    const organizationId = normalizeTenantId(input.organizationId);
    const actorAccountId = normalizeTenantId(input.actorAccountId);

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      await lockOrganizationMemberships(client, organizationId);
      const actor = firstRow<MembershipRow>(
        await client.query(
          "SELECT role, status FROM organization_memberships " +
            "WHERE organization_id = $1 AND account_id = $2 FOR UPDATE",
          [organizationId, actorAccountId],
        ),
      );

      if (
        !actor ||
        !isMembershipRole(actor.role) ||
        !isMembershipStatus(actor.status) ||
        !this.authorize({
          actorAccountId,
          organizationId,
          role: actor.role,
          membershipStatus: actor.status,
          action: "create",
          isCreator: true,
          currentStatus: null,
        })
      ) {
        throw new OpportunityAuthorizationError();
      }

      const row = firstRow<OpportunityRow>(
        await client.query(
          `INSERT INTO opportunities (
             organization_id,
             created_by_account_id,
             slug,
             title,
             summary,
             description,
             opportunity_type,
             visibility,
             location_label,
             is_remote,
             compensation_min,
             compensation_max,
             compensation_currency,
             starts_at,
             expires_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING *`,
          [
            organizationId,
            actorAccountId,
            input.slug,
            input.title.trim(),
            input.summary.trim(),
            input.description.trim(),
            input.opportunityType,
            input.visibility ?? "public",
            input.locationLabel?.trim() || null,
            input.isRemote ?? false,
            input.compensationMin ?? null,
            input.compensationMax ?? null,
            input.compensationCurrency?.trim().toUpperCase() ?? null,
            input.startsAt ?? null,
            input.expiresAt ?? null,
          ],
        ),
      );
      if (!row) {
        throw new Error("Opportunity insert did not return a record.");
      }

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'opportunity.created', 'opportunity', $3, $4::jsonb)",
        [
          organizationId,
          actorAccountId,
          row.id,
          JSON.stringify({
            slug: row.slug,
            opportunityType: row.opportunity_type,
            visibility: row.visibility,
          }),
        ],
      );

      return mapOpportunity(row);
    });
  }

  async publish(input: PublishOpportunityInput): Promise<OpportunityRecord | null> {
    const organizationId = normalizeTenantId(input.organizationId);
    const actorAccountId = normalizeTenantId(input.actorAccountId);
    const opportunityId = normalizeTenantId(input.opportunityId);

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      await lockOrganizationMemberships(client, organizationId);
      const actor = firstRow<MembershipRow>(
        await client.query(
          "SELECT role, status FROM organization_memberships " +
            "WHERE organization_id = $1 AND account_id = $2 FOR UPDATE",
          [organizationId, actorAccountId],
        ),
      );
      if (
        !actor ||
        !isMembershipRole(actor.role) ||
        !isMembershipStatus(actor.status)
      ) {
        throw new OpportunityAuthorizationError();
      }

      const current = firstRow<OpportunityRow>(
        await client.query(
          "SELECT * FROM opportunities WHERE organization_id = $1 AND id = $2 FOR UPDATE",
          [organizationId, opportunityId],
        ),
      );
      if (!current) return null;

      if (
        !this.authorize({
          actorAccountId,
          organizationId,
          role: actor.role,
          membershipStatus: actor.status,
          action: "publish",
          isCreator: current.created_by_account_id === actorAccountId,
          currentStatus: current.status,
        })
      ) {
        throw new OpportunityAuthorizationError();
      }
      if (current.expires_at && current.expires_at.getTime() <= Date.now()) {
        throw new OpportunityTransitionError();
      }

      const published = firstRow<OpportunityRow>(
        await client.query(
          "UPDATE opportunities SET status = 'published', " +
            "published_at = clock_timestamp(), updated_at = clock_timestamp() " +
            "WHERE organization_id = $1 AND id = $2 " +
            "AND status IN ('draft', 'paused') " +
            "AND (expires_at IS NULL OR expires_at > clock_timestamp()) " +
            "RETURNING *",
          [organizationId, opportunityId],
        ),
      );
      if (!published) throw new OpportunityTransitionError();

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'opportunity.published', 'opportunity', $3, '{}'::jsonb)",
        [organizationId, actorAccountId, opportunityId],
      );

      return mapOpportunity(published);
    });
  }

  async listPublic(
    input: PublicOpportunitySearchInput = {},
  ): Promise<readonly PublicOpportunityRecord[]> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;
    const query = input.query?.trim() || null;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      (query !== null && query.length > 200) ||
      (input.opportunityType !== undefined &&
        !isOpportunityType(input.opportunityType))
    ) {
      throw new OpportunityInputError("Public opportunity search parameters are invalid.");
    }

    const connection = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      const result = await connection.query(
        `SELECT
           id,
           organization_id,
           slug,
           title,
           summary,
           opportunity_type,
           location_label,
           is_remote,
           compensation_min,
           compensation_max,
           compensation_currency,
           published_at,
           expires_at
         FROM public_opportunities
         WHERE ($1::text IS NULL OR opportunity_type = $1)
           AND ($2::text IS NULL OR search_document @@ plainto_tsquery('simple', $2))
           AND (expires_at IS NULL OR expires_at > clock_timestamp())
         ORDER BY published_at DESC, id
         LIMIT $3 OFFSET $4`,
        [input.opportunityType ?? null, query, limit, offset],
      );
      return (result.rows as readonly PublicOpportunityRow[]).map(
        mapPublicOpportunity,
      );
    } catch (error) {
      releaseError =
        error instanceof Error
          ? error
          : new Error("Public opportunity query failed.");
      throw error;
    } finally {
      connection.release(releaseError);
    }
  }
}
