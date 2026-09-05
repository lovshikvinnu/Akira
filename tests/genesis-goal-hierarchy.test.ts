/**
 * Wanting something is not the same as working on it.
 *
 * The hierarchy is Aspiration -> Objective -> Project -> Mission -> Task, and
 * the constraint that matters is directional: higher-level intent must not
 * manufacture lower-level commitments. Saying "I want to become a commercial
 * pilot" must not quietly produce a project to do it, or a task to start.
 *
 * Most of this file is proof rather than repair. Measured against the live
 * path, the constraint already holds in both directions, and the two labels
 * that keep an aspiration distinct from an active project already exist. Those
 * cases are here so that a later change cannot quietly break what is currently
 * correct.
 *
 * The one thing that did misreport a level was the sentence handed to the
 * model. `akira-store` publishes `MISSION_COMPLETED` when every task on the
 * list happens to be done, carrying `totalTasks` -- and the translator rendered
 * that count as "Finished all N missions for today!". A Mission is a level of
 * its own; nothing here creates one. The model was being told the user had
 * completed work one level above the one they actually worked at.
 *
 * ISOLATION IS LOad-BEARING HERE
 *
 * The identity graph and the story service hold module-level state that a store
 * reset does not clear. Without resetting them, an aspiration declared in an
 * earlier case is still in the graph during a later one, and reads exactly like
 * an aspiration that case's project invented -- which is the false positive
 * this file exists to rule out. It was observed before the reset was added.
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
const { storyService } = await import("../src/genesis/stories/story-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { identityService: graph } = await import("../src/genesis/identity");
const { InMemoryIdentityRepository } =
  await import("../src/genesis/identity/repositories/InMemoryIdentityRepository");
const { contextBuilder } = await import("../src/genesis/context/context-builder");
const { contextService } = await import("../src/genesis/context/context-service");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");

const ASPIRATION = "I want to become a commercial pilot";

function freshEverything(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  storyService.clearHistory();
  graph.setRepository(new InMemoryIdentityRepository());
  graph.initialize();
  understandingEngine.dispose();
  understandingEngine.initialize();
}

const graphGoals = () => {
  const id = graph.getIdentity()?.id;
  return id ? graph.getGoals(id) : [];
};

beforeEach(() => {
  freshEverything();
});

describe("an aspiration on its own", () => {
  it("is recorded as an aspiration", () => {
    // The guard. Every absence asserted below is meaningless if the
    // declaration produced nothing in the first place.
    akira.addNote(ASPIRATION);

    expect(graphGoals().length).toBe(1);
    expect(
      understandingEngine.getUnderstandings().some((u) => u.canonicalKey.startsWith("goal:")),
    ).toBe(true);
  });

  it("creates no project and no task", () => {
    akira.addNote(ASPIRATION);

    // Nothing below the aspiration may appear from the aspiration alone.
    expect(akira.getState().projects).toEqual([]);
    expect(akira.getState().tasks).toEqual([]);
  });

  it("creates no project understanding either", () => {
    akira.addNote(ASPIRATION);

    // Not just the store: the cognitive layer must not infer a body of work
    // from a wish.
    const keys = understandingEngine.getUnderstandings().map((u) => u.canonicalKey);
    expect(keys.filter((k) => k.startsWith("project:"))).toEqual([]);
  });
});

describe("a project on its own", () => {
  it("does not invent an aspiration behind it", () => {
    akira.addProject({ name: "Flight Training" });

    // The reverse direction: a body of work is not evidence that the user ever
    // declared wanting it.
    expect(akira.getState().projects.length).toBe(1);
    expect(graphGoals()).toEqual([]);
  });
});

describe("the prompt", () => {
  it("keeps a stated aspiration distinguishable from an active project", () => {
    akira.addNote(ASPIRATION);
    akira.addProject({ name: "Flight Training" });
    contextBuilder.rebuildContextPackage();

    const pkg = contextService.getActiveContext();
    expect(pkg).not.toBeNull();

    const reasons = pkg!.currentGoals.map((g) => g.inclusionReason);
    // Both may appear; they must not appear under one label. Collapsing them
    // would read as the user actively pursuing what they merely said.
    expect(new Set(reasons).size).toBe(reasons.length > 1 ? 2 : 1);
    expect(reasons).toContain("Stated aspiration");
  });

  it("does not tell the model that finished tasks were missions", () => {
    akira.addProject({ name: "Flight Training" });
    const pid = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "Book medical exam", projectId: pid });
    const task = akira.getState().tasks.find((t) => t.title === "Book medical exam");
    expect(task).toBeDefined();
    akira.toggleTask(task!.id);

    const completion = akira.getState().memories.find((e) => e.eventType === "mission_completed");
    // The guard: the event has to have fired, or the wording assertion is
    // asserted against nothing.
    expect(completion).toBeDefined();

    expect(completion!.description).toContain("tasks");
    expect(completion!.description).not.toContain("missions");
    expect(completion!.title).not.toContain("Mission");
  });
});

describe("after a reload", () => {
  it("replays without promoting the aspiration into work", () => {
    akira.addNote(ASPIRATION);
    memoryService.reconstructRuntimeMemory();

    expect(akira.getState().projects).toEqual([]);
    expect(akira.getState().tasks).toEqual([]);
    const keys = understandingEngine.getUnderstandings().map((u) => u.canonicalKey);
    expect(keys.filter((k) => k.startsWith("project:"))).toEqual([]);
    expect(keys.some((k) => k.startsWith("goal:"))).toBe(true);
  });
});
