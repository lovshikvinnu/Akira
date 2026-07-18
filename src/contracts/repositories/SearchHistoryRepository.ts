export interface SearchHistoryEntry {
  id: string;
  query: string;
  searchedAt: string;
  resultCount: number;
}

export interface SearchHistoryRepository {
  getRecent(limit: number): SearchHistoryEntry[];
  add(query: string, resultCount: number): void;
  delete(id: string): void;
  clearAll(): void;
}
