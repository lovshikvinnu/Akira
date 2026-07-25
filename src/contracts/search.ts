export interface SearchResult {
  id: string;
  type: "project" | "note" | "task" | "session" | "timeline" | "memory";
  title: string;
  description: string;
  score: number;

  metadata?: Record<string, any>;
}

export interface SearchRequest {
  query: string;
  limit?: number;

  filters?: Record<string, any>;
  scope?: ("project" | "note" | "task" | "session" | "timeline" | "memory")[];
  sort?: { field: string; order: "asc" | "desc" };
}

export interface SearchProvider {
  name: string;
  search(request: SearchRequest): Promise<SearchResult[]> | SearchResult[];
}
