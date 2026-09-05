/**
 * What happens to a thought the user captures without filing it anywhere.
 *
 * The sentence used throughout is one a person would actually type into a quick
 * capture box:
 *
 *     "I want to become a pilot and build an aviation company."
 *
 * It is chosen because it matches none of `classifyMemory`'s keyword lists. It
 * is unmistakably a goal to a reader and invisible to the classifier, which is
 * what makes it a fair test of whether anything *other* than keyword luck
 * decides how the system treats the user's own words.
 *
 * WHAT WAS WRONG
 * --------------
 * Two independent mechanisms, and only one of them was the one everybody named.
 *
 *   1. `Active Story Recall Rule` declines to recall a memory merely for
 *      belonging to the reflections arc when the context is BOOTSTRAP. That is
 *      deliberate: at bootstrap there is no conversation to be relevant to, and
 *      recalling every captured thought because it is in an active story would
 *      fill the prompt with the entire arc. This rule is not the defect.
 *
 *   2. `Intelligent Multi-Factor Recall Rule` then had to recall it on merit,
 *      and could not. `classifyMemory` sends a memory with a `relatedProjectId`
 *      down the "Project" branch (stability 0.8) and lets everything else fall
 *      through to "Reflection" (0.4). At BOOTSTRAP stability carries 0.6 of the
 *      weight, so the same captured sentence scored 0.70 filed under a project
 *      and 0.46 free-standing, against a threshold of 0.60.
 *
 * Together: a free-standing note produced no recall candidate at all at
 * bootstrap, while the identical note filed under a project produced one. The
 * difference was filing, not content -- and filing is not a claim about how
 * durable a thought is.
 *
 * WHAT CHANGED
 * ------------
 * Mechanism 2 only. Explicit authorship is now a floor on stability, read from
 * `memory.relatedNoteId` -- a structured field the translator sets for exactly
 * the two events the user originates. Mechanism 1 is untouched in behaviour and
 * now asks `isReflectionsArc(story)` instead of comparing the story's title to
 * a string, so the bound survives a rename.
 *
 * These tests therefore assert both halves, because a change that satisfied
 * only the first would be the one worth worrying about: the note must become
 * recallable, AND the arc must still not be dumped into the bootstrap prompt
 * wholesale.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";
import type { Memory } from "../src/genesis/validation/types";
import type { RecallContext } from "../src/genesis/recall/types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { recallRules } = await import("../src/genesis/recall/recall-rules");
const { isReflectionsArc } = await import("../src/genesis/stories/story-identity");
const { contextRules } = await import("../src/genesis/context/context-rules");
const { getRetentionPolicy } = await import("../src/genesis/retention/policy");

const SENTENCE = "I want to become a pilot and build an aviation company.";

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  recallService.clearHistory();
}

/** Every memory that came from a note the user wrote. */
const noteMemories = (): Memory[] => memoryService.getMemories().filter((m) => m.relatedNoteId);

const memoryForNote = (noteId: string): Memory | undefined =>
  memoryService.getMemories().find((m) => m.relatedNoteId === noteId);

/**
 * Rebuilds recall in a given context and reports whether a memory is Active.
 *
 * Deliberately goes through `recallBuilder` rather than calling a rule
 * directly: the question is whether the note is recalled by the system, and the
 * two rules can disagree. A rule-level assertion would pass while the pipeline
 * still dropped the memory.
 */
function isActiveIn(context: RecallContext, memoryId: string): boolean {
  recallBuilder.rebuildRecallCandidates(context);
  return recallService
    .getRecallCandidates()
    .some((c) => c.memoryId === memoryId && c.status === "Active");
}

/** The reasons recorded for a memory in the last rebuild, for diagnosis. */
function reasonsFor(memoryId: string): string[] {
  const c = recallService.getRecallCandidates().find((x) => x.memoryId === memoryId);
  return c?.recallReasons ?? [];
}

beforeEach(() => {
  freshWorkspace();
});

describe("a free-standing note the user wrote is recallable at bootstrap", () => {
  it("recalls a titled free-standing note", () => {
    const noteId = akira.addNote({ title: "Pilot plan", content: SENTENCE });
    const memory = memoryForNote(noteId);
    expect(memory, "a titled free-standing note produced no memory").toBeDefined();
    expect(memory!.relatedProjectId ?? null).toBeNull();

    expect(isActiveIn("BOOTSTRAP", memory!.id)).toBe(true);

    // Recalled on merit, not by story membership: the arc rule is still
    // declining at BOOTSTRAP, so the only reason present is the scored one.
    const reasons = reasonsFor(memory!.id);
    expect(reasons.some((r) => r.startsWith("Multi-factor recall"))).toBe(true);
    expect(reasons.some((r) => r.includes("Personal Growth Reflections"))).toBe(false);
  });

  it("recalls an untitled quick capture", () => {
    // The shape four of the five capture surfaces produce: body, no title.
    const noteId = akira.addNote({ content: SENTENCE });
    const memory = memoryForNote(noteId);
    expect(memory, "an untitled quick capture produced no memory").toBeDefined();

    expect(isActiveIn("BOOTSTRAP", memory!.id)).toBe(true);
  });

  it("recalls a project-attached note, as it always did", () => {
    akira.addProject({ name: "Aviation Co" });
    const projectId = akira.getState().lastProjectId as string;
    const noteId = akira.addNote({ title: "Attached", content: SENTENCE, projectId });
    const memory = memoryForNote(noteId);
    expect(memory).toBeDefined();
    expect(memory!.relatedProjectId).toBe(projectId);

    expect(isActiveIn("BOOTSTRAP", memory!.id)).toBe(true);
  });

  it("gives the same verdict whether or not the note was filed under a project", () => {
    // The regression this whole change exists to prevent, stated as one
    // assertion: identical words, one filed and one not.
    akira.addProject({ name: "Aviation Co" });
    const projectId = akira.getState().lastProjectId as string;
    const freeId = akira.addNote({ title: "Free", content: SENTENCE });
    const filedId = akira.addNote({ title: "Filed", content: SENTENCE, projectId });

    const free = memoryForNote(freeId)!;
    const filed = memoryForNote(filedId)!;
    expect(free.description).toBe(filed.description);

    recallBuilder.rebuildRecallCandidates("BOOTSTRAP");
    const active = new Set(
      recallService
        .getRecallCandidates()
        .filter((c) => c.status === "Active")
        .map((c) => c.memoryId),
    );
    expect(active.has(free.id), "free-standing note not recalled").toBe(true);
    expect(active.has(filed.id), "project-attached note not recalled").toBe(true);
  });

  it("recalls a free-standing note under QUERY too", () => {
    const noteId = akira.addNote({ title: "Pilot plan", content: SENTENCE });
    const memory = memoryForNote(noteId)!;
    expect(isActiveIn("QUERY", memory!.id)).toBe(true);
  });
});

describe("the bootstrap bound is still in place", () => {
  /**
   * The half of the change that is easy to lose. Making notes recallable by
   * deleting the arc suppression would pass every test above and would also
   * mean that every member of the reflections arc is recalled unconditionally
   * at bootstrap, forever, because it belongs to an active story.
   */
  it("still declines to recall a reflection merely for being in the active arc", () => {
    const noteId = akira.addNote({ title: "Pilot plan", content: SENTENCE });
    const memory = memoryForNote(noteId)!;
    const arc = storyService.getStories().find(isReflectionsArc);
    expect(arc, "the note did not join the reflections arc").toBeDefined();
    expect(arc!.status).toBe("Active");
    expect(arc!.relatedMemoryIds).toContain(memory.id);

    const arcRule = recallRules.find((r) => r.name === "Active Story Recall Rule")!;
    expect(
      arcRule.evaluate(memory, null, storyService.getStories(), "BOOTSTRAP").shouldRecall,
      "the arc rule stopped bounding the bootstrap prompt",
    ).toBe(false);

    // and the bound is context-scoped, not a blanket exclusion.
    expect(arcRule.evaluate(memory, null, storyService.getStories(), "QUERY").shouldRecall).toBe(
      true,
    );
  });

  it("keeps the bound when the arc is identified structurally rather than by title", () => {
    akira.addNote({ title: "Pilot plan", content: SENTENCE });
    const arc = storyService.getStories().find(isReflectionsArc)!;
    expect(arc.kind).toBe("Reflections");
  });
});

describe("the behaviour survives reconstruction", () => {
  /**
   * Replay rebuilds memories, stories and importance from the durable event
   * stream. New Memory objects, new Story objects, new ids. Everything above
   * would still pass on a live store and fail here if any of it depended on
   * state that only exists before a reload.
   */
  it("still recalls the notes after the runtime memory is rebuilt", () => {
    akira.addProject({ name: "Aviation Co" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addNote({ title: "Titled", content: SENTENCE });
    akira.addNote({ content: SENTENCE });
    akira.addNote({ title: "Attached", content: SENTENCE, projectId });

    const before = noteMemories();
    expect(before.length).toBe(3);

    memoryService.reconstructRuntimeMemory();

    const after = noteMemories();
    expect(after.length, "replay did not reproduce every note memory").toBe(3);

    recallBuilder.rebuildRecallCandidates("BOOTSTRAP");
    const active = new Set(
      recallService
        .getRecallCandidates()
        .filter((c) => c.status === "Active")
        .map((c) => c.memoryId),
    );
    for (const m of after) {
      expect(active.has(m.id), `note memory not recalled after replay: ${m.description}`).toBe(
        true,
      );
    }
  });

  it("rebuilds the reflections arc with its kind intact", () => {
    akira.addNote({ title: "Titled", content: SENTENCE });
    expect(storyService.getStories().find(isReflectionsArc)?.kind).toBe("Reflections");

    memoryService.reconstructRuntimeMemory();

    const arc = storyService.getStories().find(isReflectionsArc);
    expect(arc, "the reflections arc did not survive replay").toBeDefined();
    expect(arc!.kind, "replay produced an arc with no structured kind").toBe("Reflections");
  });
});

describe("a captured thought reaches the prompt, not just the candidate list", () => {
  /**
   * "Recalled" and "in the prompt" are two different claims, and only the
   * second one is what the user experiences.
   *
   * `filterActiveRecallCandidates` spends a twelve-slot budget. Recall making
   * the note a candidate achieves nothing if the budget is already full of
   * completed-task memories -- and it is, because they score higher. Measured
   * at the retention ceiling: 500 task memories at 0.85 against the note at
   * 0.70. This drives the whole pipeline rather than hand-building candidates,
   * so it fails if any stage between `addNote` and the context package drops
   * the memory.
   */
  it("puts a freshly captured note in the prompt despite higher-scoring activity", () => {
    akira.addProject({ name: "Busy" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "keep-pending", projectId });
    for (let i = 0; i < 30; i++) {
      const title = `busy-${i}`;
      akira.addTaskDetails({ title, projectId });
      const task = akira.getState().tasks.find((t) => t.title === title);
      if (task) akira.toggleTask(task.id);
    }

    const noteId = akira.addNote({ content: SENTENCE });
    const memory = memoryForNote(noteId)!;

    recallBuilder.rebuildRecallCandidates("BOOTSTRAP");
    const candidates = recallService.getRecallCandidates();

    const mine = candidates.find((c) => c.memoryId === memory.id)!;
    const rivals = candidates.filter(
      (c) => c.status === "Active" && c.recallScore > mine.recallScore,
    );
    // The precondition. Without it this test would pass for the wrong reason.
    expect(
      rivals.length,
      "workload did not produce enough higher-scoring activity to be a real test",
    ).toBeGreaterThan(getRetentionPolicy().context.maxRecallCandidates);

    const selected = contextRules.filterActiveRecallCandidates(candidates);
    expect(selected.length).toBe(getRetentionPolicy().context.maxRecallCandidates);
    expect(
      selected.some((s) => s.data.memoryId === memory.id),
      "the note was recalled but never reached the prompt",
    ).toBe(true);
  });

  it("labels it as User Intent where the model can read it", () => {
    const noteId = akira.addNote({ content: SENTENCE });
    const memory = memoryForNote(noteId)!;

    recallBuilder.rebuildRecallCandidates("BOOTSTRAP");
    const item = contextRules
      .filterActiveRecallCandidates(recallService.getRecallCandidates())
      .find((s) => s.data.memoryId === memory.id);

    expect(item).toBeDefined();
    expect(item!.inclusionReason).toBe("User Intent");
  });
});
