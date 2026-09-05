/**
 * Which twelve of the recall candidates the prompt gets to spend its budget on.
 *
 * `filterActiveRecallCandidates` and `compileRecentActivity` each take twelve
 * active candidates. They used to take the first twelve of the array. The array
 * is `recallCache`, which the builder fills by walking
 * `memoryService.getMemories()` in insertion order, so "the first twelve" meant
 * "the twelve oldest". At the retention ceiling a memory recorded today is
 * candidate ~500 and no score it earns can move it into the budget.
 *
 * That is a bound that answers a different question than the one being asked.
 * "What may GENESIS reason over" is memory retention; "what is worth spending
 * prompt tokens on" is this. The second was being decided by array position.
 *
 * These tests pin the ranking and, deliberately, also pin what it does NOT do:
 * the budget size, which candidates are eligible, and the order of everything
 * that genuinely ties are all unchanged. A ranking that quietly widened the
 * budget would pass a naive "the important one is included" test.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { RecallCandidate } from "../src/genesis/recall/types";
import type { ImportanceSignal } from "../src/genesis/importance/types";

const { contextRules } = await import("../src/genesis/context/context-rules");
const { getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

function candidate(
  memoryId: string,
  recallScore: number,
  signals: ImportanceSignal[] = [],
): RecallCandidate {
  return {
    memoryId,
    supportingStoryIds: [],
    importanceSignals: signals,
    recallReasons: [`Multi-factor recall [Score: ${recallScore.toFixed(2)}]`],
    recallScore,
    userAuthored: false,
    status: "Active",
    recallTimestamp: "2026-01-01T00:00:00.000Z",
  };
}

/** A candidate the user wrote: a captured note rather than a logged action. */
function authored(memoryId: string, recallScore: number): RecallCandidate {
  return { ...candidate(memoryId, recallScore), userAuthored: true };
}

/** Turn the reservation off, to assert what the ranking does on its own. */
function withoutReservation(): void {
  setRetentionPolicy({
    context: { ...getRetentionPolicy().context, maxAuthoredRecallCandidates: 0 },
  });
}

beforeEach(() => resetRetentionPolicy());
afterEach(() => resetRetentionPolicy());

describe("the prompt spends its recall budget on the strongest candidates", () => {
  it("includes a late high scorer that array position used to exclude", () => {
    const limit = getRetentionPolicy().context.maxRecallCandidates;

    // The shape of the defect: a full budget's worth of weaker candidates
    // recorded first, and the one that matters recorded last.
    const candidates: RecallCandidate[] = [];
    for (let i = 0; i < limit + 20; i++) candidates.push(candidate(`old-${i}`, 0.61));
    candidates.push(candidate("the-note", 0.95));

    const selected = contextRules.filterActiveRecallCandidates(candidates);
    expect(selected.length).toBe(limit);
    expect(selected.map((s) => s.data.memoryId)).toContain("the-note");
    // and it leads, rather than merely squeezing in.
    expect(selected[0].data.memoryId).toBe("the-note");
  });

  it("orders the selection by score, descending", () => {
    const candidates = [
      candidate("a", 0.2),
      candidate("b", 0.9),
      candidate("c", 0.5),
      candidate("d", 0.7),
    ];
    const scores = contextRules
      .filterActiveRecallCandidates(candidates)
      .map((s) => s.data.recallScore);
    expect(scores).toEqual([0.9, 0.7, 0.5, 0.2]);
  });

  it("keeps insertion order among candidates that tie", () => {
    // Stability matters here beyond tidiness: with a task-dominated history
    // most candidates carry the same score, and an unstable sort would reorder
    // the prompt on every rebuild for no reason.
    const candidates = [candidate("first", 0.8), candidate("second", 0.8), candidate("third", 0.8)];
    expect(
      contextRules.filterActiveRecallCandidates(candidates).map((s) => s.data.memoryId),
    ).toEqual(["first", "second", "third"]);
  });

  it("does not widen the budget", () => {
    setRetentionPolicy({ context: { ...getRetentionPolicy().context, maxRecallCandidates: 3 } });
    const candidates = Array.from({ length: 40 }, (_, i) => candidate(`m-${i}`, i / 100));
    expect(contextRules.filterActiveRecallCandidates(candidates).length).toBe(3);
  });

  it("still excludes inactive candidates whatever they score", () => {
    const hot = candidate("inactive-but-hot", 1.0);
    const selected = contextRules.filterActiveRecallCandidates([
      { ...hot, status: "Inactive" },
      candidate("active-but-cold", 0.1),
    ]);
    expect(selected.map((s) => s.data.memoryId)).toEqual(["active-but-cold"]);
  });

  it("ranks a candidate no rule scored below every candidate a rule did", () => {
    // `Active Story Recall Rule` recalls on story membership alone and reports
    // no score, leaving 0. Belonging to an active story is the weakest reason
    // recall has, so last is where it belongs.
    const storyOnly: RecallCandidate = {
      ...candidate("story-only", 0),
      recallReasons: ['Associated with active narrative: "Project Arc: X".'],
    };
    const selected = contextRules.filterActiveRecallCandidates([
      storyOnly,
      candidate("scored", 0.05),
    ]);
    expect(selected.map((s) => s.data.memoryId)).toEqual(["scored", "story-only"]);
  });
});

describe("the recent activity summary uses the same ranking", () => {
  it("draws the same twelve, so the two prompt sections agree", () => {
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const candidates: RecallCandidate[] = [];
    for (let i = 0; i < limit + 5; i++) candidates.push(candidate(`old-${i}`, 0.3));
    candidates.push(candidate("the-note", 0.95));

    const selectedIds = contextRules
      .filterActiveRecallCandidates(candidates)
      .map((s) => s.data.memoryId);
    const activityLines = contextRules.compileRecentActivity(candidates);

    expect(activityLines.length).toBe(selectedIds.length);
    expect(activityLines[0]).toContain("the-note");
    for (const id of selectedIds) {
      expect(
        activityLines.some((line) => line.includes(id)),
        `missing ${id}`,
      ).toBe(true);
    }
  });

  it("respects its own budget rather than the candidate budget", () => {
    setRetentionPolicy({
      context: { ...getRetentionPolicy().context, maxRecentActivity: 2, maxRecallCandidates: 9 },
    });
    const candidates = Array.from({ length: 20 }, (_, i) => candidate(`m-${i}`, i / 100));
    expect(contextRules.compileRecentActivity(candidates).length).toBe(2);
    expect(contextRules.filterActiveRecallCandidates(candidates).length).toBe(9);
  });
});

describe("the prompt says why a memory is there", () => {
  /**
   * `inclusionReason` reaches the model verbatim, as
   * `- <description> (Reason: <inclusionReason> | ID: <id>)`. It used to be
   * derived by searching the recall reasons -- prose written for a human -- for
   * the substrings "user intent" and "milestone". Neither occurs in either
   * reason the rules produce, so both branches were dead and everything was
   * labelled "Recent Recall", a note the user had just typed included.
   */
  const withSignals = (id: string, types: ImportanceSignal["type"][]): RecallCandidate =>
    candidate(
      id,
      0.8,
      types.map((type) => ({ type, strength: 0.8, explanation: `${type} signal` })),
    );

  it("labels an explicitly captured note as User Intent", () => {
    const [item] = contextRules.filterActiveRecallCandidates([
      withSignals("note", ["Recency", "User Intent"]),
    ]);
    expect(item.inclusionReason).toBe("User Intent");
  });

  it("labels a milestone as High Importance", () => {
    const [item] = contextRules.filterActiveRecallCandidates([
      withSignals("milestone", ["Milestone", "Recency"]),
    ]);
    expect(item.inclusionReason).toBe("High Importance");
  });

  it("prefers user intent over a milestone, as the original precedence did", () => {
    const [item] = contextRules.filterActiveRecallCandidates([
      withSignals("both", ["Milestone", "User Intent"]),
    ]);
    expect(item.inclusionReason).toBe("User Intent");
  });

  it("falls back to Recent Recall when neither signal is present", () => {
    const [item] = contextRules.filterActiveRecallCandidates([
      withSignals("plain", ["Recency", "Relationships"]),
    ]);
    expect(item.inclusionReason).toBe("Recent Recall");
  });

  it("does not read the label out of the reason prose any more", () => {
    // A story whose title happens to contain the words would previously have
    // relabelled every one of its members.
    const trap: RecallCandidate = {
      ...candidate("trap", 0.8),
      recallReasons: ['Associated with active narrative: "User Intent milestone notes".'],
    };
    const [item] = contextRules.filterActiveRecallCandidates([trap]);
    expect(item.inclusionReason).toBe("Recent Recall");
  });
});

describe("the budget reserves room for what the user wrote", () => {
  /**
   * Ranking alone does not solve this, and the numbers are why.
   *
   * Measured at the retention ceiling on a task-dominated history: 500
   * completed-task memories all score 0.85 -- identical, because stability 1.0
   * and a saturated relationship signal are the same for every one of them --
   * and a freshly captured note scores 0.70. Sorting is then correct and still
   * spends all twelve slots on copies of one fact. The note is not more
   * important by score; it is unique by construction, and that is the property
   * the reservation protects.
   */
  const DEGENERATE = 0.85;
  const NOTE = 0.7;

  function saturated(count: number): RecallCandidate[] {
    return Array.from({ length: count }, (_, i) => candidate(`task-${i}`, DEGENERATE));
  }

  it("includes a lower-scoring note that the ranking alone would exclude", () => {
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const candidates = [...saturated(limit + 50), authored("the-note", NOTE)];

    const selected = contextRules.filterActiveRecallCandidates(candidates);
    expect(selected.length).toBe(limit);
    expect(selected.map((s) => s.data.memoryId)).toContain("the-note");
  });

  it("and would exclude it with the reservation turned off", () => {
    // The control. Without this the test above would pass on a build where the
    // note simply scored well enough, and would prove nothing.
    withoutReservation();
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const candidates = [...saturated(limit + 50), authored("the-note", NOTE)];

    expect(
      contextRules.filterActiveRecallCandidates(candidates).map((s) => s.data.memoryId),
    ).not.toContain("the-note");
  });

  it("holds no more than the reserved number of slots", () => {
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const reserved = getRetentionPolicy().context.maxAuthoredRecallCandidates;
    expect(reserved).toBeLessThan(limit);

    // Twenty weak notes must not evict the entire account of recent activity.
    const notes = Array.from({ length: 20 }, (_, i) => authored(`note-${i}`, 0.1));
    const selected = contextRules.filterActiveRecallCandidates([...saturated(limit), ...notes]);

    expect(selected.filter((s) => s.data.userAuthored).length).toBe(reserved);
    expect(selected.length).toBe(limit);
  });

  it("is a floor and not a cap, so strong notes are not held back to it", () => {
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const reserved = getRetentionPolicy().context.maxAuthoredRecallCandidates;

    // Every note outscores every task. All of them should be selected on
    // merit; the reservation must not cap authored candidates at three.
    const notes = Array.from({ length: reserved + 4 }, (_, i) => authored(`note-${i}`, 0.99));
    const selected = contextRules.filterActiveRecallCandidates([...saturated(limit), ...notes]);

    expect(selected.filter((s) => s.data.userAuthored).length).toBe(reserved + 4);
  });

  it("uses no reserved slots when the user has written nothing", () => {
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const selected = contextRules.filterActiveRecallCandidates(saturated(limit + 10));
    expect(selected.length).toBe(limit);
    expect(selected.every((s) => s.data.memoryId.startsWith("task-"))).toBe(true);
  });

  it("still presents the selection in score order", () => {
    // The reservation decides which candidates are spent. It must not imply a
    // ranking the scores do not support.
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const selected = contextRules.filterActiveRecallCandidates([
      ...saturated(limit),
      authored("weak-note", NOTE),
    ]);
    const scores = selected.map((s) => s.data.recallScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(selected[selected.length - 1].data.memoryId).toBe("weak-note");
  });

  it("never selects an inactive note into a reserved slot", () => {
    const limit = getRetentionPolicy().context.maxRecallCandidates;
    const selected = contextRules.filterActiveRecallCandidates([
      ...saturated(limit + 5),
      { ...authored("gone", 0.99), status: "Inactive" },
    ]);
    expect(selected.map((s) => s.data.memoryId)).not.toContain("gone");
  });

  it("applies the same reservation to the recent activity summary", () => {
    const limit = getRetentionPolicy().context.maxRecentActivity;
    const lines = contextRules.compileRecentActivity([
      ...saturated(limit + 50),
      authored("the-note", NOTE),
    ]);
    expect(lines.length).toBe(limit);
    expect(lines.some((l) => l.includes("the-note"))).toBe(true);
  });
});
