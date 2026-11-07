import { describe, expect, it } from "vitest";
import { WorkOSAccessTokenVerifier } from "./workos-access-token.verifier.js";

describe("WorkOSAccessTokenVerifier", () => {
  it("remains disabled when no WorkOS API configuration is present", () => {
    const verifier = new WorkOSAccessTokenVerifier({} as NodeJS.ProcessEnv);

    expect(verifier.enabled).toBe(false);
  });

  it("rejects partially configured WorkOS environments", () => {
    expect(
      () =>
        new WorkOSAccessTokenVerifier({
          WORKOS_CLIENT_ID: "client_staging",
        } as NodeJS.ProcessEnv),
    ).toThrow("must be configured together");
  });

  it("rejects a non-HTTPS or non-specific issuer", () => {
    expect(
      () =>
        new WorkOSAccessTokenVerifier({
          WORKOS_API_KEY: "not-a-real-workos-key",
          WORKOS_CLIENT_ID: "client_staging",
          WORKOS_ISSUER: "http://api.workos.com/user_management/client_staging",
        } as NodeJS.ProcessEnv),
    ).toThrow("exact HTTPS User Management issuer");
  });

  it("does not treat a missing bearer token as an authenticated identity", async () => {
    const verifier = new WorkOSAccessTokenVerifier({} as NodeJS.ProcessEnv);

    await expect(verifier.verifyBearerToken(undefined)).resolves.toBeNull();
    await expect(verifier.verifyBearerToken("Basic abc")).resolves.toBeNull();
  });
});
