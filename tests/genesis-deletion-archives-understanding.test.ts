/**
 * Deleting something stops AKIRA describing it as current work.
 *
 * `serializeUnderstanding` knows how to describe an inactive understanding --
 * "The user's project X is archived and no longer active" -- and nothing could
 * ever hand it one. `determineStatus` reads the status of the stories an
 * understanding was built from, and nothing in `src/` transitions a story's
 * status, so every understanding was "Active" for the life of the process:
 *
 *     before delete   The user is actively building Pilot Licence.
 *                     The user is actively learning Aviation.
 *     after delete    unchanged
 *
 * `PROJECT_DELETED` and `NOTE_DELETED` were published by the store and had no
 * translator, so `reality-adapter` dropped them and GENESIS was never told at
 * all. They are translated now, classed Core, and become memories like any
 * other event.
 *
 * WHY THE STREAM AND NOT THE WORKSPACE
 * -----------------------------------
 * Asking `getWorkspaceProvider` whether the subject still exists was tried
 * first and failed twice, which is why the event chain exists rather than a
 * one-line lookup. The graph is rebuilt on a flusher and cached, so with no
 * event a deletion triggered no rebuild and the status stayed Active. And the
 * rebuild that does run happens while the store action is still in flight:
 * measured, a note read as already deleted at the moment its own fragment was
 * built, because it was not in the workspace yet. That version archived live
 * knowledge areas -- worse than the bug.
 *
 * A deletion memory is a fact in the append-only stream: there or not,
 * whatever order events arrived in, and still there after a reload.
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
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { serializeUnderstanding } = await import("../src/genesis/understanding/serializer");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

function project(name: string): string {
  akira.addProject({ name });
  const id = akira.getState().lastProjectId as string;
  akira.addTaskDetails({ title: `task for ${name}`, projectId: id });
  const task = akira.getState().tasks.find((t) => t.title === `task for ${name}`);
  if (task) akira.toggleTask(task.id);
  return id;
}

function note(title: string): string {
  akira.addNote({ title, content: `notes about ${title}` });
  const created = akira.getState().notes.find((n) => n.title === title);
  if (!created) throw new Error(`store action did not create the note "${title}"`);
  return created.id;
}

const understandingFor = (prefix: string) =>
  understandingEngine.getUnderstandings().find((u) => u.canonicalKey.startsWith(prefix));

const sentenceFor = (prefix: string) => {
  const u = understandingFor(prefix);
  if (!u) return "";
  return serializeUnderstanding(u)
    .split("\n")
    .filter((l) => l.startsWith("The user"))
    .join(" ");
};

beforeEach(() => {
  freshWorkspace();
});

describe("a deleted project is described as archived", () => {
  it("stops being something the user is actively building", () => {
    const id = project("Pilot Licence");
    // The precondition. Without it, a build producing no project understanding
    // would pass everything below.
    expect(understandingFor("project:")?.status, "no project understanding").toBe("Active");
    expect(sentenceFor("project:")).toContain("actively building");

    akira.deleteProject(id);

    expect(understandingFor("project:")?.status).toBe("Archived");
    expect(sentenceFor("project:"), "still described as current work").not.toContain(
      "actively building",
    );
    expect(sentenceFor("project:")).toContain("archived and no longer active");
  });

  it("leaves a project the user still has alone", () => {
    // The positive control. Archiving everything would pass the case above.
    const doomed = project("Kitchen Remodel");
    project("Pilot Licence");

    akira.deleteProject(doomed);

    const live = understandingEngine
      .getUnderstandings()
      .filter((u) => u.canonicalKey.startsWith("project:") && u.status === "Active");
    expect(live.length, "a surviving project was archived too").toBe(1);
  });

  it("keeps every memory the project produced", () => {
    const id = project("Pilot Licence");
    const before = memoryService.getMemories().length;
    expect(before).toBeGreaterThan(0);

    akira.deleteProject(id);

    // A deletion appends; it never removes. The count rises by the deletion
    // memory itself and nothing is lost.
    expect(memoryService.getMemories().length, "history was erased").toBeGreaterThanOrEqual(before);
    expect(
      memoryService.getMemories().some((m) => m.eventType === "project_deleted"),
      "the deletion never reached GENESIS",
    ).toBe(true);
  });

  it("is still archived after a reload", () => {
    const id = project("Pilot Licence");
    akira.deleteProject(id);
    expect(understandingFor("project:")?.status).toBe("Archived");

    memoryService.reconstructRuntimeMemory();

    expect(
      understandingFor("project:")?.status,
      "the project came back as current work after a reload",
    ).toBe("Archived");
  });
});

describe("a deleted note archives what it taught", () => {
  it("stops being something the user is actively learning", () => {
    const id = note("Aviation");
    expect(understandingFor("knowledge:")?.status, "no knowledge understanding").toBe("Active");
    expect(sentenceFor("knowledge:")).toContain("actively learning");

    akira.deleteNote(id);

    expect(understandingFor("knowledge:")?.status).toBe("Archived");
    expect(sentenceFor("knowledge:")).toContain("archived and no longer active");
  });

  it("waits until every note behind it is gone", () => {
    // A knowledge understanding is keyed on the note's title and aggregates
    // every note sharing it, so one deletion is not enough.
    const first = note("Aviation");
    note("Aviation");
    expect(understandingFor("knowledge:")?.status).toBe("Active");

    akira.deleteNote(first);
    expect(
      understandingFor("knowledge:")?.status,
      "archived while a note behind it still exists",
    ).toBe("Active");

    const second = akira.getState().notes.find((n) => n.title === "Aviation");
    if (second) akira.deleteNote(second.id);

    expect(understandingFor("knowledge:")?.status).toBe("Archived");
  });

  it("leaves a note the user still has alone", () => {
    const doomed = note("Aviation");
    note("Verilog");

    akira.deleteNote(doomed);

    const live = understandingEngine
      .getUnderstandings()
      .filter((u) => u.canonicalKey.startsWith("knowledge:") && u.status === "Active");
    expect(live.length, "a surviving note's knowledge area was archived").toBe(1);
  });
});
