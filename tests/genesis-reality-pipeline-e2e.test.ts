/**
 * Real AKIRA OS action -> GENESIS cognition, end to end.
 *
 * This is the acceptance test for the event pipeline. It exists because every
 * subsystem test in this repository passed for months while the systems were
 * disconnected: GENESIS subscribed to the legacy bus, workspace events were
 * published on the instrumentation bus, and nothing crossed between them.
 *
 * The rules that make this test meaningful:
 *
 *   1. It attaches nothing. The adapter must already be wired by
 *      `genesis/composition.ts`; importing `@/genesis` is the whole setup. A
 *      test that attaches the boundary itself proves only that the boundary can
 *      work, not that production uses it.
 *   2. It injects no MemoryEvent. Every cognitive result below originates from
 *      `akira.addProject` / `addTaskDetails` / `toggleTask` — the same calls the
 *      UI makes — and travels the real `publish()` path.
 *
 * If this test fails, a real user completing a real task produces no memory.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

// Production entry point. Importing it composes GENESIS *and* attaches the
// reality adapter to the platform bus — that is the behaviour under test.
const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { globalEventBus } = await import("../src/instrumentation/event-bus");
const { publish } = await import("../src/instrumentation");
const { Events } = await import("../src/contracts/events");
// Imported to READ metrics, never to attach.
const { genesisRealityAdapter } = await import("../src/genesis/events/reality-adapter");

import type { AkiraEvent } from "../src/instrumentation/event-types";

/** Records every event that crosses the platform bus while `fn` runs. */
function observePlatformBus<T>(fn: () => T): { result: T; events: AkiraEvent[] } {
  const events: AkiraEvent[] = [];
  const monitor = {
    id: `bus-monitor-${Math.random()}`,
    onEvent: (e: AkiraEvent) => void events.push(e),
  };
  globalEventBus.subscribe(monitor);
  try {
    return { result: fn(), events };
  } finally {
    globalEventBus.unsubscribe(monitor);
  }
}

/** Drives the real OS actions for one project and returns what they produced. */
function completeATaskForANewProject(projectName: string) {
  akira.addProject({ name: projectName });
  const projectId = akira.getState().lastProjectId as string;

  const taskTitle = `Ship it (${projectName})`;
  akira.addTaskDetails({ title: taskTitle, projectId });
  const task = akira.getState().tasks.find((t) => t.title === taskTitle);
  if (!task) throw new Error("the store action did not create the task");

  akira.toggleTask(task.id);
  return { projectId, taskId: task.id, taskTitle };
}

describe("production wiring", () => {
  it("attaches the reality adapter through GENESIS composition, not through this test", () => {
    // The whole point of the milestone: importing GENESIS opens the boundary.
    expect(genesisRealityAdapter.isAttached()).toBe(true);
    expect(globalEventBus.hasSubscriber(genesisRealityAdapter)).toBe(true);

    const names = genesis.GENESIS_COGNITIVE_PROCESSORS.map((p) => p.name);
    expect(names).toContain("realityAdapter");
  });
});

describe("real AKIRA OS action reaches GENESIS cognition", () => {
  it("carries a completed task from the store all the way to understanding", () => {
    const before = {
      candidates: genesis.candidateService.getCandidates().length,
      memories: genesis.memoryService.getMemories().length,
      translated: genesisRealityAdapter.getMetrics().translated,
      understandings: genesis.understandingEngine.getUnderstandings().length,
    };

    // ---- 1-3. Real OS actions, observed on the real platform bus ----
    const { result, events } = observePlatformBus(() => completeATaskForANewProject("Recovery"));
    const { projectId, taskTitle } = result;

    // The platform genuinely published the events; nothing was synthesised.
    const publishedTypes = events.map((e) => e.type);
    expect(publishedTypes).toContain(Events.PROJECT_CREATED);
    expect(publishedTypes).toContain(Events.TASK_CREATED);
    expect(publishedTypes).toContain(Events.TASK_COMPLETED);
    // Every published event is a well-formed envelope.
    for (const event of events) {
      expect(event.id, "each platform event needs an id for idempotency").toBeTruthy();
      expect(event.source).toBeTruthy();
    }

    // ---- 4a. The adapter received and translated ----
    const metrics = genesisRealityAdapter.getMetrics();
    expect(metrics.translated).toBeGreaterThan(before.translated);
    // task.created is outside the allowlist and must have been ignored, not failed.
    expect(metrics.failed).toBe(0);
    expect(Object.keys(metrics.ignoredTypes)).toContain(Events.TASK_CREATED);

    // ---- 4b. Candidate ----
    const candidates = genesis.candidateService.getCandidates();
    expect(candidates.length).toBeGreaterThan(before.candidates);
    const candidate = candidates.find((c) => c.metadata?.title === taskTitle);
    expect(candidate, "a candidate must exist for the completed task").toBeDefined();
    expect(candidate!.reason).toBe("Goal Progress");

    // ---- 4c. Validated memory ----
    const memories = genesis.memoryService.getMemories();
    expect(memories.length).toBeGreaterThan(before.memories);
    const memory = memories.find((m) => m.candidateId === candidate!.id);
    expect(memory, "the candidate must have been validated into a memory").toBeDefined();
    expect(memory!.relatedProjectId).toBe(projectId);

    // ---- 4d. Story ----
    const story = genesis.storyService
      .getStories()
      .find((s) => s.summary.includes(`ID: ${projectId}`));
    expect(story, "a Project Arc story must exist for the project").toBeDefined();
    expect(story!.relatedMemoryIds).toContain(memory!.id);

    // ---- 4e. Importance ----
    expect(genesis.importanceService.getImportance(memory!.id)).toBeDefined();

    // ---- 4f. Understanding ----
    expect(genesis.understandingEngine.getUnderstandings().length).toBeGreaterThanOrEqual(
      Math.max(before.understandings, 1),
    );
  });
});

describe("idempotency on AkiraEvent.id", () => {
  it("does not create a second memory when the same platform event is redelivered", () => {
    // Capture a genuine event off the bus rather than fabricating one.
    const { result, events } = observePlatformBus(() => completeATaskForANewProject("Idempotency"));
    const completion = events.find((e) => e.type === Events.TASK_COMPLETED);
    expect(completion, "the real action must have published a completion").toBeDefined();

    const memoriesForProject = () =>
      genesis.memoryService.getMemories().filter((m) => m.relatedProjectId === result.projectId);

    const afterFirst = {
      memories: genesis.memoryService.getMemories().length,
      stories: genesis.storyService.getStories().length,
      dupes: genesisRealityAdapter.getMetrics().duplicatesSuppressed,
      // Two by design: project.created and task.completed each match a
      // candidate rule. What must not change is this count after redelivery.
      forProject: memoriesForProject().length,
    };
    expect(afterFirst.forProject).toBe(2);

    // Redeliver the exact same envelope, twice.
    globalEventBus.publish(completion!);
    globalEventBus.publish(completion!);

    expect(genesis.memoryService.getMemories().length).toBe(afterFirst.memories);
    expect(genesis.storyService.getStories().length).toBe(afterFirst.stories);
    expect(genesisRealityAdapter.getMetrics().duplicatesSuppressed).toBe(afterFirst.dupes + 2);

    // The project's own memories are untouched by the redelivery.
    expect(memoriesForProject()).toHaveLength(afterFirst.forProject);

    // And the story for it gained no extra memory links.
    const story = genesis.storyService
      .getStories()
      .find((st) => st.summary.includes(`ID: ${result.projectId}`));
    expect(story!.relatedMemoryIds).toHaveLength(afterFirst.forProject);
  });
});

describe("event loop prevention", () => {
  it("publishes nothing back onto the platform bus during a cognitive cycle", () => {
    const { events } = observePlatformBus(() => completeATaskForANewProject("LoopCheck"));

    // The full cascade — candidate, memory, story, importance, understanding —
    // must not put a single new event on the bus. Anything beyond what the store
    // itself published would be a feedback edge.
    const fromStore = events.filter(
      (e) => e.source === "projects-store" || e.source === "tasks-store",
    );
    expect(events.length).toBe(fromStore.length);

    // saveMemory() writes to the store without republishing; if that ever
    // changes, the counts above diverge and this test fails.
    expect(events.every((e) => e.source !== "genesis")).toBe(true);
  });
});

describe("unknown events and failure isolation", () => {
  it("safely ignores platform events outside the allowlist", () => {
    const before = genesisRealityAdapter.getMetrics();

    publish({
      type: Events.SETTINGS_UPDATED,
      source: "settings-store",
      payload: { theme: "dark" },
      version: 1,
    });

    const after = genesisRealityAdapter.getMetrics();
    expect(after.ignored).toBe(before.ignored + 1);
    expect(after.failed).toBe(before.failed);
    expect(after.ignoredTypes[Events.SETTINGS_UPDATED]).toBeGreaterThan(0);
  });

  it("keeps the OS action, peer subscribers and persistence working when GENESIS fails", () => {
    const peerSaw: string[] = [];
    const peer = {
      id: "peer-persistence-stand-in",
      onEvent: (e: AkiraEvent) => void peerSaw.push(e.id),
    };
    globalEventBus.subscribe(peer);

    const before = genesisRealityAdapter.getMetrics();

    // A supported type with a malformed payload: the project translator
    // dereferences payload.name, so the adapter faults on a real publish.
    expect(() =>
      publish({
        type: Events.PROJECT_CREATED,
        source: "projects-store",
        payload: null,
        version: 1,
      }),
    ).not.toThrow();

    expect(genesisRealityAdapter.getMetrics().failed).toBe(before.failed + 1);
    expect(peerSaw).toHaveLength(1);

    // The platform is unharmed: a real OS action still completes and still
    // produces cognition after the fault.
    const { projectId } = completeATaskForANewProject("AfterFailure");
    expect(akira.getState().projects.some((p) => p.id === projectId)).toBe(true);
    expect(genesis.memoryService.getMemories().some((m) => m.relatedProjectId === projectId)).toBe(
      true,
    );

    globalEventBus.unsubscribe(peer);
  });
});

describe("ordering", () => {
  it("delivers project and task events in publication order", () => {
    const { events } = observePlatformBus(() => completeATaskForANewProject("Ordering"));

    const indexOf = (type: string) => events.findIndex((e) => e.type === type);
    expect(indexOf(Events.PROJECT_CREATED)).toBeGreaterThanOrEqual(0);
    expect(indexOf(Events.PROJECT_CREATED)).toBeLessThan(indexOf(Events.TASK_CREATED));
    expect(indexOf(Events.TASK_CREATED)).toBeLessThan(indexOf(Events.TASK_COMPLETED));
  });
});

describe("observability", () => {
  it("distinguishes published, translated, ignored, deduplicated and failed", () => {
    const metrics = genesisRealityAdapter.getMetrics();

    // Each signal must be separately readable, so a future regression cannot
    // quietly return the system to "events published but GENESIS sees nothing".
    expect(metrics.received).toBeGreaterThan(0);
    expect(metrics.translated).toBeGreaterThan(0);
    expect(metrics.ignored).toBeGreaterThan(0);
    expect(metrics.duplicatesSuppressed).toBeGreaterThan(0);
    expect(metrics.failed).toBeGreaterThan(0);
    expect(metrics.received).toBeGreaterThanOrEqual(
      metrics.translated + metrics.ignored + metrics.duplicatesSuppressed,
    );
    expect(metrics.lastError).not.toBeNull();
  });
});
