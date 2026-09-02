import { ReflectionResult } from "../../insights/reflection";
import { Reasoning, ReasoningStrategy } from "../types";

/**
 * SynthesisReasoningStrategy
 *
 * Purpose:
 * Combines multiple related reflections into a higher-level structured conclusion when
 * an explicit deterministic relationship is established between them.
 *
 * Rules & Evidence Requirements:
 * - Does NOT treat reflections as related merely because they share strategyId or type.
 * - Requires explicit shared target entity or domain key tokens within normalized reflection insights.
 * - If fewer than 2 reflections share an explicit deterministic relationship, returns no reasoning artifact.
 */
export class SynthesisReasoningStrategy implements ReasoningStrategy {
  public readonly id = "synthesis-strategy";

  public reason(reflectionResult: ReflectionResult): readonly Reasoning[] {
    if (!reflectionResult || !reflectionResult.items) {
      return [];
    }

    // Map to group reflections by explicit domain payload keys
    const domainGroups = new Map<string, string[]>();

    for (const item of reflectionResult.items) {
      if (!item || !item.insight) {
        continue;
      }

      // Extract explicit target entity or domain key token from structured insight
      // e.g. "pattern:type-recurrence:goal" -> payload "type-recurrence:goal"
      // or "observation:entity:123" -> payload "entity:123"
      const parts = item.insight.split(":");
      if (parts.length >= 2) {
        const targetKey = parts.slice(1).join(":");
        if (!domainGroups.has(targetKey)) {
          domainGroups.set(targetKey, []);
        }
        domainGroups.get(targetKey)!.push(item.id);
      }
    }

    const reasoningArtifacts: Reasoning[] = [];
    const sortedKeys = Array.from(domainGroups.keys()).sort();

    for (const key of sortedKeys) {
      const refIds = domainGroups.get(key)!;
      if (refIds.length >= 2) {
        const sortedIds = [...refIds].sort();
        const reasoning: Reasoning = {
          id: `synthesis-${key.replace(/[:/]/g, "-")}`,
          strategyId: this.id,
          type: "Synthesis",
          conclusion: `synthesis:co-occurrence:${key}:${sortedIds.join("+")}`,
        };
        reasoningArtifacts.push(Object.freeze(reasoning));
      }
    }

    return Object.freeze(reasoningArtifacts);
  }
}
