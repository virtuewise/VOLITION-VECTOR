export const ORGANIZATION_PERMISSIONS = [
  "organization:read",
  "organization:update",
  "members:read",
  "members:invite",
  "members:manage",
  "audit:read",
] as const;

export type OrganizationPermission =
  (typeof ORGANIZATION_PERMISSIONS)[number];
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
