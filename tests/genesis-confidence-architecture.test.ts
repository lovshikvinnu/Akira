/**
 * What a confidence in this system means, and what it may not claim.
 *
 * `ResolvedContext.overallConfidence` was a single number that answered several
 * different questions at once and could not tell absence from certainty. It was
 * the mean of whichever sub-contexts existed, falling back to `1.0` when there
 * were none -- so an install with no user data reported maximum certainty. Two
 * permanently-empty engines were enough to make that look computed:
 * `context/knowledge` and `context/relationships` are initialized at boot, have
 * no producer, hold nothing, and each report `confidence: 1`.
 *
 * That one number was then read by two consumers wanting different things: the
 * prompt, as a claim about how well AKIRA understands the user, and
 * `initiative/rules.ts`, as permission to interrupt them. The system was most
 * willing to act proactively exactly when it knew least.
 *
 * The replacement is `certainty: { basis, score }`:
 *
 *   basis   how many context engines contributed something real
 *   score   the mean over those, and `null` when basis is 0
 *
 * `null` rather than a number because no value on 0..1 honestly means "no
 * opinion" -- both ends are claims. Consumers must branch on it, which is the
 * point of the type.
 *
 * Each engine reports its own `basis`: how many records its average was taken
 * over. Presence and companion state carry none, because they describe the
 * session that is happening rather than a collection that may be empty.
 *
 * These cases cover the whole path -- builder, both aggregates, and both
 * consumers -- because fixing one aggregate would have left the other
 * producing the old answer. There are two: `resolveUnifiedContext` and the
 * composite in `insights/reflection/rules.ts`, which defaulted to `0.8` and
 * fed its result back into the first.
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
const { knowledgeService } = await import("../src/genesis/context/knowledge/service");
const { relationshipService } = await import("../src/genesis/context/relationships/service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");
const { evaluateInitiative } = await import("../src/genesis/context/initiative/rules");
const { buildKnowledgeContext } = await import("../src/genesis/context/knowledge/builder");
const { synthesizeReflectionReport } = await import("../src/genesis/insights/reflection/rules");
const { presenceService } = await import("../src/akira-os");

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
}

beforeEach(() => {
  freshWorkspace();
});

describe("an engine with nothing in it", () => {
  it("reports a basis of zero rather than a confidence of one", () => {
    // The builder still computes 1.0 as the mean of an empty set. What changed
    // is that it now says so: `basis` is the field an aggregate reads.
    const empty = buildKnowledgeContext([], [], []);

    expect(empty.basis).toBe(0);
    // The number beside it is a default, not a measurement, and this asserts
    // exactly that rather than pretending the default is gone.
    expect(empty.confidence).toBe(1);
  });
});

describe("a workspace where no engine has anything", () => {
  let resolved: ResolvedContext | null = null;

  beforeEach(() => {
    // The two orphaned engines, started exactly as `__root.tsx` starts them.
    knowledgeService.initialize();
    relationshipService.initialize();
    contextResolutionService.initialize();
    resolved = contextResolutionService.getContext();
  });

  it("has engines present but none contributing", () => {
    // The guard, and the shape of the original defect: provenance is populated,
    // which is why gating on provenance was not enough.
    expect(resolved).not.toBeNull();
    expect(Object.values(resolved!.provenance).filter(Boolean).length).toBeGreaterThan(0);
    expect(resolved!.certainty.basis).toBe(0);
  });

  it("states no confidence, rather than total confidence", () => {
    expect(resolved!.certainty.score).toBeNull();
  });

  it("tells the model nothing about how certain it is", () => {
    expect(promptBuilder.serializeResolvedContext(resolved!)).not.toContain("Overall Confidence");
  });

  it("withholds the line even when the block has something else to say", () => {
    // The case that makes the previous one mean something. On a bare workspace
    // the block is empty and returns before the confidence line is reached, so
    // that assertion passes whether or not the score is checked -- verified by
    // disabling the check and watching it still pass. Here the summary renders,
    // so the only thing standing between a null score and
    // "Overall Confidence: null" is the check itself.
    const withSummary = {
      ...resolved!,
      certainty: { basis: 0, score: null },
      relevantContext: ['Present focus state is "Building".'],
    } as ResolvedContext;

    const block = promptBuilder.serializeResolvedContext(withSummary);

    expect(block).toContain("Context Summary");
    expect(block).not.toContain("Overall Confidence");
    expect(block).not.toContain("null");
  });

  it("does not treat knowing nothing as grounds to interrupt", () => {
    // The behavioural half, kept separate from the claim above. Under the old
    // scalar this read 1.0 and sailed past the proactive threshold.
    const decision = evaluateInitiative(resolved!);

    expect(decision.decisionOutcome).toBe("Silence");
    expect(decision.interventionNecessity).toContain("nothing to act on");
  });
});

describe("a certainty that was actually measured", () => {
  const measured = (basis: number, score: number): ResolvedContext =>
    ({
      origin: "ContextResolutionEngine",
      status: "ResolvedContextConstructed",
      certainty: { basis, score },
      provenance: {},
      currentPriorities: [],
      relevantContext: ["The user is mid-session."],
      supportingEvidence: [],
      activeGoals: [],
      currentFocus: null,
      importantRelationships: [],
      relevantHabits: [],
      knowledgeRelevance: [],
      activeReflections: [],
      conflictsExposed: [],
    }) as unknown as ResolvedContext;

  it("is stated, and says how much it spans", () => {
    // The other half of the suppression: this must hide an empty claim, not the
    // feature. And the span matters -- one certain engine is not seven agreeing.
    expect(promptBuilder.serializeResolvedContext(measured(1, 0.9))).toContain(
      "Overall Confidence: 0.9 (across 1 context engine)",
    );
    expect(promptBuilder.serializeResolvedContext(measured(4, 0.72))).toContain(
      "Overall Confidence: 0.72 (across 4 context engines)",
    );
  });

  it("still gates behaviour on the number when there is one", () => {
    // Separating the claim from the gate must not disconnect the gate.
    const low = evaluateInitiative(measured(3, 0.2));
    expect(low.decisionOutcome).toBe("Silence");
    expect(low.interventionNecessity).toContain("low context confidence");
  });
});

describe("the second aggregate, in the reflection engine", () => {
  // The residual path. `synthesizeReflectionReport` averages the same four
  // context confidences as `resolveUnifiedContext`, and its result becomes
  // `ReflectionContext.confidence`, which flows back into that first average --
  // so a number invented here did not stay here. Fixing only the resolver would
  // have left this producing the old answer.

  const emptyKnowledge = buildKnowledgeContext([], [], []);

  it("does not count an engine that has nothing in it", () => {
    // The guard: this really is an engine with no basis and a defaulted 1.0.
    expect(emptyKnowledge.basis).toBe(0);
    expect(emptyKnowledge.confidence).toBe(1);

    const report = synthesizeReflectionReport(null, emptyKnowledge, null, null);

    // Counting it would have produced 1 -- maximum confidence from an engine
    // with no producer at all.
    expect(report.confidence).not.toBe(1);
  });

  it("does not fall back to a number nobody derived", () => {
    // With no contributor at all this used to return 0.8, a figure with no
    // derivation, presented alongside genuinely computed ones.
    const report = synthesizeReflectionReport(null, null, null, null);

    expect(report.confidence).not.toBe(0.8);
    expect(report.confidence).toBe(0);
  });
});

describe("a workspace where engines do have something", () => {
  // The inverse risk of the redesign. Excluding zero-basis engines is correct,
  // but if every engine were excluded the certainty would be permanently null
  // and initiative permanently Silent -- a working system that never speaks.
  // Three of the seven contributors are orphaned (`context/goals`,
  // `context/knowledge`, `context/relationships` all have no producer), so this
  // pins that the remaining ones still carry it.

  it("produces a measured certainty once real engines have content", () => {
    freshWorkspace();

    // Booted the way `__root.tsx` boots them. No optional chaining: a renamed
    // export must fail here rather than silently skip an engine and leave this
    // asserting against a system that never started.
    presenceService.initialize();
    genesis.goalService.initialize();
    genesis.knowledgeService.initialize();
    genesis.relationshipService.initialize();
    genesis.habitService.initialize();
    genesis.reflectionService.initialize();
    genesis.companionStateService.bootstrap();
    contextResolutionService.initialize();

    akira.addProject({ name: "Kitchen Renovation" });
    const pid = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "Replace the sink", projectId: pid });
    const task = akira.getState().tasks.find((t) => t.title === "Replace the sink");
    if (task) akira.toggleTask(task.id);

    contextResolutionService.initialize();
    const resolved = contextResolutionService.getContext();
    expect(resolved).not.toBeNull();

    // At least one engine contributed, so a score exists and is a number.
    expect(resolved!.certainty.basis).toBeGreaterThan(0);
    expect(resolved!.certainty.score).not.toBeNull();
    expect(typeof resolved!.certainty.score).toBe("number");

    // And the no-basis branch is not the one that answered.
    const decision = evaluateInitiative(resolved!);
    expect(decision.interventionNecessity).not.toContain("nothing to act on");
  });
});
