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
  delete(id: string): void;
}
