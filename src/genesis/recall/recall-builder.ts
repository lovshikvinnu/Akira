import { memoryService } from "../memory/memory-service";
import { storyService } from "../stories/story-service";
import { importanceService } from "../importance/importance-service";
import { recallService } from "./recall-service";
import { recallRules, buildRecallEvaluationContext } from "./recall-rules";
import { RecallCandidate, RecallContext } from "./types";
import { getChat } from "../../shared/genesis-provider";
import { isBatching, markDirty, registerFlusher, unregisterFlusher } from "../batch";

let memorySub: (() => void) | null = null;
let storySub: (() => void) | null = null;
let importanceSub: (() => void) | null = null;

export const recallBuilder = {
  /**
   * Subscribe to Memory, Story, and Importance updates to trigger candidate recalculation.
   */
  initialize(): void {
    registerFlusher("recall", () => {
      this.rebuildRecallCandidates();
    });

    memoryService.registerRecallBuilder(() => {
      this.scheduleRebuild();
    });

    if (!memorySub) {
      memorySub = memoryService.subscribe(() => {
        this.scheduleRebuild();
      });
    }

    if (!storySub) {
      storySub = storyService.subscribe(() => {
        this.scheduleRebuild();
      });
    }

    if (!importanceSub) {
      importanceSub = importanceService.subscribe(() => {
        this.scheduleRebuild();
      });
    }

    // Perform initial construction synchronously
    this.rebuildRecallCandidates();
  },

  /**
   * Rebuilds now, or once at the end of the current cognitive transaction.
   *
   * This is the edge that story-level batching alone does not reach. Even with
   * a single story notification per event, importance still recalculates every
   * member of that story -- that is its job, and the member count grows with
   * history. Subscribing to each of those updates meant an O(N) index rebuild
   * O(N) times per event: 9,324 rebuilds for one completed task at 102
   * memories, scanning 26.9 million memory records per hundred clicks.
   *
   * Coalescing is sound because the builder derives candidates purely from the
   * current memories, stories and importance profiles. One rebuild against
   * settled state computes exactly what the last of those rebuilds computed;
   * the ones before it were describing a store still in motion.
   */
  scheduleRebuild(): void {
    if (isBatching()) {
      markDirty("recall");
      return;
    }
    this.rebuildRecallCandidates();
  },

  /**
   * Dispose subscriptions.
   */
  dispose(): void {
    unregisterFlusher("recall");
    if (memorySub) {
      memorySub();
      memorySub = null;
    }
    if (storySub) {
      storySub();
      storySub = null;
    }
    if (importanceSub) {
      importanceSub();
      importanceSub = null;
    }
  },

  /**
   * Dynamically resolve current context based on chat history and state.
   */
  resolveCurrentContext(): RecallContext {
    const chat = getChat();
    const hasUserMessages = chat && chat.some((m) => m.role === "user");
    if (!hasUserMessages) {
      return "BOOTSTRAP";
    }
    const lastMsg = chat[chat.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      return "QUERY";
    }
    return "CONTINUATION";
  },

  /**
   * Scan validated memories, check active signals/narratives, and compile candidate recall profiles.
   */
  rebuildRecallCandidates(context?: RecallContext): void {
    const resolvedContext = context || this.resolveCurrentContext();
    const candidates: Omit<RecallCandidate, "status">[] = [];
    const memories = memoryService.getMemories();
    const stories = storyService.getStories();

    // One instant for the whole cycle, taken once rather than per candidate.
    //
    // This was `new Date().toISOString()` inside the loop below, so a rebuild
    // constructed one Date and formatted one ISO string per emitted candidate.
    // At the retention ceiling every memory becomes a candidate, so one rebuild
    // made ~500 of them where one would do: measured 1.05-1.10 ms of isolated
    // cost per rebuild, and 1.97 ms end to end once the allocation pressure of
    // ~500 short-lived Dates is included. That count follows the memory cap, so
    // it does not vary with workload shape; the end-to-end figure was taken on
    // a four-project workload, where the median completed task went
    // 9.70 -> 7.73 ms (200 samples per trial, three trials per side). Medians,
    // because a parallel build on the same machine made 30-sample means vary by
    // 44% -- enough to invert the sign of a 2 ms effect.
    //
    // This is not the dominant phase. At single-project density the same task
    // costs ~13 ms and `relationshipService.detectRelationships` takes ~4.5 ms
    // of it, against ~2.7 ms for this rebuild.
    //
    // Hoisting is not merely cheaper, it is more truthful. A candidate's
    // timestamp records which recall cycle activated it, and the loop takes
    // ~3.3 ms to run, so the per-candidate call spread one cycle's stamps
    // across milliseconds according to nothing but iteration order.
    // `startRecallSession` already stamps the session, its whole audit trail
    // and every newly-Inactive candidate from a single `timestamp` for exactly
    // this reason; the Active branch was the one place that disagreed, and now
    // does not.
    const recallTimestamp = new Date().toISOString();

    // The discussion context, tokenised once for the whole pass.
    //
    // Every rule is asked about every memory, and the multi-factor rule's view
    // of "what is being discussed right now" is the same for all of them: it
    // reads the chat and the companion state, neither of which this loop
    // touches, and the loop is synchronous. Rebuilding it per memory copied and
    // reversed the chat array, re-read companion state and re-tokenised the
    // same string ~500 times per rebuild, measured at 2.02-2.16 ms against
    // 0.78 ms for the part that actually varies per memory.
    const evaluationContext = buildRecallEvaluationContext();

    for (const memory of memories) {
      const importance = importanceService.getImportance(memory.id);
      const parentStory = storyService.findStoryContainingMemory(memory.id);
      const supportingStoryIds = parentStory ? [parentStory.id] : [];

      const reasons: string[] = [];
      let score = 0;

      for (const rule of recallRules) {
        const result = rule.evaluate(
          memory,
          importance,
          stories,
          resolvedContext,
          evaluationContext,
        );
        if (result.shouldRecall && result.reason) {
          reasons.push(result.reason);
          // The strongest opinion wins. Rules that recall on a categorical
          // fact report no score and leave this at 0, which is what a memory
          // recalled only for belonging to an active story should carry.
          if (result.score !== undefined && result.score > score) {
            score = result.score;
          }
        }
      }

      if (reasons.length > 0) {
        candidates.push({
          memoryId: memory.id,
          supportingStoryIds,
          importanceSignals: importance?.signals || [],
          recallReasons: reasons,
          recallScore: score,
          userAuthored: memory.relatedNoteId != null,
          recallTimestamp,
        });
      }
    }

    // The candidate list above is built from `memories`, so that same set is
    // the definition of which cached candidates can still be resolved.
    recallService.startRecallSession(
      candidates,
      resolvedContext,
      new Set(memories.map((m) => m.id)),
    );
  },
};
