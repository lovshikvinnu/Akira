/**
 * A declaration becomes evidence in the identity graph, not just an aspect.
 *
 * `PersonalDeclarationRule` creates a foundation aspect for each declaration --
 * `createGoal`, `createInterest`, `createPreference`, `createValue`,
 * `createHabit` -- and passes the originating memory id as
 * `initialEvidenceIds`. Every one of them lost it.
 *
 * `linkEvidenceToNode(nodeId, evidenceId)` resolves the id with
 * `repository.getEvidence(id)` and returns false when it misses. A Memory id is
 * not an `IdentityEvidence` id, so no record was found, the boolean was
 * discarded, and the node ended with `evidenceIds: []`. `calculateConfidence`
 * then correctly reported score 0 / "Unknown": there was no evidence to score.
 *
 * The rule now calls `addEvidence(nodeId, "Memory", memory.id, text)`, which
 * creates the record rather than looking for one, and refreshes confidence
 * itself.
 *
 * ALL FIVE CATEGORIES, AND WHY THAT IS NOT PEDANTRY
 * -------------------------------------------------
 * The five `create*` methods have different signatures -- the evidence array is
 * the 6th argument on `createGoal`, the 4th on `createInterest` and
 * `createHabit`, the 5th on `createValue`. A fix proved on Goal proves the one
 * with the least similar call shape.
 *
 * THE RELOAD TRAP
 * ---------------
 * `reconstructRuntimeMemory()` is NOT a reload for identity. The identity graph
 * is a module singleton that survives it, so the `exists` guard in the rule is
 * true, `create*` does not run, and neither does the new `addEvidence`. An
 * idempotency test built on `reconstructRuntimeMemory()` alone would exercise
 * none of this change and pass regardless. A genuine reload needs a fresh
 * repository, which is what `reload()` below does.
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
const { identityService, InMemoryIdentityRepository } = await import("../src/genesis/identity");
const { candidateService } = genesis;

/** One phrasing per category the parser recognises. */
const DECLARATIONS = [
  { category: "Goal", text: "I want to become a pilot", content: "become a pilot" },
  { category: "Interest", text: "I love long flights at night", content: "long flights at night" },
  { category: "Preference", text: "I prefer dark roast", content: "dark roast" },
  { category: "Value", text: "I care deeply about privacy", content: "privacy" },
  { category: "Habit", text: "I run every morning", content: "run" },
] as const;

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  identityService.setRepository(new InMemoryIdentityRepository());
}

/** Every evidence record in the graph, across all nodes. */
function allEvidence() {
  return identityService
    .getIdentityNodes()
    .flatMap((node) => identityService.getEvidenceByNode(node.id));
}

/** The graph node backing an aspect whose value matches `content`. */
function nodeFor(content: string) {
  return identityService
    .getIdentityNodes()
    .find((n) => (n.value ?? "").toLowerCase() === content.toLowerCase());
}

beforeEach(() => {
  freshWorkspace();
});

describe("every declaration category creates real graph evidence", () => {
  for (const decl of DECLARATIONS) {
    it(`${decl.category}: "${decl.text}"`, () => {
      const noteId = akira.addNote({ content: decl.text });
      const memory = memoryService.getMemories().find((m) => m.relatedNoteId === noteId);
      expect(memory, "the declaration produced no memory").toBeDefined();

      const node = nodeFor(decl.content);
      expect(node, `no graph node for ${decl.category} "${decl.content}"`).toBeDefined();

      const evidence = identityService.getEvidenceByNode(node!.id);
      expect(evidence.length, `${decl.category} node carries no evidence`).toBeGreaterThan(0);

      // The originating memory, referenced rather than copied.
      const fromMemory = evidence.find((e) => e.sourceId === memory!.id);
      expect(
        fromMemory,
        `evidence does not point back at the memory that produced it`,
      ).toBeDefined();
      expect(fromMemory!.sourceType).toBe("Memory");
      expect(fromMemory!.nodeId).toBe(node!.id);
    });
  }

  it("scores confidence above zero once evidence exists", () => {
    // The observable consequence. Before, every declaration node scored 0 /
    // "Unknown" because `calculateConfidence` had nothing to count.
    akira.addNote({ content: "I want to become a pilot" });
    const node = nodeFor("become a pilot")!;
    const confidence = identityService.getConfidence(node.id);

    expect(confidence, "no confidence record for the node").toBeDefined();
    expect(
      confidence!.score,
      "confidence stayed at zero, so evidence is still missing",
    ).toBeGreaterThan(0);
    expect(confidence!.level).not.toBe("Unknown");
  });

  it("keeps the aspect's own evidenceReferences as well", () => {
    // `initialEvidenceIds` is still passed. It populates a separate field on
    // the aspect from the graph edge, and dropping it would have lost that
    // while fixing this.
    akira.addNote({ content: "I want to become a pilot" });
    const identity = identityService.getIdentity()!;
    const goal = identityService.getGoals(identity.id).find((g) => g.title === "become a pilot")!;
    const memory = memoryService.getMemories().find((m) => m.relatedNoteId)!;

    expect(goal.evidenceReferences).toContain(memory.id);
    expect(goal.confidenceReference, "the goal has no graph node").toBeTruthy();
  });

  it("records a restatement as evidence without creating a second aspect", () => {
    // This case used to assert that the second note added no evidence either,
    // on the rationale that "replaying a stream would inflate confidence
    // without new information". That rationale is about replay, but the case
    // exercises two separate notes -- two occasions on which the user said the
    // thing. Those are new information, and `calculateConfidence` is built to
    // count them; the version that dropped them left every declared aspect
    // scoring 0.25 forever. Replay idempotency is a different property and is
    // pinned by the reload cases below, which re-derive from one stream.
    akira.addNote({ content: "I want to become a pilot" });
    const node = nodeFor("become a pilot")!;
    const first = identityService.getEvidenceByNode(node.id).length;
    // Without this the case is satisfied by 0 === 0 and passes against a build
    // that attaches no evidence at all.
    expect(first, "no evidence to count from").toBeGreaterThan(0);

    akira.addNote({ content: "I want to become a pilot" });

    expect(
      identityService.getEvidenceByNode(node.id).length,
      "the second time the user said it was dropped",
    ).toBe(first + 1);
    // The aspect itself is still one node -- the guard that stops a duplicate
    // goal being created is unchanged, and only evidence accumulates.
    expect(
      identityService.getIdentityNodes().filter((n) => n.value === "become a pilot").length,
      "a restatement created a second aspect",
    ).toBe(1);
  });
});

describe("a genuine reload rebuilds the evidence", () => {
  /**
   * A real reload, not `reconstructRuntimeMemory()` alone.
   *
   * The identity graph is a module singleton and survives reconstruction, so
   * the rule's `exists` guard holds, `create*` is skipped and the new
   * `addEvidence` never runs. Handing the services a fresh repository is what
   * makes replay actually re-derive identity from the event stream.
   */
  function reload(): void {
    identityService.setRepository(new InMemoryIdentityRepository());
    memoryService.reconstructRuntimeMemory();
  }

  it("re-derives evidence for every category from the event stream", () => {
    for (const decl of DECLARATIONS) akira.addNote({ content: decl.text });

    const before = allEvidence().length;
    expect(before, "no evidence before reload").toBeGreaterThanOrEqual(DECLARATIONS.length);

    reload();

    const after = allEvidence();
    expect(after.length, "evidence did not come back after a real reload").toBe(before);
    for (const decl of DECLARATIONS) {
      const node = nodeFor(decl.content);
      expect(node, `${decl.category} did not survive reload`).toBeDefined();
      expect(
        identityService.getEvidenceByNode(node!.id).length,
        `${decl.category} came back without evidence`,
      ).toBeGreaterThan(0);
    }
  });

  it("is idempotent across repeated reloads", () => {
    for (const decl of DECLARATIONS) akira.addNote({ content: decl.text });

    reload();
    const once = allEvidence().length;
    const nodesOnce = identityService.getIdentityNodes().length;
    // Same guard: comparing two zeroes proves nothing about idempotency.
    expect(once, "no evidence survived the first reload").toBeGreaterThan(0);

    reload();
    expect(allEvidence().length, "a second reload changed the evidence count").toBe(once);
    expect(identityService.getIdentityNodes().length).toBe(nodesOnce);
  });

  it("still points every rebuilt record at a memory that exists", () => {
    for (const decl of DECLARATIONS) akira.addNote({ content: decl.text });
    reload();

    const liveMemoryIds = new Set(memoryService.getMemories().map((m) => m.id));
    const memoryEvidence = allEvidence().filter((e) => e.sourceType === "Memory");
    expect(memoryEvidence.length).toBeGreaterThan(0);
    for (const e of memoryEvidence) {
      expect(
        liveMemoryIds.has(e.sourceId),
        `evidence ${e.id} points at a memory that no longer exists`,
      ).toBe(true);
    }
  });
});
