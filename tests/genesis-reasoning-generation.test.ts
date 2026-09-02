import { describe, it, expect, beforeEach } from "vitest";
import {
  ReasoningEngine,
  createDefaultStrategyRegistry,
  DeductiveReasoningStrategy,
  ImplicationReasoningStrategy,
  SynthesisReasoningStrategy,
  ReasoningStrategyRegistry,
  ReasoningStrategy,
} from "../src/genesis/reasoning";
import { ReflectionResult, Reflection } from "../src/genesis/insights/reflection";

describe("GENESIS v2.23 — Milestone 2: Reasoning Generation", () => {
  describe("DeductiveReasoningStrategy", () => {
    let strategy: DeductiveReasoningStrategy;

    beforeEach(() => {
      strategy = new DeductiveReasoningStrategy();
    });

    it("should produce a valid deterministic deduction artifact from structured Pattern reflections", () => {
      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-pattern-1",
            strategyId: "pattern-strategy",
            type: "Pattern",
            insight: "pattern:type-recurrence:goal",
          },
        ],
      };

      const results = strategy.reason(reflectionResult);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("deduction-ref-pattern-1");
      expect(results[0].strategyId).toBe("deductive-strategy");
      expect(results[0].type).toBe("Deduction");
      expect(results[0].conclusion).toBe("deduction:pattern:type-recurrence:goal");
      expect(Object.isFrozen(results[0])).toBe(true);
    });

    it("should return an empty array when reflections contain insufficient evidence for deduction", () => {
      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-raw-1",
            strategyId: "raw-strategy",
            type: "Observation",
            insight: "Raw unformatted text without structured tokens",
          },
        ],
      };

      const results = strategy.reason(reflectionResult);
      expect(results).toHaveLength(0);
      expect(Object.isFrozen(results)).toBe(true);
    });

    it("should remain deterministic given identical reflection input", () => {
      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-p-1",
            strategyId: "pattern-strategy",
            type: "Pattern",
            insight: "pattern:type-recurrence:habit",
          },
        ],
      };

      const run1 = strategy.reason(reflectionResult);
      const run2 = strategy.reason(reflectionResult);

      expect(run1).toEqual(run2);
    });
  });

  describe("ImplicationReasoningStrategy", () => {
    let strategy: ImplicationReasoningStrategy;

    beforeEach(() => {
      strategy = new ImplicationReasoningStrategy();
    });

    it("should produce a valid deterministic implication artifact from structured Contradiction reflections", () => {
      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-contra-1",
            strategyId: "contradiction-strategy",
            type: "Contradiction",
            insight: "contradiction:conflict:prov-a:prov-b",
          },
        ],
      };

      const results = strategy.reason(reflectionResult);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("implication-ref-contra-1");
      expect(results[0].strategyId).toBe("implication-strategy");
      expect(results[0].type).toBe("Implication");
      expect(results[0].conclusion).toBe("implication:divergence:prov-a:prov-b");
      expect(Object.isFrozen(results[0])).toBe(true);
    });

    it("should return no result for unsupported reflections or missing explicit relationships", () => {
      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-obs-1",
            strategyId: "observation-strategy",
            type: "Observation",
            insight: "simple observation",
          },
        ],
      };

      const results = strategy.reason(reflectionResult);
      expect(results).toHaveLength(0);
    });
  });

  describe("SynthesisReasoningStrategy", () => {
    let strategy: SynthesisReasoningStrategy;

    beforeEach(() => {
      strategy = new SynthesisReasoningStrategy();
    });

    it("should produce a valid synthesis artifact when 2 or more reflections share an explicit domain key", () => {
      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-1",
            strategyId: "strat-1",
            type: "Pattern",
            insight: "pattern:type-recurrence:goal",
          },
          {
            id: "ref-2",
            strategyId: "strat-2",
            type: "Observation",
            insight: "observation:type-recurrence:goal",
          },
        ],
      };

      const results = strategy.reason(reflectionResult);

      expect(results).toHaveLength(1);
      expect(results[0].strategyId).toBe("synthesis-strategy");
      expect(results[0].type).toBe("Synthesis");
      expect(results[0].conclusion).toBe("synthesis:co-occurrence:type-recurrence:goal:ref-1+ref-2");
      expect(Object.isFrozen(results[0])).toBe(true);
    });

    it("should return an empty array when fewer than 2 reflections share an explicit relationship", () => {
      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-1",
            strategyId: "strat-1",
            type: "Pattern",
            insight: "pattern:topic-alpha",
          },
          {
            id: "ref-2",
            strategyId: "strat-2",
            type: "Observation",
            insight: "observation:topic-beta",
          },
        ],
      };

      const results = strategy.reason(reflectionResult);
      expect(results).toHaveLength(0);
    });
  });

  describe("Integration & Engine Orchestration", () => {
    it("should execute all built-in strategies via createDefaultStrategyRegistry and preserve execution order", () => {
      const registry = createDefaultStrategyRegistry();
      const engine = new ReasoningEngine(registry);

      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-p1",
            strategyId: "pattern-strategy",
            type: "Pattern",
            insight: "pattern:type-recurrence:habit",
          },
          {
            id: "ref-c1",
            strategyId: "contradiction-strategy",
            type: "Contradiction",
            insight: "contradiction:conflict:source-x:source-y",
          },
        ],
      };

      const collection = engine.execute(reflectionResult);

      // Strategy execution order (alphabetical by strategy ID):
      // 1. deductive-strategy -> produces deduction-ref-p1
      // 2. implication-strategy -> produces implication-ref-c1
      // 3. synthesis-strategy -> 0 (no >= 2 matching domain keys)
      expect(collection.reasoning).toHaveLength(2);
      expect(collection.reasoning[0].strategyId).toBe("deductive-strategy");
      expect(collection.reasoning[0].type).toBe("Deduction");
      expect(collection.reasoning[0].conclusion).toBe("deduction:pattern:type-recurrence:habit");

      expect(collection.reasoning[1].strategyId).toBe("implication-strategy");
      expect(collection.reasoning[1].type).toBe("Implication");
      expect(collection.reasoning[1].conclusion).toBe("implication:divergence:source-x:source-y");

      expect(Object.isFrozen(collection)).toBe(true);
      expect(Object.isFrozen(collection.reasoning)).toBe(true);
    });

    it("should handle empty ReflectionResult by returning an empty ReasoningCollection", () => {
      const registry = createDefaultStrategyRegistry();
      const engine = new ReasoningEngine(registry);

      const collection = engine.execute({ items: [] });
      expect(collection.reasoning).toHaveLength(0);
      expect(Object.isFrozen(collection)).toBe(true);
    });

    it("should isolate strategy failures when a strategy throws an exception", () => {
      const registry = new ReasoningStrategyRegistry();

      // Register default strategies + a failing strategy
      const failingStrategy: ReasoningStrategy = {
        id: "a-failing-strategy", // Alphabetically executes first
        reason: () => {
          throw new Error("Strategy exception");
        },
      };

      registry.register(failingStrategy);
      registry.register(new DeductiveReasoningStrategy());

      const engine = new ReasoningEngine(registry);

      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-p1",
            strategyId: "pattern-strategy",
            type: "Pattern",
            insight: "pattern:type-recurrence:habit",
          },
        ],
      };

      const collection = engine.execute(reflectionResult);

      // Failing strategy output is omitted; deductive strategy succeeds
      expect(collection.reasoning).toHaveLength(1);
      expect(collection.reasoning[0].strategyId).toBe("deductive-strategy");
      expect(collection.reasoning[0].conclusion).toBe("deduction:pattern:type-recurrence:habit");
    });
  });
});
