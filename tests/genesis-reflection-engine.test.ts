import { describe, it, expect, beforeEach } from "vitest";
import {
  ReflectionStrategyRegistry,
  ReflectionEngine,
  ReflectionStrategy,
  Reflection,
} from "../src/genesis/insights/reflection/engine";
import { ContextAssemblyResult } from "../src/genesis/context/assembly";

describe("GENESIS v2.22 — Reflection Engine Foundation", () => {
  let registry: ReflectionStrategyRegistry;
  let engine: ReflectionEngine;

  beforeEach(() => {
    registry = new ReflectionStrategyRegistry();
    engine = new ReflectionEngine(registry);
  });

  describe("ReflectionStrategyRegistry", () => {
    it("should allow registering a valid strategy", () => {
      const strategy: ReflectionStrategy = {
        id: "strat-1",
        reflect: () => [],
      };

      registry.register(strategy);
      const strategies = registry.getStrategies();

      expect(strategies).toHaveLength(1);
      expect(strategies[0].id).toBe("strat-1");
    });

    it("should reject duplicate strategy IDs with a clear error", () => {
      const strategy1: ReflectionStrategy = { id: "strat-dup", reflect: () => [] };
      const strategy2: ReflectionStrategy = { id: "strat-dup", reflect: () => [] };

      registry.register(strategy1);
      expect(() => registry.register(strategy2)).toThrow(/Duplicate strategy ID registered/);
    });

    it("should reject invalid strategies", () => {
      expect(() => registry.register(null as any)).toThrow();
      expect(() => registry.register({ id: "" } as any)).toThrow();
    });

    it("should return registered strategies in deterministic alphabetical order by ID", () => {
      const strategyC: ReflectionStrategy = { id: "strat-c", reflect: () => [] };
      const strategyA: ReflectionStrategy = { id: "strat-a", reflect: () => [] };
      const strategyB: ReflectionStrategy = { id: "strat-b", reflect: () => [] };

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
      const strategy: ReflectionStrategy = { id: "strat-1", reflect: () => [] };
      registry.register(strategy);

      const strategies = registry.getStrategies();
      expect(Object.isFrozen(strategies)).toBe(true);
      expect(() => (strategies as any).push({ id: "malicious" })).toThrow();
    });
  });

  describe("ReflectionEngine", () => {
    const mockContext: ContextAssemblyResult = {
      items: [],
    };

    it("should aggregate reflections from multiple strategies", () => {
      const strategyA: ReflectionStrategy = {
        id: "strat-a",
        reflect: () => [
          {
            id: "ref-1",
            strategyId: "strat-a",
            type: "goal-insight",
            insight: "Goal progress stable",
          },
        ],
      };

      const strategyB: ReflectionStrategy = {
        id: "strat-b",
        reflect: () => [
          {
            id: "ref-2",
            strategyId: "strat-b",
            type: "habit-insight",
            insight: "Coding daily habit strong",
          },
        ],
      };

      registry.register(strategyA);
      registry.register(strategyB);

      const result = engine.execute(mockContext);

      expect(result.reflections).toHaveLength(2);
      expect(result.reflections[0].id).toBe("ref-1");
      expect(result.reflections[1].id).toBe("ref-2");
    });

    it("should handle empty-registry behavior by returning an empty collection", () => {
      const result = engine.execute(mockContext);
      expect(result.reflections).toHaveLength(0);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.reflections)).toBe(true);
    });

    it("should isolate strategy failures and continue executing remaining strategies", () => {
      const strategyGood: ReflectionStrategy = {
        id: "strat-good",
        reflect: () => [
          {
            id: "ref-good",
            strategyId: "strat-good",
            type: "state-insight",
            insight: "Normal state",
          },
        ],
      };

      const strategyBad: ReflectionStrategy = {
        id: "strat-bad",
        reflect: () => {
          throw new Error("Simulated reflection crash");
        },
      };

      // Register both strategies (alphabetically bad executes first, then good)
      registry.register(strategyGood);
      registry.register(strategyBad);

      const result = engine.execute(mockContext);

      expect(result.reflections).toHaveLength(1);
      expect(result.reflections[0].id).toBe("ref-good");
    });

    it("should return a fully frozen ReflectionCollection and frozen Reflection items", () => {
      const strategy: ReflectionStrategy = {
        id: "strat-a",
        reflect: () => [
          { id: "ref-1", strategyId: "strat-a", type: "type-a", insight: "insight-a" },
        ],
      };

      registry.register(strategy);
      const result = engine.execute(mockContext);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.reflections)).toBe(true);
      expect(Object.isFrozen(result.reflections[0])).toBe(true);
    });

    it("should concatenate reflections exactly in strategy execution registry order without sorting the reflections themselves", () => {
      // strategy-b produces: ref-y, then ref-x
      const strategyB: ReflectionStrategy = {
        id: "strat-b",
        reflect: () => [
          { id: "ref-y", strategyId: "strat-b", type: "type-b", insight: "insight-y" },
          { id: "ref-x", strategyId: "strat-b", type: "type-b", insight: "insight-x" },
        ],
      };

      // strategy-a produces: ref-z
      const strategyA: ReflectionStrategy = {
        id: "strat-a",
        reflect: () => [
          { id: "ref-z", strategyId: "strat-a", type: "type-a", insight: "insight-z" },
        ],
      };

      // Register in reverse alphabetical order
      registry.register(strategyB);
      registry.register(strategyA);

      const result = engine.execute(mockContext);

      // Strategy registry execution order: strat-a, then strat-b
      // Resulting concatenation must be:
      // 1. ref-z (from strat-a)
      // 2. ref-y (from strat-b, in original order)
      // 3. ref-x (from strat-b, in original order)
      expect(result.reflections).toHaveLength(3);
      expect(result.reflections[0].id).toBe("ref-z");
      expect(result.reflections[1].id).toBe("ref-y");
      expect(result.reflections[2].id).toBe("ref-x");
    });
  });
});
