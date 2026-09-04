/**
 * Milestone Causality, and the field it reads.
 *
 * `Caused By` is one of four relationship rules and has never produced a
 * relationship. Not because the workloads never reached it -- that was the
 * first explanation and it was wrong -- but because it reads a field whose
 * content is replaced before any Memory exists.
 *
 * The lifecycle:
 *
 *   candidate-rules   sets explanation to what happened
 *                     "Project X reached 100% completion milestone."
 *   validation-rules  returns its own explanation, the promotion rationale
 *                     "Milestone candidate "Project Updated" promoted immediately."
 *   memory-service    `result.explanation || candidate.explanation`
 *                     the validator's is always truthy for a promotion, so it wins
 *
 * Milestone Causality then asks whether the explanation contains "completed" or
 * "100%", and the surviving text is a fixed sentence interpolating the
 * *translator's* event title -- "Project Updated" -- not the user's project
 * name, which lives in `description`. So no user input can reach it and
 * `isCompletion` is deterministically false.
 *
 * `isCreation` is true only by accident: the same template interpolates
 * "Project Created", and that string happens to contain "created".
 *
 * These tests characterise that before the repair and prove reachability after.
 * The rule is asserted directly rather than through a workload, because a
 * workload that produces nothing cannot distinguish "unreachable" from "not
 * reached" -- which is exactly the mistake that hid this.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { relationshipRules } =
  await import("../src/genesis/memory/relationships/relationship-rules");
const { resetRetentionPolicy } = await import("../src/genesis/retention/policy");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

/** Drives the only store sequence that can satisfy Milestone Causality. */
function createThenCompleteAProject(name: string): string {
  akira.addProject({ name });
  const projectId = akira.getState().lastProjectId as string;
  akira.updateProject(projectId, { progress: 100 });
  return projectId;
}

const milestoneMemories = (projectId: string) =>
  memoryService
    .getMemories()
    .filter((m) => m.reason === "Milestone" && m.relatedProjectId === projectId);

const causalityRule = relationshipRules.find((r) => r.name === "Milestone Causality Rule")!;

describe("the explanation a Memory carries", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("is the candidate's account of what happened, not the validator's rationale", () => {
    const projectId = createThenCompleteAProject("Explanation Provenance");
    const milestones = milestoneMemories(projectId);

    expect(milestones.length).toBe(2);

    const creation = milestones.find((m) => m.eventType === "project_created")!;
    const completion = milestones.find((m) => m.eventType === "project_updated")!;

    // What the candidate said, and what the Memory must still say. The
    // validator's alternative -- `Milestone candidate "..." promoted
    // immediately.` -- restates `reason` and `title`, both already on the
    // Memory, and discards the only text that describes the occurrence.
    expect(creation.explanation).toContain("initiated");
    expect(completion.explanation).toContain("100%");
    expect(completion.explanation).not.toContain("promoted immediately");
  });

  it("keeps the project name, which only the candidate text carries", () => {
    const projectId = createThenCompleteAProject("Distinctive Project Name");
    const completion = milestoneMemories(projectId).find((m) => m.eventType === "project_updated")!;

    // The validator's template interpolates the translator's fixed event title
    // ("Project Updated"), so the user's own words never survived it.
    expect(completion.explanation).toContain("Distinctive Project Name");
  });
});

describe("Milestone Causality is reachable", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("fires on a real created-then-completed project", () => {
    const projectId = createThenCompleteAProject("Causality End To End");

    const causedBy = relationshipService.getRelationships().filter((r) => r.type === "Caused By");

    expect(causedBy.length).toBeGreaterThan(0);

    // The completion is the cause's effect: newer memory is the source.
    const milestones = milestoneMemories(projectId);
    const creation = milestones.find((m) => m.eventType === "project_created")!;
    const completion = milestones.find((m) => m.eventType === "project_updated")!;

    const link = causedBy.find(
      (r) => r.sourceMemoryId === completion.id && r.targetMemoryId === creation.id,
    );
    expect(link).toBeDefined();
    expect(link!.evidence).toContain("completion milestone is caused by");
  });

  it("evaluates true when asked directly, which a workload alone cannot prove", () => {
    const projectId = createThenCompleteAProject("Direct Rule Evaluation");
    const milestones = milestoneMemories(projectId);
    const creation = milestones.find((m) => m.eventType === "project_created")!;
    const completion = milestones.find((m) => m.eventType === "project_updated")!;

    const result = causalityRule.evaluate(completion, creation);
    expect(result.detected).toBe(true);
    expect(result.type).toBe("Caused By");
  });

  it("stays directional: creation does not cause completion", () => {
    const projectId = createThenCompleteAProject("Direction");
    const milestones = milestoneMemories(projectId);
    const creation = milestones.find((m) => m.eventType === "project_created")!;
    const completion = milestones.find((m) => m.eventType === "project_updated")!;

    // Reversed arguments: the creation is not a completion, so no causality.
    expect(causalityRule.evaluate(creation, completion).detected).toBe(false);
  });

  it("does not fire across different projects", () => {
    const first = createThenCompleteAProject("Project One");
    const second = createThenCompleteAProject("Project Two");

    const firstCreation = milestoneMemories(first).find((m) => m.eventType === "project_created")!;
    const secondCompletion = milestoneMemories(second).find(
      (m) => m.eventType === "project_updated",
    )!;

    // Same reasons and the right text, but the project gate must still hold.
    expect(causalityRule.evaluate(secondCompletion, firstCreation).detected).toBe(false);
  });
});

describe("the other three rules are unaffected", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("still detects Part Of between same-project memories", () => {
    const projectId = createThenCompleteAProject("Part Of Intact");
    for (let i = 0; i < 4; i++) {
      const title = `po-${i}`;
      akira.addTaskDetails({ title, projectId });
      akira.toggleTask(akira.getState().tasks.find((t) => t.title === title)!.id);
    }

    const partOf = relationshipService.getRelationships().filter((r) => r.type === "Part Of");
    expect(partOf.length).toBeGreaterThan(0);
  });

  it("still detects Continues on a continued-work history", () => {
    akira.addProject({ name: "Continues Intact" });
    const projectId = akira.getState().lastProjectId as string;
    for (let i = 0; i < 6; i++) akira.touchProject(projectId);

    const continues = relationshipService.getRelationships().filter((r) => r.type === "Continues");
    expect(continues.length).toBeGreaterThan(0);
  });

  it("still detects References between memories sharing a note", () => {
    akira.addProject({ name: "References Intact" });
    const projectId = akira.getState().lastProjectId as string;
    const noteId = akira.addNote({
      title: "shared",
      content: "a thought worth keeping",
      projectId,
    }) as string;
    akira.updateNote(noteId, { content: "the same thought, revised and still worth keeping" });

    const references = relationshipService
      .getRelationships()
      .filter((r) => r.type === "References");
    expect(references.length).toBeGreaterThan(0);
  });
});

describe("repair preserves the pipeline's invariants", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  /** Relationships as structure, independent of regenerated ids. */
  function shape(): string[] {
    const memories = memoryService.getMemories();
    const at = new Map(memories.map((m, i) => [m.id, i]));
    return relationshipService
      .getRelationships()
      .map((r) => `${at.get(r.sourceMemoryId)}->${at.get(r.targetMemoryId)}:${r.type}`)
      .sort();
  }

  it("reconstructs the same relationship structure, repeatedly", () => {
    const projectId = createThenCompleteAProject("Replay Causality");
    for (let i = 0; i < 12; i++) {
      const title = `rc-${i}`;
      akira.addTaskDetails({ title, projectId });
      akira.toggleTask(akira.getState().tasks.find((t) => t.title === title)!.id);
    }

    const live = shape();
    const liveCausedBy = relationshipService
      .getRelationships()
      .filter((r) => r.type === "Caused By").length;

    memoryService.reconstructRuntimeMemory();
    expect(shape()).toEqual(live);

    memoryService.reconstructRuntimeMemory();
    expect(shape()).toEqual(live);

    // The repaired rule survives replay rather than firing only when live.
    expect(
      relationshipService.getRelationships().filter((r) => r.type === "Caused By").length,
    ).toBe(liveCausedBy);
  });

  it("leaves no dangling references and no memory over its bound", () => {
    const projectId = createThenCompleteAProject("Invariants");
    for (let i = 0; i < 20; i++) {
      const title = `inv-${i}`;
      akira.addTaskDetails({ title, projectId });
      akira.toggleTask(akira.getState().tasks.find((t) => t.title === title)!.id);
    }

    const live = new Set(memoryService.getMemories().map((m) => m.id));
    for (const link of relationshipService.getRelationships()) {
      expect(live.has(link.sourceMemoryId) || live.has(link.targetMemoryId)).toBe(true);
    }

    const counted = new Map<string, number>();
    for (const link of relationshipService.getRelationships()) {
      counted.set(link.sourceMemoryId, (counted.get(link.sourceMemoryId) ?? 0) + 1);
      counted.set(link.targetMemoryId, (counted.get(link.targetMemoryId) ?? 0) + 1);
    }
    for (const [, count] of counted) expect(count).toBeLessThanOrEqual(8);
  });
});
