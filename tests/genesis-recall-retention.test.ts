/**
 * Recall session retention.
 *
 * `recallService.sessionHistory` was flagged during the H1 retention work as a
 * possible unbounded growth path. Investigation showed it is not: the write
 * boundary already trimmed it. What it lacked was an owner — the limit was a
 * literal `50` in the middle of `startRecallSession`, invisible to the policy
 * that governs every other cognitive store, and impossible to tune or test
 * against.
 *
 * These tests drive the real recall path: `recallBuilder` subscribes to memory,
 * story and importance updates, so completing real tasks produces real recall
 * cycles. They lower the policy limit so a boundary is reached in a handful of
 * cycles rather than fifty.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy, DEFAULT_RETENTION_POLICY } =
  await import("../src/genesis/retention/policy");

/** One real completed task, through the production intake. */
function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/**
 * Starts recall the way `companionStateService.bootstrap()` does.
 *
 * Worth stating plainly, because it caught out an earlier measurement of mine:
 * recall produces nothing at all until the builder is initialised. It is not
 * part of the composition manifest — bootstrap owns it.
 */
function startRecall(): void {
  recallService.clearHistory();
  recallBuilder.initialize();
}

describe("recall session history is centrally bounded", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    genesis.memoryService.clearHistory();
    genesis.storyService.clearHistory();
    startRecall();
  });

  afterEach(() => resetRetentionPolicy());

  it("declares its limit in the retention policy rather than at the call site", () => {
    expect(DEFAULT_RETENTION_POLICY.maxRecallSessions).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_RETENTION_POLICY.maxRecallSessions)).toBe(true);
  });

  it("never exceeds the configured limit under sustained recall activity", () => {
    setRetentionPolicy({ maxRecallSessions: 5 });

    // Each completion updates memory, story and importance, and the recall
    // builder rebuilds on all three — so this is many recall cycles, not ten.
    for (let i = 0; i < 10; i++) completeTask("proj-recall-bound", `recall-task-${i}`);

    const history = recallService.getSessionHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history.length).toBeLessThanOrEqual(getRetentionPolicy().maxRecallSessions);
  });

  it("responds to the configured limit rather than a fixed number", () => {
    // The point of moving the literal into the policy: two different limits
    // must produce two different bounds.
    setRetentionPolicy({ maxRecallSessions: 3 });
    for (let i = 0; i < 8; i++) completeTask("proj-recall-three", `three-${i}`);
    expect(recallService.getSessionHistory().length).toBeLessThanOrEqual(3);

    startRecall();
    setRetentionPolicy({ maxRecallSessions: 7 });
    for (let i = 0; i < 20; i++) completeTask("proj-recall-seven", `seven-${i}`);

    const history = recallService.getSessionHistory();
    expect(history.length).toBeLessThanOrEqual(7);
    expect(history.length).toBeGreaterThan(3);
  });

  it("keeps the most recent sessions and drops the oldest", () => {
    setRetentionPolicy({ maxRecallSessions: 4 });

    const seen: string[] = [];
    const unsubscribe = recallService.subscribe(({ session }) => seen.push(session.sessionId));
    for (let i = 0; i < 12; i++) completeTask("proj-recall-order", `order-${i}`);
    unsubscribe();

    const retained = recallService.getSessionHistory().map((s) => s.sessionId);
    expect(retained).toEqual(seen.slice(-retained.length));

    // Nothing older survived.
    for (const evicted of seen.slice(0, -retained.length)) {
      expect(retained).not.toContain(evicted);
    }
  });
});

describe("recall still works correctly after eviction", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    genesis.memoryService.clearHistory();
    genesis.storyService.clearHistory();
    startRecall();
  });

  afterEach(() => resetRetentionPolicy());

  it("still produces an active session and live candidates", () => {
    setRetentionPolicy({ maxRecallSessions: 3 });
    for (let i = 0; i < 12; i++) completeTask("proj-recall-live", `live-${i}`);

    const active = recallService.getActiveSession();
    expect(active, "recall must still have a current session after eviction").toBeTruthy();

    // The active session is the newest one, and it is still retained.
    expect(recallService.getSessionHistory().map((s) => s.sessionId)).toContain(active!.sessionId);

    // Candidates are unaffected by session-history eviction: they live in their
    // own cache and are what the context package and UI actually read.
    const candidates = recallService.getRecallCandidates();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.status === "Active")).toBe(true);
  });

  it("keeps every retained session internally consistent", () => {
    setRetentionPolicy({ maxRecallSessions: 4 });
    for (let i = 0; i < 12; i++) completeTask("proj-recall-consistent", `consistent-${i}`);

    for (const session of recallService.getSessionHistory()) {
      expect(session.sessionId).toBeTruthy();
      expect(session.timestamp).toBeTruthy();
      expect(Array.isArray(session.candidates)).toBe(true);
      expect(Array.isArray(session.auditTrail)).toBe(true);
    }
  });

  it("clearHistory still resets recall completely", () => {
    setRetentionPolicy({ maxRecallSessions: 4 });
    for (let i = 0; i < 8; i++) completeTask("proj-recall-clear", `clear-${i}`);
    expect(recallService.getSessionHistory().length).toBeGreaterThan(0);

    recallService.clearHistory();

    expect(recallService.getSessionHistory()).toHaveLength(0);
    expect(recallService.getRecallCandidates()).toHaveLength(0);
    expect(recallService.getActiveSession()).toBeNull();
  });
});
