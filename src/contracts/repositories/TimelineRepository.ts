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
}
