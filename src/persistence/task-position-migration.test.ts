// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test, expect } from "vitest";
import { initializeDatabase } from "./initializer";
import { getDatabaseConnection } from "./connection";

/**
 * `tasks.position` only migrates a database that predates the column, and every
 * other suite starts from a fresh `:memory:` database where `schema.sql` creates
 * it up front. So the ALTER TABLE path — the one an existing user's database
 * actually takes — is never exercised anywhere else. This suite rebuilds the
 * pre-migration shape on purpose, the same way `timeline-seq-migration.test.ts`
 * does for `timeline_events.seq`.
 */
function revertToLegacyTaskSchema() {
  const db = getDatabaseConnection();
  db.exec(`
    DROP INDEX IF EXISTS idx_tasks_position;
    DROP TABLE IF EXISTS tasks;

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL,
      estimated_duration INTEGER DEFAULT 0,
      due_date TEXT,
      done INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function insertLegacyTask(id: string, title: string, createdAt: string) {
  getDatabaseConnection()
    .prepare(
      `INSERT INTO tasks (id, title, description, priority, estimated_duration, due_date, done, completed, project_id, created_at, updated_at)
       VALUES (?, ?, '', 'Medium', 30, NULL, 0, 0, NULL, ?, ?)`,
    )
    .run(id, title, createdAt, createdAt);
}

test("a database that predates the column gains it without losing task order", () => {
  revertToLegacyTaskSchema();

  insertLegacyTask("t1", "oldest", "2026-01-01T00:00:00.000Z");
  insertLegacyTask("t2", "middle", "2026-02-01T00:00:00.000Z");
  insertLegacyTask("t3", "newest", "2026-03-01T00:00:00.000Z");

  const db = getDatabaseConnection();

  // The guard: this really is the pre-migration shape, or the assertions below
  // are about a column that was already there.
  const before = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[];
  expect(before.some((c) => c.name === "position")).toBe(false);

  initializeDatabase();

  const after = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[];
  expect(after.some((c) => c.name === "position")).toBe(true);

  // Backfilled from rowid rather than left NULL. NULLs sort first in SQLite, so
  // an unbackfilled row would jump to the top of the user's list on first read.
  const rows = db.prepare(`SELECT title, position FROM tasks ORDER BY position ASC`).all() as {
    title: string;
    position: number | null;
  }[];

  expect(rows.map((r) => r.title)).toEqual(["oldest", "middle", "newest"]);
  expect(rows.every((r) => r.position !== null)).toBe(true);
});

test("running initialization again does not renumber an order the user set", () => {
  revertToLegacyTaskSchema();
  insertLegacyTask("t1", "first", "2026-01-01T00:00:00.000Z");
  insertLegacyTask("t2", "second", "2026-02-01T00:00:00.000Z");

  initializeDatabase();

  const db = getDatabaseConnection();
  // The user drags "second" above "first".
  db.prepare(`UPDATE tasks SET position = ? WHERE id = ?`).run(0, "t2");
  db.prepare(`UPDATE tasks SET position = ? WHERE id = ?`).run(1, "t1");

  // A later startup must not re-run the backfill over it. The guard is
  // `PRAGMA table_info`, so this is what proves the migration is idempotent
  // rather than merely harmless the first time.
  initializeDatabase();

  const rows = db.prepare(`SELECT title FROM tasks ORDER BY position ASC`).all() as {
    title: string;
  }[];

  expect(rows.map((r) => r.title)).toEqual(["second", "first"]);
});
