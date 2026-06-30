import { memoryService } from "../memory/validation/memory-service";
import { storyService } from "../stories/story-service";
import { importanceService } from "../importance/importance-service";
import { recallService } from "./recall-service";
import { recallRules } from "./recall-rules";
import { RecallCandidate } from "./types";

let memorySub: (() => void) | null = null;
let storySub: (() => void) | null = null;
let importanceSub: (() => void) | null = null;

export const recallBuilder = {
  /**
   * Subscribe to Memory, Story, and Importance updates to trigger candidate recalculation.
   */
  initialize(): void {
    if (!memorySub) {
      memorySub = memoryService.subscribe(() => {
        this.rebuildRecallCandidates();
      });
    }

    if (!storySub) {
      storySub = storyService.subscribe(() => {
        this.rebuildRecallCandidates();
      });
    }

    if (!importanceSub) {
      importanceSub = importanceService.subscribe(() => {
        this.rebuildRecallCandidates();
      });
    }

    // Perform initial construction on load
    this.rebuildRecallCandidates();
  },

  /**
   * Dispose subscriptions.
   */
  dispose(): void {
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
   * Scan validated memories, check active signals/narratives, and compile candidate recall profiles.
   */
  rebuildRecallCandidates(): void {
    const candidates: Omit<RecallCandidate, "status">[] = [];
    const memories = memoryService.getMemories();
    const stories = storyService.getStories();

    for (const memory of memories) {
      const importance = importanceService.getImportance(memory.id);
      const parentStory = stories.find((s) => s.relatedMemoryIds.includes(memory.id));
      const supportingStoryIds = parentStory ? [parentStory.id] : [];

      const reasons: string[] = [];

      for (const rule of recallRules) {
        const result = rule.evaluate(memory, importance, stories);
        if (result.shouldRecall && result.reason) {
          reasons.push(result.reason);
        }
      }

      if (reasons.length > 0) {
        candidates.push({
          memoryId: memory.id,
          supportingStoryIds,
          importanceSignals: importance?.signals || [],
          recallReasons: reasons,
          recallTimestamp: new Date().toISOString(),
        });
      }
    }

    recallService.startRecallSession(candidates);
  },
};

// Automatic integration: initialize on load
recallBuilder.initialize();
