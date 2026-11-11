import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  OpportunityApplicationAuthorizationError,
  OpportunityApplicationConflictError,
} from "@volition/database";
import type { OpportunityApplicationRecord } from "@volition/database";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import type { OpportunityApplicationRepositoryPort } from "./opportunity-application.repository.js";
import { OpportunityApplicationController } from "./opportunity-application.controller.js";
import { describe, expect, it, vi } from "vitest";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const opportunityId = "33333333-3333-4333-8333-333333333333";
const applicationId = "44444444-4444-4444-8444-444444444444";
const applicantAccountId = "11111111-1111-4111-8111-111111111111";
const reviewerAccountId = "22222222-2222-4222-8222-222222222222";

const application: OpportunityApplicationRecord = {
  id: applicationId,
  organizationId,
  opportunityId,
  applicantAccountId,
  opportunitySlug: "senior-engineer",
  opportunityTitle: "Senior Engineer",
  opportunityType: "employment",
  coverNote: "I am interested in this role.",
  status: "submitted",
  submittedAt: new Date("2026-11-06T09:00:00.000Z"),
  updatedAt: new Date("2026-11-06T09:00:00.000Z"),
  reviewedAt: null,
  reviewedByAccountId: null,
  withdrawnAt: null,
};

function createRepository(): OpportunityApplicationRepositoryPort {
  return {
    submit: vi.fn().mockResolvedValue(application),
    withdraw: vi.fn().mockResolvedValue(application),
    review: vi.fn().mockResolvedValue(application),
    listMine: vi.fn().mockResolvedValue([application]),
  };
}

function identityRequest(accountId = applicantAccountId): IdentityRequest {
  return { identity: { accountId } };
}

describe("OpportunityApplicationController", () => {
  it("submits using the verified principal instead of a caller-supplied actor", async () => {
    const repository = createRepository();
    const controller = new OpportunityApplicationController(repository);

    await expect(
      controller.submit(identityRequest(), organizationId, opportunityId, {
        coverNote: "I am interested in this role.",
      }),
    ).resolves.toEqual(application);

    expect(repository.submit).toHaveBeenCalledWith({
      organizationId,
      opportunityId,
      applicantAccountId,
      coverNote: "I am interested in this role.",
    });
  });

  it("lists only the verified applicant's applications with bounded query inputs", async () => {
    const repository = createRepository();
    const controller = new OpportunityApplicationController(repository);

    await expect(
      controller.listMine(identityRequest(), { limit: "10", offset: "20" }),
    ).resolves.toEqual([application]);

    expect(repository.listMine).toHaveBeenCalledWith(applicantAccountId, 10, 20);
  });

  it("rejects unknown and malformed list query parameters", async () => {
    const controller = new OpportunityApplicationController(createRepository());

    await expect(
      controller.listMine(identityRequest(), { accountId: reviewerAccountId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listMine(identityRequest(), { limit: "10items" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("withdraws only for the verified applicant", async () => {
    const repository = createRepository();
    const controller = new OpportunityApplicationController(repository);

    await expect(
      controller.withdraw(identityRequest(), organizationId, applicationId),
    ).resolves.toEqual(application);

    expect(repository.withdraw).toHaveBeenCalledWith({
      organizationId,
      applicationId,
      applicantAccountId,
    });
  });

  it("does not reveal a missing or non-withdrawable application", async () => {
    const repository = createRepository();
    vi.mocked(repository.withdraw).mockResolvedValueOnce(null);
    const controller = new OpportunityApplicationController(repository);

    await expect(
      controller.withdraw(identityRequest(), organizationId, applicationId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reviews using the verified organization principal", async () => {
    const repository = createRepository();
    const controller = new OpportunityApplicationController(repository);

    await expect(
      controller.review(identityRequest(reviewerAccountId), organizationId, applicationId, {
        decision: "accepted",
      }),
    ).resolves.toEqual(application);

    expect(repository.review).toHaveBeenCalledWith({
      organizationId,
      applicationId,
      reviewerAccountId,
      decision: "accepted",
    });
  });

  it("maps denied review authorization to HTTP 403", async () => {
    const repository = createRepository();
    vi.mocked(repository.review).mockRejectedValueOnce(
      new OpportunityApplicationAuthorizationError(),
    );
    const controller = new OpportunityApplicationController(repository);

    await expect(
      controller.review(identityRequest(reviewerAccountId), organizationId, applicationId, {
        decision: "accepted",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("maps duplicate or unavailable state transitions to HTTP 409", async () => {
    const repository = createRepository();
    vi.mocked(repository.submit).mockRejectedValueOnce(
      new OpportunityApplicationConflictError(),
    );
    const controller = new OpportunityApplicationController(repository);

    await expect(
      controller.submit(identityRequest(), organizationId, opportunityId, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("fails closed when application persistence is not configured", async () => {
    const controller = new OpportunityApplicationController(null);

    await expect(
      controller.listMine(identityRequest(), {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
