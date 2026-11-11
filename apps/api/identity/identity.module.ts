import { Module } from "@nestjs/common";
import {
  MEMBERSHIP_MUTATION_COMMAND,
  UnconfiguredMembershipMutationCommand,
  type MembershipMutationCommand,
} from "./identity-membership.contracts.js";
import { IdentityContextGuard } from "./identity-context.guard.js";
import { WorkOSAccessTokenVerifier } from "./workos-access-token.verifier.js";
import { WorkOSIdentityResolver } from "./workos-identity.resolver.js";
import { WorkOSAuthenticationGuard } from "./workos-authentication.guard.js";
import { OrganizationMembershipController } from "./organization-membership.controller.js";
import { OrganizationMembershipApplicationService } from "./organization-membership.service.js";
import {
  createPostgresTenantConnectionPool,
  PostgresTenantConnectionPool,
} from "./postgres-tenant-connection.pool.js";
import { PostgresMembershipMutationCommand } from "./postgres-membership-mutation.command.js";
import {
  INVITATION_RATE_LIMITER,
  INVITATION_REPOSITORY,
} from "./invitations/invitation.service.js";
import { PostgresInvitationRateLimiter } from "./invitations/postgres-invitation.rate-limiter.js";
import { PostgresInvitationRepositoryAdapter } from "./invitations/postgres-invitation.repository.js";

@Module({
  controllers: [OrganizationMembershipController],
  providers: [
    IdentityContextGuard,
    WorkOSAccessTokenVerifier,
    WorkOSIdentityResolver,
    WorkOSAuthenticationGuard,
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
      provide: INVITATION_RATE_LIMITER,
      inject: [PostgresTenantConnectionPool],
      useFactory: (pool: PostgresTenantConnectionPool | null) =>
        pool ? new PostgresInvitationRateLimiter(pool) : null,
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
  exports: [
    IdentityContextGuard,
    WorkOSAuthenticationGuard,
    OrganizationMembershipApplicationService,
    WorkOSAccessTokenVerifier,
    WorkOSIdentityResolver,
    INVITATION_REPOSITORY,
    INVITATION_RATE_LIMITER,
    PostgresTenantConnectionPool,
  ],
})
export class IdentityModule {}
