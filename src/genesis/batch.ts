/**
 * GENESIS cognitive transaction boundary.
 *
 * WHY THIS EXISTS
 * ---------------
 * One real user action produces one memory, but that memory produces N
 * relationships against the N memories already in its project, and every one of
 * those relationships was appended to the story individually — each append
 * emitting a story-wide "Updated". Four derived consumers read that event as
 * "recompute everything you derive from this story", so a single completed task
 * cost N importance passes, N understanding rebuilds, N context rebuilds and,
 * through importance, N^2 full recall-index rebuilds. Measured at 102 memories:
 * 6,190 ms and 9,324 recall rebuilds for one checkbox.
 *
 * The work was not wrong, only repeated: each rebuild is a pure function of the
 * current stores, so all but the last were discarded. This module supplies the
 * missing boundary — the span during which those stores are still moving — so a
 * consumer can rebuild once, at the end, against settled state.
 *
 * WHAT IT DELIBERATELY IS NOT
 * ---------------------------
 * Not a scheduler and not a generic effect framework. There are no timers, no
 * microtasks and no async: `runBatched` is ordinary synchronous control flow, so
 * cognition is fully settled before the call that started it returns. That is
 * load-bearing — `tests/genesis-reality-pipeline-e2e.test.ts` asserts cognitive
 * state on the line after `akira.toggleTask()`, and the UI reads the store
 * synchronously after a mutation.
 *
 * Outside a batch every consumer behaves exactly as before: `markDirty` is only
 * consulted when `isBatching()` is true, so a direct call such as
 * `contextBuilder.rebuildContextPackage()` from a route still runs immediately.
 *
 * PHASE ORDER
 * -----------
 * Flushing follows the dependency direction of the pipeline: importance reads
 * memories and stories, recall reads importance, context reads recall. A single
 * ordered pass is therefore sufficient, and that is a property of the code
 * rather than a hope — the derived stages are read-only with respect to the
 * stages above them, so no phase can dirty an earlier one. `flushAll` still
 * loops, because "sufficient today" and "guaranteed forever" are different
 * claims and the loop is what makes a future violation converge instead of
 * silently dropping work.
 */

/** A coalescing point in the derived pipeline, named in flush order. */
export type FlushPhase =
  "stories" | "importance" | "understanding" | "identity" | "recall" | "context";

/**
 * Flush order, matching the dependency direction of GENESIS_COGNITIVE_PROCESSORS.
 *
 * stories -> importance -> understanding -> identity -> recall -> context
 *
 * `stories` is first because it is the only phase that changes a store the
 * others read: it emits the coalesced story event, which is what marks the rest
 * dirty. Everything after it consumes settled story state.
 *
 * importance, understanding and identity are peers -- each reads memories and
 * stories and writes only its own store -- so their relative order is a
 * convention, not a constraint. recall must follow importance because it reads
 * importance profiles, and context must be last because it reads recall,
 * stories and identity.
 */
const PHASE_ORDER: readonly FlushPhase[] = [
  "stories",
  "importance",
  "understanding",
  "identity",
  "recall",
  "context",
];

/**
 * Guards against a pathological cycle introduced by a future change. The phases
 * form a chain, so a correct flush needs one pass; anything beyond a couple is a
 * bug that must be loud rather than an infinite loop.
 */
const MAX_FLUSH_PASSES = 8;

const flushers = new Map<FlushPhase, () => void>();
const dirty = new Set<FlushPhase>();
let depth = 0;

/**
 * Registers the function that settles `phase`. Called once from each consumer's
 * `initialize()`; registering again replaces, so a re-initialised consumer
 * cannot accumulate flushers.
 */
export function registerFlusher(phase: FlushPhase, flush: () => void): void {
  flushers.set(phase, flush);
}

/** Removes a phase's flusher. Mirrors a consumer's `dispose()`. */
export function unregisterFlusher(phase: FlushPhase): void {
  flushers.delete(phase);
  dirty.delete(phase);
}

/** True while a cognitive transaction is open. */
export function isBatching(): boolean {
  return depth > 0;
}

/**
 * Records that `phase` has work outstanding.
 *
 * Coalescing is inherent: `dirty` is a Set, so marking the same phase a hundred
 * times within one transaction produces exactly one flush. Marking outside a
 * batch is a no-op by design — callers check `isBatching()` and do the work
 * inline instead, which is what preserves unbatched behaviour exactly.
 */
export function markDirty(phase: FlushPhase): void {
  if (depth === 0) return;
  dirty.add(phase);
}

/**
 * Runs `fn` as one cognitive transaction, settling all derived work before
 * returning.
 *
 * Nesting is expected, not merely tolerated: roughly thirty services call
 * `eventService.record()`, and some of them are reachable from inside a
 * transaction already in progress. Only the outermost call flushes, so an inner
 * transaction contributes its dirt to the outer one rather than settling early
 * against half-built state.
 *
 * `fn` throwing does not abandon the dirt. The flush runs from `finally`, so
 * derived state is still brought into agreement with whatever the store
 * actually committed — a partially applied transaction that left stale
 * derived state behind would be worse than a slow one.
 */
export function runBatched<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    if (depth === 1) {
      // The transaction stays open across its own flush, and that is load
      // bearing rather than incidental. Settling one phase notifies the next --
      // the importance flush emits an importance update per recalculated
      // member, which is exactly what `recallBuilder` subscribes to. If depth
      // had already returned to zero, those consumers would see
      // `isBatching() === false` and rebuild immediately, once per
      // notification, reinstating the O(N^2) cascade this module exists to
      // remove. Holding the depth until the flush completes is what lets a
      // phase enqueue later work instead of performing it inline.
      try {
        flushAll();
      } finally {
        depth = 0;
      }
    } else {
      depth--;
    }
  }
}

/**
 * Settles every dirty phase in order.
 *
 * A phase that throws must not strand the phases after it, and must not leave
 * its own flag set — a permanently dirty phase would re-run on every subsequent
 * transaction forever. The flag is therefore cleared before the flusher runs,
 * which also lets a phase legitimately re-mark itself for another pass.
 */
function flushAll(): void {
  try {
    for (let pass = 0; pass < MAX_FLUSH_PASSES && dirty.size > 0; pass++) {
      for (const phase of PHASE_ORDER) {
        if (!dirty.has(phase)) continue;
        dirty.delete(phase);

        const flush = flushers.get(phase);
        if (!flush) continue;

        try {
          flush();
        } catch (err) {
          console.error(`[GENESIS] Flush failed for phase "${phase}":`, err);
        }
      }
    }

    if (dirty.size > 0) {
      console.error(
        `[GENESIS] Flush did not converge after ${MAX_FLUSH_PASSES} passes; ` +
          `still dirty: ${[...dirty].join(", ")}. A derived phase is dirtying an earlier one.`,
      );
    }
  } finally {
    // Whatever happened above, the transaction is over. Leftover flags belong
    // to a batch that no longer exists and must not leak into the next one.
    dirty.clear();
  }
}

/** Test helper: true when nothing is left outstanding. */
export function hasPendingWork(): boolean {
  return dirty.size > 0;
}

/** Test helper: drops all registrations and pending flags. */
export function resetBatchingForTests(): void {
  flushers.clear();
  dirty.clear();
  depth = 0;
}
