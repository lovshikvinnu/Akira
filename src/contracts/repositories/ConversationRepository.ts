import type { ChatConversation, ChatMessage } from "../../shared/types/store-types";
import type { HistoricalEvidence, HistoricalSearchRequest } from "../historical-recall";

export interface ConversationRepository {
  /** Writes the archive blob and its table mirror in one transaction. */
  save(conversations: ChatConversation[]): void;
  /** Re-derives the tables from the stored archive; run at startup. */
  syncFromArchive(): void;
  /** One conversation's messages, in the order they were written. */
  getMessages(conversationId: string): ChatMessage[];
  /** Keyword search over messages, most relevant first. */
  searchMessages(request: HistoricalSearchRequest): HistoricalEvidence[];
}
