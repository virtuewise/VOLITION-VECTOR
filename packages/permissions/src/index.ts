export const ORGANIZATION_PERMISSIONS = [
  "organization:read",
  "organization:update",
  "members:read",
  "members:invite",
  "members:manage",
  "audit:read",
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];
export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

export interface OrganizationAccessRequest {
  readonly actorAccountId: string | null;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly membershipStatus: "active" | "suspended" | "revoked" | null;
  readonly role: OrganizationRole | null;
  readonly permission: OrganizationPermission;
  readonly explicitDenies?: readonly OrganizationPermission[];
}

const ROLE_PERMISSIONS: Readonly<
  Record<OrganizationRole, readonly OrganizationPermission[]>
> = {
  owner: ORGANIZATION_PERMISSIONS,
  admin: [
    "organization:read",
    "organization:update",
    "members:read",
    "members:invite",
    "members:manage",
    "audit:read",
  ],
  member: ["organization:read", "members:read"],
  viewer: ["organization:read"],
};

/** Deny-by-default organization authorization with explicit tenant-boundary checks. */
export function canAccessOrganization(
  request: OrganizationAccessRequest,
): boolean {
  if (!request.actorAccountId?.trim() || !isOrganizationRole(request.role)) {
    return false;
  }
  if (request.membershipStatus !== "active") return false;
  if (request.organizationId !== request.resourceOrganizationId) return false;
  if (request.explicitDenies?.includes(request.permission)) return false;

  return ROLE_PERMISSIONS[request.role].includes(request.permission);
}

export type MembershipManagementAction =
  "invite" | "change-role" | "suspend" | "revoke" | "reactivate";

export interface OrganizationMembershipManagementRequest extends Omit<
  OrganizationAccessRequest,
  "permission"
> {
  readonly action: MembershipManagementAction;
  readonly targetAccountId: string | null;
  readonly currentTargetRole: OrganizationRole | null;
  readonly targetMembershipStatus: "active" | "suspended" | "revoked" | null;
  readonly requestedRole: OrganizationRole | null;
  readonly activeOwnerCount: number;
}

/**
 * Apply role-hierarchy and owner-continuity constraints after the base
 * organization permission check. Callers must load target membership data
 * server-side and evaluate this policy in the same transaction as the change.
 */
export function canManageOrganizationMembership(
  request: OrganizationMembershipManagementRequest,
): boolean {
  const allowedActions: readonly string[] = [
    "invite",
    "change-role",
    "suspend",
    "revoke",
    "reactivate",
  ];
  if (!allowedActions.includes(request.action)) return false;

  if (
    !Number.isInteger(request.activeOwnerCount) ||
    request.activeOwnerCount < 0
  ) {
    return false;
  }

  if (
    !canAccessOrganization({
      actorAccountId: request.actorAccountId,
      organizationId: request.organizationId,
      resourceOrganizationId: request.resourceOrganizationId,
      membershipStatus: request.membershipStatus,
      role: request.role,
      permission: "members:manage",
      ...(request.explicitDenies
        ? { explicitDenies: request.explicitDenies }
        : {}),
    })
  ) {
    return false;
  }

  if (request.action === "invite") {
    if (
      request.targetAccountId !== null ||
      request.currentTargetRole !== null ||
      request.targetMembershipStatus !== null ||
      !isOrganizationRole(request.requestedRole) ||
      request.requestedRole === "owner"
    ) {
      return false;
    }
  } else {
    if (
      !request.targetAccountId?.trim() ||
      request.targetAccountId.trim() === request.actorAccountId?.trim() ||
      !isOrganizationRole(request.currentTargetRole) ||
      !["active", "suspended", "revoked"].includes(
        request.targetMembershipStatus ?? "",
      )
    ) {
      return false;
    }

    if (
      request.action === "change-role"
        ? !isOrganizationRole(request.requestedRole)
        : request.requestedRole !== null
    ) {
      return false;
    }

    if (
      request.action === "change-role" &&
      request.targetMembershipStatus === "revoked"
    ) {
      return false;
    }

    if (
      request.action === "suspend" &&
      request.targetMembershipStatus !== "active"
    ) {
      return false;
    }

    if (
      request.action === "revoke" &&
      request.targetMembershipStatus === "revoked"
    ) {
      return false;
    }

    if (
      request.action === "reactivate" &&
      request.targetMembershipStatus !== "suspended"
    ) {
      return false;
    }
  }

  if (
    request.role === "admin" &&
    [request.currentTargetRole, request.requestedRole].some(
      (role) => role === "owner" || role === "admin",
    )
  ) {
    return false;
  }

  const removesActiveOwner =
    request.currentTargetRole === "owner" &&
    request.targetMembershipStatus === "active" &&
    (request.action === "suspend" ||
      request.action === "revoke" ||
      (request.action === "change-role" && request.requestedRole !== "owner"));

  if (removesActiveOwner && request.activeOwnerCount <= 1) {
    return false;
  }

  return true;
}

export type OpportunityLifecycleStatus =
  "draft" | "published" | "paused" | "closed" | "archived";

export type OpportunityManagementAction =
  "create" | "edit" | "publish" | "pause" | "close" | "archive";

export interface OpportunityManagementRequest {
  readonly actorAccountId: string | null;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly membershipStatus: "active" | "suspended" | "revoked" | null;
  readonly role: OrganizationRole | null;
  readonly action: OpportunityManagementAction;
  readonly isCreator: boolean;
  readonly currentStatus: OpportunityLifecycleStatus | null;
}

/** Deny-by-default opportunity lifecycle policy; the repository must load all facts server-side. */
export function canManageOpportunity(
  request: OpportunityManagementRequest,
): boolean {
  if (
    !request.actorAccountId?.trim() ||
    !isOrganizationRole(request.role) ||
    request.membershipStatus !== "active" ||
    request.organizationId !== request.resourceOrganizationId
  ) {
    return false;
  }

  if (request.action === "create") {
    return (
      request.currentStatus === null &&
      (request.role === "owner" ||
        request.role === "admin" ||
        request.role === "member")
    );
  }

  if (request.currentStatus === null) return false;

  const privileged = request.role === "owner" || request.role === "admin";
  switch (request.action) {
    case "edit":
      return (
        (privileged &&
          (request.currentStatus === "draft" ||
            request.currentStatus === "paused")) ||
        (request.role === "member" &&
          request.isCreator &&
          request.currentStatus === "draft")
      );
    case "publish":
      return (
        privileged &&
        (request.currentStatus === "draft" ||
          request.currentStatus === "paused")
      );
    case "pause":
      return privileged && request.currentStatus === "published";
    case "close":
      return (
        privileged &&
        (request.currentStatus === "published" ||
          request.currentStatus === "paused")
      );
    case "archive":
      return (
        privileged &&
        (request.currentStatus === "draft" ||
          request.currentStatus === "paused" ||
          request.currentStatus === "closed")
      );
    default:
      return false;
  }
}

export type ServiceListingManagementAction = "create" | "publish";

export interface ServiceListingManagementRequest {
  readonly actorAccountId: string | null;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly membershipStatus: "active" | "suspended" | "revoked" | null;
  readonly role: OrganizationRole | null;
  readonly action: ServiceListingManagementAction;
  readonly isCreator: boolean;
  readonly currentStatus: OpportunityLifecycleStatus | null;
}

/** Service listing lifecycle policy. Callers must load membership and creator facts server-side. */
export function canManageServiceListing(
  request: ServiceListingManagementRequest,
): boolean {
  if (
    !request.actorAccountId?.trim() ||
    !isOrganizationRole(request.role) ||
    request.membershipStatus !== "active" ||
    request.organizationId !== request.resourceOrganizationId
  ) {
    return false;
  }

  if (request.action === "create") {
    return (
      request.currentStatus === null &&
      (request.role === "owner" ||
        request.role === "admin" ||
        request.role === "member")
    );
  }
  if (request.action !== "publish" || request.currentStatus === null) {
    return false;
  }

  const privileged = request.role === "owner" || request.role === "admin";
  return (
    privileged &&
    (request.currentStatus === "draft" || request.currentStatus === "paused")
  );
}

export type OpportunityApplicationReviewDecision =
  "shortlisted" | "rejected" | "accepted";

export interface OpportunityApplicationReviewRequest {
  readonly actorAccountId: string | null;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly membershipStatus: "active" | "suspended" | "revoked" | null;
  readonly role: OrganizationRole | null;
  readonly currentStatus:
    "submitted" | "shortlisted" | "withdrawn" | "rejected" | "accepted";
  readonly decision: OpportunityApplicationReviewDecision;
}

/** Only active organization owners/admins may review applications for their tenant. */
export function canReviewOpportunityApplication(
  request: OpportunityApplicationReviewRequest,
): boolean {
  if (
    !request.actorAccountId?.trim() ||
    (request.role !== "owner" && request.role !== "admin") ||
    request.membershipStatus !== "active" ||
    request.organizationId !== request.resourceOrganizationId
  ) {
    return false;
  }

  if (
    request.decision !== "shortlisted" &&
    request.decision !== "rejected" &&
    request.decision !== "accepted"
  ) {
    return false;
  }

  return (
    request.currentStatus === "submitted" ||
    request.currentStatus === "shortlisted"
  );
}

export interface ProjectMilestoneSubmissionRequest {
  readonly actorAccountId: string | null;
  readonly providerAccountId: string;
  readonly projectStatus: "active" | "paused" | "completed" | "cancelled";
  readonly milestoneStatus:
    "pending" | "in_progress" | "submitted" | "revision_requested" | "accepted";
}

export function canSubmitProjectMilestone(
  request: ProjectMilestoneSubmissionRequest,
): boolean {
  if (
    !request.actorAccountId?.trim() ||
    request.actorAccountId !== request.providerAccountId ||
    request.projectStatus !== "active"
  ) {
    return false;
  }

  return (
    request.milestoneStatus === "pending" ||
    request.milestoneStatus === "in_progress" ||
    request.milestoneStatus === "revision_requested"
  );
}

export interface ProjectMilestoneReviewRequest {
  readonly actorAccountId: string | null;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly membershipStatus: "active" | "suspended" | "revoked" | null;
  readonly role: OrganizationRole | null;
  readonly projectStatus: "active" | "paused" | "completed" | "cancelled";
  readonly milestoneStatus:
    "pending" | "in_progress" | "submitted" | "revision_requested" | "accepted";
  readonly decision: "accepted" | "revision_requested";
}

/** Only active tenant owners/admins may review a submitted project milestone. */
export function canReviewProjectMilestone(
  request: ProjectMilestoneReviewRequest,
): boolean {
  if (
    !request.actorAccountId?.trim() ||
    (request.role !== "owner" && request.role !== "admin") ||
    request.membershipStatus !== "active" ||
    request.organizationId !== request.resourceOrganizationId ||
    request.projectStatus !== "active" ||
    request.milestoneStatus !== "submitted"
  ) {
    return false;
  }

  return (
    request.decision === "accepted" || request.decision === "revision_requested"
  );
}

export function canOpenApplicationConversation(request: {
  readonly actorAccountId: string | null;
  readonly organizationId: string;
  readonly resourceOrganizationId: string;
  readonly membershipStatus: "active" | "suspended" | "revoked" | null;
  readonly role: OrganizationRole | null;
  readonly applicationStatus:
    "submitted" | "withdrawn" | "shortlisted" | "rejected" | "accepted";
}): boolean {
  return (
    Boolean(request.actorAccountId?.trim()) &&
    (request.role === "owner" || request.role === "admin") &&
    request.membershipStatus === "active" &&
    request.organizationId === request.resourceOrganizationId &&
    (request.applicationStatus === "shortlisted" ||
      request.applicationStatus === "accepted")
  );
}
