/**
 * A write that depends on another one lands after it.
 *
 * `persist` started every write-through immediately and nothing ordered them.
 * `addProject` and `addTaskDetails` each start their own, so a task could reach
 * the database before the project it belongs to -- and `tasks.project_id`
 * references `projects.id`, so SQLite rejected it:
 *
 *     store.tasks=1  db.tasks=0  db.projects=1
 *     [akira-store] Persistence write "tasks.add" failed:
 *       SqliteError: FOREIGN KEY constraint failed
 *
 * The user creates a project, adds a task to it, sees the task in the UI, and
 * the task is not on disk. On the next boot it is gone.
 *
 * WHAT THIS WAS MISTAKEN FOR
 * --------------------------
 * A flaky fixture. `genesis-reset-local-data` failed about three isolated runs
 * in eight, always on the precondition that a task exists, and four separate
 * fixture hypotheses were tried against it -- settling twice, settling an
 * unsettled reset, settling before clearing, clearing the store as well as the
 * database. None moved the rate, because none of them was the defect. The
 * failing write was production code losing a race.
 *
 * IT WAS ALSO MISTAKEN FOR A BROKEN SETTLE
 * ----------------------------------------
 * `settlePendingPersistence()` was suspected of returning while a write it had
 * accepted was still in flight. It was not: the write had already failed, and
 * `persist` records a failure in the health registry rather than rethrowing, so
 * settle resolved correctly on a write that had explicitly failed. The registry
 * said `tasks.add=degraded` the whole time. The invariant held; the write did
 * not.
 *
 * Writes are now chained, so they run one at a time in the order the store
 * mutated.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

await import("../src/genesis/index");
const { akira, settlePendingPersistence, pendingPersistenceCount } =
  await import("../src/persistence/akira-store");
const { getDatabaseConnection } = await import("../src/persistence/connection");
const { healthRegistry } = await import("../src/observability/health/health-registry");

const db = getDatabaseConnection();
const rows = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

/** Every persistence operation the health registry currently reports as unwell. */
function unhealthyWrites(): string[] {
  return ["projects.add", "tasks.add", "notes.add", "reset"]
    .map((op) => ({ op, health: healthRegistry.get(`akira-store.persist.${op}`) }))
    .filter(({ health }) => health && health.status !== "healthy")
    .map(({ op, health }) => `${op}=${health!.status}`);
}

beforeEach(async () => {
  await settlePendingPersistence();
  for (const table of ["tasks", "notes", "projects"]) db.prepare(`DELETE FROM ${table}`).run();
  const state = akira.getState();
  akira.initializeState({ ...state, projects: [], tasks: [], notes: [], chat: [] });
  await settlePendingPersistence();
  for (const table of ["tasks", "notes", "projects"]) db.prepare(`DELETE FROM ${table}`).run();
});

describe("a task written straight after its project", () => {
  it("lands, and does not fail its foreign key", async () => {
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "book ground school", projectId });

    await settlePendingPersistence();

    expect(rows("projects"), "the project did not land").toBe(1);
    expect(rows("tasks"), "the task lost its race with the project").toBe(1);
    expect(unhealthyWrites(), "a write failed").toEqual([]);
  });

  it("survives twenty rounds of the same sequence", async () => {
    // The failure was latency-dependent -- it hit the first round, where the
    // dynamic import inside `runInServerRuntime` is not yet cached -- so one
    // pass proves little. Twenty rounds with the cache cleared between them is
    // what made the original defect visible at 1 in 20.
    for (let round = 0; round < 20; round++) {
      for (const table of ["tasks", "projects"]) db.prepare(`DELETE FROM ${table}`).run();

      akira.addProject({ name: `P${round}` });
      const projectId = akira.getState().lastProjectId as string;
      akira.addTaskDetails({ title: `T${round}`, projectId });
      await settlePendingPersistence();

      expect(rows("tasks"), `round ${round} lost its task`).toBeGreaterThan(0);
    }
    expect(unhealthyWrites(), "a write failed across the twenty rounds").toEqual([]);
  });

  it("keeps every task when many are written in one burst", async () => {
    // Writes sharing a millisecond, and depending on one project that is itself
    // still being written.
    akira.addProject({ name: "Burst" });
    const projectId = akira.getState().lastProjectId as string;
    for (let i = 0; i < 25; i++) akira.addTaskDetails({ title: `burst ${i}`, projectId });

    await settlePendingPersistence();

    expect(rows("tasks"), "tasks were dropped from a burst").toBe(25);
    expect(unhealthyWrites()).toEqual([]);
  });
});

describe("settlement means what it says", () => {
  it("leaves nothing pending", async () => {
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "a task", projectId });
    akira.addNote({ title: "a note", content: "something" });
    expect(pendingPersistenceCount(), "nothing was tracked to settle").toBeGreaterThan(0);

    await settlePendingPersistence();

    expect(pendingPersistenceCount(), "settle returned with writes still tracked").toBe(0);
  });

  it("agrees with the store about what exists", async () => {
    // The invariant the original observation broke: after settling, the
    // database holds what the store holds. It said `store.tasks=1 db.tasks=0`.
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    for (const title of ["one", "two", "three"]) akira.addTaskDetails({ title, projectId });

    await settlePendingPersistence();

    expect(rows("tasks")).toBe(akira.getState().tasks.length);
    expect(rows("projects")).toBe(akira.getState().projects.length);
  });

  it("still reports a write that genuinely fails", async () => {
    // The other half of the invariant, and the reason settle was wrongly
    // suspected: a failed write resolves settle rather than rejecting it, and
    // the failure is held in the health registry. If that stopped being true,
    // a real loss would become silent again.
    akira.addProject({ name: "Orphan Test" });
    await settlePendingPersistence();

    // A task pointing at a project that does not exist: the same foreign key,
    // provoked deliberately this time.
    akira.addTaskDetails({ title: "orphan", projectId: "no-such-project" });
    await settlePendingPersistence();

    expect(rows("tasks"), "an orphan task was written").toBe(0);
    expect(
      healthRegistry.get("akira-store.persist.tasks.add")?.status,
      "a failed write was not reported anywhere",
    ).not.toBe("healthy");
  });
});

describe("a reset immediately after writes", () => {
  it("clears what was just written rather than racing it", async () => {
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "book ground school", projectId });
    // No settle here on purpose: the reset is enqueued while the writes above
    // are still in flight, which is what a user clicking reset does.
    akira.reset();

    await settlePendingPersistence();

    expect(rows("projects"), "a project survived the reset").toBe(0);
    expect(rows("tasks"), "a task survived the reset").toBe(0);
  });
});
