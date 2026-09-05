/**
 * A deleted project stops being something the user is working on.
 *
 * `akira-store.deleteProject` publishes `PROJECT_DELETED`, `event-translation`
 * has no translator for any deletion event, and `reality-adapter` drops what it
 * cannot translate -- so GENESIS is never told. The project's story arc stays
 * `Active` and keeps producing present-tense claims. Measured on a project with
 * one completed task:
 *
 *     before delete   arc Active   goal "Complete Project Arc: Pilot Licence"
 *     after delete    arc Active   goal "Complete Project Arc: Project Created"
 *     after a reload  no arc       no goal
 *
 * The middle line is the harm twice over. The goal outlives the project, and
 * `projectArcProjectName` can no longer resolve a name for it, so what reached
 * the model was the translator's fixed label: an active commitment to something
 * unnamed.
 *
 * WHY THIS IS ANSWERED FROM THE WORKSPACE AND NOT BY ARCHIVING THE ARC
 * -------------------------------------------------------------------
 * `StoryStatus` has "Archived" and `determineStatus` reads it, but nothing in
 * `src/` calls `storyService.updateStory` -- no code path transitions a story's
 * status, so archiving would be the first of its kind and a larger decision
 * than this finding settles. Deriving it from the workspace keeps the arc and
 * its memories exactly as they are (they are history), withdraws only the claim
 * that the work is current, and makes the live answer agree with the one a
 * reload already gives instead of adding a second mechanism to keep in step.
 *
 * THE OTHER HALF, SINCE CLOSED
 * ----------------------------
 * The understanding fragments went on saying "The user is actively building
 * Pilot Licence" after the project was gone, because they take their status
 * from stories rather than from the arc filter here. That is fixed separately,
 * by translating `PROJECT_DELETED` into a durable memory the fragment reads --
 * see `genesis-deletion-archives-understanding`. The last case below is the
 * join between the two halves.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { contextRules } = await import("../src/genesis/context/context-rules");
const { isProjectArc } = await import("../src/genesis/stories/story-identity");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { contextService } = await import("../src/genesis/context/context-service");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

/** A project with one completed task, which is enough to open its arc. */
function project(name: string): string {
  akira.addProject({ name });
  const id = akira.getState().lastProjectId as string;
  akira.addTaskDetails({ title: `task for ${name}`, projectId: id });
  const task = akira.getState().tasks.find((t) => t.title === `task for ${name}`);
  if (!task) throw new Error(`store action did not create the task for "${name}"`);
  akira.toggleTask(task.id);
  return id;
}

const goals = () => contextRules.extractGoals(storyService.getStories()).map((g) => g.data);
const activeStories = () => contextRules.filterActiveStories(storyService.getStories());

beforeEach(() => {
  freshWorkspace();
});

describe("a deleted project stops being claimed as current work", () => {
  it("drops its prompt goal", () => {
    const id = project("Pilot Licence");
    // The precondition. Without it, a build that emitted no goals at all would
    // pass every assertion below.
    expect(goals(), "the project produced no goal to begin with").toContain(
      "Complete Project Arc: Pilot Licence",
    );

    akira.deleteProject(id);

    expect(goals(), "a deleted project is still an active goal").not.toContain(
      "Complete Project Arc: Pilot Licence",
    );
    // The specific shape the old behaviour produced: the goal survived and lost
    // its name, because `projectArcProjectName` could no longer resolve it.
    expect(goals().join(" "), "the goal survived as the unnamed fallback").not.toContain(
      "Project Created",
    );
  });

  it("drops out of the active narrative arcs", () => {
    const id = project("Pilot Licence");
    const before = activeStories().length;
    expect(before, "no active stories to lose").toBeGreaterThan(0);

    akira.deleteProject(id);

    expect(activeStories().length, "the arc is still offered as active").toBe(before - 1);
  });

  it("leaves the history exactly where it was", () => {
    const id = project("Pilot Licence");
    const memoriesBefore = memoryService.getMemories().length;
    const arcsBefore = storyService.getStories().filter(isProjectArc).length;
    expect(memoriesBefore).toBeGreaterThan(0);
    expect(arcsBefore).toBeGreaterThan(0);

    akira.deleteProject(id);

    // The stream is append-only and the arc is a record of what happened. Only
    // the claim that it is current was withdrawn.
    //
    // Greater-or-equal rather than equal: a deletion is now itself an event, so
    // the count rises by the `project_deleted` memory. What matters is that
    // nothing was removed.
    expect(
      memoryService.getMemories().length,
      "deleting a project erased memories",
    ).toBeGreaterThanOrEqual(memoriesBefore);
    expect(
      storyService.getStories().filter(isProjectArc).length,
      "deleting a project erased its narrative",
    ).toBe(arcsBefore);
  });

  it("leaves every project the user still has", () => {
    // The positive control. A filter that removed all project arcs would pass
    // the three cases above.
    const doomed = project("Kitchen Remodel");
    project("Pilot Licence");
    expect(goals().length).toBe(2);

    akira.deleteProject(doomed);

    expect(goals(), "a surviving project lost its goal").toContain(
      "Complete Project Arc: Pilot Licence",
    );
    expect(goals().length).toBe(1);
    expect(activeStories().length, "a surviving arc was dropped").toBeGreaterThan(0);
  });

  it("says the same thing after a replay", () => {
    const id = project("Pilot Licence");
    project("Learn Verilog");
    akira.deleteProject(id);
    const live = goals().sort();

    memoryService.reconstructRuntimeMemory();

    expect(goals().sort(), "live and replay disagree about a deleted project").toEqual(live);
    expect(goals(), "the surviving project did not come back").toContain(
      "Complete Project Arc: Learn Verilog",
    );
  });

  it("leaves an arc that carries no project id alone", () => {
    // `registerStoryRule` can create an arc with no `relatedProjectId`, and a
    // missing id is not evidence that a project was deleted.
    project("Pilot Licence");
    const before = activeStories().length;
    expect(before, "no active arc to test with").toBeGreaterThan(0);

    const arc = storyService.getStories().find(isProjectArc)!;
    storyService.updateStory(arc.id, { relatedProjectId: null });

    // Compared against the count taken before the id was removed. Comparing
    // `activeStories().length` to itself would hold for any implementation.
    expect(activeStories().length, "an arc with no project id was treated as deleted").toBe(before);
  });
});

describe("the package the prompt is built from, not just the rule", () => {
  /**
   * The gap the cases above missed. They call `extractGoals` directly with
   * fresh stories; the prompt reads `contextService.getActiveContext()`, a
   * package rebuilt on events and cached between them.
   *
   * `deleteProject` publishes before its `set()` commits, so the rebuild that
   * publish triggers saw a workspace still containing the project. Measured
   * immediately after deleting one of two:
   *
   *     extractGoals fresh     ["Complete Project Arc: Garden Beds"]
   *     package (the prompt)   ["Complete Project Arc: Kitchen Renovation",
   *                             "Complete Project Arc: Garden Beds"]
   *
   * Two projects, not one, because a lone deleted project can pass by accident:
   * `classifyWorkspaceIntent` matches prompts against current project names, so
   * with nothing surviving the block may not render at all and absence
   * assertions hold for the wrong reason.
   */
  it("drops a deleted project from the cached package immediately", () => {
    const doomed = project("Kitchen Renovation");
    project("Garden Beds");

    const before = contextService.getActiveContext()?.currentGoals.map((g) => g.data) ?? [];
    expect(before, "the fixture never produced the goal being tested").toContain(
      "Complete Project Arc: Kitchen Renovation",
    );

    akira.deleteProject(doomed);

    // No intervening event. The package must be right now, not after the next
    // thing that happens to trigger a rebuild.
    const after = contextService.getActiveContext()?.currentGoals.map((g) => g.data) ?? [];
    expect(after, "the prompt still offers a deleted project as a goal").not.toContain(
      "Complete Project Arc: Kitchen Renovation",
    );
    expect(after, "the surviving project was dropped too").toContain(
      "Complete Project Arc: Garden Beds",
    );
  });
});

describe("the status half is closed too", () => {
  it("describes a deleted project as archived rather than as current work", () => {
    // This case used to pin the gap: the understanding stayed "Active" and the
    // prompt still said "The user is actively building Pilot Licence." The
    // deletion now reaches GENESIS as a `project_deleted` memory, the fragment
    // reads it, and `serializeUnderstanding` has a status it can describe.
    const id = project("Pilot Licence");
    const key = understandingEngine
      .getUnderstandings()
      .find((u) => u.canonicalKey.startsWith("project:"))?.canonicalKey;
    expect(key, "no project understanding was built").toBeDefined();

    akira.deleteProject(id);

    const after = understandingEngine.getUnderstandings().find((u) => u.canonicalKey === key);
    expect(after?.status, "a deleted project is still described as active").toBe("Archived");
  });
});
