/**
 * GENESIS persistence across reloads.
 *
 * The durable layer is deliberately one thing: the MemoryEvent stream, which is
 * GENESIS's own record of what it was told. Candidates, validated memories,
 * stories, importance profiles, relationships and understandings are all
 * rebuilt from it by `memoryService.reconstructRuntimeMemory()`, so none of
 * them are stored. Persisting them would mean persisting caches, and any drift
 * between a stored cache and the rules that produce it is silent corruption.
 *
 * A reload is simulated the way the application actually performs one: the
 * durable stream is read back, `akira.initializeState` installs it, and
 * `memoryService.initialize()` replays it. The in-memory services are cleared
 * first so nothing survives by accident — if a test passes it is because
 * hydration rebuilt the state, not because it was never lost.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { setRetentionPolicy, resetRetentionPolicy, getRetentionPolicy } =
  await import("../src/genesis/retention/policy");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");

import type { MemoryEvent } from "../src/shared/types/event-types";
import type { AkiraState } from "../src/shared/types/store-types";

/** One real completed task, through the production intake. */
function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/**
 * Simulates an application restart.
 *
 * Everything in RAM goes, exactly as it would when the tab closes. Only
 * `durableStream` — what a real reload would read back out of the settings
 * blob — is handed to the fresh process, and then GENESIS reconstructs.
 */
function restartWith(durableStream: MemoryEvent[]): void {
  genesis.memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  genesis.storyService.clearHistory();
  genesis.importanceService.clearHistory();
  relationshipService.clearHistory();

  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [...durableStream] });

  // What routes/__root.tsx now does once the database has answered.
  genesis.memoryService.initialize();
}

/** The stream a reload would read back. */
function durableStream(): MemoryEvent[] {
  return [...akira.getState().memories];
}

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [] });
  genesis.memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  genesis.storyService.clearHistory();
  genesis.importanceService.clearHistory();
  relationshipService.clearHistory();
}

describe("first startup with nothing stored", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });

  it("starts empty rather than failing", () => {
    expect(() => restartWith([])).not.toThrow();

    expect(genesis.memoryService.getMemories()).toHaveLength(0);
    expect(genesis.storyService.getStories()).toHaveLength(0);
    expect(genesis.candidateService.getCandidates()).toHaveLength(0);
  });

  it("ingests normally after an empty start", () => {
    restartWith([]);
    completeTask("proj-first-run", "first-task");

    expect(genesis.memoryService.getMemories().length).toBeGreaterThan(0);
  });
});

describe("persist, reload, hydrate", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });

  it("records the intake stream as events arrive", () => {
    completeTask("proj-stream", "stream-task");

    const stream = durableStream();
    expect(stream.length).toBeGreaterThan(0);
    // Newest first, and each entry is a MemoryEvent, not a validated Memory.
    expect(stream[0].id).toBeTruthy();
    expect(stream[0].eventType).toBeTruthy();
  });

  it("rebuilds memories, stories, importance and understanding from the stream alone", () => {
    const projectId = "proj-hydrate";
    completeTask(projectId, "hydrate-task-a");
    completeTask(projectId, "hydrate-task-b");

    const before = {
      stream: durableStream(),
      memories: genesis.memoryService.getMemories().length,
      stories: genesis.storyService.getStories().length,
    };
    expect(before.memories).toBeGreaterThan(0);
    expect(before.stories).toBeGreaterThan(0);

    restartWith(before.stream);

    // Derived state came back without any of it having been stored.
    expect(genesis.memoryService.getMemories().length).toBe(before.memories);
    expect(genesis.storyService.getStories().length).toBe(before.stories);

    const memory = genesis.memoryService
      .getMemories()
      .find((m) => m.relatedProjectId === projectId);
    expect(memory, "a memory for the project must be reconstructed").toBeDefined();

    const story = genesis.storyService
      .getStories()
      .find((s) => s.summary.includes(`ID: ${projectId}`));
    expect(story, "its story arc must be reconstructed").toBeDefined();
    expect(story!.relatedMemoryIds).toContain(memory!.id);

    expect(genesis.importanceService.getImportance(memory!.id)).toBeDefined();
    expect(genesis.understandingEngine.getUnderstandings().length).toBeGreaterThan(0);
  });

  it("stores no derived state — the stream is the whole durable layer", () => {
    completeTask("proj-derived", "derived-task");

    // Nothing but MemoryEvents is handed across the restart boundary, and the
    // cognitive layer still comes back. That is the boundary claim.
    const stream = durableStream();
    for (const event of stream) {
      expect(event).toHaveProperty("eventType");
      expect(event).not.toHaveProperty("candidateId");
      expect(event).not.toHaveProperty("relatedMemoryIds");
    }

    restartWith(stream);
    expect(genesis.memoryService.getMemories().length).toBeGreaterThan(0);
  });
});

describe("the durable medium round-trips through SQLite", () => {
  // The suites above simulate a reload in memory. This one exercises the real
  // storage medium. getInitialState() itself cannot be invoked here -- it is a
  // createServerFn and throws "No Start context found" outside the server
  // runtime -- so the round trip is driven through the repository it uses, and
  // a structural check pins the wiring in between.
  it("round-trips a MemoryEvent stream through the settings repository", async () => {
    const { initializeDatabase } = await import("../src/persistence/initializer");
    const { settingsRepository } = await import("../src/persistence/repositories");

    initializeDatabase();

    const stored: MemoryEvent[] = [
      {
        id: "evt-durable-1",
        timestamp: new Date().toISOString(),
        eventType: "task_completed",
        title: "Persisted across a reload",
        description: "written straight to the durable medium",
        relatedProjectId: "proj-durable",
        relatedNoteId: null,
        metadata: { title: "Persisted across a reload", projectId: "proj-durable" },
      },
    ];
    settingsRepository.set("genesis_memories", JSON.stringify(stored));

    const raw = settingsRepository.get("genesis_memories");
    expect(raw).toBeTruthy();
    const readBack: MemoryEvent[] = JSON.parse(raw!);
    expect(readBack).toHaveLength(1);
    expect(readBack[0].id).toBe("evt-durable-1");

    // And what came off disk reconstructs into real cognition.
    restartWith(readBack);
    const memory = genesis.memoryService
      .getMemories()
      .find((m) => m.relatedProjectId === "proj-durable");
    expect(memory, "a stored stream must rebuild a memory").toBeDefined();
    expect(memory!.title).toBe("Persisted across a reload");
  });

  it("treats an absent key as an empty stream rather than an error", async () => {
    const { initializeDatabase } = await import("../src/persistence/initializer");
    const { settingsRepository } = await import("../src/persistence/repositories");

    initializeDatabase();
    settingsRepository.delete("genesis_memories");

    const raw = settingsRepository.get("genesis_memories");
    const readBack = raw ? JSON.parse(raw) : [];
    expect(readBack).toEqual([]);

    expect(() => restartWith(readBack)).not.toThrow();
  });

  it("wires that key into the hydrated state", async () => {
    // The one line the round trip above cannot reach, because getInitialState
    // only runs inside the server runtime. Without this, removing the read
    // would leave every test above green.
    const fs = await import("fs");
    const source = fs.readFileSync("src/persistence/store-init.ts", "utf8");

    expect(source).toContain('settingsRepository.get("genesis_memories")');
    // Assigned to the state field GENESIS reconstructs from, not discarded.
    // Assigned to the state field GENESIS reconstructs from, not discarded.
    expect(source).toContain("    memories,");
    expect(source).not.toContain("memories: [],");
  });
});

describe("repeated restarts do not duplicate or corrupt", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });

  it("produces identical cognition across three restart cycles", () => {
    const projectId = "proj-cycles";
    completeTask(projectId, "cycle-task-a");
    completeTask(projectId, "cycle-task-b");

    const stream = durableStream();
    const counts: Array<{ memories: number; stories: number; candidates: number }> = [];

    for (let cycle = 0; cycle < 3; cycle++) {
      restartWith(stream);
      counts.push({
        memories: genesis.memoryService.getMemories().length,
        stories: genesis.storyService.getStories().length,
        candidates: genesis.candidateService.getCandidates().length,
      });
    }

    // Replay is clear-then-rebuild, so every cycle lands on the same numbers.
    // Growth here would mean a restart silently duplicates the user's history.
    expect(counts[1]).toEqual(counts[0]);
    expect(counts[2]).toEqual(counts[0]);
    expect(counts[0].memories).toBeGreaterThan(0);
  });

  it("leaves no duplicate memory ids after a restart", () => {
    completeTask("proj-dupes", "dupe-task");
    restartWith(durableStream());
    restartWith(durableStream());

    const ids = genesis.memoryService.getMemories().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps story references valid after a restart", () => {
    const projectId = "proj-refs-restart";
    completeTask(projectId, "refs-a");
    completeTask(projectId, "refs-b");
    restartWith(durableStream());

    const liveIds = new Set(genesis.memoryService.getMemories().map((m) => m.id));
    for (const story of genesis.storyService.getStories()) {
      for (const memoryId of story.relatedMemoryIds) {
        expect(liveIds.has(memoryId), `dangling ${memoryId} after restart`).toBe(true);
      }
    }
  });
});

describe("retention survives persistence", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });

  afterEach(() => resetRetentionPolicy());

  it("bounds the durable stream itself", () => {
    setRetentionPolicy({ maxMemoryEvents: 6 });
    for (let i = 0; i < 25; i++) completeTask("proj-stream-cap", `cap-task-${i}`);

    expect(durableStream().length).toBeLessThanOrEqual(getRetentionPolicy().maxMemoryEvents);
  });

  it("still enforces memory limits after hydration", () => {
    setRetentionPolicy({ maxMemoryEvents: 100, maxMemories: 4 });
    for (let i = 0; i < 20; i++) completeTask("proj-post-hydrate", `post-${i}`);

    const stream = durableStream();
    expect(stream.length).toBeGreaterThan(4);

    restartWith(stream);

    // A long stream must not reinstate an unbounded memory set on replay.
    expect(genesis.memoryService.getMemories().length).toBeLessThanOrEqual(4);
  });

  it("keeps the most recent history when the stream is truncated", () => {
    setRetentionPolicy({ maxMemoryEvents: 5 });
    for (let i = 0; i < 15; i++) completeTask("proj-recency", `recent-${i}`);

    const stream = durableStream();
    // Newest first; the last task completed must be at the head.
    const titles = stream.map((e) => (e.metadata as { title?: string })?.title).filter(Boolean);
    expect(titles).toContain("recent-14");
    expect(titles).not.toContain("recent-0");
  });
});

describe("live ingestion continues after hydration", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });

  it("accepts new real events and grows the durable stream after a restart", () => {
    completeTask("proj-continue", "before-restart");
    restartWith(durableStream());

    const afterHydration = genesis.memoryService.getMemories().length;
    const streamBefore = durableStream().length;

    completeTask("proj-continue", "after-restart");

    expect(genesis.memoryService.getMemories().length).toBeGreaterThan(afterHydration);
    expect(durableStream().length).toBeGreaterThan(streamBefore);

    // And the new event survives the next restart too.
    restartWith(durableStream());
    const titles = genesis.memoryService
      .getMemories()
      .map((m) => (m.metadata as { title?: string })?.title);
    expect(titles).toContain("after-restart");
  });

  it("does not re-persist replayed events during hydration", () => {
    completeTask("proj-noecho", "noecho-task");
    const stream = durableStream();

    restartWith(stream);

    // Reconstruction feeds candidateService directly and never calls
    // eventService.record(), so replaying must not append to the stream. If it
    // did, every restart would inflate the durable layer.
    expect(durableStream().length).toBe(stream.length);
  });
});
