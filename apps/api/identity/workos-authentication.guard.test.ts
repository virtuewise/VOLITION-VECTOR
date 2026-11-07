import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WorkOSAuthenticationGuard } from "./workos-authentication.guard.js";
import type { WorkOSAccessTokenVerifier } from "./workos-access-token.verifier.js";
import type { WorkOSIdentityResolver } from "./workos-identity.resolver.js";

function contextFor(request: {
  headers: { authorization?: string };
  user?: unknown;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe("WorkOSAuthenticationGuard", () => {
  it("populates request.user only after token verification and active mapping", async () => {
    const verifier = {
      enabled: true,
      verifyBearerToken: vi.fn().mockResolvedValue({
        subject: "user_123",
        issuer: "https://issuer.example/user_management/client",
        claims: {},
      }),
    } as unknown as WorkOSAccessTokenVerifier;
    const identities = {
      resolveActiveAccountId: vi
        .fn()
        .mockResolvedValue("7f9a6b2c-1111-4111-8111-111111111111"),
    } as unknown as WorkOSIdentityResolver;
    const guard = new WorkOSAuthenticationGuard(verifier, identities);
    const request: { headers: { authorization: string }; user?: unknown } = {
      headers: { authorization: "Bearer signed-token" },
    };

    await expect(guard.canAcֻǱ˞