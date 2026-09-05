/**
 * Each prompt layer has to add something.
 *
 * Evidence -> understanding -> context selection -> prompt presentation. A
 * layer may select, aggregate, reframe or interpret; it may not restate what
 * the layer before it already said.
 *
 * "Recent Activity History" restated "Relevant Long-Term Memories". Both are
 * built by `rankedActive` from the same `recallCache`, and `maxRecallCandidates`
 * and `maxRecentActivity` are both 12, so the two lists hold the same memories
 * in the same order by construction. Measured on a workspace of three projects,
 * twelve completed tasks and four notes:
 *
 *     total prompt                            3760 chars
 *     Long-Term Memories entries                12
 *     Recent Activity entries                   12
 *     descriptions present in BOTH blocks        12
 *     descriptions only in Recent Activity        0
 *     Recent Activity share of the prompt     1471 chars (39.1%)
 *
 * Around each description it wrapped `Recall active memory node [...] because:
 * Associated with active narrative: "..."` -- the engine narrating its own
 * recall, and a narrative title that is the fixed label "Project Arc: Project
 * Created" for every project, so it could not say which arc a memory belonged
 * to either.
 *
 * WHAT THIS FILE WILL NOT LET HAPPEN
 * ----------------------------------
 * The goal is not a short prompt. Deleting a block always shrinks the output,
 * so "smaller" proves nothing on its own -- every case that checks something is
 * gone is paired with one checking the information it carried is still there.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { contextService } = await import("../src/genesis/context/context-service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");

const QUERY = "what should I focus on next";

/** Three projects, twelve completed tasks, four notes, one chat turn. */
function workload(): void {
  akira.initializeState(akira.getState());
  recallBuilder.initialize();
  for (const name of ["Pilot Licence", "Learn Verilog", "Kitchen Remodel"]) {
    akira.addProject({ name });
    const projectId = akira.getState().lastProjectId as string;
    for (let i = 0; i < 4; i++) {
      const title = `${name} step ${i}`;
      akira.addTaskDetails({ title, projectId });
      const task = akira.getState().tasks.find((t) => t.title === title);
      if (task) akira.toggleTask(task.id);
    }
  }
  akira.addNote({ title: "Aviation", content: "I want to become a pilot" });
  akira.addNote({ title: "Languages", content: "I want to become fluent in Japanese" });
  akira.addNote({ title: "Ground school", content: "Booked the medical for next month" });
  akira.addChatMessage("user", QUERY);
}

function selection(query: string) {
  const contextPackage = contextService.getActiveContext() ?? undefined;
  contextResolutionService.rebuildResolvedContext();
  return contextRelevanceSelector.selectContext(
    query,
    contextPackage,
    contextResolutionService.getContext(),
  );
}

/** The system instruction the model is actually handed. */
function prompt(query = QUERY): string {
  return promptBuilder.buildSystemInstruction(query, selection(query), {
    intent: null,
    confidence: 1,
    ambiguous: false,
    clarificationRequired: false,
    candidates: [],
  });
}

/** The lines of a named block, up to the next blank line. */
function block(text: string, header: string): string[] {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim() === header);
  if (i === -1) return [];
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) out.push(lines[j].trim());
  return out;
}

beforeAll(() => {
  workload();
});

describe("evidence is presented once", () => {
  it("still carries every memory the selection chose", () => {
    // Paired with the removal case below. If this file only asserted that a
    // block is gone, deleting the whole prompt would pass.
    const memories = block(prompt(), "Relevant Long-Term Memories:");
    expect(memories.length, "the evidence block is empty").toBeGreaterThan(5);
    expect(memories.some((l) => l.includes("Started new project: Pilot Licence"))).toBe(true);
    expect(memories.some((l) => l.includes("I want to become a pilot"))).toBe(true);
  });

  it("does not restate them as recall narration", () => {
    const text = prompt();
    expect(block(text, "Recent Activity History:")).toEqual([]);
    expect(text, "the engine is narrating its own recall to the model").not.toContain(
      "Recall active memory node",
    );
  });

  it("names each recalled memory exactly once", () => {
    // The property the removal exists for, stated over the evidence itself
    // rather than over a block name.
    const text = prompt();
    const shown = block(text, "Relevant Long-Term Memories:");
    expect(shown.length, "nothing recalled, so nothing to be duplicated").toBeGreaterThan(5);

    for (const line of shown) {
      const description = line.replace(/^- /, "").replace(/ \(Reason: [^)]*\)$/, "");
      const occurrences = text.split(description).length - 1;
      expect(occurrences, `"${description.slice(0, 50)}" appears ${occurrences} times`).toBe(1);
    }
  });

  it("leaves the developer view untouched", () => {
    // `brain.tsx` renders `recentActivitySummary` in the Brain inspector. Only
    // the copy built for the model was narrowed, the same split the
    // recall-telemetry filter uses.
    const pkg = contextService.getActiveContext()!;
    expect(
      pkg.recentActivitySummary.length,
      "the producer was removed along with the prompt block",
    ).toBeGreaterThan(0);
  });
});

describe("the layers stay distinguishable", () => {
  it("keeps evidence, selection and understanding as separate statements", () => {
    // One aspiration, three roles. Each says something the others do not: what
    // the user wrote, that it is a current goal, and how well supported it is.
    const text = prompt();
    expect(
      block(text, "Relevant Long-Term Memories:").some((l) =>
        l.includes("I want to become a pilot"),
      ),
    ).toBe(true);
    expect(block(text, "Goals:").some((l) => l.includes("become a pilot"))).toBe(true);
    expect(
      block(text, "Emergent Identity Traits:").some((l) => l.includes("become a pilot: Active")),
    ).toBe(true);
  });

  it("lets context selection actually change what reaches the model", () => {
    // Selection is a layer only if it selects. Measured: 4 narrative arcs and 5
    // goals in the package, 0 and 2 in the prompt.
    const raw = contextService.getActiveContext()!;
    const selected = selection(QUERY).contextPackage!;

    expect(raw.activeStories.length, "no stories to select from").toBeGreaterThan(0);
    expect(
      selected.activeStories.length + selected.currentGoals.length,
      "selection passed everything through unchanged",
    ).toBeLessThan(raw.activeStories.length + raw.currentGoals.length);
  });

  it("shows the model less than GENESIS holds", () => {
    const held = memoryService.getMemories().length;
    const shown = block(prompt(), "Relevant Long-Term Memories:").length;
    expect(held, "not enough memories for selection to matter").toBeGreaterThan(shown);
  });
});

describe("internal machinery does not reach the model", () => {
  it("carries no uuids", () => {
    expect(prompt().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/gi) ?? []).toEqual([]);
  });

  it("carries no recall telemetry", () => {
    const text = prompt();
    for (const marker of ["Multi-factor recall", "SemanticMatch:", "Stability:", "Score:"]) {
      expect(text, `"${marker}" reached the model`).not.toContain(marker);
    }
  });
});
