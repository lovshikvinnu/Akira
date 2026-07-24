import { createServerFn } from "@tanstack/react-start";
import { SearchRequest, SearchResult } from "../../../contracts/search";
import type { SearchHistoryEntry } from "../../../contracts/repositories/SearchHistoryRepository";

export const persistRunSearch = createServerFn({ method: "POST" })
  .validator((request: SearchRequest) => request)
  .handler(async ({ data: request }): Promise<SearchResult[]> => {
    const { searchRepository } = await import("../../../persistence/repositories");
    return searchRepository.search(request);
  });

export const persistGetSearchHistory = createServerFn({ method: "GET" })
  .validator((limit: number) => limit)
  .handler(async ({ data: limit }): Promise<SearchHistoryEntry[]> => {
    const { searchHistoryRepository } = await import("../../../persistence/repositories");
    return searchHistoryRepository.getRecent(limit);
  });

export const persistDeleteSearchHistory = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<void> => {
    const { searchHistoryRepository } = await import("../../../persistence/repositories");
    searchHistoryRepository.delete(id);
  });

export const persistClearSearchHistory = createServerFn({ method: "POST" })
  .validator(() => {})
  .handler(async (): Promise<void> => {
    const { searchHistoryRepository } = await import("../../../persistence/repositories");
    searchHistoryRepository.clearAll();
  });
