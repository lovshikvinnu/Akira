export interface SearchResult {
  id: string;
  type: "project" | "note" | "task" | "session" | "timeline" | "memory";
  title: string;
  description: string;
  score: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters?: Record<string, any>;
  scope?: ("project" | "note" | "task" | "session" | "timeline" | "memory")[];
  sort?: { field: string; order: "asc" | "desc" };
}

export interface SearchProvider {
  name: string;
  search(request: SearchRequest): Promise<SearchResult[]> | SearchResult[];
}
