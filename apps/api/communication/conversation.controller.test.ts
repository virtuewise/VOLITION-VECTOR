import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConversationInputError } from "@volition/database";
import type {
  ConversationMessageRecord,
  ConversationRecord,
} from "@volition/database";
import type { IdentityRequest } from "../identity/identity-context.guard.js";
import { ConversationController } from "./conversation.controller.js";
import type { ConversationRepositoryPort } from "./conversation.repository.js";
import { describe, expect, it, vi } from "vitest";

const accountId = "11111111-1111-4111-8111-111111111111";
const conversationId = "44444444-4444-4444-8444-444444444444";
const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const timestamp = new Date("2026-11-06T09:00:00.000Z");

const conversation: ConversationRecord = {
  id: conversationId,
  organizationId,
  opportunityApplicationId: "33333333-3333-4333-8333-333333333333",
  createdByAccountId: accountId,
  status: "open",
  createdAt: timestamp,
  lastMessageAt: timestamp,
};

const message: ConversationMessageRecord = {
  id: "55555555-5555-4555-8555-555555555555",
  organizationId,
  conversationId,
  senderAccountId: accountId,
  body: "Thank you for considering my application.",
  createdAt: timestamp,
};

function createRepository(): ConversationRepositoryPort {
  return {
    openForApplication: vi.fn(),
    sendMessage: vi.fn(),
    listMine: vi.fn().mockResolvedValue([conversation]),
    listMessages: vi.fn().mockResolvedValue([message]),
  };
}

function identityRequest(): IdentityRequest {
  return { identity: { accountId } };
}

describe("ConversationController", () => {
  it("lists conversations for the verified account", async () => {
    const repository = createRepository();
    const controller = new ConversationController(repository);

    await expect(
      controller.list(identityRequest(), { limit: "10", offset: "20" }),
    ).resolves.toEqual([conversation]);

    expect(repository.listMine).toHaveBeenCalledWith(accountId, 10, 20);
  });

  it("rejects caller account IDs and malformed pages", async () => {
    const controller = new ConversationController(createRepository());

    await expect(
      controller.list(identityRequest(), {
        accountId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.list(identityRequest(), { limit: "10items" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects repeated query parameters", async () => {
    const repository = createRepository();
    const controller = new ConversationController(repository);

    await expect(
      controller.list(identityRequest(), { limit: ["10", "20"] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.listMine).not.toHaveBeenCalled();
  });

  it("rejects out-of-range pages before persistence", async () => {
    const repository = createRepository();
    const controller = new ConversationController(repository);

    await expect(
      controller.list(identityRequest(), { limit: "51" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listMessages(identityRequest(), conversationId, {
        limit: "101",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listMessages(identityRequest(), conversationId, {
        offset: "10001",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.listMine).not.toHaveBeenCalled();
    expect(repository.listMessages).not.toHaveBeenCalled();
  });

  it("maps repository pagination errors to HTTP 400", async () => {
    const repository = createRepository();
    vi.mocked(repository.listMine).mockRejectedValueOnce(
      new ConversationInputError("Conversation pagination is invalid."),
    );
    const controller = new ConversationController(repository);

    await expect(controller.list(identityRequest(), {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.listMine).toHaveBeenCalledWith(accountId, 20, 0);
  });

  it("lists messages for the verified account", async () => {
    const repository = createRepository();
    const controller = new ConversationController(repository);

    await expect(
      controller.listMessages(identityRequest(), conversationId, {}),
    ).resolves.toEqual([message]);

    expect(repository.listMessages).toHaveBeenCalledWith(
      accountId,
      conversationId,
      50,
      0,
    );
  });

  it("returns no messages for a non-participant", async () => {
    const repository = createRepository();
    vi.mocked(repository.listMessages).mockResolvedValueOnce([]);
    const controller = new ConversationController(repository);

    await expect(
      controller.listMessages(identityRequest(), conversationId, {}),
    ).resolves.toEqual([]);
  });

  it("fails closed when persistence is not configured", async () => {
    const controller = new ConversationController(null);

    await expect(controller.list(identityRequest(), {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
