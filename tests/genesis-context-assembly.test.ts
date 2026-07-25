import { describe, it, expect } from "vitest";
import {
  ThresholdSelectionPolicy,
  ContextAssemblyService,
  SelectionPolicy,
} from "../src/genesis/context/assembly";
import { ScoredContextCollection } from "../src/genesis/context/relevance";

describe("GENESIS v2.21 — Context Selection & Assembly Subsystem", () => {
  describe("ThresholdSelectionPolicy", () => {
    it("should accept valid thresholds in range [0.0, 1.0]", () => {
      expect(() => new ThresholdSelectionPolicy(0.0)).not.toThrow();
      expect(() => new ThresholdSelectionPolicy(0.5)).not.toThrow();
      expect(() => new ThresholdSelectionPolicy(1.0)).not.toThrow();
    });

    it("should reject invalid thresholds outside [0.0, 1.0]", () => {
      expect(() => new ThresholdSelectionPolicy(-0.1)).toThrow(
        /Threshold must be a valid normalized number/,
      );
      expect(() => new ThresholdSelectionPolicy(1.1)).toThrow(
        /Threshold must be a valid normalized number/,
      );
      expect(() => new ThresholdSelectionPolicy(NaN)).toThrow(
        /Threshold must be a valid normalized number/,
      );
      expect(() => new ThresholdSelectionPolicy("0.5" as any)).toThrow(
        /Threshold must be a valid normalized number/,
      );
    });

    it("should select items with score greater than or equal to threshold", () => {
      const policy = new ThresholdSelectionPolicy(0.5);
      const collection: ScoredContextCollection = {
        scoredContexts: [
          { context: { id: "c1", providerId: "p1", type: "note", content: "c1" }, score: 0.9 },
          { context: { id: "c2", providerId: "p1", type: "note", content: "c2" }, score: 0.5 },
          { context: { id: "c3", providerId: "p1", type: "note", content: "c3" }, score: 0.4 },
        ],
      };

      const selected = policy.select(collection.scoredContexts);
      expect(selected).toHaveLength(2);
      expect(selected[0].context.id).toBe("c1");
      expect(selected[1].context.id).toBe("c2");
    });
  });

  describe("ContextAssemblyService", () => {
    it("should filter scored contexts using the configured policy and produce a minimal ContextAssemblyResult", () => {
      const policy = new ThresholdSelectionPolicy(0.6);
      const service = new ContextAssemblyService(policy);

      const collection: ScoredContextCollection = {
        scoredContexts: [
          { context: { id: "c1", providerId: "p1", type: "note", content: "c1" }, score: 0.8 },
          { context: { id: "c2", providerId: "p2", type: "note", content: "c2" }, score: 0.7 },
          { context: { id: "c3", providerId: "p1", type: "note", content: "c3" }, score: 0.3 },
        ],
      };

      const result = service.assemble(collection);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].context.id).toBe("c1");
      expect(result.items[0].score).toBe(0.8);
      expect(result.items[1].context.id).toBe("c2");
      expect(result.items[1].score).toBe(0.7);

      // Verify that no other fields are present on result to ensure minimality
      expect(Object.keys(result)).toEqual(["items"]);
    });

    it("should preserve the sorting order produced by the RelevanceEngine", () => {
      // Input is pre-sorted by RelevanceEngine: score descending, then providerId, then id
      const collection: ScoredContextCollection = {
        scoredContexts: [
          {
            context: { id: "c-high", providerId: "p-a", type: "note", content: "high" },
            score: 0.9,
          },
          {
            context: { id: "c-mid-1", providerId: "p-a", type: "note", content: "mid 1" },
            score: 0.5,
          },
          {
            context: { id: "c-mid-2", providerId: "p-b", type: "note", content: "mid 2" },
            score: 0.5,
          },
          { context: { id: "c-low", providerId: "p-a", type: "note", content: "low" }, score: 0.1 },
        ],
      };

      const policy: SelectionPolicy = {
        select: (items) => items, // Pass-through select policy
      };
      const service = new ContextAssemblyService(policy);
      const result = service.assemble(collection);

      expect(result.items).toHaveLength(4);
      expect(result.items[0].context.id).toBe("c-high");
      expect(result.items[1].context.id).toBe("c-mid-1");
      expect(result.items[2].context.id).toBe("c-mid-2");
      expect(result.items[3].context.id).toBe("c-low");
    });

    it("should generate empty package if no items meet the selection criteria", () => {
      const policy = new ThresholdSelectionPolicy(0.9);
      const service = new ContextAssemblyService(policy);

      const collection: ScoredContextCollection = {
        scoredContexts: [
          { context: { id: "c1", providerId: "p1", type: "note", content: "c1" }, score: 0.8 },
          { context: { id: "c2", providerId: "p1", type: "note", content: "c2" }, score: 0.5 },
        ],
      };

      const result = service.assemble(collection);
      expect(result.items).toHaveLength(0);
    });

    it("should produce a frozen ContextAssemblyResult and frozen SelectedContext items", () => {
      const policy = new ThresholdSelectionPolicy(0.0);
      const service = new ContextAssemblyService(policy);

      const collection: ScoredContextCollection = {
        scoredContexts: [
          { context: { id: "c1", providerId: "p1", type: "note", content: "c1" }, score: 0.5 },
        ],
      };

      const result = service.assemble(collection);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.items)).toBe(true);
      expect(Object.isFrozen(result.items[0])).toBe(true);
    });

    it("should behave deterministically given identical inputs", () => {
      const policy = new ThresholdSelectionPolicy(0.5);
      const service1 = new ContextAssemblyService(policy);
      const service2 = new ContextAssemblyService(policy);

      const collection: ScoredContextCollection = {
        scoredContexts: [
          { context: { id: "c1", providerId: "p1", type: "note", content: "c1" }, score: 0.8 },
          { context: { id: "c2", providerId: "p2", type: "note", content: "c2" }, score: 0.5 },
          { context: { id: "c3", providerId: "p1", type: "note", content: "c3" }, score: 0.2 },
        ],
      };

      const result1 = service1.assemble(collection);
      const result2 = service2.assemble(collection);

      expect(result1.items).toHaveLength(2);
      expect(result2.items).toHaveLength(2);
      expect(result1.items[0].context.id).toBe(result2.items[0].context.id);
      expect(result1.items[1].context.id).toBe(result2.items[1].context.id);
    });
  });
});
