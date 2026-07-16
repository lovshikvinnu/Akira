import { WorkSession } from "../../shared/types/store-types";

export interface SessionRepository {
  getAll(): WorkSession[];
  getActive(): { projectId: string; task: string; startedAt: string } | null;
  start(projectId: string, task?: string): void;
  end(notes?: string): void;
  updateActiveTask(task: string): void;
}
