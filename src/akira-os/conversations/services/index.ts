import type { ChatConversation } from "../../../shared/types/store-types";
import { persistSaveConversations } from "../server";

export const conversationsService = {
  /**
   * The only write path for the chat archive. Writes the `settings` blob the
   * chat UI reads and its `conversations` / `chat_messages` mirror together,
   * so the two cannot drift. Reads stay on the blob.
   */
  async save(conversations: ChatConversation[]): Promise<void> {
    await persistSaveConversations({ data: conversations });
  },
};
