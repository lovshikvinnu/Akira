import { describe, it, expect, beforeEach } from "vitest";
import {
  ReasoningAssemblyService,
  ReasoningCollection,
  Reasoning,
  ReasoningEngine,
  createDefaultStrategyRegistry,
} from "../src/genesis/reasoning";
import { ReflectionResult } from "../src/genesis/insights/reflection";

describe("GENESIS v2.23 — Milestone 3: Reasoning Assembly & Consumption", () => {
  let assemblyService: ReasoningAssemblyService;

  beforeEach(() => {
    assemblyService = new ReasoningAssemblyService();
  });

  describe("Basic Assembly & Packaging", () => {
    it("should assemble a ReasoningCollection into a ReasoningResult public contract", () => {
      const item1: Reasoning = Object.freeze({
        id: "reason-1",
        strategyId: "strat-a",
        type: "Deduction",
        conclusion: "conc-1",
      });
      const item2: Reasoning = Object.freeze({
        id: "reason-2",
        strategyId: "strat-b",
        type: "Implication",
        conclusion: "conc-2",
      });

      const collection: ReasoningCollection = Object.freeze({
        reasoning: Object.freeze([item1, item2]),
      });

      const result = assemblyService.assemble(collection);

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toBe(item1);
      expect(result.items[1]).toBe(item2);
    });

    it("should throw an error when collection parameter is null or undefined", () => {
      expect(() => assemblyService.assemble(null as any)).toThrow(
        /ReasoningCollection is required/
      );
      expect(() => assemblyService.assemble(undefined as any)).toThrow(
        /ReasoningCollection is required/
      );
    });
  });

  describe("Empty Input Handling", () => {
    it("should package an empty ReasoningCollection into an empty ReasoningResult without throwing exceptions", () => {
      const collection: ReasoningCollection = Object.freeze({
        reasoning: Object.freeze([]),
      });

      const result = assemblyService.assemble(collection);

      expect(result.items).toHaveLength(0);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.items)).toBe(true);
    });
  });

  describe("Exact Ordering Preservation", () => {
    it("should preserve exact ordering produced by ReasoningEngine (no sorting, filtering, or ranking)", () => {
      const a1: Reasoning = Object.freeze({ id: "a1", strategyId: "strat-a", type: "Deduction", conclusion: "c-a1" });
      const a2: Reasoning = Object.freeze({ id: "a2", strategyId: "strat-a", type: "Deduction", conclusion: "c-a2" });
      const b1: Reasoning = Object.freeze({ id: "b1", strategyId: "strat-b", type: "Implication", conclusion: "c-b1" });
      const c1: Reasoning = Object.freeze({ id: "c1", strategyId: "strat-c", type: "Synthesis", conclusion: "c-c1" });

      const collection: ReasoningCollection = Object.freeze({
        reasoning: Object.freeze([a1, a2, b1, c1]),
      });

      const result = assemblyService.assemble(collection);

      expect(result.items).toHaveLength(4);
      expect(result.items[0].id).toBe("a1");
      expect(result.items[1].id).toBe("a2");
      expect(result.items[2].id).toBe("b1");
      expect(result.items[3].id).toBe("c1");
    });
  });

  describe("Object Identity & Preservation", () => {
    it("should reuse existing Reasoning object instances directly (reference equality)", () => {
      const item: Reasoning = Object.freeze({
        id: "original-instance",
        strategyId: "strat-1",
        type: "Deduction",
        conclusion: "direct reference",
      });

      const collection: ReasoningCollection = Object.freeze({
        reasoning: Object.freeze([item]),
      });

      const result = assemblyService.assemble(collection);

      expect(result.items[0]).toBe(item); // Exact reference equality
    });
  });

  describe("Immutability Guarantees", () => {
    it("should return frozen ReasoningResult object and frozen items array without mutating input", () => {
      const item: Reasoning = Object.freeze({
        id: "r-1",
        strategyId: "s-1",
        type: "Deduction",
        conclusion: "conc-1",
      });

      const collection: ReasoningCollection = Object.freeze({
        reasoning: Object.freeze([item]),
      });

      const result = assemblyService.assemble(collection);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.items)).toBe(true);
      expect(() => ((result as any).items = [])).toThrow();
      expect(() => ((result.items as any)[0] = { id: "hacked" })).toThrow();
    });
  });

  describe("Determinism", () => {
    it("should produce identical ReasoningResults given identical ReasoningCollections", () => {
      const item: Reasoning = Object.freeze({
        id: "r-1",
        strategyId: "s-1",
        type: "Deduction",
        conclusion: "conc-1",
      });

      const collection: ReasoningCollection = Object.freeze({
        reasoning: Object.freeze([item]),
      });

      const result1 = assemblyService.assemble(collection);
      const result2 = assemblyService.assemble(collection);

      expect(result1).toEqual(result2);
    });
  });

  describe("End-to-End Pipeline Integration", () => {
    it("should complete the pipeline: ReflectionResult -> ReasoningEngine -> ReasoningCollection -> ReasoningAssemblyService -> ReasoningResult", () => {
      const registry = createDefaultStrategyRegistry();
      const engine = new ReasoningEngine(registry);

      const reflectionResult: ReflectionResult = {
        items: [
          {
            id: "ref-p1",
            strategyId: "pattern-strategy",
            type: "Pattern",
            insight: "pattern:type-recurrence:goal",
          },
          {
            id: "ref-c1",
            strategyId: "contradiction-strategy",
            type: "Contradiction",
            insight: "contradiction:conflict:prov-1:prov-2",
          },
        ],
      };

      const collection = engine.execute(reflectionResult);
      const result = assemblyService.assemble(collection);

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(2);
      expect(result.items[0].type).toBe("Deduction");
      expect(result.items[0].conclusion).toBe("deduction:pattern:type-recurrence:goal");
      expect(result.items[1].type).toBe("Implication");
      expect(result.items[1].conclusion).toBe("implication:divergence:prov-1:prov-2");
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.items)).toBe(true);
    });
  });
});
