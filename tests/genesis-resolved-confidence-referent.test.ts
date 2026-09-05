/**
 * A confidence with nothing behind it is not a confidence.
 *
 * `resolveUnifiedContext` averages whichever sub-contexts exist and falls back
 * to `1.0` when there are none: `confidenceCount > 0 ? mean : 1.0`. That default
 * means "nothing contributed". Printed under a heading it read as certainty --
 * and on a workspace whose engines have not produced anything yet it was the
 * entire block. Measured through `contextResolutionService` on a real
 * workspace, this is all the model received:
 *
 *   [RESOLVED CONTEXT]
 *   Overall Confidence: 1
 *
 * A maximum-confidence claim with no subject, from no inputs, in a system whose
 * stated aim is not to invent beliefs about the user.
 *
 * WHY GATED ON PROVENANCE AND NOT ON THE VALUE
 *
 * 1.0 is also what a genuine mean returns when every contributing engine is
 * certain. Suppressing by value would hide the real case along with the empty
 * one, so the condition is whether anything contributed at all -- the same
 * condition the average itself uses. The number is not changed:
 * `initiative/rules.ts` gates behaviour on it, and this changes what is said,
 * not what is decided.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";
import type { ResolvedContext } from "../src/genesis/context/context-resolution/types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { intentResolver } = await import("../src/genesis/understanding/intent-resolver");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");
const { knowledgeService } = await import("../src/genesis/context/knowledge/service");
const { relationshipService } = await import("../src/genesis/context/relationships/service");

const PROMPT = "what should I do next";

let resolved: ResolvedContext | null = null;

beforeAll(() => {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  contextResolutionService.initialize();

  akira.addProject({ name: "Flight Training" });
  const pid = akira.getState().lastProjectId as string;
  akira.addTaskDetails({ title: "Book medical exam", projectId: pid });
  akira.addNote("I want to become a commercial pilot");
  akira.addChatMessage("user", PROMPT);

  resolved = contextResolutionService.getContext();
});

describe("a resolved context nothing contributed to", () => {
  it("exists, and really has no contributing engine", () => {
    // The guard. Both claims below are about a specific state, and would pass
    // trivially against a null context or one that happened to be populated.
    expect(resolved).not.toBeNull();
    expect(Object.values(resolved!.provenance).some((c) => Boolean(c))).toBe(false);
    // And the default really is the maximum, which is what made it misleading.
    expect(resolved!.overallConfidence).toBe(1);
  });

  it("states no confidence", () => {
    expect(promptBuilder.serializeResolvedContext(resolved!)).toBe("");
  });

  it("puts no empty section in the prompt", () => {
    const intent = intentResolver.resolveIntent(PROMPT, undefined);
    const selection = contextRelevanceSelector.selectContext(PROMPT, undefined, resolved, intent);
    const instruction = promptBuilder.buildSystemInstruction(PROMPT, selection, intent, undefined);

    expect(instruction).not.toContain("[RESOLVED CONTEXT]");
    expect(instruction).not.toContain("Overall Confidence");
  });
});

describe("a resolved context an engine did contribute to", () => {
  it("still states its confidence", () => {
    // The other half: this must suppress an empty claim, not the feature. A
    // single contributing engine is enough to make the average mean something.
    const contributed = {
      ...resolved!,
      overallConfidence: 0.9,
      provenance: {
        ...resolved!.provenance,
        presenceContext: {
          sessionType: "Returning",
          returnState: "SameDay",
          confidence: 0.9,
        } as never,
      },
    } as ResolvedContext;

    const block = promptBuilder.serializeResolvedContext(contributed);
    expect(block).toContain("Overall Confidence: 0.9");
    expect(block).toContain("Presence");
  });
});

describe("the production case, where empty engines populate provenance", () => {
  it("still states no confidence", () => {
    // The case an earlier version of this fix missed, and the reason the gate
    // moved off provenance. `__root.tsx` initializes both of these at boot.
    // Neither has a producer -- `addNode` and `recordObservation` have no
    // callers -- so both hold nothing, and both still report `confidence: 1`
    // and populate provenance. Gating on "did anything contribute" was
    // therefore always true in production and the line always printed.
    knowledgeService.initialize();
    relationshipService.initialize();
    contextResolutionService.initialize();

    const live = contextResolutionService.getContext();
    expect(live).not.toBeNull();

    // The guard: this must actually be the missed state -- provenance
    // populated, by engines holding nothing.
    const contributors = Object.values(live!.provenance).filter(Boolean);
    expect(contributors.length).toBeGreaterThan(0);
    expect(live!.overallConfidence).toBe(1);

    expect(promptBuilder.serializeResolvedContext(live!)).toBe("");
  });
});
