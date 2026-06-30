import { memoryService } from "../memory/validation/memory-service";
import { storyService } from "../stories/story-service";
import { Memory } from "../memory/validation/types";
import { importanceService } from "./importance-service";
import { importanceRules } from "./importance-rules";
import { ImportanceSignal } from "./types";

let memorySub: (() => void) | null = null;
let storySub: (() => void) | null = null;

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

    if (!storySub) {
      storySub = storyService.subscribe((event) => {
        const memories = memoryService.getMemories();
        const related = memories.filter((m) => event.story.relatedMemoryIds.includes(m.id));
        related.forEach((m) =>
          this.evaluateMemoryImportance(m, `Story Updated: ${event.story.title}`),
        );
      });
    }
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

// Automatic integration: initialize on load
importanceBuilder.initialize();
