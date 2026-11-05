import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  UnconfiguredMembershipMutationCommand,
  type MembershipMutationCommand,
  type MembershipMutationInput,
  type MembershipMutationResult,
} from "./identity-membership.contracts.js";
import { OrganizationMembershipApplicationService } from "./organization-membership.service.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";
const targetAccountId = "22222222-2222-4222-8222-222222222222";

const result: MembershipMutationResult = {
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: "viewer",
  status: "active",
};

describe("OrganizationMembershipApplicationService", () => {
  it("uses only the verified principal as actor and canonicalizes UUID inputs", async () => {
    const mutate = vi.fn(
      async (_input: MembershipMutationInput) => result,
    );
    const command: MembershipMutationCommand = { mutate };
    const service = new OrganizationMembershipApplicationService(command);

    await expect(
      service.mutate(
        { accountId: actorAccountId.toUpperCase() },
        {
          organizationId: organizationId.toUpperCase(),
          targetAccountId: targetAccountId.toUpperCase(),
          action: "change-role",
          requestedRole: "viewer",
        },
      ),
    ).resolves.toEqual(result);

    expect(mutate).toHaveBeenCalledWith({
      organizationId,
      actorAccountId,
      targetAccountId,
      action: "change-role",
      requestedRole: "viewer",
    });
  });

  it("rejects malformed organization and target IDs before calling persistence", async () => {
    const mutate = vi.fn(async () => result);
    const service = new OrganizationMembershipApplicationService({
      mutate,
    });

    await expect(
      service.mutate(
        { accountId: actorAccountId },
        {
          organizationId: "not-a-uuid",
          targetAccountId,
          action: "revoke",
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("maps a null repository result to a generic forbidden response", async () => {
    const command: MembershipMutationCommand = {
      mutate: async () => null,
    };
    const service = new OrganizationMembershipApplicationService(command);

    await expect(
      service.mutate(
        { accountId: actorAccountId },
        {
          organizationId,
          targetAccountId,
          action: "revoke",
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps the API unavailable until a real persistence adapter is configured", async () => {
    const command = new UnconfiguredMembershipMutationCommand();

    await expect(
      command.mutate({
        organizationId,
        actorAccountId,
        targetAccountId,
        action: "revoke",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
