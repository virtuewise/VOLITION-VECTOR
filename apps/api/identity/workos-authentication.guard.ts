import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { WorkOSAccessTokenVerifier } from "./workos-access-token.verifier.js";
import { WorkOSIdentityResolver } from "./workos-identity.resolver.js";
import type { IdentityRequest } from "./identity-context.guard.js";

interface AuthenticatedHttpRequest extends IdentityRequest {
  readonly headers: {
    readonly authorization?: string;
  };
}

/**
 * Verifies the WorkOS access token, then resolves its issuer/subject to an
 * active internal account. It never trusts client-supplied account or org IDs.
 */
@Injectable()
export class WorkOSAuthenticationGuard implements CanActivate {
  constructor(
    private readonly verifier: WorkOSAccessTokenVerifier,
    private readonly identities: WorkOSIdentityResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.verifier.enabled) {
      throw new ServiceUnavailableException(
        "WorkOS API authentication is not configured.",
      );
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedHttpRequest>();
    let verified: Awaited<
      ReturnType<WorkOSAccessTokenVerifier["verifyBearerToken"]>
    >;

    try {
      verified = await this.verifier.verifyBearerToken(
        request.headers.authorization,
      );
    } catch {
      // Do not expose JWKS, signature, issuer or token parsing details.
      throw new UnauthorizedException(
        "A valid WorkOS access token is required.",
      );
    }

    if (!verified) {
      throw new UnauthorizedException(
        "A valid WorkOS access token is required.",
      );
    }

    let accountId: string | null;
    try {
      accountId = await this.identities.resolveActiveAccountId(
        verified.issuer,
        verified.subject,
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) th...[truncated]