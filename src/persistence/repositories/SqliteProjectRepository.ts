if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteProjectRepository.ts must only be loaded on the server side.",
  );
}

import { Project } from "../../shared/types/store-types";
import { ProjectRepository } from "../../contracts/repositories/ProjectRepository";
import { getDatabaseConnection } from "../connection";

interface ProjectRow {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  progress: number;
  color: string;
  next_task: string | null;
  notes: string | null;
  time_spent_minutes: number;
  last_worked: string | null;
  created_at: string;
  icon: string;
}

export class SqliteProjectRepository implements ProjectRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      tag: row.tag,
      description: row.description || "",
      progress: row.progress || 0,
      color: row.color,
      nextTask: row.next_task || "",
      notes: row.notes || "",
      timeSpentMinutes: row.time_spent_minutes || 0,
      lastWorked: row.last_worked || "",
      createdAt: row.created_at,
      icon: row.icon,
    };
  }

  getAll(): Project[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as ProjectRow[];
    return rows.map((row) => this.mapRowToProject(row));
  }

  getById(id: string): Project | undefined {
    const row = this.getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as
      ProjectRow | undefined;
    return row ? this.mapRowToProject(row) : undefined;
  }

  add(input: {
    id?: string;
    name: string;
    tag?: string;
    description?: string;
    color?: string;
    icon?: string;
  }): string {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const name = input.name.trim() || "Untitled project";
    const tag = input.tag?.trim() || "Project";
    const description = input.description?.trim() || "";
    const color = input.color || "from-violet to-electric";
    const icon = input.icon || "sparkles";

    this.getDb()
      .prepare(
        `
        INSERT INTO projects (
          id, name, tag, description, progress, color, next_task, notes, 
          time_spent_minutes, last_worked, created_at, updated_at, icon
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(id, name, tag, description, 0, color, "", "", 0, now, now, now, icon);

    return id;
  }

  update(id: string, patch: Partial<Project>): void {
    const mappings: Record<string, string> = {
      name: "name",
      tag: "tag",
      description: "description",
      progress: "progress",
      color: "color",
      nextTask: "next_task",
      notes: "notes",
      timeSpentMinutes: "time_spent_minutes",
      lastWorked: "last_worked",
      icon: "icon",
    };

    const sets: string[] = [];
    const params: unknown[] = [];

    (Object.keys(patch) as Array<keyof Project>).forEach((key) => {
      const col = mappings[key];
      const value = patch[key];
      if (col !== undefined && value !== undefined) {
        sets.push(`${col} = ?`);
        params.push(value);
      }
    });

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    const query = `UPDATE projects SET ${sets.join(", ")} WHERE id = ?`;
    this.getDb()
      .prepare(query)
      .run(...params);
  }

  delete(id: string): void {
    this.getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  touch(id: string): void {
    const now = new Date().toISOString();
    this.getDb()
      .prepare(
        `
        UPDATE projects 
        SET time_spent_minutes = time_spent_minutes + 5,
            last_worked = ?,
            updated_at = ?
        WHERE id = ?
      `,
      )
      .run(now, now, id);
  }
}
