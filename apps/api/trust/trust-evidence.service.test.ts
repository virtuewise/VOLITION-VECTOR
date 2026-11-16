import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { TrustEvidenceInputError } from "@volition/database";
import type { TrustEvidenceRecord } from "@volition/database";
import { describe, expect, it, vi } from "vitest";
import { TrustEvidenceApplicationService } from "./trust-evidence.service.js";

const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const records: readonly TrustEvidenceRecord[] = [
  {
    id: "99999999-9999-4999-8999-999999999991",
    claimType: "qualification",
    claimTitle: "Candidate qualification",
    issuerName: "Example Institute",
    issuerReference: null,
    status: "submitted",
    submittedAt: new Date("2026-11-06T09:00:00.000Z"),
    reviewedAt: null,
    decisions: [],
  },
];

describe("TrustEvidenceApplicationService", () => {
  it("lists evidence for the verified account only", async () => {
    const repository = {
      listForAccount: vi.fn().mockResolvedValue(records),
    };
    const service = new TrustEvidenceApplicationService(repository);

    await expect(
      service.list({ accountId: ACCOUNT_ID.toUpperCase() }, 20, 0),
    ).resolves.toEqual(records);
    expect(repository.listForAccount).toHaveBeenCalledWith(ACCOUNT_ID, 20, 0);
  });

  it("rejects an invalid principal before querying persistence", async () => {
    const repository = { listForAccount: vi.fn() };
    const service = new TrustEvidenceApplicationService(repository);

    await expect(
      service.list({ accountId: "not-a-uuid" }, 20, 0),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.listForAccount).not.toHaveBeenCalled();
  });

  it("fails closed when persistence is not configured", async () => {
    const service = new TrustEvidenceApplicationService(null);

    await expect(
      service.list({ accountId: ACCOUNT_ID }, 20, 0),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("maps repository pagination errors to HTTP 400", async () => {
    const repository = {
      listForAccount: vi
        .fn()
        .mockRejectedValue(
          new TrustEvidenceInputError("Trust evidence pagination is invalid."),
        ),
    };
    const service = new TrustEvidenceApplicationService(repository);

    await expect(
      service.list({ accountId: ACCOUNT_ID }, 51, 0),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
