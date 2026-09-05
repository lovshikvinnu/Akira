/**
 * The model-facing prompt must not carry internal bookkeeping.
 *
 * Built through the live path -- `chat.tsx` calls
 * `aiContextEngine.executeRequestStream`, which resolves intent, selects
 * context, and hands both to `promptBuilder.buildSystemInstruction`. These
 * cases run that same sequence rather than calling the serializer directly, so
 * a leak reintroduced anywhere along it fails here.
 *
 * Measured before the fix, in a real prompt built from a real workspace:
 *
 *   Session ID: 86ca2c69-b3ab-4acf-bc7f-ba619b69d35c
 *   - Completed task: "Do the cache lab" (Reason: Recent Recall | ID: c354a86d-...)
 *   - Recall active memory node [...] because: ... | Multi-factor recall
 *     [Context: QUERY | Score: 0.87 | Category: Goal | Stability: 1.0 |
 *      SemanticMatch: Yes | Recency: 1.0 | Intent: 0.0 | Reinforce: 0.7]
 *
 * None of it is actionable by a model: the session id names a structure it
 * cannot query, the memory ids are not referable to, and the factors are
 * weights this code computed to decide what to recall.
 *
 * WHY THE POSITIVE ASSERTIONS COME FIRST
 *
 * "The prompt contains no uuid" is satisfied by an empty prompt, and every
 * negative case here would pass on a workspace that recalled nothing. So the
 * package is asserted non-empty and the memory text asserted present before
 * anything is asserted absent.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";
import type { ContextPackage } from "../src/genesis/context/types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { contextBuilder } = await import("../src/genesis/context/context-builder");
const { contextService } = await import("../src/genesis/context/context-service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { intentResolver } = await import("../src/genesis/understanding/intent-resolver");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");

/** Any uuid, in the shape every internal id here is minted in. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const USER_PROMPT = "remind me what I was learning about caches";
const NOTE = "Cache associativity is the tradeoff I keep forgetting";

/** The sequence `context-engine.executeRequestStream` runs, in its order. */
function buildLiveSystemInstruction(): string {
  const pkg = contextService.getActiveContext() ?? undefined;
  const intentResolution = intentResolver.resolveIntent(USER_PROMPT, undefined);
  const resolved = contextResolutionService.getContext();
  const selection = contextRelevanceSelector.selectContext(
    USER_PROMPT,
    pkg,
    resolved,
    intentResolution,
  );
  return promptBuilder.buildSystemInstruction(USER_PROMPT, selection, intentResolution, undefined);
}

let pkg: ContextPackage | null = null;
let systemInstruction = "";

beforeAll(() => {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();

  akira.addProject({ name: "Chip Design Course" });
  const pid = akira.getState().lastProjectId as string;
  for (const t of ["Read chapter 3", "Do the cache lab"]) {
    akira.addTaskDetails({ title: t, projectId: pid });
    const task = akira.getState().tasks.find((x) => x.title === t);
    if (task) akira.toggleTask(task.id);
  }
  akira.addNote("I want to become a commercial pilot");
  akira.addNote(NOTE);
  akira.addChatMessage("user", USER_PROMPT);

  recallBuilder.initialize();
  recallBuilder.rebuildRecallCandidates();
  contextBuilder.rebuildContextPackage();

  pkg = contextService.getActiveContext();
  systemInstruction = buildLiveSystemInstruction();
});

describe("the prompt the model actually receives", () => {
  it("was built from a context package that actually holds memories", () => {
    // The guard for everything below.
    expect(pkg).not.toBeNull();
    expect(pkg!.activeCandidates.length).toBeGreaterThan(0);
    expect(pkg!.recentActivitySummary.length).toBeGreaterThan(0);
    expect(systemInstruction.length).toBeGreaterThan(200);
  });

  it("still tells the model what the user actually wrote", () => {
    expect(systemInstruction).toContain(NOTE);
    expect(systemInstruction).toContain("Chip Design Course");
  });

  it("keeps the human-readable reason a memory was recalled", () => {
    // Deliberately preserved: this is why the memory is relevant, in terms the
    // model can use. Only the diagnostics were removed.
    expect(systemInstruction).toContain("Reason: User Intent");
    expect(systemInstruction).toContain("Associated with active narrative");
  });

  it("carries no session id", () => {
    expect(systemInstruction).not.toContain("Session ID");
    expect(systemInstruction).not.toContain(pkg!.contextSessionId);
  });

  it("carries no memory ids", () => {
    // Against the ids in this run, not a pattern that might miss the real shape.
    for (const item of pkg!.activeCandidates) {
      expect(systemInstruction).not.toContain(item.data.memoryId);
    }
    for (const memory of memoryService.getMemories()) {
      expect(systemInstruction).not.toContain(memory.id);
    }
  });

  it("carries no uuid of any kind", () => {
    expect(systemInstruction).not.toMatch(UUID);
  });

  it("carries no recall scoring telemetry", () => {
    for (const field of [
      "Multi-factor recall",
      "SemanticMatch",
      "Reinforce:",
      "Stability:",
      "Recency:",
      "Score:",
    ]) {
      expect(systemInstruction).not.toContain(field);
    }
  });
});

describe("when a recalled memory can no longer be resolved", () => {
  it("omits the entry instead of printing its id", () => {
    // The failure case used to leak exactly what the success case hid: the
    // summary was emitted either way, so an unresolvable memory printed its raw
    // uuid where its text belonged. Reproduced by clearing the runtime memory
    // set while the already-built package still references those ids.
    const stalePackage = contextService.getActiveContext();
    expect(stalePackage).not.toBeNull();
    expect(stalePackage!.recentActivitySummary.length).toBeGreaterThan(0);

    const ids = stalePackage!.recentActivitySummary
      .map((s) => s.match(/Recall active memory node \(([^)]+)\)/)?.[1])
      .filter((id): id is string => Boolean(id));
    // The join keys are genuinely present in the package, or this proves nothing.
    expect(ids.length).toBeGreaterThan(0);

    memoryService.clearHistory();
    const serialized = promptBuilder.serializeContextPackage(stalePackage!);

    for (const id of ids) {
      expect(serialized).not.toContain(id);
    }
    expect(serialized).not.toMatch(UUID);
  });
});
