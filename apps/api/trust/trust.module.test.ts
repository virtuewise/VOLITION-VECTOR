import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { IdentityContextGuard } from "../identity/identity-context.guard.js";
import { WorkOSAuthenticationGuard } from "../identity/workos-authentication.guard.js";
import { TrustEvidenceController } from "./trust-evidence.controller.js";
import { TRUST_EVIDENCE_REPOSITORY } from "./trust-evidence.repository.js";
import { TrustModule } from "./trust.module.js";

describe("TrustModule", () => {
  it("is registered by the API root module", () => {
    const imports = Reflect.getMetadata("imports", AppModule) as unknown[];
    expect(imports).toContain(TrustModule);
  });

  it("resolves shared authentication guards and fails closed without a database", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TrustModule],
    }).compile();

    expect(moduleRef.get(TrustEvidenceController)).toBeInstanceOf(
      TrustEvidenceController,
    );
    expect(
      moduleRef.get(WorkOSAuthenticationGuard, { strict: false }),
    ).toBeInstanceOf(WorkOSAuthenticationGuard);
    expect(
      moduleRef.get(IdentityContextGuard, { strict: false }),
    ).toBeInstanceOf(IdentityContextGuard);
    expect(moduleRef.get(TRUST_EVIDENCE_REPOSITORY)).toBeNull();

    await moduleRef.close();
  });
});
