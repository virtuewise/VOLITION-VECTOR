import {
  normalizeTenantId,
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
} from "./tenant-transaction.js";

export type MembershipMutationAction =
  "change-role" | "suspend" | "revoke" | "reactivate";
export type MembershipRole = "owner" | "admin" | "member" | "viewer";
export type MembershipStatus = "active" | "suspended" | "revoked";

export interface MembershipMutationPolicyInput {
  readonly actorAccountId: string;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly membershipStatus: MembershipStatus | null;
  readonly role: MembershipRole | null;
  readonly action: MembershipMutationAction;
  readonly targetAccountId: string;
  readonly currentTargetRole: MembershipRole | null;
  readonly targetMembershipStatus: MembershipStatus | null;
  readonly requestedRole: MembershipRole | null;
  readonly activeOwnerCount: number;
}

export type MembershipMutationAuthorizer = (
  input: MembershipMutationPolicyInput,
) => boolean;

export interface MutateMembershipInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly targetAccountId: string;
  readonly action: MembershipMutationAction;
  readonly requestedRole?: MembershipRole;
}

export interface MembershipMutationResult {
  readonly membershipId: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
}

interface MembershipRow {
  readonly id: string;
  readonly account_id: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
}

interface CountRow {
  readonly active_owner_count: number | string;
}

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function isMembershipAction(value: string): value is MembershipMutationAction {
  return (
    value === "change-role" ||
    value === "suspend" ||
    value === "revoke" ||
    value === "reactivate"
  );
}

function isRole(value: unknown): value is MembershipRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

/**
 * Tenant-scoped membership mutation adapter.
 *
 * All mutations for an organization take the same transaction advisory lock.
 * Actor, target and active-owner state are loaded from PostgreSQL and passed
 * to the shared deny-by-default policy before any write.
 */
export class PostgresMembershipRepository {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly authorize: MembershipMutationAuthorizer,
  ) {}

  async mutate(
    input: MutateMembershipInput,
  ): Promise<MembershipMutationResult | null> {
    if (
      !isMembershipAction(input.action) ||
      !input.actorAccountId.trim() ||
      !input.targetAccountId.trim() ||
      input.actorAccountId === input.targetAccountId ||
      (input.action === "change-role"
        ? !isRole(input.requestedRole)
        : input.requestedRole !== undefined)
    ) {
      return null;
    }

    const organizationId = normalizeTenantId(organizationId);

    return withTenantTransaction(
      this.pool,
      organizationId,
      async (client) => {
        // Serialize every membership mutation in this tenant. This makes the
        // owner count and subsequent write one race-safe critical section.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          ["organization-memberships:" + organizationId],
        );

        const actor = firstRow<MembershipRow>(
          await client.query(
            "SELECT id::text AS id, account_id::text AS account_id, role, status " +
              "FROM organization_memberships " +
              "WHERE organization_id = $1 AND account_id = $2 FOR UPDATE",
            [organizationId, input.actorAccountId],
          ),
        );
        const target = firstRow<MembershipRow>(
          await client.query(
            "SELECT id::text AS id, account_id::text AS account_id, role, status " +
              "FROM organization_memberships " +
              "WHERE organization_id = $1 AND account_id = $2 FOR UPDATE",
            [organizationId, input.targetAccountId],
          ),
        );
        const count = firstRow<CountRow>(
          await client.query(
            "SELECT count(*)::int AS active_owner_count " +
              "FROM organization_memberships " +
              "WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
            [organizationId],
          ),
        );

        if (
          !actor ||
          !target ||
          !count ||
          !isRole(actor.role) ||
          !isRole(target.role)
        ) {
          return null;
        }

        const activeOwnerCount = Number(count.active_owner_count);
        if (!Number.isSafeInteger(activeOwnerCount) || activeOwnerCount < 0) {
          return null;
        }

        const allowed = this.authorize({
          actorAccountId: input.actorAccountId,
          organizationId: organizationId,
          resourceOrganizationId: organizationId,
          membershipStatus: actor.status,
          role: actor.role,
          action: input.action,
          targetAccountId: input.targetAccountId,
          currentTargetRole: target.role,
          targetMembershipStatus: target.status,
          requestedRole: input.requestedRole ?? null,
          activeOwnerCount,
        });
        if (!allowed) return null;

        const updated = firstRow<MembershipRow>(
          await client.query(
            "UPDATE organization_memberships SET " +
              "role = CASE WHEN $3::text IS NULL THEN role ELSE $3 END, " +
              "status = CASE WHEN $4::text IS NULL THEN status ELSE $4 END, " +
              "updated_at = clock_timestamp() " +
              "WHERE organization_id = $1 AND account_id = $2 " +
              "RETURNING id::text AS id, account_id::text AS account_id, role, status",
            [
              organizationId,
              input.targetAccountId,
              input.action === "change-role" ? input.requestedRole : null,
              input.action === "suspend"
                ? "suspended"
                : input.action === "revoke"
                  ? "revoked"
                  : input.action === "reactivate"
                    ? "active"
                    : null,
            ],
          ),
        );
        if (!updated || !isRole(updated.role)) {
          throw new Error("Membership mutation did not return a valid record.");
        }

        await client.query(
          "INSERT INTO audit_events " +
            "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
            "VALUES ($1, $2, $3, 'organization_membership', $4, $5::jsonb)",
          [
            organizationId,
            input.actorAccountId,
            "organization.membership." + input.action,
            updated.id,
            JSON.stringify({
              targetAccountId: input.targetAccountId,
              previousRole: target.role,
              role: updated.role,
              previousStatus: target.status,
              status: updated.status,
            }),
          ],
        );

        return {
          membershipId: updated.id,
          role: updated.role,
          status: updated.status,
        };
      },
    );
  }
}
