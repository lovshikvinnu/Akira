import {
  TimelineEvent,
  TimelineQueryRequest,
  TimelineQueryResult,
} from "../../akira-os/timeline/types";

export interface TimelineRepository {
  insert(event: TimelineEvent): void;
  findPaged(request: TimelineQueryRequest): TimelineQueryResult;
  deleteById(id: string): void;
  deleteByProjectId(projectId: string): void;
  clearAll(): void;
  count(): number;
  /** Persists anything buffered in memory, returning how many are still waiting. */
  flush(): number;
  /** Events accepted but not yet durably stored. Included in count(). */
  pendingCount(): number;
}
