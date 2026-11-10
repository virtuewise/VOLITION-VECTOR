import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AccountProfileRecord } from "@volition/database";
import { AccountProfileApplicationService } from "./account-profile.service.js";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const UPDATED_AT = new Date("2026-11-10T08:00:00.000Z");

function profile(): AccountProfileRecord {
  return {
    accountId: ACCOUNT_ID,
    displayName: "Profile Name",
    locale: "en",
    timeZone: "UTC",
    updatedAt: UPDATED_AT,
  };
}

describe("AccountProfileApplicationService", () => {
  it(
    "returns private safe defaults without creating a profile row",
    async () => {
      const repository = {
        getForAccount: vi.fn().mockResolvedValue(null),
        updateForAccount: vi.fn(),
      };
      const service = new AccountProfileApplicationService(repository);

      await expect(service.get({ accountId: ACCOUNT_ID })).resolves.toEqual({
        accountId: ACCOUNT_ID,
        displayName: null,
        locale: "en",
        timeZone: "UTC",
        updatedAt: null,
      });
      expect(repository.getForAccount).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(repository.updateForAccount).not.toHaveBeenCalled();
    },
  );

  it(
    "updates only the authenticated principal's account profile",
    async () => {
      const repository = {
        getForAccount: vi.fn(),
        updateForAccount: vi.fn().mockResolvedValue(profile()),
      };
      const service = new AccountProfileApplicationService(repository);

      await expect(
        service.update(
          { accountId: ACCOUNT_ID },
          { displayName: "New Name" },
        ),
      ).resolves.toEqual(profile());

      expect(repository.updateForAccount).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        displayName: "New Name",
      });
    },
  );

  it("rejects an empty patch", async () => {
    const repository = {
      getForAccount: vi.fn(),
      updateForAccount: vi.fn(),
    };
    const service = new AccountProfileApplicationService(repository);

    await expect(
      service.update({ accountId: ACCOUNT_ID }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateForAccount).not.toHaveBeenCalled();
  });

  it("rejects invalid principal context", async () => {
    const repository = {
      getForAccount: vi.fn(),
      updateForAccount: vi.fn(),
    };
    const service = new AccountProfileApplicationService(repository);

    await expect(
      service.get({ accountId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("fails closed when profile persistence is not configured", async () => {
    const service = new AccountProfileApplicationService(null);

    await expect(
      service.get({ accountId: ACCOUNT_ID }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("maps repository field validation errors to a bad request", async () => {
    const repository = {
      getForAccount: vi.fn(),
      updateForAccount: vi.fn().mockRejectedValue(new TypeError("invalid")),
    };
    const service = new AccountProfileApplicationService(repository);

    await expect(
      service.update({ accountId: ACCOUNT_ID }, { locale: "en_US" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
