import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import { TrustEvidenceApplicationService } from "./trust-evidence.service.js";
import { TrustEvidenceController } from "./trust-evidence.controller.js";

const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

function identityRequest(): IdentityRequest {
  return { identity: { accountId: ACCOUNT_ID } };
}

function createService() {
  return {
    list: vi.fn().mockResolvedValue([]),
  } as unknown as TrustEvidenceApplicationService;
}

describe("TrustEvidenceController", () => {
  it("lists evidence for the verified account with bounded pagination", async () => {
    const service = createService();
    const controller = new TrustEvidenceController(service);

    await expect(
      controller.list(identityRequest(), { limit: "10", offset: "20" }),
    ).resolves.toEqual([]);

    expect(service.list).toHaveBeenCalledWith(
      { accountId: ACCOUNT_ID },
      10,
      20,
    );
  });

  it("uses safe defaults", async () => {
    const service = createService();
    const controller = new TrustEvidenceController(service);

    await controller.list(identityRequest(), {});

    expect(service.list).toHaveBeenCalledWith({ accountId: ACCOUNT_ID }, 20, 0);
  });

  it("rejects unknown, repeated and malformed query parameters", async () => {
    const service = createService();
    const controller = new TrustEvidenceController(service);

    expect(() =>
      controller.list(identityRequest(), {
        accountId: "55555555-5555-4555-8555-555555555555",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.list(identityRequest(), { limit: ["10", "20"] }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.list(identityRequest(), { limit: "10items" }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.list(identityRequest(), { offset: "10001" }),
    ).toThrow(BadRequestException);

    expect(service.list).not.toHaveBeenCalled();
  });
});
