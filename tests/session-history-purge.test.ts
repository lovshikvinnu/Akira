/**
 * A deleted project's sessions are kept for 30 days, and then actually go.
 *
 * `SqliteSessionRepository.getAll` already stopped returning them at the
 * boundary, but nothing deleted them. The rows stayed on disk and -- the part
 * that leaked -- stayed in `fts_workspace`, so search answered with a session
 * that history had dropped:
 *
 *     getAll()                      []
 *     search('quarterly audit')     [{ type: 'session', ... }]
 *
 * The purge closes that. Its boundary is not re-derived here: `getAll` keeps
 * `project_deleted_at > cutoff` and the purge deletes
 * `project_deleted_at <= cutoff` from the same `retentionCutoff()`, so the
 * hidden set and the deleted set are one set. These tests pin that they stay
 * one set.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

const { sessionRepository, searchRepository } = await import("../src/persistence/repositories");
const { SESSION_HISTORY_RETENTION_DAYS } =
  await import("../src/persistence/repositories/SqliteSessionRepository");
const { getDatabaseConnection } = await import("../src/persistence/connection");

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-09-01T12:00:00.000Z").getTime();
/** The instant the repository computes, written here the other way round. */
const CUTOFF = T0 - SESSION_HISTORY_RETENTION_DAYS * DAY;

const iso = (ms: number) => new Date(ms).toISOString();

function seedProject(id: string): void {
  getDatabaseConnection()
    .prepare(
      `INSERT INTO projects (id, name, tag, color, icon, created_at, updated_at)
       VALUES (?, ?, 'work', '#fff', 'folder', ?, ?)`,
    )
    .run(id, `project ${id}`, iso(T0), iso(T0));
}

/**
 * A finished session, written straight to the table so its retention stamp is
 * exact. `projectDeletedAt: null` is a session of a live project.
 */
function seedSession(id: string, task: string, projectDeletedAt: number | null): void {
  getDatabaseConnection()
    .prepare(
      `INSERT INTO sessions
         (id, project_id, task, started_at, ended_at, duration, notes,
          created_at, updated_at, project_deleted_at)
       VALUES (?, ?, ?, ?, ?, 5, ?, ?, ?, ?)`,
    )
    .run(
      id,
      projectDeletedAt === null ? "live-project" : null,
      task,
      iso(T0 - DAY),
      iso(T0 - DAY),
      `${task} notes`,
      iso(T0 - DAY),
      iso(T0 - DAY),
      projectDeletedAt === null ? null : iso(projectDeletedAt),
    );
}

function linkVaultFile(sessionId: string): void {
  const db = getDatabaseConnection();
  const fileId = `file-${sessionId}`;
  db.prepare(
    `INSERT INTO vault_files
       (id, display_name, original_name, mime_type, extension, size_bytes, hash,
        storage_path, status, created_at, updated_at)
     VALUES (?, 'a.txt', 'a.txt', 'text/plain', 'txt', 1, 'h', ?, 'Ready', ?, ?)`,
  ).run(fileId, `/tmp/${fileId}`, iso(T0), iso(T0));
  db.prepare(
    `INSERT INTO vault_file_links (id, file_id, entity_type, entity_id, created_at)
     VALUES (?, ?, 'session', ?, ?)`,
  ).run(`link-${sessionId}`, fileId, sessionId, iso(T0));
}

const ids = () =>
  (getDatabaseConnection().prepare("SELECT id FROM sessions ORDER BY id").all() as { id: string }[])
    .map((r) => r.id)
    .sort();

const ftsIds = () =>
  (
    getDatabaseConnection()
      .prepare("SELECT entity_id FROM fts_workspace WHERE entity_type = 'session'")
      .all() as { entity_id: string }[]
  )
    .map((r) => r.entity_id)
    .sort();

const linkIds = () =>
  (
    getDatabaseConnection()
      .prepare("SELECT entity_id FROM vault_file_links WHERE entity_type = 'session'")
      .all() as { entity_id: string }[]
  ).map((r) => r.entity_id);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  const db = getDatabaseConnection();
  db.exec(
    "DELETE FROM sessions; DELETE FROM vault_file_links; DELETE FROM vault_files; DELETE FROM projects;",
  );
  seedProject("live-project");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("purging sessions whose retention window has closed", () => {
  it("keeps one a millisecond inside the window", () => {
    seedSession("inside", "still in history", CUTOFF + 1);

    expect(sessionRepository.purgeExpired()).toBe(0);
    expect(ids()).toEqual(["inside"]);
  });

  it("deletes one at the boundary and one past it, with its index row and vault links", () => {
    seedSession("at", "exactly expired", CUTOFF);
    seedSession("past", "long expired", CUTOFF - DAY);
    seedSession("inside", "still in history", CUTOFF + 1);
    linkVaultFile("at");
    linkVaultFile("inside");

    // The boundary is getAll's boundary, not a second opinion about it: what
    // the purge takes is exactly what getAll had already stopped returning.
    expect(sessionRepository.getAll().map((s) => s.id)).toEqual(["inside"]);

    expect(sessionRepository.purgeExpired()).toBe(2);

    expect(ids()).toEqual(["inside"]);
    // Deleting the row really is the whole cleanup -- both triggers fired.
    expect(ftsIds()).toEqual(["inside"]);
    expect(linkIds()).toEqual(["inside"]);
    // The vault file itself is not the session's to delete.
    expect(getDatabaseConnection().prepare("SELECT COUNT(*) c FROM vault_files").get()).toEqual({
      c: 2,
    });
  });

  it("never touches a live project's session, however old", () => {
    seedSession("ancient", "a year of work", null);
    vi.setSystemTime(T0 + 365 * DAY);

    expect(sessionRepository.purgeExpired()).toBe(0);
    expect(ids()).toEqual(["ancient"]);
    expect(sessionRepository.getAll().map((s) => s.id)).toEqual(["ancient"]);
  });

  it("is a no-op the second time", () => {
    seedSession("past", "long expired", CUTOFF - DAY);
    seedSession("inside", "still in history", CUTOFF + 1);

    expect(sessionRepository.purgeExpired()).toBe(1);
    expect(sessionRepository.purgeExpired()).toBe(0);
    expect(ids()).toEqual(["inside"]);
  });

  it("takes the expired session out of search", () => {
    seedSession("past", "quarterly audit", CUTOFF - DAY);

    const hits = () =>
      searchRepository.search({ query: "quarterly audit", scope: ["session"] }).map((r) => r.id);
    // The leak, before the purge: history hides it, search still answers with it.
    expect(sessionRepository.getAll()).toEqual([]);
    expect(hits()).toEqual(["past"]);

    sessionRepository.purgeExpired();

    expect(hits()).toEqual([]);
  });
});

describe("a restart", () => {
  let dbPath: string;
  const originalDbPath = process.env.AKIRA_DATABASE_PATH;

  beforeEach(() => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "akira-purge-")), "akira.db");
  });

  afterEach(() => {
    process.env.AKIRA_DATABASE_PATH = originalDbPath;
  });

  /** One application process, booting the way `server.ts` does. */
  async function boot() {
    vi.resetModules();
    process.env.AKIRA_DATABASE_PATH = dbPath;
    process.env.NODE_ENV = "test";

    const { initializeDatabase: init } = await import("../src/persistence/initializer");
    const { getDatabaseConnection: connect, closeDatabaseConnection } =
      await import("../src/persistence/connection");
    init();
    return { db: connect(), exit: () => closeDatabaseConnection() };
  }

  it("collects what expired while the app was shut down, and nothing else", async () => {
    const first = await boot();
    first.db
      .prepare(
        `INSERT INTO projects (id, name, tag, color, icon, created_at, updated_at)
         VALUES ('live-project', 'live', 'work', '#fff', 'folder', ?, ?)`,
      )
      .run(iso(T0), iso(T0));

    const insert = first.db.prepare(
      `INSERT INTO sessions
         (id, project_id, task, started_at, ended_at, duration, notes,
          created_at, updated_at, project_deleted_at)
       VALUES (?, ?, ?, ?, ?, 5, NULL, ?, ?, ?)`,
    );
    const stamps = [iso(T0 - DAY), iso(T0 - DAY), iso(T0 - DAY), iso(T0 - DAY)];
    insert.run("past", null, "long expired", ...stamps, iso(CUTOFF - DAY));
    insert.run("inside", null, "still in history", ...stamps, iso(CUTOFF + 1));
    insert.run("live", "live-project", "ongoing", ...stamps, null);
    first.exit();

    const second = await boot();
    try {
      // Nothing in this test called the purge -- `initializeDatabase` did, at boot.
      const rows = (
        second.db.prepare("SELECT id FROM sessions ORDER BY id").all() as { id: string }[]
      ).map((r) => r.id);
      expect(rows).toEqual(["inside", "live"]);

      const fts = (
        second.db
          .prepare("SELECT entity_id FROM fts_workspace WHERE entity_type = 'session'")
          .all() as { entity_id: string }[]
      )
        .map((r) => r.entity_id)
        .sort();
      expect(fts).toEqual(["inside", "live"]);
    } finally {
      second.exit();
    }
  });
});
