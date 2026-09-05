/**
 * The Personal Declaration Rule, now that it has something to read.
 *
 * The rule parses first-person declarations -- "I want to ...", "I love ...",
 * "... every day" -- out of a memory's description, and turns them into
 * identity aspects: goals, interests, preferences, values, habits. It has been
 * in `understanding/rules.ts` all along and, until note content was ingested,
 * could not fire from any store action: every memory description was
 * translator-generated text like `Completed task: "x"` or
 * `Captured thought: "<title>"`, and none of that is a declaration. Its input
 * arrives only when the memory carries the user's own words.
 *
 * WHAT THAT EXPOSED
 * -----------------
 * The rule began firing and began throwing on every fire:
 *
 *     Error updating identity from PersonalDeclarationRule:
 *     Cannot calculate confidence: aspect node "<id>" does not exist.
 *
 * `createGoal` adds a node through `identityGraphService` and immediately asks
 * `identityConfidenceService` to score it. Each identity service constructed
 * its own `new InMemoryIdentityRepository()` and they only came to share one
 * when `identityService.initialize()` ran -- which happens inside
 * `contextStateService.bootstrap()`. Anything reaching an identity service
 * before bootstrap therefore wrote into one store and read from another. The
 * throw is caught by `buildUnderstandingGraph`, so nothing crashed; the
 * identity aspect was simply lost, 41 times across the suite.
 *
 * The services now share their default repository, so there is no ordering to
 * get right. These tests do not call `initialize()` anywhere, deliberately:
 * that is the condition under which this used to fail.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * Not an endorsement of how the rule parses. It is keyword-and-suffix matching
 * over raw text and it will mis-read plenty of sentences. These tests pin that
 * a declaration the user actually wrote survives the trip from a quick capture
 * into the identity graph at all, which is a different and lower bar than the
 * parsing being good.
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
const {
  identityService,
  identityConfidenceService,
  IdentityGraphService,
  IdentityConfidenceService,
  IdentityGoalService,
} = await import("../src/genesis/identity");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

/**
 * Nothing here resets the identity graph, and that is the point.
 *
 * The obvious way to isolate these tests is
 * `identityService.setRepository(new InMemoryIdentityRepository())` in a
 * `beforeEach` -- which pushes one store into all fourteen services and is
 * exactly what the missing `initialize()` call would have done. Every
 * assertion below would then pass against the broken wiring, and the file
 * would guard nothing.
 *
 * So the graph accumulates across these tests instead, and the assertions are
 * written to be order-independent.
 */
beforeEach(() => {
  freshWorkspace();
});

describe("a declaration captured as a note becomes an identity aspect", () => {
  it("turns a quick-captured aspiration into a goal", () => {
    akira.addNote({ content: "I want to become a pilot and build an aviation company." });

    const identity = identityService.getIdentity();
    expect(identity, "no identity was created from the declaration").toBeDefined();

    const titles = identityService.getGoals(identity!.id).map((g) => g.title);
    expect(titles).toContain("become a pilot and build an aviation company");
  });

  it("scores the goal's node instead of throwing on it", () => {
    // The exact failure: the node exists in the graph service's store and the
    // confidence service could not see it. Both are asked here.
    akira.addNote({ content: "I want to become a pilot and build an aviation company." });

    const identity = identityService.getIdentity()!;
    const goal = identityService.getGoals(identity.id)[0];
    expect(goal, "the goal was lost").toBeDefined();

    const node = identityService.getIdentityNode(goal.confidenceReference);
    expect(node, "the goal's node is not in the graph").toBeDefined();
    expect(() => identityConfidenceService.calculateConfidence(node!.id)).not.toThrow();
  });

  it("works without anyone having called identityService.initialize()", () => {
    // The regression guard. Before the shared default this file's first test
    // passed only if some earlier test had bootstrapped the companion state.
    akira.addNote({ content: "I love long flights at night." });

    const identity = identityService.getIdentity();
    expect(identity).toBeDefined();
    // Some aspect node reached the graph. Which category the parser chose for
    // "I love ..." is its business; that anything survived is this file's.
    expect(identityService.getIdentityNodes().length).toBeGreaterThan(0);
  });

  it("reads the declaration from the note the user wrote, not from a wrapper", () => {
    // The memory description must be the user's words for any of this to work.
    // If ingestion ever reverts to a generated label, this fails here rather
    // than as a missing identity aspect three subsystems away.
    const sentence = "I want to learn to fly gliders.";
    akira.addNote({ content: sentence });

    const memory = memoryService.getMemories().find((m) => m.relatedNoteId);
    expect(memory, "the capture produced no memory").toBeDefined();
    expect(memory!.description).toBe(sentence);
  });

  it("does not invent a declaration from a completed task", () => {
    // The rule fires on the user's phrasing, not on activity. Asserted against
    // this test's own task titles rather than against an empty graph, because
    // the graph deliberately carries what the tests above put in it.
    akira.addProject({ name: "Aviation Co" });
    const projectId = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "keep-pending", projectId });
    for (let i = 0; i < 5; i++) {
      const title = `decl-task-${i}`;
      akira.addTaskDetails({ title, projectId });
      const task = akira.getState().tasks.find((t) => t.title === title);
      if (task) akira.toggleTask(task.id);
    }

    const named = identityService.getIdentityNodes().map((n) => n.value ?? "");
    expect(named.some((v) => v.includes("decl-task"))).toBe(false);
  });
});

describe("the wiring that made the rule throw", () => {
  /**
   * Constructed fresh, with no repository argument and no `initialize` call --
   * which is the state the understanding rules found the identity services in.
   * These previously held three different stores, so a node written through one
   * was invisible to the next.
   */
  it("gives every identity service the same store by default", () => {
    const graph = new IdentityGraphService();
    const confidence = new IdentityConfidenceService();
    const goals = new IdentityGoalService();

    expect(confidence.getRepository()).toBe(graph.getRepository());
    expect(goals.getRepository()).toBe(graph.getRepository());
  });

  it("lets a node written through one service be read through another", () => {
    const graph = new IdentityGraphService();
    const confidence = new IdentityConfidenceService();

    const node = graph.addIdentityNode("Goal", "shared-store-probe", {});
    expect(() => confidence.calculateConfidence(node.id)).not.toThrow();
  });
});
