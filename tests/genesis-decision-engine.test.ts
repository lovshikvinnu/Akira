import { describe, it, expect, beforeEach } from "vitest";
import {
  DecisionStrategyRegistry,
  DecisionEngine,
  DecisionStrategy,
  Decision,
  DecisionType,
} from "../src/genesis/decision";
import { ReasoningResult } from "../src/genesis/reasoning";

describe("GENESIS v2.24 — Decision Engine Foundation", () => {
  let registry: DecisionStrategyRegistry;
  let engine: DecisionEngine;

  beforeEach(() => {
    registry = new DecisionStrategyRegistry();
    engine = new DecisionEngine(registry);
  });

  describe("DecisionStrategyRegistry", () => {
    it("should allow registering a valid strategy", () => {
      const strategy: DecisionStrategy = {
        id: "strat-1",
        decide: () => [],
      };

      registry.register(strategy);
      const strategies = registry.getStrategies();

      expect(strategies).toHaveLength(1);
      expect(strategies[0].id).toBe("strat-1");
    });

    it("should reject duplicate strategy IDs with a clear error", () => {
      const strategy1: DecisionStrategy = { id: "strat-dup", decide: () => [] };
      const strategy2: DecisionStrategy = { id: "strat-dup", decide: () => [] };

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
      const strategyC: DecisionStrategy = { id: "strat-c", decide: () => [] };
      const strategyA: DecisionStrategy = { id: "strat-a", decide: () => [] };
      const strategyB: DecisionStrategy = { id: "strat-b", decide: () => [] };

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
      const strategy: DecisionStrategy = { id: "strat-1", decide: () => [] };
      registry.register(strategy);

      const strategies = registry.getStrategies();
      expect(Object.isFrozen(strategies)).toBe(true);
      expect(() => (strategies as any).push({ id: "malicious" })).toThrow();
    });
  });

  describe("DecisionEngine", () => {
    const mockReasoningResult: ReasoningResult = {
      items: [
        {
          id: "reason-1",
          strategyId: "reason-strat-1",
          type: "Deduction",
          conclusion: "User progress stable",
        },
      ],
    };

    it("should throw an error if ReasoningResult is missing", () => {
      expect(() => engine.execute(null as any)).toThrow(/ReasoningResult is required/);
    });

    it("should handle empty-registry behavior by returning an empty frozen collection", () => {
      const result = engine.execute(mockReasoningResult);
      expect(result.decisions).toHaveLength(0);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.decisions)).toBe(true);
    });

    it("should aggregate decision artifacts from multiple strategies in deterministic strategy execution order", () => {
      const strategyA: DecisionStrategy = {
        id: "strat-a",
        decide: (reasoningResult) => [
          {
            id: "dec-1",
            strategyId: "strat-a",
            type: "Recommendation",
            decision: `Recommend action based on ${reasoningResult.items.length} reasoning artifacts`,
          },
        ],
      };

      const strategyB: DecisionStrategy = {
        id: "strat-b",
        decide: () => [
          {
            id: "dec-2",
            strategyId: "strat-b",
            type: "Choice",
            decision: "Select primary option",
          },
        ],
      };

      // Register strategy B first, then strategy A
      registry.register(strategyB);
      registry.register(strategyA);

      const result = engine.execute(mockReasoningResult);

      // Deterministic order: strat-a executes first, then strat-b
      expect(result.decisions).toHaveLength(2);
      expect(result.decisions[0].id).toBe("dec-1");
      expect(result.decisions[0].strategyId).toBe("strat-a");
      expect(result.decisions[0].type).toBe("Recommendation");
      expect(result.decisions[0].decision).toBe("Recommend action based on 1 reasoning artifacts");

      expect(result.decisions[1].id).toBe("dec-2");
      expect(result.decisions[1].strategyId).toBe("strat-b");
      expect(result.decisions[1].type).toBe("Choice");
      expect(result.decisions[1].decision).toBe("Select primary option");
    });

    it("should preserve output order within each strategy sequentially without secondary sorting", () => {
      const strategyB: DecisionStrategy = {
        id: "strat-b",
        decide: () => [
          { id: "d-y", strategyId: "strat-b", type: "Choice", decision: "dec-y" },
          { id: "d-x", strategyId: "strat-b", type: "Choice", decision: "dec-x" },
        ],
      };

      const strategyA: DecisionStrategy = {
        id: "strat-a",
        decide: () => [
          { id: "d-z", strategyId: "strat-a", type: "Recommendation", decision: "dec-z" },
        ],
      };

      registry.register(strategyB);
      registry.register(strategyA);

      const result = engine.execute(mockReasoningResult);

      expect(result.decisions).toHaveLength(3);
      expect(result.decisions[0].id).toBe("d-z");
      expect(result.decisions[1].id).toBe("d-y");
      expect(result.decisions[2].id).toBe("d-x");
    });

    it("should isolate strategy failures and continue executing remaining strategies", () => {
      const strategyGood: DecisionStrategy = {
        id: "strat-good",
        decide: () => [
          {
            id: "d-good",
            strategyId: "strat-good",
            type: "Choice",
            decision: "Valid decision",
          },
        ],
      };

      const strategyBad: DecisionStrategy = {
        id: "strat-bad",
        decide: () => {
          throw new Error("Simulated decision strategy crash");
        },
      };

      registry.register(strategyGood);
      registry.register(strategyBad);

      const result = engine.execute(mockReasoningResult);

      // strat-bad executes first (alphabetical) and throws; engine isolates error
      // strat-good executes second and returns output
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].id).toBe("d-good");
      expect(result.decisions[0].decision).toBe("Valid decision");
    });

    it("should return fully frozen DecisionCollection and Decision objects", () => {
      const strategy: DecisionStrategy = {
        id: "strat-a",
        decide: () => [
          { id: "d-1", strategyId: "strat-a", type: "Choice", decision: "choice-1" },
        ],
      };

      registry.register(strategy);
      const result = engine.execute(mockReasoningResult);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.decisions)).toBe(true);
      expect(Object.isFrozen(result.decisions[0])).toBe(true);

      expect(() => ((result.decisions[0] as any).decision = "modified")).toThrow();
      expect(() => ((result.decisions as any)[0] = { id: "fake" })).toThrow();
    });

    it("should not mutate supplied ReasoningResult", () => {
      const reasoningResultCopy = JSON.parse(JSON.stringify(mockReasoningResult));

      const strategy: DecisionStrategy = {
        id: "strat-a",
        decide: (input) => {
          return [
            { id: "d-1", strategyId: "strat-a", type: "Choice", decision: input.items[0].conclusion },
          ];
        },
      };

      registry.register(strategy);
      engine.execute(mockReasoningResult);

      expect(mockReasoningResult).toEqual(reasoningResultCopy);
    });
  });

  describe("Domain Models & Taxonomy", () => {
    it("should validate and preserve DecisionType taxonomy values correctly", () => {
      const types: DecisionType[] = ["Recommendation", "Choice", "Deferral"];

      for (const type of types) {
        const decisionItem: Decision = {
          id: `dec-${type}`,
          strategyId: "strat-test",
          type,
          decision: `Decision for ${type}`,
        };

        expect(decisionItem.id).toBe(`dec-${type}`);
        expect(decisionItem.strategyId).toBe("strat-test");
        expect(decisionItem.type).toBe(type);
        expect(decisionItem.decision).toBe(`Decision for ${type}`);
      }
    });
  });
});
