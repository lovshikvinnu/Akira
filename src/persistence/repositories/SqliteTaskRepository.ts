if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteTaskRepository.ts must only be loaded on the server side.",
  );
}

import { Task } from "../../shared/types/store-types";
import { TaskRepository } from "../../contracts/repositories/TaskRepository";
import { getDatabaseConnection } from "../connection";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: "Low" | "Medium" | "High";
  estimated_duration: number;
  due_date: string | null;
  done: number;
  completed: number;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteTaskRepository implements TaskRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      priority: row.priority || "Medium",
      estimatedDuration: row.estimated_duration || 30,
      dueDate: row.due_date || null,
      done: row.done === 1,
      completed: row.completed === 1,
      projectId: row.project_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getAll(): Task[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM tasks ORDER BY created_at ASC")
      .all() as TaskRow[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  getById(id: string): Task | undefined {
    const row = this.getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      TaskRow | undefined;
    return row ? this.mapRowToTask(row) : undefined;
  }

  add(input: {
    id?: string;
    title: string;
    description?: string;
    priority?: "Low" | "Medium" | "High";
    estimatedDuration?: number;
    dueDate?: string | null;
    projectId?: string | null;
  }): string {
    const id =
      input.id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));

    const now = new Date().toISOString();

    this.getDb()
      .prepare(
        `
        INSERT INTO tasks (
          id, title, description, priority, estimated_duration, due_date, done, completed, project_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
      `,
      )
      .run(
        id,
        input.title.trim(),
        input.description || null,
        input.priority || "Medium",
        input.estimatedDuration || 30,
        input.dueDate || null,
        input.projectId || null,
        now,
        now,
      );

    return id;
  }

  update(id: string, patch: Partial<Task>): void {
    const mappings: Record<string, string> = {
      title: "title",
      description: "description",
      priority: "priority",
      estimatedDuration: "estimated_duration",
      dueDate: "due_date",
      done: "done",
      completed: "completed",
      projectId: "project_id",
    };

    const sets: string[] = [];
    const params: unknown[] = [];

    (Object.keys(patch) as Array<keyof Task>).forEach((key) => {
      const col = mappings[key];
      const value = patch[key];
      if (col !== undefined && value !== undefined) {
        sets.push(`${col} = ?`);
        if (key === "done" || key === "completed") {
          params.push(value ? 1 : 0);
        } else {
          params.push(value);
        }
      }
    });

    if (sets.length === 0) return;

    const now = new Date().toISOString();
    sets.push("updated_at = ?");
    params.push(now);
    params.push(id);

    const query = `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`;
    this.getDb()
      .prepare(query)
      .run(...params);
  }

  delete(id: string): void {
    this.getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
  }
}
