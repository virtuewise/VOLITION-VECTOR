import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ProjectWorkspaceInputError } from "@volition/database";
import type {
  ProjectMilestoneRecord,
  ProjectWorkspaceRecord,
} from "@volition/database";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
} from "../identity/identity-context.guard.js";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import {
  WorkOSAuthenticationGuard,
} from "../identity/workos-authentication.guard.js";
import {
  PROJECT_WORKSPACE_REPOSITORY,
  type ProjectWorkspaceRepositoryPort,
} from "./project-workspace.repository.js";

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
): { limit: number; offset: number } {
  for (const [key, value] of Object.entries(query)) {
    if (!ALLOWED_LIST_QUERY_KEYS.has(key) || typeof value !== "string") {
      throw new BadRequestException(`Invalid ${key} query parameter.`);
    }
  }

  return {
    limit: parseInteger(query["limit"], 20, "limit"),
    offset: parseInteger(query["offset"], 0, "offset"),
  };
}

function rethrowRepositoryError(error: unknown): never {
  if (error instanceof ProjectWorkspaceInputError) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

/**
 * Read-only project workspace endpoints for the two named participants.
 *
 * The account identifier always comes from the verified WorkOS principal.
 * The organization and project path values are locators, not capabilities;
 * PostgreSQL RLS and explicit participant predicates remain authoritative.
 */
@Controller("organizations/:organizationId/projects")
@UseGuards(WorkOSAuthenticationGuard, IdentityContextGuard)
export class ProjectWorkspaceController {
  constructor(
    @Inject(PROJECT_WORKSPACE_REPOSITORY)
    private readonly repository: ProjectWorkspaceRepositoryPort | null,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(
    @Req() request: IdentityRequest,
    @Param("organizationId", new ParseUUIDPipe({ version: "4" }))
    organizationId: string,
    @Query() query: Record<string, string | undefined>,
  ): Promise<readonly ProjectWorkspaceRecord[]> {
    const participantAccountId = requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();
    const pagination = validateListQuery(query);

    try {
      return await repository.listForParticipant(
        organizationId,
        participantAccountId,
        pagination.limit,
        pagination.offset,
      );
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  @Get(":projectId")
  @Header("Cache-Control", "private, no-store")
  async get(
    @Req() request: IdentityRequest,
    @Param("organizationId", new ParseUUIDPipe({ version: "4" }))
    organizationId: string,
    @Param("projectId", new ParseUUIDPipe({ version: "4" }))
    projectId: string,
  ): Promise<ProjectWorkspaceRecord> {
    const participantAccountId =
      requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();

    try {
      const project = await repository.getForParticipant(
        organizationId,
        projectId,
        participantAccountId,
      );
      if (!project) throw new NotFoundException("Project not found.");
      return project;
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  @Get(":projectId/milestones")
  @Header("Cache-Control", "private, no-store")
  async listMilestones(
    @Req() request: IdentityRequest,
    @Param("organizationId", new ParseUUIDPipe({ version: "4" }))
    organizationId: string,
    @Param("projectId", new ParseUUIDPipe({ version: "4" }))
    projectId: string,
    @Query() query: Record<string, string | undefined>,
  ): Promise<readonly ProjectMilestoneRecord[]> {
    const participantAccountId =
      requireIdentityPrincipal(request).accountId;
    const repository = this.requireRepository();
    const pagination = validateListQuery(query);

    try {
      const project = await repository.getForParticipant(
        organizationId,
        projectId,
        participantAccountId,
      );
      if (!project) throw new NotFoundException("Project not found.");

      return await repository.listMilestonesForParticipant(
        organizationId,
        projectId,
        participantAccountId,
        pagination.limit,
        pagination.offset,
      );
    } catch (error) {
      return rethrowRepositoryError(error);
    }
  }

  private requireRepository(): ProjectWorkspaceRepositoryPort {
    if (!this.repository) {
      throw new ServiceUnavailableException(
        "Project workspace persistence is not configured.",
      );
    }
    return this.repository;
  }
}
