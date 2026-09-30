import type { ChatConversation, ChatMessage } from "../../shared/types/store-types";

export interface ConversationRepository {
  /** Writes the archive blob and its table mirror in one transaction. */
  save(conversations: ChatConversation[]): void;
  /** Re-derives the tables from the stored archive; run at startup. */
  syncFromArchive(): void;
  /** One conversation's messages, in the order they were written. */
  getMessages(conversationId: string): ChatMessage[];
}
