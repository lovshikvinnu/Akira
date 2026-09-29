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

  return {
    akira,
    habitService,
    focusSwitches,
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
