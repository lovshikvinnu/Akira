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
 * WHAT THIS DOES NOT COVER
 * ------------------------
 * The understanding fragments still say "The user is actively building Pilot
 * Licence" after the project is gone, and "The user is actively learning
 * Aviation" after the note that produced it is gone. Those come from
 * `UnderstandingStatus`, not from the arc, and are the status half of this
 * finding. The cases at the end pin them as they are so the gap is recorded
 * rather than implied.
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
    expect(memoryService.getMemories().length, "deleting a project erased memories").toBe(
      memoriesBefore,
    );
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

describe("the status half of this finding is still open", () => {
  it("still calls a deleted project something the user is actively building", () => {
    // Pinned as it is, not as it should be. `UnderstandingStatus` drives this
    // sentence and no deletion signal reaches it. Recorded so the gap is
    // visible; the fix belongs with the status work.
    const id = project("Pilot Licence");
    const key = understandingEngine
      .getUnderstandings()
      .find((u) => u.canonicalKey.startsWith("project:"))?.canonicalKey;
    expect(key, "no project understanding was built").toBeDefined();

    akira.deleteProject(id);

    const after = understandingEngine.getUnderstandings().find((u) => u.canonicalKey === key);
    expect(after?.status, "if this is no longer Active the status half has landed").toBe("Active");
  });
});
