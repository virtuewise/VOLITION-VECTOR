import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpportunityInputError } from "@volition/database";
import type {
  OpportunitySort,
  OpportunityType,
  PublicOpportunityRecord,
} from "@volition/database";
import {
  OPPORTUNITY_REPOSITORY,
  type OpportunityRepositoryPort,
} from "./opportunity.repository.js";

const ALLOWED_QUERY_KEYS = new Set(["q", "type", "sort", "limit", "offset"]);

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

function parseSort(value: string | undefined): OpportunitySort | undefined {
  if (value === undefined) return undefined;
  if (value === "relevance" || value === "recent") return value;
  throw new BadRequestException("Invalid sort query parameter.");
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
  ): Promise<readonly PublicOpportunityRecord[]> {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Opportunity discovery is not configured.",
      );
    }

    for (const [key, value] of Object.entries(query)) {
      if (!ALLOWED_QUERY_KEYS.has(key)) {
        throw new BadRequestException(`Unknown query parameter: ${key}`);
      }
      if (typeof value !== "string") {
        throw new BadRequestException(`Invalid ${key} query parameter.`);
      }
    }

    const limit = parseInteger(query["limit"], 20, "limit");
    const offset = parseInteger(query["offset"], 0, "offset");
    const sort = parseSort(query["sort"]);

    try {
      return await this.repository.listPublic({
        ...(query["q"] === undefined ? {} : { query: query["q"] }),
        ...(query["type"] === undefined
          ? {}
          : { opportunityType: query["type"] as OpportunityType }),
        ...(sort === undefined ? {} : { sort }),
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
