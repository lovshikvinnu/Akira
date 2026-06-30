import { MemoryEvent } from "../events/types";
import { CandidateReason } from "./candidate";

export interface CandidateRule {
  name: string;
  evaluate(event: MemoryEvent): {
    shouldGenerate: boolean;
    reason?: CandidateReason;
    explanation?: string;
  };
}

export const rules: CandidateRule[] = [
  {
    name: "Project Created",
    evaluate(event) {
      if (event.eventType === "project_created") {
        return {
          shouldGenerate: true,
          reason: "Milestone",
          explanation: `A new workspace project "${event.title}" was initiated.`,
        };
      }
      return { shouldGenerate: false };
    },
  },
  {
    name: "Project Completed",
    evaluate(event) {
      if (event.eventType === "project_updated" && event.metadata) {
        const patch = event.metadata.patch as Record<string, unknown> | undefined;
        if (patch && patch.progress === 100) {
          return {
            shouldGenerate: true,
            reason: "Milestone",
            explanation: `Project "${event.metadata.name || event.title}" reached 100% completion milestone.`,
          };
        }
      }
      return { shouldGenerate: false };
    },
  },
  {
    name: "Project Continued",
    evaluate(event) {
      if (event.eventType === "project_continued") {
        return {
          shouldGenerate: true,
          reason: "Repeated Activity",
          explanation: `Continuous work logged on project "${event.metadata?.name || event.title}".`,
        };
      }
      return { shouldGenerate: false };
    },
  },
  {
    name: "Mission Completed",
    evaluate(event) {
      if (event.eventType === "mission_completed") {
        return {
          shouldGenerate: true,
          reason: "Goal Progress",
          explanation: `Daily mission target reached: ${event.description}`,
        };
      }
      return { shouldGenerate: false };
    },
  },
  {
    name: "Task Completed",
    evaluate(event) {
      if (event.eventType === "task_completed") {
        return {
          shouldGenerate: true,
          reason: "Goal Progress",
          explanation: `Task finished: "${event.metadata?.title || event.title}".`,
        };
      }
      return { shouldGenerate: false };
    },
  },
  {
    name: "Brain Dump / Note Created",
    evaluate(event) {
      if (event.eventType === "note_created") {
        return {
          shouldGenerate: true,
          reason: "Reflection Worthy",
          explanation: `New thought captured: "${event.metadata?.title || "Untitled Note"}".`,
        };
      }
      return { shouldGenerate: false };
    },
  },
  {
    name: "Note Edited",
    evaluate(event) {
      if (event.eventType === "note_edited") {
        return {
          shouldGenerate: true,
          reason: "Reflection Worthy",
          explanation: `Refined previously captured thought: "${event.metadata?.title || "Untitled Note"}".`,
        };
      }
      return { shouldGenerate: false };
    },
  },
];

export function registerRule(rule: CandidateRule) {
  rules.push(rule);
}
