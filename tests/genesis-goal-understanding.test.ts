/**
 * A goal understanding must name a goal.
 *
 * `goalRule` fell back to the literal key `"general_progress"` for any memory
 * whose reason was "Goal Progress" -- and `candidate-rules` sets that reason on
 * *every* `task_completed` and `mission_completed`. Since `metadata.goalId` and
 * `metadata.goalName` have no producer anywhere, that fallback was not a
 * fallback; it was the only branch that ever ran.
 *
 * So every task the user ever ticked off, across unrelated work, collected into
 * one fragment. Measured on two projects sharing nothing -- a chip design
 * course and marathon training -- 8 memories, High confidence, rendered as:
 *
 *   Goal
 *   • General Progress
 *   The user has consistently demonstrated a long-term commitment toward
 *   general progress.
 *
 * A claim keyed on a constant is the same claim whatever the user does. It also
 * sat beside a real goal in the same block, at equal confidence, diluting it.
 *
 * WHAT THE GUARD IS FOR
 *
 * "No Goal understanding was produced" passes trivially if the workload
 * produced no completed tasks at all, which would make this file agree with
 * the fix while testing nothing. So the memories that used to feed the bucket
 * are asserted to exist first, by the reason that triggered it.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { getUnderstandingContext } = await import("../src/genesis/understanding/context-provider");

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  understandingEngine.initialize();
}

/** A project with tasks the user actually finished. */
function projectWithCompletedTasks(name: string, titles: string[]): void {
  akira.addProject({ name });
  const pid = akira.getState().lastProjectId as string;
  for (const title of titles) {
    akira.addTaskDetails({ title, projectId: pid });
    const task = akira.getState().tasks.find((t) => t.title === title);
    if (task) akira.toggleTask(task.id);
  }
}

const goals = () => understandingEngine.getUnderstandings().filter((u) => u.category === "Goal");

beforeEach(() => {
  freshWorkspace();
  projectWithCompletedTasks("Chip Design Course", ["Read chapter 3", "Do the cache lab"]);
  projectWithCompletedTasks("Marathon Training", ["Long run 20k", "Hill repeats"]);
});

describe("completing tasks", () => {
  it("still produces the memories that used to feed the bucket", () => {
    // The guard. Everything below is about what is *not* built from these, so
    // they have to exist or the rest of this file proves nothing.
    const progress = memoryService.getMemories().filter((m) => m.reason === "Goal Progress");
    expect(progress.length).toBeGreaterThan(4);

    // And the branches that would legitimately name a goal are still empty,
    // which is why the removed fallback was the only one that ever ran.
    for (const m of progress) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      expect(meta.goalId).toBeUndefined();
      expect(meta.goalName).toBeUndefined();
    }
  });

  it("does not invent a goal out of unrelated finished work", () => {
    expect(goals()).toEqual([]);
  });

  it("says nothing about general progress to the model", () => {
    const text = getUnderstandingContext();
    expect(text.toLowerCase()).not.toContain("general progress");
    expect(text.toLowerCase()).not.toContain("general_progress");
  });

  it("still tells the model about the work itself, by name", () => {
    // Nothing was lost by dropping the bucket: the activity reaches the prompt
    // through the Project understanding, which names the project.
    const text = getUnderstandingContext();
    expect(text).toContain("Chip Design Course");
    expect(text).toContain("Marathon Training");
  });
});

describe("a goal the user actually stated", () => {
  it("still becomes a goal understanding", () => {
    // The category is not disabled -- `personalDeclarationRule` keys on the
    // declared content, and that is what a goal understanding is for.
    akira.addNote("I want to become a commercial pilot");

    const stated = goals();
    expect(stated).toHaveLength(1);
    expect(stated[0].canonicalKey).toBe("goal:become-a-commercial-pilot");
    expect(getUnderstandingContext()).toContain("Become A Commercial Pilot");
  });

  it("is not crowded by one invented alongside it", () => {
    akira.addNote("I want to become a commercial pilot");

    // Before, this block held two Goal entries at equal confidence: the stated
    // one and "General Progress".
    expect(goals().map((g) => g.canonicalKey)).toEqual(["goal:become-a-commercial-pilot"]);
  });
});
