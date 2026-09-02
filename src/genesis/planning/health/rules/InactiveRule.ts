// src/genesis/planning/health/rules/InactiveRule.ts
import { HealthRule } from "../HealthRule";
import { HealthEvaluation } from "../HealthEvaluation";
import { PlanningGraph } from "../../types";
import { PlanHealthStatus } from "../../types";

/**
 * InactiveRule – highest priority.
 * Fires when the plan is not in the "Active" lifecycle state.
 * This captures Draft, Paused, Archived, etc., and intentionally
 * overrides any derived completion logic.
 */
export class InactiveRule implements HealthRule {
  readonly id = "inactive";
  readonly priority = 1; // highest priority

  evaluate(graph: PlanningGraph): HealthEvaluation | undefined {
    // Any non‑Active status is considered inactive for health purposes.
    if (graph.plan.status !== "Active") {
      return {
        status: PlanHealthStatus.Inactive,
        reason: `Plan status is "${graph.plan.status}" → Inactive`,
        ruleId: this.id,
      };
    }
    return undefined;
  }
}
