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
const { getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy } = await import(
  "../src/genesis/retention/policy"
);

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
    status: "Active",
    recallTimestamp: "2026-01-01T00:00:00.000Z",
  };
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
    const candidates = [
      candidate("first", 0.8),
      candidate("second", 0.8),
      candidate("third", 0.8),
    ];
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
      expect(activityLines.some((line) => line.includes(id)), `missing ${id}`).toBe(true);
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
