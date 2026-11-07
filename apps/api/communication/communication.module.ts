import { Module } from "@nestjs/common";
import { PostgresConversationRepository } from "@volition/database";
import { canOpenApplicationConversation } from "@volition/permissions";
import { IdentityModule } from "../identity/identity.module.js";
import { PostgresTenantConnectionPool } from "../identity/postgres-tenant-connection.pool.js";
import { CONVERSATION_REPOSITORY } from "./conversation.repository.js";

@Module({
  imports: [IdentityModule],
  providers: [
    {
      provide: CONVERSATION_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (pool: PostgresTenantConnectionPool | null) =>
        pool
          ? new PostgresConversationRepository(pool, (input) =>
              canOpenApplicationConversation({
                actorAccountId: input.organizationAccountId,
                organizationId: input.organizationId,
                resourceOrganizationId: input.organizationId,
                membershipStatus: input.membershipStatus,
                role: input.role,
                applicationStatus: input.applicationStatus,
              }),
            )
          : null,
    },
  ],
  exports: [CONVERSATION_REPOSITORY],
})
export class CommunicationModule {}
