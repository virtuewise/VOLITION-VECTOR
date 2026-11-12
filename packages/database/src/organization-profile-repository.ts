import { normalizeTenantId } from "./tenant-context.js";
import {
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
  type TenantTransactionClient,
} from "./tenant-transaction.js";

export type OrganizationProfileRole = "owner" | "admin" | "member" | "viewer";
export type OrganizationProfilePermission = "organization:read" | "organization:update";

export interface OrganizationProfileAuthorizationInput {
  readonly actorAccountId: string;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly accountStatus: string;
  readonly organizationStatus: string;
  readonly membershipStatus: string;
  readonly role: OrganizationProfileRole;
  readonly permission: OrganizationProfilePermission;
}

export type OrganizationProfileAuthorizer = (
  input: OrganizationProfileAuthorizationInput,
) => boolean;

export interface OrganizationProfileRecord {
  readonly organizationId: string;
  readonly description: string | null;
  readonly websiteUrl: string | null;
  readonly countryCode: string | null;
  readonly locale: string;
  readonly timeZone: string;
  readonly updatedAt: Date | null;
}

export interface OrganizationProfileInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
}

export interface UpdateOrganizationProfileInput extends OrganizationProfileInput {
  readonly description?: string | null;
  readonly websiteUrl?: string | null;
  readonly countryCode?: string | null;
  readonly locale?: string;
  readonly timeZone?: string;
}

interface AccessRow {
  readonly organization_id: string;
  readonly account_status: string;
  readonly organization_status: string;
  readonly membership_status: string;
  readonly role: OrganizationProfileRole;
}

interface ProfileRow {
  readonly organization_id: string;
  readonly description: string | null;
  readonly website_url: string | null;
  readonly country_code: string | null;
  readonly locale: string;
  readonly time_zone: string;
  readonly updated_at: Date | string;
}

const ACCOUNT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeAccountId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!ACCOUNT_UUID_PATTERN.test(normalized)) {
    throw new TypeError("A valid account UUID is required.");
  }
  return normalized;
}

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function toRecord(row: ProfileRow): OrganizationProfileRecord {
  const updatedAt =
    row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error("Organization profile returned an invalid update timestamp.");
  }
  return {
    organizationId: row.organization_id,
    description: row.description,
    websiteUrl: row.website_url,
    countryCode: row.country_code,
    locale: row.locale,
    timeZone: row.time_zone,
    updatedAt,
  };
}

function defaultRecord(organizationId: string): OrganizationProfileRecord {
  return {
    organizationId,
    description: null,
    websiteUrl: null,
    countryCode: null,
    locale: "en",
    timeZone: "UTC",
    updatedAt: null,
  };
}

function normalizeDescription(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
  ) {
    throw new TypeError("Description must contain 1 to 2000 printable characters.");
  }
  return normalized;
}

function normalizeWebsiteUrl(value: string | null): string | null {
  if (value === null) return null;
  if (value.trim() !== value || value.length > 2048) {
    throw new TypeError("Website URL must be a valid HTTPS URL.");
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error("Unsafe website URL.");
    }
    return url.toString();
  } catch {
    throw new TypeError("Website URL must be a valid HTTPS URL.");
  }
}

function normalizeCountryCode(value: string | null): string | null {
  if (value === null) return null;
  if (!/^[A-Za-z]{2}$/.test(value)) {
    throw new TypeError("Country code must be a two-letter ISO-style code.");
  }
  return value.toUpperCase();
}

function normalizeLocale(value: string): string {
  if (
    value.trim() !== value ||
    value.length > 35 ||
    !/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(value)
  ) {
    throw new TypeError("A valid BCP 47 locale is required.");
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    if (!canonical) throw new Error("Locale is empty.");
    return canonical;
  } catch {
    throw new TypeError("A valid BCP 47 locale is required.");
  }
}

function normalizeTimeZone(value: string): string {
  if (value.trim() !== value || value.length < 1 || value.length > 64) {
    throw new TypeError("A valid IANA time zone is required.");
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    throw new TypeError("A valid IANA time zone is required.");
  }
}

/**
 * Tenant-scoped private organization profile persistence.
 *
 * Membership, account and organization state are loaded and locked inside
 * the same RLS-scoped transaction as the read or update. The authorizer must
 * be the shared deny-by-default organization permission policy.
 */
export class PostgresOrganizationProfileRepository {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly authorize: OrganizationProfileAuthorizer,
  ) {}

  async getForOrganization(
    input: OrganizationProfileInput,
  ): Promise<OrganizationProfileRecord | null> {
    const organizationId = normalizeTenantId(input.organizationId);
    const actorAccountId = normalizeAccountId(input.actorAccountId);

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      const access = await this.loadAccess(client, organizationId, actorAccountId);
      if (
        !access ||
        !this.isAllowed(access, actorAccountId, "organization:read")
      ) {
        return null;
      }

      const row = firstRow<ProfileRow>(
        await client.query(
          "SELECT organization_id::text AS organization_id, description, " +
            "website_url, country_code, locale, time_zone, updated_at " +
            "FROM organization_profiles WHERE organization_id = $1",
          [organizationId],
        ),
      );
      return row ? toRecord(row) : defaultRecord(organizationId);
    });
  }

  async updateForOrganization(
    input: UpdateOrganizationProfileInput,
  ): Promise<OrganizationProfileRecord | null> {
    const organizationId = normalizeTenantId(input.organizationId);
    const actorAccountId = normalizeAccountId(input.actorAccountId);
    if (
      input.description === undefined &&
      input.websiteUrl === undefined &&
      input.countryCode === undefined &&
      input.locale === undefined &&
      input.timeZone === undefined
    ) {
      throw new TypeError("At least one organization profile field is required.");
    }

    const description =
      input.description === undefined
        ? undefined
        : normalizeDescription(input.description);
    const websiteUrl =
      input.websiteUrl === undefined
        ? undefined
        : normalizeWebsiteUrl(input.websiteUrl);
    const countryCode =
      input.countryCode === undefined
        ? undefined
        : normalizeCountryCode(input.countryCode);
    const locale =
      input.locale === undefined ? undefined : normalizeLocale(input.locale);
    const timeZone =
      input.timeZone === undefined
        ? undefined
        : normalizeTimeZone(input.timeZone);

    return withTenantTransaction(this.pool, organizationId, async (client) => {
      const access = await this.loadAccess(client, organizationId, actorAccountId);
      if (
        !access ||
        !this.isAllowed(access, actorAccountId, "organization:update")
      ) {
        return null;
      }

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["organization-profile:" + organizationId],
      );

      const currentRow = firstRow<ProfileRow>(
        await client.query(
          "SELECT organization_id::text AS organization_id, description, " +
            "website_url, country_code, locale, time_zone, updated_at " +
            "FROM organization_profiles WHERE organization_id = $1 FOR UPDATE",
          [organizationId],
        ),
      );
      const current = currentRow ? toRecord(currentRow) : null;
      const nextDescription =
        description === undefined ? (current?.description ?? null) : description;
      const nextWebsiteUrl =
        websiteUrl === undefined ? (current?.websiteUrl ?? null) : websiteUrl;
      const nextCountryCode =
        countryCode === undefined ? (current?.countryCode ?? null) : countryCode;
      const nextLocale = locale ?? current?.locale ?? "en";
      const nextTimeZone = timeZone ?? current?.timeZone ?? "UTC";

      const changedFields = current
        ? [
            ...(current.description === nextDescription ? [] : ["description"]),
            ...(current.websiteUrl === nextWebsiteUrl ? [] : ["websiteUrl"]),
            ...(current.countryCode === nextCountryCode ? [] : ["countryCode"]),
            ...(current.locale === nextLocale ? [] : ["locale"]),
            ...(current.timeZone === nextTimeZone ? [] : ["timeZone"]),
          ]
        : [
            ...(description === undefined ? [] : ["description"]),
            ...(websiteUrl === undefined ? [] : ["websiteUrl"]),
            ...(countryCode === undefined ? [] : ["countryCode"]),
            ...(locale === undefined ? [] : ["locale"]),
            ...(timeZone === undefined ? [] : ["timeZone"]),
          ];

      if (current && changedFields.length === 0) return current;

      const savedRow = firstRow<ProfileRow>(
        await client.query(
          "INSERT INTO organization_profiles " +
            "(organization_id, description, website_url, country_code, locale, time_zone) " +
            "VALUES ($1, $2, $3, $4, $5, $6) " +
            "ON CONFLICT (organization_id) DO UPDATE SET " +
            "description = EXCLUDED.description, " +
            "website_url = EXCLUDED.website_url, " +
            "country_code = EXCLUDED.country_code, " +
            "locale = EXCLUDED.locale, " +
            "time_zone = EXCLUDED.time_zone, " +
            "updated_at = clock_timestamp() " +
            "RETURNING organization_id::text AS organization_id, description, " +
            "website_url, country_code, locale, time_zone, updated_at",
          [
            organizationId,
            nextDescription,
            nextWebsiteUrl,
            nextCountryCode,
            nextLocale,
            nextTimeZone,
          ],
        ),
      );
      if (!savedRow) {
        throw new Error("Organization profile write did not return a record.");
      }

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, $3, 'organization_profile', $1::text, $4::jsonb)",
        [
          organizationId,
          actorAccountId,
          current ? "organization.profile.updated" : "organization.profile.created",
          JSON.stringify({ changedFields }),
        ],
      );

      return toRecord(savedRow);
    });
  }

  private async loadAccess(
    client: TenantTransactionClient,
    organizationId: string,
    actorAccountId: string,
  ): Promise<AccessRow | null> {
    const row = firstRow<AccessRow>(
      await client.query(
        "SELECT organization.id::text AS organization_id, " +
          "organization.status AS organization_status, " +
          "membership.status AS membership_status, membership.role, " +
          "account.status AS account_status " +
          "FROM organizations AS organization " +
          "JOIN organization_memberships AS membership " +
          "ON membership.organization_id = organization.id " +
          "AND membership.account_id = $2 " +
          "JOIN accounts AS account ON account.id = membership.account_id " +
          "WHERE organization.id = $1 " +
          "FOR SHARE OF organization, membership, account",
        [organizationId, actorAccountId],
      ),
    );
    return row ?? null;
  }

  private isAllowed(
    access: AccessRow,
    actorAccountId: string,
    permission: OrganizationProfilePermission,
  ): boolean {
    if (
      access.account_status !== "active" ||
      access.organization_status !== "active" ||
      access.membership_status !== "active" ||
      (access.role !== "owner" &&
        access.role !== "admin" &&
        access.role !== "member" &&
        access.role !== "viewer")
    ) {
      return false;
    }

    return this.authorize({
      actorAccountId,
      organizationId: access.organization_id,
      resourceOrganizationId: access.organization_id,
      accountStatus: access.account_status,
      organizationStatus: access.organization_status,
      membershipStatus: access.membership_status,
      role: access.role,
      permission,
    });
  }
}
