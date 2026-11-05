import { describe, expect, it } from "vitest";
import {
  canAccessOrganization,
  type OrganizationAccessRequest,
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
    expect(
      canAccessOrganization({ ...base, actorAccountId: null }),
    ).toBe(false);
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
