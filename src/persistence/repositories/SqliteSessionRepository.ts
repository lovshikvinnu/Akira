if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteSessionRepository.ts must only be loaded on the server side.",
  );
}

import { WorkSession } from "../../shared/types/store-types";
import { SessionRepository } from "../../contracts/repositories/SessionRepository";
import { getDatabaseConnection } from "../connection";

/**
 * How long a session stays in history after its project is deleted. After
 * this it is no longer returned, and `purgeExpired` deletes it for good.
 */
export const SESSION_HISTORY_RETENTION_DAYS = 30;
const RETENTION_MS = SESSION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * The edge of the retention window, computed in one place on purpose.
 *
 * `getAll` keeps what is strictly newer than this and `purgeExpired` deletes
 * everything else, so the two halves are complementary by construction: a
 * session that is still readable is never deleted, and one that has stopped
 * being readable is always deleted. Duplicating the arithmetic is how those
 * two boundaries drift apart and history goes missing a day early.
 */
const retentionCutoff = (): string => new Date(Date.now() - RETENTION_MS).toISOString();

interface SessionRow {
  id: string;
  project_id: string | null;
  task: string;
  started_at: string;
  ended_at: string;
  duration: number;
  notes: string | null;
  project_deleted_at: string | null;
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
      // "" for a deleted project, the value the store gives it on delete, so
      // a session reads the same before and after a restart.
      projectId: row.project_id ?? "",
      task: row.task,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      duration: row.duration,
      notes: row.notes || undefined,
      projectDeletedAt: row.project_deleted_at ?? undefined,
    };
  }

  getAll(): WorkSession[] {
    const rows = this.getDb()
      .prepare(
        `SELECT * FROM sessions
         WHERE project_deleted_at IS NULL OR project_deleted_at > ?
         ORDER BY started_at DESC`,
      )
      .all(retentionCutoff()) as SessionRow[];
    return rows.map((row) => this.mapRowToSession(row));
  }

  /**
   * Permanently deletes the sessions whose retention window has closed.
   *
   * Deleting the row is the whole cleanup, and that is a property of the
   * schema rather than an assumption: `trg_sessions_delete` drops the row's
   * `fts_workspace` entry and `trg_vault_links_cleanup_sessions` its vault
   * links, both AFTER DELETE on this table. Until something ran this, an
   * expired session sat on disk and stayed in the search index -- `getAll`
   * hid it while a search still returned it.
   *
   * Idempotent: a second call matches nothing. Sessions of a live project
   * have `project_deleted_at IS NULL` and are never matched, at any age.
   */
  purgeExpired(): number {
    return this.getDb()
      .prepare(
        `DELETE FROM sessions
         WHERE project_deleted_at IS NOT NULL AND project_deleted_at <= ?`,
      )
      .run(retentionCutoff()).changes;
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

    // A session whose project was deleted before `projects.delete` cleared it
    // is discarded, not recorded: its insert would fail the FK and roll back,
    // leaving it in place to fail every later start/end the same way.
    if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(active.projectId)) {
      db.prepare("DELETE FROM settings WHERE key = ?").run("active_session");
      return;
    }

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
