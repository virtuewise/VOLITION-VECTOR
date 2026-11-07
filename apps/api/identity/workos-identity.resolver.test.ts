import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WorkOSIdentityResolver } from "./workos-identity.resolver.js";
import { PostgresTenantConnectionPool } from "./postgres-tenant-connection.pool.js";

describe("WorkOSIdentityResolver", () => {
  it("resolves only through the issuer and subject mapping", async () => {
    const pool = {
      resolveActiveAccountId: vi
        .fn()
        .mockResolvedValue("7f9a6b2c-1111-4111-8111-111111111111"),
    } as unknown as PostgresTenantConnectionPool;
    const resolver = new WorkOSIdentityResolver(pool);

    await expect(
      resolver.resolveActiveAccountId(
        "https://issuer.example/user_management/client",
        "user_123",
      ),
    ).resolves.toBe("7f9a6b2c-1111-4111-8111-111111111111");
    expect(pool.resolveActiveAccountId).toHaveBeenCalledWith(
      "https://issuer.example/user_management/client",
      "user_123",
    );
  });

  it("fails closed when the database mapping repository is absent", async () => {
    const resolver = new WorkOSIdentityResolver(null);
    await expect(
      resolver.resolveActiveAccountId(
        "https://issuer.example/user_management/client",
        "user_123",
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("does not attempt a lookup for empty external identifiers", async () => {
    const pool = {
      resolveActiveAccountId: vi.fn(),
    } as unknown as PostgresTenantConnectionPool;
    const resolver = new WorkOSIdentityResolver(pool);

    await expect(
      resolver.resolveActiveAccountId("", "user_123"),
    ).resolves.toBeNull();
    expect(pool.resolveActiveAccountId).not.toHaveBeenCalled();
  });
});
