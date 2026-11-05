export type AccountId = string & { readonly __brand: "AccountId" };
export type OrganizationId = string & {
  readonly __brand: "OrganizationId";
};

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type MembershipStatus = "active" | "suspended" | "revoked";

export interface AuthenticatedPrincipal {
  readonly accountId: AccountId;
  readonly issuer: string;
  readonly subject: string;
}

export interface OrganizationMembership {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly accountId: AccountId;
  readonly role: OrganizationRole;
  readonly status: MembershipStatus;
}

export interface OrganizationSummary {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly status: "active" | "suspended" | "closed";
}
