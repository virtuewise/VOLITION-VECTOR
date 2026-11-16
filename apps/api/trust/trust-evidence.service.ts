import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { TrustEvidenceInputError } from "@volition/database";
import type { TrustEvidenceRecord } from "@volition/database";
import { isUUID } from "class-validator";
import type { AuthenticatedPrincipal } from "../identity/identity-membership.contracts.js";
import {
  TRUST_EVIDENCE_REPOSITORY,
  type TrustEvidenceRepositoryPort,
} from "./trust-evidence.repository.js";

@Injectable()
export class TrustEvidenceApplicationService {
  constructor(
    @Inject(TRUST_EVIDENCE_REPOSITORY)
    private readonly repository: TrustEvidenceRepositoryPort | null,
  ) {}

  async list(
    principal: AuthenticatedPrincipal,
    limit: number,
    offset: number,
  ): Promise<readonly TrustEvidenceRecord[]> {
    if (!principal || !isUUID(principal.accountId)) {
      throw new UnauthorizedException(
        "A verified identity context is required.",
      );
    }
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Trust evidence persistence is not configured.",
      );
    }

    try {
      return await this.repository.listForAccount(
        principal.accountId.toLowerCase(),
        limit,
        offset,
      );
    } catch (error) {
      if (error instanceof TrustEvidenceInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
