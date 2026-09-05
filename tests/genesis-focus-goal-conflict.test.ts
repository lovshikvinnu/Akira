/**
 * A goal you are not literally naming is not a contradiction.
 *
 * `resolveUnifiedContext` used to declare a "Subsystem conflict" whenever the
 * top goal's title did not contain `currentFocus` as a substring, or vice
 * versa. The two operands are not comparable: `currentFocus` is a `FocusArea`
 * -- a closed vocabulary of "Planning" | "Learning" | "Building" |
 * "Reflection" | "Casual" | "Problem Solving" -- and a goal title is whatever
 * the user typed. Measured across the six real focus areas against six
 * ordinary goal titles, a conflict was declared in 36 of 36 pairs, including
 * every aligned one: "Learning" against "Learn Spanish" was a conflict.
 *
 * It was not a harmless label. `conflictsExposed` docks `certainty.score` by
 * 0.15, prints an "Exposed Conflicts" block into the prompt, and is the first
 * branch `evaluateInitiative` tests -- returning `decisionOutcome: "Question"`.
 * AKIRA interrupted the user to clarify a contradiction it had invented, most
 * reliably when the user was doing exactly what their goal said.
 *
 * WHAT THESE CASES ASSERT, AND WHY NOT MORE
 *
 * They assert that specific *aligned* and *merely unrelated* pairs raise
 * nothing -- claims any correct detector would also satisfy. They deliberately
 * do not assert that `conflictsExposed` is always empty: a real detector,
 * comparing two claims that genuinely contradict, should be able to fill it,
 * and a test forbidding that would fail the next person's correct work.
 */
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

import { resolveUnifiedContext } from "../src/genesis/context/context-resolution/rules";
import { evaluateInitiative } from "../src/genesis/context/initiative/rules";

/** Enough of a CompanionState for the resolver to read a focus from. */
function stateWithFocus(focus: string, confidence = 0.9) {
  return {
    currentFocus: focus,
    activeProject: null,
    contextConfidence: confidence,
    evidence: { evidenceLog: [], snapshot: { relevantMemories: [] } },
  } as never;
}

/** Enough of a GoalContext for the resolver to read a top goal from. */
function goalsWithTitle(title: string, confidence = 0.8) {
  return {
    activeGoals: [
      {
        id: "g1",
        title,
        description: "",
        status: "Active",
        progressPercentage: 10,
        confidence: 0.8,
        supportedTaskIds: [],
        blockers: [],
        updatedAt: Date.now(),
      },
    ],
    currentPriorities: [],
    goalHierarchy: [],
    confidence,
    evidence: { evidenceLog: [], goalsSnapshot: [] },
  } as never;
}

const resolve = (focus: string, goal: string, conf?: number) =>
  resolveUnifiedContext(
    null,
    stateWithFocus(focus, conf),
    goalsWithTitle(goal, conf),
    null,
    null,
    null,
    null,
  );

describe("focus against a goal title", () => {
  it("raises nothing when the focus and the goal plainly agree", () => {
    // The case that made the old predicate indefensible: it fired hardest here.
    for (const [focus, goal] of [
      ["Learning", "Learn Spanish"],
      ["Building", "Build a home lab"],
      ["Planning", "Plan the Q3 roadmap"],
      ["Reflection", "Reflect on the year"],
    ]) {
      expect(resolve(focus, goal).conflictsExposed).toEqual([]);
    }
  });

  it("raises nothing when they are merely unrelated", () => {
    // Working on something other than your top goal is ordinary, not a
    // contradiction. Unrelated is not the same as contradictory.
    expect(resolve("Building", "Learn Spanish").conflictsExposed).toEqual([]);
    expect(resolve("Casual", "Ship the v2 release").conflictsExposed).toEqual([]);
  });

  it("does not spend the confidence penalty on an invented conflict", () => {
    // 0.15 is deducted per resolution when anything is exposed.
    const resolved = resolve("Learning", "Learn Spanish");
    expect(resolved.certainty.score ?? 0).toBeGreaterThan(0.75);
  });

  it("does not interrupt the user to clarify it", () => {
    // `evaluateInitiative` reaches its conflict branch only when confidence
    // survives the 0.15 deduction: it needs >= 0.75 to pass the proactive
    // threshold, and <= 0.85 to escape the deep-focus block above it. A 0.95
    // baseline lands at 0.80 and hits that band exactly, which is why this
    // case pins 0.95 rather than the default -- at the default the deduction
    // undershoots 0.75 and the answer is Silence for a different reason, and
    // the case would pass while proving nothing about the conflict branch.
    const decision = evaluateInitiative(resolve("Learning", "Learn Spanish", 0.95));
    expect(decision.decisionOutcome).not.toBe("Question");
  });

  it("does not silence proactive help either, at a lower baseline", () => {
    // The other half of the same defect. Below a 0.90 baseline the deduction
    // pushes confidence under MIN_CONFIDENCE_FOR_PROACTIVE_INITIATIVE (0.75)
    // and every proactive branch is skipped -- so the invented conflict either
    // interrupted the user or muted AKIRA, depending on numbers that have
    // nothing to do with goals or focus.
    const resolved = resolve("Learning", "Learn Spanish");
    expect(resolved.certainty.score ?? 0).toBeGreaterThanOrEqual(0.75);
  });
});
