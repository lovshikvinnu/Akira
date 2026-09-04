/**
 * Story titles are load-bearing. These tests make that audible.
 *
 * Two arc titles are used as identifiers by subsystems that did not create
 * them. `story-rules` produces the arcs; `recall-rules` suppresses one of them
 * under BOOTSTRAP; `identity-rules` infers a Reflective trait and a Deep Work
 * Focus work style from them; `context-rules` turns one into a goal the AI
 * prompt carries; `understanding/rules` falls back to the title for a project
 * id.
 *
 * Before `story-identity.ts` those literals were written out separately in five
 * files. The failure mode was silent in the worst way: renaming a title to read
 * better in the Brain inspector would have changed what GENESIS recalls and
 * what it concludes about the user, the suite would have stayed green, and
 * nothing would have pointed at the rename.
 *
 * Single-sourcing the literal removes the *duplication* but not the coupling --
 * the title is still the identifier. So these tests do two different jobs:
 *
 *   1. Pin that every producer and consumer still agrees on the declared
 *      constant, live and after reconstruction. A drift between any two of them
 *      fails here rather than showing up as a missing identity trait.
 *
 *   2. Demonstrate the coupling deliberately, by renaming an arc at runtime and
 *      asserting that cognition changes. That is the silent behaviour written
 *      down as an executable fact, so anyone proposing a rename sees the cost.
 *
 * If the coupling is ever replaced by a structured discriminator on `Story`,
 * test 2 is the one that should be inverted: a rename must then change nothing.
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
const { relationshipService } = await import(
  "../src/genesis/memory/relationships/relationship-service"
);
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { contextRules } = await import("../src/genesis/context/context-rules");
const {
  REFLECTIONS_ARC_TITLE,
  PROJECT_ARC_TITLE_PREFIX,
  isProjectArc,
  isReflectionsArc,
  projectArcTitleRemainder,
} = await import("../src/genesis/stories/story-identity");
const { identityRules } = await import("../src/genesis/understanding/identity-rules");
const { recallRules } = await import("../src/genesis/recall/recall-rules");
const { resetRetentionPolicy } = await import("../src/genesis/retention/policy");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/** A project with enough activity for the Deep Work rule, plus loose notes. */
function buildBothArcs(): { projectId: string } {
  akira.addProject({ name: "Coupling Project" });
  const projectId = akira.getState().lastProjectId as string;
  for (let i = 0; i < 4; i++) completeTask(projectId, `cp-${i}`);
  // Free-standing notes cluster into the reflections arc.
  for (let i = 0; i < 3; i++) {
    akira.addNote({ title: `reflection ${i}`, content: `a captured thought ${i}` });
  }
  return { projectId };
}

const reflectionsArc = () => storyService.getStories().find(isReflectionsArc);
const projectArc = () => storyService.getStories().find(isProjectArc);
const observation = (name: string) =>
  identityService.getObservations().find((o) => o.name === name);

describe("the producer and every consumer agree on the arc titles", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("creates both arcs under exactly the declared titles", () => {
    buildBothArcs();

    // If `story-rules` ever drifts from the constant, every consumer below
    // silently stops matching. This is the assertion that catches it first.
    expect(reflectionsArc()?.title).toBe(REFLECTIONS_ARC_TITLE);
    expect(projectArc()?.title.startsWith(PROJECT_ARC_TITLE_PREFIX)).toBe(true);
  });

  it("lets identity recognise the arcs the story rules produced", () => {
    buildBothArcs();
    identityBuilder.flushDirtyStories();

    // Both identity rules key on the title, so these two observations existing
    // is the cross-subsystem agreement made observable.
    expect(observation("Reflective")).toBeDefined();
    expect(observation("Deep Work Focus")).toBeDefined();
  });

  it("quotes the same constant in the provenance it shows the user", () => {
    buildBothArcs();
    identityBuilder.flushDirtyStories();

    // Display text, not a key -- but it names the arc, so a rename that missed
    // it would leave the explanation describing a story that no longer exists.
    expect(observation("Reflective")?.provenance).toContain(REFLECTIONS_ARC_TITLE);
  });

  it("derives the prompt goal from the project arc, unchanged by the refactor", () => {
    const { projectId } = buildBothArcs();

    const goals = contextRules.extractGoals(storyService.getStories());
    const arcGoals = goals.filter((g) => g.data.includes(PROJECT_ARC_TITLE_PREFIX));

    expect(arcGoals.length).toBeGreaterThan(0);
    // The exact string the prompt carried before the constants were extracted.
    const arc = projectArc()!;
    expect(arcGoals.some((g) => g.data === `Complete ${arc.title}`)).toBe(true);
    expect(projectArcTitleRemainder(arc)).toBe(arc.title.replace(PROJECT_ARC_TITLE_PREFIX, "").trim());
    expect(projectId).toBeTruthy();
  });

  it("still recovers the project id from the summary, not the title", () => {
    const { projectId } = buildBothArcs();

    // The title carries no project identity; the summary does. Pinned because
    // the two are easy to confuse and only one of them works.
    const arc = projectArc()!;
    expect(arc.summary).toContain(projectId);
    expect(arc.title).not.toContain(projectId);

    const keys = understandingEngine
      .getUnderstandings()
      .filter((u) => u.category === "Project")
      .map((u) => u.canonicalKey);
    expect(keys).toContain(`project:${projectId}`);
  });
});

describe("the coupling itself, stated as behaviour", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("stops inferring the Reflective trait when the arc is renamed", () => {
    buildBothArcs();
    identityBuilder.flushDirtyStories();
    expect(observation("Reflective")).toBeDefined();

    const arc = reflectionsArc()!;
    const rule = identityRules.find((r) => r.name === "Reflective Trait Evaluation")!;

    // The rule detects the trait from the story as it stands.
    expect(rule.evaluateStory(arc).detected).toBe(true);

    // A purely cosmetic rename. Members, status and summary are untouched --
    // only the words a human reads change.
    storyService.updateStory(arc.id, { title: "Reflections" });
    const renamed = storyService.getStories().find((s) => s.id === arc.id)!;
    expect(renamed.relatedMemoryIds).toEqual(arc.relatedMemoryIds);
    expect(renamed.status).toBe(arc.status);

    // And the trait is no longer inferred. Nothing about the user changed;
    // the title did. This is the silent failure the sweep was looking for,
    // written down as an executable fact rather than left as prose.
    expect(rule.evaluateStory(renamed).detected).not.toBe(true);
  });

  it("stops treating a story as a project arc when its prefix changes", () => {
    buildBothArcs();
    const arc = projectArc()!;

    expect(isProjectArc(arc)).toBe(true);
    storyService.updateStory(arc.id, { title: "Work on Coupling Project" });

    const renamed = storyService.getStories().find((s) => s.id === arc.id)!;
    expect(isProjectArc(renamed)).toBe(false);

    // The summary still holds the project id, so the identifier survives a
    // rename even though every title-keyed consumer does not. That asymmetry is
    // the argument for moving the coupling onto a structured field.
    expect(renamed.summary).toContain("Project ID:");
  });
});

describe("recall still keys on the same constant", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  /**
   * `recall-rules.ts` suppresses the reflections arc under BOOTSTRAP and only
   * under BOOTSTRAP. That is the single mechanism deciding whether a
   * free-standing user note is recalled at all, so the constant swap is pinned
   * here against both context values rather than assumed equivalent.
   */
  it("suppresses the reflections arc under BOOTSTRAP and not under QUERY", () => {
    buildBothArcs();

    const arcRule = recallRules.find((r) => r.name === "Active Story Recall Rule")!;
    const arc = reflectionsArc()!;
    const member = memoryService
      .getMemories()
      .find((m) => arc.relatedMemoryIds.includes(m.id))!;

    expect(arc.status).toBe("Active");

    // Suppressed at BOOTSTRAP -- the behaviour the literal used to encode.
    expect(arcRule.evaluate(member, null, storyService.getStories(), "BOOTSTRAP").shouldRecall).toBe(
      false,
    );
    // and not suppressed otherwise.
    expect(arcRule.evaluate(member, null, storyService.getStories(), "QUERY").shouldRecall).toBe(
      true,
    );
  });

  it("suppresses by title, so a renamed reflections arc is recalled at BOOTSTRAP", () => {
    buildBothArcs();

    const arcRule = recallRules.find((r) => r.name === "Active Story Recall Rule")!;
    const arc = reflectionsArc()!;
    const member = memoryService
      .getMemories()
      .find((m) => arc.relatedMemoryIds.includes(m.id))!;

    storyService.updateStory(arc.id, { title: "Reflections" });

    // Same story, same members, same status -- recalled now, because the
    // suppression is keyed on words. The coupling, stated for recall too.
    expect(arcRule.evaluate(member, null, storyService.getStories(), "BOOTSTRAP").shouldRecall).toBe(
      true,
    );
  });
});

describe("arc identity survives reconstruction", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("rebuilds both arcs under the same titles, repeatedly", () => {
    buildBothArcs();

    const liveTitles = storyService
      .getStories()
      .map((s) => s.title)
      .sort();

    memoryService.reconstructRuntimeMemory();
    const once = storyService
      .getStories()
      .map((s) => s.title)
      .sort();

    memoryService.reconstructRuntimeMemory();
    const twice = storyService
      .getStories()
      .map((s) => s.title)
      .sort();

    expect(once).toEqual(liveTitles);
    expect(twice).toEqual(once);

    // Derived cognition still recognises them after replay, which is the part
    // that would break if reconstruction produced a differently-titled arc.
    expect(reflectionsArc()?.title).toBe(REFLECTIONS_ARC_TITLE);
    expect(projectArc()).toBeDefined();
  });

  it("keeps identity agreeing with the replayed arcs", () => {
    buildBothArcs();
    identityBuilder.flushDirtyStories();
    const before = identityService.getObservations().map((o) => o.name).sort();

    memoryService.reconstructRuntimeMemory();
    identityBuilder.flushDirtyStories();
    const after = identityService.getObservations().map((o) => o.name).sort();

    expect(after).toEqual(before);
    expect(after).toContain("Reflective");
  });
});
