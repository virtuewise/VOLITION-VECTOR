import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  IdentityContextGuard,
  type IdentityRequest,
} from "./identity-context.guard.js";

const accountId = "11111111-1111-4111-8111-111111111111";

function contextFor(request: IdentityRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("IdentityContextGuard", () => {
  it("rejects requests without upstream verified identity context", () => {
    const guard = new IdentityContextGuard();
    const request: IdentityRequest = {};

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects malformed account identifiers", () => {
    const guard = new IdentityContextGuard();
    const request: IdentityRequest = { user: { accountId: "not-a-uuid" } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects identity context without verified session metadata", () => {
    const guard = new IdentityContextGuard();
    const request: IdentityRequest = { user: { accountId } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });

  it("copies account and session identifiers from trusted request.user", () => {
    const guard = new IdentityContextGuard();
    const request: IdentityRequest = {
      user: {
        accountId: accountId.toUpperCase(),
        sessionId: "session_123",
        tokenId: "token_123",
      },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.identity).toEqual({
      accountId,
      sessionId: "session_123",
      tokenId: "token_123",
    });
  });

  it("rejects malformed session identifiers", () => {
    const guard = new IdentityContextGuard();
    const request: IdentityRequest = {
      user: { accountId, sessionId: " ", tokenId: "token_123" },
    };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });
});
