export * from "./types";
export { ReasoningStrategyRegistry } from "./registry";
export { ReasoningEngine } from "./engine";
export { ReasoningAssemblyService } from "./assembly";

// Built-in Reasoning Strategies
export { DeductiveReasoningStrategy } from "./strategies/DeductiveReasoningStrategy";
export { ImplicationReasoningStrategy } from "./strategies/ImplicationReasoningStrategy";
export { SynthesisReasoningStrategy } from "./strategies/SynthesisReasoningStrategy";

import { ReasoningStrategyRegistry } from "./registry";
import { DeductiveReasoningStrategy } from "./strategies/DeductiveReasoningStrategy";
import { ImplicationReasoningStrategy } from "./strategies/ImplicationReasoningStrategy";
import { SynthesisReasoningStrategy } from "./strategies/SynthesisReasoningStrategy";

/**
 * Bootstrap helper to instantiate a ReasoningStrategyRegistry populated
 * with the default built-in reasoning strategies.
 */
export function createDefaultStrategyRegistry(): ReasoningStrategyRegistry {
  const registry = new ReasoningStrategyRegistry();
  registry.register(new DeductiveReasoningStrategy());
  registry.register(new ImplicationReasoningStrategy());
  registry.register(new SynthesisReasoningStrategy());
  return registry;
}
