import { Memory } from "../memory/validation/types";
import { MemoryImportance } from "../importance/types";
import { Story } from "../stories/types";

export interface RecallRule {
  name: string;
  evaluate(
    memory: Memory,
    importance: MemoryImportance | null,
    stories: Story[],
  ): {
    shouldRecall: boolean;
    reason?: string;
  };
}

export const recallRules: RecallRule[] = [
  {
    name: "Active Story Recall Rule",
    evaluate(memory, importance, stories) {
      const parentStory = stories.find((s) => s.relatedMemoryIds.includes(memory.id));
      if (parentStory && parentStory.status === "Active") {
        return {
          shouldRecall: true,
          reason: `Associated with active narrative: "${parentStory.title}".`,
        };
      }
      return { shouldRecall: false };
    },
  },
  {
    name: "Recent Activity Recall Rule",
    evaluate(memory, importance) {
      if (importance) {
        const recencySignal = importance.signals.find((s) => s.type === "Recency");
        if (recencySignal && recencySignal.strength >= 0.8) {
          return {
            shouldRecall: true,
            reason: `High recency signal: ${recencySignal.explanation}`,
          };
        }
      }
      return { shouldRecall: false };
    },
  },
  {
    name: "User Intent Recall Rule",
    evaluate(memory, importance) {
      if (importance) {
        const intentSignal = importance.signals.find((s) => s.type === "User Intent");
        if (intentSignal && intentSignal.strength >= 0.8) {
          return {
            shouldRecall: true,
            reason: `Explicit user intent detected: ${intentSignal.explanation}`,
          };
        }
      }
      return { shouldRecall: false };
    },
  },
  {
    name: "Strong Relationships Recall Rule",
    evaluate(memory, importance) {
      if (importance) {
        const relsSignal = importance.signals.find((s) => s.type === "Relationships");
        if (relsSignal && relsSignal.strength >= 0.7) {
          return {
            shouldRecall: true,
            reason: `Dense semantic graph connections: ${relsSignal.explanation}`,
          };
        }
      }
      return { shouldRecall: false };
    },
  },
  {
    name: "Reinforcement Recall Rule",
    evaluate(memory, importance) {
      if (importance) {
        const reinfSignal = importance.signals.find((s) => s.type === "Reinforcement");
        if (reinfSignal && reinfSignal.strength >= 0.8) {
          return {
            shouldRecall: true,
            reason: `Highly reinforced activity: ${reinfSignal.explanation}`,
          };
        }
      }
      return { shouldRecall: false };
    },
  },
];

export function registerRecallRule(rule: RecallRule) {
  recallRules.unshift(rule);
}
