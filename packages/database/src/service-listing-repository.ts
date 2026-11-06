import { normalizeTenantId } from "./tenant-context.js";
import {
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
  type TenantTransactionClient,
} from "./tenant-transaction.js";

export type ServiceDeliveryMode = "remote" | "onsite" | "hybrid";
export type ServicePricingModel = "fixed" | "hourly" | "starting_at" | "quote";
export type ServiceListingStatus =
  | "draft"
  | "published"
  | "paused"
  | "closed"
  | "archived";
export type ServiceListingAction = "create" | "edit" | "publish";

export interface ServiceListingAuthorizationInput {
  readonly actorAccountId: string;
  readonly organizationId: string;
  readonly role: ServiceMembershipRole;
  readonly membershipStatus: ServiceMembershipStatus;
  readonly action: ServiceListingAction;
  readonly isCreator: boolean;
  readonly currentStatus: ServiceListingStatus | null;
}

export type ServiceListingAuthorizer = (
  input: ServiceListingAuthorizationInput,
) => boolean;

export interface CreateServiceListingInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly category: string;
  readonly deliveryMode: ServiceDeliveryMode;
  readonly pricingModel: ServicePricingModel;
  readonly priceAmount?: number | null;
  readonly priceCurrency?: string | null;
  readonly locationLabel?: string | null;
  readonly expiresAt?: Date | null;
}

export interface PublishServiceListingInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly serviceListingId: string;
}

export interface ServiceListingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly createdByAccountId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly category: string;
  readonly status: ServiceListingStatus;
  readonly visibility: "public" | "organization";
  readonly deliveryMode: ServiceDeliveryMode;
  readonly pricingModel: ServicePricingModel;
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly locationLabel: string | null;
  readonly expiresAt: Date | null;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicServiceListingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly deliveryMode: ServiceDeliveryMode;
  readonly pricingModel: ServicePricingModel;
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly locationLabel: string | null;
  readonly publishedAt: Date;
  readonly expiresAt: Date | null;
}

export interface PublicServiceListingSearchInput {
  readonly query?: string;
  readonly category?: string;
  readonly deliveryMode?: ServiceDeliveryMode;
  readonly limit?: number;
  readonly offset?: number;
}

interface MembershipRow {
  readonly role: unknown;
  readonly status: unknown;
}

interface ServiceListingRow {
  readonly id: string;
  readonly organization_id: string;
  readonly created_by_account_id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly category: string;
  readonly status: ServiceListingStatus;
  readonly visibility: "public" | "organization";
  readonly delivery_mode: ServiceDeliveryMode;
  readonly pricing_model: ServicePricingModel;
  readonly price_amount: string | null;
  readonly price_currency: string | null;
  readonly location_label: string | null;
  readonly expires_at: Date | null;
  readonly published_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface PublicServiceListingRow {
  readonly id: string;
  readonly organization_id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly delivery_mode: ServiceDeliveryMode;
  readonly pricing_model: ServicePricingModel;
  readonly price_amount: string | null;
  readonly price_currency: string | null;
  readonly location_label: string | null;
  readonly published_at: Date;
  readonly expires_at: Date | null;
}

type ServiceMembershipRole = "owner" | "admin" | "member" | "viewer";
type ServiceMembershipStatus = "active" | "suspended" | "revoked";

export class ServiceListingAuthorizationError extends Error {
  constructor() {
    super("Service listing action is not permitted.");
    this.name = "ServiceListingAuthorizationError";
  }
}

export class ServiceListingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceListingInputError";
  }
}

export class ServiceListingTransitionError extends Error {
  constructor() {
    super("Service listing cannot transition from its current state.");
    this.name = "ServiceListingTransitionError";
  }
}

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function isRole(value: unknown): value is ServiceMembershipRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

function isMembershipStatus(value: unknown): value is ServiceMembershipStatus {
  return value === "active" || value === "suspended" || value === "revoked";
}

function isDeliveryMode(value: unknown): value is ServiceDeliveryMode {
  return value === "remote" || value === "onsite" || value === "hybrid";
}

function isPricingModel(value: unknown): value is ServicePricingModel {
  return (
    value === "fixed" ||
    value === "hourly" ||
    value === "starting_at" ||
    value === "quote"
  );
}

function mapServiceListing(row: ServiceListingRow): ServiceListingRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdByAccountId: row.created_by_account_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    deliveryMode: row.delivery_mode,
    pricingModel: row.pricing_model,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    locationLabel: row.location_label,
    expiresAt: row.expires_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPublicServiceListing(
  row: PublicServiceListingRow,
): PublicServiceListingRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    deliveryMode: row.delivery_mode,
    pricingModel: row.pricing_model,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    locationLabel: row.location_label,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  };
}

function validateInput(input: CreateServiceListingInput): void {
  if (
    input.slug.length < 3 ||
    input.slug.length > 64 ||
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(input.slug)
  ) {
    throw new ServiceListingInputError("A valid lowercase service slug is required.");
  }
  if (input.title.trim().length < 1 || input.title.trim().length > 160) {
    throw new ServiceListingInputError("Service title must be 1 to 160 characters.");
  }
  if (input.summary.trim().length < 1 || input.summary.trim().length > 320) {
    throw new ServiceListingInputError("Service summary must be 1 to 320 characters.");
  }
  if (
    input.description.trim().length < 1 ||
    input.description.trim().length > 10_000
  ) {
    throw new ServiceListingInputError("Service description must be 1 to 10000 characters.");
  }
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(input.category)) {
    throw new ServiceListingInputError("Service category must be a normalized slug.");
  }
  if (!isDeliveryMode(input.deliveryMode) || !isPricingModel(input.pricingModel)) {
    throw new ServiceListingInputError("Service delivery or pricing model is invalid.");
  }

  const amount = input.priceAmount ?? null;
  const currency = input.priceCurrency?.trim().toUpperCase() ?? null;
  if (
    (amount !== null && (!Number.isFinite(amount) || amount < 0)) ||
    (input.pricingModel === "quote" && (amount !== null || currency !== null)) ||
    (input.pricingModel !== "quote" &&
      (amount === null || !currency || !/^[A-Z]{3}$/.test(currency)))
  ) {
    throw new ServiceListingInputError("Service price and currency do not match the pricing model.");
  }
  if (
    input.locationLabel != null &&
    input.locationLabel.trim().length > 200
  ) {
    throw new ServiceListingInputError("Service location must be at most 200 characters.");
  }
  if (
    input.expiresAt != null &&
    (!Number.isFinite(input.expiresAt.getTime()) ||
      input.expiresAt.getTime() <= Date.now())
  ) {
    throw new ServiceListingInputError("Service expiry must be a future date.");
  }
}

async function lockOrganizationMemberships(
  client: TenantTransactionClient,
  organizationId: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    "organization-memberships:" + organizationId,
  ]);
}

export class PostgresServiceListingRepository {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly authorize: ServiceListingAuthorizer = () => false,
  ) {}

  async createDraft(
    input: CreateServiceListingInput,
  ): Promise<ServiceListingRecord> {
    validateInput(input);
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
        !isRole(actor.role) ||
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
        throw new ServiceListingAuthorizationError();
      }

      const row = firstRow<ServiceListingRow>(
        await client.query(
          `INSERT INTO service_listings (
             organization_id, created_by_account_id, slug, title, summary,
             description, category, delivery_mode, pricing_model, price_amount,
             price_currency, location_label, expires_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING *`,
          [
            organizationId,
            actorAccountId,
            input.slug,
            input.title.trim(),
            input.summary.trim(),
            input.description.trim(),
            input.category,
            input.deliveryMode,
            input.pricingModel,
            input.priceAmount ?? null,
            input.priceCurrency?.trim().toUpperCase() ?? null,
            input.locationLabel?.trim() || null,
            input.expiresAt ?? null,
          ],
        ),
      );
      if (!row) throw new Error("Service listing insert did not return a record.");

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'service_listing.created', 'service_listing', $3, $4::jsonb)",
        [
          organizationId,
          actorAccountId,
          row.id,
          JSON.stringify({
            slug: row.slug,
            category: row.category,
            deliveryMode: row.delivery_mode,
            pricingModel: row.pricing_model,
          }),
        ],
      );

      return mapServiceListing(row);
    });
  }

  async publish(
    input: PublishServiceListingInput,
  ): Promise<ServiceListingRecord | null> {
    const organizationId = normalizeTenantId(input.organizationId);
    const actorAccountId = normalizeTenantId(input.actorAccountId);
    const serviceListingId = normalizeTenantId(input.serviceListingId);

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
        !isRole(actor.role) ||
        !isMembershipStatus(actor.status)
      ) {
        throw new ServiceListingAuthorizationError();
      }

      const current = firstRow<ServiceListingRow>(
        await client.query(
          "SELECT * FROM service_listings WHERE organization_id = $1 AND id = $2 FOR UPDATE",
          [organizationId, serviceListingId],
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
        throw new ServiceListingAuthorizationError();
      }
      if (
        current.expires_at &&
        current.expires_at.getTime() <= Date.now()
      ) {
        throw new ServiceListingTransitionError();
      }

      const published = firstRow<ServiceListingRow>(
        await client.query(
          "UPDATE service_listings SET status = 'published', " +
            "published_at = clock_timestamp(), updated_at = clock_timestamp() " +
            "WHERE organization_id = $1 AND id = $2 " +
            "AND status IN ('draft', 'paused') " +
            "AND (expires_at IS NULL OR expires_at > clock_timestamp()) " +
            "RETURNING *",
          [organizationId, serviceListingId],
        ),
      );
      if (!published) throw new ServiceListingTransitionError();

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'service_listing.published', 'service_listing', $3, $4::jsonb)",
        [
          organizationId,
          actorAccountId,
          serviceListingId,
          JSON.stringify({ from: current.status, to: "published" }),
        ],
      );

      return mapServiceListing(published);
    });
  }

  async listPublic(
    input: PublicServiceListingSearchInput = {},
  ): Promise<readonly PublicServiceListingRecord[]> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;
    const query = input.query?.trim() || null;
    const category = input.category?.trim() || null;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10_000 ||
      (query !== null && query.length > 200) ||
      (category !== null && !/^[a-z][a-z0-9-]{1,62}$/.test(category)) ||
      (input.deliveryMode !== undefined && !isDeliveryMode(input.deliveryMode))
    ) {
      throw new ServiceListingInputError("Public service search parameters are invalid.");
    }

    const connection = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      const result = await connection.query(
        `SELECT
           id, organization_id, slug, title, summary, category,
           delivery_mode, pricing_model, price_amount, price_currency,
           location_label, published_at, expires_at
         FROM public_service_listings
         WHERE ($1::text IS NULL OR category = $1)
           AND ($2::text IS NULL OR delivery_mode = $2)
           AND ($3::text IS NULL OR search_document @@ plainto_tsquery('simple', $3))
           AND (expires_at IS NULL OR expires_at > clock_timestamp())
         ORDER BY published_at DESC, id
         LIMIT $4 OFFSET $5`,
        [category, input.deliveryMode ?? null, query, limit, offset],
      );
      return (result.rows as readonly PublicServiceListingRow[]).map(
        mapPublicServiceListing,
      );
    } catch (error) {
      releaseError =
        error instanceof Error
          ? error
          : new Error("Public service listing query failed.");
      throw error;
    } finally {
      connection.release(releaseError);
    }
  }
}
