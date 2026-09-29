/**
 * Companion State must be able to withdraw a fact, not only establish one.
 *
 * Its store subscriber only moved toward a project or a focus, and
 * `prompt-builder.ts` renders both unconditionally. Measured before the fix,
 * after ending the session and deleting the only project:
 *
 *     companion focus=Building project=Only Project   store projects=0, no session
 *     system prompt: "• Active Focus: Building" / "• Active Project: Only Project"
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";
import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { presenceService } = await import("../src/akira-os/presence/service");
const { companionStateService } = await import("../src/genesis/context/state/service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { intentResolver } = await import("../src/genesis/understanding/intent-resolver");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");

const state = () => companionStateService.getState()!;

/** The real selector -> prompt-builder chain, on a workspace question. */
function promptStateLines(): string[] {
  const q = "What should I work on in my project today?";
  const intent = intentResolver.resolveIntent(q, []);
  const sel = contextRelevanceSelector.selectContext(
    q,
    undefined,
    contextResolutionService.getContext(),
    intent,
  );
  return promptBuilder
    .buildSystemInstruction(q, sel, intent)
    .split("\n")
    .filter((l) => /Active (Focus|Project)/.test(l));
}

beforeEach(async () => {
  akira.reset();
  await settlePendingPersistence();
  const s = akira.getState() as AkiraState;
  akira.initializeState({
    ...s,
    projects: [],
    tasks: [],
    notes: [],
    sessions: [],
    activeSession: null,
    lastProjectId: null,
  });
  presenceService.initialize();
  companionStateService.bootstrap();
  contextResolutionService.initialize();
});

describe("companion state follows the workspace in both directions", () => {
  it("establishes a project and a focus", () => {
    akira.addProject({ name: "Only Project" });
    akira.startSession(akira.getState().lastProjectId as string, "deep work");

    expect(state().activeProject?.name).toBe("Only Project");
    expect(state().currentFocus).toBe("Building");
    expect(promptStateLines()).toContain("• Active Focus: Building");
  });

  it("withdraws the focus when the session ends", () => {
    akira.addProject({ name: "Only Project" });
    akira.startSession(akira.getState().lastProjectId as string, "deep work");
    akira.endSession("done");

    expect(state().currentFocus).toBe("Unknown");
    expect(promptStateLines()).not.toContain("• Active Focus: Building");
  });

  it("withdraws the project when the last one is deleted", async () => {
    akira.addProject({ name: "Only Project" });
    const pid = akira.getState().lastProjectId as string;
    akira.startSession(pid, "deep work");
    akira.deleteProject(pid);
    await settlePendingPersistence();

    expect(state().activeProject).toBeNull();
    expect(state().currentFocus).toBe("Unknown");
    expect(promptStateLines().filter((l) => l.includes("Only Project"))).toEqual([]);
  });

  it("moves to the surviving project when another remains", async () => {
    akira.addProject({ name: "Survivor" });
    akira.addProject({ name: "Doomed" });
    akira.deleteProject(akira.getState().lastProjectId as string);
    await settlePendingPersistence();

    expect(state().activeProject?.name).toBe("Survivor");
  });

  it("does not re-assert a fact over a user correction on an unrelated change", () => {
    akira.addProject({ name: "Only Project" });
    akira.startSession(akira.getState().lastProjectId as string, "deep work");
    companionStateService.correctState("currentFocus", "Planning", "I am planning, not building");

    akira.addChatMessage("user", "unrelated");

    expect(state().currentFocus).toBe("Planning");
  });
});
