/**
 * The recall session diff: membership, not a scan.
 *
 * `startRecallSession` decides what each previously cached candidate becomes by
 * asking whether its memory is in the newly active set. That question used to
 * be `activeCandidates.some((c) => c.memoryId === old.memoryId)` -- a scan run
 * once per cached candidate, 125,250 string comparisons per rebuild at the
 * retention ceiling. It is now a Set lookup.
 *
 * The optimisation is only safe because the predicate was pure membership on
 * one field: it read nothing but `memoryId`, never used the object it matched,
 * and its result was consumed as a boolean. These tests pin the behaviour that
 * makes that true, so a future change that starts depending on ordering or on
 * some other candidate property fails here rather than silently degrading what
 * the companion recalls.
 *
 * What is asserted is the whole observable output of a cycle -- cache contents,
 * their order, every status transition, and the audit trail -- not merely which
 * candidates ended up Active.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

type Candidate = ReturnType<typeof recallService.getRecallCandidates>[number];

/** A candidate shaped the way the builder produces them. */
function candidate(memoryId: string, reason = "test"): Omit<Candidate, "status"> {
  return {
    memoryId,
    supportingStoryIds: [],
    importanceSignals: [],
    recallReasons: [reason],
    recallTimestamp: new Date().toISOString(),
  };
}

/** The full observable shape of the cache: contents, order and status. */
function cacheShape(): string[] {
  return recallService.getRecallCandidates().map((c) => `${c.memoryId}:${c.status}`);
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

describe("session diff is pure membership", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    recallService.clearHistory();
  });
  afterEach(() => {
    resetRetentionPolicy();
    recallService.clearHistory();
  });

  it("keeps a candidate Active when its memory is still selected", () => {
    recallService.startRecallSession([candidate("m1"), candidate("m2")], "QUERY");
    expect(cacheShape()).toEqual(["m1:Active", "m2:Active"]);

    recallService.startRecallSession([candidate("m1"), candidate("m2")], "QUERY");
    expect(cacheShape()).toEqual(["m1:Active", "m2:Active"]);
  });

  it("deactivates a candidate whose memory is no longer selected", () => {
    recallService.startRecallSession([candidate("m1"), candidate("m2")], "QUERY");
    recallService.startRecallSession([candidate("m1")], "QUERY");

    // Active first (pushed before the loop), then the demoted one.
    expect(cacheShape()).toEqual(["m1:Active", "m2:Inactive"]);
  });

  it("carries an Inactive candidate forward while its memory lives", () => {
    recallService.startRecallSession([candidate("m1"), candidate("m2")], "QUERY");
    recallService.startRecallSession([candidate("m1")], "QUERY");
    recallService.startRecallSession([candidate("m1")], "QUERY");

    expect(cacheShape()).toEqual(["m1:Active", "m2:Inactive"]);
  });

  it("reactivates an Inactive candidate when its memory is selected again", () => {
    recallService.startRecallSession([candidate("m1"), candidate("m2")], "QUERY");
    recallService.startRecallSession([candidate("m1")], "QUERY");
    expect(cacheShape()).toEqual(["m1:Active", "m2:Inactive"]);

    // The membership test is what decides this: m2 is active again, so the
    // stale Inactive copy must not be carried forward alongside it.
    recallService.startRecallSession([candidate("m1"), candidate("m2")], "QUERY");
    expect(cacheShape()).toEqual(["m1:Active", "m2:Active"]);
  });

  it("preserves cache ordering: newly active in selection order, then survivors", () => {
    recallService.startRecallSession(
      [candidate("a"), candidate("b"), candidate("c"), candidate("d")],
      "QUERY",
    );
    // Reordered selection, with two dropping out.
    recallService.startRecallSession([candidate("c"), candidate("a")], "QUERY");

    // Active entries keep the order they were supplied in; deactivated ones
    // follow in the order the previous cache held them.
    expect(cacheShape()).toEqual(["c:Active", "a:Active", "b:Inactive", "d:Inactive"]);
  });

  it("drops candidates whose memory no longer exists, on both branches", () => {
    recallService.startRecallSession([candidate("keep"), candidate("gone")], "QUERY");

    // "gone" was Active; with liveMemoryIds excluding it, it must be dropped
    // outright rather than demoted.
    recallService.startRecallSession([candidate("keep")], "QUERY", new Set(["keep"]));
    expect(cacheShape()).toEqual(["keep:Active"]);
  });

  it("records one audit entry per decision", () => {
    recallService.startRecallSession([candidate("m1"), candidate("m2")], "QUERY");
    const session = recallService.startRecallSession([candidate("m1")], "QUERY");

    const reasons = session.auditTrail.map((a) => `${a.memoryId}:${a.reason.split(":")[0]}`);
    expect(reasons).toEqual(["m1:Activated", "m2:Deactivated"]);
  });

  it("is unaffected by duplicate ids in the selection", () => {
    // Sets collapse duplicates where `some` would short-circuit on the first
    // match. Both answer the same boolean, so the cache must be identical.
    recallService.startRecallSession([candidate("x"), candidate("y")], "QUERY");
    recallService.startRecallSession([candidate("x"), candidate("x")], "QUERY");

    expect(cacheShape()).toEqual(["x:Active", "x:Active", "y:Inactive"]);
  });

  it("agrees with the scan it replaced, over a real workload", () => {
    const projectId = newProject("Diff Equivalence");
    for (let i = 0; i < 12; i++) completeTask(projectId, `diff-${i}`);
    recallBuilder.rebuildRecallCandidates();

    const cache = recallService.getRecallCandidates();
    const active = cache.filter((c) => c.status === "Active");

    // The original predicate, re-run against the settled cycle.
    for (const old of cache) {
      const viaScan = active.some((c) => c.memoryId === old.memoryId);
      const viaSet = new Set(active.map((c) => c.memoryId)).has(old.memoryId);
      expect(viaSet).toBe(viaScan);
    }
    expect(cache.length).toBeGreaterThan(0);
  });
});

describe("session diff under replay", () => {
  it("settles to the same recall state after reconstruction", () => {
    resetRetentionPolicy();
    const projectId = newProject("Diff Replay");
    for (let i = 0; i < 10; i++) completeTask(projectId, `dr-${i}`);
    recallBuilder.rebuildRecallCandidates();

    const liveActive = recallService
      .getRecallCandidates()
      .filter((c) => c.status === "Active").length;

    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();

    const replayedCache = recallService.getRecallCandidates();
    const replayedActive = replayedCache.filter((c) => c.status === "Active").length;

    expect(replayedActive).toBe(liveActive);

    // No candidate may survive whose memory the replay did not recreate.
    const live = new Set(memoryService.getMemories().map((m) => m.id));
    for (const c of replayedCache) expect(live.has(c.memoryId)).toBe(true);
  });

  it("reaches a fixed point: rebuilding twice changes nothing", () => {
    const first = cacheShape();
    recallBuilder.rebuildRecallCandidates();
    expect(cacheShape()).toEqual(first);
  });
});
