/**
 * A project understanding must name the project, not its id.
 *
 * `serializeUnderstanding` derived its display name from
 * `canonicalKey.split(":")[1]`, which is right only when the key happens to be
 * words. `project:<uuid>` is a *correct* key -- stable across renames, and it
 * aggregates every memory about one project -- but rendering it handed the
 * model this, the title-caser having split the uuid on its dashes:
 *
 *   Project
 *   • 95880953 4989 45db 8a3f Ff18d611964a
 *   The user is actively building 95880953 4989 45db 8a3f Ff18d611964a.
 *
 * So the fix is not a new key. It is a `label`: the key identifies, the label
 * displays. The name is already on the event -- `reality-adapter.buildMetadata`
 * spreads the platform payload into metadata and `ProjectPayload` is
 * `{ id, name }` -- so nothing new is recorded to get it.
 *
 * WHAT THESE CASES GUARD AGAINST
 *
 * The uuid assertion is written against the id actually generated at runtime
 * rather than a uuid-shaped pattern, so it cannot pass by the id merely looking
 * different from what was expected. Each case also asserts that an
 * understanding was produced at all: every claim below is about the content of
 * a fragment, and would hold vacuously if the rule stopped emitting one.
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
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { serializeUnderstanding } = await import("../src/genesis/understanding/serializer");

const PROJECT = "Chip Design Course";

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  understandingEngine.initialize();
}

/** A project with real activity against it, as a user would produce. */
function projectWithWork(name: string): string {
  akira.addProject({ name });
  const pid = akira.getState().lastProjectId as string;
  for (const title of ["Read chapter 3", "Do the cache lab"]) {
    akira.addTaskDetails({ title, projectId: pid });
    const task = akira.getState().tasks.find((t) => t.title === title);
    if (task) akira.toggleTask(task.id);
  }
  return pid;
}

const projectUnderstanding = (): Understanding | undefined =>
  understandingEngine.getUnderstandings().find((u) => u.category === "Project");

beforeEach(() => {
  freshWorkspace();
});

describe("a project understanding", () => {
  it("is keyed on the project id, which is what makes the label necessary", () => {
    const pid = projectWithWork(PROJECT);
    const u = projectUnderstanding();

    expect(u).toBeDefined();
    // The key stays the id on purpose: it survives a rename and gathers every
    // memory about the project. It is simply not something to show anyone.
    expect(u!.canonicalKey).toBe(`project:${pid}`);
  });

  it("tells the model the project's name and never its id", () => {
    const pid = projectWithWork(PROJECT);
    const u = projectUnderstanding();
    expect(u).toBeDefined();

    const text = serializeUnderstanding(u!);
    expect(text).toContain(PROJECT);
    expect(text).toContain(`The user is actively building ${PROJECT}.`);

    // Against the id generated in this run, not a uuid-shaped pattern.
    expect(text).not.toContain(pid);
    // The rendered form too: the title-caser split the id on its dashes, so
    // the raw id never appeared in the output that was wrong.
    for (const segment of pid.split("-")) {
      expect(text.toLowerCase()).not.toContain(segment.toLowerCase());
    }
  });

  it("still names the project, never the id, after a rename", () => {
    const pid = projectWithWork(PROJECT);
    akira.updateProject(pid, { name: "VLSI Course" });

    const renamed = projectUnderstanding();
    expect(renamed).toBeDefined();
    // The key does not move, which is the point of keying on the id.
    expect(renamed!.canonicalKey).toBe(`project:${pid}`);

    // Deliberately not asserting *which* name. A rename does not reach the
    // graph today -- `PROJECT_UPDATED` carries the new name into the durable
    // stream but is never promoted to a validated Memory, and these rules read
    // validated memories. Pinning "Chip Design Course" here would turn that
    // promotion boundary into a rule, and would fail the day someone correctly
    // promotes the event. What must hold either way is that a human-readable
    // name is shown and the id is not.
    const text = serializeUnderstanding(renamed!);
    expect([PROJECT, "VLSI Course"]).toContain(renamed!.label);
    for (const segment of pid.split("-")) {
      expect(text.toLowerCase()).not.toContain(segment.toLowerCase());
    }
  });

  it("carries the renamed project's name in the durable stream", () => {
    // The other half of the boundary above, asserted so the comment is not the
    // only record of it: the name is present in the event, and the gap is
    // promotion rather than the payload.
    const pid = projectWithWork(PROJECT);
    akira.updateProject(pid, { name: "VLSI Course" });

    const updated = akira.getState().memories.find((e) => e.eventType === "project_updated");
    expect(updated).toBeDefined();
    expect((updated!.metadata as Record<string, unknown>).name).toBe("VLSI Course");
  });

  it("survives reconstruction", () => {
    projectWithWork(PROJECT);
    memoryService.reconstructRuntimeMemory();

    const u = projectUnderstanding();
    expect(u).toBeDefined();
    expect(serializeUnderstanding(u!)).toContain(PROJECT);
  });

  it("leaves an understanding whose key is already words alone", () => {
    // `value:honesty` carries no label, so the serializer must still derive the
    // name from the key. The fallback is the old behaviour, not a blank.
    akira.addNote("I value honesty");

    const value = understandingEngine.getUnderstandings().find((u) => u.category === "Value");
    expect(value).toBeDefined();
    expect(value!.label).toBeUndefined();
    expect(serializeUnderstanding(value!)).toContain("The user values Honesty.");
  });
});
