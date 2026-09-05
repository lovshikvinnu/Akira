/**
 * Confidence in a declared aspect reflects what the user said, and how recently.
 *
 * `calculateConfidence` scores an identity aspect from evidence count, average
 * weight, recency and contradictions. It is the only evidence-based confidence
 * in GENESIS, and it was being fed exactly one record per aspect forever,
 * because `attachEvidence` sat inside `PersonalDeclarationRule`'s
 * `if (!exists)` branch. Whichever declaration created the aspect supplied its
 * only evidence; every restatement afterwards was dropped.
 *
 * Two consequences, both measured before this change.
 *
 * THE SCORE WAS A FUNCTION OF ARRAY ORDER
 * ---------------------------------------
 * With the count pinned at 1, the score was `0.25 x recencyFactor` -- one of
 * three possible values -- and *which* one depended on which statement the
 * replay happened to reach first. The same two declarations, one 200 days old
 * and one from yesterday:
 *
 *     stream [old, new]   score 0.250 "Possible"
 *     stream [new, old]   score 0.175 "Weak"
 *
 * Same facts, different answer, decided by the order of an array.
 *
 * SAYING SOMETHING AGAIN CHANGED NOTHING
 * --------------------------------------
 * Across five declaration categories, six repetitions and ages from 0 to 160
 * days, every node in the graph scored 0.175 "Weak" with evidence=1. A model
 * built around counting evidence, never given more than one piece.
 *
 * WHAT THIS FILE PINS
 * -------------------
 * That the score now moves with the things it claims to measure, that it does
 * not move with things it should not (stream order, how many times the app has
 * restarted), and that inference alone never reaches "Confirmed" -- the level
 * the explicit-confirmation branch owns.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

import type { MemoryEvent } from "../src/shared/types/event-types";
import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { identityService, InMemoryIdentityRepository, identityConfidenceService } =
  await import("../src/genesis/identity");

const DAY = 24 * 60 * 60 * 1000;
const DECLARATION = "I want to become a pilot";

function statement(id: string, ageDays: number, text = DECLARATION): MemoryEvent {
  return {
    id,
    timestamp: new Date(Date.now() - ageDays * DAY).toISOString(),
    eventType: "note_created",
    title: "Note Created",
    description: text,
    relatedProjectId: null,
    relatedNoteId: `note-${id}`,
    metadata: {},
  };
}

/**
 * A real reload. The identity graph is a module singleton, so without a fresh
 * repository the rule's guard holds and nothing under test runs.
 */
function reloadFrom(stream: MemoryEvent[]): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: stream, tasks: [], notes: [], projects: [], chat: [] });
  identityService.setRepository(new InMemoryIdentityRepository());
  memoryService.reconstructRuntimeMemory();
}

function goalNode(): string {
  const identity = identityService.getIdentity();
  if (!identity) throw new Error("the declaration produced no identity");
  const goal = identityService.getGoals(identity.id).find((g) => g.title === "become a pilot");
  if (!goal) throw new Error("the declaration produced no goal");
  return goal.confidenceReference;
}

const scoreOf = (nodeId: string) => identityConfidenceService.calculateConfidence(nodeId);
const evidenceCount = (nodeId: string) => identityService.getEvidenceByNode(nodeId).length;

describe("the score measures the statements, not the stream", () => {
  it("gives the same answer whichever order the stream arrives in", () => {
    const older = statement("old", 200);
    const newer = statement("new", 1);

    reloadFrom([older, newer]);
    const forwards = scoreOf(goalNode());
    expect(evidenceCount(goalNode()), "both statements were not recorded").toBe(2);

    reloadFrom([newer, older]);
    const backwards = scoreOf(goalNode());

    expect(backwards.score, "the score depended on the order of the array").toBe(forwards.score);
    expect(backwards.level).toBe(forwards.level);
  });

  it("counts a restatement as more evidence", () => {
    reloadFrom([statement("a", 1)]);
    const once = scoreOf(goalNode());
    expect(evidenceCount(goalNode())).toBe(1);

    reloadFrom([statement("a", 1), statement("b", 3)]);
    const twice = scoreOf(goalNode());

    expect(evidenceCount(goalNode()), "the second statement was dropped").toBe(2);
    expect(twice.score, "saying it again did not raise confidence").toBeGreaterThan(once.score);
  });

  it("holds an older statement in lower regard than a recent one", () => {
    reloadFrom([statement("a", 1)]);
    const fresh = scoreOf(goalNode());

    reloadFrom([statement("a", 400)]);
    const stale = scoreOf(goalNode());

    expect(stale.score, "age did not reduce confidence").toBeLessThan(fresh.score);
  });

  it("does not gain confidence from being restarted", () => {
    // The hazard introduced by attaching evidence per statement: `addEvidence`
    // mints a record per call and reconstruction replays the whole stream, so
    // an unguarded version grows the count on every reload. Measured at
    // 2 / 4 / 10 records after 1 / 2 / 5 reloads before the dedup was keyed on
    // the statement rather than on the Memory id, which is regenerated.
    reloadFrom([statement("a", 1), statement("b", 3)]);
    const first = scoreOf(goalNode());
    expect(evidenceCount(goalNode())).toBe(2);

    for (let i = 0; i < 5; i++) memoryService.reconstructRuntimeMemory();

    expect(evidenceCount(goalNode()), "reloading duplicated the evidence").toBe(2);
    expect(scoreOf(goalNode()).score, "confidence climbed with restarts").toBe(first.score);
  });
});

describe("inference stays below confirmation", () => {
  it("does not call four repetitions a confirmation", () => {
    // `evidenceCount * 0.25` reaches 1.0 on the fourth record, which is the
    // score and the level the explicit-confirmation branch returns. Repeating
    // something is evidence; it is not the user confirming it.
    reloadFrom([statement("a", 1), statement("b", 3), statement("c", 5), statement("d", 7)]);

    const confidence = scoreOf(goalNode());
    expect(evidenceCount(goalNode()), "the four statements were not all recorded").toBe(4);
    expect(confidence.score, "inference reached certainty").toBeLessThan(1.0);
    expect(confidence.level, "repetition was reported as confirmation").not.toBe("Confirmed");
    expect(confidence.level).toBe("Strong");
  });

  it("still lets an explicitly confirmed aspect reach Confirmed", () => {
    // The other half of the clamp. Reserving 1.0 is only correct if the branch
    // it is reserved for can still get there -- otherwise the level is dead and
    // the test above passes for the wrong reason.
    reloadFrom([statement("a", 1)]);
    const nodeId = goalNode();
    expect(scoreOf(nodeId).level).not.toBe("Confirmed");

    identityService.addEvidence(nodeId, "UserDirect", "user-said-so", DECLARATION, {
      originEngine: "UserConfirmation",
    });

    const confirmed = scoreOf(nodeId);
    expect(confirmed.level, "an explicit confirmation could no longer be recorded").toBe(
      "Confirmed",
    );
    expect(confirmed.score).toBe(1.0);
  });
});
