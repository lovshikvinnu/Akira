import { memoryService } from "../memory/memory-service";
import { storyService } from "../stories/story-service";
import { Memory } from "../validation/types";
import { importanceService } from "./importance-service";
import { importanceRules } from "./importance-rules";
import { ImportanceSignal } from "./types";
import { isBatching, markDirty, registerFlusher, unregisterFlusher } from "../batch";

let memorySub: (() => void) | null = null;
let storySub: (() => void) | null = null;
let storyEvictionSub: (() => void) | null = null;
let clearSub: (() => void) | null = null;

/**
 * Stories whose members still need recalculating in the open transaction.
 *
 * Keyed by story id rather than by story object: a story is replaced by a new
 * object on every update, so identity would coalesce nothing. The id is what
 * stays stable across the appends within one event.
 */
const dirtyStoryIds = new Set<string>();

/**
 * Memories that left a story during the transaction.
 *
 * Tracked apart from `dirtyStoryIds` because by the time the flush runs the
 * story no longer names them, so recalculating its members cannot reach them --
 * and a Story Influence signal is derived from a membership, so a memory that
 * has lost one is carrying a signal whose source is gone.
 */
const departedMemoryIds = new Set<string>();

export const importanceBuilder = {
  /**
   * Subscribe to Memory and Story events to update importance signals.
   */
  initialize(): void {
    if (!memorySub) {
      memorySub = memoryService.subscribe((memory) => {
        this.evaluateMemoryImportance(memory, "Memory Promoted");
      });
    }

    registerFlusher("importance", () => {
      this.flushDirtyStories();
    });

    if (!storySub) {
      storySub = storyService.subscribe((event) => {
        // One completed task appends N relationships to its story, and each
        // append emitted a story-wide "Updated". Recalculating every member on
        // each of them produced N^2 importance updates per event -- 9,226 for a
        // single checkbox at 102 memories -- all but the last describing a
        // story that was still being written.
        //
        // The signals themselves are a pure function of the memory and the
        // current stories, so recalculating once after the story settles yields
        // the same values the final pass would have produced.
        for (const memoryId of event.departedMemoryIds ?? []) departedMemoryIds.add(memoryId);

        if (isBatching()) {
          dirtyStoryIds.add(event.story.id);
          markDirty("importance");
          return;
        }
        this.recalculateStoryMembers(event.story);
        this.recalculateDeparted();
      });
    }

    if (!storyEvictionSub) {
      // A whole arc leaving takes its members' membership with it, and that
      // path does not run through `updateStory`, so it computes no departed
      // ids of its own.
      storyEvictionSub = storyService.subscribeEviction(({ memberIds }) => {
        for (const memoryId of memberIds) departedMemoryIds.add(memoryId);
        if (isBatching()) {
          markDirty("importance");
          return;
        }
        this.recalculateDeparted();
      });
    }

    if (!clearSub) {
      clearSub = memoryService.subscribeClear(() => {
        importanceService.clearHistory();
      });
    }
  },

  /**
   * Dispose subscriptions.
   */
  dispose(): void {
    unregisterFlusher("importance");
    dirtyStoryIds.clear();
    if (memorySub) {
      memorySub();
      memorySub = null;
    }
    if (storySub) {
      storySub();
      storySub = null;
    }
    if (storyEvictionSub) {
      storyEvictionSub();
      storyEvictionSub = null;
    }
    if (clearSub) {
      clearSub();
      clearSub = null;
    }
  },

  /**
   * Recalculates importance for every memory the story currently holds.
   *
   * Unchanged in substance from what the story subscription always did; it is
   * a named method so the flush and the unbatched path share one definition.
   */
  recalculateStoryMembers(story: { id: string; title: string; relatedMemoryIds: string[] }): void {
    const memories = memoryService.getMemories();
    const memberIds = new Set(story.relatedMemoryIds);
    const related = memories.filter((m) => memberIds.has(m.id));
    related.forEach((m) => this.evaluateMemoryImportance(m, `Story Updated: ${story.title}`));
  },

  /**
   * Settles every story touched during the transaction, once each.
   *
   * A story that retention removed mid-transaction is skipped: recalculating
   * the importance of an arc that no longer exists would write profiles nothing
   * can reach.
   */
  flushDirtyStories(): void {
    if (dirtyStoryIds.size === 0 && departedMemoryIds.size === 0) return;

    const ids = [...dirtyStoryIds];
    dirtyStoryIds.clear();

    const stories = storyService.getStories();
    for (const id of ids) {
      const story = stories.find((s) => s.id === id);
      if (story) this.recalculateStoryMembers(story);
    }

    // After the members, because a memory can leave one story and join another
    // inside the same transaction; recalculating it last reads settled state.
    this.recalculateDeparted();
  },

  /**
   * Recomputes the memories that left a story, so a signal derived from a
   * membership does not outlive it.
   *
   * The rule needs no change to do this: `Story Influence Signal Rule` already
   * returns null when `findStoryContainingMemory` finds nothing. Nothing was
   * asking it again. A memory retention has since evicted is skipped -- its
   * profile is dropped by `importanceService.forgetMemories`, and writing one
   * here would resurrect it.
   */
  recalculateDeparted(): void {
    if (departedMemoryIds.size === 0) return;

    const ids = [...departedMemoryIds];
    departedMemoryIds.clear();

    const byId = new Map(memoryService.getMemories().map((m) => [m.id, m]));
    for (const id of ids) {
      const memory = byId.get(id);
      if (memory) this.evaluateMemoryImportance(memory, "Left story");
    }
  },

  /**
   * Evaluate importance rules on a memory, updating its active signal profile.
   */
  evaluateMemoryImportance(memory: Memory, reason: string = "Recalculated"): void {
    const signals: ImportanceSignal[] = [];

    for (const rule of importanceRules) {
      const signal = rule.evaluate(memory);
      if (signal) {
        signals.push(signal);
      }
    }

    importanceService.updateImportance(memory.id, signals, reason);
  },
};

// Activation is owned by src/genesis/composition.ts, which the production
// entry point composes explicitly. This module previously initialised itself
// on import — and nothing in the application imported it, so `importanceBuilder`
// never ran outside its own tests.
