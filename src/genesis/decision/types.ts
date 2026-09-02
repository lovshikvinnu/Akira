import { ReasoningResult } from "../reasoning";

/**
 * Strongly typed taxonomy classification for decision artifacts.
 */
export type DecisionType = "Recommendation" | "Choice" | "Deferral";

/**
 * Represents a single immutable decision artifact.
 * Keeps the domain model intentionally minimal.
 */
export interface Decision {
  readonly id: string;
  readonly strategyId: string;
  readonly type: DecisionType;
  readonly decision: string;
}

/**
 * Represents the immutable collection of generated decision artifacts.
 */
export interface DecisionCollection {
  readonly decisions: readonly Decision[];
}

/**
 * Pluggable strategy abstraction interface for the Decision subsystem.
 */
export interface DecisionStrategy {
  readonly id: string;
  decide(reasoningResult: ReasoningResult): readonly Decision[];
}
