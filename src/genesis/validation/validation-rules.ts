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

        // Whether the user gave this note any substance, asked structurally.
        //
        // This used to test `description.includes("raw thought")`, which worked
        // only because the description was a generated wrapper -- the string was
        // the translator's, so matching it was matching our own output. Now that
        // the description carries the user's own words, that test would read
        // whatever they wrote: a note saying "just a raw thought" would be held
        // for containing the phrase. The fields themselves answer the question.
        const body =
          typeof candidate.metadata?.content === "string" ? candidate.metadata.content : "";
        const hasSubstance = body.trim().length > 0 || Boolean(candidate.metadata?.title);

        // The description test survives only as the fallback for a candidate
        // carrying no such fields: an event recorded before `content` existed
        // and replayed from the durable stream, or one recorded directly
        // through `eventService.record`, which several callers do. For those the
        // wrapper is still ours, so matching it is still matching our own
        // output and the outcome is unchanged.
        const looksEmpty = hasSubstance ? false : description.toLowerCase().includes("raw thought");

        if (!description || looksEmpty) {
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
