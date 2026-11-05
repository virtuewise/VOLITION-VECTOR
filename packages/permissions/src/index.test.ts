import { describe, expect, it } from "vitest";
import {
  canAccessOrganization,
  canManageOrganizationMembership,
  type OrganizationAccessRequest,
  type OrganizationMembershipManagementRequest,
  type OrganizationRole,
} from "./index.js";

const base: OrganizationAccessRequest = {
  actorAccountId: "account-1",
  organizationId: "org-1",
  resourceOrganizationId: "org-1",
  membershipStatus: "active",
  role: "member",
  permission: "organization:read",
};

describe("canAccessOrganization", () => {
  it("allows a permission granted to an active member", () => {
    expect(canAccessOrganization(base)).toBe(true);
  });

  it("denies an unauthenticated actor", () => {
    expect(canAccessOrganization({ ...base, actorAccountId: null })).toBe(
      false,
    );
  });

  it("denies inactive membership", () => {
    expect(
      canAccessOrganization({ ...base, membershipStatus: "suspended" }),
    ).toBe(false);
  });

  it("denies cross-organization resource access", () => {
    expect(
      canAccessOrganization({ ...base, resourceOrganizationId: "org-2" }),
    ).toBe(false);
  });

  it("denies permissions not granted to the role", () => {
    expect(
      canAccessOrganization({ ...base, permission: "members:manage" }),
    ).toBe(false);
  });

  it("lets an explicit deny override a role grant", () => {
    expect(
      canAccessOrganization({
        ...base,
        role: "owner",
        explicitDenies: ["organization:read"],
      }),
    ).toBe(false);
  });

  it("allows an owner to manage members", () => {
    expect(
      canAccessOrganization({
        ...base,
        role: "owner",
        permission: "members:manage",
      }),
    ).toBe(true);
  });
});

const membershipRequest: OrganizationMembershipManagementRequest = {
  actorAccountId: "owner-1",
  organizationId: "org-1",
  resourceOrganizationId: "org-1",
  membershipStatus: "active",
  role: "owner",
  action: "invite",
  targetAccountId: null,
  currentTargetRole: null,
  targetMembershipStatus: null,
  requestedRole: "member",
  activeOwnerCount: 1,
};

describe("canManageOrganizationMembership", () => {
  it("allows an admin to manage a member within the same organization", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        role: "admin",
        action: "change-role",
        targetAccountId: "member-1",
        currentTargetRole: "member",
        targetMembershipStatus: "active",
        requestedRole: "viewer",
      }),
    ).toBe(true);
  });

  it("prevents admins from inviting owners or administrators", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        role: "admin",
        requestedRole: "admin",
      }),
    ).toBe(false);
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        role: "admin",
        requestedRole: "owner",
      }),
    ).toBe(false);
  });

  it("prevents admins from changing or revoking owner and admin memberships", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        role: "admin",
        action: "revoke",
        targetAccountId: "admin-1",
        currentTargetRole: "admin",
        targetMembershipStatus: "active",
        requestedRole: null,
      }),
    ).toBe(false);
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        role: "admin",
        action: "revoke",
        targetAccountId: "owner-2",
        currentTargetRole: "owner",
        targetMembershipStatus: "active",
        requestedRole: null,
      }),
    ).toBe(false);
  });

  it("prevents removing the last active owner", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        action: "change-role",
        targetAccountId: "owner-2",
        currentTargetRole: "owner",
        targetMembershipStatus: "active",
        requestedRole: "admin",
      }),
    ).toBe(false);
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        action: "revoke",
        targetAccountId: "owner-2",
        currentTargetRole: "owner",
        targetMembershipStatus: "active",
        requestedRole: null,
      }),
    ).toBe(false);
  });

  it("allows an owner to change another owner when an active owner remains", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        action: "change-role",
        targetAccountId: "owner-2",
        currentTargetRole: "owner",
        targetMembershipStatus: "active",
        requestedRole: "admin",
        activeOwnerCount: 2,
      }),
    ).toBe(true);
  });

  it("denies self-management of an organization membership", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        action: "change-role",
        targetAccountId: "owner-1",
        currentTargetRole: "owner",
        targetMembershipStatus: "active",
        requestedRole: "admin",
        activeOwnerCount: 2,
      }),
    ).toBe(false);
  });

  it("denies cross-organization membership management", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        resourceOrganizationId: "org-2",
      }),
    ).toBe(false);
  });

  it("fails closed for invalid owner counts and membership transitions", () => {
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        activeOwnerCount: -1,
      }),
    ).toBe(false);
    expect(
      canManageOrganizationMembership({
        ...membershipRequest,
        action: "reactivate",
        targetAccountId: "member-2",
        currentTargetRole: "member",
        targetMembershipStatus: "revoked",
        requestedRole: null,
      }),
    ).toBe(false);
  });
});

it("fails closed for unknown actor roles", () => {
  expect(
    canAccessOrganization({
      ...base,
      role: "super-admin" as OrganizationRole,
    }),
  ).toBe(false);
});

it("fails closed for unknown runtime actions and revoked role changes", () => {
  expect(
    canManageOrganizationMembership({
      ...membershipRequest,
      action: "delete" as OrganizationMembershipManagementRequest["action"],
    }),
  ).toBe(false);
  expect(
    canManageOrganizationMembership({
      ...membershipRequest,
      action: "change-role",
      targetAccountId: "member-3",
      currentTargetRole: "member",
      targetMembershipStatus: "revoked",
      requestedRole: "viewer",
    }),
  ).toBe(false);
});
