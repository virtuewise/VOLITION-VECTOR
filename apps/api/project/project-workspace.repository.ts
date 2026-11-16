import type {
  ProjectMilestoneRecord,
  ProjectWorkspaceRecord,
} from "@volition/database";

export const PROJECT_WORKSPACE_REPOSITORY = Symbol(
  "PROJECT_WORKSPACE_REPOSITORY",
);

export interface ProjectWorkspaceRepositoryPort {
  listForParticipant(
    organizationId: string,
    participantAccountId: string,
    limit?: number,
    offset?: number,
  ): Promise<readonly ProjectWorkspaceRecord[]>;

  getForParticipant(
    organizationId: string,
    projectId: string,
    participantAccountId: string,
  ): Promise<ProjectWorkspaceRecord | null>;

  listMilestonesForParticipant(
    organizationId: string,
    projectId: string,
    participantAccountId: string,
    limit?: number,
    offset?: number,
  ): Promise<readonly ProjectMilestoneRecord[]>;
}
