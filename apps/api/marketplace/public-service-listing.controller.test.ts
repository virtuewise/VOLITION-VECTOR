import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ServiceListingInputError } from "@volition/database";
import type { ServiceListingRepositoryPort } from "./service-listing.repository.js";
import { PublicServiceListingController } from "./public-service-listing.controller.js";
import { describe, expect, it, vi } from "vitest";

describe("PublicServiceListingController", () => {
  it("forwards category, delivery and bounded search filters", async () => {
    const repository: ServiceListingRepositoryPort = {
      createDraft: vi.fn(),
      publish: vi.fn(),
      listPublic: vi.fn().mockResolvedValue([]),
    };
    const controller = new PublicServiceListingController(repository);

    await expect(
      controller.list({
        q: "product design",
        category: "consulting",
        deliveryMode: "remote",
        limit: "10",
        offset: "20",
      }),
    ).resolves.toEqual([]);

    expect(repository.listPublic).toHaveBeenCalledWith({
      query: "product design",
      category: "consulting",
      deliveryMode: "remote",
      limit: 10,
      offset: 20,
    });
  });

  it("rejects unknown, repeated and malformed query parameters", async () => {
    const repository: ServiceListingRepositoryPort = {
      createDraft: vi.fn(),
      publish: vi.fn(),
      listPublic: vi.fn().mockResolvedValue([]),
    };
    const controller = new PublicServiceListingController(repository);

    await expect(
      controller.list({ unexpected: "value" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.list({ limit: "10items" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.list({
        category: ["consulting", "design"] as unknown as string,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps invalid repository filters to HTTP 400", async () => {
    const repository: ServiceListingRepositoryPort = {
      createDraft: vi.fn(),
      publish: vi.fn(),
      listPublic: vi
        .fn()
        .mockRejectedValue(
          new ServiceListingInputError("Invalid service search."),
        ),
    };
    const controller = new PublicServiceListingController(repository);

    await expect(
      controller.list({ deliveryMode: "unknown" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("fails closed when service persistence is not configured", async () => {
    const controller = new PublicServiceListingController(null);

    await expect(controller.list({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
