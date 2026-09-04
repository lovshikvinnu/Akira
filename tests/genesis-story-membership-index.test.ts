/**
 * The story membership index must be a projection, never a second opinion.
 *
 * `storyService` keeps `relatedMemoryIds` on each story as canonical state and
 * maintains a `Map<storyId, Set<memoryId>>` beside it so that "does this story
 * hold this memory?" costs a Set probe rather than a scan. Four hot call sites
 * now read the index instead of the array, so any drift between the two would
 * not surface as a crash -- it would surface as a memory silently losing its
 * story, and with it its importance signal, its recall reason and its identity
 * evidence.
 *
 * These tests therefore assert agreement after every path that can change story
 * state, individually rather than only in aggregate:
 *
 *   append, sliding-window eviction, retention forgetMemories, whole-story
 *   removal, maxStories eviction, clearHistory, and a full live-vs-replay run.
 *
 * The invariant is stated once, as `expectIndexMatchesArrays`, and asserted
 * after each.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { storyService } = await import("../src/genesis/stories/story-service");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

recallBuilder.initialize();

/**
 * The invariant: the index holds exactly one entry per live story, and that
 * entry holds exactly that story's members. Both directions matter -- a missing
 * entry loses memories, a stale entry resurrects them.
 */
function expectIndexMatchesArrays(): void {
  const stories = storyService.getStories();
  const index = storyService.getMembershipIndexSnapshot();

  expect(Object.keys(index).sort()).toEqual(stories.map((s) => s.id).sort());

  for (const story of stories) {
    expect(index[story.id].slice().sort()).toEqual(story.relatedMemoryIds.slice().sort());

    // And the read API agrees with the array it projects.
    for (const memoryId of story.relatedMemoryIds) {
      expect(storyService.storyContainsMemory(story.id, memoryId)).toBe(true);
    }
    expect(storyService.storyContainsMemory(story.id, "definitely-not-a-member")).toBe(false);
  }
}

/** `findStoryContainingMemory` must answer what the old scan answered. */
function expectLookupMatchesScan(memoryIds: string[]): void {
  const stories = storyService.getStories();
  for (const memoryId of memoryIds) {
    const viaScan = stories.find((s) => s.relatedMemoryIds.includes(memoryId));
    const viaIndex = storyService.findStoryContainingMemory(memoryId);
    expect(viaIndex?.id).toBe(viaScan?.id);
  }
}

function newProject(name: string): string {
  akira.addProject({ name });
  return akira.getState().lastProjectId as string;
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

describe("membership index tracks every mutation path", () => {
  beforeEach(() => resetRetentionPolicy());
  afterEach(() => resetRetentionPolicy());

  it("is empty and consistent before any activity", () => {
    storyService.clearHistory();
    expect(storyService.getMembershipIndexSnapshot()).toEqual({});
    expectIndexMatchesArrays();
  });

  it("tracks story creation and membership appends", () => {
    const projectId = newProject("Index Append");
    for (let i = 0; i < 6; i++) completeTask(projectId, `append-${i}`);

    const story = storyService.getStories().find((s) => s.summary.includes(projectId))!;
    expect(story.relatedMemoryIds.length).toBeGreaterThan(1);

    expectIndexMatchesArrays();
    expectLookupMatchesScan(story.relatedMemoryIds);
  });

  it("follows the sliding window when a story exceeds maxMemoriesPerStory", () => {
    // The trap an append-only index falls into: addMemoryToStory both appends
    // and drops, so members that aged out must stop being reported.
    setRetentionPolicy({ maxMemoriesPerStory: 4 });

    const projectId = newProject("Index Window");
    for (let i = 0; i < 12; i++) completeTask(projectId, `window-${i}`);

    const story = storyService.getStories().find((s) => s.summary.includes(projectId))!;
    expect(story.relatedMemoryIds.length).toBeLessThanOrEqual(4);

    expectIndexMatchesArrays();

    // Everything the store still knows about, whether or not it is a member.
    expectLookupMatchesScan(memoryService.getMemories().map((m) => m.id));
  });

  it("follows retention eviction through forgetMemories", () => {
    // forgetMemories rewrites relatedMemoryIds in place, bypassing updateStory.
    setRetentionPolicy({ maxMemories: 5 });

    const projectId = newProject("Index Eviction");
    for (let i = 0; i < 20; i++) completeTask(projectId, `evict-${i}`);

    expectIndexMatchesArrays();

    const live = new Set(memoryService.getMemories().map((m) => m.id));
    for (const story of storyService.getStories()) {
      for (const memoryId of story.relatedMemoryIds) {
        expect(live.has(memoryId)).toBe(true);
      }
    }
  });

  it("drops the entry when a story loses its last memory", () => {
    const projectId = newProject("Index Removal");
    for (let i = 0; i < 4; i++) completeTask(projectId, `removal-${i}`);

    const story = storyService.getStories().find((s) => s.summary.includes(projectId))!;
    const storyId = story.id;
    const allMembers = [...story.relatedMemoryIds];

    // Evicting every member removes the story itself; the index must not keep
    // an entry for a story that no longer exists.
    storyService.forgetMemories(allMembers);

    expect(storyService.getStories().some((s) => s.id === storyId)).toBe(false);
    expect(storyService.getMembershipIndexSnapshot()[storyId]).toBeUndefined();
    expect(storyService.findStoryContainingMemory(allMembers[0])).toBeUndefined();
    expectIndexMatchesArrays();
  });

  it("drops entries for stories evicted by maxStories", () => {
    // This eviction notifies nobody and returns its casualties only through
    // trimOldest's return value. An index that ignored it would leak.
    setRetentionPolicy({ maxStories: 2 });

    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      created.push(
        storyService.createStory({
          title: `Evictable ${i}`,
          summary: `story ${i}`,
          status: "Active",
          ruleProvenance: "test",
        }).id,
      );
    }

    expect(storyService.getStories().length).toBeLessThanOrEqual(2);
    expect(Object.keys(storyService.getMembershipIndexSnapshot()).length).toBeLessThanOrEqual(2);

    const survivors = new Set(storyService.getStories().map((s) => s.id));
    for (const id of created) {
      if (!survivors.has(id)) {
        expect(storyService.getMembershipIndexSnapshot()[id]).toBeUndefined();
      }
    }
    expectIndexMatchesArrays();

    storyService.clearHistory();
  });

  it("stays consistent when updateStory patches membership directly", () => {
    // updateStory is public and takes an open patch. The index is maintained
    // there rather than in addMemoryToStory precisely so this path cannot drift.
    const story = storyService.createStory({
      title: "Direct Patch",
      summary: "patched directly",
      status: "Active",
      ruleProvenance: "test",
    });

    storyService.updateStory(story.id, { relatedMemoryIds: ["m1", "m2", "m3"] });
    expect(storyService.storyContainsMemory(story.id, "m2")).toBe(true);
    expectIndexMatchesArrays();

    storyService.updateStory(story.id, { relatedMemoryIds: ["m3"] });
    expect(storyService.storyContainsMemory(story.id, "m1")).toBe(false);
    expect(storyService.storyContainsMemory(story.id, "m3")).toBe(true);
    expectIndexMatchesArrays();

    // A patch that does not mention membership must leave it intact.
    storyService.updateStory(story.id, { status: "Completed" });
    expect(storyService.storyContainsMemory(story.id, "m3")).toBe(true);
    expectIndexMatchesArrays();

    storyService.clearHistory();
  });

  it("clears the index with the cache", () => {
    const projectId = newProject("Index Clear");
    completeTask(projectId, "clear-me");
    expect(Object.keys(storyService.getMembershipIndexSnapshot()).length).toBeGreaterThan(0);

    storyService.clearHistory();
    expect(storyService.getMembershipIndexSnapshot()).toEqual({});
    expectIndexMatchesArrays();
  });
});

describe("membership index survives reconstruction", () => {
  it("rebuilds identically from the persisted event stream", () => {
    const projectId = newProject("Index Replay");
    for (let i = 0; i < 10; i++) completeTask(projectId, `replay-${i}`);

    expectIndexMatchesArrays();

    // Compared per-arc rather than across all stories on purpose. Earlier tests
    // in this file call clearHistory(), so the live cache holds less than the
    // durable stream does -- reconstruction correctly rebuilds every project
    // the stream still remembers, not just this one. The arc under test is the
    // part both sides genuinely share.
    const liveArc = storyService.getStories().find((s) => s.summary.includes(projectId))!;
    const liveMemberCount = liveArc.relatedMemoryIds.length;
    const liveIndexed = storyService.getMembershipIndexSnapshot()[liveArc.id].length;
    expect(liveIndexed).toBe(liveMemberCount);

    // Reconstruction clears and replays through the same mutation paths, so
    // the index needs no replay-specific handling -- this proves it.
    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();

    expectIndexMatchesArrays();

    const replayedArc = storyService.getStories().find((s) => s.summary.includes(projectId))!;
    expect(replayedArc).toBeDefined();
    expect(replayedArc.relatedMemoryIds.length).toBe(liveMemberCount);
    expect(storyService.getMembershipIndexSnapshot()[replayedArc.id].length).toBe(liveMemberCount);

    // The rebuilt index answers the rebuilt arc's membership, id for id.
    for (const memoryId of replayedArc.relatedMemoryIds) {
      expect(storyService.findStoryContainingMemory(memoryId)?.id).toBe(replayedArc.id);
    }
  });

  it("is idempotent across repeated reconstruction", () => {
    const first = storyService.getMembershipIndexSnapshot();
    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();
    const second = storyService.getMembershipIndexSnapshot();

    expectIndexMatchesArrays();
    expect(Object.keys(second).length).toBe(Object.keys(first).length);
  });
});
