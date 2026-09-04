/**
 * Durable retention by class: what AKIRA still knows after a year.
 *
 * The durable `MemoryEvent` stream is the only cognitive state that survives a
 * reload -- memories, stories, importance, identity and understanding are all
 * rebuilt from it. It used to be truncated by recency alone, so the events that
 * described a person's actual history were evicted by the events that described
 * their morning: a project started months ago lost its place to a task ticked
 * today, permanently and silently.
 *
 * Retention is now per durability class. Core (milestones and things the user
 * wrote) and Episodic (routine activity) are bounded independently and each
 * evicts by recency within itself, so Episodic volume can never displace Core
 * history.
 *
 * These tests pin that property at the level it matters -- a real workload, a
 * real restart, and the cognition that comes back afterwards -- and the bounds
 * that keep it from becoming unbounded retention instead.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { MemoryEvent } from "../src/shared/types/event-types";
import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const {
  applyDurableRetention,
  classifyDurability,
  getRetentionPolicy,
  setRetentionPolicy,
  resetRetentionPolicy,
} = await import("../src/genesis/retention/policy");

function durableStream(): MemoryEvent[] {
  return [...akira.getState().memories];
}

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  genesis.importanceService.clearHistory();
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

const coreOf = (stream: MemoryEvent[]) =>
  stream.filter((e) => classifyDurability(e.eventType) === "Core");
const episodicOf = (stream: MemoryEvent[]) =>
  stream.filter((e) => classifyDurability(e.eventType) === "Episodic");

describe("durability classification", () => {
  it("protects milestones and user-authored facts", () => {
    expect(classifyDurability("project_created")).toBe("Core");
    expect(classifyDurability("project_updated")).toBe("Core");
    expect(classifyDurability("note_created")).toBe("Core");
    expect(classifyDurability("note_edited")).toBe("Core");
  });

  it("treats routine activity as episodic", () => {
    expect(classifyDurability("task_completed")).toBe("Episodic");
    expect(classifyDurability("project_continued")).toBe("Episodic");
    expect(classifyDurability("mission_completed")).toBe("Episodic");
    expect(classifyDurability("presence_updated")).toBe("Episodic");
  });

  it("makes an unknown event type earn durability rather than inherit it", () => {
    expect(classifyDurability("some.future.event")).toBe("Episodic");
    expect(classifyDurability("")).toBe("Episodic");
  });
});

describe("applyDurableRetention", () => {
  beforeEach(() => resetRetentionPolicy());
  afterEach(() => resetRetentionPolicy());

  const ev = (eventType: string, id: string) => ({ eventType, id }) as MemoryEvent;

  it("bounds each class independently", () => {
    setRetentionPolicy({ maxCoreMemoryEvents: 2, maxMemoryEvents: 3 });

    const stream = [
      ev("note_created", "c1"),
      ev("task_completed", "e1"),
      ev("note_created", "c2"),
      ev("task_completed", "e2"),
      ev("note_created", "c3"),
      ev("task_completed", "e3"),
      ev("task_completed", "e4"),
    ];

    const kept = applyDurableRetention(stream);
    expect(kept.map((e) => e.id)).toEqual(["c1", "e1", "c2", "e2", "e3"]);
  });

  it("preserves newest-first order and interleaving", () => {
    setRetentionPolicy({ maxCoreMemoryEvents: 10, maxMemoryEvents: 10 });
    const stream = [ev("task_completed", "a"), ev("note_created", "b"), ev("task_completed", "c")];
    expect(applyDurableRetention(stream).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("is deterministic: identical input yields identical output", () => {
    setRetentionPolicy({ maxCoreMemoryEvents: 3, maxMemoryEvents: 4 });
    const stream = Array.from({ length: 40 }, (_, i) =>
      ev(i % 3 === 0 ? "note_created" : "task_completed", `x${i}`),
    );
    const first = applyDurableRetention(stream).map((e) => e.id);
    const second = applyDurableRetention(stream).map((e) => e.id);
    expect(second).toEqual(first);
  });

  it("is idempotent: re-applying retention changes nothing", () => {
    setRetentionPolicy({ maxCoreMemoryEvents: 3, maxMemoryEvents: 4 });
    const stream = Array.from({ length: 40 }, (_, i) =>
      ev(i % 3 === 0 ? "note_created" : "task_completed", `x${i}`),
    );
    const once = applyDurableRetention(stream);
    const twice = applyDurableRetention(once);
    expect(twice.map((e) => e.id)).toEqual(once.map((e) => e.id));
  });

  it("keeps nothing when a class cap is zero, and does not touch the other", () => {
    setRetentionPolicy({ maxCoreMemoryEvents: 0, maxMemoryEvents: 2 });
    const kept = applyDurableRetention([
      ev("note_created", "c1"),
      ev("task_completed", "e1"),
      ev("task_completed", "e2"),
      ev("task_completed", "e3"),
    ]);
    expect(kept.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("Core history survives Episodic volume", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("keeps a milestone that a flood of task completions would have evicted", () => {
    // A tight Episodic cap stands in for months of routine activity.
    setRetentionPolicy({ maxMemoryEvents: 5, maxCoreMemoryEvents: 100 });

    akira.addProject({ name: "Long Running Project" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addNote({ title: "Why I started this", content: "The reason it matters." });

    // Everything that follows is routine, and far more of it than the
    // Episodic cap can hold.
    for (let i = 0; i < 60; i++) completeTask(projectId, `routine-${i}`);

    const stream = durableStream();
    const core = coreOf(stream);
    const episodic = episodicOf(stream);

    // The old behaviour: a flat recency cut would have left only the last 5
    // events, all of them task completions.
    expect(episodic.length).toBeLessThanOrEqual(5);
    expect(core.length).toBeGreaterThanOrEqual(2);

    const titles = core.map((e) => e.title);
    expect(titles).toContain("Project Created");
    expect(titles).toContain("Note Created");
  });

  it("evicts within Core by recency once its own cap is reached", () => {
    setRetentionPolicy({ maxCoreMemoryEvents: 3, maxMemoryEvents: 50 });

    for (let i = 0; i < 8; i++) {
      akira.addNote({ title: `note-${i}`, content: `content ${i}` });
    }

    const core = coreOf(durableStream());
    expect(core.length).toBeLessThanOrEqual(3);

    // Newest kept, oldest gone -- recency still governs *within* a class.
    const descriptions = core.map((e) => e.description).join(" | ");
    expect(descriptions).toContain("note-7");
    expect(descriptions).not.toContain("note-0");
  });

  it("bounds the whole stream by the sum of the class caps", () => {
    setRetentionPolicy({ maxCoreMemoryEvents: 4, maxMemoryEvents: 6 });

    akira.addProject({ name: "Bounded" });
    const projectId = akira.getState().lastProjectId as string;
    for (let i = 0; i < 30; i++) {
      akira.addNote({ title: `n-${i}`, content: `c-${i}` });
      completeTask(projectId, `t-${i}`);
    }

    const policy = getRetentionPolicy();
    expect(durableStream().length).toBeLessThanOrEqual(
      policy.maxCoreMemoryEvents + policy.maxMemoryEvents,
    );
    expect(coreOf(durableStream()).length).toBeLessThanOrEqual(4);
    expect(episodicOf(durableStream()).length).toBeLessThanOrEqual(6);
  });
});

describe("durable retention and reconstruction", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("still knows about the project after the routine history is gone", () => {
    setRetentionPolicy({ maxMemoryEvents: 5, maxCoreMemoryEvents: 100 });

    akira.addProject({ name: "Enduring" });
    const projectId = akira.getState().lastProjectId as string;
    for (let i = 0; i < 40; i++) completeTask(projectId, `work-${i}`);

    // The real restart path: everything derived is dropped and rebuilt from
    // whatever the durable stream still holds.
    memoryService.reconstructRuntimeMemory();

    const titles = memoryService.getMemories().map((m) => m.title);
    expect(titles).toContain("Project Created");

    // And the arc for that project is still there to hang cognition on.
    const arc = storyService.getStories().find((s) => s.summary.includes(projectId));
    expect(arc).toBeDefined();
  });

  it("reconstructs deterministically from the retained stream", () => {
    setRetentionPolicy({ maxMemoryEvents: 8, maxCoreMemoryEvents: 50 });

    akira.addProject({ name: "Deterministic" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addNote({ title: "anchor", content: "an anchoring thought" });
    for (let i = 0; i < 25; i++) completeTask(projectId, `det-${i}`);

    const streamBefore = durableStream().map((e) => e.id);

    memoryService.reconstructRuntimeMemory();
    const first = memoryService.getMemories().map((m) => `${m.eventType}:${m.title}`);

    memoryService.reconstructRuntimeMemory();
    const second = memoryService.getMemories().map((m) => `${m.eventType}:${m.title}`);

    expect(second).toEqual(first);
    // Replay must not rewrite the record it is replaying.
    expect(durableStream().map((e) => e.id)).toEqual(streamBefore);
  });

  it("does not let reconstruction resurrect evicted history", () => {
    setRetentionPolicy({ maxMemoryEvents: 4, maxCoreMemoryEvents: 4 });

    akira.addProject({ name: "Capped" });
    const projectId = akira.getState().lastProjectId as string;
    for (let i = 0; i < 20; i++) completeTask(projectId, `gone-${i}`);

    const before = durableStream().length;
    memoryService.reconstructRuntimeMemory();

    expect(durableStream().length).toBe(before);
    expect(durableStream().length).toBeLessThanOrEqual(8);
  });
});
