import {
  PostgresInvitationRepository,
  type TenantConnectionPool,
} from "@volition/database";
import { canManageOrganizationMembership } from "@volition/permissions";
import type { InvitationRepository } from "./invitation.service.js";

/**
 * API adapter that reuses the shared organization membership policy. The
 * repository reloads actor membership under the organization mutation lock
 * and evaluates this policy inside the same PostgreSQL transaction as create.
 */
export class PostgresInvitationRepositoryAdapter
  implements InvitationRepository
{
  private readonly repository: PostgresInvitationRepository;

  constructor(pool: TenantConnectionPool) {
    this.repository = new PostgresInvitationRepository(pool, (input) =>
      canManageOrganizationMembership({
        actorAccountId: input.actorAccountId,
        organizationId: input.organizationId,
        resourceOrganizationId: input.organizationId,
        membershipStatus: input.membershipStatus,
        role: input.role,
        action: "invite",
        targetAccountId: null,
        currentTargetRole: null,
        targetMembershipStatus: null,
        requestedRole: input.requestedRole,
        activeOwnerCount: input.activeOwnerCount,
      }),
    );
  }

  createPendingInvitation(
    input: Parameters<InvitationRepository["createPendingInvitation"]>[0],
  ): ReturnType<InvitationRepository["createPendingInvitation"]> {
    return this.repository.createPendingInvitation(input);
  }

  revokePendingInvitation(
    input: Parameters<InvitationRepository["revokePendingInvitation"]>[0],
  ): ReturnType<InvitationRepository["revokePendingInvitation"]> {
    return this.repository.revokePendingInvitation(input);
  }

  acceptPendingInvitationAtomically(
    input: Parameters<
      InvitationRepository["acceptPendingInvitationAtomically"]
    >[0],
  ): ReturnType<InvitationRepository["acceptPendingInvitationAtomically"]> {
    return this.repository.acceptPendingInvitationAtomically({
      tokenHash: input.tokenHash,
      accountId: input.accountId,
      verifiedEmail: input.verifiedEmail,
    });
  }
}
