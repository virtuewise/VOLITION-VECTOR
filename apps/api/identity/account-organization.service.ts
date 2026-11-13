import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import type {
  AccountOrganizationSummary,
} from "@volition/database";
import type { AuthenticatedPrincipal } from "./identity-membership.contracts.js";

export interface AccountOrganizationRepository {
  listForAccount(accountId: string): Promise<readonly AccountOrganizationSummary[]>;
}

export const ACCOUNT_ORGANIZATION_REPOSITORY = Symbol(
  "ACCOUNT_ORGANIZATION_REPOSITORY",
);

@Injectable()
export class AccountOrganizationApplicationService {
  constructor(
    @Inject(ACCOUNT_ORGANIZATION_REPOSITORY)
    private readonly repository: AccountOrganizationRepository | null,
  ) {}

  async list(
    principal: AuthenticatedPrincipal,
  ): Promise<readonly AccountOrganizationSummary[]> {
    if (!isUUID(principal.accountId)) {
      throw new UnauthorizedException(
        "A verified identity context is required.",
      );
    }
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Organization discovery is not configured.",
      );
    }
    return this.repository.listForAccount(principal.accountId.toLowerCase());
  }
}
