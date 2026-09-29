import { Task } from "../../shared/types/store-types";

export interface TaskRepository {
  getAll(): Task[];
  getById(id: string): Task | undefined;
  add(input: {
    title: string;
    description?: string;
    priority?: "Low" | "Medium" | "High";
    estimatedDuration?: number;
    dueDate?: string | null;
    projectId?: string | null;
  }): string;
  update(id: string, patch: Partial<Task>): void;
  /**
   * Writes the user's list order.
   *
   * Separate from `update` on purpose: reordering is not editing a task, and
   * `update` stamps `updated_at`. Dragging one task would otherwise rewrite the
   * modification time of every task below it.
   */
  setOrder(ids: string[]): void;
  delete(id: string): void;
}
