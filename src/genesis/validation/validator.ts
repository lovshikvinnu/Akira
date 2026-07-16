import { MemoryCandidate } from "../candidate/candidate";
import { ValidationOutcome, validationRules } from "./validation-rules";

export const validator = {
  /**
   * Evaluate a Memory Candidate against validation rules and determine its promotion outcome.
   */
  validate(candidate: MemoryCandidate): { outcome: ValidationOutcome; explanation: string } {
    for (const rule of validationRules) {
      const result = rule.evaluate(candidate);
      if (result.outcome !== "Hold") {
        return {
          outcome: result.outcome,
          explanation:
            result.explanation ||
            `Candidate processed by rule "${rule.name}" with outcome ${result.outcome}.`,
        };
      }
    }

    // Default outcome if all rules return Hold is to remain on Hold
    return {
      outcome: "Hold",
      explanation: "Candidate held awaiting further reinforcing activities or context.",
    };
  },
};
