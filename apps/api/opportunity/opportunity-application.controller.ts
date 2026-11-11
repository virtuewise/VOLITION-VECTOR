import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  OpportunityApplicationAuthorizationError,
  OpportunityApplicationConflictError,
  OpportunityApplicationInputError,
} from "@volition/database";
import type { OpportunityApplicationRecord } from "@volition/database";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
} from "../identity/identity-context.guard.js";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import { WorkOSAuthenticationGuard } from "../identity/workos-authentication.guard.js";
import {
  OPPORTUNITY_APPLICATION_REPOSITORY,
} from "./opportunity-application.repository.js";
import type {
  OpportunityApplicationRepositoryPort,
} from "./opportunity-application.repository.js";
import {
  ReviewOpportunityApplicationDto,
  SubmitOpportunityApplicationDto,
} from "./opportunity-application.dto.js";

const ALLOWED_LIST_QUERY_KEYS = new Set(["limit", "offset"]);

function parseInteger(
  value: string | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException(`Invalid ${field} query parameter.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`Invalid ${field} query parameter.`);
  }
  return parsed;
}

function rethrowRepositoryError(error: unknown): never {
  if (error instanceof OpportunityApplicationInputError) {
    throw new BadRequestException(error.message);
  }
  if (error instanceof OpportunityApplicationAuthorizationError) {
    throw new ForbiddenException("Application review is not permitted.");
  }
  if (error instanceof OpportunityApplicationConflictError) {
    throw new ConflictException(error.message);
  }
  throw error;
}

/**
 * Authenticated application workflows. Actor account IDs are always taken
 * from the verified WorkOS principal; they are never accepted in route or body
 * input. Tenant and participant checks remain enforced by the repository and
 * PostgreSQL RLS policies.
 */
@Controller()
@UseGuards(WorkOSAuthenticationGuard, IdentityContextGuard)
export class OpportunityApplicationController {
  constructor(
    @Inject(OPPORTUNITY_APPLICATION_REPOSITORY)
    private readonly repository: OpportunityApplicationRepositoryPort | null,
  ) {}

  @Post(
    "organizations/:organizationId/opportunities/:opportunityId/applications",
  )
  async submit(
    @Req() request: IdentityRequest,
    @Param("organizationId", new ParseUUIDPipe({ version: "4" }))
    organizationId: string,
    @Param("opportunityId", new ParseUUIDPipe({ version: "4" }))
    opportunityId: string,
    @Body() body: SubmitOpportunityApplicationDto,
  ): Promise<OpportunityApplicationRecord> {
    const applicantAccountId = requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();

    try {
      return await repository.submit({
        organizationId,
        opportunityId,
        applicantAccountId,
        ...(body.coverNote === undefined ? {} : { coverNote: body.coverNote }),
      });
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  @Get("me/opportunity-applications")
  async listMine(
    @Req() request: IdentityRequest,
    @Query() query: Record<string, string | undefined>,
  ): Promise<readonly OpportunityApplicationRecord[]> {
    const applicantAccountId = requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();

    for (const [key, value] of Object.entries(query)) {
      if (!ALLOWED_LIST_QUERY_KEYS.has(key) || typeof value !== "string") {
        throw new BadRequestException(`Invalid ${key} query parameter.`);
      }
    }

    const limit = parseInteger(query["limit"], 20, "limit");
    const offset = parseInteger(query["offset"], 0, "offset");

    try {
      return await repository.listMine(applicantAccountId, limit, offset);
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  @Post(
    "organizations/:organizationId/opportunity-applications/:applicationId/withdraw",
  )
  async withdraw(
    @Req() request: IdentityRequest,
    @Param("organizationId", new ParseUUIDPipe({ version: "4" }))
    organizationId: string,
    @Param("applicationId", new ParseUUIDPipe({ version: "4" }))
    applicationId: string,
  ): Promise<OpportunityApplicationRecord> {
    const applicantAccountId = requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();

    try {
      const application = await repository.withdraw({
        organizationId,
        applicationId,
        applicantAccountId,
      });
      if (!application) throw new NotFoundException("Application not found.");
      return application;
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  @Patch(
    "organizations/:organizationId/opportunity-applications/:applicationId/review",
  )
  async review(
    @Req() request: IdentityRequest,
    @Param("organizationId", new ParseUUIDPipe({ version: "4" }))
    organizationId: string,
    @Param("applicationId", new ParseUUIDPipe({ version: "4" }))
    applicationId: string,
    @Body() body: ReviewOpportunityApplicationDto,
  ): Promise<OpportunityApplicationRecord> {
    const reviewerAccountId = requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();

    try {
      const application = await repository.review({
        organizationId,
        applicationId,
        reviewerAccountId,
        decision: body.decision,
      });
      if (!application) throw new NotFoundException("Application not found.");
      return application;
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  private requireRepository(): OpportunityApplicationRepositoryPort {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Opportunity applications are not configured.",
      );
    }
    return this.repository;
  }
}
