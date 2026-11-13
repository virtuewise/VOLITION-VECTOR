import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { isUUID } from "class-validator";
import type { AuthenticatedPrincipal } from "./identity-membership.contracts.js";

/**
 * request.user must be populated by trusted authentication middleware after
 * validating a session/token. This guard validates its shape; it does not
 * authenticate credentials or select an OIDC provider.
 */
export interface IdentityRequest {
  user?: unknown;
  identity?: AuthenticatedPrincipal;
}

function isSessionIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

@Injectable()
export class IdentityContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const user = request.user;

    if (!user || typeof user !== "object") {
      throw new UnauthorizedException(
        "A verified identity context is required.",
      );
    }

    const trustedUser = user as Record<string, unknown>;
    const accountId = trustedUser["accountId"];
    const sessionId = trustedUser["sessionId"];
    const tokenId = trustedUser["tokenId"];
    if (
      typeof accountId !== "string" ||
      !isUUID(accountId) ||
      !isSessionIdentifier(sessionId) ||
      !isSessionIdentifier(tokenId)
    ) {
      throw new UnauthorizedException(
        "A verified identity context is required.",
      );
    }

    request.identity = {
      accountId: accountId.toLowerCase(),
      sessionId,
      tokenId,
    };
    return true;
  }
}

export function requireIdentityPrincipal(
  request: IdentityRequest,
): AuthenticatedPrincipal {
  if (!request.identity) {
    throw new UnauthorizedException("A verified identity context is required.");
  }
  return request.identity;
}
