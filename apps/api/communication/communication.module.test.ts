import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { IdentityContextGuard } from "../identity/identity-context.guard.js";
import { WorkOSAuthenticationGuard } from "../identity/workos-authentication.guard.js";
import { CommunicationModule } from "./communication.module.js";
import { ConversationController } from "./conversation.controller.js";
import { CONVERSATION_REPOSITORY } from "./conversation.repository.js";

describe("CommunicationModule", () => {
  it("resolves the shared authentication guards and fails closed without a database", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommunicationModule],
    }).compile();

    expect(moduleRef.get(ConversationController)).toBeInstanceOf(
      ConversationController,
    );
    expect(
      moduleRef.get(WorkOSAuthenticationGuard, { strict: false }),
    ).toBeInstanceOf(WorkOSAuthenticationGuard);
    expect(
      moduleRef.get(IdentityContextGuard, { strict: false }),
    ).toBeInstanceOf(IdentityContextGuard);
    expect(moduleRef.get(CONVERSATION_REPOSITORY)).toBeNull();

    await moduleRef.close();
  });
});
