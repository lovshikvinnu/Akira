import { ReflectionResult } from "../insights/reflection";
import { ReasoningStrategyRegistry } from "./registry";
import { Reasoning, ReasoningCollection } from "./types";

/**
 * ReasoningEngine
 *
 * CORE DESIGN PRINCIPLE:
 * The ReasoningEngine is a pure orchestration layer. It consumes ReflectionResult,
 * obtains registered strategies from ReasoningStrategyRegistry, executes them in
 * deterministic order, isolates strategy failures, and aggregates their outputs
 * into a frozen ReasoningCollection.
 *
 * It must NOT interpret reflections, rank outputs, merge artifacts, filter artifacts,
 * rewrite/summarize conclusions, perform planning, make decisions, or call an LLM.
 */
export class ReasoningEngine {
  constructor(private readonly registry: ReasoningStrategyRegistry) {}

  /**
   * Orchestrates the reasoning strategy execution pipeline.
   * Consumes a ReflectionResult and returns an aggregated ReasoningCollection.
   *
   * Failure Isolation:
   * If a strategy throws an exception, execution continues with the remaining strategies.
   * The failing strategy's output is omitted without introducing placeholders.
   *
   * Determinism:
   * Strategies are executed in registry order (alphabetical by strategy ID).
   * Produced reasoning items are aggregated sequentially without secondary sorting.
   */
  public execute(reflectionResult: ReflectionResult): ReasoningCollection {
    if (!reflectionResult) {
      throw new Error("ReflectionResult is required");
    }

    const strategies = this.registry.getStrategies();
    const aggregated: Reasoning[] = [];

    for (const strategy of strategies) {
      try {
        const results = strategy.reason(reflectionResult);
        if (results && Array.isArray(results)) {
          for (const item of results) {
            if (item && typeof item === "object" && item.id) {
              const validatedItem: Reasoning = Object.freeze({
                id: String(item.id),
                strategyId: String(item.strategyId || strategy.id),
                type: item.type as ReasoningType,
                conclusion: String(item.conclusion || ""),
              });
              aggregated.push(validatedItem);
            }
          }
        }
      } catch (error) {
        // Strategy Failure Isolation: catch and isolate strategy-level errors.
        // As per purity constraints, no logging, event emission, or telemetry is performed.
      }
    }

    return Object.freeze({
      reasoning: Object.freeze(aggregated),
    });
  }
}
