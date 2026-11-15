import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ProjectWorkspaceInputError } from "@volition/database";
import type {
  ProjectMilestoneRecord,
  ProjectWorkspaceRecord,
} from "@volition/database";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import type { ProjectWorkspaceRepositoryPort } from "./project-workspace.repository.js";
import { ProjectWorkspaceController } from "./project-workspace.controller.js";
import { describe, expect, it, vi } from "vitest";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const participantAccountId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const project: ProjectWorkspaceRecord = {
  id: projectId,
  organizationId,
  opportunityApplicationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  opportunityId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  clientAccountId: participantAccountId,
  providerAccountId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  title: "Website redesign",
  description: "A scoped website redesign project.",
  status: "active",
  startsAt: null,
  targetCompletionAt: null,
  completedAt: null,
  createdAt: new Date("2026-11-06T10:00:00.000Z"),
  updatedAt: new Date("2026-11-06T11:00:00.000Z"),
};

const milestone: ProjectMilestoneRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId,
  projectId,
  title: "Approved design",
  description: "Submit the approved design files.",
  sequenceNumber: 1,
  status: "pending",
  dueAt: null,
  submittedAt: null,
  acceptedAt: null,
  acceptedByAccountId: null,
  createdAt: new Date("2026-11-06T10:00:00.000Z"),
  updatedAt: new Date("2026-11-06T10:00:00.000Z"),
};

function createRepository(): ProjectWorkspaceRepositoryPort {
  return {
    listForParticipant: vi.fn().mockResolvedValue([project]),
    getForParticipant: vi.fn().mockResolvedValue(project),
    listMilestonesForParticipant: vi.fn().mockResolvedValue([milestone]),
  };
}

function identityRequest(accountId = participantAccountId): IdentityRequest {
  return { identity: { accountId } };
}

describe("ProjectWorkspaceController", () => {
  it("lists projects using only the verified participant account", async () => {
    const repository = createRepository();
    const controller = new ProjectWorkspaceController(repository);

    await expect(
      controller.list(identityRequest(), organizationId, {
        limit: "10",
        offset: "20",
      }),
    ).resolves.toEqual([project]);

    expect(repository.listForParticipant).toHaveBeenCalledWith(
      organizationId,
      participantAccountId,
      10,
      20,
    );
  });

  it("rejects caller-selected account identifiers and malformed pagination", async () => {
    const controller = new ProjectWorkspaceController(createRepository());

    await expect(
      controller.list(identityRequest(), organizationId, {
        accountId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.list(identityRequest(), organizationId, { limit: "10items" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps repository pagination validation to HTTP 400", async () => {
    const repository = createRepository();
    vi.mocked(repository.listForParticipant).mockRejectedValueOnce(
      new ProjectWorkspaceInputError(
        "Project workspace pagination parameters are invalid.",
      ),
    );
    const controller = new ProjectWorkspaceController(repository);

    await expect(
      controller.list(identityRequest(), organizationId, { limit: "0" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns a project only when the verified account is a named participant", async () => {
    const repository = createRepository();
    const controller = new ProjectWorkspaceController(repository);

    await expect(
      controller.get(identityRequest(), organizationId, projectId),
    ).resolves.toEqual(project);

    expect(repository.getForParticipant).toHaveBeenCalledWith(
      organizationId,
      projectId,
      participantAccountId,
    );
  });

  it("does not distinguish a missing project from a non-participant", async () => {
    const repository = createRepository();
    vi.mocked(repository.getForParticipant).mockResolvedValueOnce(null);
    const controller = new ProjectWorkspaceController(repository);

    await expect(
      controller.get(identityRequest(), organizationId, projectId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("checks project participation before listing bounded milestones", async () => {
    const repository = createRepository();
    const controller = new ProjectWorkspaceController(repository);

    await expect(
      controller.listMilestones(identityRequest(), organizationId, projectId, {
        limit: "5",
        offset: "10",
      }),
    ).resolves.toEqual([milestone]);

    expect(repository.getForParticipant).toHaveBeenCalledWith(
      organizationId,
      projectId,
      participantAccountId,
    );
    expect(repository.listMilestonesForParticipant).toHaveBeenCalledWith(
      organizationId,
      projectId,
      participantAccountId,
      5,
      10,
    );
  });

  it("does not query milestones for a missing or non-participant project", async () => {
    const repository = createRepository();
    vi.mocked(repository.getForParticipant).mockResolvedValueOnce(null);
    const controller = new ProjectWorkspaceController(repository);

    await expect(
      controller.listMilestones(
        identityRequest(),
        organizationId,
        projectId,
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.listMilestonesForParticipant).not.toHaveBeenCalled();
  });

  it("fails closed when project persistence is not configured", async () => {
    const controller = new ProjectWorkspaceController(null);

    await expect(
      controller.list(identityRequest(), organizationId, {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
