import { Story } from "../stories/types";
import { IdentityCategory } from "./types";
import { hypothesesService } from "./hypotheses";

export interface IdentityRule {
  name: string;
  evaluateStory(story: Story): {
    detected: boolean;
    category?: IdentityCategory;
    observationName?: string;
    value?: string;
    confidence?: number;
    provenance?: string;
    hypothesisTrigger?: {
      targetHypothesisName: string;
      confirm: boolean;
    };
  };
}

export const identityRules: IdentityRule[] = [
  {
    name: "Reflective Trait Evaluation",
    evaluateStory(story) {
      if (story.title === "Personal Growth Reflections" && story.relatedMemoryIds.length >= 2) {
        return {
          detected: true,
          category: "Trait",
          observationName: "Reflective",
          value: "Active",
          confidence: Math.min(1.0, 0.5 + story.relatedMemoryIds.length * 0.1),
          provenance: `Inferred reflective trait because user logged ${story.relatedMemoryIds.length} observations in the "Personal Growth Reflections" story.`,
        };
      }
      return { detected: false };
    },
  },
  {
    name: "Deep Work Focus Style Evaluation",
    evaluateStory(story) {
      if (story.title.startsWith("Project Arc:") && story.relatedMemoryIds.length >= 3) {
        return {
          detected: true,
          category: "WorkStyle",
          observationName: "Deep Work Focus",
          value: "Active",
          confidence: Math.min(1.0, 0.4 + story.relatedMemoryIds.length * 0.05),
          provenance: `Inferred Deep Work focus because project narrative "${story.title}" gathered ${story.relatedMemoryIds.length} work milestones and sessions.`,
        };
      }
      return { detected: false };
    },
  },
  {
    name: "Project Completion Hypothesis Confirmation",
    evaluateStory(story) {
      if (story.title.startsWith("Project Arc:") && story.status === "Completed") {
        const projectName = story.title.replace("Project Arc:", "").trim();

        const hypotheses = hypothesesService.getHypotheses();
        const matchingHyp = hypotheses.find(
          (h) =>
            h.category === "Aspiration" &&
            h.status === "Proposed" &&
            h.name.toLowerCase().includes(projectName.toLowerCase()),
        );

        if (matchingHyp) {
          return {
            detected: false,
            hypothesisTrigger: {
              targetHypothesisName: matchingHyp.name,
              confirm: true,
            },
          };
        }
      }
      return { detected: false };
    },
  },
];

export function registerIdentityRule(rule: IdentityRule) {
  identityRules.unshift(rule);
}
