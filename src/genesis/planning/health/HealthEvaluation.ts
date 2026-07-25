// src/genesis/planning/health/HealthEvaluation.ts
import { PlanHealthStatus } from "../types";

/**
 * Result of evaluating a planning graph against a health rule.
 */
export interface HealthEvaluation {
  /** The health status determined by the rule (e.g., 'Inactive', 'Completed', etc.). */
  status: PlanHealthStatus;

  /** Optional human‑readable explanation for why this status was chosen. */
  reason?: string;

  /** The identifier of the rule that produced this evaluation. */
  ruleId: string;
}
