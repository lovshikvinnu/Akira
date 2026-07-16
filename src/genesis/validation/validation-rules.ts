import { MemoryCandidate } from "../candidate/candidate";

export type ValidationOutcome = "Promote" | "Hold" | "Reject";

export interface ValidationRule {
  name: string;
  evaluate(candidate: MemoryCandidate): {
    outcome: ValidationOutcome;
    explanation?: string;
  };
}

export const validationRules: ValidationRule[] = [
  {
    name: "Milestone Validation Rule",
    evaluate(candidate) {
      if (candidate.reason === "Milestone") {
        return {
          outcome: "Promote",
          explanation: `Milestone candidate "${candidate.title}" promoted immediately.`,
        };
      }
      return { outcome: "Hold" };
    },
  },
  {
    name: "Goal Progress Validation Rule",
    evaluate(candidate) {
      if (candidate.reason === "Goal Progress") {
        const title = (candidate.title || "").toLowerCase().trim();
        // Reject if the title is generic, blank, or typical test values
        if (!title || title === "test" || title.includes("untitled") || title.includes("temp")) {
          return {
            outcome: "Reject",
            explanation: `Rejected generic or blank goal completion task: "${candidate.title}".`,
          };
        }
        return {
          outcome: "Promote",
          explanation: `Goal progress candidate "${candidate.title}" promoted.`,
        };
      }
      return { outcome: "Hold" };
    },
  },
  {
    name: "Reflection Validation Rule",
    evaluate(candidate) {
      if (candidate.reason === "Reflection Worthy") {
        const description = (candidate.description || "").trim();
        // Hold if note content or description is empty (needs more depth)
        if (
          !description ||
          (description.toLowerCase().includes("raw thought") && !candidate.metadata?.title)
        ) {
          return {
            outcome: "Hold",
            explanation: `Held captured reflection due to insufficient content/context.`,
          };
        }
        return {
          outcome: "Promote",
          explanation: `Reflection candidate promoted: "${candidate.title}".`,
        };
      }
      return { outcome: "Hold" };
    },
  },
  {
    name: "Activity Validation Rule",
    evaluate(candidate) {
      if (candidate.reason === "Repeated Activity") {
        const desc = (candidate.description || "").toLowerCase();
        // Hold repeated activity if work telemetry indicates 0 minutes
        if (desc.includes("0 minutes")) {
          return {
            outcome: "Hold",
            explanation: `Held repeated work activity because duration was recorded as zero.`,
          };
        }
        return {
          outcome: "Promote",
          explanation: `Work session candidate promoted: "${candidate.title}".`,
        };
      }
      return { outcome: "Hold" };
    },
  },
];

export function registerValidationRule(rule: ValidationRule) {
  validationRules.unshift(rule); // add to front so custom rules override defaults
}
