/**
 * Protected history must be reachable, not merely stored.
 *
 * The durable stream bounds Core and Episodic events separately, so a founding
 * project survives a year of task completions on disk. That was only half the
 * problem. The runtime memory set was trimmed by age across the whole
 * collection, and reconstruction promotes oldest-first, so the Core events the
 * stream had protected were the *first* evicted on replay. Measured before this
 * change: a founding project and a founding note present in the durable stream,
 * absent from `memories[]`, absent from every story, both live and after
 * reconstruction. Permanently stored, entirely invisible to cognition.
 *
 * Runtime retention now applies the same per-class policy as the durable layer,
 * classifying by the same canonical `MemoryEvent.eventType`. These tests assert
 * the property that matters -- that protected knowledge can still be reasoned
 * over after the active window has turned over many times -- and the bound that
 * keeps "reachable" from meaning "unbounded".
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { classifyDurability, getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

recallBuilder.initialize();

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  recallService.clearHistory();
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

const coreMemories = () =>
  memoryService.getMemories().filter((m) => classifyDurability(m.eventType) === "Core");
const episodicMemories = () =>
  memoryService.getMemories().filter((m) => classifyDurability(m.eventType) === "Episodic");

/** Nothing derived may point at a memory that no longer exists. */
function expectNoDanglingReferences(): void {
  const live = new Set(memoryService.getMemories().map((m) => m.id));

  for (const story of storyService.getStories()) {
    for (const memoryId of story.relatedMemoryIds) expect(live.has(memoryId)).toBe(true);
    // A story with no surviving members should have been removed outright.
    expect(story.relatedMemoryIds.length).toBeGreaterThan(0);
  }
  for (const profile of importanceService.getAllImportance()) {
    expect(live.has(profile.memoryId)).toBe(true);
  }
  for (const link of relationshipService.getRelationships()) {
    expect(live.has(link.sourceMemoryId) || live.has(link.targetMemoryId)).toBe(true);
  }
  for (const candidate of recallService.getRecallCandidates()) {
    expect(live.has(candidate.memoryId)).toBe(true);
  }
}

/** A founding project plus user-authored knowledge, then months of routine work. */
function buildLongHistory(episodicVolume: number) {
  akira.addProject({ name: "Founding Project" });
  const foundingProjectId = akira.getState().lastProjectId as string;
  akira.addNote({ title: "Why this exists", content: "The founding intent, written down." });

  for (let later = 0; later < 4; later++) {
    akira.addProject({ name: `Later Project ${later}` });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < episodicVolume; i++) completeTask(pid, `l${later}-t${i}`);
  }
  return foundingProjectId;
}

describe("Core knowledge stays cognitively reachable", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("keeps the founding project reachable after the active window turns over", () => {
    // A tight Episodic cap stands in for months of routine activity; Core keeps
    // its production headroom.
    setRetentionPolicy({ maxMemories: 30, maxCoreMemories: 2000 });

    const foundingProjectId = buildLongHistory(40);

    // The active window has turned over many times.
    expect(episodicMemories().length).toBeLessThanOrEqual(30);

    // ...and the founding knowledge is still in cognition, not just on disk.
    const founding = memoryService
      .getMemories()
      .find((m) => m.relatedProjectId === foundingProjectId && m.eventType === "project_created");
    expect(founding).toBeDefined();

    const note = memoryService.getMemories().find((m) => m.eventType === "note_created");
    expect(note).toBeDefined();

    // Reachable means derived cognition can still see it.
    const arc = storyService.getStories().find((s) => s.summary.includes(foundingProjectId));
    expect(arc).toBeDefined();
    expect(arc!.relatedMemoryIds).toContain(founding!.id);
    expect(importanceService.getImportance(founding!.id)).not.toBeNull();

    expectNoDanglingReferences();
  });

  it("survives reconstruction, which is where it used to be lost", () => {
    setRetentionPolicy({ maxMemories: 30, maxCoreMemories: 2000 });
    const foundingProjectId = buildLongHistory(40);

    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();

    const founding = memoryService
      .getMemories()
      .find((m) => m.relatedProjectId === foundingProjectId && m.eventType === "project_created");
    expect(founding).toBeDefined();
    expect(memoryService.getMemories().some((m) => m.eventType === "note_created")).toBe(true);

    const arc = storyService.getStories().find((s) => s.summary.includes(foundingProjectId));
    expect(arc).toBeDefined();

    expectNoDanglingReferences();
  });

  it("is idempotent across repeated reconstruction", () => {
    setRetentionPolicy({ maxMemories: 30, maxCoreMemories: 2000 });
    const foundingProjectId = buildLongHistory(40);

    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();
    const first = memoryService.getMemories().map((m) => `${m.eventType}:${m.title}`);
    const firstCore = coreMemories().length;

    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();
    const second = memoryService.getMemories().map((m) => `${m.eventType}:${m.title}`);

    expect(second).toEqual(first);
    expect(coreMemories().length).toBe(firstCore);
    expect(
      memoryService
        .getMemories()
        .some((m) => m.relatedProjectId === foundingProjectId && m.eventType === "project_created"),
    ).toBe(true);

    expectNoDanglingReferences();
  });
});

describe("active cognition stays bounded", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("bounds each class independently and the whole set by their sum", () => {
    setRetentionPolicy({ maxMemories: 25, maxCoreMemories: 6 });

    for (let i = 0; i < 20; i++) {
      akira.addNote({ title: `n-${i}`, content: `c-${i}` });
    }
    akira.addProject({ name: "Bounded" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 90; i++) completeTask(pid, `t-${i}`);

    const policy = getRetentionPolicy();
    expect(coreMemories().length).toBeLessThanOrEqual(policy.maxCoreMemories);
    expect(episodicMemories().length).toBeLessThanOrEqual(policy.maxMemories);
    expect(memoryService.getMemories().length).toBeLessThanOrEqual(
      policy.maxCoreMemories + policy.maxMemories,
    );

    expectNoDanglingReferences();
  });

  it("evicts within Core by recency once Core reaches its own cap", () => {
    setRetentionPolicy({ maxMemories: 50, maxCoreMemories: 3 });

    for (let i = 0; i < 9; i++) {
      akira.addNote({ title: `note-${i}`, content: `body ${i}` });
    }

    const core = coreMemories();
    expect(core.length).toBeLessThanOrEqual(3);

    const descriptions = core.map((m) => m.description).join(" | ");
    expect(descriptions).toContain("note-8");
    expect(descriptions).not.toContain("note-0");

    expectNoDanglingReferences();
  });

  it("leaves no dangling derived references when Core itself is evicted", () => {
    setRetentionPolicy({ maxMemories: 20, maxCoreMemories: 2 });

    akira.addProject({ name: "Evictable A" });
    const a = akira.getState().lastProjectId as string;
    for (let i = 0; i < 10; i++) completeTask(a, `a-${i}`);

    // Enough Core churn to push project A's own creation memory out.
    for (let i = 0; i < 8; i++) akira.addNote({ title: `churn-${i}`, content: `x-${i}` });

    const live = new Set(memoryService.getMemories().map((m) => m.id));
    expect(live.size).toBeGreaterThan(0);
    expect(coreMemories().length).toBeLessThanOrEqual(2);

    expectNoDanglingReferences();

    // And the story for A is either gone or holds only surviving members.
    const arcA = storyService.getStories().find((s) => s.summary.includes(a));
    if (arcA) {
      for (const memoryId of arcA.relatedMemoryIds) expect(live.has(memoryId)).toBe(true);
    }
  });
});

describe("durable and runtime retention agree", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("classifies a memory exactly as it classified its originating event", () => {
    akira.addProject({ name: "Agreement" });
    const pid = akira.getState().lastProjectId as string;
    akira.addNote({ title: "a thought", content: "some content" });
    for (let i = 0; i < 5; i++) completeTask(pid, `ag-${i}`);

    // Every memory carries the event type it came from, and both layers read
    // that same field through the same function.
    const streamTypes = new Map(akira.getState().memories.map((e) => [e.id, e.eventType]));
    for (const memory of memoryService.getMemories()) {
      const originating = streamTypes.get(memory.sourceEventId);
      if (originating) expect(memory.eventType).toBe(originating);
      expect(["Core", "Episodic"]).toContain(classifyDurability(memory.eventType));
    }
  });

  it("makes everything the durable stream protects reachable in cognition", () => {
    // The invariant the two caps being equal is there to guarantee.
    const policy = getRetentionPolicy();
    expect(policy.maxCoreMemories).toBe(policy.maxCoreMemoryEvents);
  });
});
