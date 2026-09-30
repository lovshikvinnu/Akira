/**
 * Historical Recall: read-only keyword search over past conversations.
 *
 * GENESIS reaches raw chat history only through this contract -- never the
 * SQLite tables, never `settings` -- the same way it reaches the workspace
 * through `WorkspaceProvider`. AKIRA OS implements and registers it.
 *
 * What it returns is *evidence*: dated quotations of what was said, kept
 * distinct from GENESIS memory. Retrieving a message does not make it a
 * memory.
 */

export interface HistoricalEvidence {
  conversationId: string;
  messageId: string;
  role: "user" | "akira";
  text: string;
  /** When the message was written (ISO-8601). */
  createdAt: string;
  /** FTS5 bm25 score; lower is more relevant. */
  rank: number;
}

export interface HistoricalSearchRequest {
  /** Content words to match; any one matching is enough (OR). */
  terms: string[];
  limit: number;
  /**
   * The conversation the question is being asked in. Its own messages --
   * including the question itself -- are not history.
   */
  excludeConversationId?: string;
}

export interface HistoricalRecallProvider {
  search(request: HistoricalSearchRequest): Promise<HistoricalEvidence[]>;
}

let activeProvider: HistoricalRecallProvider | null = null;

export function registerHistoricalRecallProvider(provider: HistoricalRecallProvider): void {
  activeProvider = provider;
}

/** The registered provider, or null when none is -- recall then has nothing to search. */
export function getHistoricalRecallProvider(): HistoricalRecallProvider | null {
  return activeProvider;
}
