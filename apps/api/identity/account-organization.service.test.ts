import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AccountOrganizationSummary } from "@volition/database";
import { AccountOrganizationApplicationService } from "./account-organization.service.js";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

const organizations: readonly AccountOrganizationSummary[] = [
  {
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Example Studio",
    slug: "example-studio",
    role: "owner",
  },
];

describe("AccountOrganizationApplicationService", () => {
  it("lists organizations for the verified account only", async () => {
    const repository = {
      listForAccount: vi.fn().mockResolvedValue(organizations),
    };
    const service = new AccountOrganizationApplicationService(repository);

    await expect(
      service.list({ accountId: ACCOUNT_ID.toUpperCase() }),
    ).resolves.toEqual(organizations);
    expect(repository.listForAccount).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it("rejects an invalid principal before querying persistence", async () => {
    const repository = { listForAccount: vi.fn() };
    const service = new AccountOrganizationApplicationService(repository);

    await expect(
      service.list({ accountId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.listForAccount).not.toHaveBeenCalled();
  });

  it("fails closed when organization discovery is not configured", async () => {
    const service = new AccountOrganizationApplicationService(null);

    await expect(
      service.list({ accountId: ACCOUNT_ID }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
