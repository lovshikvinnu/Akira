import { MemoryEvent } from "../../shared/types/event-types";
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
    name: "Entity Deleted",
    evaluate(event) {
      if (event.eventType === "project_deleted" || event.eventType === "note_deleted") {
        return {
          shouldGenerate: true,
          reason: "Milestone",
          explanation:
            "The user deleted something. Recorded so cognition can stop describing it as " +
            "current work without any of its history being removed.",
        };
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
    /**
     * A declaration the user made in conversation, already confirmed.
     *
     * The gate is upstream, in `chatDeclarationPromoter`: a raw `chat_message`
     * matches no rule in this file and therefore becomes no memory, and only a
     * turn that `parseDeclaration` recognised is re-recorded as
     * `declaration_captured`. So this rule does not decide whether the turn
     * mattered -- it records that something already decided it did.
     *
     * `reason` is "Reflection Worthy" rather than a new `CandidateReason`.
     * A declaration is a reflection about oneself, so the reflections arc is
     * where it belongs, and the structured thing that distinguishes it from a
     * written note is `eventType`, which the candidate carries unchanged.
     */
    name: "Declaration Captured",
    evaluate(event) {
      if (event.eventType === "declaration_captured") {
        return {
          shouldGenerate: true,
          reason: "Reflection Worthy",
          explanation: `Declaration made in conversation: "${event.description}".`,
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
