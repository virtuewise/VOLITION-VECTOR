import { Module } from "@nestjs/common";
import { PostgresProjectWorkspaceRepository } from "@volition/database";
import { IdentityModule } from "../identity/identity.module.js";
import { PostgresTenantConnectionPool } from "../identity/postgres-tenant-connection.pool.js";
import { ProjectWorkspaceController } from "./project-workspace.controller.js";
import { PROJECT_WORKSPACE_REPOSITORY } from "./project-workspace.repository.js";

@Module({
  imports: [IdentityModule],
  controllers: [ProjectWorkspaceController],
  providers: [
    {
      provide: PROJECT_WORKSPACE_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (pool: PostgresTenantConnectionPool | null) =>
        pool ? new PostgresProjectWorkspaceRepository(pool) : null,
    },
  ],
})
export class ProjectWorkspaceModule {}
