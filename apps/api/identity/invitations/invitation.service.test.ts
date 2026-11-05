import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashInvitationToken,
  InvitationApplicationService,
  InvitationDeliveryError,
  InvitationInputError,
  InvalidInvitationError,
  INVITATION_TTL_MS,
  type InvitationAuthorizer,
  type InvitationNotifier,
  type InvitationRateLimiter,
  type InvitationRepository,
  type InvitationRole,
} from "./invitation.service.js";

const token = "A".repeat(43);
const now = new Date("2026-11-05T10:00:00.000Z");

function createDependencies() {
  const repository: InvitationRepository = {
    createPendingInvitation: vi.fn(async (input) => ({
      id: "invitation-1",
      expiresAt: input.expiresAt,
    })),
    revokePendingInvitation: vi.fn(async () => undefined),
    acceptPendingInvitationAtomically: vi.fn(async () => true),
  };
  const authorizer: InvitationAuthorizer = {
    assertCanInvite: vi.fn(async () => undefined),
  };
  const rateLimiter: InvitationRateLimiter = {
    assertAllowed: vi.fn(async () => undefined),
  };
  const notifier: InvitationNotifier = {
    sendInvitation: vi.fn(async () => undefined),
  };
  const service = new InvitationApplicationService({
    repository,
    authorizer,
    rateLimiter,
    notifier,
    clock: () => new Date(now),
    tokenGenerator: () => token,
  });

  return { service, repository, authorizer, rateLimiter, notifier };
}

const createInput = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  actorAccountId: "11111111-1111-4111-8111-111111111111",
  invitedEmail: " Person@Example.Test ",
  role: "member" as const,
};

describe("hashInvitationToken", () => {
  it("returns a 32-byte SHA-256 digest for a canonical 32-byte token", () => {
    expect(hashInvitationToken(token)).toHaveLength(32);
  });

  it("rejects malformed and non-canonical tokens", () => {
    expect(() => hashInvitationToken("not-a-token")).toThrow(
      InvalidInvitationError,
    );
    expect(() => hashInvitationToken("A".repeat(42))).toThrow(
      InvalidInvitationError,
    );
  });
});

describe("InvitationApplicationService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stores only the token hash and returns no raw token", async () => {
    const { service, repository, authorizer, rateLimiter, notifier } =
      createDependencies();

    const result = await service.createInvitation(createInput);

    expect(authorizer.assertCanInvite).toHaveBeenCalledWith({
      actorAccountId: createInput.actorAccountId,
      organizationId: createInput.organizationId,
      requestedRole: "member",
    });
    expect(rateLimiter.assertAllowed).toHaveBeenCalledWith({
      actorAccountId: createInput.actorAccountId,
      organizationId: createInput.organizationId,
      invitedEmail: "person@example.test",
    });
    expect(repository.createPendingInvitation).toHaveBeenCalledWith({
      organizationId: createInput.organizationId,
      invitedEmail: "person@example.test",
      role: "member",
      tokenHash: hashInvitationToken(token),
      invitedByAccountId: createInput.actorAccountId,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    });
    expect(repository.createPendingInvitation).not.toHaveBeenCalledWith(
      expect.objectContaining({ token }),
    );
    expect(notifier.sendInvitation).toHaveBeenCalledWith({
      invitationId: "invitation-1",
      organizationId: createInput.organizationId,
      invitedEmail: "person@example.test",
      role: "member",
      token,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    });
    expect(result).toEqual({
      invitationId: "invitation-1",
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    });
    expect(result).not.toHaveProperty("token");
  });

  it("rejects owner invitations before authorization or persistence", async () => {
    const { service, repository, authorizer } = createDependencies();

    await expect(
      service.createInvitation({
        ...createInput,
        role: "owner" as InvitationRole,
      }),
    ).rejects.toBeInstanceOf(InvitationInputError);

    expect(authorizer.assertCanInvite).not.toHaveBeenCalled();
    expect(repository.createPendingInvitation).not.toHaveBeenCalled();
  });

  it("does not persist an invitation when rate limiting rejects the request", async () => {
    const { service, repository, rateLimiter, notifier } = createDependencies();
    vi.mocked(rateLimiter.assertAllowed).mockRejectedValueOnce(
      new Error("rate limit exceeded"),
    );

    await expect(service.createInvitation(createInput)).rejects.toThrow(
      "rate limit exceeded",
    );

    expect(repository.createPendingInvitation).not.toHaveBeenCalled();
    expect(notifier.sendInvitation).not.toHaveBeenCalled();
  });

  it("revokes a pending invitation if notification delivery fails", async () => {
    const { service, repository, notifier } = createDependencies();
    vi.mocked(notifier.sendInvitation).mockRejectedValueOnce(
      new Error("mail provider unavailable"),
    );

    await expect(service.createInvitation(createInput)).rejects.toBeInstanceOf(
      InvitationDeliveryError,
    );

    expect(repository.revokePendingInvitation).toHaveBeenCalledWith({
      invitationId: "invitation-1",
      revokedAt: now,
    });
  });

  it("accepts an invitation using the authenticated account and verified email", async () => {
    const { service, repository } = createDependencies();

    await expect(
      service.acceptInvitation({
        token,
        accountId: "22222222-2222-4222-8222-222222222222",
        verifiedEmail: " Person@Example.Test ",
      }),
    ).resolves.toBeUndefined();

    expect(repository.acceptPendingInvitationAtomically).toHaveBeenCalledWith({
      tokenHash: hashInvitationToken(token),
      accountId: "22222222-2222-4222-8222-222222222222",
      verifiedEmail: "person@example.test",
      acceptedAt: now,
    });
  });

  it("returns the same generic error for unknown, expired, used or mismatched invitations", async () => {
    const { service, repository } = createDependencies();
    vi.mocked(
      repository.acceptPendingInvitationAtomically,
    ).mockResolvedValueOnce(false);

    await expect(
      service.acceptInvitation({
        token,
        accountId: "22222222-2222-4222-8222-222222222222",
        verifiedEmail: "person@example.test",
      }),
    ).rejects.toThrow("Invitation is invalid or no longer available.");
  });

  it("does not query persistence for a malformed invitation token", async () => {
    const { service, repository } = createDependencies();

    await expect(
      service.acceptInvitation({
        token: "malformed",
        accountId: "22222222-2222-4222-8222-222222222222",
        verifiedEmail: "person@example.test",
      }),
    ).rejects.toBeInstanceOf(InvalidInvitationError);

    expect(repository.acceptPendingInvitationAtomically).not.toHaveBeenCalled();
  });
});
