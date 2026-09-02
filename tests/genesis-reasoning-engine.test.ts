import { describe, it, expect, beforeEach } from "vitest";
import {
  ReasoningStrategyRegistry,
  ReasoningEngine,
  ReasoningStrategy,
  Reasoning,
} from "../src/genesis/reasoning";
import { ReflectionResult } from "../src/genesis/insights/reflection";

describe("GENESIS v2.23 — Reasoning Engine Foundation", () => {
  let registry: ReasoningStrategyRegistry;
  let engine: ReasoningEngine;

  beforeEach(() => {
    registry = new ReasoningStrategyRegistry();
    engine = new ReasoningEngine(registry);
  });

  describe("ReasoningStrategyRegistry", () => {
    it("should allow registering a valid strategy", () => {
      const strategy: ReasoningStrategy = {
        id: "strat-1",
        reason: () => [],
      };

      registry.register(strategy);
      const strategies = registry.getStrategies();

      expect(strategies).toHaveLength(1);
      expect(strategies[0].id).toBe("strat-1");
    });

    it("should reject duplicate strategy IDs with a clear error", () => {
      const strategy1: ReasoningStrategy = { id: "strat-dup", reason: () => [] };
      const strategy2: ReasoningStrategy = { id: "strat-dup", reason: () => [] };

      registry.register(strategy1);
      expect(() => registry.register(strategy2)).toThrow(
        /Duplicate strategy ID registered: strat-dup/
      );
    });

    it("should reject invalid strategies", () => {
      expect(() => registry.register(null as any)).toThrow(/Cannot register null or undefined strategy/);
      expect(() => registry.register({ id: "" } as any)).toThrow(/Strategy must have a valid non-empty ID/);
      expect(() => registry.register({ id: "   " } as any)).toThrow(/Strategy must have a valid non-empty ID/);
    });

    it("should return registered strategies in deterministic alphabetical order by ID", () => {
      const strategyC: ReasoningStrategy = { id: "strat-c", reason: () => [] };
      const strategyA: ReasoningStrategy = { id: "strat-a", reason: () => [] };
      const strategyB: ReasoningStrategy = { id: "strat-b", reason: () => [] };

      registry.register(strategyC);
      registry.register(strategyA);
      registry.register(strategyB);

      const strategies = registry.getStrategies();
      expect(strategies).toHaveLength(3);
      expect(strategies[0].id).toBe("strat-a");
      expect(strategies[1].id).toBe("strat-b");
      expect(strategies[2].id).toBe("strat-c");
    });

    it("should expose an immutable strategy collection", () => {
      const strategy: ReasoningStrategy = { id: "strat-1", reason: () => [] };
      registry.register(strategy);

      const strategies = registry.getStrategies();
      expect(Object.isFrozen(strategies)).toBe(true);
      expect(() => (strategies as any).push({ id: "malicious" })).toThrow();
    });

    it("should allow clearing registered strategies", () => {
      const strategy: ReasoningStrategy = { id: "strat-1", reason: () => [] };
      registry.register(strategy);
      expect(registry.getStrategies()).toHaveLength(1);

      registry.clear();
      expect(registry.getStrategies()).toHaveLength(0);
    });
  });

  describe("ReasoningEngine", () => {
    const mockReflectionResult: ReflectionResult = {
      items: [
        {
          id: "ref-1",
          strategyId: "ref-strat-1",
          type: "Observation",
          insight: "User completed task quickly",
        },
      ],
    };

    it("should throw an error if ReflectionResult is missing", () => {
      expect(() => engine.execute(null as any)).toThrow(/ReflectionResult is required/);
    });

    it("should handle empty-registry behavior by returning an empty frozen collection", () => {
      const result = engine.execute(mockReflectionResult);
      expect(result.reasoning).toHaveLength(0);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.reasoning)).toBe(true);
    });

    it("should aggregate reasoning artifacts from multiple strategies in deterministic strategy execution order", () => {
      const strategyA: ReasoningStrategy = {
        id: "strat-a",
        reason: (reflectionResult) => [
          {
            id: "reason-1",
            strategyId: "strat-a",
            type: "Deduction",
            conclusion: `Derived from ${reflectionResult.items.length} reflections`,
          },
        ],
      };

      const strategyB: ReasoningStrategy = {
        id: "strat-b",
        reason: () => [
          {
            id: "reason-2",
            strategyId: "strat-b",
            type: "Synthesis",
            conclusion: "Focus level is optimal",
          },
        ],
      };

      // Register strategy B first, then strategy A
      registry.register(strategyB);
      registry.register(strategyA);

      const result = engine.execute(mockReflectionResult);

      // Deterministic order: strat-a executes first, then strat-b
      expect(result.reasoning).toHaveLength(2);
      expect(result.reasoning[0].id).toBe("reason-1");
      expect(result.reasoning[0].strategyId).toBe("strat-a");
      expect(result.reasoning[0].type).toBe("Deduction");
      expect(result.reasoning[0].conclusion).toBe("Derived from 1 reflections");

      expect(result.reasoning[1].id).toBe("reason-2");
      expect(result.reasoning[1].strategyId).toBe("strat-b");
      expect(result.reasoning[1].type).toBe("Synthesis");
      expect(result.reasoning[1].conclusion).toBe("Focus level is optimal");
    });

    it("should preserve output order within each strategy sequentially without secondary sorting", () => {
      const strategyB: ReasoningStrategy = {
        id: "strat-b",
        reason: () => [
          { id: "r-y", strategyId: "strat-b", type: "type-b", conclusion: "conc-y" },
          { id: "r-x", strategyId: "strat-b", type: "type-b", conclusion: "conc-x" },
        ],
      };

      const strategyA: ReasoningStrategy = {
        id: "strat-a",
        reason: () => [
          { id: "r-z", strategyId: "strat-a", type: "type-a", conclusion: "conc-z" },
        ],
      };

      registry.register(strategyB);
      registry.register(strategyA);

      const result = engine.execute(mockReflectionResult);

      expect(result.reasoning).toHaveLength(3);
      expect(result.reasoning[0].id).toBe("r-z");
      expect(result.reasoning[1].id).toBe("r-y");
      expect(result.reasoning[2].id).toBe("r-x");
    });

    it("should isolate strategy failures and continue executing remaining strategies", () => {
      const strategyGood: ReasoningStrategy = {
        id: "strat-good",
        reason: () => [
          {
            id: "r-good",
            strategyId: "strat-good",
            type: "Inference",
            conclusion: "Valid conclusion",
          },
        ],
      };

      const strategyBad: ReasoningStrategy = {
        id: "strat-bad",
        reason: () => {
          throw new Error("Simulated reasoning strategy crash");
        },
      };

      registry.register(strategyGood);
      registry.register(strategyBad);

      const result = engine.execute(mockReflectionResult);

      // strat-bad executes first (alphabetical) and throws; engine isolates error
      // strat-good executes second and returns output
      expect(result.reasoning).toHaveLength(1);
      expect(result.reasoning[0].id).toBe("r-good");
      expect(result.reasoning[0].conclusion).toBe("Valid conclusion");
    });

    it("should return fully frozen ReasoningCollection and Reasoning objects", () => {
      const strategy: ReasoningStrategy = {
        id: "strat-a",
        reason: () => [
          { id: "r-1", strategyId: "strat-a", type: "Deduction", conclusion: "conc-1" },
        ],
      };

      registry.register(strategy);
      const result = engine.execute(mockReflectionResult);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.reasoning)).toBe(true);
      expect(Object.isFrozen(result.reasoning[0])).toBe(true);

      expect(() => ((result.reasoning[0] as any).conclusion = "modified")).toThrow();
      expect(() => ((result.reasoning as any)[0] = { id: "fake" })).toThrow();
    });

    it("should not mutate supplied ReflectionResult", () => {
      const reflectionResultCopy = JSON.parse(JSON.stringify(mockReflectionResult));

      const strategy: ReasoningStrategy = {
        id: "strat-a",
        reason: (input) => {
          return [
            { id: "r-1", strategyId: "strat-a", type: "Deduction", conclusion: input.items[0].insight },
          ];
        },
      };

      registry.register(strategy);
      engine.execute(mockReflectionResult);

      expect(mockReflectionResult).toEqual(reflectionResultCopy);
    });
  });

  describe("Domain Models & Immutability", () => {
    it("should validate and preserve strategy IDs and conclusions correctly", () => {
      const reasoning: Reasoning = {
        id: "reason-100",
        strategyId: "strat-test",
        type: "Deduction",
        conclusion: "User goal achieved",
      };

      expect(reasoning.id).toBe("reason-100");
      expect(reasoning.strategyId).toBe("strat-test");
      expect(reasoning.type).toBe("Deduction");
      expect(reasoning.conclusion).toBe("User goal achieved");
    });
  });
});
