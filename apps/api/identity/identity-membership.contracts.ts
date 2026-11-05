import { Injectable, ServiceUnavailableException } from "@nestjs/common";

export type MembershipRole = "owner" | "admin" | "member" | "viewer";
export type MembershipMutationAction =
  "change-role" | "suspend" | "revoke" | "reactivate";

export interface AuthenticatedPrincipal {
  readonly accountId: string;
}

export interface MembershipMutationInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly targetAccountId: string;
  readonly action: MembershipMutationAction;
  readonly requestedRole?: MembershipRole;
}

export interface MembershipMutationResult {
  readonly membershipId: string;
  readonly role: MembershipRole;
  readonly status: "active" | "suspended" | "revoked";
}

export interface MembershipMutationCommand {
  mutate(input: MembershipMutationInput): Promise<MembershipMutationResult | null>;
}

export const MEMBERSHIP_MUTATION_COMMAND = Symbol(
  "MEMBERSHIP_MUTATION_COMMAND",
);

/**
 * Fail-closed default until a PostgreSQL pool adapter and trusted auth provider
 * are configured. Never replace this with a success-shaped mock.
 */
@Injectable()
export class UnconfiguredMembershipMutationCommand implements MembershipMutationCommand {
  async mutate(
    _input: MembershipMutationInput,
  ): Promise<MembershipMutationResult | null> {
    throw new ServiceUnavailableException(
      "Organization membership persistence is not configured.",
    );
  }
}
