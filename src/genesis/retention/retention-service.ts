/**
 * Keeps derived cognitive stores consistent with retention.
 *
 * `memories` is the root store; stories, importance profiles and memory
 * relationships all hold memory ids. When retention evicts a memory, those
 * references become dangling — a story listing a memory that no longer exists,
 * an importance profile for nothing, a relationship with one end missing.
 *
 * Rather than have the memory store reach into every derived store (which would
 * invert the dependency direction — they already import it), the memory store
 * announces what it evicted and this service fans that out. It is the only
 * production subscriber to that signal, so there is one place to look when
 * asking what happens to a memory's dependants when it ages out.
 *
 * Understandings are deliberately absent. `understandingEngine` rebuilds its
 * graph from memories and stories rather than accumulating, so it corrects
 * itself on the next rebuild and needs no pruning here.
 */

import { memoryService } from "../memory/memory-service";
import { storyService } from "../stories/story-service";
import { importanceService } from "../importance/importance-service";
import { relationshipService } from "./../memory/relationships/relationship-service";

let evictionSub: (() => void) | null = null;

export const retentionService = {
  /**
   * Subscribes to memory eviction. Idempotent, like every other GENESIS
   * processor, so composing twice cannot double-prune.
   */
  initialize(): void {
    if (evictionSub) return;

    evictionSub = memoryService.subscribeEviction((evictedMemoryIds) => {
      // Each store is pruned independently: a failure in one must not leave
      // the others holding references to memories that are already gone.
      for (const prune of [
        () => storyService.forgetMemories(evictedMemoryIds),
        () => importanceService.forgetMemories(evictedMemoryIds),
        () => relationshipService.forgetMemories(evictedMemoryIds),
      ]) {
        try {
          prune();
        } catch (err) {
          console.error("[GENESIS] Retention pruning failed for a derived store:", err);
        }
      }
    });
  },

  dispose(): void {
    if (evictionSub) {
      evictionSub();
      evictionSub = null;
    }
  },
};
