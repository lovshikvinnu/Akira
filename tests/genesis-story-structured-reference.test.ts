/**
 * A project arc's link to its project, and where that link lives.
 *
 * `story-rules` has the project id in hand when it builds an arc. It wrote the
 * id into a sentence -- "…for Project ID: <uuid>." -- and two separate
 * consumers read it back out of that sentence:
 *
 *   story-rules, Project Clustering Rule   `summary.includes("ID: " + id)`
 *                                          runs for every memory belonging to
 *                                          a project
 *   understanding/rules, Project rule      two regexes over the summary, then
 *                                          a fallback that splits the title
 *
 * Both now read `Story.relatedProjectId`. The prose is still produced, because
 * a person reads it; it is no longer what code decides on.
 *
 * THE TEST THAT MATTERS
 * ---------------------
 * "the summary can be rewritten and nothing cognitive moves". Asserting that
 * the id is *found* proves very little -- it was found before. Asserting that
 * it is still found when the sentence no longer contains it is the only way to
 * show which of the two sources is actually being read.
 *
 * NO LEGACY FORMAT EXISTS, AND THAT IS MEASURABLE
 * -----------------------------------------------
 * Stories are never persisted. `storyCache` is a plain in-process array rebuilt
 * from the event stream on every reconstruction, so every story that has ever
 * existed was produced by the current rules. The fallbacks are kept for
 * `registerStoryRule`, which is public and whose `newStoryData` carries neither
 * field nor sentence by obligation -- not for old data, of which there is none.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { storyRules } = await import("../src/genesis/stories/story-rules");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { isProjectArc } = await import("../src/genesis/stories/story-identity");
const { candidateService } = genesis;

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

let seq = 0;
function completeTask(projectId: string): void {
  const title = `sr-${seq++}`;
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (task) akira.toggleTask(task.id);
}

/** A project with enough activity to have produced an arc. */
function projectWithArc(name: string, tasks = 3): string {
  akira.addProject({ name });
  const projectId = akira.getState().lastProjectId as string;
  for (let i = 0; i < tasks; i++) completeTask(projectId);
  return projectId;
}

const arcFor = (projectId: string) =>
  storyService.getStories().find((s) => s.relatedProjectId === projectId);

const projectKeys = () =>
  understandingEngine
    .getUnderstandings()
    .filter((u) => u.category === "Project")
    .map((u) => u.canonicalKey);

beforeEach(() => {
  freshWorkspace();
});

describe("a project arc carries the id it is about", () => {
  it("records it at creation, alongside the sentence", () => {
    const projectId = projectWithArc("Aviation Co");
    const arc = arcFor(projectId);

    expect(arc, "the arc did not carry its project id").toBeDefined();
    expect(arc!.relatedProjectId).toBe(projectId);
    expect(isProjectArc(arc!)).toBe(true);
    // The sentence is still produced. It is for people, not for code.
    expect(arc!.summary).toContain(`Project ID: ${projectId}`);
  });

  it("leaves the reflections arc with no project", () => {
    akira.addNote({ content: "a free-standing thought" });
    const reflections = storyService.getStories().find((s) => s.kind === "Reflections");
    expect(reflections).toBeDefined();
    expect(reflections!.relatedProjectId ?? null).toBeNull();
  });

  it("keeps two projects' arcs distinct", () => {
    const first = projectWithArc("First");
    const second = projectWithArc("Second");
    expect(first).not.toBe(second);
    expect(arcFor(first)!.id).not.toBe(arcFor(second)!.id);
  });
});

describe("the summary is no longer load-bearing", () => {
  /**
   * Each case rewrites the summary to something a person might reasonably
   * prefer, containing no id at all, and requires cognition not to move. Under
   * the previous implementation every one of these would have broken a link.
   */
  const REWRITTEN = "What has been happening on this project.";

  it("still clusters a later memory into the same arc", () => {
    const projectId = projectWithArc("Aviation Co");
    const arc = arcFor(projectId)!;
    const membersBefore = arc.relatedMemoryIds.length;

    storyService.updateStory(arc.id, { summary: REWRITTEN });
    expect(storyService.getStories().find((s) => s.id === arc.id)!.summary).not.toContain("ID:");

    completeTask(projectId);

    const after = storyService.getStories().find((s) => s.id === arc.id)!;
    expect(
      after.relatedMemoryIds.length,
      "a renamed summary split the project into a second arc",
    ).toBeGreaterThan(membersBefore);
    expect(storyService.getStories().filter((s) => s.relatedProjectId === projectId).length).toBe(
      1,
    );
  });

  it("still links the ARC ITSELF to its project in the understanding graph", () => {
    // Asserted on `supportingStoryIds`, not on the key existing.
    //
    // The Project rule scans memories before it scans stories, and the memory
    // scan alone produces `project:<id>` from `memory.relatedProjectId`. So
    // asserting the key is present passes whether or not the story was linked
    // -- it did, against a build with the story path reverted, until this was
    // rewritten. The story link is the thing the summary used to carry.
    const projectId = projectWithArc("Aviation Co");
    const arc = arcFor(projectId)!;

    const before = understandingEngine
      .getUnderstandings()
      .find((u) => u.canonicalKey === `project:${projectId}`);
    expect(before?.supportingStoryIds).toContain(arc.id);

    storyService.updateStory(arc.id, { summary: REWRITTEN });
    completeTask(projectId);

    const after = understandingEngine
      .getUnderstandings()
      .find((u) => u.canonicalKey === `project:${projectId}`);
    expect(after, "the project understanding disappeared entirely").toBeDefined();
    expect(
      after!.supportingStoryIds,
      "the arc stopped supporting its own project once the sentence changed",
    ).toContain(arc.id);
  });

  it("does not invent a project named after an event type", () => {
    // The fallback this replaces. `story.title.split(":")[1]` on
    // "Project Arc: Project Created" yields "Project Created" -- the
    // translator's fixed label -- and would have become a project id.
    const projectId = projectWithArc("Aviation Co");
    const arc = arcFor(projectId)!;
    expect(arc.title).toBe("Project Arc: Project Created");

    storyService.updateStory(arc.id, { summary: REWRITTEN });
    completeTask(projectId);

    const keys = projectKeys();
    expect(keys).toContain(`project:${projectId}`);
    expect(keys, "a display label was used as a project id").not.toContain(
      "project:Project Created",
    );
  });

  it("matches the clustering rule on the id, asked directly", () => {
    const projectId = projectWithArc("Aviation Co");
    const arc = arcFor(projectId)!;
    const rule = storyRules.find((r) => r.name === "Project Clustering Rule")!;
    const memory = memoryService.getMemories().find((m) => m.relatedProjectId === projectId)!;

    const stripped = { ...arc, summary: REWRITTEN };
    const result = rule.evaluateMemory(memory, [stripped]);

    expect(result.shouldCluster).toBe(true);
    expect(result.storyId, "the rule fell back to prose and missed the arc").toBe(arc.id);
    expect(result.newStoryData, "a duplicate arc would have been created").toBeUndefined();
  });
});

describe("the fallbacks still work for a story that carries no id", () => {
  /**
   * `registerStoryRule` is public and `newStoryData.relatedProjectId` is
   * optional, so an arc can exist without the field. That is the only reason
   * the summary parse is retained, and a fallback nobody exercises is a
   * fallback nobody notices breaking.
   */
  it("falls back to the summary when the field is absent", () => {
    const projectId = projectWithArc("Aviation Co");
    const arc = arcFor(projectId)!;
    const rule = storyRules.find((r) => r.name === "Project Clustering Rule")!;
    const memory = memoryService.getMemories().find((m) => m.relatedProjectId === projectId)!;

    const legacyShape = { ...arc, relatedProjectId: undefined };
    const result = rule.evaluateMemory(memory, [legacyShape]);

    expect(result.shouldCluster).toBe(true);
    expect(result.storyId).toBe(arc.id);
  });

  it("creates a new arc when neither the field nor the sentence matches", () => {
    const projectId = projectWithArc("Aviation Co");
    const arc = arcFor(projectId)!;
    const rule = storyRules.find((r) => r.name === "Project Clustering Rule")!;
    const memory = memoryService.getMemories().find((m) => m.relatedProjectId === projectId)!;

    const unrelated = { ...arc, relatedProjectId: undefined, summary: "no identifier here" };
    const result = rule.evaluateMemory(memory, [unrelated]);

    expect(result.shouldCluster).toBe(true);
    expect(result.storyId).toBeUndefined();
    expect(result.newStoryData?.relatedProjectId).toBe(projectId);
  });
});

describe("it survives reconstruction", () => {
  it("rebuilds arcs carrying their project ids", () => {
    const first = projectWithArc("First");
    const second = projectWithArc("Second");
    akira.addNote({ content: "a thought" });

    memoryService.reconstructRuntimeMemory();

    expect(arcFor(first), "an arc lost its project id on replay").toBeDefined();
    expect(arcFor(second)).toBeDefined();
    expect(projectKeys()).toContain(`project:${first}`);
    expect(projectKeys()).toContain(`project:${second}`);
  });

  it("is idempotent across repeated reconstruction", () => {
    const projectId = projectWithArc("Aviation Co");
    memoryService.reconstructRuntimeMemory();
    const once = storyService.getStories().map((s) => s.relatedProjectId ?? null);
    memoryService.reconstructRuntimeMemory();
    const twice = storyService.getStories().map((s) => s.relatedProjectId ?? null);

    expect(twice).toEqual(once);
    expect(once).toContain(projectId);
  });
});

describe("the story-scan id parsers that no producer feeds", () => {
  /**
   * Measurement, not deletion. `understanding/rules` also parses `Goal ID:` and
   * `Knowledge ID:` out of story summaries, and nothing produces either string:
   * `story-rules` is the only story producer, it emits exactly two summaries,
   * and `registerStoryRule` has no callers.
   *
   * Pinned here rather than removed because deleting dead code and changing a
   * live reference path are different risks and should not land together. If a
   * producer is ever added, these fail and say what to reconsider.
   */
  it("produces exactly two summary shapes", () => {
    projectWithArc("Aviation Co");
    akira.addNote({ content: "a free-standing thought" });

    const summaries = storyService.getStories().map((s) => s.summary);
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    for (const summary of summaries) {
      const isProjectSummary =
        /^Evolving narrative tracking milestones, tasks, and reflections for Project ID: /.test(
          summary,
        );
      const isReflectionsSummary = summary.startsWith("A consolidated narrative clustering");
      expect(isProjectSummary || isReflectionsSummary, `unexpected summary: ${summary}`).toBe(true);
    }
  });

  it("never produces a Goal ID: or Knowledge ID: summary", () => {
    projectWithArc("Aviation Co");
    akira.addNote({ content: "a free-standing thought" });

    for (const story of storyService.getStories()) {
      expect(story.summary).not.toMatch(/Goal ID:/i);
      expect(story.summary).not.toMatch(/Knowledge ID:/i);
    }
  });

  it("and no story satisfies the gates guarding those parsers", () => {
    projectWithArc("Aviation Co");
    akira.addNote({ content: "a free-standing thought" });

    for (const story of storyService.getStories()) {
      const text = `${story.title} ${story.summary}`.toLowerCase();
      expect(text.includes("goal"), `a story would enter the Goal scan: ${story.title}`).toBe(
        false,
      );
      expect(text.includes("knowledge")).toBe(false);
    }
  });
});
