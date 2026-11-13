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
        sessionId: "session_123",
        tokenId: "token_123",
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

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      accountId: "7f9a6b2c-1111-4111-8111-111111111111",
      sessionId: "session_123",
      tokenId: "token_123",
    });
    expect(identities.resolveActiveAccountId).toHaveBeenCalledWith(
      "https://issuer.example/user_management/client",
      "user_123",
    );
  });

  it("fails closed when WorkOS verification is not configured", async () => {
    const guard = new WorkOSAuthenticationGuard(
      { enabled: false } as WorkOSAccessTokenVerifier,
      {} as WorkOSIdentityResolver,
    );

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rejects missing or invalid bearer tokens", async () => {
    const verifier = {
      enabled: true,
      verifyBearerToken: vi.fn().mockResolvedValue(null),
    } as unknown as WorkOSAccessTokenVerifier;
    const identities = {
      resolveActiveAccountId: vi.fn(),
    } as unknown as WorkOSIdentityResolver;
    const guard = new WorkOSAuthenticationGuard(verifier, identities);

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.resolveActiveAccountId).not.toHaveBeenCalled();
  });

  it("reports a JWKS/network failure as unavailable instead of invalid credentials", async () => {
    const verifier = {
      enabled: true,
      verifyBearerToken: vi.fn().mockRejectedValue(new Error("JWKS offline")),
    } as unknown as WorkOSAccessTokenVerifier;
    const identities = {
      resolveActiveAccountId: vi.fn(),
    } as unknown as WorkOSIdentityResolver;
    const guard = new WorkOSAuthenticationGuard(verifier, identities);

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: "Bearer signed-token" } }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(identities.resolveActiveAccountId).not.toHaveBeenCalled();
  });

  it("rejects identities without an active internal account mapping", async () => {
    const verifier = {
      enabled: true,
      verifyBearerToken: vi.fn().mockResolvedValue({
        subject: "user_123",
        issuer: "https://issuer.example/user_management/client",
        sessionId: "session_123",
        tokenId: "token_123",
        claims: {},
      }),
    } as unknown as WorkOSAccessTokenVerifier;
    const identities = {
      resolveActiveAccountId: vi.fn().mockResolvedValue(null),
    } as unknown as WorkOSIdentityResolver;
    const guard = new WorkOSAuthenticationGuard(verifier, identities);

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: "Bearer signed-token" } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
