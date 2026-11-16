import { Module } from "@nestjs/common";
import { PostgresTrustEvidenceRepository } from "@volition/database";
import { IdentityModule } from "../identity/identity.module.js";
import { PostgresTenantConnectionPool } from "../identity/postgres-tenant-connection.pool.js";
import {
  TRUST_EVIDENCE_REPOSITORY,
  type TrustEvidenceRepositoryPort,
} from "./trust-evidence.repository.js";
import { TrustEvidenceController } from "./trust-evidence.controller.js";
import { TrustEvidenceApplicationService } from "./trust-evidence.service.js";

@Module({
  imports: [IdentityModule],
  controllers: [TrustEvidenceController],
  providers: [
    TrustEvidenceApplicationService,
    {
      provide: TRUST_EVIDENCE_REPOSITORY,
      inject: [PostgresTenantConnectionPool],
      useFactory: (
        pool: PostgresTenantConnectionPool | null,
      ): TrustEvidenceRepositoryPort | null =>
        pool ? new PostgresTrustEvidenceRepository(pool) : null,
    },
  ],
})
export class TrustModule {}
