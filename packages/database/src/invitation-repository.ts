import { normalizeTenantId } from "./tenant-context.js";
import type {
  MembershipRole,
  MembershipStatus,
} from "./membership-repository.js";
import {
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
} from "./tenant-transaction.js";

export interface CreatePendingInvitationRecord {
  readonly organizationId: string;
  readonly invitedEmail: string;
  readonly role: "admin" | "member" | "viewer";
  readonly tokenHash: Uint8Array;
  readonly invitedByAccountId: string;
  readonly expiresAt: Date;
}

export interface CreatedInvitationRecord {
  readonly id: string;
  readonly expiresAt: Date;
}

export interface AcceptInvitationRecord {
  readonly tokenHash: Uint8Array;
  readonly accountId: string;
  readonly verifiedEmail: string;
}

export interface InvitationAuthorizationInput {
  readonly actorAccountId: string;
  readonly organizationId: string;
  readonly membershipStatus: MembershipStatus;
  readonly role: MembershipRole;
  readonly requestedRole: "admin" | "member" | "viewer";
  readonly activeOwnerCount: number;
}

export type InvitationAuthorizer = (
  input: InvitationAuthorizationInput,
) => boolean;

export class InvitationAuthorizationError extends Error {
  constructor() {
    super("Invitation creation is not permitted.");
    this.name = "InvitationAuthorizationError";
  }
}

interface OrganizationRow {
  readonly organization_id: string;
}

interface InvitationRow {
  readonly id: string;
  readonly invited_email: string;
  readonly role: "admin" | "member" | "viewer";
  readonly accepted_at: Date | string | null;
  readonly revoked_at: Date | string | null;
  readonly not_expired: boolean;
}

interface CreatedRow {
  readonly id: string;
  readonly expires_at: Date | string;
}

interface IdRow {
  readonly id: string;
}

interface EligibilityRow {
  readonly eligible: boolean;
}

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

interface ActorMembershipRow {
  readonly role: unknown;
  readonly status: unknown;
}

interface ActiveOwnerCountRow {
  readonly active_owner_count: number | string;
}

function assertInvitationInput(input: CreatePendingInvitationRecord): void {
  if (
    input.tokenHash.byteLength !== 32 ||
    input.invitedEmail !== input.invitedEmail.trim().toLowerCase() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.invitedEmail) ||
    !["admin", "member", "viewer"].includes(input.role) ||
    Number.isNaN(input.expiresAt.getTime())
  ) {
    throw new TypeError("A valid normalized invitation record is required.");
  }
}

/**
 * PostgreSQL persistence for the provider-neutral invitation application
 * service.
 */
export class PostgresInvitationRepository {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly authorize: InvitationAuthorizer = () => false,
  ) {}

  async createPendingInvitation(
    input: CreatePendingInvitationRecord,
  ): Promise<CreatedInvitationRecord> {
    assertInvitationInput(input);
    const organizationId = normalizeTenantId(input.organizationId);
    return withTenantTransaction(this.pool, organizationId, async (client) => {
      // Share the membership mutation lock so role changes cannot race an invite.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["organization-memberships:" + organizationId],
      );

      const actor = firstRow<ActorMembershipRow>(
        await client.query(
          "SELECT role, status FROM organization_memberships " +
            "WHERE organization_id = $1 AND account_id = $2 FOR UPDATE",
          [organizationId, input.invitedByAccountId],
        ),
      );
      const ownerCount = firstRow<ActiveOwnerCountRow>(
        await client.query(
          "SELECT count(*)::int AS active_owner_count " +
            "FROM organization_memberships " +
            "WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
          [organizationId],
        ),
      );
      const activeOwnerCount = Number(ownerCount?.active_owner_count);
      if (
        !actor ||
        !isMembershipRole(actor.role) ||
        !isMembershipStatus(actor.status) ||
        !Number.isSafeInteger(activeOwnerCount) ||
        activeOwnerCount < 0 ||
        !this.authorize({
          actorAccountId: input.invitedByAccountId,
          organizationId,
          membershipStatus: actor.status,
          role: actor.role,
          requestedRole: input.role,
          activeOwnerCount,
        })
      ) {
        throw new InvitationAuthorizationError();
      }

      // Serialize replacement for this normalized organization/email pair.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [
          "organization-invitations:" +
            organizationId +
            ":" +
            input.invitedEmail,
        ],
      );
      await client.query(
        "UPDATE organization_invitations SET revoked_at = clock_timestamp() " +
          "WHERE organization_id = $1 AND lower(invited_email) = $2 " +
          "AND accepted_at IS NULL AND revoked_at IS NULL",
        [organizationId, input.invitedEmail],
      );
      const inserted = firstRow<CreatedRow>(
        await client.query(
          "INSERT INTO organization_invitations " +
            "(organization_id, invited_email, role, token_hash, invited_by_account_id, expires_at) " +
            "VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id, expires_at",
          [
            organizationId,
            input.invitedEmail,
            input.role,
            input.tokenHash,
            input.invitedByAccountId,
            input.expiresAt,
          ],
        ),
      );
      if (!inserted) {
        throw new Error("Invitation insert did not return a record.");
      }
      return { id: inserted.id, expiresAt: new Date(inserted.expires_at) };
    });
  }

  async revokePendingInvitation(input: {
    readonly organizationId: string;
    readonly invitationId: string;
    readonly revokedAt: Date;
  }): Promise<void> {
    const organizationId = normalizeTenantId(input.organizationId);
    await withTenantTransaction(this.pool, organizationId, async (client) => {
      await client.query(
        "UPDATE organization_invitations SET revoked_at = $3 " +
          "WHERE organization_id = $1 AND id = $2 " +
          "AND accepted_at IS NULL AND revoked_at IS NULL",
        [organizationId, input.invitationId, input.revokedAt],
      );
    });
  }

  async acceptPendingInvitationAtomically(
    input: AcceptInvitationRecord,
  ): Promise<boolean> {
    if (
      input.tokenHash.byteLength !== 32 ||
      !input.accountId.trim() ||
      input.verifiedEmail !== input.verifiedEmail.trim().toLowerCase() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.verifiedEmail)
    ) {
      return false;
    }

    const client = await this.pool.connect();
    let transactionStarted = false;
    let releaseError: Error | undefined;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      // The hash-only SELECT policy discovers the tenant without exposing the hash.
      await client.query(
        "SELECT set_config('app.invitation_token_hash', encode($1::bytea, 'hex'), true)",
        [input.tokenHash],
      );
      const located = firstRow<OrganizationRow>(
        await client.query(
          "SELECT organization_id::text AS organization_id " +
            "FROM organization_invitations WHERE token_hash = $1",
          [input.tokenHash],
        ),
      );
      if (!located) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return false;
      }

      // Re-enter normal tenant RLS before locking or mutating tenant records.
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        located.organization_id,
      ]);
      const invitation = firstRow<InvitationRow>(
        await client.query(
          "SELECT id::text AS id, invited_email, role, accepted_at, revoked_at, " +
            "(expires_at > clock_timestamp()) AS not_expired " +
            "FROM organization_invitations WHERE token_hash = $1 " +
            "AND organization_id = $2 FOR UPDATE",
          [input.tokenHash, located.organization_id],
        ),
      );
      if (
        !invitation ||
        invitation.accepted_at !== null ||
        invitation.revoked_at !== null ||
        !invitation.not_expired ||
        invitation.invited_email.trim().toLowerCase() !== input.verifiedEmail
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return false;
      }

      const eligible = firstRow<EligibilityRow>(
        await client.query(
          "SELECT public.is_invitation_acceptance_eligible($1, $2, $3, $4) AS eligible",
          [
            invitation.id,
            input.tokenHash,
            input.accountId,
            input.verifiedEmail,
          ],
        ),
      );
      if (eligible?.eligible !== true) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return false;
      }

      const membership = firstRow<IdRow>(
        await client.query(
          "INSERT INTO organization_memberships (organization_id, account_id, role) " +
            "VALUES ($1, $2, $3) ON CONFLICT (organization_id, account_id) DO NOTHING " +
            "RETURNING id::text AS id",
          [located.organization_id, input.accountId, invitation.role],
        ),
      );
      if (!membership) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return false;
      }

      const accepted = firstRow<IdRow>(
        await client.query(
          "UPDATE organization_invitations SET accepted_at = clock_timestamp() " +
            "WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL " +
            "RETURNING id::text AS id",
          [invitation.id],
        ),
      );
      if (!accepted) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return false;
      }

      await client.query(
        "INSERT INTO audit_events " +
          "(organization_id, actor_account_id, event_name, resource_type, resource_id, metadata) " +
          "VALUES ($1, $2, 'organization.invitation.accepted', 'membership', $3, $4::jsonb)",
        [
          located.organization_id,
          input.accountId,
          membership.id,
          JSON.stringify({
            invitationId: invitation.id,
            role: invitation.role,
          }),
        ],
      );
      await client.query("COMMIT");
      transactionStarted = false;
      return true;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          releaseError =
            rollbackError instanceof Error
              ? rollbackError
              : new Error("Failed to roll back invitation transaction.");
        }
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }
}
