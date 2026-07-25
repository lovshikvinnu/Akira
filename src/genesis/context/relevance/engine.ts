import { ContextCollection, ContextRequest } from "../intelligence/types";
import { RelevanceStrategyRegistry } from "./registry";
import { ScoreAggregator, ScoredContext, ScoredContextCollection } from "./types";
import { AverageScoreAggregator } from "./aggregators";

export class RelevanceEngine {
  constructor(
    private readonly registry: RelevanceStrategyRegistry,
    private readonly aggregator: ScoreAggregator = new AverageScoreAggregator(),
  ) {}

  /**
   * Evaluates and scores candidate contexts from a ContextCollection against the
   * registered strategies.
   *
   * Empty Registry Behavior:
   * If no strategies are registered, all candidates receive a score of 0.0,
   * preserving deterministic behavior without introducing special-case failures.
   *
   * Clamping:
   * All final aggregated scores are clamped to [0.0, 1.0] for safety and range uniformity.
   *
   * Deterministic Sorting Policy:
   * Scored contexts are returned sorted by:
   *   1. Score descending
   *   2. providerId alphabetically (ascending)
   *   3. context id alphabetically (ascending)
   */
  public scoreContext(
    request: ContextRequest,
    collection: ContextCollection,
  ): ScoredContextCollection {
    if (!request) {
      throw new Error("ContextRequest is required");
    }
    if (!collection) {
      throw new Error("ContextCollection is required");
    }

    const strategies = this.registry.getStrategies();
    const scoredContexts: ScoredContext[] = [];

    for (const candidate of collection.contexts) {
      // Collect scores from all registered strategies
      const scores: number[] = [];

      for (const strategy of strategies) {
        try {
          const score = strategy.evaluate(request, candidate);
          scores.push(typeof score === "number" ? score : 0.0);
        } catch (error) {
          // Failure isolation at the strategy execution level:
          // Treat strategy failure as 0.0 contribution to ensure robustness
          scores.push(0.0);
        }
      }

      // Aggregate individual strategy scores
      const rawScore = this.aggregator.aggregate(scores);

      // Clamp score to [0.0, 1.0]
      const clampedScore = Math.max(0.0, Math.min(1.0, rawScore));

      const scoredItem: ScoredContext = {
        context: candidate,
        score: clampedScore,
      };

      scoredContexts.push(Object.freeze(scoredItem));
    }

    // Deterministic sorting: score (descending), then providerId, then context id
    const sorted = [...scoredContexts].sort((a, b) => {
      // Score descending
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // providerId ascending
      const providerCompare = a.context.providerId.localeCompare(b.context.providerId);
      if (providerCompare !== 0) {
        return providerCompare;
      }
      // id ascending
      return a.context.id.localeCompare(b.context.id);
    });

    return Object.freeze({
      scoredContexts: Object.freeze(sorted),
    });
  }
}

// Global default instances
import { relevanceStrategyRegistry } from "./registry";
export const relevanceEngine = new RelevanceEngine(relevanceStrategyRegistry);
