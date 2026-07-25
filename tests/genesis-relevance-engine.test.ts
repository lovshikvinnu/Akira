import { describe, it, expect, beforeEach } from "vitest";
import {
  RelevanceStrategyRegistry,
  RelevanceEngine,
  DefaultRelevanceStrategy,
  AverageScoreAggregator,
  RelevanceStrategy,
  ScoreAggregator,
  ScoredContextCollection,
} from "../src/genesis/context/relevance";
import { ContextCollection, ContextRequest } from "../src/genesis/context/intelligence";

describe("GENESIS v2.21 — Relevance Engine Subsystem", () => {
  let registry: RelevanceStrategyRegistry;
  let engine: RelevanceEngine;

  beforeEach(() => {
    registry = new RelevanceStrategyRegistry();
    engine = new RelevanceEngine(registry);
  });

  describe("RelevanceStrategyRegistry", () => {
    it("should allow registering a valid strategy", () => {
      const strategy: RelevanceStrategy = {
        id: "strat-1",
        evaluate: () => 1.0,
      };

      registry.register(strategy);
      const strategies = registry.getStrategies();

      expect(strategies).toHaveLength(1);
      expect(strategies[0].id).toBe("strat-1");
    });

    it("should reject duplicate strategy IDs with an error", () => {
      const strategy1: RelevanceStrategy = { id: "strat-dup", evaluate: () => 1.0 };
      const strategy2: RelevanceStrategy = { id: "strat-dup", evaluate: () => 0.5 };

      registry.register(strategy1);
      expect(() => registry.register(strategy2)).toThrow(/Duplicate strategy ID registered/);
    });

    it("should return registered strategies in alphabetical order by ID", () => {
      const strategyC: RelevanceStrategy = { id: "strat-c", evaluate: () => 0.3 };
      const strategyA: RelevanceStrategy = { id: "strat-a", evaluate: () => 0.1 };
      const strategyB: RelevanceStrategy = { id: "strat-b", evaluate: () => 0.2 };

      registry.register(strategyC);
      registry.register(strategyA);
      registry.register(strategyB);

      const strategies = registry.getStrategies();
      expect(strategies).toHaveLength(3);
      expect(strategies[0].id).toBe("strat-a");
      expect(strategies[1].id).toBe("strat-b");
      expect(strategies[2].id).toBe("strat-c");
    });

    it("should expose an immutable strategies collection", () => {
      const strategy: RelevanceStrategy = { id: "strat-1", evaluate: () => 1.0 };
      registry.register(strategy);

      const strategies = registry.getStrategies();
      expect(Object.isFrozen(strategies)).toBe(true);
      expect(() => (strategies as any).push({ id: "malicious" })).toThrow();
    });
  });

  describe("AverageScoreAggregator", () => {
    const aggregator = new AverageScoreAggregator();

    it("should return 0.0 for an empty scores list", () => {
      expect(aggregator.aggregate([])).toBe(0.0);
    });

    it("should compute the arithmetic mean correctly", () => {
      expect(aggregator.aggregate([1.0, 0.5, 0.0])).toBe(0.5);
      expect(aggregator.aggregate([0.8, 0.2])).toBe(0.5);
      expect(aggregator.aggregate([0.3])).toBe(0.3);
    });
  });

  describe("DefaultRelevanceStrategy (Validation Strategy)", () => {
    const validationStrategy = new DefaultRelevanceStrategy();

    it("should score 1.0 if query is contained in candidate content (case-insensitive)", () => {
      const request: ContextRequest = { query: "Akira" };
      const candidate = {
        id: "c1",
        providerId: "p1",
        type: "note",
        content: "Project Akira is awesome",
      };

      expect(validationStrategy.evaluate(request, candidate)).toBe(1.0);
    });

    it("should score 0.0 if query is not in candidate content", () => {
      const request: ContextRequest = { query: "Viper" };
      const candidate = {
        id: "c1",
        providerId: "p1",
        type: "note",
        content: "Project Akira is awesome",
      };

      expect(validationStrategy.evaluate(request, candidate)).toBe(0.0);
    });

    it("should return 0.0 for empty or invalid requests/candidates", () => {
      expect(
        validationStrategy.evaluate(
          { query: "" },
          { id: "c1", providerId: "p1", type: "note", content: "hello" },
        ),
      ).toBe(0.0);
      expect(
        validationStrategy.evaluate(
          { query: "hello" },
          { id: "c1", providerId: "p1", type: "note", content: "" },
        ),
      ).toBe(0.0);
    });
  });

  describe("RelevanceEngine", () => {
    it("should score contexts using DefaultRelevanceStrategy", () => {
      registry.register(new DefaultRelevanceStrategy());

      const request: ContextRequest = { query: "akira" };
      const collection: ContextCollection = {
        contexts: [
          { id: "c1", providerId: "prov-1", type: "note", content: "Welcome to AKIRA OS" },
          { id: "c2", providerId: "prov-1", type: "goal", content: "Build standard features" },
        ],
      };

      const result = engine.scoreContext(request, collection);

      expect(result.scoredContexts).toHaveLength(2);
      // c1 should match, score 1.0
      // c2 should not match, score 0.0
      expect(result.scoredContexts[0].context.id).toBe("c1");
      expect(result.scoredContexts[0].score).toBe(1.0);

      expect(result.scoredContexts[1].context.id).toBe("c2");
      expect(result.scoredContexts[1].score).toBe(0.0);
    });

    it("should support custom aggregators", () => {
      const maxAggregator: ScoreAggregator = {
        aggregate: (scores) => (scores.length === 0 ? 0.0 : Math.max(...scores)),
      };
      const maxEngine = new RelevanceEngine(registry, maxAggregator);

      registry.register({ id: "strat-1", evaluate: () => 0.2 });
      registry.register({ id: "strat-2", evaluate: () => 0.8 });

      const request: ContextRequest = { query: "test" };
      const collection: ContextCollection = {
        contexts: [{ id: "c1", providerId: "prov-1", type: "note", content: "test" }],
      };

      const result = maxEngine.scoreContext(request, collection);
      // Expect 0.8 (max of 0.2 and 0.8) rather than 0.5 (average)
      expect(result.scoredContexts[0].score).toBe(0.8);
    });

    it("should clamp final scores to the normalized [0.0, 1.0] range", () => {
      // Register a strategy that returns a score out of range
      registry.register({ id: "strat-over", evaluate: () => 1.5 });
      registry.register({ id: "strat-under", evaluate: () => -0.5 });

      const request: ContextRequest = { query: "test" };
      const collection: ContextCollection = {
        contexts: [
          { id: "c1", providerId: "p1", type: "note", content: "c1" },
          { id: "c2", providerId: "p2", type: "note", content: "c2" },
        ],
      };

      // Set up a custom aggregator that doesn't check bounds to test engine's clamping
      const simplePassThrough: ScoreAggregator = {
        aggregate: (scores) => scores[0], // returns 1.5 for c1 (strat-over is first alphabetically)
      };

      const clampingEngine = new RelevanceEngine(registry, simplePassThrough);
      const result = clampingEngine.scoreContext(request, collection);

      // Verify strat-over (1.5) is clamped to 1.0
      expect(result.scoredContexts.find((c) => c.context.id === "c1")?.score).toBe(1.0);

      // Let's verify strat-under (-0.5) is clamped to 0.0. To target strat-under specifically:
      const reversePassThrough: ScoreAggregator = {
        aggregate: (scores) => scores[1], // returns -0.5 for strat-under (second alphabetically)
      };
      const clampingEngineUnder = new RelevanceEngine(registry, reversePassThrough);
      const resultUnder = clampingEngineUnder.scoreContext(request, collection);
      expect(resultUnder.scoredContexts.find((c) => c.context.id === "c1")?.score).toBe(0.0);
    });

    it("should handle empty-registry behavior by returning 0.0 scores deterministically", () => {
      // No strategies registered
      const request: ContextRequest = { query: "test" };
      const collection: ContextCollection = {
        contexts: [
          { id: "c2", providerId: "p-b", type: "note", content: "item 2" },
          { id: "c1", providerId: "p-a", type: "note", content: "item 1" },
        ],
      };

      const result = engine.scoreContext(request, collection);

      expect(result.scoredContexts).toHaveLength(2);
      expect(result.scoredContexts[0].score).toBe(0.0);
      expect(result.scoredContexts[1].score).toBe(0.0);
      // Check deterministic tie-break ordering (providerId, then context id)
      expect(result.scoredContexts[0].context.id).toBe("c1");
      expect(result.scoredContexts[1].context.id).toBe("c2");
    });

    it("should isolate strategy failures and treat them as contributing 0.0 score", () => {
      registry.register({ id: "strat-good", evaluate: () => 1.0 });
      registry.register({
        id: "strat-crash",
        evaluate: () => {
          throw new Error("Crash");
        },
      });

      const request: ContextRequest = { query: "test" };
      const collection: ContextCollection = {
        contexts: [{ id: "c1", providerId: "p1", type: "note", content: "c1" }],
      };

      const result = engine.scoreContext(request, collection);
      // strat-good = 1.0, strat-crash = 0.0 (isolated error). Average = 0.5.
      expect(result.scoredContexts[0].score).toBe(0.5);
    });

    it("should return a fully frozen ScoredContextCollection", () => {
      registry.register(new DefaultRelevanceStrategy());

      const request: ContextRequest = { query: "test" };
      const collection: ContextCollection = {
        contexts: [{ id: "c1", providerId: "p1", type: "note", content: "test" }],
      };

      const result = engine.scoreContext(request, collection);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.scoredContexts)).toBe(true);
      expect(Object.isFrozen(result.scoredContexts[0])).toBe(true);
    });

    it("should sort results deterministically by score (descending), providerId, then context id", () => {
      // Register custom strategies to generate specific scores
      registry.register({
        id: "strat-custom",
        evaluate: (req, cand) => {
          if (cand.id === "c-high") return 0.9;
          if (cand.id === "c-mid-1") return 0.5;
          if (cand.id === "c-mid-2") return 0.5;
          return 0.1; // c-low
        },
      });

      const request: ContextRequest = { query: "test" };
      const collection: ContextCollection = {
        contexts: [
          // Order in input is jumbled
          { id: "c-mid-2", providerId: "p-b", type: "note", content: "mid 2" },
          { id: "c-low", providerId: "p-a", type: "note", content: "low" },
          { id: "c-high", providerId: "p-a", type: "note", content: "high" },
          { id: "c-mid-1", providerId: "p-a", type: "note", content: "mid 1" },
        ],
      };

      const result = engine.scoreContext(request, collection);

      expect(result.scoredContexts).toHaveLength(4);

      // 1. High score (0.9)
      expect(result.scoredContexts[0].context.id).toBe("c-high");
      expect(result.scoredContexts[0].score).toBe(0.9);

      // 2. Mid score (0.5), tie-broken by providerId:
      // c-mid-1 is provider p-a, c-mid-2 is provider p-b
      expect(result.scoredContexts[1].context.id).toBe("c-mid-1");
      expect(result.scoredContexts[1].score).toBe(0.5);

      expect(result.scoredContexts[2].context.id).toBe("c-mid-2");
      expect(result.scoredContexts[2].score).toBe(0.5);

      // 3. Low score (0.1)
      expect(result.scoredContexts[3].context.id).toBe("c-low");
      expect(result.scoredContexts[3].score).toBe(0.1);
    });
  });
});
