import { ContextAssemblyResult } from "../../../context/assembly/types";
import { ReflectionStrategyRegistry } from "./registry";
import { Reflection, ReflectionCollection } from "./types";

/**
 * ReflectionEngine
 *
 * CORE DESIGN PRINCIPLE:
 * The ReflectionEngine is a pure orchestrator. It must not interpret, merge, rank,
 * summarize, or otherwise transform reflections beyond aggregation.
 */
export class ReflectionEngine {
  constructor(private readonly registry: ReflectionStrategyRegistry) {}

  /**
   * Orchestrates the reflection execution pipeline.
   * Accepts a ContextAssemblyResult and aggregates produced reflections into a ReflectionCollection.
   *
   * Failure Isolation:
   * If a strategy throws an exception, execution continues with the remaining strategies.
   * Only the failing strategy's output is omitted (no placeholders are introduced).
   *
   * Determinism and Ordering:
   * Preservation of reflection ordering exactly as produced by strategy execution is guaranteed.
   * Outputs of each strategy are concatenated in deterministic registry execution order without
   * applying any additional sorting.
   */
  public execute(context: ContextAssemblyResult): ReflectionCollection {
    if (!context) {
      throw new Error("ContextAssemblyResult is required");
    }

    const strategies = this.registry.getStrategies();
    const aggregated: Reflection[] = [];

    for (const strategy of strategies) {
      try {
        const results = strategy.reflect(context);
        if (results && Array.isArray(results)) {
          for (const item of results) {
            if (item && typeof item === "object" && item.id) {
              const validatedItem: Reflection = {
                id: String(item.id),
                strategyId: String(item.strategyId || strategy.id),
                type: String(item.type || ""),
                insight: String(item.insight || ""),
              };
              aggregated.push(Object.freeze(validatedItem));
            }
          }
        }
      } catch (error) {
        // Strategy Failure Isolation: catch and isolate strategy-level errors.
        // As per purity constraints, we do not log, publish events, or emit telemetry.
      }
    }

    return Object.freeze({
      reflections: Object.freeze(aggregated),
    });
  }
}
