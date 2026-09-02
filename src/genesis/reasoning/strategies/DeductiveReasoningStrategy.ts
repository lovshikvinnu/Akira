import { ReflectionResult } from "../../insights/reflection";
import { Reasoning, ReasoningStrategy } from "../types";

/**
 * DeductiveReasoningStrategy
 *
 * Purpose:
 * Identifies direct conclusions deterministically derived from structured reflections.
 * Operates strictly over normalized Reflection data without LLMs, heuristics, or natural language guessing.
 *
 * Rules & Evidence Requirements:
 * - Evaluates Pattern and Observation reflections that contain explicit structured insight tokens (e.g. starting with "pattern:").
 * - Returns no reasoning artifact if the reflection structure does not explicitly support a deduction.
 */
export class DeductiveReasoningStrategy implements ReasoningStrategy {
  public readonly id = "deductive-strategy";

  public reason(reflectionResult: ReflectionResult): readonly Reasoning[] {
    if (!reflectionResult || !reflectionResult.items) {
      return [];
    }

    const reasoningArtifacts: Reasoning[] = [];

    for (const item of reflectionResult.items) {
      if (!item || !item.type || !item.insight) {
        continue;
      }

      // Check for structured Pattern reflections (e.g. "pattern:type-recurrence:<type>")
      if (item.type === "Pattern" && item.insight.startsWith("pattern:")) {
        const payload = item.insight.substring("pattern:".length);
        const reasoning: Reasoning = {
          id: `deduction-${item.id}`,
          strategyId: this.id,
          type: "Deduction",
          conclusion: `deduction:pattern:${payload}`,
        };
        reasoningArtifacts.push(Object.freeze(reasoning));
      }
    }

    return Object.freeze(reasoningArtifacts);
  }
}
