import { Module } from "@nestjs/common";
import { PostgresOpportunityRepository } from "@volition/database";
import { canManageOpportunity } from "@volition/permissions";
import { IdentityModule } from "../identity/identity.module.js";
import { PostgresTenantConnectionPool } from "../identity/postgres-tenant-connection.pool.js";
import { PublicOpportunityController } from "./public-opportunity.controller.js";
import { OPPORTUNITY_REPOSITORY } from "./opportunity.repository.js";

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
  ],
  exports: [OPPORTUNITY_REPOSITORY],
})
export class OpportunityModule {}
