if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteSessionRepository.ts must only be loaded on the server side.",
  );
}

import { WorkSession } from "../../shared/types/store-types";
import { SessionRepository } from "../../contracts/repositories/SessionRepository";
import { getDatabaseConnection } from "../connection";

interface SessionRow {
  id: string;
  project_id: string;
  task: string;
  started_at: string;
  ended_at: string;
  duration: number;
  notes: string | null;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export class SqliteSessionRepository implements SessionRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToSession(row: SessionRow): WorkSession {
    return {
      id: row.id,
      projectId: row.project_id,
      task: row.task,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      duration: row.duration,
      notes: row.notes || undefined,
    };
  }

  getAll(): WorkSession[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM sessions ORDER BY started_at DESC")
      .all() as SessionRow[];
    return rows.map((row) => this.mapRowToSession(row));
  }

  getActive(): { projectId: string; task: string; startedAt: string } | null {
    const row = this.getDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("active_session") as SettingRow | undefined;

    if (!row || !row.value) {
      return null;
    }

    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  start(projectId: string, task?: string): void {
    // If there is an active session, end it first to commit its time
    this.end();

    const activeSession = {
      projectId,
      task: task || "",
      startedAt: new Date().toISOString(),
    };

    const now = new Date().toISOString();

    this.getDb()
      .prepare(
        `
        INSERT INTO settings (key, value, updated_at)
        VALUES ('active_session', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
      )
      .run(JSON.stringify(activeSession), now);
  }

  end(notes?: string): void {
    const active = this.getActive();
    if (!active) return;

    const endedAt = new Date().toISOString();
    const duration = Math.max(
      1,
      Math.round((Date.now() - new Date(active.startedAt).getTime()) / 60000),
    );

    const sessionId = crypto.randomUUID();
    const db = this.getDb();

    db.transaction(() => {
      // 1. Insert session record
      db.prepare(
        `
        INSERT INTO sessions (
          id, project_id, task, started_at, ended_at, duration, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        sessionId,
        active.projectId,
        active.task,
        active.startedAt,
        endedAt,
        duration,
        notes || null,
        endedAt,
        endedAt,
      );

      // 2. Update project's time spent and last worked
      db.prepare(
        `
        UPDATE projects
        SET time_spent_minutes = time_spent_minutes + ?,
            last_worked = ?,
            updated_at = ?
        WHERE id = ?
      `,
      ).run(duration, endedAt, endedAt, active.projectId);

      // 3. Clear active session setting
      db.prepare("DELETE FROM settings WHERE key = ?").run("active_session");
    })();
  }

  updateActiveTask(task: string): void {
    const active = this.getActive();
    if (!active) return;

    const updated = {
      ...active,
      task: task || "",
    };

    const now = new Date().toISOString();

    this.getDb()
      .prepare(
        `
        INSERT INTO settings (key, value, updated_at)
        VALUES ('active_session', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
      )
      .run(JSON.stringify(updated), now);
  }
}
