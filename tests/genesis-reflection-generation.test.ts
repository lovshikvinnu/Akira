import { describe, it, expect, beforeEach } from "vitest";
import {
  createDefaultStrategyRegistry,
  ReflectionEngine,
  ObservationReflectionStrategy,
  PatternReflectionStrategy,
  ContradictionReflectionStrategy,
} from "../src/genesis/insights/reflection/engine";
import { ContextAssemblyResult } from "../src/genesis/context/assembly";

describe("GENESIS v2.22 — Reflection Generation Subsystem", () => {
  let engine: ReflectionEngine;

  beforeEach(() => {
    // Relevance engine has registry, composition wired via registry
    engine = new ReflectionEngine(createDefaultStrategyRegistry());
  });

  describe("ObservationReflectionStrategy", () => {
    it("should produce factual observations from individual context items", () => {
      const strategy = new ObservationReflectionStrategy();
      const context: ContextAssemblyResult = {
        items: [
          {
            context: { id: "ctx-1", providerId: "prov-a", type: "goal", content: "Learn React" },
            score: 0.9,
          },
          {
            context: { id: "ctx-2", providerId: "prov-b", type: "habit", content: "Wake up early" },
            score: 0.8,
          },
        ],
      };

      const reflections = strategy.reflect(context);

      expect(reflections).toHaveLength(2);
      expect(reflections[0].type).toBe("Observation");
      expect(reflections[0].insight).toBe("Learn React");
      expect(reflections[0].id).toBe("observation-prov-a-ctx-1");

      expect(reflections[1].type).toBe("Observation");
      expect(reflections[1].insight).toBe("Wake up early");
      expect(reflections[1].id).toBe("observation-prov-b-ctx-2");
    });
  });

  describe("PatternReflectionStrategy", () => {
    it("should detect recurring context types across the collection", () => {
      const strategy = new PatternReflectionStrategy();
      const context: ContextAssemblyResult = {
        items: [
          {
            context: { id: "ctx-1", providerId: "prov-a", type: "goal", content: "Learn React" },
            score: 0.9,
          },
          {
            context: { id: "ctx-2", providerId: "prov-b", type: "goal", content: "Learn Vite" },
            score: 0.8,
          },
          {
            context: { id: "ctx-3", providerId: "prov-c", type: "habit", content: "Running daily" },
            score: 0.7,
          },
        ],
      };

      const reflections = strategy.reflect(context);

      expect(reflections).toHaveLength(1);
      expect(reflections[0].type).toBe("Pattern");
      expect(reflections[0].insight).toBe("pattern:type-recurrence:goal");
      expect(reflections[0].id).toBe("pattern-goal");
    });

    it("should return empty array if no recurring types exist", () => {
      const strategy = new PatternReflectionStrategy();
      const context: ContextAssemblyResult = {
        items: [
          {
            context: { id: "ctx-1", providerId: "prov-a", type: "goal", content: "Learn React" },
            score: 0.9,
          },
          {
            context: { id: "ctx-2", providerId: "prov-b", type: "habit", content: "Learn Vite" },
            score: 0.8,
          },
        ],
      };

      const reflections = strategy.reflect(context);
      expect(reflections).toHaveLength(0);
    });
  });

  describe("ContradictionReflectionStrategy", () => {
    it("should detect directly conflicting content for items sharing the same normalized ID", () => {
      const strategy = new ContradictionReflectionStrategy();
      const context: ContextAssemblyResult = {
        items: [
          // Identical context ID, but different contents representing contradictory info
          {
            context: {
              id: "shared-entity-id",
              providerId: "prov-a",
              type: "goal",
              content: "Status is Active",
            },
            score: 0.9,
          },
          {
            context: {
              id: "shared-entity-id",
              providerId: "prov-b",
              type: "goal",
              content: "Status is Completed",
            },
            score: 0.8,
          },
        ],
      };

      const reflections = strategy.reflect(context);

      expect(reflections).toHaveLength(1);
      expect(reflections[0].type).toBe("Contradiction");
      expect(reflections[0].insight).toBe("contradiction:conflict:prov-a:prov-b");
      expect(reflections[0].id).toBe("contradiction-shared-entity-id");
    });

    it("should return empty array if matching IDs have identical content", () => {
      const strategy = new ContradictionReflectionStrategy();
      const context: ContextAssemblyResult = {
        items: [
          {
            context: { id: "shared-id", providerId: "prov-a", type: "goal", content: "Same" },
            score: 0.9,
          },
          {
            context: { id: "shared-id", providerId: "prov-b", type: "goal", content: "Same" },
            score: 0.8,
          },
        ],
      };

      const reflections = strategy.reflect(context);
      expect(reflections).toHaveLength(0);
    });
  });

  describe("End-to-End Orchestration & Failure Isolation", () => {
    it("should execute all default strategies, concatenating their outputs in registry order", () => {
      const context: ContextAssemblyResult = {
        items: [
          {
            context: { id: "ctx-1", providerId: "prov-a", type: "goal", content: "Learn React" },
            score: 0.9,
          },
          {
            context: { id: "ctx-2", providerId: "prov-b", type: "goal", content: "Learn Vite" },
            score: 0.8,
          },
          {
            context: {
              id: "ctx-1",
              providerId: "prov-c",
              type: "goal",
              content: "Learn React (dup)",
            },
            score: 0.7,
          },
        ],
      };

      const result = engine.execute(context);

      // Expected outputs:
      // Alphabetical strategy registry order:
      // 1. contradiction-strategy (finds conflict on id "ctx-1" between prov-a and prov-c)
      // 2. observation-strategy (3 observations)
      // 3. pattern-strategy (1 pattern for goal)
      expect(result.reflections.length).toBeGreaterThan(0);

      // Let's verify the first few reflections follow alphabetical strategyId sorting order:
      // contradiction-strategy comes first alphabetically, then observation-strategy, then pattern-strategy
      expect(result.reflections[0].strategyId).toBe("contradiction-strategy");

      const observationReflections = result.reflections.filter(
        (r) => r.strategyId === "observation-strategy",
      );
      expect(observationReflections).toHaveLength(3);

      const patternReflections = result.reflections.filter(
        (r) => r.strategyId === "pattern-strategy",
      );
      expect(patternReflections).toHaveLength(1);
    });

    it("should isolate strategy crashes and omit failing strategy results without placeholders", () => {
      const customRegistry = createDefaultStrategyRegistry();
      // Register a strategy that crashes
      customRegistry.register({
        id: "strat-crash",
        reflect: () => {
          throw new Error("Crash");
        },
      });

      const crashEngine = new ReflectionEngine(customRegistry);
      const context: ContextAssemblyResult = {
        items: [
          {
            context: { id: "ctx-1", providerId: "prov-a", type: "goal", content: "Learn React" },
            score: 0.9,
          },
        ],
      };

      const result = crashEngine.execute(context);

      // Observation reflection should still succeed and crash strategy output is safely ignored
      const obs = result.reflections.filter((r) => r.strategyId === "observation-strategy");
      expect(obs).toHaveLength(1);
      expect(result.reflections.some((r) => r.strategyId === "strat-crash")).toBe(false);
    });

    it("should handle empty context results smoothly", () => {
      const result = engine.execute({ items: [] });
      expect(result.reflections).toHaveLength(0);
    });

    it("should produce frozen reflections and collection", () => {
      const context: ContextAssemblyResult = {
        items: [
          {
            context: { id: "ctx-1", providerId: "prov-a", type: "goal", content: "Learn React" },
            score: 0.9,
          },
        ],
      };

      const result = engine.execute(context);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.reflections)).toBe(true);
      expect(Object.isFrozen(result.reflections[0])).toBe(true);
    });
  });
});
