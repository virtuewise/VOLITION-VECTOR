export type ProjectWorkspaceId = string & {
  readonly __brand: "ProjectWorkspaceId";
};
export type ProjectMilestoneId = string & {
  readonly __brand: "ProjectMilestoneId";
};

export type ProjectWorkspaceStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type ProjectMilestoneStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "revision_requested"
  | "accepted";

export interface ProjectWorkspace {
  readonly id: ProjectWorkspaceId;
  readonly organizationId: string;
  readonly opportunityApplicationId: string;
  readonly opportunityId: string;
  readonly clientAccountId: string;
  readonly providerAccountId: string;
  readonly title: string;
  readonly description: string;
  readonly status: ProjectWorkspaceStatus;
  readonly startsAt: Date | null;
  readonly targetCompletionAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectMilestone {
  readonly id: ProjectMilestoneId;
  readonly organizationId: string;
  readonly projectId: ProjectWorkspaceId;
  readonly title: string;
  readonly description: string;
  readonly sequenceNumber: number;
  readonly status: ProjectMilestoneStatus;
  readonly dueAt: Date | null;
  readonly submittedAt: Date | null;
  readonly acceptedAt: Date | null;
  readonly acceptedByAccountId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProjectWorkspace {
  readonly organizationId: string;
  readonly opportunityApplicationId: string;
  readonly clientAccountId: string;
  readonly title: string;
  readonly description: string;
  readonly startsAt?: Date | null;
  readonly targetCompletionAt?: Date | null;
}

export interface CreateProjectMilestone {
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly sequenceNumber: number;
  readonly dueAt?: Date | null;
}

export interface SubmitProjectMilestone {
  readonly organizationId: string;
  readonly projectId: string;
  readonly milestoneId: string;
  readonly providerAccountId: string;
}

export interface ReviewProjectMilestone {
  readonly organizationId: string;
  readonly projectId: string;
  readonly milestoneId: string;
  readonly reviewerAccountId: string;
  readonly decision: "accepted" | "revision_requested";
}
