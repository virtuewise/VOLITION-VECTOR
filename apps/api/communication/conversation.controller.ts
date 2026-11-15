import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConversationInputError } from "@volition/database";
import type {
  ConversationMessageRecord,
  ConversationRecord,
} from "@volition/database";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
} from "../identity/identity-context.guard.js";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import { WorkOSAuthenticationGuard } from "../identity/workos-authentication.guard.js";
import { CONVERSATION_REPOSITORY } from "./conversation.repository.js";
import type { ConversationRepositoryPort } from "./conversation.repository.js";

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

function validateListQuery(
  query: Record<string, string | undefined>,
  defaultLimit: number,
): { limit: number; offset: number } {
  for (const [key, value] of Object.entries(query)) {
    if (!ALLOWED_LIST_QUERY_KEYS.has(key) || typeof value !== "string") {
      throw new BadRequestException(`Invalid ${key} query parameter.`);
    }
  }

  return {
    limit: parseInteger(query["limit"], defaultLimit, "limit"),
    offset: parseInteger(query["offset"], 0, "offset"),
  };
}

function rethrowRepositoryError(error: unknown): never {
  if (error instanceof ConversationInputError) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

/**
 * Private, read-only conversation endpoints.
 *
 * The account identifier is derived only from the verified WorkOS principal.
 * A conversation ID is a locator; participant RLS and the repository's
 * explicit participant predicate remain authoritative.
 * This controller intentionally exposes no conversation or message writes.
 * The repository uses stable ordering for paginated conversation lists.
 */
@Controller("conversations")
@UseGuards(WorkOSAuthenticationGuard, IdentityContextGuard)
export class ConversationController {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort | null,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(
    @Req() request: IdentityRequest,
    @Query() query: Record<string, string | undefined>,
  ): Promise<readonly ConversationRecord[]> {
    const accountId = requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();
    const pagination = validateListQuery(query, 20);

    try {
      return await repository.listMine(
        accountId,
        pagination.limit,
        pagination.offset,
      );
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  @Get(":conversationId/messages")
  @Header("Cache-Control", "private, no-store")
  async listMessages(
    @Req() request: IdentityRequest,
    @Param("conversationId", new ParseUUIDPipe({ version: "4" }))
    conversationId: string,
    @Query() query: Record<string, string | undefined>,
  ): Promise<readonly ConversationMessageRecord[]> {
    const accountId = requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();
    const pagination = validateListQuery(query, 50);

    try {
      return await repository.listMessages(
        accountId,
        conversationId,
        pagination.limit,
        pagination.offset,
      );
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  private requireRepository(): ConversationRepositoryPort {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Conversation persistence is not configured.",
      );
    }
    return this.repository;
  }
}
