/**
 * The relationship adjacency index must answer exactly what the scan answered.
 *
 * `getRelationshipsForMemory` was a `.filter()` over the whole relationship
 * cache. At the retention ceiling that one query was 47% of the cost of a
 * completed task -- 402 scans of a 1,000-entry cache per user action, because
 * importance recalculates 201 story members and two of its six rules ask it.
 * It is now a `Map<memoryId, MemoryRelationship[]>` lookup.
 *
 * The index is a projection, so the only thing worth testing is that it cannot
 * disagree with the cache it projects. Every path that changes the cache is
 * exercised separately -- creation, the `maxRelationships` eviction, retention's
 * `forgetMemories`, `clearHistory` -- and after each, the index is compared
 * against the filter it replaced, over every memory in play.
 *
 * Contents, order and identity are all compared. Order matters because callers
 * read `rels.length` and `rels.filter(...)`: a set-equal but differently
 * ordered answer would be undetectable here and wrong in principle.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

/** The definition the index replaced. The test's source of truth. */
function scanForMemory(memoryId: string) {
  return relationshipService
    .getRelationships()
    .filter((r) => r.sourceMemoryId === memoryId || r.targetMemoryId === memoryId);
}

/**
 * The invariant, asserted over every memory that appears at either end of any
 * cached relationship, plus every live memory -- so absence is covered as well
 * as presence.
 */
function expectIndexMatchesScan(): void {
  const cache = relationshipService.getRelationships();

  const subjects = new Set<string>();
  for (const link of cache) {
    subjects.add(link.sourceMemoryId);
    subjects.add(link.targetMemoryId);
  }
  for (const memory of memoryService.getMemories()) subjects.add(memory.id);
  subjects.add("a-memory-that-never-existed");

  for (const memoryId of subjects) {
    const expected = scanForMemory(memoryId);
    const actual = relationshipService.getRelationshipsForMemory(memoryId);

    // Same relationships, in the same order, and the same objects.
    expect(actual.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    for (let i = 0; i < expected.length; i++) expect(actual[i]).toBe(expected[i]);
  }

  // No index entry may outlive the cache: every id the index reports must
  // still be in the cache, and no entry may be empty.
  const cacheIds = new Set(cache.map((r) => r.id));
  for (const [memoryId, ids] of Object.entries(relationshipService.getAdjacencyIndexSnapshot())) {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(cacheIds.has(id)).toBe(true);
    expect(memoryId).toBeTruthy();
  }
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

describe("adjacency index tracks every cache mutation", () => {
  beforeEach(() => resetRetentionPolicy());
  afterEach(() => resetRetentionPolicy());

  it("returns an empty array for a memory with no relationships", () => {
    expect(relationshipService.getRelationshipsForMemory("nobody")).toEqual([]);
    expectIndexMatchesScan();
  });

  it("tracks relationships as they are created", () => {
    const projectId = newProject("Adjacency Create");
    for (let i = 0; i < 8; i++) completeTask(projectId, `create-${i}`);

    expect(relationshipService.getRelationships().length).toBeGreaterThan(0);
    expectIndexMatchesScan();
  });

  it("indexes both ends of every relationship", () => {
    const projectId = newProject("Adjacency Ends");
    for (let i = 0; i < 6; i++) completeTask(projectId, `ends-${i}`);

    const link = relationshipService.getRelationships().at(-1)!;
    expect(relationshipService.getRelationshipsForMemory(link.sourceMemoryId)).toContainEqual(link);
    expect(relationshipService.getRelationshipsForMemory(link.targetMemoryId)).toContainEqual(link);
    expectIndexMatchesScan();
  });

  it("follows the maxRelationships eviction", () => {
    // trimOldest drops from the front and notifies nobody; the index learns
    // about it only through the return value.
    setRetentionPolicy({ maxRelationships: 12 });

    const projectId = newProject("Adjacency Evict");
    for (let i = 0; i < 14; i++) completeTask(projectId, `evict-${i}`);

    expect(relationshipService.getRelationships().length).toBeLessThanOrEqual(12);
    expectIndexMatchesScan();
  });

  it("follows retention eviction through forgetMemories", () => {
    setRetentionPolicy({ maxMemories: 6 });

    const projectId = newProject("Adjacency Forget");
    for (let i = 0; i < 20; i++) completeTask(projectId, `forget-${i}`);

    expectIndexMatchesScan();

    // Nothing may remain pointing at a memory that no longer exists.
    const live = new Set(memoryService.getMemories().map((m) => m.id));
    for (const link of relationshipService.getRelationships()) {
      expect(live.has(link.sourceMemoryId) || live.has(link.targetMemoryId)).toBe(true);
    }
  });

  it("drops an index entry when a memory's last relationship goes", () => {
    const projectId = newProject("Adjacency Drop");
    for (let i = 0; i < 5; i++) completeTask(projectId, `drop-${i}`);

    const link = relationshipService.getRelationships().at(-1)!;
    const subject = link.sourceMemoryId;
    expect(relationshipService.getRelationshipsForMemory(subject).length).toBeGreaterThan(0);

    relationshipService.forgetMemories([subject]);

    expect(relationshipService.getRelationshipsForMemory(subject)).toEqual([]);
    expect(relationshipService.getAdjacencyIndexSnapshot()[subject]).toBeUndefined();
    expectIndexMatchesScan();
  });

  it("clears the index with the cache", () => {
    const projectId = newProject("Adjacency Clear");
    for (let i = 0; i < 5; i++) completeTask(projectId, `clear-${i}`);
    expect(Object.keys(relationshipService.getAdjacencyIndexSnapshot()).length).toBeGreaterThan(0);

    relationshipService.clearHistory();

    expect(relationshipService.getAdjacencyIndexSnapshot()).toEqual({});
    expect(relationshipService.getRelationshipsForMemory("anything")).toEqual([]);
    expectIndexMatchesScan();
  });

  it("hands out a copy, so a caller cannot corrupt the index", () => {
    const projectId = newProject("Adjacency Copy");
    for (let i = 0; i < 5; i++) completeTask(projectId, `copy-${i}`);

    const link = relationshipService.getRelationships().at(-1)!;
    const subject = link.sourceMemoryId;

    const first = relationshipService.getRelationshipsForMemory(subject);
    const count = first.length;
    first.length = 0;
    first.push({ id: "forged" } as never);

    expect(relationshipService.getRelationshipsForMemory(subject)).toHaveLength(count);
    expectIndexMatchesScan();
  });
});

describe("adjacency index survives reconstruction", () => {
  it("rebuilds from the persisted event stream", () => {
    const projectId = newProject("Adjacency Replay");
    for (let i = 0; i < 10; i++) completeTask(projectId, `replay-${i}`);

    expectIndexMatchesScan();
    const liveCount = relationshipService.getRelationships().length;

    // Reconstruction clears and replays through the same mutation paths.
    memoryService.reconstructRuntimeMemory();

    expectIndexMatchesScan();
    expect(relationshipService.getRelationships().length).toBeGreaterThan(0);
    expect(liveCount).toBeGreaterThan(0);
  });

  it("is idempotent across repeated reconstruction", () => {
    const before = relationshipService.getRelationships().length;
    memoryService.reconstructRuntimeMemory();
    const after = relationshipService.getRelationships().length;

    expect(after).toBe(before);
    expectIndexMatchesScan();
  });
});
