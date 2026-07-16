import { createServerFn } from "@tanstack/react-start";
import type { Task } from "../../shared/types/store-types";

export const persistAddTask = createServerFn({ method: "POST" })
  .validator(
    (input: {
      title: string;
      description?: string;
      priority?: "Low" | "Medium" | "High";
      estimatedDuration?: number;
      dueDate?: string | null;
      projectId?: string | null;
    }) => input,
  )
  .handler(async ({ data: input }) => {
    const { taskRepository } = await import("../../persistence/repositories");
    return taskRepository.add(input);
  });

export const persistUpdateTask = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Task> }) => input)
  .handler(async ({ data: { id, patch } }) => {
    const { taskRepository } = await import("../../persistence/repositories");
    taskRepository.update(id, patch);
  });

export const persistDeleteTask = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { taskRepository } = await import("../../persistence/repositories");
    taskRepository.delete(id);
  });

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
