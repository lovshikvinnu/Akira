// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test, expect } from "vitest";
import { initializeDatabase } from "./initializer";
import { getDatabaseConnection } from "./connection";

/**
 * The seq migration only runs against a database that predates the column, and
 * every other suite starts from a fresh :memory: database where the column is
 * created up front. This suite reconstructs the pre-migration shape on purpose
 * so the ALTER TABLE path is actually exercised.
 */
function revertToLegacyTimelineSchema() {
  const db = getDatabaseConnection();
  db.exec(`
    DROP TRIGGER IF EXISTS trg_vault_files_insert_audit;
    DROP TRIGGER IF EXISTS trg_vault_files_delete_audit;
    DROP INDEX IF EXISTS idx_timeline_seq;
    DROP INDEX IF EXISTS idx_timeline_timestamp_seq;
    DROP TABLE IF EXISTS timeline_events;

    CREATE TABLE timeline_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      project_id TEXT,
      payload TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload_version INTEGER DEFAULT 1,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TRIGGER trg_vault_files_insert_audit
    AFTER INSERT ON vault_files
    BEGIN
      INSERT INTO timeline_events (id, event_type, project_id, payload, timestamp, payload_version)
      VALUES (
        lower(hex(randomblob(8))),
        'file.created',
        NULL,
        json_object('id', new.id),
        STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
        1
      );
    END;
  `);
}

test("Timeline seq migration - upgrades an existing database without losing order", () => {
  initializeDatabase();
  revertToLegacyTimelineSchema();
  const db = getDatabaseConnection();

  // Pre-existing rows, all sharing one timestamp so only insertion order
  // distinguishes them. Ids descend lexically, so any ordering that still fell
  // back to `id` would invert them.
  const legacyIds = ["zz", "yy", "xx", "ww"];
  const tied = "2026-01-01T00:00:00.000Z";
  for (const id of legacyIds) {
    db.prepare(
      `INSERT INTO timeline_events (id, event_type, project_id, payload, timestamp, payload_version)
       VALUES (?, 'task.created', NULL, '{}', ?, 1)`,
    ).run(id, tied);
  }

  const before = db.prepare(`PRAGMA table_info(timeline_events)`).all() as { name: string }[];
  expect(before.some((c) => c.name === "seq")).toBe(false);

  // --- run the migration ---
  initializeDatabase();

  const after = db.prepare(`PRAGMA table_info(timeline_events)`).all() as { name: string }[];
  expect(after.some((c) => c.name === "seq")).toBe(true);

  // Legacy rows are backfilled, never left NULL.
  const nulls = db.prepare(`SELECT COUNT(*) AS n FROM timeline_events WHERE seq IS NULL`).get() as {
    n: number;
  };
  expect(nulls.n).toBe(0);

  // Backfill preserves the original insertion order.
  const ordered = (
    db.prepare(`SELECT id FROM timeline_events ORDER BY seq ASC`).all() as { id: string }[]
  ).map((r) => r.id);
  expect(ordered).toEqual(legacyIds);

  // Indexes supporting the keyset read exist.
  const indexes = (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='timeline_events'`)
      .all() as { name: string }[]
  ).map((r) => r.name);
  expect(indexes).toContain("idx_timeline_seq");
  expect(indexes).toContain("idx_timeline_timestamp_seq");

  // The audit triggers were recreated, not left at their seq-less definition.
  const trigger = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?`)
    .get("trg_vault_files_insert_audit") as { sql: string } | undefined;
  expect(trigger).toBeDefined();
  expect(trigger!.sql).toContain("seq");

  // And a trigger-written row really does receive a sequence.
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO vault_files (id, display_name, original_name, mime_type, extension,
       size_bytes, hash, storage_path, folder_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Ready', ?, ?)`,
  ).run("vf-1", "a.txt", "a.txt", "text/plain", "txt", 10, "h", "/tmp/a.txt", now, now);

  const triggerRow = db
    .prepare(`SELECT seq FROM timeline_events WHERE event_type = 'file.created'`)
    .get() as { seq: number | null } | undefined;
  expect(triggerRow).toBeDefined();
  expect(typeof triggerRow!.seq).toBe("number");
  expect(triggerRow!.seq!).toBeGreaterThan(legacyIds.length - 1);

  // Re-running initialization is a no-op, not a second migration.
  initializeDatabase();
  const stillOrdered = (
    db.prepare(`SELECT id FROM timeline_events ORDER BY seq ASC LIMIT 4`).all() as { id: string }[]
  ).map((r) => r.id);
  expect(stillOrdered).toEqual(legacyIds);
});
