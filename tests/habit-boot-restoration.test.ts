/**
 * Restoring the workspace at boot is not the user switching focus.
 *
 * `__root.tsx` initializes the habit engine synchronously in its boot effect,
 * against the unhydrated seed (`lastProjectId: null`); `initializeState` then
 * lands the persisted project in one emission, after SQLite answers. The engine
 * read that as a transition and recorded a habit on every start. Measured
 * before the fix, three boots of a returning user who had done nothing:
 *
 *     boot 1..3: habits ['Workspace Focus Switch/BehaviorObserved/proj-returning']
 *
 * Each "process" here is a fresh module graph (`vi.resetModules`), so the
 * store's one-way `hydrated` flag starts false exactly as it does at a real
 * start, and a temp-file database carries data from one process to the next.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import type { AkiraState } from "../src/shared/types/store-types";

const FOCUS_SWITCH = "Workspace Focus Switch";

/**
 * Each `boot()` builds a fresh module graph, which takes seconds. A test doing
 * two of them brushes vitest's 5s default and fails as a timeout rather than on
 * an assertion, and the aborted test then leaves the SQLite handle open so
 * `afterEach` cannot remove the temp directory on Windows. Fixture cost, not
 * behaviour, so the budget is stated rather than discovered.
 */
const BOOT_TIMEOUT_MS = 30_000;
vi.setConfig({ testTimeout: BOOT_TIMEOUT_MS });
let dbPath: string;

/** One application process, booted in `__root.tsx`'s order. */
async function boot() {
  vi.resetModules();
  process.env.AKIRA_DATABASE_PATH = dbPath;
  process.env.NODE_ENV = "test";

  const { initializeDatabase } = await import("../src/persistence/initializer");
  initializeDatabase();
  await import("../src/genesis/index");
  const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
  const { habitService } = await import("../src/genesis/context/habits/service");
  const { projectRepository, settingsRepository } = await import("../src/persistence/repositories");
  const { closeDatabaseConnection } = await import("../src/persistence/connection");

  // The boot effect: engines start against the unhydrated seed ...
  expect(akira.isHydrated(), "the process did not start unhydrated").toBe(false);
  habitService.initialize();

  // ... then the async loader restores what SQLite holds (getInitialState's reads).
  const last = settingsRepository.get("last_project_id");
  akira.initializeState({
    ...(akira.getState() as AkiraState),
    projects: projectRepository.getAll(),
    lastProjectId: last ? JSON.parse(last) : null,
  });

  const focusSwitches = () =>
    (habitService.getContext()?.observedHabits ?? []).filter((h) => h.name === FOCUS_SWITCH);

  /**
   * Observations recorded, not habits held.
   *
   * `recordBehaviorObservation` MERGES into an existing habit when the name and
   * `contextDependency.projectId` both match, so returning to a project already
   * seen adds evidence without adding a habit. Counting habits cannot see a
   * re-observation at all.
   */
  const focusObservations = () =>
    focusSwitches().reduce((n, h) => n + (h.evidence?.length ?? 0), 0);

  return {
    akira,
    habitService,
    focusSwitches,
    focusObservations,
    async exit() {
      await settlePendingPersistence();
      habitService.shutdown();
      closeDatabaseConnection();
    },
  };
}

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "akira-habit-boot-")), "akira.db");
});

afterEach(() => {
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

describe("booting does not fabricate a focus switch", () => {
  it("on a first-ever start", async () => {
    const app = await boot();

    expect(app.focusSwitches()).toEqual([]);
    await app.exit();
  });

  it("on the start of a returning user whose last project is persisted", async () => {
    const first = await boot();
    first.akira.addProject({ name: "Kitchen Renovation" });
    const projectId = first.akira.getState().lastProjectId;
    await first.exit();

    const second = await boot();

    // The fixture has to restore a project, or there is no transition to misread.
    expect(second.akira.getState().lastProjectId).toBe(projectId);
    expect(second.focusSwitches()).toEqual([]);
    await second.exit();
  });

  it("across repeated restarts", async () => {
    const first = await boot();
    first.akira.addProject({ name: "Kitchen Renovation" });
    await first.exit();

    for (let restart = 1; restart <= 3; restart++) {
      const app = await boot();
      expect(app.focusSwitches(), `restart ${restart}`).toEqual([]);
      await app.exit();
    }
  });
});

describe("a genuine focus switch is still observed", () => {
  it("when the user opens another project", async () => {
    const app = await boot();
    app.akira.addProject({ name: "First" });
    const first = app.akira.getState().lastProjectId as string;
    app.akira.addProject({ name: "Second" });
    app.habitService.initialize(); // start clean: two adds are two switches already

    app.akira.touchProject(first);

    const switches = app.focusSwitches();
    expect(switches).toHaveLength(1);
    expect(switches[0].contextDependency?.projectId).toBe(first);
    await app.exit();
  });

  it("after a restart, once the workspace is restored", async () => {
    const first = await boot();
    first.akira.addProject({ name: "First" });
    const firstId = first.akira.getState().lastProjectId as string;
    first.akira.addProject({ name: "Second" });
    await first.exit();

    const app = await boot();
    expect(app.focusSwitches(), "the boot itself").toEqual([]);

    app.akira.touchProject(firstId);

    expect(app.focusSwitches().map((h) => h.contextDependency?.projectId)).toEqual([firstId]);
    await app.exit();
  });

  it("once, when the engine has been initialized repeatedly", async () => {
    const app = await boot();
    app.akira.addProject({ name: "First" });
    const first = app.akira.getState().lastProjectId as string;
    app.akira.addProject({ name: "Second" });

    // `__root.tsx` runs shutdown/initialize on every remount; StrictMode does
    // it on every development boot. Neither may fabricate or double-count.
    app.habitService.initialize();
    app.habitService.shutdown();
    app.habitService.initialize();
    app.habitService.initialize();
    expect(app.focusSwitches(), "re-initializing a hydrated engine").toEqual([]);

    app.akira.touchProject(first);

    const switches = app.focusSwitches();
    expect(switches).toHaveLength(1);
    expect(switches[0].evidence).toHaveLength(1);
    await app.exit();
  });
});

describe("deleting a project", () => {
  it(
    "records no focus switch when the active project is deleted and another survives",
    async () => {
      const app = await boot();
      app.akira.addProject({ name: "Kitchen Renovation" });
      app.akira.addProject({ name: "Tax Return" });
      const active = app.akira.getState().lastProjectId!;

      // Guard: the fixture is the case under test -- an active project, and a
      // survivor for the store to reassign to. Without both, a pass proves
      // nothing because no reassignment would occur.
      expect(active).toBeTruthy();
      expect(app.akira.getState().projects.length).toBe(2);

      const before = app.focusObservations();
      app.akira.deleteProject(active);

      expect(app.akira.getState().projects.length).toBe(1);
      expect(app.akira.getState().lastProjectId, "the store did reassign").toBe(
        app.akira.getState().projects[0].id,
      );
      expect(app.focusObservations(), "deletion recorded a focus switch").toBe(before);
      await app.exit();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "records no focus switch when a non-active project is deleted",
    async () => {
      const app = await boot();
      app.akira.addProject({ name: "Kitchen Renovation" });
      const first = app.akira.getState().lastProjectId!;
      app.akira.addProject({ name: "Tax Return" });
      const active = app.akira.getState().lastProjectId!;
      expect(active).not.toBe(first);

      const before = app.focusObservations();
      app.akira.deleteProject(first);

      // `lastProjectId` never moves here, so this case was already correct. It is
      // pinned so a future rule keyed on deletion cannot start suppressing it.
      expect(app.akira.getState().lastProjectId).toBe(active);
      expect(app.focusObservations()).toBe(before);
      await app.exit();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "still records a real switch made after that deletion",
    async () => {
      const app = await boot();
      app.akira.addProject({ name: "Kitchen Renovation" });
      app.akira.addProject({ name: "Tax Return" });
      const active = app.akira.getState().lastProjectId!;
      app.akira.deleteProject(active);

      const survivor = app.akira.getState().projects[0].id;
      const before = app.focusObservations();

      // The user now deliberately opens the surviving project. Suppression must
      // not persist past the reassignment that caused it.
      app.akira.addProject({ name: "Garden" });
      app.akira.touchProject(survivor);

      expect(app.focusObservations(), "a deliberate switch was suppressed").toBeGreaterThan(before);
      await app.exit();
    },
    BOOT_TIMEOUT_MS,
  );
});

describe("a deliberate switch", () => {
  it(
    "records exactly one observation",
    async () => {
      const app = await boot();
      app.akira.addProject({ name: "Kitchen Renovation" });
      const first = app.akira.getState().lastProjectId!;
      app.akira.addProject({ name: "Tax Return" });

      const before = app.focusObservations();
      app.akira.touchProject(first);

      expect(app.focusObservations()).toBe(before + 1);
      await app.exit();
    },
    BOOT_TIMEOUT_MS,
  );
});

describe("observed habits are session-scoped", () => {
  it(
    "starts empty on a boot that follows real observed activity",
    async () => {
      // Pins Task A. This cannot pass vacuously: the first process asserts it
      // actually recorded a focus switch, so the second process's empty result is
      // the reset and not an inert fixture.
      const first = await boot();
      first.akira.addProject({ name: "Kitchen Renovation" });
      const a = first.akira.getState().lastProjectId!;
      first.akira.addProject({ name: "Tax Return" });
      first.akira.touchProject(a);
      expect(first.focusObservations(), "nothing was observed to lose").toBeGreaterThan(0);
      await first.exit();

      const second = await boot();
      expect(second.focusSwitches()).toEqual([]);
      expect(second.habitService.getContext()?.observedHabits ?? []).toEqual([]);
      await second.exit();
    },
    BOOT_TIMEOUT_MS,
  );
});
