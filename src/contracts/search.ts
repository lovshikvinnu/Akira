export interface SearchResult {
  id: string;
  type: "project" | "note" | "task" | "session" | "timeline" | "memory" | "message";
  title: string;
  description: string;
  score: number;

  metadata?: Record<string, any>;
}

export interface SearchRequest {
  query: string;
  limit?: number;

  filters?: Record<string, any>;
  scope?: ("project" | "note" | "task" | "session" | "timeline" | "memory" | "message")[];
  sort?: { field: string; order: "asc" | "desc" };
}

export interface SearchProvider {
  name: string;
  search(request: SearchRequest): Promise<SearchResult[]> | SearchResult[];
}
