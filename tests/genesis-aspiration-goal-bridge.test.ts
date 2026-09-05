/**
 * What the user said they want, and what they are working on, are two claims.
 *
 * AKIRA parsed "I want to become a pilot" into an `IdentityGoal`, gave it a
 * graph node, attached evidence to it and scored its confidence -- and then
 * nothing read it. `getIdentitySummary`, `getCurrentProfile` and
 * `getActiveGoals` have no callers outside the identity module, and the prompt
 * builds every block from the context package, which had no aspiration in it.
 * The only goals that reached the model were active project arcs.
 *
 * So the user could tell AKIRA what they wanted and AKIRA would never mention
 * it again. That is the continuity gap these cases close.
 *
 * THE DISTINCTION IS THE POINT, NOT THE INCLUSION
 * -----------------------------------------------
 * Surfacing an aspiration must not turn it into an active goal. `extractGoals`
 * emits both kinds into `currentGoals` with different `inclusionReason`s, which
 * the prompt prints as `- <goal> (Reason: <reason>)`:
 *
 *     - Complete Project Arc: Pilot Licence (Reason: Active project)
 *     - become a pilot (Reason: Stated aspiration)
 *
 * Several cases below exist only to pin that the two labels stay different and
 * that neither borrows the other's meaning. A version of this change that put
 * both under one label would satisfy "the aspiration reaches the prompt" and
 * lose the thing that makes it safe.
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
const { contextRules, ACTIVE_PROJECT_REASON, STATED_ASPIRATION_REASON } =
  await import("../src/genesis/context/context-rules");
const { isProjectArc } = await import("../src/genesis/stories/story-identity");
const { identityService, InMemoryIdentityRepository } = await import("../src/genesis/identity");
const { identityService: observationService } =
  await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { hypothesesService } = await import("../src/genesis/understanding/hypotheses");
const { setRetentionPolicy, resetRetentionPolicy, getRetentionPolicy } =
  await import("../src/genesis/retention/policy");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  hypothesesService.clearHistory();
  observationService.clearHistory();
  identityService.setRepository(new InMemoryIdentityRepository());
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

const goals = () => contextRules.extractGoals(storyService.getStories());
const reasonFor = (data: string) => goals().find((g) => g.data === data)?.inclusionReason;
const byReason = (reason: string) => goals().filter((g) => g.inclusionReason === reason);

beforeEach(() => {
  resetRetentionPolicy();
  freshWorkspace();
});

describe("a stated aspiration reaches the prompt", () => {
  it("appears in the goals the prompt is built from", () => {
    akira.addNote({ content: "I want to become a pilot" });

    // The precondition: the declaration really did become an identity record.
    // Without it the case could pass on a workspace where nothing was parsed.
    const identity = identityService.getIdentity();
    expect(identity, "the declaration created no identity").toBeDefined();
    expect(
      identityService.getGoals(identity!.id).map((g) => g.title),
      "the declaration created no identity goal to surface",
    ).toContain("become a pilot");

    expect(goals().map((g) => g.data)).toContain("become a pilot");
  });

  it("is labelled as stated, not as active work", () => {
    akira.addNote({ content: "I want to become a pilot" });

    expect(reasonFor("become a pilot")).toBe(STATED_ASPIRATION_REASON);
    expect(reasonFor("become a pilot")).not.toBe(ACTIVE_PROJECT_REASON);
  });

  it("does not invent a project, a task or any progress from being mentioned", () => {
    akira.addNote({ content: "I want to become a pilot" });

    // The aspiration is in the prompt. Nothing about the workspace changed,
    // and no arc was opened on its behalf.
    expect(goals().map((g) => g.data)).toContain("become a pilot");
    expect(akira.getState().projects, "mentioning a goal created a project").toEqual([]);
    expect(akira.getState().tasks, "mentioning a goal created a task").toEqual([]);
    expect(storyService.getStories().filter(isProjectArc)).toEqual([]);
    expect(byReason(ACTIVE_PROJECT_REASON), "a mention was counted as active work").toEqual([]);
  });

  it("keeps the two kinds apart when the user has both", () => {
    akira.addNote({ content: "I want to become a pilot" });
    project("Pilot Licence");

    // The pair this whole change exists for: a stated goal and real work whose
    // names overlap, present together and distinguishable.
    expect(reasonFor("become a pilot")).toBe(STATED_ASPIRATION_REASON);
    expect(reasonFor("Complete Project Arc: Pilot Licence")).toBe(ACTIVE_PROJECT_REASON);
    expect(ACTIVE_PROJECT_REASON).not.toBe(STATED_ASPIRATION_REASON);
  });

  it("says the same thing after a replay", () => {
    akira.addNote({ content: "I want to become a pilot" });
    project("Pilot Licence");

    const before = goals()
      .map((g) => `${g.data} :: ${g.inclusionReason}`)
      .sort();
    expect(before.length, "nothing to compare across the replay").toBeGreaterThan(1);

    // A real reload for identity, which is a module singleton and would
    // otherwise survive reconstruction untouched, making this vacuous.
    identityService.setRepository(new InMemoryIdentityRepository());
    memoryService.reconstructRuntimeMemory();

    expect(
      goals()
        .map((g) => `${g.data} :: ${g.inclusionReason}`)
        .sort(),
      "the prompt described the user's goals differently after a reload",
    ).toEqual(before);
  });

  it("gives active work the budget before stated wishes", () => {
    project("Pilot Licence");
    project("Learn Verilog");
    akira.addNote({ content: "I want to become a pilot" });
    akira.addNote({ content: "I want to become fluent in Japanese" });

    // Uncapped first. Without this the case passes on a build that emits no
    // aspirations at all -- two project goals, cap of two, nothing displaced
    // and nothing proven.
    expect(byReason(STATED_ASPIRATION_REASON).length, "no aspirations to displace").toBe(2);
    expect(byReason(ACTIVE_PROJECT_REASON).length).toBe(2);

    setRetentionPolicy({ context: { ...getRetentionPolicy().context, maxGoals: 2 } });

    const all = goals();
    expect(all.length, "the cap was not applied").toBe(2);
    expect(
      all.every((g) => g.inclusionReason === ACTIVE_PROJECT_REASON),
      "a stated wish displaced work the user is actually doing",
    ).toBe(true);
  });

  it("lists the most recently stated aspirations first", () => {
    // Truncating an insertion-ordered list drops the newest thing the user
    // said, which is the mistake `filterActiveRecallCandidates` documents
    // having made once already.
    akira.addNote({ content: "I want to become a pilot" });
    akira.addNote({ content: "I want to become fluent in Japanese" });

    const stated = byReason(STATED_ASPIRATION_REASON).map((g) => g.data);
    expect(stated.length, "both declarations were not parsed").toBe(2);
    expect(stated[0]).toBe("become fluent in Japanese");
  });
});

describe("a completed project is evidence of progress, not of achievement", () => {
  /**
   * This path has no producer in the app -- `proposeHypothesis` has no callers,
   * so `hypothesisCache` is empty for the life of the process and the rule
   * never fires. The hypothesis is proposed directly here so the mechanism's
   * semantics can be pinned; what is being tested is what the rule *would*
   * record, which is why it mattered that it recorded "Achieved" at confidence
   * 1.0 from a name match.
   */
  function completedProjectNamed(name: string): void {
    project(name);
    const arc = storyService.getStories().find(isProjectArc);
    if (!arc) throw new Error("no project arc to complete");
    storyService.updateStory(arc.id, { status: "Completed" });
    identityBuilder.processStoryEvent(storyService.getStories().find(isProjectArc)!);
  }

  it("records progress towards the aspiration rather than having reached it", () => {
    hypothesesService.proposeHypothesis("Aspiration", "become a pilot", "stated during onboarding");

    completedProjectNamed("pilot");

    const observation = observationService
      .getObservations()
      .find((o) => o.name === "become a pilot");
    expect(
      observation,
      "the completed project recorded nothing about the aspiration",
    ).toBeDefined();
    expect(observation!.value, "a name match claimed the user achieved a life goal").not.toBe(
      "Achieved",
    );
    expect(observation!.value).toBe("Progress observed");
    expect(
      observation!.confidence,
      "an inference from a name match was recorded as certain",
    ).toBeLessThan(1.0);
  });

  it("does not mark the aspiration confirmed, because the user did not confirm it", () => {
    hypothesesService.proposeHypothesis("Aspiration", "become a pilot", "stated during onboarding");

    completedProjectNamed("pilot");

    const hypothesis = hypothesesService.getHypotheses().find((h) => h.name === "become a pilot");
    expect(hypothesis, "the hypothesis vanished").toBeDefined();
    expect(
      hypothesis!.status,
      "a project completing was treated as the user settling the question",
    ).not.toBe("Confirmed");
    expect(hypothesis!.status).toBe("Refined");
  });
});
