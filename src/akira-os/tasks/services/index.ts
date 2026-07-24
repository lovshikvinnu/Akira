import type { Task } from "../../../shared/types/store-types";
import { persistAddTask, persistUpdateTask, persistDeleteTask } from "../server";

export const tasksService = {
  async add(input: {
    title: string;
    description?: string;
    priority?: "Low" | "Medium" | "High";
    estimatedDuration?: number;
    dueDate?: string | null;
    projectId?: string | null;
  }): Promise<string> {
    return persistAddTask({ data: input });
  },
  async update(id: string, patch: Partial<Task>): Promise<void> {
    await persistUpdateTask({ data: { id, patch } });
  },
  async delete(id: string): Promise<void> {
    await persistDeleteTask({ data: id });
  },
};
