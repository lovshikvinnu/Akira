/**
 * A finished project is not something the user is currently building.
 *
 * `determineStatus` resolves Active / Completed / Archived from the linked
 * stories, and `builder.ts` merges it onto the Understanding. `serializer.ts`
 * never read it -- the file contained no reference to `status` at all -- so
 * every block was written in the present tense whatever the status said.
 *
 * Reproduced against the live path before the fix, by completing the project
 * arc and re-serializing:
 *
 *   status  Active -> Completed
 *   sentence  "The user is actively building Chip Design Course."   (unchanged)
 *
 * and that sentence reached the system instruction verbatim, because
 * `prompt-builder.ts:52` builds the understandings block into it.
 *
 * WHAT THIS DOES NOT DO
 *
 * Nothing is deleted or hidden. The understanding still appears in the prompt,
 * still carries its confidence, and still references the memories and stories
 * behind it -- asserted below, because "stop claiming it is current" must not
 * become "erase that it happened". Only the tense changes, plus an explicit
 * Status line so the state is legible rather than implied.
 *
 * The Active wording is deliberately untouched, byte for byte. Two other files
 * assert it exactly, and narrowing an over-broad claim should not restate the
 * claims that were already right.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";
import type { Understanding } from "../src/genesis/understanding/types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { isProjectArc } = await import("../src/genesis/stories/story-identity");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { intentResolver } = await import("../src/genesis/understanding/intent-resolver");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");
const { getUnderstandingContext } = await import("../src/genesis/understanding/context-provider");

const PROJECT = "Kitchen Renovation";
// Two live filters stand between an understanding and the prompt, and this
// prompt has to clear both or the absence assertions pass for the wrong reason.
// `classifyWorkspaceIntent` matches the prompt against project names, and
// `filterUnderstandings` drops every Project understanding when the prompt is
// not workspace-relevant -- so the prompt names the project. `classifyIntent`
// then narrows to a single category when it recognises one, and it reads
// "course" as Knowledge, which silently removed the Project understanding while
// leaving the project's name in the instruction via [AVAILABLE PROJECTS]. That
// is why the project is a kitchen renovation rather than a course.
const USER_PROMPT = "how is Kitchen Renovation going";

/** The real system instruction, built the way `executeRequestStream` builds it. */
function systemInstruction(prompt: string = USER_PROMPT): string {
  const intent = intentResolver.resolveIntent(prompt, undefined);
  const selection = contextRelevanceSelector.selectContext(prompt, undefined, null, intent);
  return promptBuilder.buildSystemInstruction(prompt, selection, intent, undefined);
}

const projectUnderstanding = (): Understanding | undefined =>
  understandingEngine.getUnderstandings().find((u) => u.category === "Project");

function setArcStatus(status: "Completed" | "Archived"): void {
  const arc = storyService.getStories().find(isProjectArc);
  if (!arc) throw new Error("no project arc to change");
  storyService.updateStory(arc.id, { status });
}

beforeEach(() => {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  storyService.clearHistory();
  understandingEngine.dispose();
  understandingEngine.initialize();

  akira.addProject({ name: PROJECT });
  const pid = akira.getState().lastProjectId as string;
  akira.addTaskDetails({ title: "Replace the sink", projectId: pid });
  const task = akira.getState().tasks.find((t) => t.title === "Replace the sink");
  if (task) akira.toggleTask(task.id);
});

describe("while the project is still going", () => {
  it("is described in the present tense, unchanged", () => {
    // The positive scenario, and the guard for everything below: the defect is
    // about the *other* branch, so this has to keep working or the fix is just
    // a deletion.
    expect(projectUnderstanding()?.status).toBe("Active");
    expect(systemInstruction()).toContain(`The user is actively building ${PROJECT}.`);
  });
});

describe("once its arc has completed", () => {
  it("actually reaches a non-Active status", () => {
    // Without this the assertions below would pass on an understanding that had
    // simply stayed Active, testing nothing.
    setArcStatus("Completed");
    expect(projectUnderstanding()?.status).toBe("Completed");
  });

  it("is no longer described as something the user is building", () => {
    setArcStatus("Completed");

    const instruction = systemInstruction();
    expect(instruction).not.toContain(`The user is actively building ${PROJECT}`);
    expect(instruction).not.toContain("actively building");
  });

  it("says so, in the prompt the model receives", () => {
    setArcStatus("Completed");

    const instruction = systemInstruction();
    expect(instruction).toContain(
      `The user's project ${PROJECT} is completed and no longer active.`,
    );
    expect(instruction).toContain("Status: Completed");
  });

  it("keeps the project and everything behind it", () => {
    setArcStatus("Completed");

    // Retiring a claim must not erase the history that supports it.
    const u = projectUnderstanding();
    expect(u).toBeDefined();
    expect(u!.supportingMemoryIds.length).toBeGreaterThan(0);
    expect(u!.supportingStoryIds.length).toBeGreaterThan(0);
    expect(u!.confidence).toBeDefined();

    // And the project is still named to the model, rather than dropped.
    expect(systemInstruction()).toContain(PROJECT);
  });
});

describe("once its arc has been archived", () => {
  it("uses the archived wording rather than the completed one", () => {
    setArcStatus("Archived");
    expect(projectUnderstanding()?.status).toBe("Archived");

    const instruction = systemInstruction();
    expect(instruction).toContain(
      `The user's project ${PROJECT} is archived and no longer active.`,
    );
    expect(instruction).toContain("Status: Archived");
    expect(instruction).not.toContain("actively building");
  });
});

describe("a note the user deleted", () => {
  it("stops being described as something they are learning", () => {
    // The deleted-entity half that reaches the understanding layer today.
    // `NOTE_DELETED` is translated into the memory stream, so the story behind
    // the knowledge understanding is archived and `determineStatus` follows --
    // which only reaches the model because the serializer now reads status.
    // Before that it read "The user is actively learning ...", about a note
    // that no longer existed.
    akira.addNote({ title: "RISC-V pipeline hazards", content: "cache and hazard notes" });

    const before = understandingEngine
      .getUnderstandings()
      .find((u) => u.canonicalKey.startsWith("knowledge:"));
    // The guard: the note has to have produced a knowledge understanding, and
    // an active one, or the assertions below hold against nothing. An untitled
    // note produces none at all, which is how this was first written by mistake.
    expect(before, "no knowledge understanding was produced").toBeDefined();
    expect(before!.status).toBe("Active");

    const note = akira.getState().notes.find((n) => n.title === "RISC-V pipeline hazards");
    expect(note).toBeDefined();
    akira.deleteNote(note!.id);

    const after = understandingEngine
      .getUnderstandings()
      .find((u) => u.canonicalKey.startsWith("knowledge:"));
    expect(after).toBeDefined();
    expect(after!.status).not.toBe("Active");

    const block = getUnderstandingContext();
    expect(block).not.toContain("actively learning");
    expect(block).toContain("no longer active");

    // And the subject is still named rather than erased: a deleted note is
    // still something that happened.
    expect(block).toContain("Risc V Pipeline Hazards");
  });
});

describe("a project the user deleted, with another still running", () => {
  it("is retired without retiring the one that is still going", () => {
    // U1's project half, end to end, and an integration of three separate
    // changes: the `project_deleted` translator that puts deletion in the
    // stream, the context-rules filter that keeps a deleted project out of the
    // stories and goals blocks, and the serializer reading status here.
    //
    // The second project is the point. With only the deleted one, the prompt
    // looks clean for the wrong reason -- `classifyWorkspaceIntent` matches
    // against *current* project names, so a deleted project cannot make the
    // prompt workspace-relevant and `filterUnderstandings` drops it before the
    // serializer is ever asked. A surviving project restores relevance and the
    // deleted one comes back into scope, which is where the claim used to be
    // "The user is actively building Kitchen Renovation."
    const gone = akira.getState().projects.find((p) => p.name === PROJECT);
    expect(gone, "the seeded project is missing").toBeDefined();

    akira.addProject({ name: "Garden Beds" });
    akira.deleteProject(gone!.id);

    const deleted = understandingEngine.getUnderstandings().find((u) => u.label === PROJECT);
    const surviving = understandingEngine
      .getUnderstandings()
      .find((u) => u.label === "Garden Beds");

    // Guards: both understandings must exist, or the assertions below are
    // about nothing. The deleted one must genuinely have left Active.
    expect(deleted, "the deleted project's understanding vanished").toBeDefined();
    expect(surviving, "the surviving project has no understanding").toBeDefined();
    expect(deleted!.status).not.toBe("Active");
    expect(surviving!.status).toBe("Active");

    // Named after the *surviving* project on purpose. Asking about the deleted
    // one makes the prompt non-workspace-relevant, `filterUnderstandings` drops
    // every Project understanding, and the assertions below would pass because
    // nothing was rendered at all rather than because the claim was retired.
    const instruction = systemInstruction("how is Garden Beds going");
    expect(instruction).toContain(
      `The user's project ${PROJECT} is archived and no longer active.`,
    );
    expect(instruction).not.toContain(`The user is actively building ${PROJECT}`);

    // The still-running project keeps its present tense: this retires one
    // claim, not the category.
    expect(instruction).toContain("The user is actively building Garden Beds.");

    // And the deleted project is still named. It happened; it is simply over.
    expect(instruction).toContain(PROJECT);
  });
});
