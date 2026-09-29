/**
 * A deleted project's sessions stay in history for 30 days.
 *
 * Before this, the store kept them while `sessions.project_id ... ON DELETE
 * CASCADE` erased them on disk -- visible until restart, then gone:
 *
 *     before delete  store 1  db 1
 *     after delete   store 1  db 0
 *
 * Policy: kept, surviving restart, for `SESSION_HISTORY_RETENTION_DAYS` after
 * the project is deleted; then no longer returned, and purgeable. They must
 * not bring the deleted project back as active state, and must not cause FK
 * failures.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { sessionRepository, settingsRepository } = await import("../src/persistence/repositories");
const { SESSION_HISTORY_RETENTION_DAYS } =
  await import("../src/persistence/repositories/SqliteSessionRepository");
const { getDatabaseConnection } = await import("../src/persistence/connection");

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-09-01T12:00:00.000Z").getTime();

let errorSpy: ReturnType<typeof vi.spyOn>;
const failedWrites = () =>
  errorSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("failed"));

/** What a restart loads -- the reads `getInitialState` performs. */
function reloadView() {
  const raw = settingsRepository.get("active_session");
  const lastRaw = settingsRepository.get("last_project_id");
  return {
    sessions: sessionRepository.getAll(),
    activeSession: raw ? JSON.parse(raw) : null,
    lastProjectId: lastRaw ? JSON.parse(lastRaw) : null,
  };
}

function restart(): void {
  akira.initializeState({ ...(akira.getState() as AkiraState), ...reloadView() } as AkiraState);
}

async function project(name: string): Promise<string> {
  akira.addProject({ name });
  await settlePendingPersistence();
  return akira.getState().lastProjectId as string;
}

async function session(projectId: string, task: string): Promise<void> {
  akira.startSession(projectId, task);
  await settlePendingPersistence();
  akira.endSession(`${task} notes`);
  await settlePendingPersistence();
}

const tasks = (list: { task: string }[]) => list.map((s) => s.task).sort();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  akira.reset();
  await settlePendingPersistence();
  const db = getDatabaseConnection();
  db.exec("DELETE FROM sessions; DELETE FROM projects;");
  settingsRepository.delete("active_session");
  const s = akira.getState() as AkiraState;
  akira.initializeState({
    ...s,
    projects: [],
    tasks: [],
    notes: [],
    sessions: [],
    activeSession: null,
    lastProjectId: null,
  });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.useRealTimers();
});

describe("deleting a project", () => {
  it("keeps its finished sessions, in the store and on disk", async () => {
    const doomed = await project("Doomed");
    await session(doomed, "doomed work");

    akira.deleteProject(doomed);
    await settlePendingPersistence();

    expect(tasks(akira.getState().sessions)).toEqual(["doomed work"]);
    expect(tasks(reloadView().sessions)).toEqual(["doomed work"]);
    expect(failedWrites()).toEqual([]);
  });

  it("records when the retention window started, without restamping the session", async () => {
    const doomed = await project("Doomed");
    await session(doomed, "doomed work");
    const row = () =>
      getDatabaseConnection()
        .prepare("SELECT project_id, project_deleted_at, updated_at FROM sessions")
        .get() as {
        project_id: string | null;
        project_deleted_at: string | null;
        updated_at: string;
      };
    const updatedBefore = row().updated_at;

    vi.setSystemTime(T0 + DAY);
    akira.deleteProject(doomed);
    await settlePendingPersistence();

    expect(row().project_id).toBeNull();
    expect(row().project_deleted_at).toBe(new Date(T0 + DAY).toISOString());
    expect(row().updated_at).toBe(updatedBefore);
    expect(akira.getState().sessions[0].projectDeletedAt).toBe(new Date(T0 + DAY).toISOString());
  });

  it("leaves other projects' sessions untouched", async () => {
    const doomed = await project("Doomed");
    const kept = await project("Kept");
    await session(doomed, "doomed work");
    await session(kept, "kept work");

    akira.deleteProject(doomed);
    await settlePendingPersistence();

    const keptRow = reloadView().sessions.find((s) => s.task === "kept work")!;
    expect(keptRow.projectId).toBe(kept);
    expect(keptRow.projectDeletedAt).toBeUndefined();
  });
});

describe("historical access", () => {
  it("keeps the session searchable", async () => {
    const doomed = await project("Doomed");
    await session(doomed, "grout sealing");
    akira.deleteProject(doomed);
    await settlePendingPersistence();

    // `trg_projects_delete` drops the project's sessions from the index by
    // `project_id`; the FK has already nulled it by then, so they stay. Pinned
    // because it rests on SQLite running the FK action before that trigger.
    const hits = getDatabaseConnection()
      .prepare(
        "SELECT title FROM fts_workspace WHERE entity_type = 'session' AND fts_workspace MATCH 'grout'",
      )
      .all() as { title: string }[];
    expect(hits.map((h) => h.title)).toEqual(["grout sealing"]);
  });
});

describe("after a restart", () => {
  it("still shows the deleted project's sessions, as the store did before it", async () => {
    const doomed = await project("Doomed");
    await session(doomed, "doomed work");
    akira.deleteProject(doomed);
    await settlePendingPersistence();
    const beforeRestart = akira.getState().sessions.map(({ id: _id, ...rest }) => rest);

    restart();

    // Ids differ by design (store and repository mint their own), so compare
    // everything else: project, retention stamp, task, notes, timing.
    const afterRestart = akira.getState().sessions.map(({ id: _id, ...rest }) => rest);
    expect(afterRestart.map((s) => [s.task, s.projectId, s.projectDeletedAt])).toEqual(
      beforeRestart.map((s) => [s.task, s.projectId, s.projectDeletedAt]),
    );
  });

  it("does not bring the deleted project back as active state", async () => {
    const doomed = await project("Doomed");
    await session(doomed, "doomed work");
    akira.startSession(doomed, "running when deleted");
    await settlePendingPersistence();
    akira.deleteProject(doomed);
    await settlePendingPersistence();

    restart();

    const s = akira.getState();
    expect(s.projects.map((p) => p.id)).not.toContain(doomed);
    expect(s.lastProjectId).not.toBe(doomed);
    expect(s.activeSession).toBeNull();
    expect(s.sessions.map((x) => x.projectId)).not.toContain(doomed);
  });

  it("keeps recording new sessions without FK failures", async () => {
    const doomed = await project("Doomed");
    const kept = await project("Kept");
    await session(doomed, "doomed work");
    akira.deleteProject(doomed);
    await settlePendingPersistence();
    restart();

    await session(kept, "after restart");

    expect(failedWrites()).toEqual([]);
    expect(tasks(reloadView().sessions)).toEqual(["after restart", "doomed work"]);
  });
});

describe("the 30-day boundary", () => {
  async function deletedAtT0(): Promise<void> {
    const doomed = await project("Doomed");
    await session(doomed, "doomed work");
    akira.deleteProject(doomed);
    await settlePendingPersistence();
  }

  it("is 30 days", () => {
    expect(SESSION_HISTORY_RETENTION_DAYS).toBe(30);
  });

  it("keeps the session until the window closes", async () => {
    await deletedAtT0();

    vi.setSystemTime(T0 + 30 * DAY - 1);
    expect(tasks(reloadView().sessions)).toEqual(["doomed work"]);
  });

  it("stops returning it once 30 days have passed", async () => {
    await deletedAtT0();

    vi.setSystemTime(T0 + 30 * DAY);
    expect(reloadView().sessions).toEqual([]);

    // A restart past the window loads it no more.
    restart();
    expect(akira.getState().sessions).toEqual([]);
  });

  it("does not apply to sessions whose project still exists, however old", async () => {
    const kept = await project("Kept");
    await session(kept, "old kept work");

    vi.setSystemTime(T0 + 365 * DAY);
    expect(tasks(reloadView().sessions)).toEqual(["old kept work"]);
  });
});

describe("an existing database", () => {
  it("is rebuilt to keep sessions, with rows, indexes and triggers intact", async () => {
    const db = getDatabaseConnection();
    const dependents = () =>
      (
        db
          .prepare(
            "SELECT type, name FROM sqlite_master WHERE tbl_name = 'sessions' AND sql IS NOT NULL ORDER BY name",
          )
          .all() as { type: string; name: string }[]
      ).map((d) => `${d.type}:${d.name}`);
    const expected = dependents();

    // Put the table back in its pre-migration shape: NOT NULL + CASCADE.
    const ddl = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE tbl_name = 'sessions' AND type IN ('index','trigger') AND sql IS NOT NULL",
      )
      .all() as { sql: string }[];
    db.pragma("foreign_keys = OFF");
    db.exec(`
      DROP TABLE sessions;
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task TEXT NOT NULL,
        started_at TEXT NOT NULL, ended_at TEXT NOT NULL, duration INTEGER NOT NULL,
        notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        CHECK (duration >= 0),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    for (const { sql } of ddl) db.exec(sql);
    db.pragma("foreign_keys = ON");

    const legacy = await project("Legacy");
    await session(legacy, "legacy work");
    expect(
      (db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name),
    ).not.toContain("project_deleted_at"); // the fixture really is the old shape

    initializeDatabase();

    expect(
      (db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name),
    ).toContain("project_deleted_at");
    expect(dependents()).toEqual(expected);
    expect(tasks(reloadView().sessions)).toEqual(["legacy work"]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);

    // And the rebuilt table has the new behaviour.
    akira.deleteProject(legacy);
    await settlePendingPersistence();
    expect(tasks(reloadView().sessions)).toEqual(["legacy work"]);
    expect(failedWrites()).toEqual([]);
  });
});
