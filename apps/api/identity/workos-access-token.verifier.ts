import { WorkOS } from "@workos-inc/node";

export interface VerifiedWorkOSIdentity {
  subject: string;
  issuer: string;
  claims: Record<string, unknown>;
}

/**
 * Verifies WorkOS user access tokens only. It deliberately does not translate
 * a WorkOS subject into an internal account ID or grant application access.
 * That mapping requires an explicit, unique, active internal identity record.
 */
export class WorkOSAccessTokenVerifier {
  private readonly client: WorkOS | null;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    const apiKey = environment["WORKOS_API_KEY"];
    const clientId = environment["WORKOS_CLIENT_ID"];
    const issuer = environment["WORKOS_ISSUER"];

    if (!apiKey && !clientId && !issuer) {
      this.client = null;
      return;
    }

    if (!apiKey || !clientId || !issuer) {
      throw new Error(
        "WorkOS API key, client ID, and exact token issuer must be configured together.",
      );
    }

    const parsedIssuer = new URL(issuer);
    if (parsedIssuer.protocol !== "https:" || parsedIssuer.pathname === "/") {
      throw new Error(
        "WORKOS_ISSUER must be the exact HTTPS User Management issuer.",
      );
    }

    this.client = new WorkOS(apiKey, { clientId, issuer });
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async verifyBearerToken(
    authorization: string | undefined,
  ): Promise<VerifiedWorkOSIdentity | null> {
    if (!this.client || !authorization?.startsWith("Bearer ")) {
      return null;
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (!token || token.length > 16_384) {
      return null;
    }

    const claims = await this.client.userManagement.verifyAccessToken(token);
    if (
      !claims ||
      typeof claims.sub !== "string" ||
      typeof claims.iss !== "string"
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
