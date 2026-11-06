import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpportunityInputError } from "@volition/database";
import type { OpportunityRepositoryPort } from "./opportunity.repository.js";
import { PublicOpportunityController } from "./public-opportunity.controller.js";
import { describe, expect, it, vi } from "vitest";

describe("PublicOpportunityController", () => {
  it("validates query keys and forwards bounded search parameters", async () => {
    const repository: OpportunityRepositoryPort = {
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      publish: vi.fn(),
      pause: vi.fn(),
      close: vi.fn(),
      archive: vi.fn(),
      listPublic: vi.fn().mockResolvedValue([]),
    };
    const controller = new PublicOpportunityController(repository);

    await expect(
      controller.list({
        q: "software engineer",
        type: "employment",
        limit: "10",
        offset: "20",
      }),
    ).resolves.toEqual([]);

    expect(repository.listPublic).toHaveBeenCalledWith({
      query: "software engineer",
      opportunityType: "employment",
      limit: 10,
      offset: 20,
    });
  });

  it("rejects unknown and malformed query parameters", async () => {
    const repository: OpportunityRepositoryPort = {
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      publish: vi.fn(),
      pause: vi.fn(),
      close: vi.fn(),
      archive: vi.fn(),
      listPublic: vi.fn().mockResolvedValue([]),
    };
    const controller = new PublicOpportunityController(repository);

    await expect(
      controller.list({ unexpected: "value" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.list({ limit: "10items" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("maps repository search validation to HTTP 400", async () => {
    const repository: OpportunityRepositoryPort = {
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      publish: vi.fn(),
      pause: vi.fn(),
      close: vi.fn(),
      archive: vi.fn(),
      listPublic: vi
        .fn()
        .mockRejectedValue(
          new OpportunityInputError("Invalid opportunity type."),
        ),
    };
    const controller = new PublicOpportunityController(repository);

    await expect(controller.list({ type: "unknown" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("fails closed with HTTP 503 when persistence is not configured", async () => {
    const controller = new PublicOpportunityController(null);

    await expect(controller.list({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
