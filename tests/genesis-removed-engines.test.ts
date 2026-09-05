/**
 * The Goal and Knowledge engines are gone, and what they duplicated is not.
 *
 * Both were orphaned in the same shape: wired at both ends, permanently empty
 * in the middle. `goalService.addGoal` and `knowledgeService.addNode` were the
 * only ways a Goal or a KnowledgeNode could come into existence and neither had
 * a caller outside its own module. `syncFromStore` and
 * `processWorkspaceActivities` look like producers and are not -- they update
 * records that already exist, so on an empty registry they iterate nothing.
 *
 * The Goal Engine was also duplicate architecture. `contextRules.extractGoals`
 * builds the prompt's Goals block from active project arcs and stated
 * aspirations, and always did; the engine never contributed to it. The
 * Knowledge Engine was not duplicate but speculative: prerequisites and
 * knowledge gaps are a real capability with no way to acquire the data, and
 * inventing an ontology to keep the code alive would have been the wrong
 * direction.
 *
 * These cases exist because a deletion can silently take a working capability
 * with it. The first group is the proof that it did not.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { contextBuilder } = await import("../src/genesis/context/context-builder");
const { contextService } = await import("../src/genesis/context/context-service");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");

const PROJECT = "Kitchen Renovation";
const ASPIRATION = "I want to become a commercial pilot";

beforeEach(() => {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  storyService.clearHistory();
  understandingEngine.dispose();
  understandingEngine.initialize();
});

describe("the goal capability that had to survive", () => {
  beforeEach(() => {
    akira.addProject({ name: PROJECT });
    const pid = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "Replace the sink", projectId: pid });
    const task = akira.getState().tasks.find((t) => t.title === "Replace the sink");
    if (task) akira.toggleTask(task.id);
    akira.addNote(ASPIRATION);
    contextBuilder.rebuildContextPackage();
  });

  it("still distinguishes an active project from a stated aspiration", () => {
    // Measured before the deletion and asserted unchanged after it. `extractGoals`
    // never read the Goal Engine, so removing it should have moved nothing --
    // this is what proves that rather than assuming it.
    const pkg = contextService.getActiveContext();
    expect(pkg).not.toBeNull();

    const goals = pkg!.currentGoals.map((g) => `${g.data} :: ${g.inclusionReason}`);

    expect(goals).toContain(`Complete Project Arc: ${PROJECT} :: Active project`);
    expect(goals).toContain("become a commercial pilot :: Stated aspiration");
  });

  it("still tells the model both, under their own reasons", () => {
    const block = promptBuilder.serializeContextPackage(contextService.getActiveContext()!);

    expect(block).toContain(`- Complete Project Arc: ${PROJECT} (Reason: Active project)`);
    expect(block).toContain("- become a commercial pilot (Reason: Stated aspiration)");
  });
});

describe("the knowledge capability that had to survive", () => {
  it("still records what the user is learning, from their notes", () => {
    // A different system that merely shares the word. `knowledge:` understandings
    // come from note subjects via `understanding/rules.ts` and never went near
    // the Knowledge Engine, which modelled domains, skills and prerequisites.
    akira.addNote({ title: "RISC-V pipeline hazards", content: "cache and hazard notes" });

    const learned = understandingEngine
      .getUnderstandings()
      .find((u) => u.canonicalKey.startsWith("knowledge:"));

    expect(learned, "the knowledge understanding pipeline is gone too").toBeDefined();
    expect(learned!.canonicalKey).toBe("knowledge:risc-v-pipeline-hazards");
  });
});

describe("the removed engines", () => {
  it("are not exported from the genesis barrel", () => {
    // A zombie export is how a removed engine comes back: something imports it,
    // finds a shell, and builds on it.
    expect(genesis).not.toHaveProperty("goalService");
    expect(genesis).not.toHaveProperty("knowledgeService");
  });

  it("are not started by the application boot path", () => {
    // Read as text on purpose. Importing the route would drag React and the
    // whole provider tree in, and the question here is only whether the boot
    // sequence still names engines that no longer exist.
    const root = readFileSync("src/routes/__root.tsx", "utf-8");

    // The guard: this must be the real boot file, or the absences below are
    // absences in the wrong document.
    expect(root).toContain("presenceService.initialize()");
    expect(root).toContain("relationshipService.initialize()");

    expect(root).not.toContain("goalService");
    expect(root).not.toContain("knowledgeService");
  });

  it("leave no module behind to import", () => {
    // An empty shell kept "just in case" is the thing this task existed to
    // prevent, so the absence is asserted against the module system rather than
    // against a grep.
    expect(() => require.resolve("../src/genesis/context/goals/service")).toThrow();
    expect(() => require.resolve("../src/genesis/context/knowledge/service")).toThrow();
  });
});
