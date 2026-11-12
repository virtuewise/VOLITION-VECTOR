import { Module } from "@nestjs/common";
import { PostgresOrganizationProfileRepository } from "@volition/database";
import { canAccessOrganization } from "@volition/permissions";
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
import { OrganizationProfileController } from "./organization-profile.controller.js";
import {
  ORGANIZATION_PROFILE_REPOSITORY,
  OrganizationProfileApplicationService,
  type OrganizationProfileRepository,
} from "./organization-profile.service.js";
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
  controllers: [OrganizationMembershipController, OrganizationProfileController],
  providers: [
    IdentityContextGuard,
    WorkOSAccessTokenVerifier,
    WorkOSIdentityResolver,
    WorkOSAuthenticationGuard,
    OrganizationMembershipApplicationService,
    OrganizationProfileApplicationService,
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
    {
      provide: ORGANIZATION_PROFILE_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (
        pool: PostgresTenantConnectionPool | null,
      ): OrganizationProfileRepository | null =>
        pool
          ? new PostgresOrganizationProfileRepository(pool, (input) => {
              if (
                input.accountStatus !== "active" ||
                input.organizationStatus !== "active" ||
                input.membershipStatus !== "active"
              ) {
                return false;
              }
              return canAccessOrganization({
                actorAccountId: input.actorAccountId,
                organizationId: input.organizationId,
                resourceOrganizationId: input.resourceOrganizationId,
                membershipStatus: "active",
                role: input.role,
                permission: input.permission,
              });
            })
          : null,
    },
  ],
  exports: [
    OrganizationMembershipApplicationService,
    OrganizationProfileApplicationService,
    WorkOSAccessTokenVerifier,
    WorkOSIdentityResolver,
    INVITATION_REPOSITORY,
    INVITATION_RATE_LIMITER,
    PostgresTenantConnectionPool,
  ],
})
export class IdentityModule {}
