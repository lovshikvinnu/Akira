export * from "./types";
export { ReflectionStrategyRegistry } from "./registry";
export { ReflectionEngine } from "./engine";
export { ReflectionAssemblyService } from "./assembly";

// Strategies
export { ObservationReflectionStrategy } from "./strategies/ObservationReflectionStrategy";
export { PatternReflectionStrategy } from "./strategies/PatternReflectionStrategy";
export { ContradictionReflectionStrategy } from "./strategies/ContradictionReflectionStrategy";

import { ReflectionStrategyRegistry } from "./registry";
import { ObservationReflectionStrategy } from "./strategies/ObservationReflectionStrategy";
import { PatternReflectionStrategy } from "./strategies/PatternReflectionStrategy";
import { ContradictionReflectionStrategy } from "./strategies/ContradictionReflectionStrategy";

/**
 * Recommended helper to bootstrap the strategy registry with the built-in strategies.
 */
export function createDefaultStrategyRegistry(): ReflectionStrategyRegistry {
  const registry = new ReflectionStrategyRegistry();
  registry.register(new ObservationReflectionStrategy());
  registry.register(new PatternReflectionStrategy());
  registry.register(new ContradictionReflectionStrategy());
  return registry;
}
