import { describe, it, expect } from "vitest";
import {
  ReflectionAssemblyService,
  ReflectionCollection,
  Reflection,
} from "../src/genesis/insights/reflection/engine";

describe("GENESIS v2.22 — Reflection Assembly & Consumption Subsystem", () => {
  const service = new ReflectionAssemblyService();

  it("should package a ReflectionCollection into a minimal ReflectionResult", () => {
    const reflections: Reflection[] = [
      Object.freeze({ id: "r1", strategyId: "s1", type: "Observation", insight: "info-1" }),
      Object.freeze({ id: "r2", strategyId: "s2", type: "Pattern", insight: "info-2" }),
    ];
    const collection: ReflectionCollection = Object.freeze({
      reflections: Object.freeze(reflections),
    });

    const result = service.assemble(collection);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBe(reflections[0]); // Direct instance reuse, no recreation
    expect(result.items[1]).toBe(reflections[1]); // Direct instance reuse, no recreation
    expect(Object.keys(result)).toEqual(["items"]); // Intentionally minimal
  });

  it("should preserve the ordering of the ReflectionCollection exactly", () => {
    const reflections: Reflection[] = [
      Object.freeze({ id: "r-mid", strategyId: "s1", type: "Observation", insight: "mid" }),
      Object.freeze({ id: "r-high", strategyId: "s2", type: "Pattern", insight: "high" }),
      Object.freeze({ id: "r-low", strategyId: "s3", type: "Contradiction", insight: "low" }),
    ];
    const collection: ReflectionCollection = Object.freeze({
      reflections: Object.freeze(reflections),
    });

    const result = service.assemble(collection);

    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("r-mid");
    expect(result.items[1].id).toBe("r-high");
    expect(result.items[2].id).toBe("r-low");
  });

  it("should handle empty reflection collections smoothly", () => {
    const collection: ReflectionCollection = Object.freeze({
      reflections: Object.freeze([]),
    });

    const result = service.assemble(collection);
    expect(result.items).toHaveLength(0);
  });

  it("should produce a frozen ReflectionResult containing a frozen items array", () => {
    const collection: ReflectionCollection = Object.freeze({
      reflections: Object.freeze([
        Object.freeze({ id: "r1", strategyId: "s1", type: "Observation", insight: "i1" }),
      ]),
    });

    const result = service.assemble(collection);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it("should behave deterministically when packaging identical collections", () => {
    const collection: ReflectionCollection = Object.freeze({
      reflections: Object.freeze([
        Object.freeze({ id: "r1", strategyId: "s1", type: "Observation", insight: "i1" }),
      ]),
    });

    const result1 = service.assemble(collection);
    const result2 = service.assemble(collection);

    expect(result1.items).toHaveLength(1);
    expect(result2.items).toHaveLength(1);
    expect(result1.items[0]).toBe(result2.items[0]);
  });
});
