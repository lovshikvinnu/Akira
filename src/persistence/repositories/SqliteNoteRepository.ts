if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteNoteRepository.ts must only be loaded on the server side.",
  );
}

import { Note } from "../../shared/types/store-types";
import { NoteRepository } from "../../contracts/repositories/NoteRepository";
import { getDatabaseConnection } from "../connection";

interface NoteRow {
  id: string;
  title: string | null;
  content: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
  pinned: number;
  favorite: number;
  project_id: string | null;
}

export class SqliteNoteRepository implements NoteRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToNote(row: NoteRow): Note {
    return {
      id: row.id,
      title: row.title || "",
      content: row.content,
      tags: JSON.parse(row.tags || "[]"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pinned: row.pinned === 1,
      favorite: row.favorite === 1,
      projectId: row.project_id || null,
    };
  }

  getAll(): Note[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM notes ORDER BY pinned DESC, favorite DESC, updated_at DESC")
      .all() as NoteRow[];
    return rows.map((row) => this.mapRowToNote(row));
  }

  getById(id: string): Note | undefined {
    const row = this.getDb().prepare("SELECT * FROM notes WHERE id = ?").get(id) as
      NoteRow | undefined;
    return row ? this.mapRowToNote(row) : undefined;
  }

  add(
    input:
      | string
      | {
          id?: string;
          title?: string;
          content: string;
          tags?: string[];
          pinned?: boolean;
          favorite?: boolean;
          projectId?: string | null;
        },
  ): string {
    const isStr = typeof input === "string";
    const content = (isStr ? input : input.content).trim();
    const title = (isStr ? "" : input.title || "").trim();
    const tags = isStr ? [] : input.tags || [];
    const pinned = isStr ? false : !!input.pinned;
    const favorite = isStr ? false : !!input.favorite;
    const projectId = isStr ? null : input.projectId || null;

    const id = isStr ? crypto.randomUUID() : input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    this.getDb()
      .prepare(
        `
        INSERT INTO notes (
          id, title, content, tags, created_at, updated_at, pinned, favorite, project_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        title,
        content,
        JSON.stringify(tags),
        now,
        now,
        pinned ? 1 : 0,
        favorite ? 1 : 0,
        projectId,
      );

    return id;
  }

  update(id: string, patch: Partial<Note>): void {
    const mappings: Record<string, string> = {
      title: "title",
      content: "content",
      tags: "tags",
      pinned: "pinned",
      favorite: "favorite",
      projectId: "project_id",
    };

    const sets: string[] = [];
    const params: unknown[] = [];

    (Object.keys(patch) as Array<keyof Note>).forEach((key) => {
      const col = mappings[key];
      const value = patch[key];
      if (col !== undefined && value !== undefined) {
        sets.push(`${col} = ?`);
        if (key === "tags") {
          params.push(JSON.stringify(value));
        } else if (key === "pinned" || key === "favorite") {
          params.push(value ? 1 : 0);
        } else {
          params.push(value);
        }
      }
    });

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    const query = `UPDATE notes SET ${sets.join(", ")} WHERE id = ?`;
    this.getDb()
      .prepare(query)
      .run(...params);
  }

  delete(id: string): void {
    this.getDb().prepare("DELETE FROM notes WHERE id = ?").run(id);
  }
}
