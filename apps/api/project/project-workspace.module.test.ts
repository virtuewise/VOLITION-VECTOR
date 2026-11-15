import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { IdentityContextGuard } from "../identity/identity-context.guard.js";
import { WorkOSAuthenticationGuard } from "../identity/workos-authentication.guard.js";
import { ProjectWorkspaceController } from "./project-workspace.controller.js";
import { ProjectWorkspaceModule } from "./project-workspace.module.js";
import { PROJECT_WORKSPACE_REPOSITORY } from "./project-workspace.repository.js";

describe("ProjectWorkspaceModule", () => {
  it("resolves the shared authentication guards and fails closed without a database", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProjectWorkspaceModule],
    }).compile();

    expect(moduleRef.get(ProjectWorkspaceController)).toBeInstanceOf(
      ProjectWorkspaceController,
    );
    expect(
      moduleRef.get(WorkOSAuthenticationGuard, { strict: false }),
    ).toBeInstanceOf(WorkOSAuthenticationGuard);
    expect(
      moduleRef.get(IdentityContextGuard, { strict: false }),
    ).toBeInstanceOf(IdentityContextGuard);
    expect(moduleRef.get(PROJECT_WORKSPACE_REPOSITORY)).toBeNull();

    await moduleRef.close();
  });
});
