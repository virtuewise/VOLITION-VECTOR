import { normalizeTenantId } from "./tenant-context.js";
import {
  withTenantTransaction,
  type TenantConnectionPool,
  type TenantQueryResult,
  type TenantTransactionClient,
} from "./tenant-transaction.js";

export interface ProjectWorkspaceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly opportunityApplicationId: string;
  readonly opportunityId: string;
  readonly clientAccountId: string;
  readonly providerAccountId: string;
  readonly title: string;
  readonly description: string;
  readonly status: "active" | "paused" | "completed" | "cancelled";
  readonly startsAt: Date | null;
  readonly targetCompletionAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectMilestoneRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly sequenceNumber: number;
  readonly status:
    "pending" | "in_progress" | "submitted" | "revision_requested" | "accepted";
  readonly dueAt: Date | null;
  readonly submittedAt: Date | null;
  readonly acceptedAt: Date | null;
  readonly acceptedByAccountId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface ProjectWorkspaceRow {
  readonly id: string;
  readonly organization_id: string;
  readonly opportunity_application_id: string;
  readonly opportunity_id: string;
  readonly client_account_id: string;
  readonly provider_account_id: string;
  readonly title: string;
  readonly description: string;
  readonly status: ProjectWorkspaceRecord["status"];
  readonly starts_at: Date | null;
  readonly target_completion_at: Date | null;
  readonly completed_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface ProjectMilestoneRow {
  readonly id: string;
  readonly organization_id: string;
  readonly project_id: string;
  readonly title: string;
  readonly description: string;
  readonly sequence_number: number;
  readonly status: ProjectMilestoneRecord["status"];
  readonly due_at: Date | null;
  readonly submitted_at: Date | null;
  readonly accepted_at: Date | null;
  readonly accepted_by_account_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function mapWorkspace(row: ProjectWorkspaceRow): ProjectWorkspaceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    opportunityApplicationId: row.opportunity_application_id,
    opportunityId: row.opportunity_id,
    clientAccountId: row.client_account_id,
    providerAccountId: row.provider_account_id,
    title: row.title,
    description: row.description,
    status: row.status,
    startsAt: row.starts_at,
    targetCompletionAt: row.target_completion_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMilestone(row: ProjectMilestoneRow): ProjectMilestoneRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    sequenceNumber: row.sequence_number,
    status: row.status,
    dueAt: row.due_at,
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    acceptedByAccountId: row.accepted_by_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function setParticipantContext(
  client: TenantTransactionClient,
  accountId: string,
): Promise<void> {
  await client.query("SELECT set_config('app.account_id', $1, true)", [
    accountId,
  ]);
}

function validatePagination(limit: number, offset: number): void {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10_000
  ) {
    throw new ProjectWorkspaceInputError(
      "Project workspace pagination parameters are invalid.",
    );
  }
}

export class ProjectWorkspaceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectWorkspaceInputError";
  }
}

/**
 * Read-only participant queries for project workspaces.
 *
 * The caller must supply an account ID obtained from a trusted authenticated
 * principal. The explicit participant predicates remain necessary because
 * tenant-level RLS policies are permissive for organization-scoped reads.
 */
export class PostgresProjectWorkspaceRepository {
  constructor(private readonly pool: TenantConnectionPool) {}

  async listForParticipant(
    organizationId: string,
    participantAccountId: string,
    limit = 20,
    offset = 0,
  ): Promise<readonly ProjectWorkspaceRecord[]> {
    const normalizedOrganizationId = normalizeTenantId(organizationId);
    const normalizedAccountId = normalizeTenantId(participantAccountId);
    validatePagination(limit, offset);

    return withTenantTransaction(
      this.pool,
      normalizedOrganizationId,
      async (client) => {
        await setParticipantContext(client, normalizedAccountId);
        const result = await client.query(
          "SELECT * FROM project_workspaces " +
            "WHERE organization_id = $1 " +
            "AND (client_account_id = $2 OR provider_account_id = $2) " +
            "ORDER BY updated_at DESC, id LIMIT $3 OFFSET $4",
          [normalizedOrganizationId, normalizedAccountId, limit, offset],
        );
        return (result.rows as readonly ProjectWorkspaceRow[]).map(
          mapWorkspace,
        );
      },
    );
  }

  async getForParticipant(
    organizationId: string,
    projectId: string,
    participantAccountId: string,
  ): Promise<ProjectWorkspaceRecord | null> {
    const normalizedOrganizationId = normalizeTenantId(organizationId);
    const normalizedProjectId = normalizeTenantId(projectId);
    const normalizedAccountId = normalizeTenantId(participantAccountId);

    return withTenantTransaction(
      this.pool,
      normalizedOrganizationId,
      async (client) => {
        await setParticipantContext(client, normalizedAccountId);
        const project = firstRow<ProjectWorkspaceRow>(
          await client.query(
            "SELECT * FROM project_workspaces " +
              "WHERE organization_id = $1 AND id = $2 " +
              "AND (client_account_id = $3 OR provider_account_id = $3) " +
              "LIMIT 1",
            [
              normalizedOrganizationId,
              normalizedProjectId,
              normalizedAccountId,
            ],
          ),
        );
        return project ? mapWorkspace(project) : null;
      },
    );
  }

  async listMilestonesForParticipant(
    organizationId: string,
    projectId: string,
    participantAccountId: string,
  ): Promise<readonly ProjectMilestoneRecord[]> {
    const normalizedOrganizationId = normalizeTenantId(organizationId);
    const normalizedProjectId = normalizeTenantId(projectId);
    const normalizedAccountId = normalizeTenantId(participantAccountId);

    return withTenantTransaction(
      this.pool,
      normalizedOrganizationId,
      async (client) => {
        await setParticipantContext(client, normalizedAccountId);
        const result = await client.query(
          "SELECT milestone.* FROM project_milestones AS milestone " +
            "JOIN project_workspaces AS project " +
            "ON project.organization_id = milestone.organization_id " +
            "AND project.id = milestone.project_id " +
            "WHERE milestone.organization_id = $1 " +
            "AND milestone.project_id = $2 " +
            "AND (project.client_account_id = $3 " +
            "OR project.provider_account_id = $3) " +
            "ORDER BY milestone.sequence_number ASC, milestone.id ASC",
          [normalizedOrganizationId, normalizedProjectId, normalizedAccountId],
        );
        return (result.rows as readonly ProjectMilestoneRow[]).map(
          mapMilestone,
        );
      },
    );
  }
}
