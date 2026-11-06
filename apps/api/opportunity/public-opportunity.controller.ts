import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpportunityInputError } from "@volition/database";
import type { OpportunityType } from "@volition/contracts";
import {
  OPPORTUNITY_REPOSITORY,
  type OpportunityRepositoryPort,
} from "./opportunity.repository.js";

const ALLOWED_QUERY_KEYS = new Set(["q", "type", "limit", "offset"]);

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

/** Public read-only endpoint; PostgreSQL's invoker-security view is the data boundary. */
@Controller("opportunities")
export class PublicOpportunityController {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly repository: OpportunityRepositoryPort | null,
  ) {}

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
  ): Promise<unknown> {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Opportunity discovery is not configured.",
      );
    }

    for (const key of Object.keys(query)) {
      if (!ALLOWED_QUERY_KEYS.has(key)) {
        throw new BadRequestException(`Unknown query parameter: ${key}`);
      }
    }

    const limit = parseInteger(query["limit"], 20, "limit");
    const offset = parseInteger(query["offset"], 0, "offset");

    try {
      return await this.repository.listPublic({
        ...(query["q"] === undefined ? {} : { query: query["q"] }),
        ...(query["type"] === undefined
          ? {}
          : { opportunityType: query["type"] as OpportunityType }),
        limit,
        offset,
      });
    } catch (error) {
      if (error instanceof OpportunityInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
