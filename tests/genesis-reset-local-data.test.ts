/**
 * What "Reset all local data" actually deletes.
 *
 * The dialog in `routes/settings.tsx` says "Reset all local data?", describes
 * the outcome as "Projects, missions, notes and chat will be restored to
 * defaults", and reports "AKIRA reset to defaults" on success. `seed()` returns
 * all four empty, so "defaults" means gone rather than replaced with samples.
 *
 * `akira.reset()` was `state = seed(); emit();`. It emptied the in-memory store
 * and touched the database not at all, so `getInitialState()` read every row
 * back on the next boot. Measured before this change, after a reset:
 *
 *     DB rows   projects 1  tasks 1  notes 1
 *     settings  chat 1  genesis_memories 14
 *
 * The reset was a no-op that survived exactly until reload.
 *
 * BOTH DIRECTIONS ARE TESTED, AND THE SECOND MATTERS MORE
 * ------------------------------------------------------
 * Deleting too little breaks a promise. Deleting too much destroys data the
 * user never agreed to lose, and no test suite gives that back. So the cases
 * below assert what disappears *and* assert that the vault, the profile and
 * habit streaks are still there afterwards -- none of them is named by the
 * dialog, and the vault is independent user data.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

// Wires the cognitive pipeline so a note produces memory events, which is what
// makes the `genesis_memories` assertions meaningful rather than vacuous.
await import("../src/genesis/index");

const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { getDatabaseConnection } = await import("../src/persistence/connection");
const { projectRepository, taskRepository, noteRepository, settingsRepository } =
  await import("../src/persistence/repositories");

const db = getDatabaseConnection();

const settingCount = (key: string): number => {
  const raw = settingsRepository.get(key);
  return raw ? (JSON.parse(raw) as unknown[]).length : 0;
};

const vaultFileCount = (): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM vault_files").get() as { n: number }).n;

/** Data the dialog names, plus data it does not, so both directions are visible. */
async function createUserData(): Promise<void> {
  akira.initializeState(akira.getState()); // hydrated, so durable writes are allowed

  akira.addProject({ name: "My Aviation Company" });
  const projectId = akira.getState().lastProjectId as string;
  akira.addTaskDetails({ title: "file the paperwork", projectId });
  akira.addNote({ title: "Pilot plan", content: "I want to become a pilot" });
  akira.addChatMessage("user", "how do I start");

  // Not named by the dialog. Inserted directly so the assertions do not depend
  // on any vault API staying the same.
  db.prepare(
    "INSERT OR REPLACE INTO vault_files " +
      "(id, display_name, original_name, mime_type, extension, size_bytes, hash, storage_path, " +
      " folder_id, status, created_at, updated_at) " +
      "VALUES ('vf-1', 'passport-scan.pdf', 'passport-scan.pdf', 'application/pdf', 'pdf', 1024, " +
      " 'deadbeef', '/vault/vf-1', NULL, 'Ready', '2026-01-01', '2026-01-01')",
  ).run();
  settingsRepository.set("profile", JSON.stringify({ name: "Lovshik" }));
  settingsRepository.set("streaks", JSON.stringify([{ id: "s1", count: 12 }]));

  await settlePendingPersistence();
}

beforeEach(async () => {
  db.prepare("DELETE FROM tasks").run();
  db.prepare("DELETE FROM notes").run();
  db.prepare("DELETE FROM projects").run();
  db.prepare("DELETE FROM settings").run();
  db.prepare("DELETE FROM vault_files").run();
});

describe("reset deletes what the dialog promises", () => {
  it("removes projects, missions, notes and chat from the database", async () => {
    await createUserData();

    // The precondition. Without it a broken reset and an empty database are
    // indistinguishable, and every assertion below would pass on nothing.
    expect(projectRepository.getAll().length, "no project to delete").toBeGreaterThan(0);
    expect(taskRepository.getAll().length, "no task to delete").toBeGreaterThan(0);
    expect(noteRepository.getAll().length, "no note to delete").toBeGreaterThan(0);
    expect(settingCount("chat"), "no chat to delete").toBeGreaterThan(0);

    akira.reset();
    await settlePendingPersistence();

    expect(projectRepository.getAll()).toEqual([]);
    expect(taskRepository.getAll()).toEqual([]);
    expect(noteRepository.getAll()).toEqual([]);
    expect(settingCount("chat")).toBe(0);
  });

  it("removes the cognitive record of the data it deleted", async () => {
    // Not named by the dialog, but derived from what is. A memory's description
    // carries the note's text verbatim, so leaving the stream would mean AKIRA
    // still recalling the contents of notes the user just deleted.
    await createUserData();
    expect(settingCount("genesis_memories"), "no memories to delete").toBeGreaterThan(0);

    akira.reset();
    await settlePendingPersistence();

    expect(settingCount("genesis_memories")).toBe(0);
  });

  it("empties the in-memory store as well", async () => {
    await createUserData();
    akira.reset();

    const state = akira.getState();
    expect(state.projects).toEqual([]);
    expect(state.tasks).toEqual([]);
    expect(state.notes).toEqual([]);
    expect(state.chat).toEqual([]);
  });

  it("stays reset when the next boot reads the database", async () => {
    // The property the old implementation failed. Reading through the
    // repositories is what a cold start does, so nothing here depends on the
    // in-memory store having been cleared.
    await createUserData();
    akira.reset();
    await settlePendingPersistence();

    expect(projectRepository.getAll().length, "a project came back after reload").toBe(0);
    expect(taskRepository.getAll().length).toBe(0);
    expect(noteRepository.getAll().length).toBe(0);
    expect(settingsRepository.get("chat")).toBeFalsy();
    expect(settingsRepository.get("genesis_memories")).toBeFalsy();
  });
});

describe("reset does not delete what the dialog does not promise", () => {
  /**
   * The direction that cannot be undone. Deleting too little is a bug; deleting
   * a user's files under a button labelled "projects, missions, notes and chat"
   * is data loss they never agreed to.
   */
  it("leaves vault files alone", async () => {
    await createUserData();
    expect(vaultFileCount(), "no vault file to preserve").toBe(1);

    akira.reset();
    await settlePendingPersistence();

    expect(vaultFileCount(), "reset deleted a user's vault file").toBe(1);
  });

  it("leaves the profile and habit streaks alone", async () => {
    await createUserData();
    expect(settingsRepository.get("profile")).toBeTruthy();
    expect(settingsRepository.get("streaks")).toBeTruthy();

    akira.reset();
    await settlePendingPersistence();

    expect(settingsRepository.get("profile"), "reset deleted the profile").toBeTruthy();
    expect(settingsRepository.get("streaks"), "reset deleted habit streaks").toBeTruthy();
  });

  it("removes only the settings keys it names", async () => {
    await createUserData();
    akira.reset();
    await settlePendingPersistence();

    const keys = (db.prepare("SELECT key FROM settings").all() as { key: string }[]).map(
      (r) => r.key,
    );

    expect(keys).not.toContain("chat");
    expect(keys).not.toContain("genesis_memories");
    expect(keys).not.toContain("last_project_id");
    expect(keys).toContain("profile");
    expect(keys).toContain("streaks");
  });
});

describe("a failed reset is observable", () => {
  it("is owned by pendingPersistence like every other write", async () => {
    // The deletion goes through `persist`, so it is tracked and a failure is
    // recorded against the health registry rather than vanishing. Asserted
    // here because a reset that silently fails is the same class of problem as
    // the one being fixed.
    await createUserData();
    akira.reset();

    const { healthRegistry } = await import("../src/observability/health/health-registry");
    await settlePendingPersistence();

    const health = healthRegistry.get("akira-store.persist.reset");
    expect(health, "the reset write was not observable").toBeDefined();
    expect(health!.status).toBe("healthy");
  });
});
