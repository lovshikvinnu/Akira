/**
 * Recall candidate cache bounds.
 *
 * `sessionHistory` was bounded in f2b956e, but the payload it retains comes from
 * `recallCache`, and that cache had no bound at all. Every cycle carried
 * forward every candidate that had gone Inactive, and nothing ever removed one.
 * A candidate whose memory has since been evicted can never become Active again
 * -- the builder only ever produces candidates from live memories -- so those
 * entries were unreachable data pinned for the life of the process, and each
 * historical session held a reference to the array containing them.
 *
 * These tests drive the real recall path: completing tasks produces memories,
 * stories and importance signals, and the builder rebuilds on all three.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

/** One real completed task, through the production intake. */
function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/** Starts recall the way companionStateService.bootstrap() does. */
function startRecall(): void {
  recallService.clearHistory();
  recallBuilder.initialize();
}

describe("recall candidate cache stays bounded", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    genesis.memoryService.clearHistory();
    genesis.storyService.clearHistory();
    startRecall();
  });

  afterEach(() => resetRetentionPolicy());

  it("holds no candidate for a memory that has been evicted", () => {
    setRetentionPolicy({ maxMemories: 5, maxRecallSessions: 12 });

    for (let i = 0; i < 30; i++) completeTask("proj-bounds", `bounds-task-${i}`);

    const liveIds = new Set(genesis.memoryService.getMemories().map((m) => m.id));
    const dangling = recallService.getRecallCandidates().filter((c) => !liveIds.has(c.memoryId));

    expect(dangling).toHaveLength(0);
  });

  it("does not grow with total activity once memories are being evicted", () => {
    setRetentionPolicy({ maxMemories: 5, maxRecallSessions: 12 });

    for (let i = 0; i < 10; i++) completeTask("proj-grow", `grow-early-${i}`);
    const afterTen = recallService.getRecallCandidates().length;

    for (let i = 0; i < 30; i++) completeTask("proj-grow", `grow-late-${i}`);
    const afterForty = recallService.getRecallCandidates().length;

    // Four times the activity must not mean four times the cache.
    expect(afterForty).toBeLessThanOrEqual(afterTen + 2);
    expect(afterForty).toBeLessThanOrEqual(genesis.memoryService.getMemories().length * 2);
  });

  it("keeps every active candidate and the active session intact", () => {
    setRetentionPolicy({ maxMemories: 5, maxRecallSessions: 12 });

    for (let i = 0; i < 20; i++) completeTask("proj-active", `active-task-${i}`);

    const active = recallService.getRecallCandidates().filter((c) => c.status === "Active");
    const liveIds = new Set(genesis.memoryService.getMemories().map((m) => m.id));

    // Pruning must never remove a live, active candidate.
    expect(active.length).toBeGreaterThan(0);
    for (const candidate of active) expect(liveIds.has(candidate.memoryId)).toBe(true);

    const session = recallService.getActiveSession();
    expect(session).not.toBeNull();
    expect(session!.candidates).toEqual(recallService.getRecallCandidates());
  });

  it("bounds what the retained session history can pin", () => {
    setRetentionPolicy({ maxMemories: 5, maxRecallSessions: 12 });

    for (let i = 0; i < 40; i++) completeTask("proj-pin", `pin-task-${i}`);

    const distinct = new Set<object>();
    for (const session of recallService.getSessionHistory()) {
      for (const candidate of session.candidates) distinct.add(candidate);
    }

    // History is capped at 12 sessions; with a bounded cache the objects those
    // sessions can pin is bounded too, rather than scaling with total activity.
    expect(distinct.size).toBeLessThanOrEqual(12 * 5 * 2);
  });
});
