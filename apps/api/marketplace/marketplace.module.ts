import { Module } from "@nestjs/common";
import { PostgresServiceListingRepository } from "@volition/database";
import { canManageServiceListing } from "@volition/permissions";
import { IdentityModule } from "../identity/identity.module.js";
import { PostgresTenantConnectionPool } from "../identity/postgres-tenant-connection.pool.js";
import { PublicServiceListingController } from "./public-service-listing.controller.js";
import { SERVICE_LISTING_REPOSITORY } from "./service-listing.repository.js";

@Module({
  imports: [IdentityModule],
  controllers: [PublicServiceListingController],
  providers: [
    {
      provide: SERVICE_LISTING_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (pool: PostgresTenantConnectionPool | null) =>
        pool
          ? new PostgresServiceListingRepository(pool, (input) =>
              canManageServiceListing({
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
  exports: [SERVICE_LISTING_REPOSITORY],
})
export class MarketplaceModule {}
