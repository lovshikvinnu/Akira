import { createServerFn } from "@tanstack/react-start";
import type { ChatConversation } from "../../../shared/types/store-types";
import type {
  HistoricalEvidence,
  HistoricalSearchRequest,
} from "../../../contracts/historical-recall";

export const persistSaveConversations = createServerFn({ method: "POST" })
  .validator((conversations: ChatConversation[]) => conversations)
  .handler(async ({ data: conversations }) => {
    const { conversationRepository } = await import("../../../persistence/repositories");
    conversationRepository.save(conversations);
  });

export const querySearchMessages = createServerFn({ method: "POST" })
  .validator((request: HistoricalSearchRequest) => request)
  .handler(async ({ data: request }): Promise<HistoricalEvidence[]> => {
    const { conversationRepository } = await import("../../../persistence/repositories");
    return conversationRepository.searchMessages(request);
  });
