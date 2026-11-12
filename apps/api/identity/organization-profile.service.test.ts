import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  OrganizationProfileApplicationService,
  type OrganizationProfileRepository,
} from "./organization-profile.service.js";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorAccountId = "11111111-1111-4111-8111-111111111111";

const profile = {
  organizationId,
  description: "A research organization",
  websiteUrl: "https://example.test/",
  countryCode: "ZA",
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  updatedAt: new Date("2026-11-12T08:00:00.000Z"),
};

describe("OrganizationProfileApplicationService", () => {
  it("uses the verified principal and canonical organization ID for reads", async () => {
    const getForOrganization = vi.fn().mockResolvedValue(profile);
    const repository: OrganizationProfileRepository = {
      getForOrganization,
      updateForOrganization: vi.fn(),
    };
    const service = new OrganizationProfileApplicationService(repository);

    await expect(
      service.get(
        { accountId: actorAccountId.toUpperCase() },
        organizationId.toUpperCase(),
      ),
    ).resolves.toEqual(profile);
    expect(getForOrganization).toHaveBeenCalledWith({
      organizationId,
      actorAccountId,
    });
  });

  it("rejects malformed identity and organization identifiers before persistence", async () => {
    const repository: OrganizationProfileRepository = {
      getForOrganization: vi.fn(),
      updateForOrganization: vi.fn(),
    };
    const service = new OrganizationProfileApplicationService(repository);

    await expect(
      service.get({ accountId: "not-a-uuid" }, organizationId),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.get({ accountId: actorAccountId }, "not-a-uuid"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getForOrganization).not.toHaveBeenCalled();
  });

  it("does not disclose a missing or unauthorized organization profile", async () => {
    const repository: OrganizationProfileRepository = {
      getForOrganization: vi.fn().mockResolvedValue(null),
      updateForOrganization: vi.fn(),
    };
    const service = new OrganizationProfileApplicationService(repository);

    await expect(
      service.get({ accountId: actorAccountId }, organizationId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects empty patches before persistence", async () => {
    const repository: OrganizationProfileRepository = {
      getForOrganization: vi.fn(),
      updateForOrganization: vi.fn(),
    };
    const service = new OrganizationProfileApplicationService(repository);

    await expect(
      service.update(
        { accountId: actorAccountId },
        organizationId,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateForOrganization).not.toHaveBeenCalled();
  });

  it("maps invalid profile values to a client error", async () => {
    const repository: OrganizationProfileRepository = {
      getForOrganization: vi.fn(),
      updateForOrganization: vi.fn().mockRejectedValue(new TypeError("invalid")),
    };
    const service = new OrganizationProfileApplicationService(repository);

    await expect(
      service.update(
        { accountId: actorAccountId },
        organizationId,
        { websiteUrl: "http://example.test" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("fails closed when persistence is not configured", async () => {
    const service = new OrganizationProfileApplicationService(null);

    await expect(
      service.get({ accountId: actorAccountId }, organizationId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
