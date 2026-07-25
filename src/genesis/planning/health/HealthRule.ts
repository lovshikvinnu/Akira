// src/genesis/planning/health/HealthRule.ts
import { PlanningGraph } from "../types";
import { HealthEvaluation } from "./HealthEvaluation";

/**
 * Interface for a health evaluation rule.
 * Implementations must be pure (no side‑effects) and return a
 * HealthEvaluation when the rule matches, otherwise undefined.
 */
export interface HealthRule {
  /** Stable identifier of the rule – useful for telemetry / analytics. */
  readonly id: string;

  /** Priority – lower numbers are evaluated first. */
  readonly priority: number;

  /** Evaluate the supplied immutable planning graph. */
  evaluate(graph: PlanningGraph): HealthEvaluation | undefined;
}
