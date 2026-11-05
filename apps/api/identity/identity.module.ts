import { Module } from "@nestjs/common";
import {
  MEMBERSHIP_MUTATION_COMMAND,
  UnconfiguredMembershipMutationCommand,
  type MembershipMutationCommand,
} from "./identity-membership.contracts.js";
import { IdentityContextGuard } from "./identity-context.guard.js";
import { OrganizationMembershipController } from "./organization-membership.controller.js";
import { OrganizationMembershipApplicationService } from "./organization-membership.service.js";
import {
  createPostgresTenantConnectionPool,
  PostgresTenantConnectionPool,
} from "./postgres-tenant-connection.pool.js";
import { PostgresMembershipMutationCommand } from "./postgres-membership-mutation.command.js";

@Module({
  controllers: [OrganizationMembershipController],
  providers: [
    IdentityContextGuard,
    OrganizationMembershipApplicationService,
    {
      provide: PostgresTenantConnectionPool,
      useFactory: () => {
        const connectionString = process.env["DATABASE_URL"];
        return connectionString
          ? createPostgresTenantConnectionPool(connectionString)
          : null;
      },
    },
    {
      provide: MEMBERSHIP_MUTATION_COMMAND,
      inject: [PostgresTenantConnectionPool],
      useFactory: (
        pool: PostgresTenantConnectionPool | null,
      ): MembershipMutationCommand =>
        pool
          ? new PostgresMembershipMutationCommand(pool)
          : new UnconfiguredMembershipMutationCommand(),
    },
  ],
  exports: [OrganizationMembershipApplicationService],
})
export class IdentityModule {}
