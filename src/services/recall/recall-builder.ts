import { memoryService } from "../memory/validation/memory-service";
import { storyService } from "../stories/story-service";
import { importanceService } from "../importance/importance-service";
import { recallService } from "./recall-service";
import { recallRules } from "./recall-rules";
import { RecallCandidate, RecallContext } from "./types";
import { getChat } from "../genesis-provider";

let memorySub: (() => void) | null = null;
let storySub: (() => void) | null = null;
let importanceSub: (() => void) | null = null;

export const recallBuilder = {
  /**
   * Subscribe to Memory, Story, and Importance updates to trigger candidate recalculation.
   */
  initialize(): void {
    memoryService.registerRecallBuilder(() => {
      this.rebuildRecallCandidates();
    });

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

    // Perform initial construction synchronously
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

    for (const memory of memories) {
      const importance = importanceService.getImportance(memory.id);
      const parentStory = stories.find((s) => s.relatedMemoryIds.includes(memory.id));
      const supportingStoryIds = parentStory ? [parentStory.id] : [];

      const reasons: string[] = [];

      for (const rule of recallRules) {
        const result = rule.evaluate(memory, importance, stories, resolvedContext);
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

    recallService.startRecallSession(candidates, resolvedContext);
  },
};

// Automatic integration: initialize on load
// recallBuilder.initialize();
