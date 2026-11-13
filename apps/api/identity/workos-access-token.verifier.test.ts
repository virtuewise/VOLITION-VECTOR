import { describe, expect, it, vi } from "vitest";
import { WorkOSAccessTokenVerifier } from "./workos-access-token.verifier.js";

const CLIENT_ID = "client_staging";
const ISSUER = `https://api.workos.com/user_management/${CLIENT_ID}`;
const AUDIENCE = "https://api.staging.volition-vector.example";

function environment(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    WORKOS_CLIENT_ID: CLIENT_ID,
    WORKOS_ISSUER: ISSUER,
    WORKOS_TOKEN_AUDIENCE: AUDIENCE,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function validUserClaims(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "user_123",
    iss: ISSUER,
    aud: AUDIENCE,
    sid: "session_123",
    jti: "token_123",
    exp: now + 300,
    iat: now - 30,
    ...overrides,
  };
}

function verifierFor(
  claims: Record<string, unknown> | null,
  env = environment(),
) {
  const verifyAccessToken = vi.fn().mockResolvedValue(claims);
  const createClient = vi.fn(() => ({
    userManagement: { verifyAccessToken },
  }));
  const verifier = new WorkOSAccessTokenVerifier(env, createClient);

  return { verifier, createClient, verifyAccessToken };
}

describe("WorkOSAccessTokenVerifier", () => {
  it("remains disabled when no WorkOS API configuration is present", () => {
    const createClient = vi.fn();
    const verifier = new WorkOSAccessTokenVerifier(
      {} as NodeJS.ProcessEnv,
      createClient,
    );

    expect(verifier.enabled).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects partial configuration, including a missing API audience", () => {
    expect(
      () =>
        new WorkOSAccessTokenVerifier({
          WORKOS_CLIENT_ID: CLIENT_ID,
          WORKOS_ISSUER: ISSUER,
        } as NodeJS.ProcessEnv),
    ).toThrow("WorkOS client ID, issuer, and API audience");

    expect(
      () =>
        new WorkOSAccessTokenVerifier({
          WORKOS_CLIENT_ID: CLIENT_ID,
          WORKOS_TOKEN_AUDIENCE: AUDIENCE,
        } as NodeJS.ProcessEnv),
    ).toThrow("must be configured together");
  });

  it("rejects a non-HTTPS or non-specific issuer", () => {
    expect(
      () =>
        new WorkOSAccessTokenVerifier(
          environment({
            WORKOS_ISSUER: `http://api.workos.com/user_management/${CLIENT_ID}`,
          }),
        ),
    ).toThrow("exact HTTPS User Management issuer");
  });

  it("rejects an audience value with surrounding whitespace", () => {
    expect(
      () =>
        new WorkOSAccessTokenVerifier(
          environment({ WORKOS_TOKEN_AUDIENCE: ` ${AUDIENCE}` }),
        ),
    ).toThrow("non-empty exact audience value");
  });

  it("verifies the token before accepting an exact API audience", async () => {
    const { verifier, createClient, verifyAccessToken } = verifierFor(
      validUserClaims(),
    );

    await expect(
      verifier.verifyBearerToken("Bearer signed-token"),
    ).resolves.toMatchObject({
      subject: "user_123",
      issuer: ISSUER,
      sessionId: "session_123",
      tokenId: "token_123",
    });
    expect(createClient).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      issuer: ISSUER,
    });
    expect(verifyAccessToken).toHaveBeenCalledWith("signed-token");
  });

  it("accepts a standards-compliant audience array containing the API", async () => {
    const { verifier } = verifierFor(
      validUserClaims({
        aud: ["https://another-api.example", AUDIENCE],
      }),
    );

    await expect(
      verifier.verifyBearerToken("Bearer signed-token"),
    ).resolves.toMatchObject({ subject: "user_123" });
  });

  it.each([
    validUserClaims({ sub: "" }),
    validUserClaims({ iss: "https://other-issuer.example" }),
    validUserClaims({ aud: "https://other-api.example" }),
    validUserClaims({ sub: undefined }),
  ])(
    "rejects a token without the required user, issuer or audience claims",
    async (claims) => {
      const { verifier } = verifierFor(claims);

      await expect(
        verifier.verifyBearerToken("Bearer signed-token"),
      ).resolves.toBeNull();
    },
  );

  const invalidUserSessionCases: Array<{
    name: string;
    overrides: Record<string, unknown>;
  }> = [
    { name: "missing session ID", overrides: { sid: undefined } },
    { name: "empty session ID", overrides: { sid: " " } },
    { name: "missing token ID", overrides: { jti: undefined } },
    { name: "missing expiry", overrides: { exp: undefined } },
    { name: "missing issue time", overrides: { iat: undefined } },
    {
      name: "expired token",
      overrides: { exp: Math.floor(Date.now() / 1000) - 1 },
    },
    {
      name: "expiry before issue time",
      overrides: { exp: Math.floor(Date.now() / 1000) - 60 },
    },
    {
      name: "future issue time",
      overrides: { iat: Math.floor(Date.now() / 1000) + 31 },
    },
    {
      name: "future not-before time",
      overrides: { nbf: Math.floor(Date.now() / 1000) + 31 },
    },
    { name: "agent token profile", overrides: { sub_profile: "ai_agent" } },
    { name: "unknown token profile", overrides: { sub_profile: "service" } },
  ];

  it.each(invalidUserSessionCases)(
    "rejects invalid user-session metadata: $name",
    async ({ overrides }) => {
      const { verifier } = verifierFor(validUserClaims(overrides));

      await expect(
        verifier.verifyBearerToken("Bearer signed-token"),
      ).resolves.toBeNull();
    },
  );

  it("accepts the documented explicit user token profile", async () => {
    const { verifier } = verifierFor(validUserClaims({ sub_profile: "user" }));

    await expect(
      verifier.verifyBearerToken("Bearer signed-token"),
    ).resolves.toMatchObject({ subject: "user_123" });
  });

  it("does not treat missing or non-bearer credentials as an identity", async () => {
    const { verifier, verifyAccessToken } = verifierFor(null);

    await expect(verifier.verifyBearerToken(undefined)).resolves.toBeNull();
    await expect(verifier.verifyBearerToken("Basic abc")).resolves.toBeNull();
    await expect(verifier.verifyBearerToken("Bearer ")).resolves.toBeNull();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("rejects oversized bearer credentials before verification", async () => {
    const { verifier, verifyAccessToken } = verifierFor(null);

    await expect(
      verifier.verifyBearerToken(`Bearer ${"a".repeat(16_385)}`),
    ).resolves.toBeNull();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });
});
