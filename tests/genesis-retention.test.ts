/**
 * GENESIS retention.
 *
 * Every cognitive store was an unbounded array. That was survivable while the
 * pipeline was disconnected; now that real platform events reach GENESIS, each
 * one grows for as long as the tab is open, and the AI prompt grows with them.
 *
 * These tests drive the production intake — `akira.*` store actions, published
 * through the real platform bus — rather than calling the stores directly, so
 * "bounded" means bounded under actual ingestion, not bounded when poked.
 *
 * The caps are lowered for the duration of each suite so a boundary can be
 * crossed with a handful of events instead of hundreds.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const {
  getRetentionPolicy,
  setRetentionPolicy,
  resetRetentionPolicy,
  trimOldest,
  trimNewestFirst,
  DEFAULT_RETENTION_POLICY,
} = await import("../src/genesis/retention/policy");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");

/** One real completed task: the production path from OS action to cognition. */
function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/** Creates `count` real memories against one project. */
function ingest(projectId: string, count: number, prefix = "task"): void {
  for (let i = 0; i < count; i++) {
    completeTask(projectId, `${prefix}-${projectId}-${i}`);
  }
}

describe("policy primitives", () => {
  it("trims the oldest end and reports what it dropped", () => {
    const items = [1, 2, 3, 4, 5];
    expect(trimOldest(items, 3)).toEqual([1, 2]);
    expect(items).toEqual([3, 4, 5]);
  });

  it("trims the tail for newest-first collections", () => {
    const items = [5, 4, 3, 2, 1];
    expect(trimNewestFirst(items, 3)).toEqual([2, 1]);
    expect(items).toEqual([5, 4, 3]);
  });

  it("leaves a collection under its cap untouched", () => {
    const items = [1, 2];
    expect(trimOldest(items, 5)).toEqual([]);
    expect(trimNewestFirst(items, 5)).toEqual([]);
    expect(items).toEqual([1, 2]);
  });

  it("ships defaults that bound every growth axis", () => {
    const p = DEFAULT_RETENTION_POLICY;
    for (const value of [
      p.maxMemories,
      p.maxCandidates,
      p.maxStories,
      p.maxMemoriesPerStory,
      p.maxImportanceHistoryPerMemory,
      p.maxRelationships,
      p.context.maxStories,
      p.context.maxRecallCandidates,
      p.context.maxIdentityObservations,
      p.context.maxGoals,
      p.context.maxRecentActivity,
    ]) {
      expect(Number.isFinite(value) && value > 0).toBe(true);
    }

    // The prompt budget must stay well under the retention budget, or raising
    // a memory cap would silently enlarge every prompt.
    expect(p.context.maxStories).toBeLessThan(p.maxStories);
  });
});

describe("sustained ingestion cannot grow cognition without bound", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    setRetentionPolicy({ maxMemories: 5, maxCandidates: 6, maxStories: 3 });
    genesis.memoryService.clearHistory();
    genesis.candidateService.clearHistory();
    genesis.storyService.clearHistory();
    genesis.importanceService.clearHistory();
    relationshipService.clearHistory();
  });

  afterEach(() => {
    resetRetentionPolicy();
  });

  it("bounds memories under continuous real event ingestion", () => {
    ingest("proj-bound", 30);

    const memories = genesis.memoryService.getMemories();
    expect(memories.length).toBeLessThanOrEqual(getRetentionPolicy().maxMemories);
    expect(memories.length).toBe(5);
  });

  it("bounds the candidate audit trail", () => {
    ingest("proj-cand", 30);
    expect(genesis.candidateService.getCandidates().length).toBeLessThanOrEqual(
      getRetentionPolicy().maxCandidates,
    );
  });

  it("bounds stories across many projects", () => {
    for (let p = 0; p < 12; p++) {
      completeTask(`proj-story-${p}`, `story-task-${p}`);
    }
    expect(genesis.storyService.getStories().length).toBeLessThanOrEqual(
      getRetentionPolicy().maxStories,
    );
  });

  it("bounds a single story's memory references", () => {
    setRetentionPolicy({ maxMemories: 100, maxMemoriesPerStory: 4 });
    const projectId = "proj-refs";
    ingest(projectId, 20);

    const story = genesis.storyService
      .getStories()
      .find((s) => s.summary.includes(`ID: ${projectId}`));
    expect(story).toBeDefined();
    expect(story!.relatedMemoryIds.length).toBeLessThanOrEqual(4);
  });

  it("bounds a memory's importance history across repeated recalculation", () => {
    setRetentionPolicy({ maxMemories: 100, maxImportanceHistoryPerMemory: 3 });
    const projectId = "proj-importance";
    // Every later completion in the same project updates the story, which
    // recalculates importance for each memory it holds.
    ingest(projectId, 12);

    const profiles = genesis.importanceService.getAllImportance();
    expect(profiles.length).toBeGreaterThan(0);
    for (const profile of profiles) {
      expect(profile.signalHistory.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("the right items are kept and the right ones are dropped", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    setRetentionPolicy({ maxMemories: 3, maxStories: 50 });
    genesis.memoryService.clearHistory();
    genesis.candidateService.clearHistory();
    genesis.storyService.clearHistory();
    genesis.importanceService.clearHistory();
    relationshipService.clearHistory();
  });

  afterEach(() => resetRetentionPolicy());

  it("keeps the most recent memories and evicts the oldest", () => {
    // Record promotions in order. Reading titles back would be unreliable:
    // toggleTask also publishes mission.completed once every task is done, so
    // the stream interleaves memories that carry no task title.
    const promoted: string[] = [];
    const unsubscribe = genesis.memoryService.subscribe((m) => promoted.push(m.id));

    ingest("proj-order", 6, "ordered");
    unsubscribe();

    const retained = genesis.memoryService.getMemories().map((m) => m.id);
    expect(retained).toHaveLength(3);

    // Exactly the last three promoted, still in promotion order.
    expect(retained).toEqual(promoted.slice(-3));
    // And nothing older survived.
    for (const evicted of promoted.slice(0, -3)) {
      expect(retained).not.toContain(evicted);
    }
  });
});

describe("references stay valid after eviction", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    setRetentionPolicy({ maxMemories: 4, maxStories: 50 });
    genesis.memoryService.clearHistory();
    genesis.candidateService.clearHistory();
    genesis.storyService.clearHistory();
    genesis.importanceService.clearHistory();
    relationshipService.clearHistory();
  });

  afterEach(() => resetRetentionPolicy());

  it("leaves no story pointing at an evicted memory", () => {
    ingest("proj-integrity", 20);

    const liveIds = new Set(genesis.memoryService.getMemories().map((m) => m.id));
    for (const story of genesis.storyService.getStories()) {
      for (const memoryId of story.relatedMemoryIds) {
        expect(liveIds.has(memoryId), `story ${story.id} references evicted ${memoryId}`).toBe(
          true,
        );
      }
    }
  });

  it("leaves no importance profile for an evicted memory", () => {
    ingest("proj-importance-refs", 20);

    const liveIds = new Set(genesis.memoryService.getMemories().map((m) => m.id));
    for (const profile of genesis.importanceService.getAllImportance()) {
      expect(liveIds.has(profile.memoryId), `orphan importance ${profile.memoryId}`).toBe(true);
    }
  });

  it("leaves no relationship with an evicted endpoint", () => {
    ingest("proj-rel", 20);

    const liveIds = new Set(genesis.memoryService.getMemories().map((m) => m.id));
    for (const link of relationshipService.getRelationships()) {
      expect(liveIds.has(link.sourceMemoryId) && liveIds.has(link.targetMemoryId)).toBe(true);
    }
  });

  it("drops a story once every memory it described has aged out", () => {
    ingest("proj-gone", 6);
    const before = genesis.storyService
      .getStories()
      .filter((s) => s.summary.includes("ID: proj-gone")).length;
    expect(before).toBeGreaterThan(0);

    // Push the original project entirely out of the window.
    ingest("proj-newer", 20);

    const stale = genesis.storyService
      .getStories()
      .filter((s) => s.summary.includes("ID: proj-gone"));
    expect(stale).toHaveLength(0);
  });
});

describe("AI context stays bounded independently of retention", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    genesis.memoryService.clearHistory();
    genesis.candidateService.clearHistory();
    genesis.storyService.clearHistory();
  });

  afterEach(() => resetRetentionPolicy());

  it("caps context items even when retention keeps far more", () => {
    // Retention deliberately generous, prompt budget deliberately small: the
    // two are separate budgets and this proves they do not track each other.
    setRetentionPolicy({
      maxMemories: 500,
      maxStories: 200,
      context: { maxStories: 3, maxGoals: 2, maxRecentActivity: 4 },
    });

    for (let p = 0; p < 25; p++) {
      completeTask(`proj-ctx-${p}`, `ctx-task-${p}`);
    }

    expect(genesis.storyService.getStories().length).toBeGreaterThan(3);

    genesis.contextBuilder.rebuildContextPackage();
    const pkg = genesis.contextService.getActiveContext();
    expect(pkg).toBeTruthy();
    expect(pkg!.activeStories.length).toBeLessThanOrEqual(3);
    expect(pkg!.currentGoals.length).toBeLessThanOrEqual(2);
    expect(pkg!.recentActivitySummary.length).toBeLessThanOrEqual(4);
  });
});

describe("GENESIS intake still works end to end", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    genesis.memoryService.clearHistory();
    genesis.storyService.clearHistory();
  });

  it("still carries a real task completion to a story under default caps", () => {
    const projectId = "proj-e2e-retention";
    completeTask(projectId, "retention-e2e");

    const memory = genesis.memoryService
      .getMemories()
      .find((m) => m.relatedProjectId === projectId);
    expect(memory, "retention must not break normal ingestion").toBeDefined();

    const story = genesis.storyService
      .getStories()
      .find((s) => s.summary.includes(`ID: ${projectId}`));
    expect(story).toBeDefined();
    expect(story!.relatedMemoryIds).toContain(memory!.id);
  });
});
