import { normalizeAccountId } from "./account-context.js";
import { withAccountTransaction } from "./account-transaction.js";
import type {
  TenantConnectionPool,
  TenantQueryResult,
} from "./tenant-transaction.js";

export type AccountOrganizationRole = "owner" | "admin" | "member" | "viewer";

export interface AccountOrganizationSummary {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly role: AccountOrganizationRole;
}

interface AccountOrganizationRow {
  readonly organization_id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: AccountOrganizationRole;
}

function isRole(value: unknown): value is AccountOrganizationRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

/**
 * Discovers the authenticated account's active organizations without
 * accepting a tenant ID from the caller. The database transaction sets only
 * app.account_id; SELECT-only RLS policies expose that account's own active
 * memberships and their organization summaries.
 */
export class PostgresAccountOrganizationRepository {
  constructor(private readonly pool: TenantConnectionPool) {}

  async listForAccount(
    accountId: string,
  ): Promise<readonly AccountOrganizationSummary[]> {
    const normalizedAccountId = normalizeAccountId(accountId);

    return withAccountTransaction(
      this.pool,
      normalizedAccountId,
      async (client) => {
        const result = await client.query(
          "SELECT organization.id::text AS organization_id, " +
            "organization.name, organization.slug, membership.role " +
            "FROM organization_memberships AS membership " +
            "JOIN organizations AS organization " +
            "ON organization.id = membership.organization_id " +
            "JOIN accounts AS account ON account.id = membership.account_id " +
            "WHERE membership.account_id = $1 " +
            "AND membership.status = 'active' " +
            "AND organization.status = 'active' " +
            "AND account.status = 'active' " +
            "ORDER BY lower(organization.name), organization.id",
          [normalizedAccountId],
        );

        return result.rows.map((value) => {
          const row = value as AccountOrganizationRow;
          if (
            typeof row.organization_id !== "string" ||
            typeof row.name !== "string" ||
            typeof row.slug !== "string" ||
            !isRole(row.role)
          ) {
            throw new Error(
              "Organization membership query returned an invalid record.",
            );
          }
          return {
            organizationId: row.organization_id,
            name: row.name,
            slug: row.slug,
            role: row.role,
          };
        });
      },
    );
  }
}
