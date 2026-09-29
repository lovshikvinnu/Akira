import { WorkSession } from "../../shared/types/store-types";

export interface SessionRepository {
  getAll(): WorkSession[];
  /**
   * Deletes the sessions `getAll` has stopped returning, and returns how many.
   * Complementary to `getAll` by construction -- see the implementation.
   */
  purgeExpired(): number;
  getActive(): { projectId: string; task: string; startedAt: string } | null;
  start(projectId: string, task?: string): void;
  end(notes?: string): void;
  updateActiveTask(task: string): void;
}
