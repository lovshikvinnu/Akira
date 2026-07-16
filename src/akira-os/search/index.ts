import { SearchProvider, SearchRequest, SearchResult } from "../../contracts/search";

class SearchManager {
  private providers = new Map<string, SearchProvider>();

  registerProvider(provider: SearchProvider): void {
    this.providers.set(provider.name, provider);
  }

  unregisterProvider(name: string): void {
    this.providers.delete(name);
  }

  async search(request: SearchRequest): Promise<SearchResult[]> {
    const promises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        return await provider.search(request);
      } catch (error) {
        console.error(`Search provider "${provider.name}" failed:`, error);
        return [];
      }
    });

    const resultsArray = await Promise.all(promises);
    return resultsArray.flat().sort((a, b) => b.score - a.score);
  }
}

export const searchService = new SearchManager();
export type { SearchManager };
export * from "../../contracts/search";
