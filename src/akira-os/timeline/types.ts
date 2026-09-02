export interface TimelineEvent {
  id: string;
  eventType: string;
  projectId: string | null;
  payload: Record<string, any>;
  payloadVersion: number;
  timestamp: string;
  /**
   * Monotonic record order, assigned by the repository on write.
   *
   * `timestamp` only resolves to the millisecond, so a burst recorded inside one
   * millisecond ties on it. `seq` breaks that tie in the order events were
   * actually recorded, making (timestamp, seq) a total order. Optional because
   * callers construct events without it; the repository fills it in.
   */
  seq?: number;
}

/**
 * Keyset pagination coordinate. Must match the sort order exactly, or paging
 * would skip or repeat rows at a page boundary.
 */
export interface TimelineCursor {
  timestamp: string;
  seq: number;
}

export interface TimelineQueryRequest {
  limit: number;
  cursor?: TimelineCursor;
  filterProjectIds?: string[];
  filterCategories?: ("tasks" | "notes" | "sessions")[];
  sortDirection?: "asc" | "desc";
}

export interface TimelineQueryResult {
  items: TimelineEvent[];
  nextCursor?: TimelineCursor;
}
