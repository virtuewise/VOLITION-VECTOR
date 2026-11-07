import type {
  ConversationMessageRecord,
  ConversationRecord,
  OpenApplicationConversationInput,
  SendConversationMessageInput,
} from "@volition/database";

export const CONVERSATION_REPOSITORY = Symbol("CONVERSATION_REPOSITORY");

export interface ConversationRepositoryPort {
  openForApplication(
    input: OpenApplicationConversationInput,
  ): Promise<ConversationRecord>;
  sendMessage(
    input: SendConversationMessageInput,
  ): Promise<ConversationMessageRecord>;
  listMine(
    accountId: string,
    limit?: number,
    offset?: number,
  ): Promise<readonly ConversationRecord[]>;
  listMessages(
    accountId: string,
    conversationId: string,
    limit?: number,
    offset?: number,
  ): Promise<readonly ConversationMessageRecord[]>;
}
