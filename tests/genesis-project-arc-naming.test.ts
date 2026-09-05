/**
 * A project arc names its project, so the prompt can name the user's work.
 *
 * Every project arc is titled `"Project Arc: Project Created"`. `story-rules`
 * builds the title with `memory.title.split(":")[0]`, and `event-translation`
 * sets a project memory's title to that fixed label -- the split has nothing to
 * divide, and the result is the same string for every project in the workspace.
 *
 * Two consumers read that remainder as though it were the project's name:
 *
 *   - `context-rules.extractGoals` emits one prompt goal per active arc and
 *     dedupes with a Set. Measured before this change, with two projects:
 *
 *         project arcs                   2   (2 distinct relatedProjectIds)
 *         currentGoals                   1
 *           goal -> "Complete Project Arc: Project Created"
 *
 *     Ten projects would also produce one goal, and it would name none of them.
 *   - `identity-rules` matches a completed arc against a proposed Aspiration by
 *     name -- the mechanism by which finishing a project confirms a stated
 *     goal. Matching the constant `"Project Created"` cannot succeed for any
 *     project against any aspiration.
 *
 * `projectArcProjectName` resolves the name from the arc's `relatedProjectId`
 * instead, at read time.
 *
 * WHY READ TIME AND NOT AT CREATION
 * ---------------------------------
 * The obvious fix -- build the title from the project's name when the arc is
 * created -- was written first and measured. It does not work live:
 * `akira-store.addProject` publishes `PROJECT_CREATED` *before* the project
 * enters state, so when the arc is created the workspace does not yet contain
 * the project. Measured, that version produced the fallback live and the real
 * name only after a replay, which would make an arc's title change on reload.
 * The "live and after a replay" case below is what pins that, and it is the
 * reason the fix sits where it does.
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
const { isProjectArc, projectArcProjectName, PROJECT_ARC_TITLE_PREFIX } =
  await import("../src/genesis/stories/story-identity");

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

const arcs = () => storyService.getStories().filter(isProjectArc);
const goalStrings = () => contextRules.extractGoals(storyService.getStories()).map((g) => g.data);
const arcGoals = () => goalStrings().filter((g) => g.includes(PROJECT_ARC_TITLE_PREFIX));

beforeEach(() => {
  freshWorkspace();
});

describe("the prompt names each project the user is working on", () => {
  it("gives two projects two goals instead of collapsing them into one", () => {
    project("Pilot Licence");
    project("Learn Verilog");

    // The precondition. Two arcs must exist, or the dedup claim is vacuous and
    // the case passes on a workspace that produced nothing.
    expect(arcs().length, "the two projects did not open two arcs").toBe(2);

    const goals = arcGoals();
    expect(goals.length, "the two arcs collapsed into one prompt goal").toBe(2);
    expect(goals).toContain(`Complete ${PROJECT_ARC_TITLE_PREFIX} Pilot Licence`);
    expect(goals).toContain(`Complete ${PROJECT_ARC_TITLE_PREFIX} Learn Verilog`);
  });

  it("names the project rather than the event that opened its arc", () => {
    project("Pilot Licence");

    const arc = arcs()[0];
    // The arc's own title is still the translator's fixed label. Pinned so this
    // case proves the name is resolved rather than read off the title -- if the
    // title ever starts carrying the name, this assertion says so.
    expect(arc.title).toBe(`${PROJECT_ARC_TITLE_PREFIX} Project Created`);
    expect(projectArcProjectName(arc)).toBe("Pilot Licence");
    expect(goalStrings()).toContain(`Complete ${PROJECT_ARC_TITLE_PREFIX} Pilot Licence`);
  });

  it("says the same thing live and after a replay", () => {
    project("Pilot Licence");
    project("Learn Verilog");

    const live = arcGoals().sort();
    expect(live.length, "nothing to compare across the replay").toBe(2);

    memoryService.reconstructRuntimeMemory();

    expect(arcGoals().sort(), "the prompt named projects differently after a replay").toEqual(live);
  });

  it("follows a rename, because it resolves the name each time", () => {
    const id = project("Pilot Licence");
    expect(goalStrings()).toContain(`Complete ${PROJECT_ARC_TITLE_PREFIX} Pilot Licence`);

    akira.updateProject(id, { name: "Commercial Pilot Licence" });

    expect(goalStrings()).toContain(
      `Complete ${PROJECT_ARC_TITLE_PREFIX} Commercial Pilot Licence`,
    );
    expect(goalStrings()).not.toContain(`Complete ${PROJECT_ARC_TITLE_PREFIX} Pilot Licence`);
  });

  it("falls back to the arc's title when the workspace has no such project", () => {
    // An arc can outlive its project. The fallback is the old label, which is
    // wrong but harmless; resolving to a raw id, or throwing, would be worse.
    const deleted = {
      title: `${PROJECT_ARC_TITLE_PREFIX} Project Created`,
      relatedProjectId: "a-project-that-was-deleted",
    };
    expect(projectArcProjectName(deleted)).toBe("Project Created");

    // And an arc carrying no project id at all, which `registerStoryRule` can
    // still produce.
    expect(projectArcProjectName({ title: `${PROJECT_ARC_TITLE_PREFIX} Something` })).toBe(
      "Something",
    );
  });
});

describe("a completed project can be matched against what the user said they wanted", () => {
  it("hands the identity rule the project's name", () => {
    // `identity-rules` matches a proposed Aspiration whose name contains the
    // project's. It could not match "Project Created" against anything a person
    // would say. This does not assert that a confirmation happens -- nothing
    // proposes an Aspiration today -- only that the value being matched is now
    // one a match could succeed on.
    project("Pilot Licence");
    const arc = arcs()[0];
    const name = projectArcProjectName(arc).toLowerCase();

    expect(name).toBe("pilot licence");
    expect(
      "working towards a pilot licence".includes(name),
      "the resolved name cannot participate in the aspiration match",
    ).toBe(true);
  });
});
