import { WorkOS } from "@workos-inc/node";

interface WorkOSAccessTokenClaims extends Record<string, unknown> {
  readonly sub: string;
  readonly iss: string;
}

interface WorkOSVerificationClient {
  readonly userManagement: {
    verifyAccessToken(
      token: string,
    ): Promise<WorkOSAccessTokenClaims | null>;
  };
}

type WorkOSClientFactory = (options: {
  clientId: string;
  issuer: string;
}) => WorkOSVerificationClient;

export interface VerifiedWorkOSIdentity {
  subject: string;
  issuer: string;
  claims: Record<string, unknown>;
}

/**
 * Require the API's exact resource audience. WorkOS verifies the token
 * signature, expiry, issuer and user-token profile; audience is an explicit
 * application policy because AuthKit session tokens do not include it by
 * default.
 */
export function hasExpectedWorkOSAudience(
  claims: Record<string, unknown>,
  expectedAudience: string,
): boolean {
  const audience = claims["aud"];

  return (
    audience === expectedAudience ||
    (Array.isArray(audience) &&
      audience.some((value) => value === expectedAudience))
  );
}

/**
 * Verifies WorkOS user access tokens only. It deliberately does not translate
 * a WorkOS subject into an internal account ID or grant application access.
 * That mapping requires an explicit, unique, active internal identity record.
 *
 * No WorkOS API key is required for local JWKS verification. The expected API
 * audience must be configured in the WorkOS JWT template and this service.
 */
export class WorkOSAccessTokenVerifier {
  private readonly client: WorkOSVerificationClient | null;
  private readonly expectedIssuer: string | null;
  private readonly expectedAudience: string | null;

  constructor(
    environment: NodeJS.ProcessEnv = process.env,
    createClient: WorkOSClientFactory = (options) => new WorkOS(options),
  ) {
    const clientId = environment["WORKOS_CLIENT_ID"];
    const issuer = environment["WORKOS_ISSUER"];
    const audience = environment["WORKOS_TOKEN_AUDIENCE"];

    if (!clientId && !issuer && !audience) {
      this.client = null;
      this.expectedIssuer = null;
      this.expectedAudience = null;
      return;
    }

    if (!clientId || !issuer || !audience) {
      throw new Error(
        "WorkOS client ID, issuer, and API audience must be configured together.",
      );
    }

    let parsedIssuer: URL;
    try {
      parsedIssuer = new URL(issuer);
    } catch {
      throw new Error(
        "WORKOS_ISSUER must be the exact HTTPS User Management issuer.",
      );
    }

    if (
      parsedIssuer.protocol !== "https:" ||
      parsedIssuer.pathname === "/" ||
      parsedIssuer.search.length > 0 ||
      parsedIssuer.hash.length > 0 ||
      parsedIssuer.username.length > 0 ||
      parsedIssuer.password.length > 0
    ) {
      throw new Error(
        "WORKOS_ISSUER must be the exact HTTPS User Management issuer.",
      );
    }

    if (audience.trim() !== audience || audience.length === 0) {
      throw new Error(
        "WORKOS_TOKEN_AUDIENCE must be a non-empty exact audience value.",
      );
    }

    this.client = createClient({ clientId, issuer });
    this.expectedIssuer = issuer;
    this.expectedAudience = audience;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async verifyBearerToken(
    authorization: string | undefined,
  ): Promise<VerifiedWorkOSIdentity | null> {
    if (!this.client || !this.expectedIssuer || !this.expectedAudience) {
      return null;
    }

    const match = /^Bearer\\s+(\\S+)$/i.exec(authorization ?? "");
    const token = match?.[1];

    if (!token || token.length > 16_384) {
      return null;
    }

    const claims = await this.client.userManagement.verifyAccessToken(token);
    if (
      !claims ||
      typeof claims.sub !== "string" ||
      claims.iss !== this.expectedIssuer ||
      !hasExpectedWorkOSAudience(claims, this.expectedAudience)
    ) {
      return null;
    }

    return {
      subject: claims.sub,
      issuer: claims.iss,
      claims: claims as unknown as Record<string, unknown>,
    };
  }
}
