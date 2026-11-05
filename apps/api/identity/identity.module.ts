import { Module } from "@nestjs/common";
import {
  MEMBERSHIP_MUTATION_COMMAND,
  UnconfiguredMembershipMutationCommand,
} from "./identity-membership.contracts.js";
import { IdentityContextGuard } from "./identity-context.guard.js";
import { OrganizationMembershipController } from "./organization-membership.controller.js";
import { OrganizationMembershipApplicationService } from "./organization-membership.service.js";

@Module({
  controllers: [OrganizationMembershipController],
  providers: [
    IdentityContextGuard,
    OrganizationMembershipApplicationService,
    {
      provide: MEMBERSHIP_MUTATION_COMMAND,
      useClass: UnconfiguredMembershipMutationCommand,
    },
  ],
  exports: [OrganizationMembershipApplicationService],
})
export class IdentityModule {}
