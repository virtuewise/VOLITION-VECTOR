import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ServiceListingInputError,
  type PublicServiceListingRecord,
  type ServiceDeliveryMode,
} from "@volition/database";
import {
  SERVICE_LISTING_REPOSITORY,
  type ServiceListingRepositoryPort,
} from "./service-listing.repository.js";

const ALLOWED_QUERY_KEYS = new Set([
  "q",
  "category",
  "deliveryMode",
  "limit",
  "offset",
]);

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

/** Public read-only service discovery backed by the invoker-security database view. */
@Controller("services")
export class PublicServiceListingController {
  constructor(
    @Inject(SERVICE_LISTING_REPOSITORY)
    private readonly repository: ServiceListingRepositoryPort | null,
  ) {}

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
  ): Promise<readonly PublicServiceListingRecord[]> {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Service discovery is not configured.",
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

    try {
      return await this.repository.listPublic({
        ...(query["q"] === undefined ? {} : { query: query["q"] }),
        ...(query["category"] === undefined
          ? {}
          : { category: query["category"] }),
        ...(query["deliveryMode"] === undefined
          ? {}
          : { deliveryMode: query["deliveryMode"] as ServiceDeliveryMode }),
        limit,
        offset,
      });
    } catch (error) {
      if (error instanceof ServiceListingInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
