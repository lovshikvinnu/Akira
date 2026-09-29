/**
 * One user's life with AKIRA, across restarts, through the production paths.
 *
 * Every hardening fix in deep-scan/chat6_findings.md was proven in isolation.
 * This walks them in one sequence, because the failures that audit found lived
 * in the seams between systems that were each correct alone:
 *
 *   create project -> tasks -> reorder -> work a session -> notes -> chat
 *   -> cognition -> RESTART -> reconstruction -> delete project -> retraction
 *   -> retained session history -> RESTART -> retention window -> RESTART
 *   -> keep working -> nothing fabricated
 *
 * Each "process" is a fresh module graph (`vi.resetModules`), so the store's
 * one-way `hydrated` flag starts false as at a real start, and boots in
 * `__root.tsx`'s order: engines first, then the async load, then
 * `memoryService.initialize()`. A temp-file database carries data across.
 * `getInitialState` cannot be called for its value here (its return is RPC
 * transport and comes back undefined in tests), so `load()` performs the same
 * reads.
 *
 * The prompt is captured from the real `aiContextEngine.executeRequestStream`
 * via a provider that records the system instruction, the way `chat.tsx`
 * calls it -- so "what the model is told" is measured, not reassembled.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import type { AkiraState } from "../src/shared/types/store-types";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-09-01T09:00:00.000Z").getTime();
let dbPath: string;
let open: { exit(): Promise<void> } | null = null;

async function boot() {
  vi.resetModules();
  process.env.AKIRA_DATABASE_PATH = dbPath;
  process.env.NODE_ENV = "test";

  const { initializeDatabase } = await import("../src/persistence/initializer");
  initializeDatabase();
  await import("../src/genesis/index");
  const store = await import("../src/persistence/akira-store");
  const { akira, settlePendingPersistence } = store;
  const repos = await import("../src/persistence/repositories");
  const { getDatabaseConnection, closeDatabaseConnection } =
    await import("../src/persistence/connection");
  const { presenceService } = await import("../src/akira-os/presence/service");
  const { companionStateService } = await import("../src/genesis/context/state/service");
  const { relationshipService } = await import("../src/genesis/context/relationships/service");
  const { habitService } = await import("../src/genesis/context/habits/service");
  const { reflectionService } = await import("../src/genesis/insights/reflection/service");
  const { contextResolutionService } =
    await import("../src/genesis/context/context-resolution/service");
  const { initiativeService } = await import("../src/genesis/context/initiative/service");
  const { memoryService } = await import("../src/genesis/memory/memory-service");
  const { storyService } = await import("../src/genesis/stories/story-service");
  const { understandingEngine } = await import("../src/genesis/understanding/engine");
  const { candidateService } = await import("../src/genesis/candidate/candidate-service");
  const { identityService } = await import("../src/genesis/understanding/identity-service");
  const { importanceService } = await import("../src/genesis/importance/importance-service");
  const { recallService } = await import("../src/genesis/recall/recall-service");
  const memoryRelationships = (
    await import("../src/genesis/memory/relationships/relationship-service")
  ).relationshipService;
  const { contextService } = await import("../src/genesis/context/context-service");
  const { providerRegistry } = await import("../src/genesis/context/ai/provider-registry");
  const { aiContextEngine } = await import("../src/genesis/context/ai/context-engine");

  const writeErrors: string[] = [];
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    const line = a.map(String).join(" ");
    if (line.includes("failed")) writeErrors.push(line.slice(0, 200));
  });

  // __root.tsx's boot effect, against the unhydrated store.
  expect(akira.isHydrated()).toBe(false);
  presenceService.initialize();
  companionStateService.bootstrap();
  relationshipService.initialize();
  habitService.initialize();
  reflectionService.initialize();
  contextResolutionService.initialize();
  initiativeService.initialize();

  // The async loader: getInitialState's reads, then cognition rebuilt.
  const json = (key: string) => {
    const raw = repos.settingsRepository.get(key);
    return raw ? JSON.parse(raw) : null;
  };
  akira.initializeState({
    ...(akira.getState() as AkiraState),
    projects: repos.projectRepository.getAll(),
    tasks: repos.taskRepository.getAll(),
    notes: repos.noteRepository.getAll(),
    sessions: repos.sessionRepository.getAll(),
    activeSession: json("active_session"),
    lastProjectId: json("last_project_id"),
    chat: json("chat") ?? [],
    memories: json("genesis_memories") ?? [],
  });
  memoryService.initialize();

  let captured = "";
  providerRegistry.registerProvider({
    name: "capture",
    async generateContent(request) {
      captured = request.systemInstruction ?? "";
      return {
        responseId: "r",
        provider: "capture",
        model: "capture",
        content: "",
        finishReason: "stop",
      } as never;
    },
  });
  providerRegistry.setActiveProvider("capture");

  const db = getDatabaseConnection();

  const app = {
    akira,
    db,
    repos,
    writeErrors,
    /** The system instruction the model receives for `question`, as chat.tsx sends it. */
    async promptFor(question: string): Promise<string> {
      await aiContextEngine.executeRequestStream(
        question,
        () => {},
        contextService.getActiveContext() || undefined,
      );
      return captured;
    },
    cognition() {
      return {
        // By content: memory ids are minted fresh on every replay (derived
        // state), so identity across a restart is what they say and when.
        memories: memoryService
          .getMemories()
          .map((m) => `${m.timestamp}|${m.title}|${m.description}`)
          .sort(),
        stories: storyService
          .getStories()
          .map((s) => s.title)
          .sort(),
        understandings: understandingEngine
          .getUnderstandings()
          .map((u) => `${u.canonicalKey}:${u.status}`)
          .sort(),
        // The rest of the nine derived structures Chat 5 proved replay-
        // equivalent (zz-c5-restart-journey). Their ids are minted per
        // replay, so they are compared by count; the above by content.
        counts: {
          durableStream: akira.getState().memories.length,
          candidates: candidateService.getCandidates().length,
          memoryRelationships: memoryRelationships.getRelationships().length,
          importance: importanceService.getAllImportance().length,
          recallCandidates: recallService.getRecallCandidates().length,
        },
        identity: identityService
          .getObservations()
          .map((o) => `${o.name}=${o.value}`)
          .sort(),
        contacts: (relationshipService.getContext()?.importantPeople ?? [])
          .map((p) => p.name)
          .sort(),
      };
    },
    focusSwitches: () =>
      (habitService.getContext()?.observedHabits ?? []).filter(
        (h) => h.name === "Workspace Focus Switch",
      ),
    companion: () => companionStateService.getState(),
    searchableSessions: () =>
      (
        db.prepare("SELECT title FROM fts_workspace WHERE entity_type = 'session'").all() as {
          title: string;
        }[]
      ).map((r) => r.title),
    async exit() {
      open = null;
      await settlePendingPersistence();
      for (const s of [
        initiativeService,
        contextResolutionService,
        reflectionService,
        habitService,
        relationshipService,
        presenceService,
      ])
        s.shutdown();
      companionStateService.closeSession();
      providerRegistry.clear();
      errorSpy.mockRestore();
      closeDatabaseConnection();
    },
    settle: settlePendingPersistence,
  };
  open = app;
  return app;
}

type App = Awaited<ReturnType<typeof boot>>;
const titles = (app: App) => app.akira.getState().tasks.map((t) => t.title);
const sessionTasks = (list: { task: string }[]) => list.map((s) => s.task).sort();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "akira-journey-")), "akira.db");
});

afterEach(async () => {
  await open?.exit();
});

afterAll(() => {
  vi.useRealTimers();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

// One journey: each step depends on the state the previous one left on disk.
describe.sequential("a user's journey through AKIRA", { timeout: 60_000 }, () => {
  let kitchenId = "";
  let gardenId = "";
  let before: ReturnType<App["cognition"]>;

  it("day 1: builds a project, works it, writes about it, talks to AKIRA", async () => {
    const app = await boot();
    const { akira } = app;

    akira.addProject({ name: "Garden" });
    gardenId = akira.getState().lastProjectId as string;
    akira.addProject({ name: "Kitchen Renovation" });
    kitchenId = akira.getState().lastProjectId as string;

    for (const title of ["Order tiles", "Remove cabinets", "Seal grout"]) {
      akira.addTaskDetails({ title, projectId: kitchenId });
    }
    await app.settle();
    const [a, b, c] = akira.getState().tasks.map((t) => t.id);
    akira.reorderTasks([c, a, b]);

    akira.startSession(kitchenId, "Demolition");
    vi.setSystemTime(T0 + 45 * 60 * 1000);
    akira.toggleTask(b); // "Remove cabinets" completed inside the session
    akira.endSession("Cabinets out");

    akira.addNote({
      title: "Tile plan",
      content: "Grey hex tiles, epoxy grout",
      projectId: kitchenId,
    } as never);
    akira.addChatMessage("user", "@Sarah reviewed the tile plan with me");
    await app.settle();

    before = app.cognition();
    expect(titles(app)).toEqual(["Seal grout", "Order tiles", "Remove cabinets"]);
    expect(before.contacts).toEqual(["Sarah"]);
    expect(before.understandings).toContain(`project:${kitchenId}:Active`);
    expect(before.memories.length, "no cognition was generated").toBeGreaterThan(0);
    expect(before.stories.length).toBeGreaterThan(0);
    expect(await app.promptFor("How is my kitchen project going?")).toContain("Kitchen Renovation");
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });

  it("restart: everything is reconstructed, nothing is invented", async () => {
    vi.setSystemTime(T0 + 1 * DAY);
    const app = await boot();

    expect(titles(app), "task order after restart").toEqual([
      "Seal grout",
      "Order tiles",
      "Remove cabinets",
    ]);
    expect(app.akira.getState().tasks.find((t) => t.title === "Remove cabinets")?.done).toBe(true);
    expect(sessionTasks(app.akira.getState().sessions)).toEqual(["Demolition"]);
    expect(app.cognition()).toEqual(before);
    expect(app.focusSwitches(), "the boot fabricated a focus switch").toEqual([]);
    expect(app.companion()?.currentFocus, "no session is running").not.toBe("Building");
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });

  it("deleting the project retracts it and keeps its session history", async () => {
    vi.setSystemTime(T0 + 2 * DAY);
    const app = await boot();
    app.akira.touchProject(kitchenId);
    const switchesBefore = app.focusSwitches().length;

    app.akira.deleteProject(kitchenId);
    await app.settle();

    const prompt = await app.promptFor("What am I working on right now?");
    expect(prompt).not.toMatch(/actively building Kitchen Renovation/);
    expect(prompt).not.toContain("Active Project: Kitchen Renovation");
    // Present, and archived: history kept, current-state claim retracted.
    expect(
      app.cognition().understandings.filter((u) => u.startsWith(`project:${kitchenId}:`)),
    ).toEqual([`project:${kitchenId}:Archived`]);
    expect(app.companion()?.activeProject?.id).toBe(gardenId);

    expect(sessionTasks(app.akira.getState().sessions)).toEqual(["Demolition"]);
    expect(sessionTasks(app.repos.sessionRepository.getAll())).toEqual(["Demolition"]);
    expect(app.searchableSessions()).toEqual(["Demolition"]);

    // Deletion reassigns the active project; the user did not switch focus.
    expect(app.focusSwitches().length, "reassignment after delete read as a focus switch").toBe(
      switchesBefore,
    );
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });

  it("restart after deletion: history kept, the project stays gone", async () => {
    vi.setSystemTime(T0 + 3 * DAY);
    const app = await boot();
    const s = app.akira.getState();

    expect(s.projects.map((p) => p.id)).toEqual([gardenId]);
    expect(s.lastProjectId).toBe(gardenId);
    expect(s.activeSession).toBeNull();
    expect(sessionTasks(s.sessions)).toEqual(["Demolition"]);
    expect(s.sessions[0].projectId).toBe("");
    expect(app.focusSwitches()).toEqual([]);
    expect(await app.promptFor("What am I working on?")).not.toContain(
      "Active Project: Kitchen Renovation",
    );
    await app.exit();
  });

  it("30 days after deletion the session is gone, from history and from search", async () => {
    vi.setSystemTime(T0 + 2 * DAY + 30 * DAY);
    const app = await boot();

    expect(app.akira.getState().sessions).toEqual([]);
    expect(app.repos.sessionRepository.getAll()).toEqual([]);
    expect(app.searchableSessions(), "an expired session is still searchable").toEqual([]);
    await app.exit();
  });

  it("the user keeps working, and nothing fabricated appears", async () => {
    vi.setSystemTime(T0 + 40 * DAY);
    const app = await boot();
    const { akira } = app;

    akira.addTaskDetails({ title: "Plant tomatoes", projectId: gardenId });
    await app.settle();
    const t = akira.getState().tasks.find((x) => x.title === "Plant tomatoes")!;
    akira.startSession(gardenId, "Planting");
    akira.toggleTask(t.id);
    akira.endSession("Done");
    akira.addChatMessage("user", "@Sarah says the tomatoes need more sun");
    await app.settle();

    const prompt = await app.promptFor("What should I do next in the garden?");
    expect(prompt).not.toContain("Active Project: Kitchen Renovation");
    expect(prompt).not.toMatch(/actively building Kitchen Renovation/);
    expect(app.companion()?.currentFocus).not.toBe("Building");
    expect(app.focusSwitches()).toEqual([]);
    expect(app.cognition().contacts).toEqual(["Sarah"]);
    expect(sessionTasks(app.repos.sessionRepository.getAll())).toEqual(["Planting"]);
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });
});
