import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
} from "../identity/identity-context.guard.js";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import { WorkOSAuthenticationGuard } from "../identity/workos-authentication.guard.js";
import { TrustEvidenceApplicationService } from "./trust-evidence.service.js";

const ALLOWED_QUERY_KEYS = new Set(["limit", "offset"]);

function parseInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException("Invalid " + field + " query parameter.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException("Invalid " + field + " query parameter.");
  }
  return parsed;
}

function parsePagination(query: Record<string, unknown>) {
  for (const [key, value] of Object.entries(query)) {
    if (
      !ALLOWED_QUERY_KEYS.has(key) ||
      (value !== undefined && typeof value !== "string")
    ) {
      throw new BadRequestException("Invalid " + key + " query parameter.");
    }
  }

  const limit = parseInteger(query["limit"], 20, "limit");
  const offset = parseInteger(query["offset"], 0, "offset");
  if (limit < 1 || limit > 50) {
    throw new BadRequestException("Invalid limit query parameter.");
  }
  if (offset > 10_000) {
    throw new BadRequestException("Invalid offset query parameter.");
  }
  return { limit, offset };
}

/** Private read-only access to evidence metadata owned by the verified account. */
@Controller("me/trust-evidence")
@UseGuards(WorkOSAuthenticationGuard, IdentityContextGuard)
export class TrustEvidenceController {
  constructor(private readonly evidence: TrustEvidenceApplicationService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @Req() request: IdentityRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const principal = requireIdentityPrincipal(request);
    const { limit, offset } = parsePagination(query);
    return this.evidence.list(principal, limit, offset);
  }
}
