/**
 * A certainty is about a proposition, and consumers get the one they need.
 *
 * The history matters because each step looked finished:
 *
 *   overallConfidence: number     mean of whichever engines existed, 1.0 when
 *                                 none did -- an empty install reported
 *                                 maximum certainty
 *   certainty { basis, score }    empty engines excluded, absence expressible
 *                                 as null -- but still one number averaging
 *                                 presence certainty, goal *definitional
 *                                 clarity*, knowledge *lifecycle stage* and
 *                                 habit stability
 *   certainty { situational }     the certainty a consumer's decision is
 *                                 actually about
 *
 * The second step fixed fabrication and left the meaning wrong. Averaging four
 * answers to four different questions produces an answer to none of them, and
 * it was doing real work: `initiative/rules.ts` decides whether to interrupt,
 * and a vaguely worded goal or an empty knowledge registry moved that decision.
 *
 * Situational certainty is presence plus companion state -- how well the moment
 * the user is in is understood, which is the question initiative asks. Neither
 * carries a `basis`, because neither averages a collection that might be empty;
 * they resolved for this session or they did not.
 *
 * The model gets no aggregate at all. There was no cross-domain proposition to
 * state, and every domain already prints its own confidence beside the thing it
 * describes. A universal number survived only because the code expected one.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";
import type { ResolvedContext } from "../src/genesis/context/context-resolution/types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");
const { evaluateInitiative } = await import("../src/genesis/context/initiative/rules");
const { buildKnowledgeContext } = await import("../src/genesis/context/knowledge/builder");
const { synthesizeReflectionReport } = await import("../src/genesis/insights/reflection/rules");
const { presenceService } = await import("../src/akira-os");
const { resolveUnifiedContext } = await import("../src/genesis/context/context-resolution/rules");

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
}

/** Every engine `__root.tsx` starts, in its order. */
function bootAllEngines(): void {
  // No optional chaining: a renamed export must fail here rather than silently
  // skip an engine and leave these cases asserting against a system that never
  // started. That is exactly how the probe behind this file first misread
  // `presenceService`.
  presenceService.initialize();
  genesis.goalService.initialize();
  genesis.knowledgeService.initialize();
  genesis.relationshipService.initialize();
  genesis.habitService.initialize();
  genesis.reflectionService.initialize();
  genesis.companionStateService.bootstrap();
  contextResolutionService.initialize();
}

beforeEach(() => {
  freshWorkspace();
});

describe("an engine with nothing in it", () => {
  it("reports a basis of zero rather than a confidence of one", () => {
    const empty = buildKnowledgeContext([], [], []);

    expect(empty.basis).toBe(0);
    // The mean of an empty set is still computed. What changed is that nothing
    // consumes it as a measurement, and `basis` is what says so.
    expect(empty.confidence).toBe(1);
  });
});

describe("before anything is known about the session", () => {
  it("has no situational certainty", () => {
    contextResolutionService.initialize();
    const resolved = contextResolutionService.getContext();

    expect(resolved).not.toBeNull();
    expect(resolved!.certainty.situational.basis).toBe(0);
    expect(resolved!.certainty.situational.score).toBeNull();
  });

  it("is not grounds to interrupt", () => {
    contextResolutionService.initialize();
    const decision = evaluateInitiative(contextResolutionService.getContext()!);

    expect(decision.decisionOutcome).toBe("Silence");
    expect(decision.interventionNecessity).toContain("current situation");
  });
});

describe("once the session engines have resolved", () => {
  beforeEach(() => {
    bootAllEngines();
    akira.addProject({ name: "Kitchen Renovation" });
    const pid = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "Replace the sink", projectId: pid });
    const task = akira.getState().tasks.find((t) => t.title === "Replace the sink");
    if (task) akira.toggleTask(task.id);
    contextResolutionService.initialize();
  });

  it("has a measured situational certainty", () => {
    const resolved = contextResolutionService.getContext();

    expect(resolved!.certainty.situational.basis).toBeGreaterThan(0);
    expect(typeof resolved!.certainty.situational.score).toBe("number");
  });

  it("is not silenced by engines that have nothing to do with the moment", () => {
    // The direction the previous design got wrong. `context/goals`,
    // `context/knowledge` and `context/relationships` are all empty here --
    // goals and knowledge have no producer at all -- and under the old average
    // their absence pulled the shared score around. Whether it is a good time
    // to speak does not depend on how many knowledge nodes exist.
    const resolved = contextResolutionService.getContext();

    expect(resolved!.provenance.goalContext).toBeTruthy();
    expect((resolved!.provenance.goalContext as unknown as { basis: number }).basis).toBe(0);
    expect((resolved!.provenance.knowledgeContext as unknown as { basis: number }).basis).toBe(0);

    // Still measured, and still able to act.
    expect(resolved!.certainty.situational.score).not.toBeNull();
    expect(evaluateInitiative(resolved!).interventionNecessity).not.toContain("current situation");
  });
});

describe("the model", () => {
  it("is given no cross-domain confidence figure", () => {
    bootAllEngines();
    const resolved = contextResolutionService.getContext();
    expect(resolved).not.toBeNull();

    const block = promptBuilder.serializeResolvedContext(resolved!);

    expect(block).not.toContain("Overall Confidence");
    expect(block).not.toContain("context engine");
  });

  it("still gets each domain's own confidence, next to the thing it describes", () => {
    // The guard against closing this by deleting information. A per-domain
    // confidence is about a stated subject and stays.
    const withPresence = {
      certainty: { situational: { basis: 1, score: 0.9 } },
      provenance: {
        presenceContext: { sessionType: "Returning", returnState: "SameDay", confidence: 0.9 },
      },
      currentPriorities: [],
      relevantContext: [],
      supportingEvidence: [],
      activeGoals: [],
      currentFocus: null,
      importantRelationships: [],
      relevantHabits: [],
      knowledgeRelevance: [],
      activeReflections: [],
      conflictsExposed: [],
    } as unknown as ResolvedContext;

    const block = promptBuilder.serializeResolvedContext(withPresence);

    expect(block).toContain("Presence");
    expect(block).toContain("Confidence: High (0.9)");
    expect(block).not.toContain("Overall Confidence");
  });
});

describe("behavioural gating, once a situation is understood", () => {
  const situation = (score: number | null): ResolvedContext =>
    ({
      certainty: { situational: { basis: score === null ? 0 : 2, score } },
      provenance: {},
      currentPriorities: [],
      relevantContext: [],
      supportingEvidence: [],
      activeGoals: [],
      currentFocus: null,
      importantRelationships: [],
      relevantHabits: [],
      knowledgeRelevance: [],
      activeReflections: [],
      conflictsExposed: [],
    }) as unknown as ResolvedContext;

  it("still suppresses when the situation is understood but poorly", () => {
    // Both directions are required: not artificially aggressive when engines
    // are empty, and not permanently silent when they are.
    const decision = evaluateInitiative(situation(0.2));

    expect(decision.decisionOutcome).toBe("Silence");
    expect(decision.interventionNecessity).toContain("low context confidence");
  });

  it("does not suppress on a well-understood situation", () => {
    expect(evaluateInitiative(situation(0.8)).interventionNecessity).not.toContain(
      "low context confidence",
    );
  });
});

describe("the second aggregate, in the reflection engine", () => {
  const emptyKnowledge = buildKnowledgeContext([], [], []);

  it("does not count an engine that has nothing in it", () => {
    expect(emptyKnowledge.basis).toBe(0);
    expect(emptyKnowledge.confidence).toBe(1);

    expect(synthesizeReflectionReport(null, emptyKnowledge, null, null).confidence).not.toBe(1);
  });

  it("does not fall back to a number nobody derived", () => {
    const report = synthesizeReflectionReport(null, null, null, null);

    expect(report.confidence).not.toBe(0.8);
    expect(report.confidence).toBe(0);
  });
});

describe("what situational certainty is made of", () => {
  // This is the claim the redesign rests on, and it needs an assertion that
  // fails when it stops being true. An earlier version of this file asserted
  // only that the score existed and that empty engines did not silence it --
  // both of which stay true if an unrelated engine is folded back in. Verified
  // by doing exactly that in a control and watching every case still pass.
  //
  // The distinguishing property is independence: hold presence and companion
  // state fixed, vary something else, and the score must not move.

  const state = (confidence: number) =>
    ({
      currentFocus: "Building",
      activeProject: null,
      contextConfidence: confidence,
      evidence: { evidenceLog: [], snapshot: { relevantMemories: [] } },
    }) as never;

  const habits = (confidence: number) =>
    ({
      observedHabits: [],
      basis: 3,
      confidence,
      evidence: { evidenceLog: [] },
    }) as never;

  it("does not move when an unrelated engine changes", () => {
    const quiet = resolveUnifiedContext(null, state(0.9), null, null, null, habits(0.1), null);
    const loud = resolveUnifiedContext(null, state(0.9), null, null, null, habits(0.95), null);

    // The guard: the fixture really does vary the habit engine, and it really
    // does have a basis, so it would have been counted by the old average.
    expect(quiet.provenance.habitContext).toBeTruthy();
    expect((quiet.provenance.habitContext as unknown as { basis: number }).basis).toBe(3);

    expect(quiet.certainty.situational.score).toBe(loud.certainty.situational.score);
    expect(quiet.certainty.situational.basis).toBe(1);
  });

  it("does move when the situation itself changes", () => {
    // The other direction, so the case above cannot be satisfied by a score
    // that never varies at all.
    const unsure = resolveUnifiedContext(null, state(0.2), null, null, null, null, null);
    const sure = resolveUnifiedContext(null, state(0.9), null, null, null, null, null);

    expect(unsure.certainty.situational.score).not.toBe(sure.certainty.situational.score);
  });
});
