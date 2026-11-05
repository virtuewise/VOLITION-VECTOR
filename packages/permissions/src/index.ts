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
  if (!request.actorAccountId || !request.role) return false;
  if (request.membershipStatus !== "active") return false;
  if (request.organizationId !== request.resourceOrganizationId) return false;
  if (request.explicitDenies?.includes(request.permission)) return false;

  return ROLE_PERMISSIONS[request.role].includes(request.permission);
}

export type MembershipManagementAction =
  | "invite"
  | "change-role"
  | "suspend"
  | "revoke"
  | "reactivate";

export interface OrganizationMembershipManagementRequest
  extends Omit<OrganizationAccessRequest, "permission"> {
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
  if (!Number.isInteger(request.activeOwnerCount) || request.activeOwnerCount < 0) {
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
      explicitDenies: request.explicitDenies,
    })
  ) {
    return false;
  }

  if (request.action === "invite") {
    if (
      request.targetAccountId !== null ||
      request.currentTargetRole !== null ||
      request.targetMembershipStatus !== null ||
      request.requestedRole === null
    ) {
      return false;
    }
  } else {
    if (
      !request.targetAccountId?.trim() ||
      request.targetAccountId === request.actorAccountId ||
      request.currentTargetRole === null ||
      request.targetMembershipStatus === null
    ) {
      return false;
    }

    if (
      request.action === "change-role"
        ? request.requestedRole === null
        : request.requestedRole !== null
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
      (request.action === "change-role" &&
        request.requestedRole !== "owner"));

  if (removesActiveOwner && request.activeOwnerCount <= 1) {
    return false;
  }

  return true;
}
