import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import type {
  OrganizationProfileRecord,
  UpdateOrganizationProfileInput,
} from "@volition/database";
import type { AuthenticatedPrincipal } from "./identity-membership.contracts.js";

export interface OrganizationProfileRepository {
  getForOrganization(input: {
    readonly organizationId: string;
    readonly actorAccountId: string;
  }): Promise<OrganizationProfileRecord | null>;
  updateForOrganization(
    input: UpdateOrganizationProfileInput,
  ): Promise<OrganizationProfileRecord | null>;
}

export const ORGANIZATION_PROFILE_REPOSITORY = Symbol(
  "ORGANIZATION_PROFILE_REPOSITORY",
);

@Injectable()
export class OrganizationProfileApplicationService {
  constructor(
    @Inject(ORGANIZATION_PROFILE_REPOSITORY)
    private readonly repository: OrganizationProfileRepository | null,
  ) {}

  async get(
    principal: AuthenticatedPrincipal,
    organizationId: string,
  ): Promise<OrganizationProfileRecord> {
    const actorAccountId = this.requireAccountId(principal);
    const normalizedOrganizationId = this.requireOrganizationId(organizationId);
    const repository = this.requireRepository();
    const profile = await repository.getForOrganization({
      organizationId: normalizedOrganizationId,
      actorAccountId,
    });
    if (!profile) {
      throw new NotFoundException("Organization profile is not available.");
    }
    return profile;
  }

  async update(
    principal: AuthenticatedPrincipal,
    organizationId: string,
    input: {
      readonly description?: string | null;
      readonly websiteUrl?: string | null;
      readonly countryCode?: string | null;
      readonly locale?: string;
      readonly timeZone?: string;
    },
  ): Promise<OrganizationProfileRecord> {
    const actorAccountId = this.requireAccountId(principal);
    const normalizedOrganizationId = this.requireOrganizationId(organizationId);
    const repository = this.requireRepository();

    if (
      input.description === undefined &&
      input.websiteUrl === undefined &&
      input.countryCode === undefined &&
      input.locale === undefined &&
      input.timeZone === undefined
    ) {
      throw new BadRequestException(
        "At least one organization profile field must be provided.",
      );
    }

    try {
      const profile = await repository.updateForOrganization({
        organizationId: normalizedOrganizationId,
        actorAccountId,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.websiteUrl !== undefined
          ? { websiteUrl: input.websiteUrl }
          : {}),
        ...(input.countryCode !== undefined
          ? { countryCode: input.countryCode }
          : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      });
      if (!profile) {
        throw new NotFoundException("Organization profile is not available.");
      }
      return profile;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new BadRequestException(
          "Organization profile fields are invalid.",
        );
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

  private requireOrganizationId(organizationId: string): string {
    if (!isUUID(organizationId)) {
      throw new BadRequestException("A valid organization ID is required.");
    }
    return organizationId.toLowerCase();
  }

  private requireRepository(): OrganizationProfileRepository {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Organization profile persistence is not configured.",
      );
    }
    return this.repository;
  }
}
