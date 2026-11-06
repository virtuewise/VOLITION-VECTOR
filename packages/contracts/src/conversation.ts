export type ConversationId = string & {
  readonly __brand: "ConversationId";
};

export type ConversationStatus = "open" | "closed";
export type ConversationParticipantType = "applicant" | "organization";

export interface Conversation {
  readonly id: ConversationId;
  readonly organizationId: string;
  readonly opportunityApplicationId: string;
  readonly createdByAccountId: string;
  readonly status: ConversationStatus;
  readonly createdAt: Date;
}

export interface ConversationParticipant {
  readonly conversationId: ConversationId;
  readonly accountId: string;
  readonly participantType: ConversationParticipantType;
  readonly joinedAt: Date;
  readonly lastReadAt: Date | null;
}

export interface ConversationMessage {
  readonly id: string;
  readonly organizationId: string;
  readonly conversationId: ConversationId;
  readonly senderAccountId: string;
  readonly body: string;
  readonly createdAt: Date;
}

export interface OpenApplicationConversation {
  readonly organizationId: string;
  readonly opportunityApplicationId: string;
  readonly organizationAccountId: string;
}

export interface SendConversationMessage {
  readonly organizationId: string;
  readonly conversationId: string;
  readonly senderAccountId: string;
  readonly body: string;
}
