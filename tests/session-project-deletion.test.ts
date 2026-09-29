/**
 * Deleting a project while its session is running must not wedge session
 * persistence.
 *
 * The store discards the running session; the database kept it in
 * `settings.active_session`, naming a project that no longer exists. A reload
 * resurrected it, and `SqliteSessionRepository.end()` -- which `start()` calls
 * first -- failed its FK insert and rolled back, so every later start and end
 * failed the same way. Measured before the fix:
 *
 *     store sessions ['next', 'running']     db sessions []
 *     sessions.start / sessions.end: FOREIGN KEY constraint failed
 *
 * The user saw sessions recorded that never reached disk.
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

let errorSpy: ReturnType<typeof vi.spyOn>;
const failedWrites = () =>
  errorSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("failed"));

/** What a reload would load -- the reads `getInitialState` performs. */
function reloadView() {
  const raw = settingsRepository.get("active_session");
  return { sessions: sessionRepository.getAll(), activeSession: raw ? JSON.parse(raw) : null };
}

function reload(): void {
  akira.initializeState({ ...(akira.getState() as AkiraState), ...reloadView() } as AkiraState);
}

async function project(name: string): Promise<string> {
  akira.addProject({ name });
  await settlePendingPersistence();
  return akira.getState().lastProjectId as string;
}

beforeEach(async () => {
  akira.reset();
  await settlePendingPersistence();
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
});

describe("deleting a project with a running session", () => {
  it("discards the running session on disk, as the store does", async () => {
    const doomed = await project("Doomed");
    await project("Other");
    akira.startSession(doomed, "running");
    await settlePendingPersistence();
    expect(reloadView().activeSession?.projectId).toBe(doomed); // the fixture has one to lose

    akira.deleteProject(doomed);
    await settlePendingPersistence();

    expect(akira.getState().activeSession).toBeNull();
    expect(reloadView().activeSession).toBeNull();
    expect(failedWrites()).toEqual([]);
  });

  it("keeps saving sessions after a reload", async () => {
    const doomed = await project("Doomed");
    const other = await project("Other");
    akira.startSession(doomed, "running");
    await settlePendingPersistence();
    akira.deleteProject(doomed);
    await settlePendingPersistence();

    reload();
    expect(akira.getState().activeSession).toBeNull();

    akira.startSession(other, "next");
    await settlePendingPersistence();
    akira.endSession("done");
    await settlePendingPersistence();

    expect(failedWrites()).toEqual([]);
    expect(reloadView().sessions.map((s) => s.task)).toEqual(["next"]);
    expect(reloadView().activeSession).toBeNull();
  });

  it("leaves a session on a different project running", async () => {
    const doomed = await project("Doomed");
    const other = await project("Other");
    akira.startSession(other, "keep");
    await settlePendingPersistence();

    akira.deleteProject(doomed);
    await settlePendingPersistence();

    expect(reloadView().activeSession?.projectId).toBe(other);
    expect(akira.getState().activeSession?.projectId).toBe(other);
  });
});

describe("a database already holding a session for a deleted project", () => {
  it("discards it rather than failing every later start and end", async () => {
    const other = await project("Other");
    // The state the bug left behind on existing installs.
    settingsRepository.set(
      "active_session",
      JSON.stringify({
        projectId: "deleted-project",
        task: "ghost",
        startedAt: new Date().toISOString(),
      }),
    );

    akira.startSession(other, "next");
    await settlePendingPersistence();
    akira.endSession("done");
    await settlePendingPersistence();

    expect(failedWrites()).toEqual([]);
    // Discarded, not recorded: its project no longer exists.
    expect(reloadView().sessions.map((s) => s.task)).toEqual(["next"]);
    expect(reloadView().activeSession).toBeNull();
  });
});
