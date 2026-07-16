import { Memory } from "../validation/types";
import { relationshipService } from "../memory/relationships/relationship-service";
import { storyService } from "../stories/story-service";
import { ImportanceSignal } from "./types";

export interface ImportanceRule {
  name: string;
  evaluate(memory: Memory): ImportanceSignal | null;
}

export const importanceRules: ImportanceRule[] = [
  {
    name: "Milestone Signal Rule",
    evaluate(memory) {
      if (memory.reason === "Milestone") {
        return {
          type: "Milestone",
          strength: 0.9,
          explanation: `Memory records a key milestone: "${memory.explanation}".`,
        };
      }
      return null;
    },
  },
  {
    name: "Recency Signal Rule",
    evaluate(memory) {
      const diffMs = Date.now() - new Date(memory.timestamp).getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      let strength = 0.3;
      let exp = "Historical context memory.";
      if (diffHours < 1) {
        strength = 1.0;
        exp = "Memory captured within the last hour.";
      } else if (diffHours < 24) {
        strength = 0.8;
        exp = "Memory captured within the last 24 hours.";
      } else if (diffHours < 24 * 7) {
        strength = 0.6;
        exp = "Memory captured within the last week.";
      }

      return {
        type: "Recency",
        strength,
        explanation: exp,
      };
    },
  },
  {
    name: "Relationships Density Signal Rule",
    evaluate(memory) {
      const rels = relationshipService.getRelationshipsForMemory(memory.id);
      if (rels.length > 0) {
        const strength = Math.min(1.0, 0.4 + rels.length * 0.15);
        return {
          type: "Relationships",
          strength,
          explanation: `Memory is semantically connected to ${rels.length} other context nodes.`,
        };
      }
      return null;
    },
  },
  {
    name: "Story Influence Signal Rule",
    evaluate(memory) {
      const stories = storyService.getStories();
      const parentStory = stories.find((s) => s.relatedMemoryIds.includes(memory.id));
      if (parentStory) {
        const strength = parentStory.status === "Active" ? 0.85 : 0.5;
        return {
          type: "Story Influence",
          strength,
          explanation: `Memory is part of the story "${parentStory.title}" (Status: ${parentStory.status}).`,
        };
      }
      return null;
    },
  },
  {
    name: "Reinforcement Signal Rule",
    evaluate(memory) {
      const rels = relationshipService.getRelationshipsForMemory(memory.id);
      const continuationRels = rels.filter((r) => r.type === "Continues");
      if (continuationRels.length > 0) {
        const strength = Math.min(1.0, 0.4 + continuationRels.length * 0.2);
        return {
          type: "Reinforcement",
          strength,
          explanation: `Memory is reinforced by ${continuationRels.length} continuation work logs.`,
        };
      }
      return null;
    },
  },
  {
    name: "User Intent Signal Rule",
    evaluate(memory) {
      const title = (memory.title || "").toLowerCase();
      if (memory.relatedNoteId && !title.includes("untitled")) {
        return {
          type: "User Intent",
          strength: 0.8,
          explanation: "Memory is an explicitly captured note created or edited by the user.",
        };
      }
      return null;
    },
  },
];

export function registerImportanceRule(rule: ImportanceRule) {
  importanceRules.unshift(rule);
}
