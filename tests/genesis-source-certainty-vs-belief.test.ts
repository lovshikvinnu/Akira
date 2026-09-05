/**
 * Two different claims, told to the model as two different things.
 *
 * "The user said this" and "the evidence supports this" are separate facts, and
 * the live prompt collapsed them into one number. `PersonalDeclarationRule`
 * writes every declaration-derived observation at `confidence: 1.0`, and
 * `prompt-builder` rendered that as `(Confidence: 1)`. Measured on a single note
 * written once, a year ago, with no work attached:
 *
 *     identity graph (nothing read it)   score 0.175, level "Weak"
 *     prompt (the model read this)       "- become a pilot: Active (Confidence: 1)"
 *     prompt (the model read this)       "The user has consistently demonstrated
 *                                         a long-term commitment toward become a pilot."
 *
 * Both numbers were right about different questions. AKIRA is certain the
 * sentence was typed; the evidence that it describes a live commitment is weak.
 *
 * WHERE THE SPLIT LIVES
 * ---------------------
 * `IdentityObservation.basis` is the source-certainty dimension -- "Declared" or
 * "Inferred", typed, so nothing has to decide it by searching `provenance` prose.
 * `confidence` stays source certainty and keeps gating retention;
 * `filterIdentityObservations` drops observations under 0.5, so storing belief
 * strength there would have deleted a real declaration from the prompt as it
 * aged, losing the one thing that was never in doubt.
 *
 * Belief strength is read at the prompt boundary from the identity graph, the
 * only thing in GENESIS that computes it. No second scorer was added.
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
const { identityService: observationService } =
  await import("../src/genesis/understanding/identity-service");
const { contextService } = await import("../src/genesis/context/context-service");
const { identityInclusionReason } = await import("../src/genesis/context/context-rules");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");

const DAY = 24 * 60 * 60 * 1000;

function declaration(id: string, ageDays: number, text = "I want to become a pilot"): MemoryEvent {
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

/** A real reload: identity is a module singleton and survives reconstruction. */
function replay(stream: MemoryEvent[]): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: stream, tasks: [], notes: [], projects: [], chat: [] });
  identityService.setRepository(new InMemoryIdentityRepository());
  observationService.clearHistory();
  memoryService.reconstructRuntimeMemory();
}

/** The system instruction the model is actually handed. */
function prompt(): string {
  const contextPackage = contextService.getActiveContext();
  if (!contextPackage) throw new Error("no context package to build a prompt from");
  return promptBuilder.buildSystemInstruction(
    "what should I do next",
    { contextPackage },
    { intent: null, confidence: 1, ambiguous: false, clarificationRequired: false, candidates: [] },
  );
}

const lineAbout = (text: string, needle: string) =>
  text.split("\n").find((l) => l.includes(needle));

/**
 * Just the Emergent Identity Traits block.
 *
 * An observation in a WorkStyle or LearningStyle category is *also* emitted by
 * `extractUserPreferences`, which renders it as
 * `- Deep Work Focus: Active (Reason: Identity Evidence)`. That duplicate
 * projection is out of scope here; scanning the whole prompt for a trait name
 * finds the preferences copy first and reads as though this change had not
 * applied.
 */
function identityTraitsBlock(text: string): string {
  const start = text.indexOf("Emergent Identity Traits:");
  if (start === -1) return "";
  return text.slice(start).split("\n\n")[0];
}

const observationLine = () => lineAbout(identityTraitsBlock(prompt()), "become a pilot: Active");
const goalSentence = () => lineAbout(prompt(), "stated a goal");

describe("an explicit declaration stays an explicit declaration", () => {
  it("is reported as something the user said, not as a confidence score", () => {
    replay([declaration("a", 1)]);

    const line = observationLine();
    expect(line, "the declaration never reached the prompt").toBeDefined();
    expect(line).toContain("Stated explicitly by the user");
    // The ambiguous rendering this replaces. `(Confidence: 1)` reported source
    // certainty in a field the model reads as strength of belief.
    expect(line, "the prompt still reports a bare confidence number").not.toContain(
      "(Confidence: 1)",
    );
  });

  it("is not weakened or dropped, however old and unsupported it is", () => {
    // The constraint that rules out the obvious fix. Storing belief strength in
    // `confidence` would push an aged declaration under the 0.5 retention
    // filter and delete it from the prompt entirely.
    replay([declaration("a", 365)]);

    expect(observationLine(), "an old declaration fell out of the prompt").toBeDefined();
    expect(observationLine()).toContain("Stated explicitly by the user");
    expect(prompt()).toContain("become a pilot");
  });

  it("does not become a claim of sustained commitment", () => {
    replay([declaration("a", 1)]);

    const text = prompt();
    expect(text, "one sentence was reported as demonstrated behaviour").not.toContain(
      "consistently demonstrated",
    );
    expect(text).not.toContain("long-term commitment");
    expect(goalSentence()).toBe("The user has stated a goal of become a pilot.");
  });
});

describe("belief strength tracks the evidence, source certainty does not", () => {
  it("reports weaker support for an old declaration than a recent one", () => {
    replay([declaration("a", 1)]);
    const recent = observationLine();

    replay([declaration("a", 365)]);
    const aged = observationLine();

    // Same certainty about what was said; different strength of belief.
    expect(recent).toContain("Stated explicitly by the user");
    expect(aged).toContain("Stated explicitly by the user");
    expect(aged, "age did not weaken the reported support").toContain("Weak");
    expect(recent, "a fresh declaration was reported as weakly supported").not.toContain("Weak");
  });

  it("does not gain strength merely by sitting in memory", () => {
    // Replay re-derives everything from the stream. An unsupported declaration
    // must come back exactly as unsupported as it was.
    replay([declaration("a", 365)]);
    const first = observationLine();

    for (let i = 0; i < 4; i++) memoryService.reconstructRuntimeMemory();

    expect(observationLine(), "existing in memory strengthened the claim").toBe(first);
  });

  it("strengthens when the user says it again, and says so in the prose", () => {
    replay([declaration("a", 1)]);
    expect(goalSentence()).toBe("The user has stated a goal of become a pilot.");

    replay([declaration("a", 1), declaration("b", 3), declaration("c", 5), declaration("d", 7)]);

    expect(observationLine(), "restating did not raise the reported support").toContain("Strong");
    expect(goalSentence()).toBe(
      "The user has stated a goal of become a pilot repeatedly over time.",
    );
    // Still statements, never demonstrated behaviour. A `goal:` understanding
    // has only ever seen declarations; it has not watched any work happen.
    expect(prompt()).not.toContain("consistently demonstrated");
  });

  it("keeps repetition distinct from explicit confirmation", () => {
    replay([declaration("a", 1), declaration("b", 3), declaration("c", 5), declaration("d", 7)]);

    const node = identityService
      .getIdentityNodes()
      .find((n) => (n.value ?? "").toLowerCase() === "become a pilot");
    expect(node, "no graph node for the declaration").toBeDefined();

    const level = identityConfidenceService.getConfidence(node!.id)?.level;
    expect(level, "four restatements were reported as a confirmation").not.toBe("Confirmed");
    expect(level).toBe("Strong");
    expect(observationLine()).not.toContain("Confirmed");
  });

  it("still lets an explicit confirmation reach Confirmed", () => {
    // The reservation is only meaningful if the branch it is reserved for can
    // still get there.
    replay([declaration("a", 1)]);
    const node = identityService
      .getIdentityNodes()
      .find((n) => (n.value ?? "").toLowerCase() === "become a pilot")!;

    identityService.addEvidence(node.id, "UserDirect", "user-confirmed", "become a pilot", {
      originEngine: "UserConfirmation",
    });
    expect(identityConfidenceService.getConfidence(node.id)?.level).toBe("Confirmed");

    // Asserted at the boundary rather than through `prompt()`. The context
    // package is rebuilt on store events, and confirming an aspect touches only
    // the identity graph -- so the package built earlier still carries the level
    // from before it, and the confirmation surfaces at the next rebuild. What
    // has to hold now is that the boundary reports it.
    const observation = observationService
      .getObservations()
      .find((o) => o.name === "become a pilot")!;
    expect(
      identityInclusionReason(observation),
      "a confirmed aspect is not reported as confirmed",
    ).toContain("Confirmed");
  });
});

describe("an inferred claim is labelled as inferred", () => {
  it("distinguishes what GENESIS concluded from what the user said", () => {
    // Sustained activity is what strengthens an inferred trait; the work-style
    // rule raises its confidence as a project accumulates work. What matters
    // here is that its line never claims the user said it.
    replay([declaration("a", 1)]);
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    for (let i = 0; i < 5; i++) {
      akira.addTaskDetails({ title: `step ${i}`, projectId });
      const task = akira.getState().tasks.find((t) => t.title === `step ${i}`);
      if (task) akira.toggleTask(task.id);
    }

    const inferred = observationService.getObservations().filter((o) => o.basis === "Inferred");
    expect(inferred.length, "no inferred observation was produced by the activity").toBeGreaterThan(
      0,
    );

    const declared = observationService.getObservations().filter((o) => o.basis === "Declared");
    expect(
      declared.map((o) => o.name),
      "the declaration lost its basis",
    ).toContain("become a pilot");

    const traits = identityTraitsBlock(prompt());
    for (const observation of inferred) {
      const line = lineAbout(traits, `- ${observation.name}:`);
      if (!line) continue;
      expect(line, `"${observation.name}" was presented as something the user said`).not.toContain(
        "Stated explicitly by the user",
      );
      expect(line).toContain("Inferred from activity");
    }
  });
});
