import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import type {
  AccountProfileRecord,
  UpdateAccountProfileInput,
} from "@volition/database";
import type {
  AuthenticatedPrincipal,
} from "./identity-membership.contracts.js";

export interface AccountProfileRepository {
  getForAccount(accountId: string): Promise<AccountProfileRecord | null>;
  updateForAccount(
    input: UpdateAccountProfileInput,
  ): Promise<AccountProfileRecord>;
}

export const ACCOUNT_PROFILE_REPOSITORY = Symbol(
  "ACCOUNT_PROFILE_REPOSITORY",
);

export interface AccountProfileView {
  readonly accountId: string;
  readonly displayName: string | null;
  readonly locale: string;
  readonly timeZone: string;
  readonly updatedAt: Date | null;
}

@Injectable()
export class AccountProfileApplicationService {
  constructor(
    @Inject(ACCOUNT_PROFILE_REPOSITORY)
    private readonly repository: AccountProfileRepository | null,
  ) {}

  async get(
    principal: AuthenticatedPrincipal,
  ): Promise<AccountProfileView> {
    const accountId = this.requireAccountId(principal);
    const repository = this.requireRepository();
    const profile = await repository.getForAccount(accountId);

    return (
      profile ?? {
        accountId,
        displayName: null,
        locale: "en",
        timeZone: "UTC",
        updatedAt: null,
      }
    );
  }

  async update(
    principal: AuthenticatedPrincipal,
    input: {
      readonly displayName?: string | null;
      readonly locale?: string;
      readonly timeZone?: string;
    },
  ): Promise<AccountProfileRecord> {
    const accountId = this.requireAccountId(principal);
    const repository = this.requireRepository();

    if (
      input.displayName === undefined &&
      input.locale === undefined &&
      input.timeZone === undefined
    ) {
      throw new BadRequestException(
        "At least one profile field must be provided.",
      );
    }
    if (
      (input.locale !== undefined && typeof input.locale !== "string") ||
      (input.timeZone !== undefined && typeof input.timeZone !== "string") ||
      (input.displayName !== undefined &&
        input.displayName !== null &&
        typeof input.displayName !== "string")
    ) {
      throw new BadRequestException("Profile fields are invalid.");
    }

    const patch: UpdateAccountProfileInput = {
      accountId,
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
    };

    try {
      return await repository.updateForAccount(patch);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new BadRequestException("Profile fields are invalid.");
      }
      throw error;
    }
  }

  private requireAccountId(principal: AuthenticatedPrincipal): string {
    if (!isUUID(principal.accountId)) {
      throw new UnauthorizedException(
        "A verified identity context is required.",
      );
    }
    return principal.accountId.toLowerCase();
  }

  private requireRepository(): AccountProfileRepository {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Account profile persistence is not configured.",
      );
    }
    return this.repository;
  }
}
