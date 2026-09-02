import { ReflectionResult } from "../../insights/reflection";
import { Reasoning, ReasoningStrategy } from "../types";

/**
 * ImplicationReasoningStrategy
 *
 * Purpose:
 * Identifies explicit implications represented by normalized reflection structures.
 *
 * Rules & Evidence Requirements:
 * - Operates strictly over explicit structured relationships present in normalized reflection data.
 * - Does NOT introduce planning or action semantics (e.g. "requires resolution").
 * - Returns no reasoning artifact if an implication cannot be established deterministically.
 */
export class ImplicationReasoningStrategy implements ReasoningStrategy {
  public readonly id = "implication-strategy";

  public reason(reflectionResult: ReflectionResult): readonly Reasoning[] {
    if (!reflectionResult || !reflectionResult.items) {
      return [];
    }

    const reasoningArtifacts: Reasoning[] = [];

    for (const item of reflectionResult.items) {
      if (!item || !item.type || !item.insight) {
        continue;
      }

      // Check for structured Contradiction reflections with explicit provider conflicts
      // (e.g. "contradiction:conflict:provA:provB")
      if (item.type === "Contradiction" && item.insight.startsWith("contradiction:conflict:")) {
        const providers = item.insight.substring("contradiction:conflict:".length);
        const reasoning: Reasoning = {
          id: `implication-${item.id}`,
          strategyId: this.id,
          type: "Implication",
          conclusion: `implication:divergence:${providers}`,
        };
        reasoningArtifacts.push(Object.freeze(reasoning));
      }
    }

    return Object.freeze(reasoningArtifacts);
  }
}
