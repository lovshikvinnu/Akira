/**
 * Two defects in derived cognitive evidence, and the invariants that replace them.
 *
 * They are unrelated mechanisms and share no lifecycle. Kept in one file
 * because both answer the same question about a different subsystem: what is a
 * derived signal allowed to be evidence *of*.
 *
 * A -- THE REFLECTIVE TRAIT COUNTED THE ARC, NOT THE REFLECTIONS
 *
 * `Reflective Trait Evaluation` scored `0.5 + story.relatedMemoryIds.length * 0.1`
 * over the reflections arc, and its provenance called those members
 * "observations the user logged". The arc is a narrative bucket for anything
 * whose `reason` is "Reflection Worthy", and `declaration_captured` carries
 * that reason, so an aspiration stated in conversation counted as a reflection.
 * Measured before the fix: five declarations and no written reflection at all
 * produced confidence 1.0, and a single genuine reflection that was below the
 * threshold alone reached 1.0 once four aspirations were added around it.
 *
 * The member count was not intentional evidence and not an aggregation bug. It
 * was a proxy for authorship that stopped holding when a second kind of memory
 * joined the arc.
 *
 * B -- A SIGNAL OUTLIVED THE MEMBERSHIP IT WAS DERIVED FROM
 *
 * `Story Influence` is computed from a memory's parent story. When
 * `addMemoryToStory` slides the window, the dropped memory keeps the signal:
 * `importanceBuilder.recalculateStoryMembers` recalculates a story's *current*
 * members, so nothing ever revisits one that left. The rule itself was already
 * correct -- it returns null when there is no parent story. Nothing asked it
 * again.
 *
 * WHAT THESE FIXTURES DELIBERATELY VARY
 *
 * Production varies the *kind* of memory in the arc, so A's arms contain both
 * written notes and declarations rather than one kind. Production varies the
 * window, so B's arms drive real eviction rather than removing members by hand.
 * And `storyService.forgetMemories` is not exercised as a B path: production
 * calls it from `retention-service.ts` alongside `importanceService.forgetMemories`
 * on the same ids, so the memory and its profile go together. Calling it alone
 * leaves a residue that production cannot produce.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { eventService } = await import("../src/genesis/events/event-service");
const { REFLECTIONS_ARC_TITLE } = await import("../src/genesis/stories/story-identity");
const { setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  identityService.clearHistory();
}

/** A declaration as the promoter records it: Reflection Worthy, no project. */
function declare(text: string): void {
  eventService.record("declaration_captured", "Declaration Captured", text, null);
}

const arc = () => storyService.getStories().find((s) => s.title === REFLECTIONS_ARC_TITLE);
const reflective = () => identityService.getObservations().find((o) => o.name === "Reflective");
const hasStoryInfluence = (memoryId: string) =>
  Boolean(
    importanceService.getImportance(memoryId)?.signals.some((s) => s.type === "Story Influence"),
  );
const noteMemories = () => memoryService.getMemories().filter((m) => m.relatedNoteId);

describe("A: the Reflective trait is evidenced by reflections", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("is not inferred at all from aspirations alone", () => {
    for (const t of [
      "My goal is to learn Verilog",
      "I want to become a pilot",
      "My dream is to ship AKIRA",
      "I aspire to run a marathon",
      "My ambition is to write a book",
    ]) {
      declare(t);
    }
    identityBuilder.flushDirtyStories();

    // Five members of the reflections arc, none of them written by hand.
    expect(arc()?.relatedMemoryIds.length).toBe(5);
    // Before the fix this was confidence 1.0.
    expect(reflective()).toBeUndefined();

    // The aspirations themselves are unaffected -- this is about one trait, not
    // about whether declarations reach identity.
    const aspirations = identityService
      .getObservations()
      .filter((o) => o.category === "Aspiration");
    expect(aspirations.length).toBe(5);
  });

  it("does not move when an unrelated member joins the arc", () => {
    akira.addNote("A reflection about how mornings work for me.");
    akira.addNote("A second reflection, about focus.");
    identityBuilder.flushDirtyStories();

    const before = reflective()?.confidence;
    expect(before).toBeDefined();

    for (const t of ["My goal is to learn Verilog", "I aspire to run a marathon"]) declare(t);
    identityBuilder.flushDirtyStories();

    // The arc grew; what the user reflected on did not.
    expect(arc()!.relatedMemoryIds.length).toBe(4);
    expect(reflective()?.confidence).toBe(before);
  });

  it("does move when a genuine reflection is added", () => {
    akira.addNote("Reflection one.");
    akira.addNote("Reflection two.");
    identityBuilder.flushDirtyStories();
    const two = reflective()!.confidence;

    akira.addNote("Reflection three.");
    identityBuilder.flushDirtyStories();

    expect(reflective()!.confidence).toBeGreaterThan(two);
  });

  it("holds across reconstruction, and repeated reconstruction", () => {
    akira.addNote("Reflection one.");
    akira.addNote("Reflection two.");
    for (const t of ["My goal is to learn Verilog", "I aspire to run a marathon"]) declare(t);
    identityBuilder.flushDirtyStories();
    const live = reflective()?.confidence;

    memoryService.reconstructRuntimeMemory();
    identityBuilder.flushDirtyStories();
    const once = reflective()?.confidence;

    memoryService.reconstructRuntimeMemory();
    identityBuilder.flushDirtyStories();
    const twice = reflective()?.confidence;

    expect(once).toBe(live);
    expect(twice).toBe(once);
  });
});

describe("B: a signal does not outlive the membership it came from", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("drops Story Influence when the sliding window evicts a member", () => {
    setRetentionPolicy({ maxMemoriesPerStory: 4 });

    for (let i = 0; i < 4; i++) akira.addNote(`Reflection number ${i}.`);
    const early = noteMemories().slice(0, 2);
    expect(early.length).toBe(2);
    // While they are members, they hold the signal.
    expect(early.every((m) => hasStoryInfluence(m.id))).toBe(true);

    for (let i = 4; i < 10; i++) akira.addNote(`Reflection number ${i}.`);

    for (const m of early) {
      expect(storyService.findStoryContainingMemory(m.id)).toBeUndefined();
      // Before the fix each of these still carried strength 0.85 and an
      // explanation naming the story it had left.
      expect(hasStoryInfluence(m.id)).toBe(false);
    }
  });

  it("leaves no orphaned signal anywhere after heavy eviction", () => {
    setRetentionPolicy({ maxMemoriesPerStory: 3 });
    for (let i = 0; i < 15; i++) akira.addNote(`Reflection ${i}.`);

    const orphaned = memoryService
      .getMemories()
      .filter((m) => !storyService.findStoryContainingMemory(m.id) && hasStoryInfluence(m.id));
    expect(orphaned).toEqual([]);
  });

  it("drops Story Influence when a whole story is evicted by maxStories", () => {
    // The second membership-loss path, and it does not run through
    // `updateStory`: `createStory` trims `storyCache` with `trimOldest` and
    // splices the story out. Every member stays alive, so nothing else cleans
    // up after them. Found by Chat 4 after I claimed the sliding window was the
    // only path -- it drops a whole arc's membership at once, up to
    // `maxMemoriesPerStory`, where the window drops one at a time.
    setRetentionPolicy({ maxStories: 3 });

    for (let p = 0; p < 6; p++) {
      akira.addProject({ name: `Arc ${p}` });
      const pid = akira.getState().lastProjectId as string;
      for (let i = 0; i < 4; i++) {
        const title = `ev-${p}-${i}`;
        akira.addTaskDetails({ title, projectId: pid });
        const task = akira.getState().tasks.find((t) => t.title === title);
        if (task) akira.toggleTask(task.id);
      }
    }

    expect(storyService.getStories().length).toBeLessThanOrEqual(3);

    const orphans = memoryService
      .getMemories()
      .filter((m) => !storyService.findStoryContainingMemory(m.id) && hasStoryInfluence(m.id));
    // Before the fix this was 12 of 42, and identical after replay.
    expect(orphans).toEqual([]);
  });

  it("stays clean across replay after a whole story is evicted", () => {
    setRetentionPolicy({ maxStories: 3 });

    for (let p = 0; p < 6; p++) {
      akira.addProject({ name: `Replay arc ${p}` });
      const pid = akira.getState().lastProjectId as string;
      for (let i = 0; i < 4; i++) {
        const title = `re-${p}-${i}`;
        akira.addTaskDetails({ title, projectId: pid });
        const task = akira.getState().tasks.find((t) => t.title === title);
        if (task) akira.toggleTask(task.id);
      }
    }

    // Counted over the CURRENT memory set each time, never over ids captured
    // beforehand: reconstruction rebuilds memories with new ids, so a captured
    // list would read absence as health.
    const orphans = () =>
      memoryService
        .getMemories()
        .filter((m) => !storyService.findStoryContainingMemory(m.id) && hasStoryInfluence(m.id))
        .length;

    expect(orphans()).toBe(0);
    memoryService.reconstructRuntimeMemory();
    expect(orphans()).toBe(0);
    memoryService.reconstructRuntimeMemory();
    expect(orphans()).toBe(0);
  });

  it("keeps the signal for members that are still members", () => {
    setRetentionPolicy({ maxMemoriesPerStory: 4 });
    for (let i = 0; i < 10; i++) akira.addNote(`Reflection ${i}.`);

    const members = arc()!.relatedMemoryIds;
    expect(members.length).toBe(4);
    // The fix must not over-reach: leaving is what clears the signal, not
    // merely being recalculated.
    for (const id of members) expect(hasStoryInfluence(id)).toBe(true);
  });

  it("stays clean across reconstruction and repeated reconstruction", () => {
    setRetentionPolicy({ maxMemoriesPerStory: 4 });
    for (let i = 0; i < 12; i++) akira.addNote(`Replay reflection ${i}.`);

    const orphans = () =>
      memoryService
        .getMemories()
        .filter((m) => !storyService.findStoryContainingMemory(m.id) && hasStoryInfluence(m.id))
        .length;

    expect(orphans()).toBe(0);

    memoryService.reconstructRuntimeMemory();
    expect(orphans()).toBe(0);

    memoryService.reconstructRuntimeMemory();
    expect(orphans()).toBe(0);
  });
});
