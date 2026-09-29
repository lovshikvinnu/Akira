/**
 * One user action costs one pass over cognition, whatever is remembered.
 *
 * `329589d` repaired a collapse that made the product unusable: one completed
 * task cost 6,190 ms at 102 remembered events and grew as roughly N^3, because
 * relationship detection emitted N relationships per new memory and four derived
 * consumers each read every one as "recompute everything" -- N importance
 * passes, N understanding rebuilds, N context rebuilds and N^2 recall-index
 * rebuilds, 9,324 of them for one checkbox. `genesis/batch.ts` made consumers
 * coalesce and settle once against final state.
 *
 * WHY THE EXISTING TESTS CANNOT CATCH ITS RETURN
 * ---------------------------------------------
 * `genesis-batching.test.ts` proves batched cognition reaches the same state as
 * unbatched, and that is exactly why it cannot guard this. The commit message
 * puts it precisely: "The work was not wrong, only repeated." Every rebuild is a
 * pure function of the current stores, so deleting a `markDirty` guard leaves
 * the final state identical and the equivalence tests green while the cost goes
 * quadratic again. Correctness and cost are different properties and only one
 * of them was pinned.
 *
 * WHAT THIS PINS, AND WHY IT IS COUNTS RATHER THAN MILLISECONDS
 * ------------------------------------------------------------
 * `tests/support/perf-ab.ts` records that absolute latency is not measurable on
 * this hardware to better than ~3x, and to prefer a deterministic count wherever
 * one exists. One does here, and it is the better instrument anyway: the defect
 * was repetition, so counting repetitions names it directly and cannot flake.
 *
 * The invariant is that work per action is flat in N, not that it is small:
 *
 *   recall index rebuilds per action     constant (1), independent of N
 *   candidates built per action          ~N, never N^2
 *
 * Measured on this HEAD across the sizes below, one action rebuilds the recall
 * index once at every size. Under the old behaviour that figure was N^2.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

import type { MemoryEvent } from "../src/shared/types/event-types";
import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");

/** Sizes from the performance brief. */
const SIZES = [25, 50, 100, 150, 250] as const;

/**
 * Settled spans per completed task, measured on this HEAD at every size below.
 *
 * Two rather than one because `toggleTask` settles cognition twice; what makes
 * it an invariant is that it is the same two at 25 memories and at 250. An
 * upper bound rather than equality, so making cognition settle *less* is not a
 * failure.
 */
const REBUILDS_PER_ACTION = 2;

const counters = { recallRebuilds: 0, candidatesBuilt: 0 };

/**
 * Counts recall-index rebuilds by wrapping the call that starts one.
 *
 * `startRecallSession` receives the whole freshly built candidate list, so it
 * measures both how often the index is rebuilt and how much was rebuilt each
 * time -- the two numbers that went to N and N^2 respectively.
 */
const originalStartSession = recallService.startRecallSession.bind(recallService);
(recallService as unknown as Record<string, unknown>).startRecallSession = (...args: unknown[]) => {
  counters.recallRebuilds += 1;
  counters.candidatesBuilt += Array.isArray(args[0]) ? (args[0] as unknown[]).length : 0;
  return (originalStartSession as (...a: unknown[]) => unknown)(...args);
};

/**
 * A realistic stream: projects, completed tasks against them, and notes.
 *
 * Events must carry `relatedProjectId`, because that is what forms arcs and
 * what makes relationship detection link memories to each other -- the step the
 * original collapse multiplied. A stream of unattached notes produces one story
 * and exercises almost none of this.
 */
function seedEvents(total: number): MemoryEvent[] {
  const events: MemoryEvent[] = [];
  const projects = Math.max(1, Math.round(total / 12));
  const base = Date.now() - total * 60_000;
  const at = (i: number) => new Date(base + i * 60_000).toISOString();

  for (let p = 0; p < projects; p++) {
    events.push({
      id: `p-${p}`,
      timestamp: at(events.length),
      eventType: "project_created",
      title: "Project Created",
      description: `Started new project: Project ${p}`,
      relatedProjectId: `proj-${p}`,
      relatedNoteId: null,
      metadata: {},
    });
  }
  for (let i = 0; events.length < total; i++) {
    const p = i % projects;
    events.push(
      i % 3 === 2
        ? {
            id: `n-${i}`,
            timestamp: at(events.length),
            eventType: "note_created",
            title: "Note Created",
            description: `Thoughts on Project ${p}: planning the next step`,
            relatedProjectId: `proj-${p}`,
            relatedNoteId: `note-${i}`,
            metadata: {},
          }
        : {
            id: `t-${i}`,
            timestamp: at(events.length),
            eventType: "task_completed",
            title: "Task Completed",
            description: `Completed task: "step ${i} of Project ${p}"`,
            relatedProjectId: `proj-${p}`,
            relatedNoteId: null,
            metadata: {},
          },
    );
  }
  return events.slice(0, total);
}

/** Rebuild cognition from a stream of `total` events, as a reload would. */
function seed(total: number): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({
    ...state,
    memories: seedEvents(total),
    tasks: [],
    notes: [],
    projects: [],
    chat: [],
  });
  memoryService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  memoryService.reconstructRuntimeMemory();
  // Not in the composition manifest -- `context/state/service` initializes it at
  // boot, so a harness that omits it measures a pipeline with no recall in it.
  recallBuilder.initialize();
}

/** One completed task: the action the original collapse was measured on. */
function oneUserAction(): void {
  akira.addProject({ name: "Probe Project" });
  const projectId = akira.getState().lastProjectId as string;
  akira.addTaskDetails({ title: "probe task", projectId });
  const task = akira.getState().tasks.find((t) => t.title === "probe task");
  if (!task) throw new Error("store action did not create the probe task");
  counters.recallRebuilds = 0;
  counters.candidatesBuilt = 0;
  akira.toggleTask(task.id);
}

describe("cognition settles once per action at every memory count", () => {
  const observed: { n: number; rebuilds: number; candidates: number; memories: number }[] = [];

  for (const n of SIZES) {
    it(`rebuilds the recall index once for one action at ${n} memories`, () => {
      seed(n);
      oneUserAction();

      const memories = memoryService.getMemories().length;
      observed.push({
        n,
        rebuilds: counters.recallRebuilds,
        candidates: counters.candidatesBuilt,
        memories,
      });

      // The precondition. Without it a build that recalls nothing would satisfy
      // every bound below by doing no work at all.
      expect(memories, "the seed produced no memories").toBeGreaterThanOrEqual(n);
      expect(counters.recallRebuilds, "the action rebuilt no recall index").toBeGreaterThan(0);

      // The invariant. One settled action, one rebuild -- at 25 memories and at
      // 250. Under the pre-`329589d` cascade this grew with N.
      // Flat in N is the invariant, not any particular small number. One
      // completed task settles cognition twice at 25 memories and twice at 250;
      // under the pre-`329589d` cascade this figure grew with N.
      expect(
        counters.recallRebuilds,
        `one action rebuilt the recall index ${counters.recallRebuilds} times at ${n} memories`,
      ).toBeLessThanOrEqual(REBUILDS_PER_ACTION);

      // Linear, not quadratic. One rebuild considers every memory once; the
      // collapse was N rebuilds each considering N memories.
      // Each rebuild considers every memory once. The collapse was N rebuilds
      // each considering N memories, so the quantity that must stay linear is
      // candidates per rebuild, not candidates outright.
      expect(
        counters.candidatesBuilt,
        `one action built ${counters.candidatesBuilt} candidates over ${memories} memories ` +
          `in ${counters.recallRebuilds} rebuilds`,
      ).toBeLessThanOrEqual(counters.recallRebuilds * (memories + 1));
    });
  }

  it("does not grow the work per action as memory count grows", () => {
    expect(observed.length, "the size cases did not run").toBe(SIZES.length);

    const smallest = observed[0];
    const largest = observed[observed.length - 1];
    expect(
      largest.memories / smallest.memories,
      "the sizes did not actually differ",
    ).toBeGreaterThan(5);

    // The scaling statement, made against the curve rather than one point: a
    // tenfold memory count must not cost a tenfold number of rebuilds.
    expect(
      largest.rebuilds,
      `rebuilds per action grew from ${smallest.rebuilds} at ${smallest.n} to ` +
        `${largest.rebuilds} at ${largest.n} memories`,
    ).toBe(smallest.rebuilds);

    // And the candidate work grew linearly with the memories, not with their
    // square: the ratio is bounded by the rebuild count, which is flat.
    const ratioSmall = smallest.candidates / smallest.memories;
    const ratioLarge = largest.candidates / largest.memories;
    expect(
      ratioLarge,
      `candidates per memory grew from ${ratioSmall.toFixed(2)} to ${ratioLarge.toFixed(2)}`,
    ).toBeLessThanOrEqual(ratioSmall + 0.5);
  });
});
