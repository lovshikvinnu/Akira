import { createServerFn } from "@tanstack/react-start";
import type { ChatConversation } from "../../../shared/types/store-types";

export const persistSaveConversations = createServerFn({ method: "POST" })
  .validator((conversations: ChatConversation[]) => conversations)
  .handler(async ({ data: conversations }) => {
    const { conversationRepository } = await import("../../../persistence/repositories");
    conversationRepository.save(conversations);
  });
