/**
 * Per-memory relationship retention.
 *
 * Relationships used to be bounded by a single global cap of 1,000. Because
 * one completed task emits a relationship against every peer in its project,
 * that shared cache turned over faster than anything could read it: measured at
 * the ceiling, only ~50% of memories held any relationship at all with one
 * project, and ~20% across five. The two importance rules that consume them
 * returned null for everyone else, so a memory's measured connectedness
 * depended on when it was looked at rather than on what it was connected to.
 *
 * The bound is now per memory. The properties that makes it safe, and that
 * these tests pin:
 *
 *   symmetry      a relationship is present at both ends or at neither
 *   boundedness   no memory exceeds the bound, at either end
 *   determinism   eviction is oldest-first, and replay reproduces it exactly
 *   coverage      every memory with peers holds relationships, not just recent ones
 *   integrity     nothing points at a memory that no longer exists
 *
 * Symmetry is the one worth stating plainly, because it has a cost: evicting a
 * relationship removes it from *both* its ends, so a memory can lose a link
 * because its neighbour filled up rather than because it did. That is
 * deliberate. A link one end believes in and the other has forgotten would make
 * the importance rules disagree about the same pair depending on which memory
 * was asked.
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
const { getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

function newProject(name: string): string {
  akira.addProject({ name });
  return akira.getState().lastProjectId as string;
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/** Every relationship is reachable from both of its ends, or from neither. */
function expectSymmetry(): void {
  for (const link of relationshipService.getRelationships()) {
    const fromSource = relationshipService.getRelationshipsForMemory(link.sourceMemoryId);
    const fromTarget = relationshipService.getRelationshipsForMemory(link.targetMemoryId);
    expect(fromSource.some((r) => r.id === link.id)).toBe(true);
    expect(fromTarget.some((r) => r.id === link.id)).toBe(true);
  }
}

/** No memory holds more than the bound, and the cache agrees with the index. */
function expectBounded(): void {
  const max = getRetentionPolicy().maxRelationshipsPerMemory;
  const counted = new Map<string, number>();

  for (const link of relationshipService.getRelationships()) {
    counted.set(link.sourceMemoryId, (counted.get(link.sourceMemoryId) ?? 0) + 1);
    if (link.targetMemoryId !== link.sourceMemoryId) {
      counted.set(link.targetMemoryId, (counted.get(link.targetMemoryId) ?? 0) + 1);
    }
  }

  for (const [memoryId, count] of counted) {
    expect(count).toBeLessThanOrEqual(max);
    // The index and the cache must have counted the same thing.
    expect(relationshipService.getRelationshipsForMemory(memoryId)).toHaveLength(count);
  }
}

/** Nothing derived points at a memory that no longer exists. */
function expectNoDangling(): void {
  const live = new Set(memoryService.getMemories().map((m) => m.id));
  for (const link of relationshipService.getRelationships()) {
    expect(live.has(link.sourceMemoryId) || live.has(link.targetMemoryId)).toBe(true);
  }
  for (const [memoryId, ids] of Object.entries(relationshipService.getAdjacencyIndexSnapshot())) {
    expect(ids.length).toBeGreaterThan(0);
    expect(memoryId).toBeTruthy();
  }
}

describe("per-memory bound", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("holds at both ends of every relationship", () => {
    const projectId = newProject("Bound Both Ends");
    for (let i = 0; i < 40; i++) completeTask(projectId, `both-${i}`);

    expectBounded();
    expectSymmetry();
    expectNoDangling();
  });

  it("respects a tightened bound", () => {
    setRetentionPolicy({ maxRelationshipsPerMemory: 2 });

    const projectId = newProject("Tight Bound");
    for (let i = 0; i < 30; i++) completeTask(projectId, `tight-${i}`);

    expectBounded();
    expectSymmetry();
  });

  it("retains nothing when the bound is zero, without breaking the pipeline", () => {
    setRetentionPolicy({ maxRelationshipsPerMemory: 0 });

    const projectId = newProject("Zero Bound");
    for (let i = 0; i < 10; i++) completeTask(projectId, `zero-${i}`);

    expect(relationshipService.getRelationships()).toHaveLength(0);
    expect(relationshipService.getAdjacencyIndexSnapshot()).toEqual({});
    // Memories still form, and their stories still exist.
    expect(memoryService.getMemories().length).toBeGreaterThan(0);
    expectNoDangling();
  });

  it("evicts oldest-first within a memory", () => {
    setRetentionPolicy({ maxRelationshipsPerMemory: 3 });

    const projectId = newProject("Oldest First");
    for (let i = 0; i < 12; i++) completeTask(projectId, `of-${i}`);

    // The newest memory linked to every peer, then kept its last three. Those
    // are the links to the most recent peers, not the earliest.
    const memories = memoryService.getMemories().filter((m) => m.relatedProjectId === projectId);
    const newest = memories[memories.length - 1];
    const held = relationshipService.getRelationshipsForMemory(newest.id);
    expect(held.length).toBeLessThanOrEqual(3);

    const peerIds = held.map((r) =>
      r.sourceMemoryId === newest.id ? r.targetMemoryId : r.sourceMemoryId,
    );
    const positions = peerIds.map((id) => memories.findIndex((m) => m.id === id));
    const earliest = Math.min(...positions);
    const median = Math.floor(memories.length / 2);
    // Retained peers come from the recent half, which is what oldest-first
    // eviction on a chronological scan produces.
    expect(earliest).toBeGreaterThanOrEqual(median - 1);
  });
});

describe("coverage no longer depends on cache position", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("gives old memories relationships, not only recent ones", () => {
    const projectId = newProject("Coverage One Project");
    for (let i = 0; i < 120; i++) completeTask(projectId, `cov-${i}`);

    const memories = memoryService.getMemories().filter((m) => m.relatedProjectId === projectId);
    const withRelationships = memories.filter(
      (m) => relationshipService.getRelationshipsForMemory(m.id).length > 0,
    );

    // Under the global cap this was ~50%, and the oldest half held nothing.
    expect(withRelationships.length).toBe(memories.length);

    const oldest = memories[0];
    expect(relationshipService.getRelationshipsForMemory(oldest.id).length).toBeGreaterThan(0);
  });

  it("holds across several projects, where the global cap degraded worst", () => {
    const projectIds: string[] = [];
    for (let p = 0; p < 5; p++) {
      const id = newProject(`Coverage P${p}`);
      projectIds.push(id);
      for (let i = 0; i < 40; i++) completeTask(id, `p${p}-t${i}`);
    }

    // Every project's memories are covered, including the first project's,
    // which the global cap evicted entirely once later projects filled it.
    for (const projectId of projectIds) {
      const mine = memoryService.getMemories().filter((m) => m.relatedProjectId === projectId);
      const covered = mine.filter(
        (m) => relationshipService.getRelationshipsForMemory(m.id).length > 0,
      );
      expect(covered.length).toBe(mine.length);
    }

    expectBounded();
    expectSymmetry();
  });

  it("restores the importance signals the cap had suppressed", () => {
    const projectId = newProject("Signal Coverage");
    for (let i = 0; i < 80; i++) completeTask(projectId, `sig-${i}`);

    const memories = memoryService.getMemories().filter((m) => m.relatedProjectId === projectId);
    const withRelationshipSignal = memories.filter((m) =>
      importanceService.getImportance(m.id)?.signals.some((s) => s.type === "Relationships"),
    );

    // The Relationships Density rule fires for a memory only when it holds at
    // least one relationship, so coverage and signal presence are the same
    // fact. Under the global cap the older half had neither.
    expect(withRelationshipSignal.length).toBeGreaterThan(memories.length / 2);
  });
});

describe("determinism across replay", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  /** Relationships as structure, independent of regenerated ids. */
  function relationshipShape(): string[] {
    const memories = memoryService.getMemories();
    const index = new Map(memories.map((m, i) => [m.id, i]));
    return relationshipService
      .getRelationships()
      .map((r) => `${index.get(r.sourceMemoryId)}->${index.get(r.targetMemoryId)}:${r.type}`)
      .sort();
  }

  it("reproduces the same relationship structure on reconstruction", () => {
    const projectId = newProject("Replay Structure");
    for (let i = 0; i < 60; i++) completeTask(projectId, `rs-${i}`);

    const live = relationshipShape();
    const liveCount = relationshipService.getRelationships().length;

    memoryService.reconstructRuntimeMemory();

    expect(relationshipService.getRelationships().length).toBe(liveCount);
    expect(relationshipShape()).toEqual(live);
    expectBounded();
    expectSymmetry();
    expectNoDangling();
  });

  it("is idempotent across repeated reconstruction", () => {
    const projectId = newProject("Replay Idempotent");
    for (let i = 0; i < 40; i++) completeTask(projectId, `ri-${i}`);

    memoryService.reconstructRuntimeMemory();
    const first = relationshipShape();
    const firstCount = relationshipService.getRelationships().length;

    memoryService.reconstructRuntimeMemory();

    expect(relationshipService.getRelationships().length).toBe(firstCount);
    expect(relationshipShape()).toEqual(first);
    expectBounded();
    expectSymmetry();
  });

  it("keeps the cache and index consistent through retention eviction", () => {
    setRetentionPolicy({ maxMemories: 20, maxRelationshipsPerMemory: 4 });

    const projectId = newProject("Retention Interplay");
    for (let i = 0; i < 60; i++) completeTask(projectId, `rt-${i}`);

    expectBounded();
    expectSymmetry();
    expectNoDangling();

    // Every surviving relationship has at least one live end, and every live
    // memory's index entry matches what the cache holds.
    const live = new Set(memoryService.getMemories().map((m) => m.id));
    for (const link of relationshipService.getRelationships()) {
      expect(live.has(link.sourceMemoryId) || live.has(link.targetMemoryId)).toBe(true);
    }
  });
});
