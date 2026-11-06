import { Module } from "@nestjs/common";
import {
  PostgresOpportunityApplicationRepository,
  PostgresOpportunityRepository,
} from "@volition/database";
import {
  canManageOpportunity,
  canReviewOpportunityApplication,
} from "@volition/permissions";
import { IdentityModule } from "../identity/identity.module.js";
import { PostgresTenantConnectionPool } from "../identity/postgres-tenant-connection.pool.js";
import { PublicOpportunityController } from "./public-opportunity.controller.js";
import { OPPORTUNITY_REPOSITORY } from "./opportunity.repository.js";
import { OPPORTUNITY_APPLICATION_REPOSITORY } from "./opportunity-application.repository.js";

@Module({
  imports: [IdentityModule],
  controllers: [PublicOpportunityController],
  providers: [
    {
      provide: OPPORTUNITY_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (pool: PostgresTenantConnectionPool | null) =>
        pool
          ? new PostgresOpportunityRepository(pool, (input) =>
              canManageOpportunity({
                actorAccountId: input.actorAccountId,
                organizationId: input.organizationId,
                resourceOrganizationId: input.organizationId,
                membershipStatus: input.membershipStatus,
                role: input.role,
                action: input.action,
                isCreator: input.isCreator,
                currentStatus: input.currentStatus,
              }),
            )
          : null,
    },
    {
      provide: OPPORTUNITY_APPLICATION_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (pool: PostgresTenantConnectionPool | null) =>
        pool
          ? new PostgresOpportunityApplicationRepository(pool, (input) =>
              canReviewOpportunityApplication({
                actorAccountId: input.reviewerAccountId,
                organizationId: input.organizationId,
                resourceOrganizationId: input.organizationId,
                membershipStatus: input.membershipStatus,
                role: input.role,
                currentStatus: input.currentStatus,
                decision: input.decision,
              }),
            )
          : null,
    },
  ],
  exports: [OPPORTUNITY_REPOSITORY, OPPORTUNITY_APPLICATION_REPOSITORY],
})
export class OpportunityModule {}
