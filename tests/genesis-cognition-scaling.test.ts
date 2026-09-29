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
 *   recall index rebuilds per action       constant, independent of N
 *   candidates built per action            ~N, never N^2
 *   importance passes per action           constant, independent of N
 *   memories re-scored per action          ~N per pass, never N^2
 *   understanding rebuilds per action      constant, independent of N
 *
 * The collapse cost "N importance passes, N understanding rebuilds, N context
 * rebuilds and N^2 recall-index rebuilds" per action. Recall was pinned first
 * because it was the worst of them, but a guard on one consumer does not guard
 * the others: importance and understanding coalesce through their own
 * `isBatching()`/`markDirty()` branches, and either could be removed on its own
 * with every equivalence test still green. Each is counted here at its own
 * seam.
 *
 * Measured on this HEAD across the sizes below, every one of these figures is
 * the same at 25 memories and at 250. Under the old behaviour each grew with N.
 *
 * HOW THESE FAIL, AND WHAT THEY DO NOT COVER
 * ------------------------------------------
 * Deleting a coalescing branch fails these at every size, which is what they
 * are for, but the three do not fail alike and it is worth knowing which kind
 * of failure to expect. Measured by deleting each branch in turn:
 *
 *   recall         14 rebuilds at 25 memories -> 70 at 250   (grows with N)
 *   importance     1 pass -> 2, at every size                (constant factor)
 *   understanding  2 rebuilds -> 4, at every size            (constant factor)
 *
 * Only recall reinstates growth, because it is the one consumer whose rebuild
 * reads every memory. The other two lost their N-sized input somewhere above
 * them: the collapse needed N story-wide "Updated" events per action, and
 * relationship detection is now bounded per new memory -- this action produces
 * 7-8 story touches at 25 memories and 8 at 250. Removing the story-append
 * coalescing outright changes none of the counts in this file, because there is
 * no longer an N-sized burst for it to coalesce.
 *
 * So these pin the coalescing branches, not the bound above them. If the
 * per-memory relationship cap were removed, the fan-out would return and these
 * counts would not move, because the coalescing would absorb it. That bound
 * needs a guard of its own and this file is not it.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, vi } from "vitest";

import type { MemoryEvent } from "../src/shared/types/event-types";
import type { AkiraState } from "../src/shared/types/store-types";

/**
 * Counts understanding rebuilds at the only place one can be counted.
 *
 * `rebuildGraph` is module-private and its result is published only when the
 * graph actually changed -- of 10,153 rebuilds across 140 events before
 * batching, 143 changed anything. Counting notifications would therefore miss
 * 98.6% of the work, which is precisely the work that collapsed. The graph
 * builder has exactly one call site, inside `rebuildGraph`, so wrapping it
 * counts rebuilds exactly and counts the discarded ones too.
 */
const understanding = { rebuilds: 0 };
vi.mock("../src/genesis/understanding/builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/genesis/understanding/builder")>();
  return {
    ...actual,
    buildUnderstandingGraph: (...args: Parameters<typeof actual.buildUnderstandingGraph>) => {
      understanding.rebuilds += 1;
      return actual.buildUnderstandingGraph(...args);
    },
  };
});

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { importanceBuilder } = await import("../src/genesis/importance/importance-builder");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");

/**
 * Counts importance work by wrapping the pass and the per-memory scoring
 * inside it -- the two quantities that went to N and N^2 respectively, in the
 * same shape as recall's rebuilds and candidates.
 */
function instrumentImportance(): void {
  const originalPass = importanceBuilder.recalculateStoryMembers.bind(importanceBuilder);
  importanceBuilder.recalculateStoryMembers = (story) => {
    counters.importancePasses += 1;
    return originalPass(story);
  };
  const originalScore = importanceBuilder.evaluateMemoryImportance.bind(importanceBuilder);
  importanceBuilder.evaluateMemoryImportance = (memory, reason) => {
    counters.memoriesScored += 1;
    return originalScore(memory, reason);
  };
}
instrumentImportance();

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

/**
 * Importance passes and understanding rebuilds per completed task, measured on
 * this HEAD at every size below.
 *
 * As with the recall figure, what makes these invariants is that they are the
 * same at 25 memories and at 250, not the particular small numbers. One pass
 * because the transaction touches one story and the flush settles it once;
 * two rebuilds because the action settles cognition twice. Upper bounds, so
 * coalescing harder is not a failure.
 */
const IMPORTANCE_PASSES_PER_ACTION = 1;
const UNDERSTANDING_REBUILDS_PER_ACTION = 2;

const counters = {
  recallRebuilds: 0,
  candidatesBuilt: 0,
  importancePasses: 0,
  memoriesScored: 0,
};

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
  // A constant number of arcs, so each one holds a share of N that grows with
  // N. Scaling the arc count with `total` instead would keep every arc about
  // twelve memories long at every size, and the per-pass bounds below would
  // then be constants that no size case could move.
  const projects = 4;
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

/**
 * One completed task: the action the original collapse was measured on.
 *
 * The task joins a seeded arc rather than a fresh one. A new project's story
 * holds only the probe's own memories at every size, so an action against it
 * re-scores a constant number of memories and cannot show work that grows --
 * the arc has to be big for the per-pass bound to be measuring anything.
 */
function oneUserAction(): void {
  akira.addTaskDetails({ title: "probe task", projectId: "proj-0" });
  const task = akira.getState().tasks.find((t) => t.title === "probe task");
  if (!task) throw new Error("store action did not create the probe task");
  counters.recallRebuilds = 0;
  counters.candidatesBuilt = 0;
  counters.importancePasses = 0;
  counters.memoriesScored = 0;
  understanding.rebuilds = 0;
  akira.toggleTask(task.id);
}

describe("cognition settles once per action at every memory count", () => {
  const observed: {
    n: number;
    rebuilds: number;
    candidates: number;
    memories: number;
    importancePasses: number;
    understandingRebuilds: number;
  }[] = [];

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
        importancePasses: counters.importancePasses,
        understandingRebuilds: understanding.rebuilds,
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

      // Importance, the second consumer named in the collapse. The old
      // behaviour ran one pass per story-wide "Updated" event, and one action
      // emitted N of them.
      expect(
        counters.importancePasses,
        `one action ran ${counters.importancePasses} importance passes at ${n} memories`,
      ).toBeLessThanOrEqual(IMPORTANCE_PASSES_PER_ACTION);

      // And each pass re-scores the story's members once, never every memory
      // once per pass.
      expect(
        counters.memoriesScored,
        `one action scored ${counters.memoriesScored} memories in ` +
          `${counters.importancePasses} passes over ${memories} memories`,
      ).toBeLessThanOrEqual((counters.importancePasses + 1) * (memories + 1));

      // Understanding, the third. Each rebuild reads every memory and every
      // story, so N rebuilds per action is N^2 work that is then discarded by
      // the equality check.
      expect(
        understanding.rebuilds,
        `one action rebuilt understanding ${understanding.rebuilds} times at ${n} memories`,
      ).toBeLessThanOrEqual(UNDERSTANDING_REBUILDS_PER_ACTION);
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
    // Same statement for the other two consumers: the count at the largest
    // size is the count at the smallest, not a multiple of it.
    expect(
      largest.importancePasses,
      `importance passes per action grew from ${smallest.importancePasses} at ${smallest.n} ` +
        `to ${largest.importancePasses} at ${largest.n} memories`,
    ).toBe(smallest.importancePasses);
    expect(
      largest.understandingRebuilds,
      `understanding rebuilds per action grew from ${smallest.understandingRebuilds} at ` +
        `${smallest.n} to ${largest.understandingRebuilds} at ${largest.n} memories`,
    ).toBe(smallest.understandingRebuilds);

    const ratioSmall = smallest.candidates / smallest.memories;
    const ratioLarge = largest.candidates / largest.memories;
    expect(
      ratioLarge,
      `candidates per memory grew from ${ratioSmall.toFixed(2)} to ${ratioLarge.toFixed(2)}`,
    ).toBeLessThanOrEqual(ratioSmall + 0.5);
  });
});
