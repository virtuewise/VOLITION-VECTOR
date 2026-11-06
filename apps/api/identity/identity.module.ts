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
import { INVITATION_REPOSITORY } from "./invitations/invitation.service.js";
import { PostgresInvitationRepositoryAdapter } from "./invitations/postgres-invitation.repository.js";

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
      provide: INVITATION_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (pool: PostgresTenantConnectionPool | null) =>
        pool ? new PostgresInvitationRepositoryAdapter(pool) : null,
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
  exports: [OrganizationMembershipApplicationService, INVITATION_REPOSITORY],
})
export class IdentityModule {}
