import { Task } from "../types";
import { TaskRepository } from "./TaskRepository";

export class InMemoryTaskRepository implements TaskRepository {
  private tasks: Map<string, Task> = new Map();

  public getTask(id: string): Task | null {
    return this.tasks.get(id) || null;
  }

  public createTask(task: Task): Task {
    this.tasks.set(task.id, { ...task });
    return this.getTask(task.id)!;
  }

  public updateTask(task: Task): Task {
    const existing = this.tasks.get(task.id);
    if (!existing) {
      throw new Error(`Task with ID ${task.id} does not exist.`);
    }
    const updated = {
      ...existing,
      ...task,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, updated);
    return this.getTask(task.id)!;
  }

  public deleteTask(id: string): void {
    this.tasks.delete(id);
  }

  public listTasks(milestoneId?: string): Task[] {
    const all = Array.from(this.tasks.values());
    if (milestoneId) {
      return all.filter((t) => t.milestoneId === milestoneId);
    }
    return all;
  }

  public clear(): void {
    this.tasks.clear();
  }
}
