export interface TimelineEvent {
  id: string;
  eventType: string;
  projectId: string | null;
  payload: Record<string, any>;
  payloadVersion: number;
  timestamp: string;
}

export interface TimelineQueryRequest {
  limit: number;
  cursor?: { timestamp: string; id: string };
  filterProjectIds?: string[];
  filterCategories?: ("tasks" | "notes" | "sessions")[];
  sortDirection?: "asc" | "desc";
}

export interface TimelineQueryResult {
  items: TimelineEvent[];
  nextCursor?: { timestamp: string; id: string };
}
