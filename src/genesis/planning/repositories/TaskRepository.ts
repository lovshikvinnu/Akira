import { Task } from "../types";

export interface TaskRepository {
  getTask(id: string): Task | null;
  createTask(task: Task): Task;
  updateTask(task: Task): Task;
  deleteTask(id: string): void;
  listTasks(milestoneId?: string): Task[];
}
