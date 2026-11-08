import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PostgresTenantConnectionPool } from "./postgres-tenant-connection.pool.js";

/**
 * Maps a cryptographically verified WorkOS issuer/subject pair to one active
 * internal account. Email and WorkOS organization claims are never used.
 */
@Injectable()
export class WorkOSIdentityResolver {
  constructor(
    @Inject(PostgresTenantConnectionPool)
    private readonly pool: PostgresTenantConnectionPool | null,
  ) {}

  async resolveActiveAccountId(
    issuer: string,
    subject: string,
  ): Promise<string | null> {
    if (!this.pool) {
      throw new ServiceUnavailableException(
        "Internal identity mapping is not configured.",
      );
    }
    if (!issuer.trim() || !subject.trim()) return null;
    return this.pool.resolveActiveAccountId(issuer, subject);
  }
}
