import { createServerFn } from "@tanstack/react-start";
import { SearchProvider, SearchRequest, SearchResult } from "../../contracts/search";
import type { SearchHistoryEntry } from "../../contracts/repositories/SearchHistoryRepository";

export const persistRunSearch = createServerFn({ method: "POST" })
  .validator((request: SearchRequest) => request)
  .handler(async ({ data: request }): Promise<SearchResult[]> => {
    const { searchRepository } = await import("../../persistence/repositories");
    return searchRepository.search(request);
  });

export const persistGetSearchHistory = createServerFn({ method: "GET" })
  .validator((limit: number) => limit)
  .handler(async ({ data: limit }): Promise<SearchHistoryEntry[]> => {
    const { searchHistoryRepository } = await import("../../persistence/repositories");
    return searchHistoryRepository.getRecent(limit);
  });

export const persistDeleteSearchHistory = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<void> => {
    const { searchHistoryRepository } = await import("../../persistence/repositories");
    searchHistoryRepository.delete(id);
  });

export const persistClearSearchHistory = createServerFn({ method: "POST" })
  .validator(() => {})
  .handler(async (): Promise<void> => {
    const { searchHistoryRepository } = await import("../../persistence/repositories");
    searchHistoryRepository.clearAll();
  });

interface CacheEntry {
  results: SearchResult[];
  timestamp: number;
}

class SearchManager {
  private providers = new Map<string, SearchProvider>();
  private cache = new Map<string, CacheEntry>();

  // Configurable cache parameters
  public cacheTTL = 5000; // in milliseconds (5 seconds default)
  public maxCacheSize = 50; // max number of cache entries (LRU)

  constructor() {
    // Register the primary SQLite search provider on initialization
    this.registerProvider({
      name: "sqlite-fts",
      search: async (request: SearchRequest): Promise<SearchResult[]> => {
        if (typeof window === "undefined") {
          const { searchRepository } = await import("../../persistence/repositories");
          return searchRepository.search(request);
        }
        return persistRunSearch({ data: request });
      },
    });
  }

  registerProvider(provider: SearchProvider): void {
    this.providers.set(provider.name, provider);
  }

  unregisterProvider(name: string): void {
    this.providers.delete(name);
  }

  async search(request: SearchRequest): Promise<SearchResult[]> {
    const cacheKey = this.generateCacheKey(request);

    // 1. Check in-memory query cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const elapsed = Date.now() - cached.timestamp;
      if (elapsed < this.cacheTTL) {
        return cached.results;
      }
      this.cache.delete(cacheKey); // Evict expired entry
    }

    // 2. Fetch from registered providers
    const promises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        return await provider.search(request);
      } catch (error) {
        console.error(`Search provider "${provider.name}" failed:`, error);
        return [];
      }
    });

    const resultsArray = await Promise.all(promises);
    const results = resultsArray.flat().sort((a, b) => b.score - a.score);

    // 3. Cache the query result
    if (this.maxCacheSize > 0) {
      if (this.cache.size >= this.maxCacheSize) {
        // Evict oldest entry (LRU simple order)
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }
      this.cache.set(cacheKey, {
        results,
        timestamp: Date.now(),
      });
    }

    // 4. Centrally log search query history on the server side
    if (typeof window === "undefined") {
      const queryTerm = request.query.trim();
      if (queryTerm.length > 1) {
        try {
          const { searchHistoryRepository } = await import("../../persistence/repositories");
          searchHistoryRepository.add(queryTerm, results.length);
        } catch (err) {
          console.error("Failed to log search query to history:", err);
        }
      }
    }

    return results;
  }

  private generateCacheKey(request: SearchRequest): string {
    const scopeStr = request.scope ? [...request.scope].sort().join(",") : "all";
    return `${request.query.trim().toLowerCase()}|${scopeStr}|${request.limit || 50}`;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const searchService = new SearchManager();

export const searchHistoryService = {
  async getRecent(limit: number): Promise<SearchHistoryEntry[]> {
    if (typeof window === "undefined") {
      const { searchHistoryRepository } = await import("../../persistence/repositories");
      return searchHistoryRepository.getRecent(limit);
    }
    return persistGetSearchHistory({ data: limit });
  },
  async delete(id: string): Promise<void> {
    if (typeof window === "undefined") {
      const { searchHistoryRepository } = await import("../../persistence/repositories");
      searchHistoryRepository.delete(id);
      return;
    }
    await persistDeleteSearchHistory({ data: id });
  },
  async clearAll(): Promise<void> {
    if (typeof window === "undefined") {
      const { searchHistoryRepository } = await import("../../persistence/repositories");
      searchHistoryRepository.clearAll();
      return;
    }
    await persistClearSearchHistory({ data: undefined });
  },
};

export type { SearchManager };
export * from "../../contracts/search";
