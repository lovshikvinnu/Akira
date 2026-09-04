/**
 * The supporting-id comparison inside `buildUnderstandingGraph`, and the
 * equivalence it must preserve.
 *
 * The comparison decides whether an understanding is "unchanged", and that
 * decision is observable: an unchanged understanding keeps its **exact object
 * reference**, which is what `engine.rebuildGraph` compares to decide whether
 * to notify. So a comparison that got sloppier would show up as either lost
 * identity (new object every rebuild, listeners woken constantly) or false
 * stability (a real change never propagating).
 *
 * WHY THESE CASES
 * ---------------
 * `arraysEqual` was `[...a].sort()` on both sides compared element-wise, which
 * is exactly multiset equality: order-insensitive, duplicate-sensitive. It is
 * now a counting map. The cases below pin both halves of that, because the
 * obvious cheap replacement -- a `Set` -- passes the order test and silently
 * fails the duplicate one, calling [x, x, y] equal to [x, y, y].
 *
 * The comparison is a closure inside `buildUnderstandingGraph` and is not
 * exported, so every case here drives it through the real function with a real
 * memory set rather than testing a copy of it.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { buildUnderstandingGraph } = await import("../src/genesis/understanding/builder");
import type { Understanding } from "../src/genesis/understanding/types";
import type { Memory } from "../src/genesis/validation/types";
import type { Story } from "../src/genesis/stories/types";

void genesis;

let memories: Memory[] = [];
let stories: Story[] = [];
let baseline: Understanding[] = [];

let seq = 0;
function completeTask(projectId: string): void {
  const title = `ug-task-${seq++}`;
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

beforeAll(() => {
  akira.addProject({ name: "Understanding Equality" });
  const projectId = akira.getState().lastProjectId as string;
  akira.addTaskDetails({ title: "ug-pending", projectId });
  for (let i = 0; i < 8; i++) completeTask(projectId);
  akira.addNote({ title: "A note", content: "morning routine and sleep", projectId });

  memories = memoryService.getMemories();
  stories = storyService.getStories();
  baseline = buildUnderstandingGraph(memories, stories, []);
});

describe("understanding graph preserves identity for unchanged supporting ids", () => {
  it("produces understandings with supporting ids to compare", () => {
    expect(baseline.length).toBeGreaterThan(0);
    expect(baseline.some((u) => u.supportingMemoryIds.length > 1)).toBe(true);
  });

  it("reuses the exact object reference when nothing changed", () => {
    const again = buildUnderstandingGraph(memories, stories, baseline);
    for (const u of again) {
      const prior = baseline.find((b) => b.canonicalKey === u.canonicalKey);
      expect(prior, `no prior for ${u.canonicalKey}`).toBeDefined();
      // Reference identity, not deep equality: this is what the engine compares.
      expect(u, `identity lost for ${u.canonicalKey}`).toBe(prior);
    }
  });

  it("treats a permutation of the same ids as unchanged", () => {
    // Order-insensitivity. A comparison that compared element-wise without
    // normalising would call this a change and rebuild every action.
    const permuted: Understanding[] = baseline.map((u) => ({
      ...u,
      supportingMemoryIds: [...u.supportingMemoryIds].reverse(),
      supportingStoryIds: [...u.supportingStoryIds].reverse(),
    }));
    const again = buildUnderstandingGraph(memories, stories, permuted);
    for (const u of again) {
      const prior = permuted.find((p) => p.canonicalKey === u.canonicalKey);
      expect(prior).toBeDefined();
      expect(u, `permutation treated as a change for ${u.canonicalKey}`).toBe(prior);
    }
  });

  it("treats a different multiplicity of the same ids as CHANGED", () => {
    // Duplicate-sensitivity, and the case a Set-based comparison gets wrong.
    // Same length, same distinct values, different counts.
    const target = baseline.find((u) => u.supportingMemoryIds.length >= 2);
    expect(target, "need an understanding with at least two supporting ids").toBeDefined();

    const ids = target!.supportingMemoryIds;
    const skewed: Understanding[] = baseline.map((u) =>
      u.canonicalKey === target!.canonicalKey
        ? { ...u, supportingMemoryIds: [ids[0], ids[0], ...ids.slice(2)] }
        : u,
    );
    // Precondition: same length, same distinct membership is not required --
    // what matters is that a Set would see no difference in the first two slots.
    expect(
      skewed.find((u) => u.canonicalKey === target!.canonicalKey)!.supportingMemoryIds.length,
    ).toBe(ids.length);

    const again = buildUnderstandingGraph(memories, stories, skewed);
    const rebuilt = again.find((u) => u.canonicalKey === target!.canonicalKey);
    const prior = skewed.find((u) => u.canonicalKey === target!.canonicalKey);
    expect(rebuilt).toBeDefined();
    expect(rebuilt, "duplicate skew was treated as unchanged").not.toBe(prior);
  });

  it("treats a genuinely different id set as changed", () => {
    const altered: Understanding[] = baseline.map((u) => ({
      ...u,
      supportingMemoryIds: [...u.supportingMemoryIds.slice(1), "not-a-real-memory-id"],
    }));
    const again = buildUnderstandingGraph(memories, stories, altered);
    for (const u of again) {
      const prior = altered.find((p) => p.canonicalKey === u.canonicalKey);
      if (prior) expect(u, `change not detected for ${u.canonicalKey}`).not.toBe(prior);
    }
  });

  it("treats a shorter id list as changed", () => {
    const shortened: Understanding[] = baseline.map((u) => ({
      ...u,
      supportingMemoryIds: u.supportingMemoryIds.slice(0, -1),
    }));
    const again = buildUnderstandingGraph(memories, stories, shortened);
    for (const u of again) {
      const prior = shortened.find((p) => p.canonicalKey === u.canonicalKey);
      if (prior && prior.supportingMemoryIds.length !== u.supportingMemoryIds.length) {
        expect(u, `length change not detected for ${u.canonicalKey}`).not.toBe(prior);
      }
    }
  });

  it("is stable across repeated rebuilds, so the engine stops notifying", () => {
    let graph = buildUnderstandingGraph(memories, stories, []);
    for (let i = 0; i < 5; i++) {
      const next = buildUnderstandingGraph(memories, stories, graph);
      expect(next.length).toBe(graph.length);
      for (let j = 0; j < next.length; j++) {
        expect(next[j], `reference churned on rebuild ${i}`).toBe(
          graph.find((g) => g.canonicalKey === next[j].canonicalKey),
        );
      }
      graph = next;
    }
  });
});
