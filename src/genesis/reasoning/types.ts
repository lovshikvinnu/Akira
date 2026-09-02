import { ReflectionResult } from "../insights/reflection";

/**
 * Strongly typed taxonomy classification for reasoning artifacts.
 */
export type ReasoningType = "Deduction" | "Implication" | "Synthesis";

/**
 * Represents a single immutable reasoning artifact.
 * Keeps the domain model intentionally minimal.
 */
export interface Reasoning {
  readonly id: string;
  readonly strategyId: string;
  readonly type: ReasoningType;
  readonly conclusion: string;
}

/**
 * Represents the immutable collection of generated reasoning artifacts.
 */
export interface ReasoningCollection {
  readonly reasoning: readonly Reasoning[];
}

/**
 * Official public output contract of the Reasoning subsystem for downstream cognitive capabilities.
 */
export interface ReasoningResult {
  readonly items: readonly Reasoning[];
}

/**
 * Pluggable strategy abstraction interface for the Reasoning subsystem.
 */
export interface ReasoningStrategy {
  readonly id: string;
  reason(reflectionResult: ReflectionResult): readonly Reasoning[];
}
