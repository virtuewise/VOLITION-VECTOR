import { Injectable } from "@nestjs/common";
import {
  PostgresMembershipRepository,
  type TenantConnectionPool,
} from "@volition/database";
import { canManageOrganizationMembership } from "@volition/permissions";
import type {
  MembershipMutationCommand,
  MembershipMutationInput,
  MembershipMutationResult,
} from "./identity-membership.contracts.js";

@Injectable()
export class PostgresMembershipMutationCommand implements MembershipMutationCommand {
  private readonly repository: PostgresMembershipRepository;

  constructor(pool: TenantConnectionPool) {
    this.repository = new PostgresMembershipRepository(
      pool,
      (input) => canManageOrganizationMembership(input),
    );
  }

  mutate(input: MembershipMutationInput): Promise<MembershipMutationResult | null> {
    return this.repository.mutate(input);
  }
}
