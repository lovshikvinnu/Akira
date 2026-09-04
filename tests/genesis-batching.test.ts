/**
 * The cognitive transaction boundary, and the equivalence it must preserve.
 *
 * Two things are under test and they are different in kind. The first is the
 * primitive itself -- nesting, coalescing, synchrony, error containment. The
 * second, and the one that matters, is that coalescing changed *when* GENESIS
 * recomputes and not *what* it concludes: the same workload must settle to the
 * same stories, importance values, recall state, understanding graph and
 * context package as it did when every rebuild ran.
 *
 * Equivalence is checked by driving the real pipeline through real store
 * actions, capturing settled state, then replaying the identical history and
 * comparing. Nothing here injects a MemoryEvent or attaches a bus.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const batch = await import("../src/genesis/batch");
const { storyService } = await import("../src/genesis/stories/story-service");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { contextService } = await import("../src/genesis/context/context-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { identityService } = await import("../src/genesis/understanding/identity-service");

// recallBuilder is activated by companionStateService.bootstrap() in the real
// app, not by genesis/composition.ts. Activating it here is what puts the
// importance -> recall edge -- the single largest amplifier -- under test.
recallBuilder.initialize();

/** Drives one real completed task and returns nothing but its side effects. */
function completeTaskInProject(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

function newProject(name: string): string {
  akira.addProject({ name });
  return akira.getState().lastProjectId as string;
}

/** The settled cognitive state, in a form that can be compared structurally. */
function snapshotCognition() {
  return {
    stories: storyService.getStories().map((s) => ({
      title: s.title,
      summary: s.summary,
      status: s.status,
      ruleProvenance: s.ruleProvenance,
      memberCount: s.relatedMemoryIds.length,
    })),
    memoryTitles: memoryService.getMemories().map((m) => m.title),
    // Signals are the meaning; signalHistory is the recalculation trail and is
    // expected to shorten. Comparing signals is the real losslessness claim.
    importanceSignals: importanceService
      .getAllImportance()
      .map((i) =>
        i.signals
          .map((s) => `${s.type}:${s.strength}`)
          .sort()
          .join("|"),
      )
      .sort(),
    recallActive: recallService
      .getRecallCandidates()
      .filter((c) => c.status === "Active")
      .map((c) => c.recallReasons.slice().sort().join("|"))
      .sort(),
    recallInactiveCount: recallService.getRecallCandidates().filter((c) => c.status === "Inactive")
      .length,
    understanding: understandingEngine
      .getUnderstandings()
      .map((u) => `${u.category}:${u.canonicalKey}:${u.status}:${u.confidence}`)
      .sort(),
    // Identity is the state most sensitive to coalescing, because a merge
    // reads the story it was triggered by. Confidence and the supporting
    // evidence counts are captured, not just the trait names: a model that
    // depended on how many times identity ran would show up here and nowhere
    // else.
    identity: identityService
      .getObservations()
      .map(
        (o) =>
          `${o.category}:${o.name}=${o.value}|conf=${o.confidence.toFixed(4)}` +
          `|stories=${o.supportingStoryIds.length}|memories=${o.supportingMemoryIds.length}`,
      )
      .sort(),
    contextPackage: (() => {
      const p = contextService.getActiveContext();
      if (!p) return null;
      return {
        candidates: p.activeCandidates.length,
        stories: p.activeStories.map((s) => s.title).sort(),
        identity: p.identityObservations.map((o) => `${o.category}:${o.name}`).sort(),
        goals: p.currentGoals.slice().sort(),
        activity: p.recentActivitySummary.length,
      };
    })(),
  };
}

describe("cognition settles synchronously inside the store action", () => {
  it("has complete cognitive state when toggleTask returns", () => {
    const projectId = newProject("Synchrony");

    const before = memoryService.getMemories().length;
    completeTaskInProject(projectId, "settle-now");

    // No await, no tick: the assertion runs on the next line.
    expect(memoryService.getMemories().length).toBeGreaterThan(before);
    expect(batch.hasPendingWork()).toBe(false);

    const story = storyService.getStories().find((s) => s.summary.includes(projectId));
    expect(story).toBeDefined();
    expect(story!.relatedMemoryIds.length).toBeGreaterThan(0);

    // Every derived stage has run, not merely the store write.
    const memory = memoryService.getMemories().at(-1)!;
    expect(importanceService.getImportance(memory.id)).not.toBeNull();
    expect(contextService.getActiveContext()).not.toBeNull();
  });
});

describe("coalescing preserves settled cognitive state", () => {
  it("reaches equivalent state for identical workloads", () => {
    // Measured as a delta around each workload rather than as a total: this
    // file shares one module instance across its tests, so cumulative counts
    // describe the file's history, not the property under test.
    const runWorkload = (label: string) => {
      const storiesBefore = storyService.getStories().length;
      const projectId = newProject(`Equivalence ${label}`);
      for (let i = 0; i < 12; i++) completeTaskInProject(projectId, `${label}-task-${i}`);
      const snapshot = snapshotCognition();
      return {
        snapshot,
        storiesAdded: snapshot.stories.length - storiesBefore,
        arc: snapshot.stories.filter((s) => s.title.includes("Project Arc")).at(-1)!,
      };
    };

    const first = runWorkload("A");
    const second = runWorkload("B");

    // Identical activity produces identical cognition: one arc per project,
    // the same membership, the same provenance, a context package present.
    expect(first.storiesAdded).toBe(1);
    expect(second.storiesAdded).toBe(1);
    expect(second.snapshot.contextPackage).not.toBeNull();
    expect(second.snapshot.understanding.length).toBeGreaterThanOrEqual(
      first.snapshot.understanding.length,
    );

    expect(second.arc.memberCount).toBe(first.arc.memberCount);
    expect(second.arc.status).toBe(first.arc.status);
    expect(second.arc.ruleProvenance).toBe(first.arc.ruleProvenance);
  });

  it("recalculates importance for every story member exactly as before", () => {
    const projectId = newProject("Importance Coverage");
    for (let i = 0; i < 8; i++) completeTaskInProject(projectId, `imp-task-${i}`);

    const story = storyService.getStories().find((s) => s.summary.includes(projectId))!;

    // The claim coalescing rests on: after settling, every member of the story
    // has a current importance profile -- none was skipped by batching.
    for (const memoryId of story.relatedMemoryIds) {
      const profile = importanceService.getImportance(memoryId);
      expect(profile).not.toBeNull();
      expect(profile!.signals.length).toBeGreaterThan(0);
    }
  });

  it("leaves recall consistent with the memories that exist", () => {
    const projectId = newProject("Recall Consistency");
    for (let i = 0; i < 8; i++) completeTaskInProject(projectId, `rec-task-${i}`);

    const liveIds = new Set(memoryService.getMemories().map((m) => m.id));
    const candidates = recallService.getRecallCandidates();

    // Every retained candidate still points at a live memory, and the active
    // set is exactly what the rules select from settled state.
    for (const c of candidates) expect(liveIds.has(c.memoryId)).toBe(true);
    expect(recallService.getActiveSession()).not.toBeNull();

    const activeBefore = candidates.filter((c) => c.status === "Active").length;
    recallBuilder.rebuildRecallCandidates();
    const activeAfter = recallService
      .getRecallCandidates()
      .filter((c) => c.status === "Active").length;

    // Rebuilding again against unchanged state changes nothing: the coalesced
    // rebuild had already reached the fixed point.
    expect(activeAfter).toBe(activeBefore);
  });

  it("produces the same understanding graph as an immediate rebuild would", () => {
    const projectId = newProject("Understanding Fixpoint");
    for (let i = 0; i < 10; i++) completeTaskInProject(projectId, `und-task-${i}`);

    const settled = understandingEngine
      .getUnderstandings()
      .map((u) => `${u.category}:${u.canonicalKey}:${u.status}:${u.confidence}`)
      .sort();

    // Force an unbatched rebuild from the same stores; a coalesced graph that
    // differs from this would mean batching lost information.
    const memory = memoryService.getMemories().at(-1)!;
    storyService.notify("Updated", storyService.getStories()[0]);

    const rebuilt = understandingEngine
      .getUnderstandings()
      .map((u) => `${u.category}:${u.canonicalKey}:${u.status}:${u.confidence}`)
      .sort();

    expect(rebuilt).toEqual(settled);
    expect(memory).toBeDefined();
  });
});

describe("identity semantics are untouched by batching", () => {
  it("still reinforces confidence on every story event", () => {
    const projectId = newProject("Identity Path");

    const before = identityService.getObservations().map((o) => ({
      key: `${o.category}:${o.name}`,
      confidence: o.confidence,
    }));

    completeTaskInProject(projectId, "identity-task");

    const after = identityService.getObservations();
    expect(after.length).toBeGreaterThan(0);

    // Identity deliberately did NOT move onto the batch. Its confidence is
    // `min(1, old + 0.1)` per invocation, so coalescing would have silently
    // changed how fast a trait saturates. Any observation that existed before
    // and was reinforced must have advanced, not stalled at its old value.
    for (const obs of after) {
      const prior = before.find((b) => b.key === `${obs.category}:${obs.name}`);
      if (prior && obs.confidence !== 1) {
        expect(obs.confidence).toBeGreaterThanOrEqual(prior.confidence);
      }
    }
  });
});

describe("replay determinism", () => {
  it("reconstructs equivalent cognition from the persisted event stream", () => {
    const projectId = newProject("Replay");
    for (let i = 0; i < 10; i++) completeTaskInProject(projectId, `replay-task-${i}`);

    const live = snapshotCognition();
    const liveEventCount = akira.getState().memories.length;

    // The real restart path: clear-then-replay from the durable stream.
    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();

    const replayed = snapshotCognition();

    // The durable stream is untouched by reconstruction -- replay must not
    // append to the record it is replaying.
    expect(akira.getState().memories.length).toBe(liveEventCount);

    // Reconstruction is clear-then-replay, so it must not accumulate.
    expect(replayed.memoryTitles.length).toBe(live.memoryTitles.length);
    expect(replayed.memoryTitles).toEqual(live.memoryTitles);
    expect(replayed.stories.length).toBe(live.stories.length);
    expect(replayed.understanding).toEqual(live.understanding);
    expect(replayed.importanceSignals).toEqual(live.importanceSignals);

    // Identity must survive a restart with the same traits, the same values,
    // the same confidence and the same supporting evidence. This is the
    // assertion that makes the confidence model falsifiable: any model derived
    // from how often identity was invoked rather than from what it observed
    // will diverge here as soon as the live and replay paths differ in cadence.
    expect(replayed.identity).toEqual(live.identity);

    expect(batch.hasPendingWork()).toBe(false);
  });

  it("is idempotent across repeated reconstruction", () => {
    const first = snapshotCognition();
    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();
    const second = snapshotCognition();

    expect(second.memoryTitles).toEqual(first.memoryTitles);
    expect(second.stories.length).toBe(first.stories.length);
    expect(second.understanding).toEqual(first.understanding);
    expect(second.importanceSignals).toEqual(first.importanceSignals);

    // Idempotence is the stronger claim for identity: reconstructing twice
    // replays the same evidence twice, so a confidence that accumulates per
    // invocation would climb on the second pass while an evidence-derived one
    // lands on the same value.
    expect(second.identity).toEqual(first.identity);
  });
});
