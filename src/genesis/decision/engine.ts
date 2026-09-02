import { ReasoningResult } from "../reasoning";
import { DecisionStrategyRegistry } from "./registry";
import { Decision, DecisionCollection, DecisionType } from "./types";

/**
 * DecisionEngine
 *
 * CORE DESIGN PRINCIPLE:
 * The DecisionEngine is a pure orchestration layer. It consumes ReasoningResult,
 * obtains registered strategies from DecisionStrategyRegistry, executes them in
 * deterministic order, isolates strategy failures, and aggregates their outputs
 * into a frozen DecisionCollection.
 *
 * It must NOT make decisions itself, rank outputs, merge artifacts, filter artifacts,
 * execute actions, modify plans, access databases, or call LLMs.
 */
export class DecisionEngine {
  constructor(private readonly registry: DecisionStrategyRegistry) {}

  /**
   * Orchestrates the decision strategy execution pipeline.
   * Consumes a ReasoningResult and returns an aggregated DecisionCollection.
   *
   * Failure Isolation:
   * If a strategy throws an exception, execution continues with the remaining strategies.
   * The failing strategy's output is omitted without introducing placeholders.
   *
   * Determinism:
   * Strategies are executed in registry order (alphabetical by strategy ID).
   * Produced decision items are aggregated sequentially without secondary sorting.
   */
  public execute(reasoningResult: ReasoningResult): DecisionCollection {
    if (!reasoningResult) {
      throw new Error("ReasoningResult is required");
    }

    const strategies = this.registry.getStrategies();
    const aggregated: Decision[] = [];

    for (const strategy of strategies) {
      try {
        const results = strategy.decide(reasoningResult);
        if (results && Array.isArray(results)) {
          for (const item of results) {
            if (item && typeof item === "object" && item.id) {
              const validatedItem: Decision = Object.freeze({
                id: String(item.id),
                strategyId: String(item.strategyId || strategy.id),
                type: item.type as DecisionType,
                decision: String(item.decision || ""),
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
      decisions: Object.freeze(aggregated),
    });
  }
}
